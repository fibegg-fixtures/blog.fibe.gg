---
slug: rails-postgres-playbook
title: "A real conversion, end to end: a Rails + Postgres app on Fibe"
description: Walk a complete docker-compose.yml for a Rails app with Postgres into a polished, launchable Fibe template — routing, volumes, ordering, secrets, and migrations.
date: 2026-05-29
tags: [guide, playbook, rails, postgres, templates]
format: md
---

You have a Rails app. It has a `web` service, a Postgres database, and a Sidekiq worker, and it runs on your laptop with a `docker-compose.yml` you copy-pasted from a blog post two years ago. You want it on Fibe: a real HTTPS URL, live logs, a terminal, source pulled from your repo, secrets that aren't sitting in plaintext, and migrations that run before anyone hits the app.

This post does the whole conversion, top to bottom: we start from a realistic raw Compose file and turn it, one decision at a time, into a polished, launchable template — the kind you'd publish to the Bazaar. By the end you'll have a file you can click Launch on, and a mental model for why each label is there.

<!-- truncate -->

## The starting point

Here's the file as it exists on a developer laptop. Nothing wrong with it — it just assumes things about its environment that won't hold on a Marquee.

```yaml
services:
  web:
    build: .
    ports: ["3000:3000"]
    environment:
      RAILS_ENV: production
      DATABASE_URL: postgres://postgres:secret@db:5432/myapp
      REDIS_URL: redis://redis:6379/0
      RAILS_MASTER_KEY: abc123hardcoded
    depends_on:
      - db
      - redis
  jobs:
    build: .
    command: bundle exec sidekiq
    environment:
      RAILS_ENV: production
      DATABASE_URL: postgres://postgres:secret@db:5432/myapp
      REDIS_URL: redis://redis:6379/0
    depends_on:
      - db
      - redis
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: myapp
    volumes:
      - pg_data:/var/lib/postgresql/data
  redis:
    image: redis:8-alpine
    volumes:
      - redis_data:/data

volumes:
  pg_data:
  redis_data:
```

Four services, two named volumes. The shape is right; the problems are:

- **`ports: ["3000:3000"]`** publishes a host port. On a Marquee, routing and TLS are Traefik's job, not yours.
- **`build: .`** builds from the directory you're standing in. A Marquee doesn't have your working directory; it needs to be told where your source lives (your repo).
- **Secrets are baked in.** `secret` and `abc123hardcoded` are right there in the file. Fine for a laptop, a non-starter for anything shared.
- **`depends_on:` is the short form** (`[db, redis]`), which only waits for the container to *start*, not to be *ready*. Rails will boot, try to connect to a Postgres that's still initializing, and crash.
- **Migrations have nowhere to run.** On a laptop you `docker compose exec web bin/rails db:migrate` by hand; that doesn't happen automatically here.

None of these are bugs — they're assumptions that quietly break the moment the file leaves your machine. Let's fix them.

## What we're building toward

Here's the target architecture. `web` is the only thing the world can reach; everything else is internal. Postgres keeps its data on a named volume, and a one-shot `setup` service runs migrations before `web` or `jobs` come up.

![Target architecture: web exposed via Traefik on a subdomain, with internal Postgres, Redis, a Sidekiq worker, and a one-shot setup service; Postgres and Redis backed by named volumes](./target-architecture.svg)

We'll get there in five moves — expose the web, lock down the source, persist the data, order the startup, pull the secrets out — then run migrations as part of launch.

## Step 1 — Expose `web`, keep the rest internal

Drop `ports:` entirely. On Fibe you declare *intent* with labels and let Traefik wire up the host + TLS. `fibe.gg/port` tells Fibe which container port serves HTTP; pair it with `fibe.gg/visibility: external` to make it public and `fibe.gg/subdomain` to choose the host.

```yaml
services:
  web:
    build: .
    labels:
      fibe.gg/port: 3000
      fibe.gg/visibility: external
      fibe.gg/subdomain: app
```

That's the whole routing story for a single-service app: `web` answers on `https://app.<your-root-domain>`, with a wildcard TLS cert, no host ports, no nginx config.

