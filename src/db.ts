// Persistence for Taskflow. Uses node:sqlite (built into Node 24, no native
// build step) rather than better-sqlite3 — same durability guarantee, no
// compiler toolchain needed in the Docker image.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// fly.toml mounts the volume at /data; that's the only storage that survives
// a restart or redeploy. DB_PATH is overridable for local dev and tests.
const DB_PATH = process.env.DB_PATH ?? "/data/taskflow.db";

export function openDb(path: string = DB_PATH): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    )
  `);
  return db;
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    completed: Boolean(row.completed),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    version: row.version as number,
  };
}

export class TaskStore {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  all(): Task[] {
    const rows = this.db.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all();
    return rows.map((r) => rowToTask(r as Record<string, unknown>));
  }

  get(id: string): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    return row ? rowToTask(row as Record<string, unknown>) : undefined;
  }

  create(title: string, description: string | null): Task {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, description, completed, created_at, updated_at, version)
         VALUES (?, ?, ?, 0, ?, ?, 1)`,
      )
      .run(id, title, description, now, now);
    return this.get(id)!;
  }

  // Optimistic concurrency: the caller must supply the version it last saw.
  // Returns undefined if the task doesn't exist, "conflict" if the version is
  // stale, or the updated task on success. See docs/adr/0001 for why.
  update(
    id: string,
    changes: { completed?: boolean; title?: string; description?: string | null },
    expectedVersion: number,
  ): Task | "conflict" | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (current.version !== expectedVersion) return "conflict";

    const next = { ...current, ...changes };
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE tasks SET title = ?, description = ?, completed = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ?`,
      )
      .run(next.title, next.description, next.completed ? 1 : 0, now, id, expectedVersion);
    return this.get(id);
  }

  delete(id: string, expectedVersion: number): "ok" | "conflict" | "missing" {
    const current = this.get(id);
    if (!current) return "missing";
    if (current.version !== expectedVersion) return "conflict";
    this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return "ok";
  }
}
