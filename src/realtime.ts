// Broadcasts task changes to every connected WebSocket client. Kept separate
// from server.ts so the "what gets sent on each kind of change" logic is in
// one small, readable place.
import type { WebSocket, WebSocketServer } from "ws";
import type { Task } from "./db.ts";

export type TaskEvent =
  | { type: "created"; task: Task }
  | { type: "updated"; task: Task }
  | { type: "deleted"; id: string };

export function broadcast(wss: WebSocketServer, event: TaskEvent): void {
  const payload = JSON.stringify(event);
  for (const client of wss.clients as Set<WebSocket>) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}
