// Checked against the RUNNING app: a change posted by one WebSocket client
// is broadcast to another client on the same branch within ~1s, and clients
// on different branches never see each other's updates or presence.
import { inject, it, expect } from "vitest";
import WebSocket from "ws";

const baseUrl = inject("baseUrl");
const wsUrl = baseUrl.replace(/^http/, "ws");

// Buffer every message from the moment the socket opens, so a predicate can
// match something that already arrived (e.g. the snapshot, sent immediately
// on connect) as well as something still to come — the server doesn't wait
// for a listener before sending.
const buffers = new WeakMap<WebSocket, any[]>();

function connect(branchId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}/ws?branch=${encodeURIComponent(branchId)}`);
    const buffer: any[] = [];
    buffers.set(ws, buffer);
    ws.on("message", (raw: Buffer) => buffer.push(JSON.parse(raw.toString())));
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function nextMessage(ws: WebSocket, predicate: (msg: any) => boolean, timeoutMs = 2000): Promise<any> {
  const buffer = buffers.get(ws)!;
  return new Promise((resolve, reject) => {
    const tryDrain = () => {
      const i = buffer.findIndex(predicate);
      if (i !== -1) {
        const [msg] = buffer.splice(i, 1);
        clearInterval(poll);
        clearTimeout(timer);
        resolve(msg);
      }
    };
    const poll = setInterval(tryDrain, 20);
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error("timed out waiting for message"));
    }, timeoutMs);
    tryDrain();
  });
}

async function freshBranch(): Promise<string> {
  const res = await fetch(new URL("/api/branches/main/fork", baseUrl), { method: "POST" });
  const branch = await res.json();
  return branch.id;
}

it("broadcasts a created object to another session on the same branch within ~1s", async () => {
  const branchId = await freshBranch();
  const a = await connect(branchId);
  const b = await connect(branchId);

  // drain the initial snapshot each socket receives on connect
  await nextMessage(a, (m) => m.type === "snapshot");
  await nextMessage(b, (m) => m.type === "snapshot");

  const start = Date.now();
  const createRes = await fetch(new URL(`/api/branches/${branchId}/objects`, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "text", x: 0, y: 0, data: { text: "live", color: "#000" } }),
  });
  expect(createRes.status).toBe(201);

  const seen = await nextMessage(b, (m) => m.type === "object_created");
  const elapsed = Date.now() - start;
  expect(seen.object.data).toContain("live");
  expect(elapsed).toBeLessThan(1500);

  a.close();
  b.close();
});

it("does not broadcast across branches", async () => {
  const branchA = await freshBranch();
  const branchB = await freshBranch();
  const a = await connect(branchA);
  const b = await connect(branchB);
  await nextMessage(a, (m) => m.type === "snapshot");
  await nextMessage(b, (m) => m.type === "snapshot");

  await fetch(new URL(`/api/branches/${branchA}/objects`, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "text", x: 0, y: 0, data: { text: "only-a", color: "#000" } }),
  });

  await expect(nextMessage(b, (m) => m.type === "object_created", 800)).rejects.toThrow();

  a.close();
  b.close();
});

it("concurrent edits to different objects are both retained", async () => {
  const branchId = await freshBranch();
  const obj1 = await fetch(new URL(`/api/branches/${branchId}/objects`, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "text", x: 0, y: 0, data: { text: "one", color: "#000" } }),
  }).then((r) => r.json());
  const obj2 = await fetch(new URL(`/api/branches/${branchId}/objects`, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "text", x: 0, y: 0, data: { text: "two", color: "#000" } }),
  }).then((r) => r.json());

  await Promise.all([
    fetch(new URL(`/api/branches/${branchId}/objects/${obj1.id}`, baseUrl), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { text: "one-edited", color: "#000" } }),
    }),
    fetch(new URL(`/api/branches/${branchId}/objects/${obj2.id}`, baseUrl), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { text: "two-edited", color: "#000" } }),
    }),
  ]);

  const listed = await fetch(new URL(`/api/branches/${branchId}/objects`, baseUrl)).then((r) =>
    r.json(),
  );
  const o1 = listed.objects.find((o: any) => o.id === obj1.id);
  const o2 = listed.objects.find((o: any) => o.id === obj2.id);
  expect(o1.data).toContain("one-edited");
  expect(o2.data).toContain("two-edited");
});

it("a late-joining session receives the current state snapshot", async () => {
  const branchId = await freshBranch();
  await fetch(new URL(`/api/branches/${branchId}/objects`, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "text", x: 0, y: 0, data: { text: "already-here", color: "#000" } }),
  });

  const late = await connect(branchId);
  const snapshot = await nextMessage(late, (m) => m.type === "snapshot");
  expect(snapshot.objects.some((o: any) => o.data.includes("already-here"))).toBe(true);
  late.close();
});
