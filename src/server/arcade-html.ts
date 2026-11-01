// HTML building blocks for the dark arcade look (ADR 0006). They only use the
// class names styled in public/components.css, and no colour or font value
// appears here: those live in public/theme.css (CLAUDE.md).

// `version` is a hash of the stylesheets, added to their links so a deploy that
// changes the look is picked up at once instead of after the browser's cache
// expires, and a page never mixes an old stylesheet with a new one.
export function arcadePage(o: { title: string; body: string; script?: string; reload?: string; version: string }): string {
  const { title, body, script, reload = "", version } = o;
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
    <title>${title}</title>
    <link rel="preload" href="/fredoka-700.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/theme.css?v=${version}" />
    <link rel="stylesheet" href="/components.css?v=${version}" />
  </head>
  <body>
    <div class="bubbles" id="bubbles" aria-hidden="true"></div>
    ${body}
    <script type="module" src="/static/bubbles.js"></script>
    ${script ? `<script type="module" src="${script}"></script>` : ""}
    ${reload}
  </body>
</html>`;
}

// Icons are drawn from shapes in a 24 by 24 box and take their colour from the
// text colour, so they are never the only carrier of meaning: every button
// also has a text label.
const ICONS: Record<string, string> = {
  computer: `<path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l1.5 3H8.5L10 17H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm1 2v8h14V7z"/>`,
  friends: `<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-3.3 0-7 1.7-7 4v3h14v-3c0-2.3-3.7-4-7-4zm8 .2c-.4 0-.8 0-1.2.1 1.3 1 2.2 2.3 2.2 3.7v3h5v-3c0-2-3-3.8-6-3.8z"/>`,
  bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>`,
  trophy: `<path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zM6 7v1a2 2 0 0 0 1.2 1.8A8 8 0 0 1 7 8V7zm12 0h-1v1a8 8 0 0 1-.2 1.8A2 2 0 0 0 18 8z"/>`,
  user: `<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z"/>`,
  drop: `<path d="M12 21 3 10h5V3h8v7h5z"/>`,
  shield: `<path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z"/>`,
  link: `<path d="M10.6 13.4a3 3 0 0 0 4.2 0l3.5-3.5a3 3 0 0 0-4.2-4.2l-1 1 1.4 1.4 1-1a1 1 0 0 1 1.4 1.4l-3.5 3.5a1 1 0 0 1-1.4 0zm2.8-2.8a3 3 0 0 0-4.2 0l-3.5 3.5a3 3 0 0 0 4.2 4.2l1-1-1.4-1.4-1 1a1 1 0 0 1-1.4-1.4l3.5-3.5a1 1 0 0 1 1.4 0z"/>`,
  join: `<path d="M10 4v3H4v10h6v3l8-8zm0 6h4v4h-4z"/>`,
  key: `<path d="M8 3a6 6 0 0 0-1.9 11.7L5 17H3v3h3v-2h2v-2.3A6 6 0 0 0 8 3zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm5 5h9v3h-2v3h-3v-3h-4z"/>`,
  podium: `<path d="M9 9h6v12H9zM2 14h6v7H2zm14 3h6v4h-6zM12 2l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3L7.2 5.5 10.5 5z"/>`,
  question: `<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 15v-2h2v2zm1-4.5h-1.7c0-2.9 3-2.7 3-4.5 0-.9-.8-1.5-1.8-1.5s-1.7.5-1.8 1.4L7.8 7.7C8.1 5.6 9.8 4.5 12 4.5c2.3 0 4 1.3 4 3.4 0 2.7-3.5 2.6-4 4.6z"/>`,
  book: `<path d="M4 4h7a2 2 0 0 1 1 .3A2 2 0 0 1 13 4h7v15h-7a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4zm2 2v11h4a4 4 0 0 1 1 .1V6zm7 0v11.1a4 4 0 0 1 1-.1h4V6z"/>`,
  eye: `<path d="M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>`,
  home: `<path d="M12 3 2 11.5h3V21h5.5v-6h3v6H19v-9.5h3z"/>`,
  pencil: `<path d="M3 17.3V21h3.7L18 9.7 14.3 6zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7z"/>`,
};

export function icon(name: keyof typeof ICONS | string): string {
  const path = ICONS[name];
  if (!path) throw new Error(`unknown icon: ${name}`);
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">${path}</svg>`;
}

