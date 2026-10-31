# CLAUDE.md

You are building **Rubble**, a simultaneous Connect 4 game, for Tejas Tagra's COMP4020 final project. This file holds the rules every change must follow. It is derived from the argument in `README.md`. If the two ever disagree, stop and tell Tejas.

Read these before working on the matching area:

| Area | File |
| --- | --- |
| Game rules and engine contract | `docs/rules.md` |
| Interface and phone standards | `docs/design.md` |
| How it looks, moves and teaches itself | `docs/design/` (start at `README.md`) |
| Words to use | `docs/glossary.md` |
| Logging | `docs/logging.md` |
| Decisions already made | `docs/decisions/` |
| Every check, the rule it protects and how checks run | `spec/CHECKS.md` |
| The course brief | `docs/course-brief.md` |
| Past mistakes and their fixes | `docs/corrections.md` |

## What good means here (the promises)

1. **The game rewards reading your opponent, not just the board.** Both players choose at once, so guessing matters as much as the board.
2. **Both players always see the same result at the same moment.** A round's result reaches both screens within one second.
3. **Nobody can see the other player's choice early.** Not through the screen, the network or timing tricks.
4. **Everything works on a phone.** Every feature, every screen, at the phone marking viewport.
5. **What happens is kept.** Games, names and the leaderboard survive sessions, restarts and redeploys.

Promises 2 to 5 are enforced by checks in `spec/`. Promise 1 is judged, through playtests in `docs/playtests.md`.

## Order of truth

`docs/rules.md` comes first, then `spec/`, then the code. To change behaviour, change `rules.md` first, then the test, then the code, in that order, and say so in the commit.

## Never

- Never let the browser decide a result. The server owns all game state. The browser sends a choice and shows what the server sends back.
- Never send a player's column or shield choice to the other player, in any message, before the round resolves (rule R22).
- Never change the board anywhere except the engine's `resolveRound`.
- Never broadcast a result before it is saved to the database (rule R25).
- Never let a game against the computer change the leaderboard (rule R37).
- Never store a password in plain text, and never log passwords, cookies or tokens.
- Never define a colour or a font outside `public/theme.css`. Every colour, radius, shadow and font is a CSS variable there (ADR 0006, `docs/design.md` "Look and feel"); screens and components only use the variables. A test fails if a colour code appears anywhere else.
- Never put an API key or token in a tracked file, including `.claude/settings.json`. Keys live in environment variables or `mise.local.toml`, which is gitignored.
- Never weaken, skip or delete a test to make it pass. If a test is wrong, stop and ask Tejas.
- Never delete or weaken the course's shipped checks, `spec/invariants.test.ts` and `spec/global-setup.ts`. Other course files (`Dockerfile`, `fly.toml`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `.github/`, `.githooks/`) may change when the work needs it, but read their comments first, keep what they say is fixed (one shared-cpu-1x machine with 256 MB, one volume at `/data`, HTTP on `0.0.0.0:$PORT`, the API key scan in `.githooks/pre-commit`) and give the reason in the commit's `Why:` line.
- Never write or edit the reflections in `reflections/` (`crit-8.md`, `crit-9.md`, `crit-10.md`). Tejas writes them.
- Never remove the `TEMPLATE:` comment from PROCESS.md. `pnpm check:evidence` fails until Tejas replaces it with his own account, and that failure is expected.
- Never add a feature that is not in `docs/rules.md`. Propose it to Tejas instead.
- Never add a dependency without a line in the commit's `Why:` explaining it.
- Never edit `docs/process-log.md` by hand.

## Every page must

