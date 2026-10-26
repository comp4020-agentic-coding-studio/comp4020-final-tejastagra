# Mutation scores

`pnpm test:mutation` plants small bugs in `src/engine/` (for example turning `>=` into `>`) and checks whether the tests catch them. The score is the share of planted bugs caught. Record every run here so PROCESS.md can show the tests getting stronger over time.

| Date | Commit | Score | Survived mutants worth noting | Tests added in response |
| --- | --- | --- | --- | --- |
| 2026-10-26 | cc449b8 | 90.57% (189 killed, 3 timeout, 20 survived) | Nothing tests player B symmetrically (shield win, B winning, invalid B choice); falling diagonal [1,-1] and line-scan bounds untested; error message text untested | Next commit: B-side and diagonal tests |
