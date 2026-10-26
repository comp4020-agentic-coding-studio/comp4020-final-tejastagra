# Mutation scores

`pnpm test:mutation` plants small bugs in `src/engine/` (for example turning `>=` into `>`) and checks whether the tests catch them. The score is the share of planted bugs caught. Record every run here so PROCESS.md can show the tests getting stronger over time.

| Date | Commit | Score | Survived mutants worth noting | Tests added in response |
| --- | --- | --- | --- | --- |
