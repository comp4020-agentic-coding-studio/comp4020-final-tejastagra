// The account jobs that are not a page: the admin's password reset (R86, ADR 0013) and the limit on sign-in attempts (R88).
// Nothing here ever returns, stores or logs a password in the clear after it has been shown once to the admin.
import { randomInt } from "node:crypto";
import type { Db } from "./db.ts";
import { hashPassword } from "./identity.ts";
import { logEvent } from "./log.ts";

// 12 characters from an alphabet with nothing that looks like something else: no 0 O 1 l I 5 S 2 Z 8 B, and no vowels,
// so a temporary password is never a word either.
export const TEMP_ALPHABET = "cdfghjkmnpqrtvwxyz34679CDFGHJKMNPQRTVWXY";
const TEMP_LENGTH = 12;

export function newTemporaryPassword(): string {
  let out = "";
  for (let i = 0; i < TEMP_LENGTH; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}

export type ResetResult = { ok: true; password: string } | { ok: false; reason: "no such username" };

// Sets a random temporary password for the account, stores only its hash, marks it must-change and ends its sessions. The
// caller (the admin's script) shows the password once. The log line carries the username and nothing else (R86).
export async function adminResetPassword(db: Db, username: string): Promise<ResetResult> {
  const account = username ? db.playerByUsername(username) : undefined;
  if (!account) return { ok: false, reason: "no such username" };
  const password = newTemporaryPassword();
  db.setPassword(account.id, await hashPassword(password), { mustChange: true });
  logEvent("admin_reset", { username: account.username ?? username });
  return { ok: true, password };
}

// R88: 5 failed sign-ins for one username in 15 minutes block it for the rest of the 15 minutes since the first failure.
// Per username, case-insensitive, in memory with an expiry, and with a hard cap on how many usernames it will remember, so
// a flood of made-up names cannot fill the machine (CLAUDE.md). A name that has been forgotten for the cap starts from zero.
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 10_000;

export function attemptLimiter(now: () => number = Date.now) {
  const failures = new Map<string, { first: number; count: number }>();
  const key = (username: string) => username.trim().toLowerCase();
  // Sweeping walks the map, so it runs at most once a second: a flood of sign-ins costs one pass a second, not one per request.
  let swept = Number.NEGATIVE_INFINITY;
  function sweep(force = false): void {
    const t = now();
    if (!force && t - swept < 1000) return;
    swept = t;
    for (const [name, f] of failures) if (t - f.first >= FAILURE_WINDOW_MS) failures.delete(name);
  }
  return {
    blocked(username: string): boolean {
      sweep();
      const f = failures.get(key(username));
      return !!f && f.count >= MAX_FAILURES && now() - f.first < FAILURE_WINDOW_MS; // exact even between sweeps
    },
    fail(username: string): void {
      sweep();
      const k = key(username);
      const f = failures.get(k);
      if (f) {
        f.count++;
        return;
      }
      if (failures.size >= MAX_TRACKED) {
        // Make room by dropping the longest-tracked name that is NOT blocked. A blocked name is never evicted: flooding the map
        // with made-up names must not unblock a victim's username so it can be guessed at again (R88).
        let evict: string | undefined;
        for (const [name, entry] of failures) {
          if (entry.count < MAX_FAILURES) {
            evict = name;
            break; // the map keeps insertion order: this is the one tracked longest
          }
        }
        if (evict === undefined) return; // 10,000 names are all blocked: a new name is not tracked, and costs the attacker a rate-limited request each
        failures.delete(evict);
      }
      failures.set(k, { first: now(), count: 1 });
    },
    succeed(username: string): void {
      failures.delete(key(username));
    },
    size(): number {
      sweep(true);
      return failures.size;
    },
  };
}
