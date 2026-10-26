Run the multi-user test session from docs/testing/multi-user-test-plan.md.

1. Check that the server emits every event in docs/logging.md. If any is missing, add it, with a test in spec/unit-logging.test.ts, and commit before continuing.
2. Deploy and confirm a `server_start` line appears in `mise exec -- flyctl logs`.
3. Tell Tejas the session is ready and list scenarios a to h. Wait for him to run each one with real people.
4. After each scenario, save the logs with `mise exec -- flyctl logs --no-tail > docs/testing/logs/<date>-session.log` and help him fill in that section of docs/testing/multi-user-test-report.md with the expected behaviour, what was observed and the matching log lines.
5. Turn every failure into an entry in docs/corrections.md with a harness fix.
6. After scenario g, scale back with `mise exec -- flyctl scale count 1`.
