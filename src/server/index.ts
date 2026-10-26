import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { marked } from "marked";
import { logEvent } from "./log.ts";
import { openDb } from "./db.ts";
import { attachRealtime } from "./realtime.ts";
import { bundleClient } from "./client-bundle.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DEV = process.env.DEV === "1";
const DB_PATH = process.env.RUBBLE_DB_PATH ?? (DEV ? "./data-dev/rubble.db" : "/data/rubble.db");
const startedAt = String(Date.now());

const db = openDb(DB_PATH);

// Bundled once at start; pnpm dev's --watch restarts the whole process on
// any source change, so this never goes stale while developing.
const clientBundles: Record<string, string> = {
  "game.js": bundleClient("src/client/game.ts"),
};

const reloadScript = DEV
  ? `<script>(function(){var v;setInterval(function(){fetch("/__dev/version").then(function(r){return r.text()}).then(function(t){if(v&&v!==t)location.reload();v=t}).catch(function(){})},700)})()</script>`
  : "";

function page(title: string, body: string, script?: string): string {
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
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

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (DEV && path === "/__dev/version") {
    res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
    res.end(startedAt);
  } else if (path === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page("Rubble", `<main><h1>Rubble</h1><p>Simultaneous Connect 4. Coming soon.</p><p><a href="/readme/">About this app</a></p></main>`));
  } else if (path === "/readme/" || path === "/readme") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readme());
  } else if (path.startsWith("/static/") && path.slice("/static/".length) in clientBundles) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(clientBundles[path.slice("/static/".length)]);
  } else {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

attachRealtime(server, db);

server.listen(PORT, "0.0.0.0", () => {
  logEvent("server_start", { port: PORT });
});
