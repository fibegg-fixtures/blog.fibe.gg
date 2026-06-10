---
slug: notifications-fanout
title: "One event, four destinations: how notifications fan out"
description: "A single domain event becomes a live toast, an inbox entry, an audit record, and a web push — through one in-process event bus, with producers that never name a channel."
date: 2026-06-10
tags: [frontend, architecture, realtime, events]
format: md
---

Your Genie finishes a long edit while you're staring at a different tab. Three things should happen at once: a toast slides in, a new item lands in your inbox so the news survives a reload, and — if you asked for it — your phone buzzes. None of the code that *produced* that message knows any of this. It raised one notification, passed a player and a string, and moved on.

That gap — between "something happened" and "the user finds out, in four different places" — is the small piece of the system that taught us the most about keeping a Rails app real-time.

<!-- truncate -->

## The shape of a notification

A notification on Fibe has more than one job, and the jobs have different lifetimes.

- The **toast** is ephemeral — a glance, "your agent replied," gone in a few seconds. Blink and you miss it; that's fine.
- The **inbox** is durable. It answers "I was away from my desk, what did I miss?" and has to survive a tab switch and a full page reload.
- The **audit channel** is structural: every domain event flows out as JSON for anything observing the system — debugging, live dashboards, internal tooling.
- The **web push** is out-of-band. It reaches you when the tab isn't even open, and it's strictly opt-in per action.

The temptation is to let whoever raises the notification stitch all four together. Resist it: the producer says *what happened*, once; delivery is somebody else's problem — and the rest of this post is how, without a message broker.

![Fan-out of a single notification: a producer raises one notification, which publishes a single domain event to the in-process event bus and writes to three delivery paths — a transient mini-toast Turbo Stream, the inbox over Turbo Streams, and web push for opted-in players. The event bus also emits JSON to the audit channel.](./notification-fanout.svg)

## Producers don't know about channels

Take a real producer. When a Genie's assistant messages sync in, the agent-message notification works out who can see the agent — the owner, plus anyone it's shared with via a team — and raises one notification per player.

What the producer *says* is a small, declarative bundle of facts: who it's for, a severity (info, say), the human-readable message, a category, whether the news should persist, where in the app it points, and a stable name for the kind of action that happened — that last one matters for consent. Nothing more: no Turbo Streams, no broadcast call, no web-push lookup, no VAPID keys, no toast component. The producer's vocabulary is *meaning*, never delivery.

Raising a notification is a small shared behavior mixed into notification classes — the only place that knows the four destinations exist. Add a fifth tomorrow — a Slack relay, say — and not one producer changes. That's the payoff of publish/subscribe decoupling:

![Publish/subscribe decoupling: on the left, producers like the agent-message notification and billing only know how to raise a notification and publish an event. In the middle, the broadcaster and event bus. On the right, the delivery channels — Turbo toast, inbox, audit, web push. Producers never reference the right-hand column.](./pubsub-decoupling.svg)

## The event bus is boring on purpose

Raising a notification publishes a single domain event onto an in-process event bus — no RabbitMQ, no Kafka, no separate process. It's about a dozen lines that look up the subscribers interested in an event and call each one in turn. Two deliberate choices earn its keep.

First: **errors are swallowed per subscriber.** Each subscriber runs inside its own rescue, so if one blows up, the loop keeps going and the others still fire — a failure in the audit observer must never eat your toast. A bad subscriber logs and is skipped, never getting a veto over the rest.

Second: **every event gets a default subscriber for free.** Before any per-event subscribers, the bus prepends one standard observer that feeds the audit channel: it serializes the event to JSON and broadcasts it over Turbo's underlying ActionCable transport to every channel the event declares. If an event doesn't declare its audience, the observer falls back to a single catch-all channel — so the audit stream is never silently empty.

How does an event decide its audience? Each event type answers one question — "who should hear this?" — and nothing else. A user-facing notification resolves the target player from its own payload and returns that player's private channel; with no player attached, it returns no audience and the broadcast is a no-op. A new event type answers that question, optionally registers extra subscribers, and the bus never grows.

"In-process" is a deliberate tradeoff: we give up durability and cross-process delivery — a subscriber in another worker won't see the event — for zero operational surface, nothing to deploy or monitor, no broker to page someone at 3am. For *notifications* that's a good trade: the durable part is the inbox row, not the event.

## Turbo Streams: real-time UI, no SPA