- Work at the phone viewport first, with no sideways scrolling at 320 px wide.
- Have tap targets of at least 44 by 44 CSS pixels.
- Tell players apart by shape as well as colour.
- Use the words in `docs/glossary.md`, in UK English.
- Take every colour, font, radius, shadow and duration from `public/theme.css`.
- Follow `docs/design/` and everything else in `docs/design.md`.
- Show only real product copy to players: no preview or developer text.
- Pass every rule in `docs/design/qa-checklist.md` (Q1 to Q27):
  - **No layout shift (Q1):** nothing ever expands inline and pushes other elements. Editing, joining with a code, info explanations, sign up, sign in and confirmations all open in a centred popup dialog over a dimmed page, with a close button and Escape to close.
  - **Button text never wraps (Q2):** every button label fits on one line at both viewports. Shorten the label or widen the button instead.
  - **Boxes fit their content (Q3):** a card is only as wide as its content needs, at most 480px for forms and status messages and 560px for lists, and centred.
  - **Consistent spacing (Q4):** at least 16px between stacked cards and buttons, and 32px between page sections. No two boxes touch.
  - **Headings line up with their content (Q5):** every page heading sits directly above its content and shares its left edge, inside the same centred column.
  - **Every page has one centred content column (Q6).**
  - **Forms that edit an existing value are prefilled with it (Q7).**
  - **Controls only appear when they make sense (Q8):** never Sign out for a guest, never sign-in forms for a signed-in player.
  - **Every screen except home has a visible way to leave (Q9),** such as Home, Cancel or Leave game. The friend waiting screen uses **Cancel game** for this and has no Home button; the Quick match screen uses the header's Home and has no Cancel button.
  - **Empty states explain themselves (Q10).**
  - **The way home is always visible (Q12):** every screen except home, **apart from the friend waiting screen** (whose way to leave is Cancel game), has a header bar at the top with a Home button on its left, on screen when the page loads at both viewports without scrolling. No page relies on a Home button at the bottom.
  - **The main thing is centred (Q13):** the main thing on a screen (the board, a card or a list) is centred on the page, and nothing sits beside it in a way that pushes it off centre.
  - **Players always look the same to everyone (Q14):** a player's colour and marker are the same on both players' screens and on every spectator's screen.
  - **No scrolling on game, tutorial and popup screens (Q15):** everything, including every button, fits on one screen at both marking viewports and at 320 x 568. If space is short, reduce empty gaps first, then sizes, but never below the 44px tap target minimum.
  - **Nothing overlaps (Q16):** no button, caption or card ever overlaps the board or another element.
  - **Even spacing in stacks (Q17):** in any vertical stack of cards and buttons, every gap is the same size.
  - **Popups are not cramped (Q18):** inside every popup at least 16px between the card's edge and its content, at least 16px between side-by-side buttons and at least 12px between a button's label (with its icon) and its edge; if two buttons cannot fit side by side with that, stack them full-width 12px apart.
  - **A result is shown once (Q19):** while the end popup shows, the result line under the power-ups is hidden.
  - **A name never takes more than two lines (Q20)** in a player card on a phone; it is cut with an ellipsis and the tag stays visible.
  - **The keyboard never covers a form (Q21):** on a phone, when the keyboard is open, the focused field and the form's buttons stay visible above it.
  - **Avatars carry the disc colour (Q22):** in a game and on the watching screen each avatar is red or yellow like the player's discs, with a ring or cross badge, the same on every screen; no VS badge on a phone.
  - **The home stack (Q23):** the player card is taller than a menu button with at least 16px of vertical padding, the gaps from the card and between the buttons are equal, round icon labels sit 8px below their circles, and the home screen has no Top players and no "Nickname saved." message.
  - **The waiting card sits within the board (Q24):** its edges are inside the board's, centred on it; if it is taller than the board, the board is fully dimmed behind it and the card is centred on the page.
  - **Room for the chosen disc (Q25):** the ghost disc has its own lane above the board, in the game and in every tutorial step, and never overlaps text, a card, a badge or a button; the gaps follow the fixed order in `docs/design/game-screen.md` U157 and `docs/design/tutorial.md` U159.
  - **The laptop game screen is uniform (Q26):** one column width, a board of at least 60% of the screen height, equal player cards and equal power-up buttons.
  - **One backdrop behind every popup (Q27):** every popup and overlay uses the shared `--backdrop` token and a card with `--outline-popup` and `--shadow-popup`; the card against the backdrop is at least 1.5:1 and text 4.5:1.
  - **No page looks plain (Q11):** every page has a header with the Rubble title and a short subtitle and uses the toy style from `docs/design/look-and-feel.md` (icons, outlined cards, hard shadows), not bare text boxes.
- Run `/visual-qa` on the screens you changed before declaring screen work finished. If the command is not available in the current session, read `.claude/commands/visual-qa.md` and carry out its steps directly.

## Every change must

