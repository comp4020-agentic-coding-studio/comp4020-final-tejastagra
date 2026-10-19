// Anonymous per-browser identity: no accounts (the brief's own restraint),
// but every request has to be attributable to *someone* so the server can
// tell two people apart and the logs can say who did what. A random id is
// set as an HttpOnly cookie on first visit; the person can give it a display
// name, which is stored server-side and looked up on every request after.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";

export interface Identity {
  id: string;
  name: string;
}

const COOKIE_NAME = "uid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function createIdentitiesTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS identities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

// Reads the `uid` cookie off the request; if it's missing or unknown, mints a
// new identity, persists it, and sets the cookie on the response. Called once
// per request before anything else writes to `res`.
export function ensureIdentity(db: DatabaseSync, req: IncomingMessage, res: ServerResponse): Identity {
  const cookies = parseCookies(req.headers.cookie);
  const existingId = cookies[COOKIE_NAME];

  if (existingId) {
    const row = db.prepare("SELECT id, name FROM identities WHERE id = ?").get(existingId) as
      | { id: string; name: string }
      | undefined;
    if (row) return row;
  }

  const id = randomUUID();
  const name = `Guest-${id.slice(0, 4)}`;
  db.prepare("INSERT INTO identities (id, name, created_at) VALUES (?, ?, ?)").run(
    id,
    name,
    new Date().toISOString(),
  );
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${id}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax`);
  return { id, name };
}

export function renameIdentity(db: DatabaseSync, id: string, name: string): Identity {
  db.prepare("UPDATE identities SET name = ? WHERE id = ?").run(name, id);
  return { id, name };
}
