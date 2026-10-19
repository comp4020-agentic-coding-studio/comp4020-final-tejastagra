# syntax = docker/dockerfile:1

# Node 24's built-in --experimental-strip-types runs src/server.ts directly,
# no build step. node:sqlite needs Node 22.5+ (we're on 24), ws is a pure-JS
# dependency, so pnpm install --prod needs no compiler toolchain.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate \
    && pnpm install --prod --frozen-lockfile

FROM node:24-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY README.md ./README.md

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/server.ts"]