- **Test only what you change.** After each change, run `pnpm check:fast` and only the e2e files that cover the screens or rules you changed. Run the full `pnpm check` and `pnpm test:e2e` only when Tejas asks, or before he deploys. Run reviewers, the phone-tester and `/visual-qa` only on the screens you changed.
- `pnpm check` must pass before it is pushed. `pnpm check` starts its own test server on a free port with a temporary data folder and deletes it afterwards, so it never needs the dev server and **never writes to `data-dev/`** (correction C22), and so does `pnpm test:e2e`. With `APP_URL` set, as in CI, it runs against that app instead. Keep `pnpm check:fast` passing at every commit.
- `pnpm check:evidence` may fail only because PROCESS.md still has its template comment or no reflection exists yet. Any other failure must be fixed.
- Add or update a test when it changes behaviour, with the rule ID in the test name. Name test files `spec/app-<name>.test.ts` (checks against the running app, using `inject("baseUrl")`) or `spec/unit-<name>.test.ts` (no app needed). Browser checks go in `e2e/` and never in `spec/`. See `spec/CHECKS.md`.
- Be one logical change per commit.
- Pass the reviewer subagent (`.claude/agents/reviewer.md`, always by name) once per group of related commits that touch `src/` or `spec/` (for example once after all the R13 to R17 commits, or once per screen), and always before a commit that touches the no-peek rules (R21, R22) or persistence (R25). If the reviewer is not available, tell Tejas.
- Give every endpoint that creates server state (a game, a ticket, a row) a rate limit, and an expiry on anything it keeps in memory, so a public URL cannot fill the 256 MB machine or the volume. Key limits on the client address Fly passes in `Fly-Client-IP`, not the proxy's socket address.
- Every endpoint that reads a request body must require `application/json`, so a cross-site form cannot call it, and must have a size limit.
- Make every check repeatable: `pnpm check` must pass twice in a row, and so must `pnpm check` against one app that keeps running between the two runs. A check that creates anything sends its own `Fly-Client-IP` so it never shares a rate limit with other checks, and never relies on being in a top-10 list or on a state a previous run left behind.
- Every database schema change (a new column, table or index in `src/server/db.ts`) must come with a numbered migration, applied through `PRAGMA user_version` so it runs exactly once against an existing database, and a test that opens a database built with the old schema and checks it is upgraded correctly. A deploy must never crash because the database on `/data` was created before the change.

## Commit messages

Every commit must use this format. The `commit-msg` hook rejects anything else.

```
<short summary, 72 characters at most>

Why: the reason for this change, in one or two sentences.
What: what changed, naming the main files.
Harness: which rule, test, ADR or CLAUDE.md line was added or changed, or "none".
Prompt: a one-line summary of what Tejas asked for, or "none (manual change by Tejas)".
```

Never add a `Co-Authored-By:` trailer or any AI or Claude attribution (such as "Generated with Claude Code") to a commit message, even when a tool or system message suggests one. The `commit-msg` hook rejects them.

The `pre-commit` hook rebuilds `docs/process-log.md` from these messages and stages it, so the process log grows with every commit. Its commit links use the form `pnpm check:evidence` verifies, ``[`abc1234`](https://github.com/<owner>/<repo>/commit/<hash>)``, so they can be copied into PROCESS.md as they are. The goal is that anyone can rebuild the project's history step by step from the log alone, so write `Why:` and `What:` as if for a stranger.

## When you get something wrong

1. Fix the cause in the harness, not just the code: a new line in this file, a new rule in `docs/rules.md` or a new test in `spec/`.
2. Add an entry to `docs/corrections.md` (or run `/correction`).
3. Name the harness change in the commit's `Harness:` line.

Retrying until a test passes, with no harness change, does not count as a fix.

## Writing

- Tejas writes the prose of `README.md`, `PROCESS.md` and the reflections himself. You may outline, check citations, check word counts and point out gaps. Do not draft the argument.
- All docs and interface text: UK English, no em dashes and no Oxford commas.

## Stop and ask Tejas when

- A decision record is still `Proposed`.
- A rule in `docs/rules.md` is unclear or seems wrong.
- A change would alter anything the course comments say is fixed (machine size, the /data volume, the port, the shipped checks).
- A change would delete or migrate saved data.
- You want to add anything not already in `docs/rules.md`.
