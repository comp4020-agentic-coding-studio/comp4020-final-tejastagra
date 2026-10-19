import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";

import { openDb, Store } from "./db.ts";
import { identify, sanitiseNickname, shortLabel } from "./identity.ts";
import { renderMarkdown } from "./markdown.ts";
import { makeLogger } from "./log.ts";
import { addClient, removeClient, broadcastToBranch, type Client } from "./realtime.ts";
import { classifyMusicUrl, isAllowedEmbedUrl } from "./links.ts";
import {
  ImageTooLargeError,
  UnsupportedImageError,
  resolveUploadPath,
  saveImage,
} from "./uploads.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.WALL_DB_PATH ?? "/data/wall.db";
const UPLOADS_ROOT = process.env.WALL_UPLOADS_PATH ?? "/data/uploads";
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
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
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
    res
      .writeHead(200, {
        "Content-Type": MIME[extname(full)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      })
      .end(data);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res
    .writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
    .end(JSON.stringify(body));
}

class BodyTooLargeError extends Error {}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new BodyTooLargeError("body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// After rejecting a body for being too large, the client may still be
// mid-send of a much larger payload than we read. Leaving those bytes
// unread on a keep-alive connection corrupts the *next* request that
// reuses the same socket (the leftover bytes get parsed as that request's
// data) — found via a real, reproducible test hang: a test posting an
// oversized body followed by any other request on the same connection
// would time out. Telling the client to close the connection, then
// destroying the socket once the error response is flushed, is what
// actually prevents that — rejecting the response alone isn't enough.
// Trade-off, not a bug: closing the connection this early (rather than
// draining the rest of a multi-MB body just to discard it, which would
// reopen the DoS cost this is meant to avoid) means a client that's still
// mid-upload when this fires can see either this clean 400 response or a
// lower-level connection error (e.g. EPIPE), depending on exactly how much
// of its body was still in flight. Both are acceptable outcomes for "your
// request was too large" — see spec/objects.test.ts's oversized-upload
// test, which accepts either.
function sendJsonAndCloseConnection(res: ServerResponse, status: number, body: unknown): void {
  res.setHeader("Connection", "close");
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body), () => res.socket?.destroy());
}

const VALID_TYPES = new Set(["text", "stroke", "sticky", "image", "music", "embed"]);
const MAX_DATA_LENGTH = 200_000; // bytes of JSON-encoded `data`, generous for a stroke path
const MAX_BODY_BYTES = 1_000_000;
const MAX_IMAGE_BODY_BYTES = 3_000_000; // base64 overhead over the 2MB decoded image cap

const STICKY_COLORS = new Set(["#fff2a8", "#ffd1e6", "#bfe3ff", "#c8f2d4", "#ffdcb0"]);

// Per-type `data` validation, run after the shared shape checks below. Each
// function either returns the (possibly server-normalised) data to store, or
// a string rejection reason.
function validateTypedData(type: string, data: any): { data: unknown } | { error: string } {
  switch (type) {
    case "text":
    case "sticky": {
      if (typeof data.text !== "string") return { error: "data.text must be a string" };
      if (type === "sticky" && !STICKY_COLORS.has(data.color)) {
        return { error: `data.color must be one of ${[...STICKY_COLORS].join(", ")}` };
      }
      return { data: { text: data.text, color: data.color ?? "#1c1a17" } };
    }
    case "stroke": {
      if (!Array.isArray(data.points)) return { error: "data.points must be an array" };
      return { data };
    }
    case "music": {
      if (typeof data.url !== "string") return { error: "data.url must be a string" };
      const platform = classifyMusicUrl(data.url);
      if (!platform) {
        return { error: "data.url must be a Spotify, YouTube or SoundCloud link" };
      }
      return { data: { url: data.url, platform } };
    }
    case "embed": {
      if (typeof data.url !== "string") return { error: "data.url must be a string" };
      if (!isAllowedEmbedUrl(data.url)) {
        return { error: "data.url is not on the embed allow-list" };
      }
      return { data: { url: data.url } };
    }
    case "image":
      // handled separately in the POST /objects route — image data arrives
      // as a base64 upload and is replaced with a saved-file reference
      // before it ever reaches validateTypedData.
      return { data };
    default:
      return { error: `unknown type ${type}` };
  }
}

