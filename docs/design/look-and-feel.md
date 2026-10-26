# Look and feel: the navy toy

Rubble looks like a toy game box after dark: a deep navy night with slow bubbles shaped like game discs rising through it, chunky flat pieces with dark outlines and hard shadows, and a blue board with red and yellow discs. It is cheerful and bold, and it is its own thing: it does not copy any other game site's layout, art or branding, and it never uses the Connect 4 or Hasbro names, logo, box art or disc characters.

Tejas chose this style on 27 October 2026 (ADR 0006). He kept the navy background with moving bubbles because he liked it, and changed everything else so it is original.

## Theme file

- **U1** Every colour, gradient, radius, outline, shadow, font and animation duration lives in one file, `public/theme.css`, as CSS variables. Nothing else defines a colour or a font (a test enforces it).
- **U2** The values below are the tokens. `spec/unit-theme.test.ts` reads this table and fails if `public/theme.css` does not define every colour in it, and it recomputes the contrast ratios in the next section from `theme.css`. Changing a token changes it everywhere.

| Token | Value | Used for |
| --- | --- | --- |
| `--ground-top` | `#0E1638` | Top of the page gradient |
| `--ground-bottom` | `#18245A` | Bottom of the page gradient |
| `--panel` | `#1F2C6B` | Panels, cards and tiles |
| `--ink` | `#060A20` | Outlines, hard shadows, text on yellow |
| `--text` | `#FFFFFF` | Main text |
| `--text-muted` | `#C9D1F5` | Secondary text |
| `--link` | `#9CCBFF` | Links |
| `--red` | `#D21F27` (edge: `--ink`) | Main actions and your discs |
| `--blue` | `#1E5BD8` (edge: `--ink`) | Secondary actions and the board |
| `--yellow` | `#FFC72C` (edge: `--ink`) | Highlight actions and the opponent's discs |
| `--board-edge` | `#1546A8` | Board frame and feet |
| `--board-shine` | `#4D82EA` | Highlight along the top of the board |
| `--hole` | `#0A1030` | Board holes |
| `--rubble` | `#8A94A8` with `--rubble-hatch` `#4B5568` | Rubble blocks |
| `--field` | `#121A4A` | The inside of a text input |
| `--disabled` | `#3A4580` | A disabled button's fill (opaque, so nothing shows through it) |
| `--stack-width` | `420px` | The widest a stack of menu buttons gets |
| `--error` | `#FFB4A8` | Error messages |
| `--ok` | `#7CE3A1` | Confirmations |
| `--outline` | `3px solid var(--ink)` | Every button, panel, tile and disc |
| `--shadow` | `0 5px 0 var(--ink)` | The hard offset shadow under buttons and panels |
| `--radius` | `14px` (buttons), `20px` (panels), `999px` (pills and discs) | |

## Contrast

Ratios are WCAG contrast ratios computed from the token values (the unit test recomputes them). Text needs 4.5:1. Graphics that carry meaning need 3:1.

| Text on its background | Ratio |
| --- | --- |
| `--text` on `--ground-top` | 17.64 |
| `--text` on `--ground-bottom` | 14.60 |
| `--text` on `--panel` | 12.88 |
| `--text-muted` on `--ground-bottom` | 9.68 |
| `--text-muted` on `--panel` | 8.54 |
| `--link` on `--ground-bottom` | 8.62 |
| `--link` on `--panel` | 7.60 |
| white on `--red` (button labels) | 5.30 |
| white on `--blue` (button labels) | 5.93 |
| `--ink` on `--yellow` (button labels) | 12.55 |
| `--yellow` on `--ground-bottom` | 9.35 |
| `--yellow` on `--panel` | 8.25 |
| `--error` on `--panel` | 7.57 |
| `--ok` on `--panel` | 8.19 |
| `--disabled-text` on `--disabled` (a disabled button) | 5.94 |
| `--text` on `--field` (an input) | 16.50 |
| `--error` on `--ground-bottom` | 8.58 |
| `--ok` on `--ground-bottom` | 9.28 |
| white on `--yellow` | 1.56: **never used** |

| Graphics | Ratio |
| --- | --- |
| `--yellow` disc on `--hole` | 11.91 |
| `--red` disc on `--hole` | 3.51 |
| white ring on `--red` disc | 5.30 |
| `--ink` cross on `--yellow` disc | 12.55 |
| `--rubble` on `--ink` | 6.42 |
| `--rubble` on `--ground-bottom` | 4.78 |

Known limits, recorded so nobody has to rediscover them:

- A `--red` or `--blue` button fill sits on the navy ground at 2.46 to 3.33:1 (the ground is a gradient, so it depends where on the page the button is), below the 3:1 guideline at the darker end for a component's edge, and the dark outline is nearly invisible against navy. The button is identified by its label (5.30 and 5.93, well above 4.5), its icon, its size and its hard shadow, so nothing depends on seeing the fill against the ground. This is a judgement call for Tejas (see ADR 0006). If he wants the edge itself to pass, add a light inner edge to buttons in `theme.css`.
- Discs and rubble are told apart by shape (ring, cross, hatch) as well as colour, as `docs/design.md` requires.

