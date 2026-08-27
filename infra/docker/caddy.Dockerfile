# No platform pin *here* — docker-compose.yml pins the caddy service to
# linux/arm64, which applies to every unpinned FROM in this file, including
# the final caddy:2-alpine stage. An unpinned `docker build` resolves each
# FROM to the *build machine's* architecture, not the deploy target, so
# without that compose-level pin this would silently produce the wrong
# arch on any build host that isn't itself arm64 (e.g. CI).
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @marketplace/shared build
RUN pnpm --filter @marketplace/web build

FROM caddy:2-alpine AS caddy
COPY --from=build /repo/apps/web/dist /usr/share/caddy
COPY infra/docker/Caddyfile /etc/caddy/Caddyfile
