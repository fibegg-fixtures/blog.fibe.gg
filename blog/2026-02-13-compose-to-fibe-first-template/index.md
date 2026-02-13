---
slug: compose-to-fibe-first-template
title: "From docker-compose.yml to a live URL: authoring your first Fibe template"
description: Take an ordinary docker-compose.yml, add a handful of fibe.gg labels, and launch it to a real HTTPS URL — a confidence-building first-template walkthrough.
date: 2026-02-13
tags: [guide, templates, compose, authoring]
format: md
---

You already have a `docker-compose.yml`. It runs on your laptop, it has a web service and a database, and you've typed `docker compose up` enough times to have it memorized. The promise of Fibe is that the same file — almost unchanged — becomes a launchable environment with a real HTTPS URL, logs, and a terminal, running on a host you control. No Kubernetes manifests, no rewrite, no new DSL to learn.

The trick is that a Fibe template *is* a Compose file. You don't convert it into something else; you add a few labels to the services that need them, and Fibe reads those to handle routing, TLS, and lifecycle for you. This post walks the minimal additions on a small, real example, explains what each one buys you, and ends with you clicking Launch and getting a URL.

<!-- truncate -->

## The mental model: it's still Compose

Here's the one idea to hold onto: everything Fibe-specific is *additive*. The Fibe behavior lives in two places, and Compose ignores both:

- **`fibe.gg/*` labels** under `labels:` on a service. These tell Fibe how to route, build, expose, and watch that service.
- **An optional `x-fibe.gg:` settings block** at the root, for launch variables and metadata. Anything starting with `x-` is a Compose vendor extension, so `docker compose up` silently skips it.

That means a Fibe template is still a valid Compose document. You can `docker compose up` it locally to sanity-check, and the Fibe additions just sit there inert until you launch on a Marquee. A Compose file with *no* Fibe additions is even a valid template — it just won't do anything Fibe-specific.

The smallest possible template is genuinely this small:

```yaml
services:
  web:
    image: nginx:alpine
    labels:
      fibe.gg/port: 80
```

One service, one label, and you get a public HTTPS URL with nothing else configured. We'll build up from a slightly more realistic file than that.

## Our starting point

Let's say this is what you have today — a static site served by nginx, plus a Postgres database the app talks to:

```yaml
# docker-compose.yml (before)
services:
  web:
    image: nginx:alpine
    container_name: my-web
    ports:
      - "8080:80"
    volumes:
      - site:/usr/share/nginx/html:ro
    depends_on:
      - db

  db:
    image: postgres:17
    container_name: my-db
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: devpassword
    volumes:
      - dbdata:/var/lib/postgresql/data

volumes:
  site:
  dbdata:
```

Nothing exotic. Two services, two named volumes, host ports so you can hit `localhost:8080` and connect a DB client to `localhost:5432`. This is the file we'll Fibe-ify.

## Step 1 — Classify each service

Before touching labels, ask one question per service: does it run a **prebuilt image** (static), or does it build from **your Git repository** (dynamic)?

- `web` here is `nginx:alpine` — a prebuilt image. **Static.** Leave the `image:` line alone.
- `db` is `postgres:17` — also prebuilt. **Static.**

Neither service builds from source in our example, so we're done with this step. If you *did* have a `build:` block — your own app code — that becomes a dynamic service and you'd swap the block for a `fibe.gg/repo_url` label (plus optional `fibe.gg/dockerfile`, `fibe.gg/branch`, `fibe.gg/build_target`, `fibe.gg/build_args`). That's its own guide; for a confidence-building first template, a prebuilt image keeps the moving parts down.

:::note
A Compose `build:` block *requires* a `fibe.gg/repo_url` label — Fibe needs to know where the source comes from. Since our example has no `build:` block, this rule doesn't bite us. Just know it's there for when you graduate to source-backed builds.
:::

## Step 2 — Route the web service with `fibe.gg/port`

This is the heart of the conversion. In plain Compose, a host port (`ports: ["8080:80"]`) is what makes a container reachable — you map a container port to a port on the host machine. On a Fibe Marquee, where many environments share one Docker host, that model breaks down fast: two Playgrounds both wanting host port 8080 would collide.

So Fibe replaces host-port publishing with **label-driven HTTP routing**. You tell it which *container* port speaks HTTP, and Traefik routes a clean HTTPS URL to it:

```yaml
services:
  web:
    image: nginx:alpine
    labels:
      fibe.gg/port: 80
```

`fibe.gg/port: 80` says "this service serves HTTP on container port 80; route to it." By default you get a public URL at `https://<service>.<root-domain>` — so for a service named `web` on a Marquee whose root domain is `your-host`, that's `https://web.your-host`. The subdomain defaults to the service name.

If you'd rather pick the subdomain, add `fibe.gg/subdomain`:

```yaml
labels:
  fibe.gg/port: 80
  fibe.gg/subdomain: site     # → https://site.your-host
```

Subdomains are lowercase letters and digits with optional hyphens; use `@` to bind at the root domain itself. There's also `fibe.gg/path_rule` for sharing one subdomain across services by path — but you don't need it for a first template.

