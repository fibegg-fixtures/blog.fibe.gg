---
slug: secrets-vault-job-env
title: "Where do secrets go? Launch variables vs Secret Vault vs Job ENV"
description: A decision guide for credentials and generated values on Fibe, so nothing sensitive ever ends up in a Template body or in your git history.
date: 2026-04-28
tags: [guide, security, secrets, templates]
format: md
---

A Fibe Template is a Docker Compose file plus a handful of `fibe.gg/*` labels. It is meant to be shared — pushed to a Prop, published to the Bazaar, copied by a teammate. Which means the single worst place you can put a database password is the one place it feels most natural to type it: straight into the YAML, next to the service that needs it.

The good news is that you almost never have to. Fibe gives you three distinct homes for sensitive values, and each one exists precisely so that the secret stays out of the Template text. The trick is knowing which home a given value belongs in. This guide walks through all three, the decision that picks between them, and the `random` / `secret` / `sensitive` mechanics that let you author a credential-using Template without ever holding a real credential in your hand.

<!-- truncate -->

## The three homes

Every "value the launcher or Template needs" lands in one of these:

1. **A launch variable** — declared in `x-fibe.gg.variables`, supplied (or generated) at launch, scoped to that one Playground. Mark it `secret` and/or `sensitive` to control how the launcher UI treats it.
2. **The Secret Vault** — an encrypted, Player-scoped store. You put a value in once, fetch it by name from many launches, rotate it without touching any Template.
3. **A Job ENV entry** — key/value env vars injected only into **job-mode runs** (Tricks). Scoped to the Player globally, or to a single Prop.

They differ on three axes that almost always decide the answer: *who* needs the value, *when* they need it, and *how often* it gets reused.

![Decision tree for where a secret goes: external reusable credential to the Vault or Job ENV, otherwise a launch variable that Fibe can generate](./decision-tree.svg)

Before anything else, internalize the one rule that overrides every nuance below: **a real secret never goes into Template text.** Not in a `default:` field, not inline, not in a committed env file. A Template is source-linked and shared; anything in its body is in plain YAML and in everyone's git history forever. Every mechanism in this post exists to keep you honest about that line.

:::caution
`secret: true` and `sensitive: true` are launcher UI hints, not encryption. They mask a field and keep it out of logs — they do not encrypt the value at rest. If a value is a genuine long-lived credential, its home is the Secret Vault, regardless of how you flag it in a variable.
:::

## Home 1: launch variables (with random)

Launch variables are the default. Anything that is part of launching the Template and isn't a reusable external credential belongs here: the app name, the environment label, a public URL, the framework master key the app needs to boot — and, crucially, *generated* secrets like a per-Playground database password.

The magic word for "generate it, don't make us type it" is `random: true`.

```yaml
x-fibe.gg:
  variables:
    DB_PASSWORD:
      name: "Database password"
      required: true
      random: true
      secret: true
      sensitive: true
      paths:
        - services.postgres.environment.POSTGRES_PASSWORD
        - services.app.environment.DATABASE_PASSWORD
```

Here is what each line is doing:

- `random: true` tells Fibe to generate the value — a 32-character lowercase hex string — at compile time if the launcher didn't supply one.
- `required: true` would normally fail compilation when no value is given. But random generation runs **before** the required check, so `required: true` + `random: true` always succeeds with no human input. That combination is the idiom for "must exist, and Fibe owns it."
- `paths:` lists every place the value gets written. The same hex value lands in all of them in a single compile pass.
- `secret: true` masks the field in the launcher; `sensitive: true` keeps it out of logs and telemetry.

The result: a Postgres password that exists, is strong, is shared correctly between the database and the app, and that *you, the Template author, never saw and never typed.* That is the whole point.

![Random generation flow: declare random true, Fibe generates 32 hex once, persists it for the launch, reuses it on later compiles, and fans the same value out to every listed path](./random-flow.svg)

### Persistence is the feature, not a bug

The single most important thing to understand about `random: true`: **the value persists.** Fibe generates it once for that launch and reuses the same value on every subsequent compile — every rollout, every restart. This is exactly what you want for a database password, because the password is baked into the data on disk. If it regenerated on each launch, your next deploy would hand Postgres a brand-new password and lock you out of your own volume.

:::caution
Never put a database password (or anything tied to persistent state) on a value that re-randomizes per launch. The value stays stable by design. Rotation is a deliberate, separate operation handled by template-author tooling — not something a normal launch does.
:::

### Sharing one random across services

Real stacks have more than two consumers of the same password — a primary, a pooler, a migration job, a couple of workers. List them all under `paths:` and they all receive the same generated value:

```yaml
x-fibe.gg:
  variables:
    PGPASSWORD:
      name: "Postgres password"
      required: true
      random: true
      paths:
        - services.postgres.environment.POSTGRES_PASSWORD
        - services.pgbouncer.environment.DB_PASSWORD
        - services.web.environment.FIBE_DB_PASS
        - services.jobs.environment.FIBE_DB_PASS
```

