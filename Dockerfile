# syntax = docker/dockerfile:1

# Taskflow: plain Node.js (no framework), ws for realtime, node:sqlite for
# persistence (built into Node 24, so no native-module build step here).
# Serves HTTP on 0.0.0.0:$PORT (fly.toml sets PORT) and publishes README.md
# at /readme/ (spec/README.md says what's checked).
FROM node:24-slim

WORKDIR /app

# Install prod deps only, using the lockfile for a reproducible build.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate \
    && pnpm install --prod --frozen-lockfile

COPY src ./src
COPY public ./public
COPY README.md ./README.md

# /data is the Fly volume mount (see fly.toml) -- the only storage that
# survives a restart or redeploy.
RUN mkdir -p /data
ENV DB_PATH=/data/taskflow.db

EXPOSE 8080
CMD ["node", "src/server.ts"]
