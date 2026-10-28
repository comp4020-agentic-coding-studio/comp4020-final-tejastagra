// A lock for the browser checks that use Quick match, which is one queue shared by the whole running app. Playwright runs test
// files in parallel workers, so a ticket one check leaves waiting for a moment pairs with a ticket of another, and a spectator
// ends up watching a game that is not the one the check made (the same reason as spec/quick-lock.ts, correction C26). Whoever
// uses the queue holds this lock for the whole of its use. The lock is a directory made atomically in the OS temp folder and
// named for the app under test; a lock nobody has touched for a minute belongs to a run that died and is taken over, and a live
// holder touches it every five seconds so a slow run never loses it.
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STALE_MS = 60_000;

export async function withQuickQueue<T>(use: () => Promise<T>): Promise<T> {
  const app = process.env.APP_URL ?? "http://localhost:8080";
  const dir = join(tmpdir(), `rubble-e2e-quick-${createHash("sha1").update(app).digest("hex").slice(0, 12)}.lock`);
  for (;;) {
    try {
      mkdirSync(dir);
      break;
    } catch {
      try {
        if (Date.now() - statSync(dir).mtimeMs > STALE_MS) rmSync(dir, { recursive: true, force: true });
      } catch {
        // released or taken in the meantime: try again
      }
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
    }
  }
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
