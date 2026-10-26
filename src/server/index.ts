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
import { leaderboardFrom } from "./leaderboard.ts";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  checkPassword,
  clearedCookie,
  hashPassword,
  hashToken,
  newPlayerId,
  newSessionToken,
  passwordProblem,
  publicPlayer,
  readCookie,
  sessionCookie,
  validNickname,
  validUsername,
} from "./identity.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

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
// Sign-in and sign-up cost real CPU (bcrypt) and invite password guessing.
// 60 a minute per address: a shared network (a class, a household) must not lock itself out.
// Creating a guest writes a player and a session row, so it is limited too.
const allowGuest = createRateLimiter(30, 60_000);
// Sessions expire on the server as well as in the cookie (R28).
db.deleteExpiredSessions(SESSION_MAX_AGE_S * 1000);
setInterval(() => db.deleteExpiredSessions(SESSION_MAX_AGE_S * 1000), 6 * 60 * 60 * 1000).unref();
// The leaderboard reads every saved game, so it is limited like the other endpoints.
const allowRead = createRateLimiter(120, 60_000);
const allowAuth = createRateLimiter(60, 60_000);
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
  .board{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;padding:3px;background:#1d4ed8;border-radius:8px}
  .cell{aspect-ratio:1;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.3rem;line-height:1}
  .cell[data-mark="you"]{background:#fde047;color:#1a1a1a}
  .cell[data-mark="them"]{background:#f87171;color:#1a1a1a}
  .cell[data-mark="R"]{background:repeating-linear-gradient(45deg,#6b7280 0 4px,#d1d5db 4px 8px)}
  .columns{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin:6px 0}
  .columns button{padding:0}
  .stack{display:grid;gap:8px;margin:12px 0}
  .join{display:grid;grid-template-columns:1fr auto;gap:8px;margin:12px 0}
  .join label{grid-column:1/-1}
  input{min-height:44px;font:inherit;padding:0 10px;border:2px solid #1a1a1a;border-radius:8px;width:100%;text-transform:uppercase}
  a.button{display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border:2px solid #1a1a1a;border-radius:8px;background:#fff;color:#1a1a1a;text-decoration:none}
  [hidden]{display:none!important}
  a{display:inline-block;padding:12px 0;color:#1d4ed8}
  .share{border:2px dashed #1a1a1a;border-radius:8px;padding:8px;margin:6px 0}
  .row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 12px}
  .share .actions{margin:4px 0 0}
  .code{font-size:1.6rem;font-weight:700;letter-spacing:.2em;text-align:center;margin:4px 0}
  .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}
  @media (max-height:640px){
    body{line-height:1.2}
    main{padding:0}
    p{margin:2px 0}
    .share{padding:4px;margin:3px 0}
    .code{font-size:1.3rem;margin:0}
    .columns,.actions{margin:3px 0}
  }
  @media (max-width:360px){
    body{padding-left:max(4px,env(safe-area-inset-left));padding-right:max(4px,env(safe-area-inset-right))}
    .columns{gap:0}
  }
  @media (prefers-reduced-motion:no-preference){.cell{transition:background .2s}}
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
  // A grid of divs, not a table: browsers ignore aspect-ratio on table cells,
  // which collapsed empty cells to nothing.
  for (let row = 5; row >= 0; row--) {
    for (let column = 0; column < 7; column++) {
      cells += `<div class="cell" data-testid="cell-${column}-${row}" data-piece=""></div>`;
    }
  }
  return `<div class="board" role="img" aria-label="Board, 7 columns by 6 rows">${cells}</div>`;
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
      <section data-testid="waiting-panel" class="share">
        <p class="code" data-testid="game-code">${code}</p>
        <div class="actions">
          <button type="button" data-testid="copy-link">Copy link</button>
          <button type="button" data-testid="share" hidden>Share</button>
        </div>
      </section>
      <p class="row">
        <span>Round <span data-testid="round-number">0</span></span>
        <span><span data-testid="timer">15</span>s left</span>
        <span>Opponent: <span data-testid="opponent-status">Choosing</span></span>
      </p>
      <p class="row">
        <span>Your shield: <span data-testid="my-shield">available</span></span>
        <span>Their shield: <span data-testid="opponent-shield">available</span></span>
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
        <p><button type="button" data-testid="computer-offer-play">Play the computer</button></p>
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
        <button type="button" data-testid="play-computer">Play the computer</button>
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

const isSecure = (req: IncomingMessage) => req.headers["x-forwarded-proto"] === "https";

function json(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    // A cross-site HTML form cannot send application/json, so requiring it
    // closes login and sign-out CSRF on top of SameSite=Lax.
    if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      req.resume();
      resolve(null);
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4096) {
        resolve(null);
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        resolve(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function currentPlayer(req: IncomingMessage) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  return token ? db.playerBySession(hashToken(token), SESSION_MAX_AGE_S * 1000) : undefined;
}

// Identity endpoints (R28 to R31). Nothing here ever returns a password or its hash (R30).
async function handleIdentity(path: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (path === "/api/me" && req.method === "GET") {
    const player = currentPlayer(req);
    json(res, 200, { player: player ? publicPlayer(player) : null });
    return true;
  }
  if (path === "/api/guest" && req.method === "POST") {
    if (!currentPlayer(req) && !allowGuest(clientAddress(req))) {
      json(res, 429, { error: "Too many new players from here. Try again in a minute." }, { "retry-after": "60" });
      return true;
    }
    const body = await readBody(req);
    if (!body || !validNickname(body.nickname)) {
      json(res, 400, { error: "A nickname is 2 to 16 letters, numbers, spaces, hyphens or underscores." });
      return true;
    }
    const nickname = body.nickname.trim();
    const existing = currentPlayer(req);
    if (existing) {
      if (existing.username === null) db.setNickname(existing.id, nickname);
      json(res, 200, { player: publicPlayer({ ...existing, nickname: existing.username === null ? nickname : existing.nickname }) });
      return true;
    }
    const id = newPlayerId();
    db.createPlayer(id, nickname);
    const token = newSessionToken();
    db.createSession(hashToken(token), id);
    json(res, 200, { player: publicPlayer({ id, nickname, username: null }) }, { "set-cookie": sessionCookie(token, isSecure(req)) });
    return true;
  }
  if (path === "/api/account/signup" && req.method === "POST") {
    if (!allowAuth(clientAddress(req))) {
      json(res, 429, { error: "Too many attempts. Try again in a minute." }, { "retry-after": "60" });
      return true;
    }
    const player = currentPlayer(req);
    if (!player) {
      json(res, 401, { error: "Choose a nickname first." });
      return true;
    }
    if (player.username !== null) {
      json(res, 409, { error: "You already have an account." });
      return true;
    }
    const body = await readBody(req);
    if (!body || !validUsername(body.username)) {
      json(res, 400, { error: "A username is 3 to 20 letters, numbers, hyphens or underscores." });
      return true;
    }
    const problem = passwordProblem(body.password);
    if (problem) {
      json(res, 400, { error: problem });
      return true;
    }
    // Same id, so past games and wins carry over (R29).
    if (!db.upgradeToAccount(player.id, body.username, await hashPassword(body.password as string))) {
      json(res, 409, { error: "That username is taken. Try another." });
      return true;
    }
    json(res, 200, { player: publicPlayer({ ...player, username: body.username }) });
    return true;
  }
  if (path === "/api/account/signin" && req.method === "POST") {
    if (!allowAuth(clientAddress(req))) {
      json(res, 429, { error: "Too many attempts. Try again in a minute." }, { "retry-after": "60" });
      return true;
    }
    const body = await readBody(req);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      json(res, 400, { error: "Enter a username and password." });
      return true;
    }
    const account = db.playerByUsername(body.username);
    if (!(await checkPassword(body.password, account?.passwordHash ?? null)) || !account) {
      json(res, 401, { error: "That username and password do not match." }); // the same message for both, so usernames cannot be probed
      return true;
    }
    const token = newSessionToken();
    db.createSession(hashToken(token), account.id);
    json(res, 200, { player: publicPlayer(account) }, { "set-cookie": sessionCookie(token, isSecure(req)) });
    return true;
  }
  if (path === "/api/signout" && req.method === "POST") {
    if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      json(res, 415, { error: "Send application/json." });
      return true;
    }
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) db.deleteSession(hashToken(token));
    json(res, 200, { player: null }, { "set-cookie": clearedCookie(isSecure(req)) });
    return true;
  }
  return false;
}

const server = createServer((req, res) => {
  const requestPath = new URL(req.url ?? "/", "http://localhost").pathname;
  if (requestPath.startsWith("/api/") && (requestPath === "/api/me" || requestPath === "/api/guest" || requestPath.startsWith("/api/account/") || requestPath === "/api/signout")) {
    handleIdentity(requestPath, req, res).then((handled) => {
      if (!handled) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
      }
    }).catch((error) => {
      logEvent("persist_error", { error: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) json(res, 500, { error: "Something went wrong. Try again." });
    });
    return;
  }
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
  } else if (path === "/api/leaderboard" && req.method === "GET") {
    if (!allowRead(clientAddress(req))) {
      res.writeHead(429, { "content-type": "text/plain; charset=utf-8", "retry-after": "60" });
      res.end("Too many requests. Try again in a minute.");
      return;
    }
    // `limit` lets a check look past the top 10 on a database with history.
    const limit = Math.min(1000, Math.max(1, Number(new URL(req.url ?? "/", "http://localhost").searchParams.get("limit")) || 10));
    json(res, 200, leaderboardFrom(db, limit));
  } else if (path === "/api/computer" && req.method === "POST") {
    // Play the computer (R33): a game that starts at once, never waiting for anyone.
    if (!allowCreate(clientAddress(req))) {
      res.writeHead(429, { "content-type": "text/plain; charset=utf-8", "retry-after": "60" });
      res.end("Too many games started. Try again in a minute.");
      return;
    }
    const code = generateCode((c) => realtime.game.getGame(c) !== undefined);
    realtime.createComputerGame(code);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ code }));
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

const realtime = attachRealtime(server, db, {
  // The seat's person, from the session cookie on the upgrade request (R28).
  identify: (request) => {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    return (token ? db.playerBySession(hashToken(token), SESSION_MAX_AGE_S * 1000) : undefined)?.id ?? null;
  },
});

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