### Public, or behind Basic Auth?

`fibe.gg/visibility` controls who can reach the URL. It defaults to `external` — a public HTTPS URL — so you only add it when you want the *other* behavior:

```yaml
labels:
  fibe.gg/port: 80
  fibe.gg/visibility: internal   # gated by Basic Auth — good for admin consoles
```

For our public static site, the default `external` is exactly right, so we leave `fibe.gg/visibility` off entirely.

:::caution
`fibe.gg/visibility` requires `fibe.gg/port` — visibility only makes sense for something that's actually routed. Set one without the other and validation will tell you. The same dependency holds for zero-downtime rollouts, which also require `fibe.gg/port`.
:::

## Step 3 — Leave the database unexposed

Here's a small decision that trips up people coming from `docker compose up`: **don't add `fibe.gg/port` to your database.** In local Compose you publish `5432:5432` so a DB client on your laptop can connect. On a Marquee, your `web` service reaches `db` over Docker's internal network using the service name as the hostname — exactly as it does locally. The database never needs to be reachable from the public internet.

So `db` gets *no* `fibe.gg/port` and *no* routing label. It stays on the internal network, talking only to the services that need it. This is the right instinct in general: label only the services a human (or another machine outside the Marquee) needs to reach over HTTP. Workers, caches, and databases stay quiet.

That also means you can delete the host `ports:` on `db`. It was only ever there for local convenience.

![Before and after: a raw docker-compose service with host port bindings becomes a Fibe service where fibe.gg/port and fibe.gg/subdomain replace the host ports, container_name is dropped, and the database has no routing label so it stays on the internal network](./before-after-compose.svg)

## Step 4 — Drop the keys Fibe owns or forbids

A couple of Compose keys conflict with how Fibe manages a shared host. Two to know about:

