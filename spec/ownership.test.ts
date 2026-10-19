// Crit 10's mechanically-checkable lines: the app tells two people apart,
// the permission decision is enforced server-side (not just hidden in the
// UI), and every action is logged durably with who did it. Two "people" here
// are two independent cookie jars hitting the same API, which is exactly
// what two separate Chrome profiles are to this server — see
// docs/adr/0002-identity-and-ownership.md for the decision this checks.
import { inject, it, expect, beforeAll } from "vitest";

const baseUrl = inject("baseUrl");

// A tiny per-caller cookie jar so each "person" in these tests sends their
// own `uid` cookie, the same way two separate browser profiles would, rather
// than accidentally sharing one identity through a shared fetch.
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

let alice: ReturnType<typeof makePerson>;
let bob: ReturnType<typeof makePerson>;

beforeAll(async () => {
  alice = makePerson();
  bob = makePerson();
  // Establish each identity (sets their respective cookies) before any test
  // relies on them being distinct.
  await alice.request("/api/me");
  await bob.request("/api/me");
});

it("tells two browsers apart: each gets its own identity, and they differ", async () => {
  const aliceMe = await (await alice.request("/api/me")).json();
  const bobMe = await (await bob.request("/api/me")).json();
  expect(aliceMe.id).not.toBe(bobMe.id);
});

it("a person can set a display name, and it's reflected back", async () => {
  const res = await alice.request("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Alice-${Date.now()}` }),
  });
  expect(res.status).toBe(200);
  const me = await res.json();
  expect(me.name).toMatch(/^Alice-/);
});

it("a task is owned by whoever created it", async () => {
  const res = await alice.request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `owned-${Date.now()}` }),
  });
  const task = await res.json();
  const aliceMe = await (await alice.request("/api/me")).json();
  expect(task.ownerId).toBe(aliceMe.id);

  await alice.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: task.version }),
  });
});

it("the board is shared: both people can see a task neither of them may own", async () => {
  const createRes = await alice.request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `shared-view-${Date.now()}` }),
  });
  const task = await createRes.json();

  const bobsList = await (await bob.request("/api/tasks")).json();
  expect(bobsList.some((t: any) => t.id === task.id)).toBe(true);

  await alice.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: task.version }),
  });
});

it("the server rejects a non-owner's edit with 403, even though the client never asked permission first", async () => {
  const createRes = await alice.request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `not-yours-${Date.now()}` }),
  });
  const task = await createRes.json();

  const bobsAttempt = await bob.request(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true, version: task.version }),
  });
  expect(bobsAttempt.status).toBe(403);

  // The rejected write actually didn't happen: task is still as Alice left it.
  const stillOpen = await (await alice.request("/api/tasks")).json();
  const found = stillOpen.find((t: any) => t.id === task.id);
  expect(found.completed).toBe(false);

  await alice.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: task.version }),
  });
});

it("the server rejects a non-owner's delete with 403", async () => {
  const createRes = await alice.request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `not-yours-to-delete-${Date.now()}` }),
  });
  const task = await createRes.json();

  const bobsAttempt = await bob.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: task.version }),
  });
  expect(bobsAttempt.status).toBe(403);

  const stillThere = await (await alice.request("/api/tasks")).json();
  expect(stillThere.some((t: any) => t.id === task.id)).toBe(true);

  await alice.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: task.version }),
  });
});

it("the owner may still edit and delete their own task", async () => {
  const createRes = await alice.request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `mine-${Date.now()}` }),
  });
  const task = await createRes.json();

  const editRes = await alice.request(`/api/tasks/${task.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true, version: task.version }),
  });
  expect(editRes.status).toBe(200);
  const edited = await editRes.json();

  const deleteRes = await alice.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: edited.version }),
  });
  expect(deleteRes.status).toBe(204);
});

it("logs who did what, server-side, including denied attempts, and the log outlives the request", async () => {
  const createRes = await alice.request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `logged-${Date.now()}` }),
  });
  const task = await createRes.json();
  const aliceMe = await (await alice.request("/api/me")).json();

  // Bob's denied attempt should show up in the log as denied, not silently.
  await bob.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: task.version }),
  });

  const log = await (await alice.request("/api/audit-log")).json();
  const createdEntry = log.find((e: any) => e.taskId === task.id && e.action === "create");
  expect(createdEntry).toBeTruthy();
  expect(createdEntry.actorId).toBe(aliceMe.id);
  expect(createdEntry.allowed).toBe(true);

  const deniedEntry = log.find((e: any) => e.taskId === task.id && e.action === "delete" && e.allowed === false);
  expect(deniedEntry).toBeTruthy();
  expect(deniedEntry.actorId).not.toBe(aliceMe.id);

  await alice.request(`/api/tasks/${task.id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: task.version }),
  });
});
