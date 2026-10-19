// Branch-scoped WebSocket broadcast. Durable canvas objects and ephemeral
// presence/cursors both travel over the same socket, but only to clients on
// the same branch — see docs/adr/0003-branches-and-forks.md.
import type { WebSocket } from "ws";

export interface Client {
  ws: WebSocket;
  userId: string;
  branchId: string;
  // Cosmetic display name, set from the client's own cursor pings. Never
  // persisted, never part of any durable object — as ephemeral as cursor
  // position itself (see docs/adr/0002-identity-and-permissions.md: a
  // nickname never replaces the HttpOnly cookie identity that grounds
  // permissions/logging, it's purely a display label layered on top).
  nickname?: string;
}

const clients = new Set<Client>();

export function addClient(client: Client): void {
  clients.add(client);
}

export function removeClient(client: Client): void {
  clients.delete(client);
}

export function clientsOnBranch(branchId: string): Client[] {
  return [...clients].filter((c) => c.branchId === branchId);
}

export function broadcastToBranch(
  branchId: string,
  message: unknown,
  exclude?: Client,
): number {
  const payload = JSON.stringify(message);
  let sent = 0;
  for (const client of clientsOnBranch(branchId)) {
    if (client === exclude) continue;
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(payload);
      sent++;
    }
  }
  return sent;
}