function validateObjectInput(body: any): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  if (!VALID_TYPES.has(body.type)) return `type must be one of ${[...VALID_TYPES].join(", ")}`;
  if (typeof body.x !== "number" || typeof body.y !== "number") return "x and y must be numbers";
  if (!Number.isFinite(body.x) || !Number.isFinite(body.y)) return "x and y must be finite";
  if (body.data === undefined || typeof body.data !== "object") return "data is required";
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
      // Only an image upload's base64 payload needs the larger cap; every
      // other type's `data` is capped at MAX_DATA_LENGTH anyway, so reject
      // an oversized non-image body by its declared Content-Length before
      // reading any of it off the wire, rather than buffering up to 3MB
      // just to discover it isn't an image.
      const declaredLength = Number(req.headers["content-length"] ?? 0);
      const cap = declaredLength > MAX_BODY_BYTES ? MAX_IMAGE_BODY_BYTES : MAX_BODY_BYTES;
      let body: any;
      try {
        body = await readJsonBody(req, cap);
      } catch (e) {
        if (e instanceof BodyTooLargeError) {
          sendJsonAndCloseConnection(res, 400, { error: "body too large" });
        } else {
          sendJson(res, 400, { error: "invalid JSON body" });
        }
        return true;
      }
      if (body.type !== "image" && declaredLength > MAX_BODY_BYTES) {
        sendJson(res, 400, { error: "body too large for this type" });
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

      let storedData: unknown;
      if (body.type === "image") {
        try {
          if (typeof body.data.imageBase64 !== "string") {
            throw new UnsupportedImageError("data.imageBase64 is required");
          }
          storedData = saveImage(UPLOADS_ROOT, branchId, body.data.imageBase64);
        } catch (e) {
          const reason =
            e instanceof ImageTooLargeError || e instanceof UnsupportedImageError
              ? e.message
              : "could not process image";
          log({
            event: "action_rejected",
            user_id: userId,
            branch_id: branchId,
            outcome: "rejected",
            reason,
            request_id: requestId,
          });
          sendJson(res, 400, { error: reason });
          return true;
        }
      } else {
        const typed = validateTypedData(body.type, body.data);
        if ("error" in typed) {
          log({
            event: "action_rejected",
            user_id: userId,
            branch_id: branchId,
            outcome: "rejected",
            reason: typed.error,
            request_id: requestId,
          });
          sendJson(res, 400, { error: typed.error });
          return true;
        }
        storedData = typed.data;
      }

      const now = Date.now();
      const obj = store.createObject({
        id: randomUUID(),
        branch_id: branchId,
        type: body.type,
        x: body.x,
        y: body.y,
        data: JSON.stringify(storedData),
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
        body = await readJsonBody(req, MAX_BODY_BYTES);
      } catch (e) {
        if (e instanceof BodyTooLargeError) {
          sendJsonAndCloseConnection(res, 400, { error: "body too large" });
        } else {
          sendJson(res, 400, { error: "invalid JSON body" });
        }
        return true;
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
        if (existing.type === "image") {
          // An uploaded image's data is server-generated on create (the
          // saved file path) and never client-editable afterwards.
          sendJson(res, 400, { error: "image data cannot be edited" });
          return true;
        }
        // Re-run the same per-type validation POST uses — a PATCH is just
        // as capable of smuggling an unvalidated URL/colour as a POST, and
        // skipping this check here was a real, fixed vulnerability: it let
        // a PATCH silently replace a validated embed/music URL with an
        // arbitrary one after creation, bypassing the allow-list entirely.
        const typed = validateTypedData(existing.type, body.data);
        if ("error" in typed) {
          log({
            event: "action_rejected",
            user_id: userId,
            branch_id: branchId,
            object_id: objectId,
            outcome: "rejected",
            reason: typed.error,
            request_id: requestId,
          });
          sendJson(res, 400, { error: typed.error });
          return true;
        }
        const encoded = JSON.stringify(typed.data);
        if (encoded.length > MAX_DATA_LENGTH) {
          sendJson(res, 400, { error: "data exceeds the size limit" });
          return true;
        }
        patch.data = encoded;
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

  const uploadMatch = pathname.match(/^\/uploads\/([^/]+)\/([^/]+)$/);
  if (uploadMatch) {
    const [, branchId, file] = uploadMatch;
    const full = resolveUploadPath(UPLOADS_ROOT, branchId, file);
    if (!full) {
      res.writeHead(404).end("Not found");
      return;
    }
    readFile(full, (err, data) => {
      if (err) {
        res.writeHead(404).end("Not found");
        return;
      }
      res
        .writeHead(200, {
          "Content-Type": MIME[extname(full)] ?? "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        })
        .end(data);
    });
    return;
  }

  if (pathname === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }

  serveStatic(req, res, pathname.replace(/^\//, ""));
});

function displayLabel(client: Client): string {
  return client.nickname || shortLabel(client.userId);
}

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
      if (typeof msg.nickname === "string") {
        client.nickname = sanitiseNickname(msg.nickname);
      }
      broadcastToBranch(
        ctx.branchId,
        { type: "cursor", userId: displayLabel(client), x: msg.x, y: msg.y },
        client,
      );
    }
  });

  ws.on("close", () => {
    removeClient(client);
    log({ event: "user_leave", user_id: ctx.userId, branch_id: ctx.branchId, outcome: "ok" });
    broadcastToBranch(ctx.branchId, { type: "presence_left", userId: displayLabel(client) });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: "server_started", port: PORT }));
});
