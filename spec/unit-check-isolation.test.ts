// Unit check: needs no running app. H1 and H2 in spec/CHECKS.md (correction C22): `pnpm check` runs against its own
// test server with a temporary data folder, never against the dev database.
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = "scripts/check.sh";

// Runs the wrapper with a "test command" of our own instead of vitest, so we can see what it set up.
function run(env: Record<string, string>, command: string) {
  return spawnSync("bash", [script], {
    // The outer `pnpm check` exports CHECK_DB_PATH for its own server; the wrapper under test must not inherit it.
    env: { ...process.env, CHECK_DB_PATH: "", CHECK_COMMAND: command, CHECK_SKIP_TYPECHECK: "1", ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("H1 pnpm check never writes to data-dev/ (C22)", () => {
  it("H1 the wrapper exists and package.json runs it for `pnpm check`", () => {
    expect(existsSync(script)).toBe(true);
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts.check).toContain("scripts/check.sh");
    expect(pkg.scripts["check:isolated"], "the old separate script is gone: this is the only way").toBeUndefined();
    expect(pkg.scripts["test:e2e"], "the browser checks also use their own server").toContain("scripts/e2e.sh");
    expect(readFileSync("scripts/e2e.sh", "utf8")).toContain("scripts/check.sh");
  });

  it("H1 without APP_URL the test server gets a temporary data folder that is not data-dev, an APP_URL for it, and the folder is deleted afterwards", () => {
    const probe = join(mkdtempSync(join(tmpdir(), "rubble-probe-")), "seen.txt");
    const result = run(
      { APP_URL: "" },
      // Report what the wrapper gave us: the app address, whether it answers, and which database file the server was told to use.
      `node -e "const fs=require('fs');fs.writeFileSync('${probe}', JSON.stringify({url:process.env.APP_URL, db:process.env.CHECK_DB_PATH}))"`,
    );
    expect(result.status, result.stderr + result.stdout).toBe(0);
    const seen = JSON.parse(readFileSync(probe, "utf8"));
    expect(seen.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(seen.url).not.toBe("http://localhost:8080"); // never the dev server's port
    expect(seen.db).toBeTruthy();
    expect(seen.db).not.toContain("data-dev");
    expect(seen.db.startsWith(tmpdir()) || seen.db.startsWith("/tmp") || seen.db.startsWith("/var")).toBe(true);
    expect(existsSync(seen.db), "the temporary database is deleted afterwards").toBe(false);
    rmSync(join(probe, ".."), { recursive: true, force: true });
  });

  it("H1 a run does not change data-dev/: its database file keeps the same size and modified time", () => {
    // Make sure there is a dev database to guard: on a machine where data-dev/ was cleared there would be nothing to compare.
    const dev = "data-dev/rubble.db";
    const made = !existsSync(dev);
    if (made) {
      mkdirSync("data-dev", { recursive: true });
      writeFileSync(dev, "sentinel: a stand-in for the dev database, never read by the app");
    }
    const before = statSync(dev);
    // A real (small) check against the real server the wrapper starts: the invariants file, which only reads.
    const result = run({ APP_URL: "" }, "pnpm exec vitest run spec/invariants.test.ts");
    expect(result.status, result.stderr + result.stdout).toBe(0);
    const after = statSync(dev);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    if (made) rmSync(dev, { force: true }); // leave data-dev/ as it was found
    // And the test app really did run: the data it wrote went somewhere else and was removed.
    expect(result.stdout + result.stderr).toMatch(/passed|Tests/);
  }, 30_000); // it starts a whole test server, which takes longer than 5 seconds on a busy machine (the limit is time, not the check)

  it("H1 the wrapper's server never uses the default dev path: its source passes a temporary RUBBLE_DB_PATH", () => {
    const source = readFileSync(script, "utf8");
    const code = source.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n"); // comments may name data-dev/; code may not use it
    expect(code).toMatch(/RUBBLE_DB_PATH="\$DATA\/rubble\.db"/);
    expect(code).toMatch(/mktemp -d/);
    expect(code).not.toMatch(/data-dev/);
    expect(code).not.toMatch(/\bDEV=1\b/); // DEV=1 makes the server use ./data-dev
  });
});

describe("H2 CI is unchanged: an APP_URL from the caller is used as it is", () => {
  it("H2 with APP_URL set the wrapper starts no server and passes the address through", () => {
    const probe = join(mkdtempSync(join(tmpdir(), "rubble-probe-")), "seen.txt");
    const result = run(
      { APP_URL: "http://localhost:9" },
      `node -e "require('fs').writeFileSync('${probe}', JSON.stringify({url:process.env.APP_URL, db:process.env.CHECK_DB_PATH ?? null}))"`,
    );
    expect(result.status, result.stderr + result.stdout).toBe(0);
    const seen = JSON.parse(readFileSync(probe, "utf8"));
    expect(seen).toEqual({ url: "http://localhost:9", db: "" }); // set to empty by this test, and never filled in by the wrapper
    rmSync(join(probe, ".."), { recursive: true, force: true });
  });

  it("H2 the wrapper cleans up even when the tests fail, and returns their exit status", () => {
    const result = run({ APP_URL: "" }, "exit 3");
    expect(result.status).toBe(3);
    expect(execFileSync("bash", ["-c", "ls /tmp | grep -c rubble-check- || true"], { encoding: "utf8" }).trim()).toBe("0");
  });
});

