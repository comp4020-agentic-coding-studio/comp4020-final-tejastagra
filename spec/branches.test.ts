// Checked against the RUNNING app (spec/global-setup.ts finds it): branch
// isolation after a fork, distinct identity per client, and persistence
// across a create/read-back cycle.
import { inject, it, expect, beforeAll } from "vitest";

const baseUrl = inject("baseUrl");

// Two independent "browsers": separate cookie jars, like two real sessions.
class Client {
  private cookie: string | undefined;

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("Cookie", this.cookie);
    const res = await fetch(new URL(path, baseUrl), { ...init, headers });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }
}

async function freshBranch(client: Client): Promise<string> {
  // main always exists; fork it so each test gets an empty, isolated branch.
  const res = await client.request("/api/branches/main/fork", { method: "POST" });
  const branch = await res.json();
  return branch.id;
}

it("persists a created object and reads it back", async () => {
  const client = new Client();
  const branchId = await freshBranch(client);
  const created = await client
    .request(`/api/branches/${branchId}/objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", x: 5, y: 5, data: { text: "trace", color: "#000" } }),
    })
    .then((r) => r.json());

  const listed = await client
    .request(`/api/branches/${branchId}/objects`)
    .then((r) => r.json());
  expect(listed.objects.find((o: any) => o.id === created.id)).toBeTruthy();
});

it("two independent sessions get distinct identities", async () => {
  const a = new Client();
  const b = new Client();
  const branchId = await freshBranch(a);

  const objA = await a
    .request(`/api/branches/${branchId}/objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", x: 0, y: 0, data: { text: "a", color: "#000" } }),
    })
    .then((r) => r.json());
  const objB = await b
    .request(`/api/branches/${branchId}/objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", x: 0, y: 0, data: { text: "b", color: "#000" } }),
    })
    .then((r) => r.json());

  expect(objA.created_by).not.toBe(objB.created_by);
});

it("a fork is isolated: parent edits after fork don't appear, fork edits don't affect parent", async () => {
  const client = new Client();
  // freshBranch forks off `main`, which is never guaranteed to be empty —
  // against a long-lived deployed server `main` accumulates real objects
  // from actual use. So this test counts objects before/after rather than
  // assuming the parent starts at zero.
  const parentId = await freshBranch(client);
  const before = await client
    .request(`/api/branches/${parentId}/objects`)
    .then((r) => r.json());
  const countBeforeFork = before.objects.length;

  const seed = await client
    .request(`/api/branches/${parentId}/objects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "text", x: 0, y: 0, data: { text: "seed", color: "#000" } }),
    })
    .then((r) => r.json());

  const fork = await client
    .request(`/api/branches/${parentId}/fork`, { method: "POST" })
    .then((r) => r.json());

  // Parent edit after fork
  await client.request(`/api/branches/${parentId}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "text", x: 1, y: 1, data: { text: "after-fork", color: "#000" } }),
  });

  const forkObjects = await client
    .request(`/api/branches/${fork.id}/objects`)
    .then((r) => r.json());
  // The fork should have exactly what the parent had at fork time
  // (countBeforeFork inherited objects + the seed), and nothing from the
  // parent's post-fork edit.
  expect(forkObjects.objects).toHaveLength(countBeforeFork + 1);
  expect(forkObjects.objects.some((o: any) => o.id === seed.id && o.data.includes("seed"))).toBe(true);
  expect(forkObjects.objects.some((o: any) => o.data.includes("after-fork"))).toBe(false);

  // Fork edit on the inherited object shouldn't touch the parent's copy.
  await client.request(`/api/branches/${fork.id}/objects/${seed.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { text: "fork-changed", color: "#000" } }),
  });

  const parentObjects = await client
    .request(`/api/branches/${parentId}/objects`)
    .then((r) => r.json());
  const parentSeed = parentObjects.objects.find((o: any) => o.id === seed.id);
  expect(parentSeed.data).toContain("seed");
  expect(parentSeed.data).not.toContain("fork-changed");
});

it("rejects an object with an invalid type", async () => {
  const client = new Client();
  const branchId = await freshBranch(client);
  const res = await client.request(`/api/branches/${branchId}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "not-a-type", x: 0, y: 0, data: {} }),
  });
  expect(res.status).toBe(400);
});

it("rejects actions against an unknown branch", async () => {
  const client = new Client();
  const res = await client.request("/api/branches/does-not-exist/objects");
  expect(res.status).toBe(404);
});
