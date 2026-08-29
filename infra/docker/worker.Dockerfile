# See api.Dockerfile for the platform-pin reasoning — identical here,
# same Graviton (arm64) EC2 deploy target, pinned at the compose level.
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

# Same OOM reasoning as api.Dockerfile — pnpm's install/deploy steps need
# more V8 heap than the t4g.micro's default heuristic allows.
ENV NODE_OPTIONS=--max-old-space-size=1536

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
# Shared with api.Dockerfile/caddy.Dockerfile's identical install (same
# id) — package content downloaded for one image is reused by the others.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store

FROM deps AS build
COPY . .
RUN pnpm --filter @marketplace/shared build
RUN pnpm --filter @marketplace/worker build
# --prefer-offline: the install above already resolved and fetched this
# exact lockfile's full graph into the shared store, so deploy shouldn't
# need the registry again — prefer-offline (not offline) because pnpm's
# metadata mirror cache lives outside this cache mount and isn't
# guaranteed warm, unlike the tarball store itself.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,sharing=locked \
    pnpm --filter @marketplace/worker deploy --prod --legacy --prefer-offline --store-dir=/pnpm-store /prod/worker

FROM base AS worker
WORKDIR /app
COPY --from=build /prod/worker .
CMD ["node", "dist/main.js"]
