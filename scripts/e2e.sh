#!/usr/bin/env bash
# `pnpm test:e2e`: the browser checks against a throwaway app (see scripts/check.sh), so they never write to the
# dev database in data-dev/ (correction C22). Extra arguments (a file, -g "a name") go to Playwright as given.
set -uo pipefail
ARGS=""
for arg in "$@"; do ARGS="$ARGS $(printf '%q' "$arg")"; done
CHECK_SKIP_TYPECHECK=1 CHECK_COMMAND="pnpm exec playwright test$ARGS" exec bash scripts/check.sh
