# ---------- base ----------
FROM node:22-alpine AS base
ENV PNPM_HOME=/usr/local/bin
WORKDIR /app
RUN apk add --no-cache dumb-init

# ---------- dependencies ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY frontend/package.json frontend/
RUN npm ci --workspaces --include-workspace-root --ignore-scripts

# ---------- build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY server server
RUN npm run build -w @mini-arcade/shared \
 && npm run build -w @mini-arcade/server

# ---------- production dependencies only ----------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace @mini-arcade/server --include-workspace-root --ignore-scripts \
 && npm cache clean --force

# ---------- runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=384" \
    PORT=4000
WORKDIR /app

RUN apk add --no-cache dumb-init curl \
 && addgroup -g 1001 -S arcade \
 && adduser -u 1001 -S arcade -G arcade

COPY --from=prod-deps --chown=arcade:arcade /app/node_modules ./node_modules
COPY --from=prod-deps --chown=arcade:arcade /app/package.json ./package.json
COPY --from=build --chown=arcade:arcade /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=arcade:arcade /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=arcade:arcade /app/server/dist ./server/dist
COPY --from=build --chown=arcade:arcade /app/server/package.json ./server/package.json
# migrations are plain .sql and are not emitted by tsc
COPY --from=build --chown=arcade:arcade /app/server/src/infra/db/migrations ./server/dist/infra/db/migrations

USER arcade
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/system/ready || exit 1

# dumb-init makes PID 1 forward SIGTERM so graceful shutdown actually runs
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/dist/main.js"]
