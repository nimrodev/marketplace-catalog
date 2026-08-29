# No platform pin here: docker-compose.yml sets `platform: linux/arm64` on
# the prod api service (build target of this file) so the output always
# matches the Graviton (arm64) EC2 deploy target, regardless of what CPU
# actually builds it (e.g. an amd64 GitHub Actions runner) — mismatching
# either way fails with `exec format error`, only at deploy time. Dev usage
# of this same file (docker-compose.dev.yml) has no pin and just builds
# native, since dev containers never deploy anywhere.
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

# Node's default max-old-space-size is a heuristic based on available RAM,
# not swap — on the t4g.micro (~900MB RAM + 2GB swap, see infra/README.md)
# that default is too conservative and pnpm's own install/deploy steps hit
# a V8 heap OOM (not a kernel OOM-kill) well before running out of actual
# (swap-backed) memory. Raised explicitly since swap now gives the OS
# somewhere to page cold memory to.
ENV NODE_OPTIONS=--max-old-space-size=1536

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
# Shared with caddy.Dockerfile's identical install (same id) — package
# content downloaded for one image is reused by the other instead of
# re-fetched, which is what was turning one deploy into two full installs.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store

FROM deps AS build
COPY . .
RUN pnpm --filter @marketplace/shared build
RUN pnpm --filter @marketplace/api build
RUN pnpm --filter @marketplace/api deploy --prod --legacy /prod/api

FROM base AS api
WORKDIR /app
COPY --from=build /prod/api .
EXPOSE 3000
CMD ["node", "dist/main.js"]
