// SQLite persistence for The Wall. One file at /data/wall.db (or
// WALL_DB_PATH for tests), the only storage that survives a Fly restart or
// redeploy (see fly.toml's volume mount).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Branch {
  id: string;
  parent_id: string | null;
  forked_at: number;
}

export interface WallObject {
  id: string;
  branch_id: string;
  type: "text" | "stroke" | "shape" | "image" | "link";
  x: number;
  y: number;
  data: string; // JSON-encoded, shape depends on `type`
  created_by: string;
  created_at: number;
  updated_at: number;
  version: number;
}

export function openDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      forked_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS objects (
      id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      type TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      data TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (branch_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_objects_branch ON objects(branch_id);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      event TEXT NOT NULL,
      user_id TEXT,
      branch_id TEXT,
      object_id TEXT,
      outcome TEXT NOT NULL,
      detail TEXT
    );
  `);
  const main = db.prepare("SELECT id FROM branches WHERE id = ?").get("main");
  if (!main) {
    db.prepare("INSERT INTO branches (id, parent_id, forked_at) VALUES (?, ?, ?)").run(
      "main",
      null,
      Date.now(),
    );
  }
  return db;
}

export class Store {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  getBranch(id: string): Branch | undefined {
    return this.db.prepare("SELECT * FROM branches WHERE id = ?").get(id) as Branch | undefined;
  }

  createBranch(id: string, parentId: string): Branch {
    const forked_at = Date.now();
    this.db
      .prepare("INSERT INTO branches (id, parent_id, forked_at) VALUES (?, ?, ?)")
      .run(id, parentId, forked_at);
    return { id, parent_id: parentId, forked_at };
  }

  listObjects(branchId: string): WallObject[] {
    return this.db
      .prepare("SELECT * FROM objects WHERE branch_id = ? ORDER BY created_at ASC")
      .all(branchId) as WallObject[];
  }

  getObject(branchId: string, id: string): WallObject | undefined {
    return this.db
      .prepare("SELECT * FROM objects WHERE branch_id = ? AND id = ?")
      .get(branchId, id) as WallObject | undefined;
  }

  createObject(obj: Omit<WallObject, "version">): WallObject {
    const version = 1;
    this.db
      .prepare(
        `INSERT INTO objects (id, branch_id, type, x, y, data, created_by, created_at, updated_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        obj.id,
        obj.branch_id,
        obj.type,
        obj.x,
        obj.y,
        obj.data,
        obj.created_by,
        obj.created_at,
        obj.updated_at,
        version,
      );
    return { ...obj, version };
  }

  // Last-write-wins on the same object: the write that reaches the server
  // last simply overwrites, bumping `version`. See docs/adr/0001-realtime-and-conflicts.md.
  updateObject(
    branchId: string,
    id: string,
    patch: Partial<Pick<WallObject, "x" | "y" | "data">>,
  ): WallObject | undefined {
    const existing = this.getObject(branchId, id);
    if (!existing) return undefined;
    const updated: WallObject = {
      ...existing,
      ...patch,
      updated_at: Date.now(),
      version: existing.version + 1,
    };
    this.db
      .prepare(
        "UPDATE objects SET x = ?, y = ?, data = ?, updated_at = ?, version = ? WHERE branch_id = ? AND id = ?",
      )
      .run(updated.x, updated.y, updated.data, updated.updated_at, updated.version, branchId, id);
    return updated;
  }

  deleteObject(branchId: string, id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM objects WHERE branch_id = ? AND id = ?")
      .run(branchId, id);
    return result.changes > 0;
  }

  // Fork: copy every object in the parent branch into a brand-new branch at
  // this instant. No live link afterwards — edits to either never cross over.
  forkBranch(parentId: string, newId: string): Branch {
    const branch = this.createBranch(newId, parentId);
    const objects = this.listObjects(parentId);
    const now = Date.now();
    for (const obj of objects) {
      this.db
        .prepare(
          `INSERT INTO objects (id, branch_id, type, x, y, data, created_by, created_at, updated_at, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          obj.id,
          newId,
          obj.type,
          obj.x,
          obj.y,
          obj.data,
          obj.created_by,
          obj.created_at,
          now,
          1,
        );
    }
    return branch;
  }

  log(entry: {
    event: string;
    user_id?: string | null;
    branch_id?: string | null;
    object_id?: string | null;
    outcome: string;
    detail?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO audit_log (ts, event, user_id, branch_id, object_id, outcome, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        entry.event,
        entry.user_id ?? null,
        entry.branch_id ?? null,
        entry.object_id ?? null,
        entry.outcome,
        entry.detail ?? null,
      );
  }
}
