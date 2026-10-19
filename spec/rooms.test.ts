// Crit exercise addition (ADR 0003): rooms give Taskflow real, URL-scoped
// isolation — a task created in one room must never appear in another
// room's list or reach another room's WebSocket. This is the mechanically
// checkable half of the "isolated room joins" scenario in
// docs/testing/multi-user-test-report.md; the rest (two live browser tabs
// against two different `?room=` links) is covered manually there.
import { inject, it, expect } from "vitest";
import { WebSocket } from "ws";

const baseUrl = inject("baseUrl");
const wsUrl = new URL(baseUrl);
wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

function makePerson() {
  let cookie = "";
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(new URL(path, baseUrl), { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return res;
  }
  return { request };
}

function openSocket(room: string): Promise<{ ws: WebSocket; received: any[] }> {
  return new Promise((resolve, reject) => {
    const url = new URL(wsUrl);
    url.searchParams.set("room", room);
    const ws = new WebSocket(url);
    const received: any[] = [];
    ws.on("message", (data) => received.push(JSON.parse(data.toString())));
    ws.once("open", () => resolve({ ws, received }));
    ws.once("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

it("a task created in one room is not visible in another room's list", async () => {
  const roomA = `room-a-${Date.now()}`;
  const roomB = `room-b-${Date.now()}`;
  const person = makePerson();

  const createRes = await person.request(`/api/tasks?room=${roomA}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `isolated-${Date.now()}` }),
  });
  expect(createRes.status).toBe(201);
  const task = await createRes.json();

  const listB = await (await person.request(`/api/tasks?room=${roomB}`)).json();
  expect(listB.some((t: any) => t.id === task.id)).toBe(false);

  const listA = await (await person.request(`/api/tasks?room=${roomA}`)).json();
  expect(listA.some((t: any) => t.id === task.id)).toBe(true);

  // cleanup
  await person.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: task.version }),
  });
});

it("a room's broadcast never reaches a socket joined to a different room", async () => {
  const roomA = `room-a-${Date.now()}`;
  const roomB = `room-b-${Date.now()}`;
  const person = makePerson();

  const listenerA = await openSocket(roomA);
  const listenerB = await openSocket(roomB);
  try {
    const createRes = await person.request(`/api/tasks?room=${roomA}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `isolated-broadcast-${Date.now()}` }),
    });
    const task = await createRes.json();

    // Give the broadcast time to arrive anywhere it's going to.
    await sleep(500);

    expect(listenerA.received.some((m) => m.type === "created" && m.task.id === task.id)).toBe(true);
    expect(listenerB.received.some((m) => m.type === "created" && m.task.id === task.id)).toBe(false);

    await person.request(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: task.version }),
    });
  } finally {
    listenerA.ws.close();
    listenerB.ws.close();
  }
});

it("two clients in the same room see each other's task within ~1s", async () => {
  const room = `room-shared-${Date.now()}`;
  const person = makePerson();
  const listener = await openSocket(room);
  try {
    const createRes = await person.request(`/api/tasks?room=${room}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `shared-room-${Date.now()}` }),
    });
    const task = await createRes.json();

    await sleep(500);
    expect(listener.received.some((m) => m.type === "created" && m.task.id === task.id)).toBe(true);

    await person.request(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: task.version }),
    });
  } finally {
    listener.ws.close();
  }
});
