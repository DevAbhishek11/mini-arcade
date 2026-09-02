# Mini Arcade

A realtime, multiplayer arcade built as a production-shaped TypeScript monorepo. Players are matched by
rating in seconds and play **server-authoritative** games over websockets — the browser only renders and
predicts, the server decides.

```
frontend (React 19 + Vite + Tailwind v4)
      │  REST /api      websocket /realtime
      ▼
nginx  ──sticky──▶  api replicas  ──▶  Postgres (durable state)
                    (Node cluster)     Redis    (cache · pub/sub · socket.io adapter)
```

---

## Contents

- [What's in the box](#whats-in-the-box)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Clustering & scaling](#clustering--scaling)
- [Caching](#caching)
- [Resource management](#resource-management)
- [Observability](#observability)
- [API reference](#api-reference)
- [Realtime protocol](#realtime-protocol)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [Testing & quality](#testing--quality)

---

## What's in the box

| Area          | Highlights                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------- |
| Games         | Tic Tac Toe, Connect Four (turn based), Neon Pong (30 Hz server simulation)                    |
| Fairness      | Elo with a dynamic K factor, rating-aware matchmaking that widens with wait time, turn clocks   |
| Realtime      | socket.io with acks, reconnect grace, presence, per-match chat, cross-worker command routing   |
| Scaling       | Node `cluster` + sticky sessions, Redis socket.io adapter, distributed lock for matchmaking     |
| Caching       | Two tier (per-process LRU + Redis) with single-flight, prefix invalidation and pub/sub fan-out |
| Data          | Postgres with advisory-locked migrations and pooled queries; in-memory driver as a fallback    |
| Hardening     | zod-validated env & requests, helmet, CORS, distributed rate limits, request timeouts          |
| Ops           | `/api/system` health, `/api/system/ready` readiness, Prometheus `/metrics`, structured logs    |
| Solo play     | If nobody is queued, a bot opponent joins so the cabinet is never idle                          |

Three engines, one implementation: every game is a pure, immutable reducer in `@mini-arcade/shared`, so the
server validates with the exact code the browser renders with.

---

## Quick start

### 1. Everything local, zero dependencies

```bash
npm install
npm run build -w @mini-arcade/shared   # the workspaces consume the built types
npm run dev                            # api on :4000, web on :5173
```

Open <http://localhost:5173>. With no `DATABASE_URL`/`REDIS_URL` the server runs a single worker against the
in-memory driver — fully playable, just not durable.

### 2. With real infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d      # postgres + redis only
cp .env.example .env                                # then uncomment DATABASE_URL / REDIS_URL
npm run dev
```

Now clustering, the Redis cache tier and the distributed matchmaker all switch on automatically.

### 3. Full production stack

```bash
docker compose up -d --build
docker compose up -d --scale api=3      # horizontal scale, nginx keeps sockets sticky
open http://localhost:8080
```

---

## Architecture

### Shared game engines

```ts
interface GameEngine<TState, TAction> {
  createState(now: number): TState;
  apply(state, seat, action, now): { ok: boolean; state: TState; error?: string };
  tick?(state, dtMs, now): TState; // realtime games only
  outcome(state): { finished; winnerSeat; reason };
  activeSeat(state): Seat | null;
}
```

Pure and immutable. The server owns the clocks, persistence and rating; the engine owns the rules. Adding a
game means writing one file in `packages/shared/src/games` and registering it in the catalog.

### Request path

`request-id → helmet → cors → compression → body limit → timeout → metrics → logging → drain guard → rate limit → route`

Errors funnel through one handler that renders `AppError`, `ZodError` and unknown failures as the same
`{ error: { code, message, requestId } }` envelope.

### Match ownership

A match is hosted by exactly one worker: the one whose matchmaking pass created it.

- Actions from a player attached to another worker are forwarded over the message bus (Redis pub/sub, or an
  in-process emitter on a single node).
- Broadcasts use socket.io rooms, so the Redis adapter fans them out across every replica.
- Reconnects rejoin the room; presence changes flow back to the host as commands.

### Matchmaking

Rating-sorted queue, pairing window `120 + 90 × waitSeconds` Elo points. With Redis the queue is global and a
short-lived `SET NX PX` lock elects a single matcher per tick, so a pair is created exactly once across the
fleet. Tickets expire after five minutes; unmatched players get a bot after `BOT_FILL_MS`.

---

## Clustering & scaling

Two independent axes, both enabled by default in Docker:

1. **Inside a container** — the primary process owns the listening socket and hands connections to workers
   with `@socket.io/sticky` (`least-connection`), so a websocket upgrade always lands on the worker that
   performed the handshake. Workers talk through `@socket.io/cluster-adapter`.
2. **Across containers** — `docker compose up --scale api=N` behind nginx `ip_hash`, with the
   `@socket.io/redis-adapter` making rooms global.

The primary supervises its children: heartbeat ping/pong (an unresponsive worker is `SIGKILL`ed and
respawned), exponential-ish restart backoff, a restart budget that fails fast on a crash loop, and an
optional RSS ceiling (`WORKER_MAX_RSS_MB`) that recycles a leaking worker.

> Workers only share state through Postgres and Redis, so if neither is configured the process pins itself to
> a single worker and logs why — no silently split brain.

---

## Caching

```
get(key) ─▶ L1 LRU (per process, 5 s TTL) ──hit──▶ value
              │miss
              ▼
           Redis (shared, configurable TTL) ──hit──▶ value (+ backfill L1)
              │miss
              ▼
           loader() ── single flight ──▶ store in both tiers
```

- **Single flight** — concurrent misses for the same key await one upstream call, so a cold leaderboard
  cannot stampede the database.
- **Invalidation** — `cache.invalidate('lb:')` deletes by prefix using `SCAN` (never `KEYS`) and publishes to
  an invalidation channel so every worker drops its L1 at the same instant.
- **Bounded** — L1 is an LRU capped at `CACHE_L1_MAX_ITEMS`; Redis runs `allkeys-lru` with a memory ceiling.
- Match completion invalidates the affected players, the leaderboards and the global stats in one call.

---

## Resource management

| Resource            | How it is bounded                                                                  |
| ------------------- | ---------------------------------------------------------------------------------- |
| HTTP sockets        | keep-alive/headers/request timeouts, 64 kB body limit, per-request timeout guard     |
| Postgres            | pooled (`DB_POOL_MAX`), statement + query timeouts, transactions always released     |
| Redis               | separate clients for commands / pub-sub / adapter, retry strategy, lazy connect      |
| Game loops          | one 30 Hz scheduler per worker for *all* matches — not a timer per match             |
| Matches             | `MATCH_MAX_PER_WORKER` cap, idle timeout, reconnect grace, abort-on-abandon          |
| Memory              | LRU caches everywhere (cache, rate limiters), capped in-memory match history         |
| Event listeners     | every subscription returns an unsubscribe; intervals are `unref`ed                   |
| Shutdown            | one ordered registry: stop accepting → drain sockets → end matches → close pools     |

Graceful shutdown is deterministic: resources are torn down in priority order with a hard timeout, readiness
flips to `draining` immediately so the load balancer stops sending traffic, and `dumb-init` forwards
`SIGTERM` inside the container.

---

## Observability

- `GET /api/system` — full health report (storage, Redis, hosted matches) with per-check latency
- `GET /api/system/live` — liveness, touches no dependency
- `GET /api/system/ready` — readiness, returns 503 while draining
- `GET /api/system/runtime` — worker id, RSS/heap, hosted matches, cache occupancy
- `GET /metrics` — Prometheus: request histograms, cache hit/miss by layer, DB query timings and pool gauges,
  socket counts, matchmaking queue depth, tick duration, match outcomes
- Structured pino logs with a request id propagated through `AsyncLocalStorage` and redacted secrets

The **System** page in the UI renders all of this live.

---

## API reference

| Method  | Path                        | Auth | Description                             |
| ------- | --------------------------- | ---- | --------------------------------------- |
| `POST`  | `/api/auth/guest`           | –    | Create a guest player, returns a JWT     |
| `GET`   | `/api/auth/me`              | ✔    | Current player                           |
| `POST`  | `/api/auth/refresh`         | ✔    | Fresh token                              |
| `PATCH` | `/api/players/me`           | ✔    | Rename (409 on conflict)                 |
| `GET`   | `/api/players/:id`          | –    | Public profile                           |
| `GET`   | `/api/players/:id/matches`  | –    | Recent matches (`?limit=1..50`)          |
| `GET`   | `/api/games`                | –    | Game catalog                             |
| `GET`   | `/api/leaderboard`          | –    | `?game=all\|<id>&limit&offset`           |
| `GET`   | `/api/system[/live\|/ready\|/runtime\|/stats]` | – | Ops endpoints        |
| `GET`   | `/metrics`                  | –    | Prometheus exposition                    |

Errors are always `{ "error": { "code", "message", "details?", "requestId" } }`.

---

## Realtime protocol

Path `/realtime`, JWT passed in the socket handshake `auth.token`.

**Client → server:** `queue:join`, `queue:leave`, `match:action`, `match:resume`, `match:forfeit`,
`match:chat`, `ping` — all acknowledged with `{ ok, code?, message? }`.

**Server → client:** `session:ready`, `queue:status`, `match:found`, `match:state`, `match:presence`,
`match:over`, `match:chat`, `stats:update`, `error:notice`, `pong`.

Snapshots carry a monotonic `sequence` and `serverTime`; the client drops out-of-order packets and
extrapolates Pong between them for smooth rendering at display refresh rate. Actions are token-bucket limited
per player (`SOCKET_ACTION_RATE`/`BURST`).

---

## Configuration

Everything is validated by zod at boot — an invalid value fails fast with a readable message. See
[`.env.example`](.env.example) for the full list.

| Variable                              | Default | Notes                                       |
| ------------------------------------- | ------- | ------------------------------------------- |
| `PORT` / `HOST`                       | `4000` / `0.0.0.0` |                                  |
| `CLUSTER_WORKERS`                     | `0`     | `0` = one per core, capped                  |
| `WORKER_MAX_RSS_MB`                   | `0`     | recycle a worker above this (0 = off)       |
| `DATABASE_URL` / `REDIS_URL`          | –       | both optional; features degrade gracefully  |
| `CACHE_*`                             | see env | L1 size/TTL and per-resource TTLs           |
| `RATE_LIMIT_*` / `SOCKET_ACTION_*`    | see env | HTTP and websocket limits                   |
| `MATCH_RECONNECT_GRACE_MS`            | `20000` | disconnect window before forfeit            |
| `BOT_FILL_MS`                         | `12000` | bot opponent after this wait (0 = never)    |
| `JWT_SECRET`                          | dev val | **must** be changed in production           |

---

## Project layout

```
packages/shared/     # domain types, protocol contract, Elo, pure game engines
server/
  src/
    config/          # zod validated environment
    domain/          # services + storage drivers (postgres | memory)
    http/            # express app, middleware, routes
    infra/           # logger, lifecycle, metrics, redis, db pool, migrations, cache
    realtime/        # gateway, matchmaking, match runtime, bots, bus, presence
    main.ts          # cluster primary  ·  worker.ts — one HTTP+socket worker
  tests/             # vitest: engines, elo, cache, api, match lifecycle
frontend/
  src/
    components/      # ui kit, layout, game boards (canvas Pong)
    pages/           # lobby, play, leaderboard, profile, system
    store/           # zustand: session + arcade
    lib/             # api client, socket manager
```

## Testing & quality

```bash
npm run lint        # eslint (typescript-eslint, flat config)
npm run typecheck   # tsc --noEmit across all workspaces
npm test            # vitest — 35 tests
npm run build       # shared → server → frontend
```

A ready-to-use pipeline lives at `.github/ci.example.yml` — copy it to `.github/workflows/ci.yml` to enable
it. It runs the whole chain plus both Docker builds on every push.

---

Built with TypeScript end to end — strict mode, `noUncheckedIndexedAccess`, no `any` in application code.
