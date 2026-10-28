# syntax = docker/dockerfile:1

# The real app (ADR 0001): Node 24 runs src/server/index.ts directly, type
# stripping it as it goes (tsconfig.json's erasableSyntaxOnly keeps every
# file within what that can do), so there is no build step. Serves HTTP on
# 0.0.0.0:$PORT, publishes README.md at /readme/ (rendered, not verbatim;
# spec/invariants.test.ts checks its headings), and persists games to the
# SQLite file at /data/rubble.db, the Fly volume mounted in fly.toml.

# Pinned to the Node version mise.toml pins locally, so the image and local
# dev run the same runtime.
FROM node:24.21.0-slim

WORKDIR /app

# A lockfile-only install first means this layer is only rebuilt when
# dependencies change, not on every source edit. pnpm-workspace.yaml allows
# esbuild's postinstall, which fetches its native binary. pnpm is pinned to
# the version mise.toml pins locally, so the lockfile is read by the same
# pnpm that writes it in development.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable \
    && corepack prepare pnpm@11.9.0 --activate \
    && pnpm install --prod --frozen-lockfile \
    && pnpm store prune

COPY src ./src
# The admin's password reset (docs/admin.md, ADR 0013) runs on the machine with `flyctl ssh console`, so it ships in the image.
COPY scripts/admin-reset-password.ts ./scripts/admin-reset-password.ts
COPY public ./public
COPY README.md ./README.md

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server/index.ts"]
