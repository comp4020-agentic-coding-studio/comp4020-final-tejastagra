// Who a visitor is (R28 to R31, ADR 0004). A guest is a nickname plus a
// long-lived httpOnly cookie; a guest may later become an account with a
// username and password, keeping the same player id so their games stay
// theirs (R29). Passwords exist only as bcrypt hashes (R30). The cookie holds
// an opaque random token; only its SHA-256 is stored, so a leaked database
// does not hand out sessions.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

export const SESSION_COOKIE = "rubble_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 365;
const BCRYPT_ROUNDS = 10;

const NICKNAME_PATTERN = /^[A-Za-z0-9 _-]{2,16}$/; // R28
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/; // R29 (the length and characters are an implementation note in rules.md)
const MIN_PASSWORD = 8; // R29
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything past 72 bytes, so refuse rather than silently truncate

export function validNickname(value: unknown): value is string {
  return typeof value === "string" && NICKNAME_PATTERN.test(value) && value.trim().length >= 2;
}

export function validUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_PATTERN.test(value);
}

export function passwordProblem(value: unknown): string | null {
  if (typeof value !== "string") return "Enter a password.";
  if (value.length < MIN_PASSWORD) return `A password needs at least ${MIN_PASSWORD} characters.`;
  if (Buffer.byteLength(value) > MAX_PASSWORD_BYTES) return `A password can be at most ${MAX_PASSWORD_BYTES} bytes long.`;
  return null;
}

export function newPlayerId(): string {
  return randomUUID();
}

// R31: a short tag from the id, shown wherever a guest is shown.
export function shortTag(id: string): string {
  return id.replace(/-/g, "").slice(0, 4);
}

export interface PublicPlayer {
  displayName: string;
  kind: "guest" | "account";
}

export function publicPlayer(player: { id: string; nickname: string; username: string | null }): PublicPlayer {
  return player.username
    ? { displayName: player.username, kind: "account" }
    : { displayName: `${player.nickname} #${shortTag(player.id)}`, kind: "guest" };
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// A hash to compare against when the username does not exist, so a wrong
// username and a wrong password take about the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export async function checkPassword(password: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_S}${secure ? "; Secure" : ""}`;
}

export function clearedCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}
