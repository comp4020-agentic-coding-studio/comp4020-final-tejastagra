// Broadcasts task changes to every connected WebSocket client subscribed to
// the same room. Kept separate from server.ts so the "what gets sent on each
// kind of change" logic is in one small, readable place.
import type { WebSocket, WebSocketServer } from "ws";
import type { Task } from "./db.ts";

export type TaskEvent =
  | { type: "created"; task: Task }
  | { type: "updated"; task: Task }
  | { type: "deleted"; id: string };

// Each connected socket remembers the room it joined with (set once, in
// server.ts's connection handler) so a broadcast can be scoped to it.
export type RoomSocket = WebSocket & { roomId?: string };

export function broadcast(wss: WebSocketServer, roomId: string, event: TaskEvent): void {
  const payload = JSON.stringify(event);
  let sent = 0;
  for (const client of wss.clients as Set<RoomSocket>) {
    if (client.readyState === client.OPEN && client.roomId === roomId) {
      client.send(payload);
      sent++;
    }
  }
  console.log(`[broadcast] ${event.type} room=${roomId} to=${sent} clients`);
}
