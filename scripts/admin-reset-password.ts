// The admin's password reset (R86, ADR 0013, docs/admin.md). Run on the server:
//   node scripts/admin-reset-password.ts <username>
// It prints a temporary password once and stores only its hash. It never writes a password to the log.
import { existsSync } from "node:fs";
import { adminResetPassword } from "../src/server/accounts.ts";
import { openDb } from "../src/server/db.ts";

const username = process.argv[2]?.trim();
if (!username) {
  console.error("Usage: node scripts/admin-reset-password.ts <username>");
  process.exit(2);
}
// On the server the database is the Fly volume. Anywhere else the path must be named, so a reset never lands in a database
// by accident (the dev server's data-dev/ is never touched unless asked for).
const dbPath = process.env.RUBBLE_DB_PATH ?? "/data/rubble.db";
if (!process.env.RUBBLE_DB_PATH && !existsSync("/data")) {
  console.error("There is no /data volume here. Set RUBBLE_DB_PATH to the database you mean, or run this on the server.");
  process.exit(2);
}
if (!existsSync(dbPath)) {
  console.error(`There is no database at ${dbPath}, so nothing was changed. Check the path: a reset never creates a database.`);
  process.exit(2);
}
const db = openDb(dbPath);
const result = await adminResetPassword(db, username);
db.close();
if (!result.ok) {
  console.error(`No account has the username "${username}". Nothing was changed.`);
  process.exit(1);
}
console.log(`Temporary password for ${username}: ${result.password}`);
console.log("It works for one sign-in: the player must then choose a new password. It is not stored and not logged: copy it now.");
