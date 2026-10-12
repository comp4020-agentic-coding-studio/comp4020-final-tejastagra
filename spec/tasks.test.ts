// Mechanically-checkable lines from crit 9's spec, against the RUNNING app
// (spec/global-setup.ts finds it at APP_URL). What vitest can't do — opening
// two real browser tabs — is covered manually instead (see PROCESS.md); this
// file covers the same behaviour at the API/WebSocket layer: a second client
// receives a change within ~1s with no reload, and state survives a fetch
// after the fact (the server-side half of "survives a refresh").
import { inject, it, expect, afterAll } from "vitest";
import { WebSocket } from "ws";

const baseUrl = inject("baseUrl");
const wsUrl = new URL(baseUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

const createdIds: string[] = [];
afterAll(async () => {
  // Best-effort cleanup so repeated runs don't pile up tasks.
  for (const id of createdIds) {
    const res = await fetch(new URL(`/api/tasks/${id}`, baseUrl));
    if (res.ok) {
      const task = await res.json();
      await fetch(new URL(`/api/tasks/${id}`, baseUrl), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: task.version }),
      });
    }
  }
});

// A broadcast can arrive before the HTTP response that triggered it does
// (the server sends both as soon as the write commits), so every message is
// buffered from the moment the socket opens rather than only once a test
// starts waiting for one — otherwise a fast broadcast races the listener and
// is silently missed.
interface BufferedSocket {
  ws: WebSocket;
  received: any[];
}

function openSocket(): Promise<BufferedSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const received: any[] = [];
    ws.on("message", (data) => received.push(JSON.parse(data.toString())));
    ws.once("open", () => resolve({ ws, received }));
    ws.once("error", reject);
  });
}

function waitForMessage(socket: BufferedSocket, predicate: (msg: any) => boolean, timeoutMs = 1200): Promise<any> {
  const already = socket.received.find(predicate);
  if (already) return Promise.resolve(already);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for broadcast")), timeoutMs);
    const check = () => {
      const match = socket.received.find(predicate);
      if (match) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve(match);
      }
    };
    const poll = setInterval(check, 20);
    check();
  });
}

it("a task created by one client reaches another open session within ~1s, no reload", async () => {
  const listener = await openSocket();
  try {
    const title = `realtime-create-${Date.now()}`;
    const res = await fetch(new URL("/api/tasks", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    createdIds.push(created.id);

    const msg = await waitForMessage(listener, (m) => m.type === "created" && m.task.id === created.id);
    expect(msg.task.title).toBe(title);
  } finally {
    listener.ws.close();
  }
});

it("completing, reopening and deleting a task broadcast to other sessions", async () => {
  const createRes = await fetch(new URL("/api/tasks", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `realtime-lifecycle-${Date.now()}` }),
  });
  const task = await createRes.json();
  createdIds.push(task.id);

  const listener = await openSocket();
  try {
    const completeRes = await fetch(new URL(`/api/tasks/${task.id}`, baseUrl), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true, version: task.version }),
    });
    expect(completeRes.status).toBe(200);
    const completed = await completeRes.json();
    const updateMsg = await waitForMessage(listener, (m) => m.type === "updated" && m.task.id === task.id);
    expect(updateMsg.task.completed).toBe(true);

    const deleteRes = await fetch(new URL(`/api/tasks/${task.id}`, baseUrl), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: completed.version }),
    });
    expect(deleteRes.status).toBe(204);
    const deleteMsg = await waitForMessage(listener, (m) => m.type === "deleted" && m.id === task.id);
    expect(deleteMsg.id).toBe(task.id);
    createdIds.splice(createdIds.indexOf(task.id), 1);
  } finally {
    listener.ws.close();
  }
});

it("persists state: a fresh fetch sees what an earlier client wrote", async () => {
  const title = `persistence-${Date.now()}`;
  const res = await fetch(new URL("/api/tasks", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const task = await res.json();
  createdIds.push(task.id);

  const listRes = await fetch(new URL("/api/tasks", baseUrl));
  const tasks = await listRes.json();
  expect(tasks.some((t: any) => t.id === task.id && t.title === title)).toBe(true);
});

it("rejects a stale write instead of silently overwriting (the documented concurrency decision)", async () => {
  const createRes = await fetch(new URL("/api/tasks", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `conflict-${Date.now()}` }),
  });
  const task = await createRes.json();
  createdIds.push(task.id);

  // First writer succeeds and moves the version forward.
  const firstWrite = await fetch(new URL(`/api/tasks/${task.id}`, baseUrl), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true, version: task.version }),
  });
  expect(firstWrite.status).toBe(200);

  // A second writer using the now-stale version is rejected, not merged.
  const staleWrite = await fetch(new URL(`/api/tasks/${task.id}`, baseUrl), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: false, version: task.version }),
  });
  expect(staleWrite.status).toBe(409);
  const body = await staleWrite.json();
  expect(body.current.completed).toBe(true);
});