## Background and bubbles

- **U3** The page background is a vertical gradient from `--ground-top` to `--ground-bottom`. There is no starfield. Instead, slowly rising translucent bubbles shaped like game discs drift up the screen behind everything: faint red, yellow and blue, with some showing the ring marker and some the cross marker.
  - There are about 12 on a laptop and 7 on a phone. They rise at different speeds (18 to 34 seconds a crossing), sizes (24 to 72px) and starts, and they never block taps (`pointer-events: none`) or sit in front of text.
  - **U3a** They always sit behind all content and never overlap a button, text or the board. The bubble layer is a fixed layer under the page, the page is a layer above it, and the page's panels, buttons and board are fully opaque, so a bubble can pass behind them but never show through or in front. A disabled button is opaque too (`--disabled`), not see-through.
  - They animate only `transform` and `opacity`, are not blurred, and are one fixed layer, so they stay smooth on a phone.
  - Under `prefers-reduced-motion` they stay still, scattered across the screen.
  - They are decoration: hidden from screen readers (`aria-hidden`), and no text sits on one at a brightness that could lower its contrast, because their colours are very faint (the ratios above are measured against the plain ground, and the bubbles' opacity never exceeds 0.22).
- **U4** Headings, numbers, buttons and the title use a heavy rounded display font, self-hosted (Fredoka at weight 700, `public/fredoka-700.woff2`). Body text uses the system font stack. Every font has a fallback.
- **U5** The "RUBBLE" title is huge, in `--yellow` with a `--red` hard offset shadow and a thick `--ink` outline. The letters are cracked: a few jagged `--ink` crack lines run across them. A handful of small yellow chips fall away from the cracks, slowly and in a loop. **U5a** The chips only fall within the title's own box, so they never overlap the tagline or any other text, and the cracks are drawn inside the letters, never past their edges. Under reduced motion the chips rest where they landed, still inside the title. The title is an image of the word, so it carries `aria-label="Rubble"`.

## Surfaces

- **U6** Panels, cards and tiles are `--panel` with the `--outline`, `20px` corners and the `--shadow`, like toy pieces. No gradients and no glossy highlights on panels or buttons.
- **U7** The board is the blue toy board: a `--blue` face with a `--board-shine` strip along the top edge, a thick `--board-edge` frame, short feet at the bottom corners, and round holes in `--hole`. Discs are flat: `--red` with a white ring marker (yours) or `--yellow` with an `--ink` cross marker (the opponent's), each with the `--outline` and a small hard shadow. Rubble is `--rubble` with a `--rubble-hatch` pattern. The most recent discs glow.

## Forms, panels and overlays

- **U51** Text inputs are `--panel` fields with the `--outline`, `--radius-button` corners and at least 44px of height, with a visible label above each. The focus ring is `--focus`. An error or confirmation appears directly under the heading of the form it belongs to (`docs/design.md`), in `--error` or `--ok`, as text, never as colour alone.
- **U52** The tutorial and the end-of-game popup are `--panel` cards over a dimmed screen. The dim is `--scrim`, which is faint enough that the page behind stays recognisable. Cards are at most `--stack-width` wide, centred, and scroll inside themselves if the screen is short, so a small phone can always reach every button.
- **U53** The "waiting" and "loading" states use a small spinning ring (`--spinner`). Under reduced motion the ring does not spin and the words say what is happening.

## Words on screen

- **U49** Every visible word is real product copy for players. A page never shows developer or preview text, such as "style preview" or a note about `theme.css`; explanations of that kind live in `docs/`.
- **U50** The style preview page (`/style-preview`) exists only when the server runs in development (`DEV=1`). In production it does not exist (a 404), and no page links to it.

## Buttons (menus and popups; the board itself has none)

- **U8a** Buttons never stretch across a wide screen. A stack of menu buttons is at most `--stack-width` (420px) wide and centred; on a phone that is the full width of the screen, because the screen is narrower.
- **U8** Buttons are flat and chunky: `14px` corners, the `--outline`, the `--shadow`, an icon on the left and a heavy display-font label, with no glossy gradient. Main actions are `--red` with white text, secondary actions are `--blue` with white text and highlight actions are `--yellow` with `--ink` text. White text never sits on yellow.
- **U9** Buttons react without gradients: on hover (where there is a hover) they rise 2px and the shadow grows to match; when pressed they sink 5px so the shadow disappears; on release they spring back. Small round icon buttons use the same outline, shadow and press behaviour. Nothing depends on hover.

All of this keeps the standards in `docs/design.md`: 44px tap targets, 4.5:1 text contrast, no sideways scroll, and shapes as well as colours on discs. Your discs always keep their ring and the opponent's their cross.