And when you need the value embedded inside a larger string — a connection URL, say — reference it inline with `$$var__NAME`. The inline reference and the `paths:` writes all resolve to the same hex value within one compile:

```yaml
services:
  app:
    environment:
      DATABASE_URL: "postgres://postgres:$$var__PGPASSWORD@pgbouncer:5432/app"

x-fibe.gg:
  variables:
    PGPASSWORD:
      name: "Postgres password"
      required: true
      random: true
      paths:
        - services.postgres.environment.POSTGRES_PASSWORD
        - services.pgbouncer.environment.DB_PASSWORD
```

:::note
Use `$$var__NAME` only for fragments inside a larger string. For a whole environment value or label, prefer `path:` / `paths:` — it is cleaner and validated. And write `$$var__NAME`, never `$$random__NAME`: the `$$random__` token is recognized only by old validation passes and is **not** substituted at compile time, so the literal text would survive into the compiled file.
:::

### When NOT to use random

`random: true` is right for values that live and die inside one Playground. It is the wrong tool when:

- **The value already exists elsewhere.** A framework master key (like a `RAILS_MASTER_KEY`) must match the key the app already uses to decrypt its credentials. You can't generate that — the launcher has to supply it. Declare the variable with `secret: true` + `sensitive: true` and **no** `random`, so the launcher types the real key once:

  ```yaml
  RAILS_MASTER_KEY:
    name: "Application master key"
    required: true
    secret: true
    sensitive: true
    paths:
      - services.web.environment.RAILS_MASTER_KEY
      - services.jobs.environment.RAILS_MASTER_KEY
  ```

- **The app can't accept the format.** `random` gives you 32 hex characters. If the app demands a 64-char Base64 secret, either change the app's expectation or supply the value by hand.
- **It's a reusable external credential.** That's the Vault's job — keep reading.

## Home 2: the Secret Vault

The Vault is for the values that are *not specific to this Template*: they're the Player's credential for some external service. An LLM provider API key your Genies call. A Stripe key your scheduled report Trick needs. A third-party webhook signing secret. An OAuth client secret for a custom integration.

What makes these different from a launch variable is reuse and lifecycle. You don't want to paste a Stripe key into every launch form, and you absolutely don't want it duplicated across ten Templates so that rotating it means hunting down ten copies. The Vault solves both: the value lives in exactly one canonical place, encrypted at rest, and gets **fetched by name** whenever something needs it.

Its properties, briefly:

- Encrypted at rest; the raw value is shown only on an explicit reveal.
- Listed by name — the metadata is visible, the value is not.
- Edit, rotate, or revoke from the Vault page without touching any Template.
- Creating, deleting, and revealing entries requires re-confirming your second factor (2FA). Creates, changes, and deletes are written to the Audit log; reads and reveals are not logged, but a reveal still demands your second factor.

The mental model that keeps this clean: **the Template should name which Vault secret to use, never carry the value.** A Genie's config references a Vault secret by name and the value is injected at run time; it never appears in the Genie's settings page. Same discipline applies to Templates — expose a variable that says "use the secret called `stripe-prod`," not a variable that holds the Stripe key.

One more practical note for backups: a Data Backup exports your secret **names and descriptions only** — never the values. After importing, each entry carries a placeholder until you re-enter the real value. That is a feature: your backup file is not a secret-laden liability.

## Home 3: Job ENV entries

The third home exists for one specific shape of problem: a Trick (a job-mode run — CI, a nightly backup, a migration, a cron job) needs a credential on *every* run, and there is no human at a launcher to type it.

