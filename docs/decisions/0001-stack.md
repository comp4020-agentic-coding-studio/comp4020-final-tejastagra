# 0001. Stack

- **Status:** Accepted (default, pending Tejas's review)
- **Decided by:** Tejas

## Context

`fly.toml` fixes one shared-cpu-1x machine with 256 MB of memory, one volume at `/data` and HTTP on `0.0.0.0:$PORT` (8080). The course repo already runs Node 24 and pnpm 11 through `mise.toml`, with TypeScript and Vitest for the shipped checks. The placeholder `Dockerfile` (busybox serving static files) is meant to be replaced. The stack must make promises 2 (same result at the same moment) and 5 (what happens is kept) easy to keep and quick to test.

## Options

1. **TypeScript on Node 24 for server and browser.** Node 24 runs `.ts` files directly by stripping types, so the server needs no build step, and the repo's `tsconfig.json` already expects this. WebSockets with the `ws` library. SQLite on `/data` using Node's built-in `node:sqlite`, which needs no native build in Docker, with `better-sqlite3` as the fallback if it falls short. The browser code bundled with esbuild, which is already installed as part of Vitest. One language everywhere, so the engine is written and tested once and shared.
2. **The same server with a React or Svelte front end.** Faster interface work. Cost: a bigger bundle on phones, more memory at build time and more for the agent to get wrong.
3. **A hosted real-time database (for example Supabase or Firebase).** Real time comes for free. Cost: the course comments say a separate database is outside the setup, and rules living outside our server make the no-peeking promise (R22) much harder to guarantee.

## Decision

Option 1. The `Dockerfile` becomes a `node:24` slim image that installs production dependencies, bundles the browser code and runs the server with `node src/server/index.ts`.

## Reasons (Tejas to write)

## What it costs

Type stripping only allows syntax it can erase, so no enums, namespaces or parameter properties (`erasableSyntaxOnly` in `tsconfig.json` enforces this). `node:sqlite` is newer than `better-sqlite3`. Plain TypeScript interfaces mean more care over phone layout. Everything must fit in 256 MB. Revisit if interface work becomes the bottleneck.

## Evidence

To be added once accepted.
