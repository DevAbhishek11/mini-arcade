# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY frontend/package.json frontend/
RUN npm ci --workspaces --include-workspace-root --ignore-scripts

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY frontend frontend
RUN npm run build -w @mini-arcade/shared && npm run build -w @mini-arcade/frontend

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime
RUN rm /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/arcade.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
