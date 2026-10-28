#!/usr/bin/env bash
# `pnpm check`: the typecheck, then every spec/ test against a throwaway app.
#
# The app is started here, on a free port, with its own empty data folder that is deleted afterwards, so a
# test run NEVER writes to data-dev/ (the dev server's database) and never needs the dev server running
# (correction C22). With APP_URL set, as CI does against the Docker image, nothing is started and the tests
# run against that app as it is.
#
# For the checks themselves, CHECK_COMMAND replaces the test command and CHECK_SKIP_TYPECHECK skips the typecheck.
set -uo pipefail

if [ -z "${CHECK_SKIP_TYPECHECK:-}" ]; then
  pnpm typecheck || exit $?
fi

COMMAND="${CHECK_COMMAND:-pnpm test}"

if [ -n "${APP_URL:-}" ]; then
  # Someone else owns this app (CI's container): use it as it is.
  bash -c "$COMMAND"
  exit $?
fi

DATA="$(mktemp -d "${TMPDIR:-/tmp}/rubble-check-XXXXXX")"
LOG="$DATA/server.log"
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$SERVER_PID" ] && wait "$SERVER_PID" 2>/dev/null
  rm -rf "$DATA"
}
trap cleanup EXIT INT TERM

# A free port, asked of the operating system, so two runs never collide and the dev server's 8080 is never used.
PORT="$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")"

export CHECK_DB_PATH="$DATA/rubble.db"
PORT="$PORT" RUBBLE_DB_PATH="$DATA/rubble.db" node src/server/index.ts >"$LOG" 2>&1 &
SERVER_PID=$!

UP=""
for _ in $(seq 1 100); do
  if curl -sf "http://localhost:$PORT/" >/dev/null 2>&1; then UP=1; break; fi
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.2
done
if [ -z "$UP" ]; then
  echo "the test server did not start; its output:" >&2
  tail -20 "$LOG" >&2
  exit 1
fi

APP_URL="http://localhost:$PORT" bash -c "$COMMAND"
STATUS=$?
if [ "$STATUS" -ne 0 ] && [ -z "${CHECK_COMMAND:-}" ]; then
  echo "--- test server log (last lines)" >&2
  tail -15 "$LOG" >&2
fi
exit "$STATUS"
