# Phase 9: the game look, play on the board, home and tutorial

Work in this order. One small change per commit, in the format in `CLAUDE.md`. Run the design-reviewer subagent before every commit that changes a screen, and the phone-tester after every screen.

## 9.0 Fold the pack into the harness

1. Link `docs/design/README.md` from `docs/design.md` and from the table at the top of `CLAUDE.md`.
2. Add rules R47 to R50 from `docs/design/tutorial.md` to `docs/rules.md`.
3. Add the U and R IDs in `spec/CHECKS-design.md` to `spec/CHECKS.md`, then delete `spec/CHECKS-design.md`.
4. Add to the "Every page must" list in `CLAUDE.md`: "Take every colour, font, radius, shadow and duration from `public/theme.css`" and "Follow `docs/design/`".
5. Mark ADRs 0006, 0007 and 0008 as "Accepted (default, pending Tejas's review)".
6. Fix the test data in the dev database: run `pnpm check` against a separate test server on another port with its own temporary data folder, so the local leaderboard only shows real games. Record it in `docs/corrections.md`.

## 9.1 Theme and preview (stop for approval)

1. Create `public/theme.css` with the tokens in `look-and-feel.md` and self-host the Fredoka font.
2. Build `/style-preview`: the title, a set of buttons in every state, a tile, a player panel with the VS ribbon and shield badge, the board with hover and tap working, the reveal looping (countdown, drop, crash, shield win) and all three end popups behind buttons.
3. **Stop.** Give Tejas the laptop and phone links to `/style-preview` and wait for approval or changes. Record his changes in the design files first, then the code.

## 9.2 The game screen

1. Play on the board (U10 to U18), replacing the column buttons and the Drop button. Update every affected test without weakening it.
2. The reveal and live feedback (U19 to U26).
3. The end popups (U27 to U30).

## 9.3 The home screen

Rebuild it to `home.md` (U31 to U40): title, demo board, player card, mode tiles, How to play, podium leaderboard and footer.

## 9.4 The tutorial

1. Rules R47 to R50 on the server, with the tests in `spec/app-tutorial.test.ts`.
2. The five steps (U41 to U48) over a practice board with a scripted computer.

## 9.5 The other screens

Restyle the quick match, waiting, leaderboard, account and `/readme/` screens to the same look, one per commit.

## 9.6 Checks

Turn every stub in `spec/unit-theme.test.ts`, `spec/app-tutorial.test.ts` and `e2e/design.spec.ts` into a real check. Run the browser checks with reduced motion on for screenshots, so animations never make them flaky.

## 9.7 Report

Update `docs/handover.md` and stop. List the commits, the corrections added and anything that needs Tejas.
