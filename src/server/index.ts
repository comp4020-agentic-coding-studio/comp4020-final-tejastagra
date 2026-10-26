import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { marked } from "marked";
import { logEvent } from "./log.ts";
import { openDb } from "./db.ts";
import { attachRealtime } from "./realtime.ts";
import { bundleClient } from "./client-bundle.ts";
import { generateCode } from "./codes.ts";
import { createRateLimiter } from "./rate-limit.ts";
import { createMatchmaker } from "./matchmaker.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DEV = process.env.DEV === "1";
const DB_PATH = process.env.RUBBLE_DB_PATH ?? (DEV ? "./data-dev/rubble.db" : "/data/rubble.db");
const startedAt = String(Date.now());

const db = openDb(DB_PATH);
// Behind Fly's proxy the socket address is the proxy's; Fly sets Fly-Client-IP.
function clientAddress(req: import("node:http").IncomingMessage): string {
  const fly = req.headers["fly-client-ip"];
  return (typeof fly === "string" ? fly : undefined) ?? req.socket.remoteAddress ?? "unknown";
}
const allowCreate = createRateLimiter(30, 60_000);
// Generous: joining plus a few retries per player; 20 test clients share one address.
const allowQuick = createRateLimiter(120, 60_000);

// Bundled once at start; pnpm dev's --watch restarts the whole process on
// any source change, so this never goes stale while developing.
const clientBundles: Record<string, string> = {
  "game.js": bundleClient("src/client/game.ts"),
  "home.js": bundleClient("src/client/home.ts"),
  "quick.js": bundleClient("src/client/quick.ts"),
};

const reloadScript = DEV
  ? `<script>(function(){var v;setInterval(function(){fetch("/__dev/version").then(function(r){return r.text()}).then(function(t){if(v&&v!==t)location.reload();v=t}).catch(function(){})},700)})()</script>`
  : "";

// Phone first (docs/design.md): one centred column, 44px tap targets, nothing
// scrolls sideways at 320px, discs differ by shape (ring and cross) as well as colour.
const STYLES = `
  *{box-sizing:border-box}
  body{margin:0;font:16px/1.4 system-ui,sans-serif;color:#1a1a1a;background:#fafafa;
    padding:env(safe-area-inset-top) max(12px,env(safe-area-inset-right)) env(safe-area-inset-bottom) max(12px,env(safe-area-inset-left))}
  main{max-width:480px;margin:0 auto;padding:8px 0}
  p{margin:4px 0;overflow-wrap:anywhere}
  img,table,pre{max-width:100%}
  pre{overflow-x:auto}
  button{min-height:44px;min-width:44px;font:inherit;border:2px solid #1a1a1a;border-radius:8px;background:#fff;color:#1a1a1a;padding:0 12px}
  button[aria-pressed="true"]{background:#1a1a1a;color:#fff}
  button:disabled{opacity:.5}
  .board{border-collapse:separate;border-spacing:3px;width:100%;table-layout:fixed;background:#1d4ed8;border-radius:8px}
  .board td{aspect-ratio:1;background:#fff;border-radius:50%;text-align:center;font-weight:700;font-size:1.3rem;line-height:1;padding:0}
  .board td[data-mark="you"]{background:#fde047;color:#1a1a1a}
  .board td[data-mark="them"]{background:#f87171;color:#1a1a1a}
  .board td[data-mark="R"]{background:repeating-linear-gradient(45deg,#6b7280 0 4px,#d1d5db 4px 8px)}
  .columns{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin:6px 0}
  .columns button{padding:0}
  .stack{display:grid;gap:8px;margin:12px 0}
  .join{display:grid;grid-template-columns:1fr auto;gap:8px;margin:12px 0}
  .join label{grid-column:1/-1}
  input{min-height:44px;font:inherit;padding:0 10px;border:2px solid #1a1a1a;border-radius:8px;width:100%;text-transform:uppercase}
  a.button{display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border:2px solid #1a1a1a;border-radius:8px;background:#fff;color:#1a1a1a;text-decoration:none}
  [hidden]{display:none!important}
  a{display:inline-block;padding:12px 0;color:#1d4ed8}
  .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}
  @media (max-width:360px){
    body{padding-left:max(4px,env(safe-area-inset-left));padding-right:max(4px,env(safe-area-inset-right))}
    .columns{gap:0}
  }
  @media (prefers-reduced-motion:no-preference){.board td{transition:background .2s}}
`;

