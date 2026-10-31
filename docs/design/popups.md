# Popups

Added on 28 October 2026 for the layout rule Q1 (`qa-checklist.md`): nothing opens inline and pushes the page. Every dialog is one popup, built by one component (`src/client/dialog.ts`), so they all look and behave alike.

## The component

- **U85** A popup is a `--panel` card with the `--outline` and `--shadow`, at most 480px wide and never wider than the screen minus 32px, centred in the middle of the viewport (`position: fixed`), over a `--scrim` dim that covers the whole page. It has a heading (`h2`), its content, and a close button (an X, `data-testid="dialog-close"`, at least 44 by 44px) in the top right corner. It carries `role="dialog"`, `aria-modal="true"` and `aria-labelledby` pointing at its heading.
- **U86** Opening a popup moves focus into it (the first field, or the close button if there is none). Tab and Shift+Tab stay inside it. **Escape** and the close button close it, as does a tap on the dim, and focus goes back to the control that opened it. While it is open the page behind does not scroll and nothing behind it moves or resizes (Q1).
- **U87** Buttons in a popup sit in one row where there are two **and fit** (each at most half the card, each label on one line, Q2, 16px apart, with at least 12px between the label and the button's edge, Q18) and are stacked at full width, 12px apart with the main one first, where there are more **or where two do not fit** at that width (changed 31 October 2026).
- **U87a** Every popup, including the end popup, the waiting card and the tutorial card, has at least 16px of padding between the card's edge and its content (Q18). A Cancel or Close is always there (Q9). A popup that asks a question names its buttons for the answer ("Leave" and "Stay"), never "OK".
- **U88** An error from the server appears inside the popup, as text in `--error`, directly under the field it belongs to; a nickname save closes the popup and the new name on the page is the confirmation, with no message (U32); other confirmations are shown once on the page behind in the place that already reserved it, without moving anything (Q1). A popup never covers its own error.
- **U89** Under `prefers-reduced-motion` a popup appears with no animation. Otherwise it fades and rises a few pixels over `--dur-popup`, using only `transform` and `opacity` (U30).
- **U90** Only one popup is open at a time. Opening a second (a "Forgot your password?" popup from the sign-in popup) closes the first and the close button of the second goes back to the first.

## The popups

| Popup | Opened by | Content | Buttons |
| --- | --- | --- | --- |
| Nickname (`nickname-dialog`) | The pencil on the home screen, "Edit" on the account page | "Your nickname", one field **prefilled with the current nickname** (Q7) | Save, Cancel |
| Join with a code (`code-dialog`) | "Join with a code" on the home screen | "Join with a code", the code field (6 letters or numbers) | Join, Cancel |
| Sign up (`signup-dialog`) | "Save my progress" on the account page | Username, password (at least 8 characters) | Save my progress, Cancel |
| Sign in (`signin-dialog`) | "Sign in" on the account page | Username, password and a "Forgot your password?" link | Sign in, Cancel |
| Forgot your password (`forgot-dialog`) | The link in the sign-in popup | "Email game@tejastagra.com with your username and we'll reset it for you." | Close |
| Change password (`password-dialog`) | "Change password" on the account page | Current password, new password | Change password, Cancel |
| Forced password change (`must-change-dialog`) | Signing in with a temporary password (it cannot be closed or skipped: no close button, no Escape, no dim tap) | "Choose a new password", new password | Set password |
| Shield help (`shield-help`) | The info button on the shield row (U104) | The shield rule | Close |
| Earthquake help (`earthquake-help`) | The info button on the Earthquake row (U104) | The Earthquake rule, and "Available once the bottom row has a piece" when nothing can be shaken | Close |
| Leave game (`leave-dialog`) | The header bar's Home on a game that is being played (U107, U132) | "Leave this game? It counts as a forfeit." | Leave (`leave-confirm`), Stay (`dialog-cancel`) |

The end-of-game popup, the tutorial and the watching screen's result card are older popups with their own wording (`motion-and-endings.md` U27, `tutorial.md`, `spectating.md` U82); they follow the same look, Escape rule and spacing, and are moved onto this component when they are next changed.

## The keyboard (added 31 October 2026, Part B of the second fix list, Q21)

- **U91** On a phone a popup is sized and placed to the **visible area**, using `window.visualViewport` (updated on its `resize` and `scroll` events) and written to `--vv-top` and `--vv-height` on the popup. When the keyboard opens the popup shrinks to the space above it; its heading and fields scroll inside the card if they must, and **the action buttons stay pinned at the bottom of the card**, just above the keyboard. The page's viewport meta also carries `interactive-widget=resizes-content` where supported. The safe-area padding stays.
- **U92** The keyboard's own key finishes the form: a field that is followed by another has `enterkeyhint="next"` and Enter moves focus to the next field instead of submitting; the last field has `enterkeyhint="go"` and Enter submits. Usernames use `autocomplete="username"`; Save my progress and Change password (and the forced change) use `autocomplete="new-password"` for the new password; Sign in, and the current password of Change password, use `autocomplete="current-password"`.
