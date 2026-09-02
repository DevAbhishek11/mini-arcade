# RUNNING.md — how to run Mini Arcade

Everything you need to get the project running, from a bare machine to a scaled
Docker stack, plus how to test it, debug it and deploy it.

If you only read one thing:

```bash
npm install
npm run build -w @mini-arcade/shared
npm run dev
# API  → http://localhost:4000
# Web  → http://localhost:5173
```

---

## Contents

1. [Requirements](#1-requirements)
2. [First-time setup](#2-first-time-setup)
3. [Running in development](#3-running-in-development)
4. [Running with Redis and Postgres](#4-running-with-redis-and-postgres)
5. [Running the full Docker stack](#5-running-the-full-docker-stack)
6. [Running a production build by hand](#6-running-a-production-build-by-hand)
7. [Environment variables](#7-environment-variables)
8. [Database migrations](#8-database-migrations)
9. [Testing, linting and type checking](#9-testing-linting-and-type-checking)
10. [Verifying it works](#10-verifying-it-works)
11. [Playing offline and installing the app](#11-playing-offline-and-installing-the-app)
12. [Every npm script](#12-every-npm-script)
13. [Project layout](#13-project-layout)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Requirements

| Tool           | Version                          | Needed for                      |
| -------------- | -------------------------------- | ------------------------------- |
| Node.js        | **≥ 20.10** (22 LTS recommended) | Everything                      |
| npm            | ≥ 10                             | Workspaces                      |
| Docker Engine  | ≥ 24 (optional)                  | The full stack, Redis, Postgres |
| Docker Compose | v2 (optional)                    | `docker compose` commands       |

Check what you have:

```bash
node -v && npm -v && docker -v && docker compose version
```

**Nothing else is required.** Redis and Postgres are optional — without them the
server automatically falls back to an in-memory cache and store and tells you so
in the logs.

---

## 2. First-time setup

```bash
git clone https://github.com/DevAbhishek11/mini-arcade.git
cd mini-arcade

npm install                            # installs all workspaces at once
npm run build -w @mini-arcade/shared   # the server and web app consume built types
cp .env.example .env                   # optional — sane defaults are built in
```

> **Why build `shared` first?** `packages/shared` holds the game engines, the
> bot AI and the wire protocol. Both the server and the browser import the
> compiled output, so a fresh clone needs it built once. After that,
> `npm run dev` keeps it in sync.

---

## 3. Running in development

### Everything at once

```bash
npm run dev
```

| Service | URL                              | Notes                                            |
| ------- | -------------------------------- | ------------------------------------------------ |
| API     | http://localhost:4000            | tsx watch, restarts on save                      |
| Web app | http://localhost:5173            | Vite HMR, proxies `/api` and `/realtime` to 4000 |
| Metrics | http://localhost:4000/metrics    | Prometheus exposition                            |
| Health  | http://localhost:4000/api/system | Full health report                               |

### One service at a time

```bash
npm run dev:server    # API only
npm run dev:web       # Web app only (expects an API on :4000)
```

Point the web app at a different API:

```bash
VITE_API_PROXY=http://192.168.1.50:4000 npm run dev:web
```

### Watching the shared package

Editing a game engine? Rebuild it in a third terminal so both sides pick it up:

```bash
cd packages/shared && npx tsc -p tsconfig.json --watch
```

---

## 4. Running with Redis and Postgres

Optional, but it unlocks clustering, durable data and cross-worker rooms.

**Start just the infrastructure:**

```bash
docker compose up -d redis postgres
```

**Point the server at them:**

```bash
# .env
DATABASE_URL=postgres://arcade:arcade@localhost:5432/arcade
REDIS_URL=redis://localhost:6379
CLUSTER_WORKERS=2
```

```bash
npm run dev:server
```

You should now see `storage: postgres`, `cache: redis` and two workers in the
boot logs instead of the in-memory warnings.

> Clustering is deliberately clamped to a single worker unless **both**
> `DATABASE_URL` and `REDIS_URL` are set — otherwise workers cannot share state
> and you would get inconsistent matchmaking.

---

## 5. Running the full Docker stack

```bash
npm run docker:up          # docker compose up -d --build
```

This starts nginx, three API replicas, Redis and Postgres:

```
http://localhost:8080      # the whole app behind nginx
```

| Command                              | What it does                               |
| ------------------------------------ | ------------------------------------------ |
| `npm run docker:up`                  | Build and start everything                 |
| `npm run docker:logs`                | Tail all container logs                    |
| `npm run docker:down`                | Stop and remove containers **and volumes** |
| `docker compose up -d --scale api=5` | Run five API replicas                      |
| `docker compose ps`                  | Show container health                      |
| `docker compose restart api`         | Rolling restart of the API only            |

nginx uses `ip_hash` so a websocket stays pinned to one replica, and the Redis
socket.io adapter fans events out across all of them.

**Before deploying anywhere real, change the secret:**

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d
```

---

## 6. Running a production build by hand

```bash
npm run build            # shared → server → frontend
```

Outputs:

- `packages/shared/dist` — compiled engines, AI and protocol
- `server/dist` — compiled server, including the `.sql` migrations
- `frontend/dist` — static site plus `sw.js` and `manifest.webmanifest`

Run the compiled server:

```bash
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) node server/dist/main.js
```

Serve the built web app (any static host works — the SPA needs a fallback to
`index.html`):

```bash
npm run preview -w @mini-arcade/frontend    # http://localhost:4173
```

The service worker is only generated in a production build, so **use the preview
server (or Docker) to test PWA install and offline mode** — not `npm run dev`.

---

## 7. Environment variables

Every value is validated with zod at boot; an invalid one fails fast with a
readable message. Full list in [`.env.example`](.env.example).

| Variable               | Default                 | Purpose                                                |
| ---------------------- | ----------------------- | ------------------------------------------------------ |
| `NODE_ENV`             | `development`           | `production` enables stricter defaults                 |
| `PORT`                 | `4000`                  | HTTP + websocket port                                  |
| `HOST`                 | `0.0.0.0`               | Bind address                                           |
| `CLUSTER_WORKERS`      | `0` (= auto)            | Cluster workers; clamped to 1 without Redis + Postgres |
| `DATABASE_URL`         | _(unset)_               | Postgres connection string; omit for in-memory         |
| `DB_POOL_MAX`          | `10`                    | Pool size per worker                                   |
| `REDIS_URL`            | _(unset)_               | Redis for cache, pub/sub, rooms and the socket adapter |
| `JWT_SECRET`           | dev value               | **Must** be changed in production                      |
| `JWT_TTL_SECONDS`      | `604800`                | Guest token lifetime                                   |
| `CORS_ORIGINS`         | `*` in dev              | Comma separated allowlist                              |
| `CACHE_L1_MAX_ITEMS`   | `5000`                  | Per-process LRU size                                   |
| `SOCKET_ACTION_RATE`   | `20`                    | Actions per second per player                          |
| `SOCKET_ACTION_BURST`  | `40`                    | Token bucket burst                                     |
| `BOT_FILL_MS`          | `12000`                 | Wait before a bot fills a quiet queue                  |
| `MATCH_MAX_PER_WORKER` | `500`                   | Hosted match cap per worker                            |
| `RATE_LIMIT_MAX`       | `120`                   | HTTP requests per window                               |
| `LOG_LEVEL`            | `info`                  | pino level                                             |
| `VITE_API_URL`         | _(same origin)_         | Build-time API base for the web app                    |
| `VITE_API_PROXY`       | `http://127.0.0.1:4000` | Dev-only proxy target                                  |

---

## 8. Database migrations

Migrations live in `server/src/infra/db/migrations` and run **automatically on
boot** behind a Postgres advisory lock, so it is safe to start many replicas at
once. Run them manually with:

```bash
npm run migrate -w @mini-arcade/server
```

| File                  | Contents                                      |
| --------------------- | --------------------------------------------- |
| `001_init.sql`        | players, matches, match participants, indexes |
| `002_progression.sql` | XP, levels, streaks, quests, achievements     |

With no `DATABASE_URL` the in-memory driver is used and migrations are skipped —
handy for demos, useless for persistence.

---

## 9. Testing, linting and type checking

```bash
npm test              # every workspace: 223 tests
npm run test:server   # server + shared engines, AI, progression, rooms, cache, API
npm run test:web      # browser-env tests: offline match runner, solo stats, session
npm run typecheck     # tsc --noEmit everywhere
npm run lint          # eslint (flat config, typescript-eslint)
npm run lint:fix
npm run format        # prettier
```

Watch mode while developing:

```bash
npm run test:watch -w @mini-arcade/server
npm run test:watch -w @mini-arcade/frontend
```

What is covered:

| Suite                            | Focus                                                         |
| -------------------------------- | ------------------------------------------------------------- |
| `server/tests/engines`           | Original three engines: legality, immutability, outcomes      |
| `server/tests/new-engines`       | Gomoku, Reversi, Dots & Boxes, Snake Duel + registry coverage |
| `server/tests/bot`               | AI legality in every game, unbeatable brutal, no stalemates   |
| `server/tests/progression`       | XP curve, quests, streaks, achievements, practice discount    |
| `server/tests/rooms`             | Codes, capacity, readiness, host promotion, lifecycle         |
| `server/tests/matchmaking`       | Rating windows and pairing                                    |
| `server/tests/cache`             | L1/L2, single flight, invalidation                            |
| `server/tests/api`               | HTTP contract, auth, progression endpoints                    |
| `frontend/tests/local-match`     | Offline runner: legality, bot play, pass-and-play, cleanup    |
| `frontend/tests/solo-stats`      | Offline records, streaks, corrupted storage recovery          |
| `frontend/tests/session-offline` | Boots into offline mode when the API is unreachable           |

---

## 10. Verifying it works

**Health and readiness**

```bash
curl localhost:4000/api/system        # full report with per-check latency
curl localhost:4000/api/system/live   # liveness, touches no dependency
curl localhost:4000/api/system/ready  # 503 while draining
curl localhost:4000/api/system/runtime
curl localhost:4000/metrics | head
```

**Accounts**

```bash
# register
curl -s -X POST localhost:4000/api/auth/register -H 'content-type: application/json' \
  -d '{"nickname":"neon_fox","email":"neon@example.com","password":"arcade2026"}'

# log in with the email or the nickname
curl -s -X POST localhost:4000/api/auth/login -H 'content-type: application/json' \
  -d '{"identifier":"neon_fox","password":"arcade2026"}'
```

**A guest session and a game list**

```bash
curl localhost:4000/api/games | head -c 200

TOKEN=$(curl -s -X POST localhost:4000/api/auth/guest \
  -H 'content-type: application/json' -d '{}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')

curl -s localhost:4000/api/auth/me       -H "authorization: Bearer $TOKEN"
curl -s localhost:4000/api/progress/me   -H "authorization: Bearer $TOKEN"
curl -s "localhost:4000/api/leaderboard?game=all&limit=5"
```

**A real match, end to end** — open http://localhost:5173 in two browser
windows (use one private window so you get two guest identities):

0. Sign up, or press **Play as guest** on the welcome screen.
1. Both open the same cabinet and press **Find a match** → you get paired.
2. Or: one presses **Friend → Create room**, copies the code, the other pastes
   it into the lobby box.
3. Play a move in one window and watch it appear instantly in the other.
4. Finish the match and check the XP summary on the result screen.

**Single player, no second window needed:** open **Solo** in the header, pick
_vs Computer_ or _Pass & play_, and hit start.

---

## 11. Playing offline and installing the app

Offline mode is real: the game engines and the bot live in
`packages/shared`, so the browser can run a complete match with no server.

**Try it:**

```bash
npm run build
npm run preview -w @mini-arcade/frontend     # http://localhost:4173
```

1. Load the page once (the service worker precaches the app shell and artwork).
2. Open DevTools → **Network → Offline**, or turn off your wifi.
3. Reload. The app still boots, shows an offline banner and `/solo/...` plays
   normally. Results are stored in `localStorage` under
   `mini-arcade.solo-stats.v1`.

**Install it:** Chrome/Edge show an install icon in the address bar; the app
also offers an install card on the lobby. On iOS use Share → _Add to Home
Screen_. Installed, it launches standalone with the arcade icon and the two app
shortcuts (_Play offline_, _Leaderboard_).

**Resetting the service worker during development:** DevTools →
Application → Service Workers → _Unregister_, then hard reload. The nginx config
already sends `no-store` for `/sw.js` so deployed clients always see new builds.

---

## 12. Every npm script

**Root**

| Script                 | Does                              |
| ---------------------- | --------------------------------- |
| `npm run dev`          | API + web app together            |
| `npm run dev:server`   | API only                          |
| `npm run dev:web`      | Web app only                      |
| `npm run build`        | shared → server → frontend        |
| `npm test`             | All test suites in all workspaces |
| `npm run test:server`  | Server suite only                 |
| `npm run test:web`     | Frontend suite only               |
| `npm run typecheck`    | Types across all workspaces       |
| `npm run lint`         | ESLint                            |
| `npm run lint:fix`     | ESLint with `--fix`               |
| `npm run format`       | Prettier write                    |
| `npm run format:check` | Prettier check (what CI runs)     |
| `npm run docker:up`    | Full stack up                     |
| `npm run docker:down`  | Full stack down, volumes removed  |
| `npm run docker:logs`  | Tail container logs               |

**Server workspace** (`-w @mini-arcade/server`)

| Script    | Does                                         |
| --------- | -------------------------------------------- |
| `dev`     | `tsx watch src/main.ts`                      |
| `build`   | `tsc` + copies `.sql` migrations into `dist` |
| `start`   | `node dist/main.js`                          |
| `migrate` | Run migrations against `DATABASE_URL`        |
| `test`    | vitest run                                   |
| `clean`   | Remove `dist`                                |

**Frontend workspace** (`-w @mini-arcade/frontend`)

| Script    | Does                                                |
| --------- | --------------------------------------------------- |
| `dev`     | Vite dev server with API proxy                      |
| `build`   | Type check + Vite build + service worker generation |
| `preview` | Serve the production build on :4173                 |
| `test`    | vitest run (happy-dom)                              |

---

## 13. Project layout

```
mini-arcade/
├── packages/shared/          # the single source of truth for game logic
│   └── src/
│       ├── games/            # 7 pure engines + registry
│       ├── ai/bot.ts         # opponent AI (server AND browser use this)
│       ├── domain.ts         # catalog, ids, how-to-play copy
│       ├── progression.ts    # XP curve, quests, achievements
│       └── protocol.ts       # every socket event and payload
├── server/
│   └── src/
│       ├── config/           # zod validated environment
│       ├── domain/           # services + storage drivers (postgres | memory)
│       ├── http/             # express app, middleware, routes
│       ├── infra/            # logger, lifecycle, metrics, redis, db, cache
│       ├── realtime/         # gateway, handlers, matchmaking, rooms, matches
│       ├── main.ts           # cluster primary
│       └── worker.ts         # one HTTP + socket worker
├── frontend/
│   ├── public/art|icons/     # generated artwork and PWA icons
│   └── src/
│       ├── components/       # ui kit, layout, boards, progress, pwa
│       ├── pages/            # lobby, play, solo, leaderboard, achievements…
│       ├── lib/              # api, socket, sound, local-match, solo-stats
│       └── store/            # zustand: session, arcade, progression, toasts
├── docker-compose.yml        # nginx + api replicas + redis + postgres
├── README.md                 # what the project is and how it is built
└── RUNNING.md                # you are here
```

---

## 14. Troubleshooting

**`Cannot find module '@mini-arcade/shared'`**
The shared package has not been built: `npm run build -w @mini-arcade/shared`.

**Port 4000 or 5173 already in use**

```bash
lsof -ti:4000 | xargs -r kill      # or PORT=4100 npm run dev:server
```

**`clustering disabled: set DATABASE_URL and REDIS_URL`**
Expected without infrastructure. Set both to enable multiple workers.

**`using in-memory storage — data is not durable across restarts`**
Also expected without `DATABASE_URL`. Players and matches vanish on restart.

**Websocket keeps reconnecting behind a proxy**
The proxy must forward `Upgrade`/`Connection` headers and use sticky sessions.
See `frontend/nginx.conf` for a working configuration.

**Changes to a game engine are not visible**
Rebuild the shared package (or run its `tsc --watch`). The server watcher only
sees `packages/shared/dist`.

**The service worker serves an old build**
Hard reload, or DevTools → Application → Service Workers → _Unregister_. In
production, `/sw.js` is served with `no-store` and the app shows a "new version
available" prompt.

**No sound**
Browsers block audio until you interact with the page — click anything once.
The 🔊 toggle in the header stores its state in `localStorage`.

**Docker build fails on `npm ci`**
Delete `package-lock.json` drift with a clean `npm install` on the host, then
rebuild: `docker compose build --no-cache`.

**Postgres connection refused in Docker**
The API waits for the healthcheck; `docker compose logs postgres` will show
whether the volume is initialising. `npm run docker:down` clears volumes.
