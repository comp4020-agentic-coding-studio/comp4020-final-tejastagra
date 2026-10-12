// Taskflow server: static frontend, a small JSON API, /readme/, and a
// WebSocket channel that broadcasts every task change so open sessions stay
// in sync without a reload. One process, one SQLite file on the Fly volume —
// deliberately no framework (see PROCESS.md for why).
import { createServer } from "node:http";
import { readFile, readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { openDb, TaskStore } from "./db.ts";
import { broadcast } from "./realtime.ts";
import { renderMarkdown } from "./markdown.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const README_PATH = join(__dirname, "..", "README.md");
const PORT = Number(process.env.PORT ?? 8080);

const db = openDb();
const store = new TaskStore(db);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(data);
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const readmePage = () => {
  const md = readFileSync(README_PATH, "utf8");
  const body = renderMarkdown(md);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Taskflow — README</title>
<style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.6}
code{background:#f1f1f1;padding:0.1em 0.3em;border-radius:3px}
pre code{display:block;padding:1em;overflow-x:auto}</style>
</head>
<body>${body}</body>
</html>`;
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const { pathname } = url;

    if (pathname === "/readme/" || pathname === "/readme") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readmePage());
      return;
    }

    if (pathname === "/api/tasks" && req.method === "GET") {
      sendJson(res, 200, store.all());
      return;
    }

    if (pathname === "/api/tasks" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        sendJson(res, 400, { error: "title is required" });
        return;
      }
      const description = typeof body.description === "string" ? body.description.trim() || null : null;
      const task = store.create(title, description);
      broadcast(wss, { type: "created", task });
      sendJson(res, 201, task);
      return;
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === "PATCH") {
      const id = taskMatch[1];
      const body = JSON.parse((await readBody(req)) || "{}");
      const expectedVersion = Number(body.version);
      if (!Number.isFinite(expectedVersion)) {
        sendJson(res, 400, { error: "version is required" });
        return;
      }
      const changes: { completed?: boolean; title?: string; description?: string | null } = {};
      if (typeof body.completed === "boolean") changes.completed = body.completed;
      if (typeof body.title === "string") changes.title = body.title.trim();
      if (typeof body.description === "string" || body.description === null) {
        changes.description = body.description;
      }
      const result = store.update(id, changes, expectedVersion);
      if (result === undefined) {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      if (result === "conflict") {
        sendJson(res, 409, { error: "conflict", current: store.get(id) });
        return;
      }
      broadcast(wss, { type: "updated", task: result });
      sendJson(res, 200, result);
      return;
    }

    if (taskMatch && req.method === "DELETE") {
      const id = taskMatch[1];
      const body = JSON.parse((await readBody(req)) || "{}");
      const expectedVersion = Number(body.version);
      const result = store.delete(id, expectedVersion);
      if (result === "missing") {
        sendJson(res, 404, { error: "not found" });
        return;
      }
      if (result === "conflict") {
        sendJson(res, 409, { error: "conflict", current: store.get(id) });
        return;
      }
      broadcast(wss, { type: "deleted", id });
      sendJson(res, 204, null);
      return;
    }

    // Static files, defaulting "/" to index.html.
    const safePath = pathname === "/" ? "/index.html" : pathname;
    if (safePath.includes("..")) {
      res.writeHead(400);
      res.end();
      return;
    }
    const filePath = join(PUBLIC_DIR, safePath);
    readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      res.end(data);
    });
  } catch (err) {
    sendJson(res, 500, { error: String(err) });
  }
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  // No per-connection state needed: clients fetch /api/tasks for the current
  // snapshot on load/reconnect, then listen here for live diffs.
  ws.on("error", () => {});
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Taskflow listening on 0.0.0.0:${PORT}`);
});
