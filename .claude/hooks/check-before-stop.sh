#!/usr/bin/env bash
# Runs the fast checks before Claude finishes a reply. If they fail, Claude is told to fix them
# or explain to Tejas why the failure is expected. Blocks once only, to avoid loops.
input="$(cat)"
active=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).stop_hook_active===true))}catch{process.stdout.write("false")}})')
[ "$active" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
# Skip until the check:fast script exists (Phase 0).
node -e 'const p=require("./package.json");process.exit(p.scripts&&p.scripts["check:fast"]?0:1)' 2>/dev/null || exit 0

if ! out=$(pnpm -s check:fast 2>&1); then
  echo "Fast checks are failing. Fix them before finishing, or tell Tejas plainly why the failure is expected (for example, tests written before the code). Last lines of output:" >&2
  printf '%s\n' "$out" | tail -n 40 >&2
  exit 2
fi
exit 0
