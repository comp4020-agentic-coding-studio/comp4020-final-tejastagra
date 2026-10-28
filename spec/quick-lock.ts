// A lock for the checks that use Quick match, which is one queue shared by the whole running app. vitest runs test files in
// parallel, so a ticket one file leaves waiting for a moment can pair with a ticket of another, and a check that expects
// its own players to meet each other (20 clients into exactly 10 games, two players paired and then watched) sees a stranger
// (correction C21 named the rule: a check on something shared must not depend on other files leaving it alone). Whoever uses
// the queue holds this lock for the whole of its use, so uses never overlap, across files and across worker processes.
// The lock is a directory, made atomically, in the OS temp folder and named for the app under test, so two runs against two
// different apps do not wait for each other. A lock older than a minute belongs to a run that died and is taken over.
import { mkdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inject } from "vitest";

const STALE_MS = 60_000;

export async function withQuickQueue<T>(use: () => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), `rubble-quick-${createHash("sha1").update(inject("baseUrl")).digest("hex").slice(0, 12)}.lock`);
  for (;;) {
    try {
      mkdirSync(dir);
      break;
    } catch {
      try {
        if (Date.now() - statSync(dir).mtimeMs > STALE_MS) rmSync(dir, { recursive: true, force: true });
      } catch {
        // someone else released or took it in the meantime: try again
      }
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
    }
  }
  // The lock's age is its last touch, so a holder that takes a long time (a slow runner) keeps it, and only a holder that
  // has died is taken over after a minute.
  const touch = setInterval(() => {
    try {
      const now = new Date();
      utimesSync(dir, now, now);
    } catch {
      // released already
    }
  }, 5_000);
  try {
    return await use();
  } finally {
    clearInterval(touch);
    rmSync(dir, { recursive: true, force: true });
  }
}
