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
  const res = await createObject(branchId, {
    type: "image",
    x: 0,
    y: 0,
    data: { imageBase64: oversized },
  });
  expect(res.status).toBe(400);
});
