# QA checklist

Added on 28 October 2026. These are the layout and polish rules every screen must meet, each stated so it can be measured. `e2e/layout.spec.ts` checks the measurable ones on every screen at both viewports, `/visual-qa` (`.claude/commands/visual-qa.md`) checks all of them by looking at screenshots, and the design-reviewer and phone-tester use this list as their checklist. A screen is not finished until it passes every Q that applies. They sit on top of `docs/design.md` (viewports, tap targets, contrast) and `look-and-feel.md` (the toy style).

"Both viewports" means 390 x 844 (phone) and 1366 x 768 (laptop), and the checks also run at 320 x 568, the narrowest phone.

| ID | Rule | How it is measured |
| --- | --- | --- |
| **Q1** | **No layout shift.** Nothing ever expands inline and pushes other elements. Editing a nickname, joining with a code, info explanations, sign up, sign in, change password and every confirmation open in a **centred popup dialog** over a dimmed page, with a close button and Escape to close. Opening or closing one moves nothing on the page behind it. | `e2e/layout.spec.ts`: the bounding box of every element behind a popup is the same, within 1px, before it opens and while it is open. Every popup has `role="dialog"`, `aria-modal="true"`, a close button, closes on Escape and returns focus to what opened it. |
| **Q2** | **Button text never wraps.** Every button label fits on one line at both viewports. Shorten the label or widen the button instead. | A button's height is at most one line of its text plus its padding and outline. |
| **Q3** | **Boxes fit their content.** A card is only as wide as its content needs: at most 480px for forms and status messages and 560px for lists, centred. No wide boxes with short left-aligned text. | A card's width never exceeds its limit; a card holding only a short line or one control is not wider than its content plus padding. |
| **Q4** | **Consistent spacing.** At least 16px between stacked cards and buttons, and 32px between page sections. No two boxes touch. | The gap between the bottom of one card or button and the top of the next in the same column is at least 16px, and at least 32px between sections. |
| **Q5** | **Headings line up with their content.** Every page heading sits directly above its content and shares its left edge, inside the same centred column. | A heading's left edge is within 4px of the left edge of the content below it. |
| **Q6** | **One centred content column on every page.** | The page's main column is centred within 16px of the middle of the screen. |
| **Q7** | **Forms that edit an existing value are prefilled with it.** | The nickname field opens holding the current nickname. |
| **Q8** | **Controls only appear when they make sense.** Never "Sign out" for a guest, never sign-in or sign-up forms for a signed-in player. | A guest's page has no Sign out; a signed-in player's page has no sign-in or sign-up control. |
| **Q9** | **Every screen except home has a visible way to leave:** Home, Cancel or Leave game. | Every screen but `/` has a button or link named Home, Cancel, Cancel game or Leave game, on screen without scrolling at 320 x 568 where the screen fits, and reachable by tab. |
| **Q10** | **Empty states explain themselves.** An empty list says why it is empty and what to do next, in words; it is never blank or "Loading..." for ever. | Every list has text when empty. |
| **Q11** | **No page looks plain.** Every page has a header with the Rubble title and a short subtitle, and uses the toy style of `look-and-feel.md` (icons, outlined cards, hard shadows), not bare text boxes. | Every page has the title element and a subtitle line; its cards use `--outline` and `--shadow` from the theme. |

## Popups (Q1)

One popup component serves every dialog (`src/client/dialog.ts`, styled in `public/components.css`): a `--panel` card at most 480px wide, centred over a `--scrim` dim, a heading, its content and a close button (an X at least 44 by 44px) and, where there is a choice, buttons in a row that each fit on one line (Q2). Opening a popup moves focus into it; Tab stays inside it; Escape and the close button close it and put focus back where it came from; the page behind does not scroll. The page behind it is never resized or moved, because a popup is `position: fixed` and takes no space. Under reduced motion it appears with no animation. The popups are listed in `docs/design/popups.md`.

## Checks that are measured and checks that are looked at

Q1 to Q9 are measured by `e2e/layout.spec.ts`. Q10 and Q11 are judged by `/visual-qa`, which also looks at every other Q and at things a measurement cannot see (is anything cramped, does the page look finished, is any text cut off). `/visual-qa` writes its screenshots to `reports/visual-qa/` (not tracked by git) and fixes what it finds.
