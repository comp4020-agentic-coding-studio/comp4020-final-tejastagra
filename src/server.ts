import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";

import { openDb, Store } from "./db.ts";
import { identify, shortLabel } from "./identity.ts";
import { renderMarkdown } from "./markdown.ts";
import { makeLogger } from "./log.ts";
import { addClient, removeClient, broadcastToBranch, type Client } from "./realtime.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.WALL_DB_PATH ?? "/data/wall.db";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");

const db = openDb(DB_PATH);
const store = new Store(db);
const log = makeLogger(store);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string): void {
  const full = join(PUBLIC_DIR, path);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(full)] ?? "application/octet-stream" }).end(
      data,
    );
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res
    .writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
    .end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const VALID_TYPES = new Set(["text", "stroke", "shape", "image", "link"]);
const MAX_DATA_LENGTH = 200_000; // bytes of JSON-encoded `data`, generous for a stroke path

function validateObjectInput(body: any): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  if (!VALID_TYPES.has(body.type)) return `type must be one of ${[...VALID_TYPES].join(", ")}`;
  if (typeof body.x !== "number" || typeof body.y !== "number") return "x and y must be numbers";
  if (!Number.isFinite(body.x) || !Number.isFinite(body.y)) return "x and y must be finite";
  if (body.data === undefined) return "data is required";
  const encoded = JSON.stringify(body.data);
  if (encoded.length > MAX_DATA_LENGTH) return "data exceeds the size limit";
  return null;
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  pathname: string,
): Promise<boolean> {
  const method = req.method ?? "GET";
  const requestId = randomUUID();

  // /api/branches/:branchId/objects
  let m = pathname.match(/^\/api\/branches\/([a-zA-Z0-9_-]+)\/objects$/);
  if (m) {
    const branchId = m[1];
    const branch = store.getBranch(branchId);
    if (!branch) {
      log({
        event: "action_rejected",
        user_id: userId,
        branch_id: branchId,
        outcome: "rejected",
        reason: "unknown branch",
        request_id: requestId,
      });
      sendJson(res, 404, { error: "unknown branch" });
      return true;
    }

    if (method === "GET") {
      const objects = store.listObjects(branchId);
      log({
        event: "state_snapshot_sent",
        user_id: userId,
        branch_id: branchId,
        outcome: "ok",
        request_id: requestId,
      });
      sendJson(res, 200, { branch, objects });
      return true;
    }

    if (method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
        return true;
      }
      const err = validateObjectInput(body);
      if (err) {
        log({
          event: "action_rejected",
          user_id: userId,
          branch_id: branchId,
          outcome: "rejected",
          reason: err,
          request_id: requestId,
        });
        sendJson(res, 400, { error: err });
        return true;
      }
      const now = Date.now();
      const obj = store.createObject({
        id: randomUUID(),
        branch_id: branchId,
        type: body.type,
        x: body.x,
        y: body.y,
        data: JSON.stringify(body.data),
        created_by: userId,
        created_at: now,
        updated_at: now,
      });
      log({
        event: "action_received",
        user_id: userId,
        branch_id: branchId,
        object_id: obj.id,
        action: "create",
        outcome: "ok",
        request_id: requestId,
      });
      const sent = broadcastToBranch(branchId, { type: "object_created", object: obj });
      log({
        event: "update_broadcast",
        user_id: userId,
        branch_id: branchId,
        object_id: obj.id,
        action: `create -> ${sent} client(s)`,
        outcome: "ok",
        request_id: requestId,
      });
      sendJson(res, 201, obj);
      return true;
    }

    sendJson(res, 405, { error: "method not allowed" });
    return true;
  }

  // /api/branches/:branchId/objects/:objectId
  m = pathname.match(/^\/api\/branches\/([a-zA-Z0-9_-]+)\/objects\/([a-zA-Z0-9_-]+)$/);
  if (m) {
    const [, branchId, objectId] = m;
    const branch = store.getBranch(branchId);
    if (!branch) {
      sendJson(res, 404, { error: "unknown branch" });
      return true;
    }

    if (method === "PATCH") {
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: "invalid JSON body" });
        return true;
      }
      const patch: { x?: number; y?: number; data?: string } = {};
      if (body.x !== undefined) {
        if (typeof body.x !== "number" || !Number.isFinite(body.x)) {
          sendJson(res, 400, { error: "x must be a finite number" });
          return true;
        }
        patch.x = body.x;
      }
      if (body.y !== undefined) {
        if (typeof body.y !== "number" || !Number.isFinite(body.y)) {
          sendJson(res, 400, { error: "y must be a finite number" });
          return true;
        }
        patch.y = body.y;
      }
      if (body.data !== undefined) {
        const encoded = JSON.stringify(body.data);
        if (encoded.length > MAX_DATA_LENGTH) {
          sendJson(res, 400, { error: "data exceeds the size limit" });
          return true;
        }
        patch.data = encoded;
      }
      const existing = store.getObject(branchId, objectId);
      if (!existing) {
        log({
          event: "action_rejected",
          user_id: userId,
          branch_id: branchId,
          object_id: objectId,
          outcome: "rejected",
          reason: "object not found",
          request_id: requestId,
        });
        sendJson(res, 404, { error: "object not found" });
        return true;
      }
      // Same-object conflict policy: server-accepted last-write-wins. The
      // update that reaches the server last simply overwrites; no merge, no
      // version check against the client's view. See
      // docs/adr/0001-realtime-and-conflicts.md.
      const updated = store.updateObject(branchId, objectId, patch)!;
      log({
        event: "action_received",
        user_id: userId,
        branch_id: branchId,
        object_id: objectId,
        action: "update",
        outcome: "ok",
        request_id: requestId,
      });
      const sent = broadcastToBranch(branchId, { type: "object_updated", object: updated });
      log({
        event: "update_broadcast",
        user_id: userId,
        branch_id: branchId,
        object_id: objectId,
        action: `update -> ${sent} client(s)`,
        outcome: "ok",
        request_id: requestId,
      });
      sendJson(res, 200, updated);
      return true;
    }

    if (method === "DELETE") {
      const deleted = store.deleteObject(branchId, objectId);
      if (!deleted) {
        log({
          event: "action_rejected",
          user_id: userId,
          branch_id: branchId,
          object_id: objectId,
          outcome: "rejected",
          reason: "object not found",
          request_id: requestId,
        });
        sendJson(res, 404, { error: "object not found" });
        return true;
      }
      log({
        event: "action_received",
        user_id: userId,
        branch_id: branchId,
        object_id: objectId,
        action: "delete",
        outcome: "ok",
        request_id: requestId,
      });
      const sent = broadcastToBranch(branchId, { type: "object_deleted", id: objectId });
      log({
        event: "update_broadcast",
        user_id: userId,
        branch_id: branchId,
        object_id: objectId,
        action: `delete -> ${sent} client(s)`,
        outcome: "ok",
        request_id: requestId,
      });
      sendJson(res, 200, { ok: true });
      return true;
    }

    sendJson(res, 405, { error: "method not allowed" });
    return true;
  }

  // /api/branches/:branchId/fork
  m = pathname.match(/^\/api\/branches\/([a-zA-Z0-9_-]+)\/fork$/);
  if (m && method === "POST") {
    const parentId = m[1];
    const parent = store.getBranch(parentId);
    if (!parent) {
      sendJson(res, 404, { error: "unknown parent branch" });
      return true;
    }
    const newId = randomUUID();
    const branch = store.forkBranch(parentId, newId);
    log({
      event: "action_received",
      user_id: userId,
      branch_id: newId,
      action: `fork from ${parentId}`,
      outcome: "ok",
      request_id: requestId,
    });
    sendJson(res, 201, branch);
    return true;
  }

  return false;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  if (pathname === "/") {
    serveStatic(req, res, "index.html");
    return;
  }

  if (pathname === "/readme/" || pathname === "/readme") {
    try {
      const md = readFileSync(join(ROOT, "README.md"), "utf8");
      const body = renderMarkdown(md);
      res
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Wall — README</title>
<link rel="stylesheet" href="/styles.css"></head>
<body class="readme"><main>${body}</main></body></html>`);
    } catch {
      res.writeHead(500).end("README.md missing");
    }
    return;
  }

  if (pathname.startsWith("/api/")) {
    const userId = identify(req, res);
    const handled = await handleApi(req, res, userId, pathname).catch((e) => {
      sendJson(res, 500, { error: String(e) });
      return true;
    });
    if (handled) return;
    sendJson(res, 404, { error: "not found" });
    return;
  }

  if (pathname === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }

  serveStatic(req, res, pathname.replace(/^\//, ""));
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const branchId = url.searchParams.get("branch") ?? "main";
  const branch = store.getBranch(branchId);
  if (!branch) {
    socket.destroy();
    return;
  }

  // Reuse the same cookie-based identity as HTTP requests, minting one if
  // the WS upgrade is the client's first contact.
  const fakeRes = {
    setHeader: () => {},
  } as unknown as ServerResponse;
  const userId = identify(req as IncomingMessage, fakeRes);

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, { userId, branchId });
  });
});

wss.on("connection", (ws: WebSocket, _req: IncomingMessage, ctx: { userId: string; branchId: string }) => {
  const client: Client = { ws, userId: ctx.userId, branchId: ctx.branchId };
  addClient(client);
  log({ event: "user_join", user_id: ctx.userId, branch_id: ctx.branchId, outcome: "ok" });

  const objects = store.listObjects(ctx.branchId);
  ws.send(JSON.stringify({ type: "snapshot", objects, you: shortLabel(ctx.userId) }));
  log({ event: "state_snapshot_sent", user_id: ctx.userId, branch_id: ctx.branchId, outcome: "ok" });

  ws.on("message", (raw) => {
    // Presence/cursor messages are ephemeral: relayed to the branch, never
    // persisted. Durable object changes go through the HTTP API above, not
    // this socket, so the server-side validation path is the only one.
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg?.type === "cursor") {
      broadcastToBranch(
        ctx.branchId,
        { type: "cursor", userId: shortLabel(ctx.userId), x: msg.x, y: msg.y },
        client,
      );
    }
  });

  ws.on("close", () => {
    removeClient(client);
    log({ event: "user_leave", user_id: ctx.userId, branch_id: ctx.branchId, outcome: "ok" });
    broadcastToBranch(ctx.branchId, { type: "presence_left", userId: shortLabel(ctx.userId) });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: "server_started", port: PORT }));
});
