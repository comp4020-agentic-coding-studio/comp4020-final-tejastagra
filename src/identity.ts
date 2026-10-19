// Anonymous per-browser identity: an HttpOnly cookie minted on first
// contact, never read or set by client JS. No accounts, no real names —
// this is the whole of "privacy by default" for The Wall.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const COOKIE_NAME = "wall_id";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function identify(req: IncomingMessage, res: ServerResponse): string {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[COOKIE_NAME];
  if (existing && /^[a-f0-9-]{36}$/.test(existing)) return existing;

  const id = randomUUID();
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 365}`,
  );
  return id;
}

// A short, stable, display-friendly label derived from the full id — shown
// in the UI so people can tell cursors/objects apart without exposing the
// raw cookie value.
export function shortLabel(id: string): string {
  return id.slice(0, 8);
}

const MAX_NICKNAME_LENGTH = 24;

// A nickname is purely cosmetic, sent fresh with every cursor ping, never
// persisted and never a stand-in for the real (HttpOnly cookie) identity
// anything is logged or permissioned against. Still sanitised before ever
// being broadcast to other clients: capped in length and stripped of
// control/non-printable characters, the same caution this app applies to
// every other client-supplied string.
export function sanitiseNickname(raw: string): string {
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, MAX_NICKNAME_LENGTH);
}