function page(title: string, body: string, script?: string): string {
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
    <style>${STYLES}</style>
  </head>
  <body>
    ${body}
    ${script ? `<script type="module" src="${script}"></script>` : ""}
    ${reloadScript}
  </body>
</html>`;
}

function readme(): string {
  const html = marked.parse(readFileSync("README.md", "utf8"), { async: false });
  return page("Rubble: about", `<main>${html}<p><a href="/">Back to the game</a></p></main>`);
}

const GAME_CODE_PATTERN = /^\/g\/([A-Za-z0-9]+)\/?$/;

function board(): string {
  let cells = "";
  // Row 5 (top) down to row 0 (bottom), so the board reads top-to-bottom on
  // screen the way a Connect 4 board does, while column 0 stays column 0.
  for (let row = 5; row >= 0; row--) {
    for (let column = 0; column < 7; column++) {
      cells += `<td data-testid="cell-${column}-${row}" data-piece=""></td>`;
    }
    cells += "</tr><tr>";
  }
  return `<table class="board"><tbody><tr>${cells.slice(0, -"</tr><tr>".length)}</tr></tbody></table>`;
}

function columnButtons(): string {
  let buttons = "";
  for (let column = 0; column < 7; column++) {
    buttons += `<button type="button" data-testid="column-${column}" data-column="${column}" aria-label="Column ${column + 1}">${column + 1}</button>`;
  }
  return buttons;
}

function gameScreen(code: string): string {
  const body = `
    <main data-testid="game-screen">
      <p>
        Game <span data-testid="game-code">${code}</span>
        <button type="button" data-testid="copy-link">Copy link</button>
      </p>
      <p>Round <span data-testid="round-number">0</span>, <span data-testid="timer">15</span>s left</p>
      <p>Opponent: <span data-testid="opponent-status">Choosing</span></p>
      <p>
        Your shield: <span data-testid="my-shield">available</span>
        Opponent's shield: <span data-testid="opponent-shield">available</span>
      </p>
      ${board()}
      <div class="columns">${columnButtons()}</div>
      <div class="actions">
        <button type="button" data-testid="shield-toggle" aria-pressed="false">Shield off</button>
        <button type="button" data-testid="drop" disabled>Drop</button>
      </div>
      <p data-testid="result-line"></p>
    </main>
  `;
  return page("Rubble: game", body, "/static/game.js");
}

function quickScreen(): string {
  return `
    <main data-testid="quick-screen">
      <h1>Quick match</h1>
      <p data-testid="quick-status" role="status">Waiting for another player...</p>
      <div data-testid="computer-offer" hidden>
        <p>No one has arrived yet. You can play the computer instead, or keep waiting.</p>
        <p><span data-testid="computer-offer-note">Playing the computer is coming soon.</span></p>
      </div>
      <button type="button" data-testid="quick-cancel">Cancel</button>
    </main>
  `;
}

function homeScreen(): string {
  return `
    <main data-testid="home-screen">
      <h1>Rubble</h1>
      <p>Simultaneous Connect 4. Both players choose at once.</p>
      <div class="stack">
        <button type="button" data-testid="play-computer" disabled>Play the computer (coming soon)</button>
        <button type="button" data-testid="play-friend">Play a friend</button>
        <a class="button" data-testid="quick-match" href="/play/quick">Quick match</a>
      </div>
      <form id="join-form" class="join">
        <label for="code-input">Enter a game code</label>
        <input id="code-input" data-testid="code-input" autocomplete="off" autocapitalize="characters" maxlength="6" />
        <button type="submit">Join</button>
      </form>
      <p id="home-message" role="status"></p>
      <p><a href="/readme/">About this app</a></p>
    </main>
  `;
}

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (DEV && path === "/__dev/version") {
    res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
    res.end(startedAt);
  } else if (path === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page("Rubble", homeScreen(), "/static/home.js"));
  } else if (path === "/play/quick" || path === "/play/quick/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page("Rubble: quick match", quickScreen(), "/static/quick.js"));
  } else if (path === "/readme/" || path === "/readme") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readme());
  } else if (/^\/api\/quick\/[A-Za-z0-9-]{8,64}$/.test(path)) {
    const ticket = path.split("/").pop()!;
    let body: unknown;
    if (req.method === "POST") {
      if (!allowQuick(clientAddress(req))) {
        res.writeHead(429, { "content-type": "text/plain; charset=utf-8", "retry-after": "60" });
        res.end("Too many requests. Try again in a minute.");
        return;
      }
      body = matchmaker.join(ticket);
    } else if (req.method === "DELETE") {
      matchmaker.leave(ticket);
      body = { state: "unknown" };
    } else {
      body = matchmaker.status(ticket);
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  } else if (path === "/api/games" && req.method === "POST") {
    // Play a friend (R34): the server makes the code, so clients never invent one.
    if (!allowCreate(clientAddress(req))) {
      res.writeHead(429, { "content-type": "text/plain; charset=utf-8", "retry-after": "60" });
      res.end("Too many games started. Try again in a minute.");
      return;
    }
    const code = generateCode((c) => realtime.game.getGame(c) !== undefined);
    realtime.game.createGame(code);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ code }));
  } else if (GAME_CODE_PATTERN.test(path)) {
    const code = path.match(GAME_CODE_PATTERN)![1];
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(gameScreen(code));
  } else if (path.startsWith("/static/") && path.slice("/static/".length) in clientBundles) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(clientBundles[path.slice("/static/".length)]);
  } else {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

const realtime = attachRealtime(server, db);

// Quick match (R35): pairs make a fresh game and wait for both to open it.
const matchmaker = createMatchmaker({
  makeGame: () => {
    const code = generateCode((c) => realtime.game.getGame(c) !== undefined);
    realtime.game.createGame(code);
    return code;
  },
});

server.listen(PORT, "0.0.0.0", () => {
  logEvent("server_start", { port: PORT });
});