// The cracked title (U5): the word twice (a shadow layer and the yellow fill),
// jagged crack lines across the letters and a few chips that fall away.
export function title(): string {
  // Short cracks that stay inside the letters (the word spans about 20% to 80%
  // across and 28% to 72% down), so none pokes out over the navy.
  // The title shrinks to the width of the word, so these percentages are across the
  // letters themselves. Cracks zig-zag from the top edge to the bottom, so they read as breaks.
  const cracks = `<svg class="title-cracks" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M22 6 L25 15 L20 22 L24 30 L21 36"/>
      <path d="M65 5 L62 14 L68 21 L63 29 L66 36"/>
      <path d="M83 6 L86 15 L81 23 L85 30 L82 36"/>
    </svg>`;
  const chips = [16, 33, 50, 68, 84]
    .map((x, i) => `<i class="chip" data-i="${i}" style="--x:${x}%" aria-hidden="true"></i>`)
    .join("");
  return `<h1 class="title" aria-label="Rubble"><span class="title-shadow" aria-hidden="true">RUBBLE</span><span class="title-fill" aria-hidden="true">RUBBLE</span>${cracks}${chips}</h1>`;
}

export interface ButtonOptions {
  label: string;
  iconName?: string;
  kind?: "red" | "blue" | "yellow";
  testid?: string;
  href?: string;
  disabled?: boolean;
  block?: boolean;
  type?: "button" | "submit";
}

export function button(o: ButtonOptions): string {
  const cls = `btn btn-${o.kind ?? "blue"}${o.block ? " btn-block" : ""}`;
  const inner = `${o.iconName ? icon(o.iconName) : ""}<span>${o.label}</span>`;
  const hook = o.testid ? ` data-testid="${o.testid}"` : "";
  if (o.href) return `<a class="${cls}" href="${o.href}"${hook}>${inner}</a>`;
  return `<button class="${cls}" type="${o.type ?? "button"}"${hook}${o.disabled ? " disabled" : ""}>${inner}</button>`;
}

// A small round icon button with a label underneath (home.md U34).
export function roundButton(o: { label: string; iconName: string; href?: string; testid?: string }): string {
  const hook = o.testid ? ` data-testid="${o.testid}"` : "";
  const inner = `<span class="round">${icon(o.iconName)}</span><span>${o.label}</span>`;
  return o.href
    ? `<a class="round-item" href="${o.href}"${hook}>${inner}</a>`
    : `<button class="round-item" type="button"${hook}>${inner}</button>`;
}

// The header bar every screen but home starts with (docs/design/qa-checklist.md Q12, U131): Home on the left, an optional line
// in the middle and an optional item on the right. On the game screen the middle and the right are filled in by the page.
export function topbar(o: { middle?: string; right?: string; href?: string } = {}): string {
  const home = o.href === undefined
    ? `<button class="btn btn-blue topbar-home" type="button" data-testid="header-home" aria-label="Home">${icon("home")}<span class="topbar-home-word">Home</span></button>`
    : `<a class="btn btn-blue topbar-home" href="${o.href}" data-testid="header-home" aria-label="Home">${icon("home")}<span class="topbar-home-word">Home</span></a>`;
  return `<header class="topbar" data-testid="topbar">${home}<p class="topbar-title" data-testid="topbar-title">${o.middle ?? ""}</p><p class="topbar-right" data-testid="topbar-right">${o.right ?? ""}</p></header>`;
}

// The tutorial (docs/design/tutorial.md U136 to U147): an overlay with a progress line, a caption, the practice board and Next and
// Skip. It is on the home screen and the game screen, because it runs before the first match from either (R47).
export function tutorialOverlay(): string {
  return `<div class="tutorial" data-testid="tutorial" hidden role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div class="panel tutorial-card">
        <p class="tutorial-progress" data-testid="tutorial-progress"></p>
        <h2 id="tutorial-title" data-testid="tutorial-title"></h2>
        <p class="tutorial-caption" data-testid="tutorial-caption" aria-live="polite"></p>
        <div class="tutorial-board" data-testid="tutorial-board"></div>
        <div class="tutorial-actions">
          <button type="button" class="btn btn-red" data-testid="tutorial-next">Next</button>
          <button type="button" class="link-button" data-testid="tutorial-skip">Skip</button>
        </div>
      </div>
    </div>`;
}