- **`container_name`** — delete it. Fibe derives a unique project name per Playground so you can run many environments on one Marquee without name collisions. A hardcoded `container_name` would force two Playgrounds to fight over the same Docker container name. (It's also outright rejected when you enable zero-downtime rollouts.)
- **`hostname:`** — you don't have to touch it; Fibe strips it automatically.

What about the host `ports:`? They're no longer a launch blocker by default — Fibe strips raw host bindings before launch, so leaving them in won't break anything. You can keep them so the file still publishes ports under a local `docker compose up`, or delete them for a cleaner template. We delete them in templates we intend to publish; we keep them while we're still developing locally.

Everything else passes straight through. `depends_on`, `volumes`, `environment`, `healthcheck`, `networks`, and `restart` all keep working exactly as written. Your named volumes in particular are preserved on the Marquee, so `dbdata` survives restarts the same way it does locally.

| Compose key | What to do | Why |
| --- | --- | --- |
| `container_name` | **Delete** | Collides across Playgrounds on one host |
| `hostname:` | Leave it | Fibe strips it automatically |
| `ports:` | Keep for local, or delete for a clean template | Fibe strips host bindings; routing comes from `fibe.gg/port` |
| `volumes:`, `depends_on:`, `environment:`, `healthcheck:`, `networks:`, `restart:` | Leave as-is | Pass-through, unchanged |

## The result so far

Putting steps 2–4 together, here's the converted file. Notice how little changed — a few labels added, two `container_name` lines and the host ports removed:

```yaml
# fibe template (after)
services:
  web:
    image: nginx:alpine
    labels:
      fibe.gg/port: 80
      fibe.gg/subdomain: site
    volumes:
      - site:/usr/share/nginx/html:ro
    depends_on:
      - db

  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: devpassword
    volumes:
      - dbdata:/var/lib/postgresql/data

volumes:
  site:
  dbdata:
```

That is a complete, launchable Fibe template. `web` will come up with a public HTTPS URL at `https://site.<your-marquee-domain>`; `db` runs alongside it on the internal network, reachable from `web` at the hostname `db`.

## What you got for free

Look at what you *deleted* versus what you now get. You removed the host-port plumbing and the hardcoded container names — the fiddly, host-specific bits — and in exchange Fibe handles three things you used to do by hand.

![Three panels showing what Fibe adds once you label a service: routing and TLS replace host port bindings with Traefik HTTP routing and a wildcard HTTPS certificate; lifecycle management replaces manual restarts and SSH with browser-driven start, stop, logs, and terminal; host isolation replaces hardcoded container names with unique per-Playground project names so many environments share one Marquee without collisions](./what-fibe-adds.svg)

- **Routing and TLS.** `fibe.gg/port` plugs the service into Traefik, which terminates HTTPS using a wildcard certificate for the Marquee's domain. You don't manage certs, reverse-proxy config, or port mappings. You get a working `https://` URL.
- **Lifecycle.** Once it's a Playground, you start, stop, view logs, and open a terminal from the browser. Push a new template version and you can roll the running environment forward to it.
- **Host isolation.** Because Fibe owns the project name, the same Marquee can run a dozen Playgrounds from a dozen templates without anything clashing on container names or ports.

That's the deal: hand over the host-coupled details, keep writing Compose.

## Where your template goes: Template → Version → Playspec → Playground

Before you launch, it's worth understanding the four nouns in the chain, because they explain *why* launches are reproducible.

![The launch chain: an editable Template publishes an immutable Template Version; a Playspec binds a specific Version with variable values; launching the Playspec on a chosen Marquee produces a running Playground with a live URL. A footnote notes you pick the Marquee at launch, the Version makes launches reproducible, one Template can back many Playspecs, and a one-off run can skip the Template](./template-chain.svg)

1. **Template** — your editable recipe: the Compose file plus the Fibe labels. You iterate on it freely.
2. **Template Version** — when you publish, Fibe takes a *frozen snapshot* of the body, variables, and metadata. Published versions can't change; an edit becomes a *new* version with a new id. This immutability is the whole point — it's what lets a launch be reproducible months later.
3. **Playspec** — a configured launch. It points at a specific Template Version, holds the variable values you chose, and lists any mounted files. It's saved and re-launchable.
4. **Playground** — what you get when you launch a Playspec on a Marquee. The running environment, with its URL, logs, and terminal.

A few consequences worth internalizing:

- You **pick the Marquee at launch**, not when authoring. The Marquee isn't stored on the Playspec; the Playground records which one it landed on.
- **One Template can back many Playspecs.** Two people launching the same Template Version with the same variables get equivalent Playgrounds, each running independently.
- For a genuine **one-off**, you can skip the Template entirely — paste a Compose file straight into a new Playspec, set variables, and launch. Reach for a Template when you want reuse, sharing, or Bazaar publication.

:::tip
Editing a Playspec doesn't disturb the running Playground. You prep changes, then apply them on your schedule with a rollout (least disruption) or a hard restart (full stop and start). Nothing changes under you mid-request.
:::

## Step 5 — Validate, then launch

Two checks, in order. First, validate the YAML — this catches the cheap mistakes (a mistyped label, a value that doesn't match its pattern) before you spend time on a launch. With the CLI:

```bash
fibe playspecs validate-compose --compose "$(cat template.yml)"
```

Validation is strict on purpose: **any unrecognized `fibe.gg/*` label is rejected.** A typo like `fibe.gg/prot` doesn't get silently ignored — it fails, and you find out immediately. That strictness is a feature. Write your labels from the reference, not from memory.

Second, **do a preview launch before you publish or share.** Schema-valid is not the same as runs-cleanly — plenty of issues only surface at build or runtime. The tight iteration loop looks like this:

1. Edit the template.
2. Click **Launch** (or **Launch this version**), targeting a test Marquee.
3. Watch the build logs.
4. Open the service URL.
5. Repeat until it's clean.

When the launch succeeds, you'll have a Playground with a URL like `https://site.your-host`. Click it. That's your `docker-compose.yml`, running on your host, behind real TLS, in a browser.

## A note on secrets (so you build the right habit early)

Our example hardcodes `POSTGRES_PASSWORD: devpassword`, which is fine for a throwaway demo and *not* fine for anything you publish. When you're ready, the cleaner pattern is a launch variable with a generated value:

```yaml
x-fibe.gg:
  variables:
    DB_PASSWORD:
      name: "Database password"
      required: true
      random: true
      secret: true
      path: services.db.environment.POSTGRES_PASSWORD
```

`random: true` tells Fibe to generate the password at launch so nobody has to invent one; `secret: true` is a hint to the launcher UI. The `path` points at where the value gets written into the template body. Credentials belong in a launch variable, the Secret Vault, or (for job-mode runs) Job ENV — never hardcoded in a template you intend to share. Variables are a guide of their own; for your first template, just know the door is there.

## Rules of thumb

- **A Fibe template is a Compose file plus labels.** If you can write Compose, you're 90% of the way there. The additions are small and additive.
- **`fibe.gg/port` replaces host ports for HTTP.** Add it to the service a human needs to reach. Fibe gives you the HTTPS URL and the routing.
- **Don't label your database.** Internal services (DB, cache, workers) stay on the internal network with no `fibe.gg/port`. Less exposure, no port collisions.
- **Delete `container_name`.** It collides on a shared host. Let Fibe own project naming.
- **Keep your volumes, `depends_on`, and `environment` as-is.** They pass through untouched.
- **Versions are frozen; that's the feature.** Publish a Version, launch from it, and you get the same environment every time.
- **Validate, then preview-launch.** Unknown `fibe.gg/*` labels are rejected outright, so typos surface fast — but only a real launch proves it runs.
- **Don't hardcode secrets in anything you'll share.** Promote them to a launch variable with `random: true` when you're ready.

From here, the deeper guides cover building dynamic services from your repo (`fibe.gg/repo_url`), live-edit dev mode (`fibe.gg/source_mount` + `fibe.gg/production: "false"`), launch variables and exposure strategy, and execution modes for Tricks. But you've now done the thing that matters: taken an ordinary `docker-compose.yml` and turned it into a live, addressable environment with a handful of labels. Full docs live at https://whats.fibe.gg.
