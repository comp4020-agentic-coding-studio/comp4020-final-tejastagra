// Structured server logs, one JSON line per event to stdout (captured by
// `flyctl logs`) and mirrored into the durable audit_log table so history
// survives a restart. Never log cookies, secrets or raw pointer-movement
// streams (see docs/adr/0002-identity-and-permissions.md for why presence
// is noisy-by-design and kept out of this log).
import type { Store } from "./db.ts";

export type LogEvent =
  | "user_join"
  | "user_leave"
  | "action_received"
  | "update_broadcast"
  | "action_rejected"
  | "state_snapshot_sent";

export interface LogFields {
  event: LogEvent;
  user_id?: string;
  branch_id?: string;
  object_id?: string;
  action?: string;
  outcome: "ok" | "rejected";
  reason?: string;
  request_id?: string;
}

export function makeLogger(store: Store) {
  return function log(fields: LogFields): void {
    const line = {
      ts: new Date().toISOString(),
      ...fields,
    };
    console.log(JSON.stringify(line));
    store.log({
      event: fields.event,
      user_id: fields.user_id,
      branch_id: fields.branch_id,
      object_id: fields.object_id,
      outcome: fields.outcome,
      detail: fields.reason ?? fields.action,
    });
  };
}

export type Logger = ReturnType<typeof makeLogger>;
