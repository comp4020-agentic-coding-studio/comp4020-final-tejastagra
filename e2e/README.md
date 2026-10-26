# Browser checks (Playwright)

Phone layout checks E1, E4, E5 and E6 from `spec/CHECKS.md` live here as `*.spec.ts`. They run only with `pnpm test:e2e`, never in `pnpm check`, so CI does not need a browser.

Set the two marking viewports in `playwright.config.ts` once confirmed from the assessment page. Until then use 390 x 844 and 1366 x 768, plus a 320 px wide run. Use two browser contexts with no shared cookies for anything multi-user. Select elements by the `data-testid` values in `docs/design.md`.
