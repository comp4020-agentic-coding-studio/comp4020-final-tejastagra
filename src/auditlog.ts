// Server-side audit log: every mutating action, who did it, and whether it
// was allowed. Two sinks, same event: stdout (what `flyctl logs` tails live
// at the crit) and a SQLite table on the same persistent volume as the tasks
// (what outlives the crit and the process — see docs/adr/0002). The crit spec
// is narrated from this, not from clicking through the UI.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  taskId: string | null;
  allowed: boolean;
  detail: string | null;
}

export function createAuditTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      task_id TEXT,
      allowed INTEGER NOT NULL,
      detail TEXT
    )
  `);
}

export function logAction(
  db: DatabaseSync,
  entry: Omit<AuditEntry, "id" | "at">,
): AuditEntry {
  const full: AuditEntry = { id: randomUUID(), at: new Date().toISOString(), ...entry };
  db.prepare(
    `INSERT INTO audit_log (id, at, actor_id, actor_name, action, task_id, allowed, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(full.id, full.at, full.actorId, full.actorName, full.action, full.taskId, full.allowed ? 1 : 0, full.detail);

  // One line per action, structured so `flyctl logs -a <repo>` is enough to
  // narrate "who did what" at the crit without a second tool.
  const verdict = full.allowed ? "ALLOWED" : "DENIED";
  const target = full.taskId ? ` task=${full.taskId}` : "";
  const detail = full.detail ? ` ${full.detail}` : "";
  console.log(`[audit] ${verdict} ${full.action}${target} actor=${full.actorName}(${full.actorId})${detail}`);

  return full;
}

export function recentAuditLog(db: DatabaseSync, limit = 100): AuditEntry[] {
  const rows = db
    .prepare("SELECT * FROM audit_log ORDER BY at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    at: r.at as string,
    actorId: r.actor_id as string,
    actorName: r.actor_name as string,
    action: r.action as string,
    taskId: (r.task_id as string | null) ?? null,
    allowed: Boolean(r.allowed),
    detail: (r.detail as string | null) ?? null,
  }));
}