For everything else you do *nothing*. Postgres, Redis, and the worker get **no** `fibe.gg/port` label, so they're never routed and never reachable from outside. The default is private; a service is only public when you say so.

:::tip
Internal-to-internal traffic still uses Compose's service DNS. `web` reaches Postgres at `postgres:5432` and Redis at `redis:6379` over the Compose network exactly as on your laptop. The only thing that changes is the *public* edge.
:::

## Step 2 — Build `web` from your repo (the Prop)

`build: .` has to become "build from my Git source." On Fibe, source comes from a **Prop** (a Git binding — managed Gitea, GitHub OAuth, or a GitHub App), and you point a service at it with source-backed build labels:

- `fibe.gg/repo_url` — where the code lives
- `fibe.gg/branch` — which branch to build
- `fibe.gg/dockerfile` — the Dockerfile path inside the repo
- `fibe.gg/start_command` — the command to run (replaces the laptop's `command:`)

```yaml
services:
  web:
    build: .
    labels:
      fibe.gg/repo_url: https://github.com/owner/repo
      fibe.gg/branch: main
      fibe.gg/dockerfile: Dockerfile
      fibe.gg/start_command: bin/rails server -b 0.0.0.0
      fibe.gg/port: 3000
      fibe.gg/visibility: external
      fibe.gg/subdomain: app
```

You keep `build: .` for local `docker compose up` compatibility — Compose uses it, Fibe ignores it in favor of the labels. The three Rails services (`setup`, `web`, `jobs`) all build from the same repo, so they each carry the same `repo_url` / `branch` / `dockerfile` trio.

By the time we're done, `web` carries the most labels of any service — build, routing, and rollout config all live there. Here's the full set, grouped by purpose:

![The labels on the web service grouped by purpose: source-backed build labels, public routing labels, and mode plus rollout labels, each annotated with what it does](./web-labels.svg)

`fibe.gg/source_mount` is optional: it mounts the repo at a path (e.g. `/rails`) for live-dev workflows. On a built production image the mount goes unused at runtime, so only add it if you actually develop against it.

## Step 3 — Persist data with named volumes

The raw file already had `pg_data` and `redis_data` named volumes, which is exactly right. What to *not* do is reach for a host bind mount like `./data:/var/lib/postgresql/data` — a Marquee has no idea what `./data` means, and there's no guarantee your laptop's directory layout exists on the host. Named volumes are the portable choice: Fibe manages them, and they survive container restarts and rollouts.

| Volume form | Example | Use on Fibe |
|---|---|---|
| Named volume | `pg_data:/var/lib/postgresql/data` | Yes — Fibe manages it |
| Anonymous volume | `/var/lib/postgresql/data` | Works, but unnamed and hard to manage |
| Host bind | `./data:/var/lib/postgresql/data` | No — the Marquee has no `./data` |
| Source mount | via `fibe.gg/source_mount` | Yes — Fibe injects it |

So Postgres and Redis keep their named volumes unchanged:

```yaml
services:
  postgres:
    image: postgres:17.5
    volumes:
      - pg_data:/var/lib/postgresql/data
  redis:
    image: redis:8-alpine
    volumes:
      - redis_data:/data

volumes:
  pg_data:
  redis_data:
```

:::caution
Don't forget the top-level `volumes:` block. If you mount `pg_data:/var/lib/...` on the service but never declare `pg_data:` at the root, Compose treats it as anonymous and hands you a fresh random volume on every launch — your database vanishes silently each time. Declare it once at the top.
:::

While we're in Postgres: bump `shm_size`. Postgres uses `/dev/shm` for sorts and joins, and Docker's default 64 MB is small enough that non-trivial queries throw `could not resize shared memory segment`. Set `shm_size: 1gb` for a Rails-sized workload (or `256mb` for something light).

## Step 4 — Order the startup with `depends_on` conditions

This is the step people skip and then spend an afternoon debugging. The short form —

```yaml
depends_on:
  - db
  - redis
```

— only waits for the dependency's *container* to start. The container starting and Postgres being *ready to accept connections* are seconds apart, and Rails will happily try to connect in that gap and die. The fix is the long form with conditions — there are three, and you'll use all three:

| Condition | Means |
|---|---|
| `service_started` | Compose started the container — no readiness guarantee |
| `service_healthy` | The dependency's Compose `healthcheck:` is passing |
| `service_completed_successfully` | The dependency exited with status 0 (one-shot jobs) |

For `service_healthy` to mean anything, the dependency must define a `healthcheck:`. For Postgres that's `pg_isready`:

```yaml
services:
  postgres:
    image: postgres:17.5
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 30s
```

Now `web`, `jobs`, and `setup` can wait for Postgres to be genuinely healthy. The full ordering looks like this:

![Startup ordering: Postgres and Redis must reach healthy, then setup runs migrations and exits 0, then web and jobs start](./startup-ordering.svg)

`setup` waits for Postgres to be healthy; `web` and `jobs` wait for Postgres + Redis to be healthy *and* for `setup` to have completed successfully. Nothing comes up out of order.

:::note
`depends_on` reduces transient first-boot errors; it is not a substitute for in-app retry. Compose start order isn't a hard runtime guarantee, and a database can blip later in the app's life, so keep Rails' normal reconnection behavior on. `depends_on` makes the *first* boot clean.
:::

## Step 5 — Pull the secrets into template variables

The hardcoded `secret` and `abc123hardcoded` have to go. Fibe's mechanism is the `x-fibe.gg.variables` block: each variable is bound to a path in the document, and the launcher fills it in. Variables can be `required`, `random` (Fibe generates a value), `secret` (stored in the vault, not shown back), `sensitive` (masked in the UI), `validated` (regex), or `defaulted`. Two patterns cover almost everything:

**A generated Postgres password.** Mark it `random` and `secret` so Fibe invents a strong value and keeps it out of the file. Bind it to the one place it lives — `POSTGRES_PASSWORD` — and reference the *same* value inside `DATABASE_URL` with an inline `$$var__` token, so both sides match:

```yaml
x-fibe.gg:
  variables:
    DB_PASSWORD:
      name: "Postgres password"
      required: true
      random: true
      secret: true
      sensitive: true
      path: services.postgres.environment.POSTGRES_PASSWORD
```

```yaml
DATABASE_URL: "postgres://postgres:$$var__DB_PASSWORD@postgres:5432/$$var__APP_DB"
```

**A user-supplied master key.** `RAILS_MASTER_KEY` decrypts the repo's credentials, so it can't be random — the launcher pastes it. Mark it `secret` and `sensitive`, bind it to every service that needs it with `paths:` (plural):

```yaml
RAILS_MASTER_KEY:
  name: "Rails master key"
  required: true
  secret: true
  sensitive: true
  paths:
    - services.setup.environment.RAILS_MASTER_KEY
    - services.web.environment.RAILS_MASTER_KEY
    - services.jobs.environment.RAILS_MASTER_KEY
```

There's a subtlety here that trips up everyone once.

:::caution
Launch variables are **not** passed to Compose's `${VAR}` interpolation. If you write `RAILS_MASTER_KEY: ${RAILS_MASTER_KEY}` and nothing else, on Fibe that yields the literal default (or empty) — the launch value never reaches it. What makes a launch value take effect is the **binding**: the `path:` / `paths:` entry, or an inline `$$var__NAME` token. Keep the `${VAR:-default}` form if you want the file to still run under plain `docker compose up`, but it's the binding that does the real work on Fibe. And `${VAR}` is outright **rejected** inside `fibe.gg/*` labels — those nodes must hold valid literals, which the bindings overwrite at compile time.
:::

So you'll see label nodes carrying a placeholder value with a comment, like:

```yaml
labels:
  fibe.gg/repo_url: https://github.com/owner/repo   # overwritten by the REPO_URL binding
  fibe.gg/subdomain: app                            # overwritten by the SUBDOMAIN binding
```

The literal is there to keep the document valid; the binding swaps it at compile time.

## Step 6 — Migrations run as the one-shot `setup` service

A Rails app needs migrations and asset compilation *before* the web tier takes traffic. The clean pattern is a one-shot `setup` service: it builds from the same repo, runs your prepare steps, exits 0, and everyone else waits on it via `service_completed_successfully`.

```yaml
  setup:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    command:
      - /bin/sh
      - -lc
      - |
        bin/setup --skip-server
        bin/rails db:prepare
        bin/rails assets:precompile
    environment: *rails-env
    restart: "no"
    labels:
      fibe.gg/repo_url: https://github.com/owner/repo   # overwritten by the REPO_URL binding
      fibe.gg/branch: main                              # overwritten by the BRANCH binding
      fibe.gg/dockerfile: Dockerfile
      fibe.gg/source_mount: "/rails"
```

`bin/rails db:prepare` is the safe choice: it creates the database if needed, then migrates, then seeds — idempotent, so it's fine that subsequent rollouts run `setup` again. `restart: "no"` keeps it from looping after it exits.

If you'd rather not bake migrations into every launch, the same logic works as a **Trick** — a one-shot, job-mode run you fire on demand or on a schedule (`metadata.schedule_config` for cron, `metadata.trigger_config` for VCS push/PR). The `setup` service makes launch self-contained; the Trick gives you a manual button. Pick by whether you want migrations automatic on every rollout.

## The finished template

Here's everything assembled. It uses YAML anchors (`&rails-env`, `&rails-deps`) to keep the shared environment and dependency blocks DRY across the three Rails services.

```yaml
x-rails-deps: &rails-deps
  postgres:
    condition: service_healthy
  redis:
    condition: service_healthy
  setup:
    condition: service_completed_successfully

x-rails-env: &rails-env
  RAILS_ENV: ${RAILS_ENV:-production}
  RAILS_MASTER_KEY: ${RAILS_MASTER_KEY}
  DATABASE_URL: "postgres://postgres:$$var__DB_PASSWORD@postgres:5432/$$var__APP_DB"
  REDIS_URL: redis://redis:6379/0
  RAILS_LOG_TO_STDOUT: "1"
  RAILS_SERVE_STATIC_FILES: "1"

services:
  postgres:
    image: postgres:17.5
    shm_size: 1gb
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${APP_DB:-app}
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 30s
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped

  setup:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    command:
      - /bin/sh
      - -lc
      - |
        bin/setup --skip-server
        bin/rails db:prepare
        bin/rails assets:precompile
    environment: *rails-env
    restart: "no"
    labels:
      fibe.gg/repo_url: https://github.com/owner/repo   # overwritten by the REPO_URL binding
      fibe.gg/branch: main                              # overwritten by the BRANCH binding
      fibe.gg/dockerfile: Dockerfile
      fibe.gg/source_mount: "/rails"

  web:
    build: .
    depends_on: *rails-deps
    environment: *rails-env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/up"]
      interval: 10s
      timeout: 10s
      retries: 12
      start_period: 120s
    labels:
      fibe.gg/repo_url: https://github.com/owner/repo   # overwritten by the REPO_URL binding
      fibe.gg/branch: main                              # overwritten by the BRANCH binding
      fibe.gg/dockerfile: Dockerfile
      fibe.gg/source_mount: "/rails"
      fibe.gg/start_command: bin/rails server -b 0.0.0.0
      fibe.gg/port: 3000
      fibe.gg/visibility: external
      fibe.gg/subdomain: app                            # overwritten by the SUBDOMAIN binding
      fibe.gg/production: "true"
      fibe.gg/zerodowntime: "true"
      fibe.gg/healthcheck_path: /up

  jobs:
    build: .
    depends_on: *rails-deps
    environment: *rails-env
    command: bundle exec sidekiq
    restart: unless-stopped
    labels:
      fibe.gg/repo_url: https://github.com/owner/repo   # overwritten by the REPO_URL binding
      fibe.gg/branch: main                              # overwritten by the BRANCH binding
      fibe.gg/dockerfile: Dockerfile
      fibe.gg/source_mount: "/rails"
      fibe.gg/start_command: bundle exec sidekiq
      fibe.gg/production: "true"

volumes:
  pg_data:
  redis_data:

x-fibe.gg:
  variables:
    REPO_URL:
      name: "Repository URL"
      required: true
      default: "https://github.com/owner/repo"
      paths:
        - services.setup.labels.fibe.gg/repo_url
        - services.web.labels.fibe.gg/repo_url
        - services.jobs.labels.fibe.gg/repo_url
    BRANCH:
      name: "Branch"
      required: true
      default: "main"
      paths:
        - services.setup.labels.fibe.gg/branch
        - services.web.labels.fibe.gg/branch
        - services.jobs.labels.fibe.gg/branch
    SUBDOMAIN:
      name: "Subdomain"
      required: true
      default: "app"
      validation: "/^[a-z0-9][a-z0-9-]*[a-z0-9]$/"
      path: services.web.labels.fibe.gg/subdomain
    RAILS_MASTER_KEY:
      name: "Rails master key"
      required: true
      secret: true
      sensitive: true
      paths:
        - services.setup.environment.RAILS_MASTER_KEY
        - services.web.environment.RAILS_MASTER_KEY
        - services.jobs.environment.RAILS_MASTER_KEY
    DB_PASSWORD:
      name: "Postgres password"
      required: true
      random: true
      secret: true
      sensitive: true
      path: services.postgres.environment.POSTGRES_PASSWORD
    APP_DB:
      name: "Postgres database name"
      required: true
      default: "app"
      path: services.postgres.environment.POSTGRES_DB
  metadata:
    description: "Ruby on Rails web stack with Postgres, Redis, and Sidekiq workers"
    category: "Web"
    source_defaults: true
```

## Before and after, at a glance

![Before and after panels: the raw laptop docker-compose.yml on the left with host ports, hardcoded secrets, and short-form depends_on; the Fibe template on the right with port labels, bound variables, healthchecks, and a setup service](./before-after.svg)

It's recognizably the same file. What changed is every place the laptop made an assumption: host ports became routing labels, `build: .` became repo labels, plain `depends_on` lists became readiness conditions, and the secrets moved into bound, generated variables.

## What launching it gives you

Click Launch (or `fibe playgrounds create` from the CLI). Fibe asks for the variables you marked `required` — repo URL, branch, subdomain, master key, database name — generates the random Postgres password, compiles the bindings into the document, and brings the stack up in order. You get a **Playground**: a long-lived environment with

- a **URL** — `https://app.<root-domain>`, wildcard TLS, routed by Traefik;
- **logs** — streaming for every service (this is why `RAILS_LOG_TO_STDOUT: "1"` matters; without it Rails logs to a file and the log pane shows nothing);
- a **terminal** — shell into any service to run a console or one-off command.

The `setup` service runs your migrations, exits green, and then `web` and `jobs` start — you watch the whole sequence in the logs.

## A few Rails-specific gotchas

These bite people specifically on Rails conversions:

- **`RAILS_SERVE_STATIC_FILES` unset** — without it, Rails returns 404 for `/assets/...` behind Traefik. Set it to `"1"` in production templates (same story as `RAILS_LOG_TO_STDOUT`).
- **Hardcoding `RAILS_MASTER_KEY`** — it must come from the launcher; it's what decrypts your encrypted credentials. Never bake it in.
- **Sidekiq with a zero-downtime healthcheck** — Sidekiq isn't HTTP, so there's no endpoint to curl. Don't enable zero-downtime rollout for the worker; let it restart normally. Only `web` gets the `/up` healthcheck and zero-downtime treatment.
- **`source_mount` plus `production: "true"`** — a valid combination, but the mount goes unused at runtime. Set it only if you genuinely develop against it; otherwise it's dead config.
- **Postgres init ENVs ignored on existing data** — `POSTGRES_DB` and friends run only on *first* init. If `pg_data` already has data, changing those ENVs does nothing, so don't expect a rename to take.

## That's the conversion

The file you end with is still a valid Compose document — `docker compose up` still works on your laptop — but it now carries everything a Marquee needs to give you a URL, logs, a terminal, durable data, and clean startup ordering, with no secrets in plaintext. Author it once, publish it, and the next person launches the whole stack with a form.
