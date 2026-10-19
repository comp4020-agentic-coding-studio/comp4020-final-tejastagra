// Checked against the RUNNING app: validation for the modular object types
// (sticky, music, embed, image) added in the FigJam-style overhaul, and a
// check that objects already persisted under the older schema (plain
// `type: "text"`) still work after the change.
import { inject, it, expect } from "vitest";

const baseUrl = inject("baseUrl");

async function freshBranch(): Promise<string> {
  const res = await fetch(new URL("/api/branches/main/fork", baseUrl), { method: "POST" });
  const branch = await res.json();
  return branch.id;
}

async function createObject(branchId: string, body: unknown): Promise<Response> {
  return fetch(new URL(`/api/branches/${branchId}/objects`, baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

it("a pre-existing text object still round-trips after the type overhaul", async () => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, {
    type: "text",
    x: 0,
    y: 0,
    data: { text: "legacy note" },
  });
  expect(res.status).toBe(201);
  const listed = await fetch(new URL(`/api/branches/${branchId}/objects`, baseUrl)).then((r) =>
    r.json(),
  );
  expect(listed.objects.some((o: any) => o.data.includes("legacy note"))).toBe(true);
});

it("accepts a sticky with an allow-listed colour", async () => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, {
    type: "sticky",
    x: 0,
    y: 0,
    data: { text: "pin this", color: "#fff2a8" },
  });
  expect(res.status).toBe(201);
});

it("rejects a sticky with a colour outside the palette", async () => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, {
    type: "sticky",
    x: 0,
    y: 0,
    data: { text: "pin this", color: "#ff00ff" },
  });
  expect(res.status).toBe(400);
});

it.each([
  ["spotify", "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"],
  ["youtube watch", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ["youtu.be", "https://youtu.be/dQw4w9WgXcQ"],
  ["soundcloud", "https://soundcloud.com/artist/track-name"],
])("accepts a %s music URL", async (_label, url) => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, { type: "music", x: 0, y: 0, data: { url } });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(JSON.parse(body.data).platform).toBeTruthy();
});

it("rejects a music URL from an unrelated domain", async () => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, {
    type: "music",
    x: 0,
    y: 0,
    data: { url: "https://evil.example.com/track" },
  });
  expect(res.status).toBe(400);
});

it("accepts an embed URL on the allow-list", async () => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, {
    type: "embed",
    x: 0,
    y: 0,
    data: { url: "https://www.figma.com/file/abc123" },
  });
  expect(res.status).toBe(201);
});

it("rejects an embed URL not on the allow-list", async () => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, {
    type: "embed",
    x: 0,
    y: 0,
    data: { url: "https://not-allowed.example.com" },
  });
  expect(res.status).toBe(400);
});

const TINY_PNG_BASE64 = (() => {
  const hex =
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415" +
    "4789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082";
  return Buffer.from(hex, "hex").toString("base64");
})();

it("accepts a small valid PNG upload and serves it back", async () => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, {
    type: "image",
    x: 0,
    y: 0,
    data: { imageBase64: TINY_PNG_BASE64 },
  });
  expect(res.status).toBe(201);
  const obj = await res.json();
  const saved = JSON.parse(obj.data);
  expect(saved.path).toMatch(/^\/uploads\//);

  const fetched = await fetch(new URL(saved.path, baseUrl));
  expect(fetched.status).toBe(200);
  expect(fetched.headers.get("content-type")).toContain("image/png");
});

it("rejects an upload whose bytes don't match a known image format", async () => {
  const branchId = await freshBranch();
  const res = await createObject(branchId, {
    type: "image",
    x: 0,
    y: 0,
    data: { imageBase64: Buffer.from("not an image").toString("base64") },
  });
  expect(res.status).toBe(400);
});

it("rejects an oversized image payload", async () => {
  const branchId = await freshBranch();
  const oversized = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    Buffer.alloc(3 * 1024 * 1024, 0),
  ]).toString("base64");
  // The server closes the connection as soon as it sees the body is too
  // large, rather than draining the rest of a multi-MB payload just to
  // discard it (see src/server.ts's sendJsonAndCloseConnection). Depending
  // on exact timing, the client can observe that either as this clean 400
  // response, or as the underlying connection erroring out (e.g. EPIPE)
  // while still mid-upload — both mean the same thing: the body was
  // rejected for being too large, so both are accepted here.
  try {
    const res = await createObject(branchId, {
      type: "image",
      x: 0,
      y: 0,
      data: { imageBase64: oversized },
    });
    expect(res.status).toBe(400);
  } catch (e) {
    expect(String(e)).toMatch(/EPIPE|ECONNRESET|fetch failed/);
  }
});

// Regression test for a real, fixed vulnerability: PATCH used to skip the
// per-type validation POST applies, so a client could create a valid
// allow-listed embed/music object, then PATCH its data.url to an arbitrary
// URL and have it stored and broadcast unchecked.
it("PATCH re-validates an embed's URL against the allow-list, not just POST", async () => {
  const branchId = await freshBranch();
  const created = await createObject(branchId, {
    type: "embed",
    x: 0,
    y: 0,
    data: { url: "https://www.figma.com/file/abc123" },
  }).then((r) => r.json());

  const patchRes = await fetch(new URL(`/api/branches/${branchId}/objects/${created.id}`, baseUrl), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { url: "https://evil.example.com/phish" } }),
  });
  expect(patchRes.status).toBe(400);

  const listed = await fetch(new URL(`/api/branches/${branchId}/objects`, baseUrl)).then((r) => r.json());
  const obj = listed.objects.find((o: any) => o.id === created.id);
  expect(obj.data).toContain("figma.com");
  expect(obj.data).not.toContain("evil.example.com");
});

it("PATCH re-validates a music URL against the allow-list too", async () => {
  const branchId = await freshBranch();
  const created = await createObject(branchId, {
    type: "music",
    x: 0,
    y: 0,
    data: { url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT" },
  }).then((r) => r.json());

  const patchRes = await fetch(new URL(`/api/branches/${branchId}/objects/${created.id}`, baseUrl), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { url: "https://evil.example.com/track" } }),
  });
  expect(patchRes.status).toBe(400);
});

it("rejects a PATCH that tries to change an image object's data", async () => {
  const branchId = await freshBranch();
  const created = await createObject(branchId, {
    type: "image",
    x: 0,
    y: 0,
    data: { imageBase64: TINY_PNG_BASE64 },
  }).then((r) => r.json());

  const patchRes = await fetch(new URL(`/api/branches/${branchId}/objects/${created.id}`, baseUrl), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { path: "/uploads/other/hacked.png" } }),
  });
  expect(patchRes.status).toBe(400);
});