Think of a CI Trick that runs on every push. It needs an `NPM_TOKEN`, or a deploy token, or an AWS access key — the same one, run after run. A launch variable is the wrong fit (nobody's there to fill the form), and you don't want it in the Template. **Job ENV** is the answer: set the value once, and Fibe injects it into job-mode runs automatically.

There are two scopes:

- **Global Job ENV** — applies to every Trick the Player runs. Use it for the credential everyone's jobs share, like a single Slack webhook URL for run notifications.
- **Prop-scoped Job ENV** — applies only when the Trick is tied to that repository's Prop. This is how you give repo A's CI its deploy key and repo B's CI a *different* deploy key; they never see each other's.

```bash
# "every CI job should have an NPM_TOKEN" — set it once, not per Template
fibe job-env create --scope global --key NPM_TOKEN --value "$NPM_TOKEN" --secret

# repo-specific deploy key, scoped to one Prop
fibe job-env create --prop my-service --key DEPLOY_KEY --value "$DEPLOY_KEY" --secret
```

The security property worth knowing: a Job ENV entry marked secret is **withheld from pull-request-triggered runs.** That is deliberate. A PR can come from anywhere, including an untrusted fork, and a malicious PR could otherwise add a step that echoes your deploy key into the logs. So PR-triggered jobs run without the secret entries; manual, scheduled, and push-triggered runs get them normally. If your CI on PRs suddenly can't find a token, this is almost always why — and it's protecting you.

:::caution
Fibe scrubs Job ENV values from log output where it can. It cannot un-print something your own job code echoes to stdout. Don't `echo "$DEPLOY_KEY"` in a build step "just to check" — that defeats every protection above.
:::

## Putting it side by side

![Comparison of launch variable, Secret Vault, and Job ENV across scope, reuse, encryption, masking, and what each is best for](./three-homes-compare.svg)

When you're staring at a value and can't decide, run it past these axes:

| Question | Launch variable | Secret Vault | Job ENV |
|---|---|---|---|
| Scope | One Playground launch | Player-wide | Player or per-Prop, Trick runs only |
| Reuse | Re-supplied each launch | Fetched by name, many places | Auto-injected on every run |
| Encrypted at rest | No (it's a launch input) | Yes | Stored as env entries |
| Hidden from UI / logs | Via `secret:` / `sensitive:` | Never shown; metadata only | Scrubbed from logs; secret entries withheld from PR runs |
| Rotate without editing Templates | Hard | Easy | Easy |
| Best for | Launch config, master keys, `random` DB passwords | External API tokens you rotate | CI / cron / backup credentials |

And the worked decision, in three questions:

1. **Is it the Player's external credential, reused across launches?** If no, it's a launch variable — let Fibe generate it with `random: true` if nothing outside this launch ever needs to see it, or mark it `secret`/`sensitive` and have the launcher supply it if it must match an existing value.
2. **If yes — does a Trick consume it on every run, unattended?** Then Job ENV (global, or Prop-scoped if repos need different keys).
3. **Otherwise** — the Secret Vault. Encrypted, named, rotatable, audited.

## A worked before/after

Here's the kind of Template a hurried author writes, and how to fix it.

**Before** — three different mistakes in nine lines:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: hunter2          # hardcoded secret in shared YAML
  app:
    image: ghcr.io/acme/app:latest
    environment:
      DATABASE_PASSWORD: hunter2          # duplicated, drifts on change
      STRIPE_API_KEY: sk_live_51H...      # real external key, in git forever
```

**After** — the password is generated, the Stripe key lives in the Vault, and the body holds no secrets:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: placeholder      # overwritten at compile via paths
  app:
    image: ghcr.io/acme/app:latest
    environment:
      DATABASE_PASSWORD: placeholder
      STRIPE_SECRET_NAME: stripe-prod     # names the Vault entry, not the value

x-fibe.gg:
  variables:
    DB_PASSWORD:
      name: "Database password"
      required: true
      random: true
      secret: true
      sensitive: true
      paths:
        - services.postgres.environment.POSTGRES_PASSWORD
        - services.app.environment.DATABASE_PASSWORD
```

The `hunter2` is gone — Fibe owns the database password and shares it correctly. The Stripe key never enters the Template; the app is told the *name* of the Vault entry to fetch at run time. You could publish this Template to the Bazaar tomorrow and leak nothing.

![What the secret and sensitive flags do: secret masks the launcher field, sensitive keeps the value out of logs, and neither is encryption — long-lived real secrets belong in the Vault](./masking-flags.svg)

## The anti-patterns, collected

These are the ones that bite people, straight from the field:

- **A secret in a `default:` value.** It lives in plain YAML, in the Template body, in everyone's git history. Use `random: true` for template-scoped values, or a Vault entry for Player-scoped ones.
- **Asking the launcher to type a long-lived API key every time.** Once is fine; recurring is not. Store it in the Vault and reference it by name.
- **Real values in a committed env file.** `fibe.gg/env_file` points at an *example*. Never put real values there.
- **Re-randomizing a database password on every launch.** Without persistence, your existing data becomes unreachable. `random: true` persists, so it's safe — just don't add the variable to a rotation request unless you mean it.
- **Treating `secret: true` as encryption.** It's a display hint. Real secrets use the Vault.
- **Storing a credential in both the Vault and Job ENV.** Pick one home. Two copies is one more place to forget when you rotate.

## Rules of thumb

- **Default to a launch variable.** Reach for the Vault or Job ENV only when the value is a reusable external credential.
- **Never type a secret you can generate.** A password that lives only inside one Playground should be `random: true` — required, persisted, fanned out via `paths:`.
- **The Template names secrets; it doesn't hold them.** Expose a variable that says *which* Vault entry to use, never the value.
- **Unattended and per-run is the Job ENV signal.** Tricks that need the same credential every run get Job ENV — global if shared, Prop-scoped if repos differ.
- **`secret` / `sensitive` are cosmetics + log hygiene, not crypto.** Encryption at rest means the Vault.
- **If it would be a problem in git, it can't be in the Template.** That single test settles most decisions before you even open this guide.

Get this right and the payoff is concrete: your Templates become genuinely shareable. You can push them to a Prop, hand them to a teammate, or publish them to the Bazaar, and the only thing that travels is the *shape* of your stack — never a single live credential.
