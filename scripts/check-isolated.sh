#!/usr/bin/env bash
# Runs `pnpm check` against a throwaway server on its own port with its own empty
# data folder, as CI does with the Docker image. The shared dev database (which
# `pnpm dev` uses) never sees the test games, so the local leaderboard only
# shows real play. Usage: pnpm check:isolated
set -euo pipefail
PORT="${ISOLATED_PORT:-18090}"
DATA="$(mktemp -d)"
LOG="$(mktemp)"
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$DATA" "$LOG"; }
trap cleanup EXIT
PORT="$PORT" RUBBLE_DB_PATH="$DATA/rubble.db" node src/server/index.ts >"$LOG" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do
  curl -sf "http://localhost:$PORT/" >/dev/null && break
  sleep 0.2
done
APP_URL="http://localhost:$PORT" pnpm check || { echo "--- server log"; tail -20 "$LOG"; exit 1; }