Now the part you actually see. Toast and inbox both arrive over [Turbo Streams](https://turbo.hotwired.dev/handbook/streams) on a private, per-player channel. A Turbo Stream is a tiny instruction the server pushes to the browser — *append this rendered HTML here*, *prepend it there*, *remove that element* — which the Turbo runtime applies as a DOM operation. No JSON-to-component reconciliation, no client router, no duplicated rendering logic: the same view components that render the page on first load render the fragments we stream.

The toast is a single append: the server renders the toast view component to an HTML string and broadcasts an "append this fragment" instruction down the player's channel, targeting the toast container. Turbo drops it into place, and a small Stimulus controller fades it out after its moment. No toast-specific wire format, no client-side template — just rendered HTML and a one-word verb.

![Real-time update sequence: a domain event triggers a notification, the server renders the toast view component to HTML, pushes a Turbo Stream append over the player's channel, and the browser's Turbo runtime applies the DOM operation — appending the toast into the container. No page reload, no client-side rendering.](./realtime-sequence.svg)

Why this over a SPA? It deletes an entire category of work — no API layer to keep in lockstep, no client-side model of server state to drift, no second rendering path to test. The cost is coupling to the server, but for an app whose whole job is reflecting backend state — containers starting, agents replying, bills funding — that coupling is the point.

## The inbox: durability for the moment you blinked

A toast you missed is gone; the inbox is how the news survives. When a notification is durable, the broadcaster sends two Turbo Stream instructions back to back: remove the "you're all caught up" empty-state element, then prepend the freshly rendered item to the top of the durable list — same mechanism as the toast, only the verb and target change. Non-durable notifications still land in the inbox, but in a separate *ephemeral* section, present while the page lives and gone on the next reload.

The unread badge has a nice detail: we don't stream a separate "count." It's a Stimulus controller that watches the inbox containers for DOM changes and recomputes its own number. Prepend an item, the badge ticks up — no extra channel, no count to disagree with. The DOM *is* the state.

| | Toast | Inbox | Audit channel | Web push |
|---|---|---|---|---|
| Lifetime | Seconds | Until read / reload | Per-event | Out-of-band |
| Transport | Turbo Stream append | Turbo Stream prepend | Real-time JSON | webpush + VAPID |
| Durable? | No | Yes (when persisted) | No | No |
| Consent | Per-action enabled | Always shown | n/a | Per-action opt-in |
| Audience | One player | One player | Event's channels | Opted-in subscribers |

## Web push: opt-in, and gated twice

The fourth destination fires only under conditions, and consent is checked in two places.

The first gate is in the broadcaster. Web push is only attempted when the notification is durable, the action is one the player has enabled, and there's both an action name and a target path to point at. A transient toast never becomes a push.

The second gate lives in the delivery service, which re-checks rather than trusting the caller. It re-filters the players to those who've enabled this action, confirms the VAPID signing keys are configured, looks up each player's push subscriptions, and — the part we like — prunes any the browser has since invalidated. Each send happens inside its own rescue, and an expired-or-invalid error from the push endpoint is treated not as a failure to retry but as a signal to delete that subscription on the spot. Endpoints go stale constantly — browsers get reinstalled, permissions revoked — so delivery doubles as garbage collection, cleaning up exactly when we'd otherwise waste the request, no separate sweep needed.

The two gates aren't redundant: the broadcaster decides whether this kind of notification is push-worthy at all, the service whether this player consented and can be reached right now. Consent gets the last word at delivery, not intent.

## Events as the integration backbone

The user-facing notification isn't a one-off — it's the most visible consumer of a whole family of domain events riding the same in-process bus, grouped roughly by the part of the product that raises them:

- **Provisioning** announces lifecycle moments: a Marquee or Playground changing status, a Playground being destroyed, or one failing while running as a job.
- **Billing** announces money moments: a subscription being cancelled, or a managed Tutorial instance requested for provisioning.
- **Agents** announce when an Agent is updated or destroyed.
- A shared core publishes the generic ones every resource gets — created, updated, destroyed — plus the user-facing notification itself.

Each answers the one audience question and nothing more. The reconciler that heals environments, the live status dots, the audit trail: all just *subscribers* the emitter never enumerated. To react to "a Playground failed," you write a subscriber instead of editing the failure path to call you — the producer's blast radius stays at one line, and everything downstream is additive.

## What we learned

Two rules held up, the ones we'd carry to the next system. **Make producers speak meaning, not mechanism** — the day a producer mentions a transport, the abstraction has already lost. And **pick durability per channel, not per system**: the toast is allowed to be lossy, the inbox is not, web push is best-effort with self-healing.

One event, four destinations, and a producer that knows about none of them. That's the whole trick, and it's worth the small amount of plumbing.
