#!/usr/bin/env bash
# /visual-qa step 1 and 2: a throwaway app (see scripts/check.sh), then the screenshots of every screen and state at every
# viewport into reports/visual-qa/ (git-ignored). Prints the list of files. Never touches data-dev/.
set -uo pipefail
# A full run starts from nothing. A run of one named state only replaces that state's files, so the rest are still there to look at.
if [ $# -eq 0 ]; then rm -rf reports/visual-qa; fi
mkdir -p reports/visual-qa
CHECK_SKIP_TYPECHECK=1 CHECK_COMMAND="node scripts/visual-qa.ts $*" exec bash scripts/check.sh
