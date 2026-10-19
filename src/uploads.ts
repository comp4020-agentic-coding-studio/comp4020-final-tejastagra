// Image uploads: decoded, magic-byte-checked (never trust the client's
// declared MIME type), size-capped, and written under /data/uploads on the
// same Fly volume as the SQLite file — so an uploaded image survives a
// restart or redeploy exactly like a persisted object does.
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB decoded

interface Signature {
  ext: string;
  mime: string;
  magic: number[];
}

// Checked against the actual bytes, not the client's Content-Type / declared
// mimeType — a renamed .exe claiming to be a PNG fails here.
const SIGNATURES: Signature[] = [
  { ext: "png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: "gif", mime: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] },
  // WebP: "RIFF" .... "WEBP" — two non-contiguous magic windows, checked separately below.
];

function detectSignature(buf: Buffer): Signature | null {
  for (const sig of SIGNATURES) {
    if (buf.length >= sig.magic.length && sig.magic.every((b, i) => buf[i] === b)) return sig;
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", mime: "image/webp", magic: [] };
  }
  return null;
}

function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset < buf.length - 9) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    const segmentLength = buf.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  return null;
}

export interface SavedImage {
  path: string; // web-servable path, e.g. /uploads/<branchId>/<file>
  width?: number;
  height?: number;
}

export class ImageTooLargeError extends Error {}
export class UnsupportedImageError extends Error {}

export function saveImage(uploadsRoot: string, branchId: string, base64: string): SavedImage {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    throw new UnsupportedImageError("invalid base64 data");
  }
  if (buf.length === 0) throw new UnsupportedImageError("empty image data");
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new ImageTooLargeError(`image exceeds ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`);
  }

  const sig = detectSignature(buf);
  if (!sig) throw new UnsupportedImageError("unsupported or unrecognised image format");

  const dir = join(uploadsRoot, branchId);
  mkdirSync(dir, { recursive: true });
  const filename = `${randomUUID()}.${sig.ext}`;
  writeFileSync(join(dir, filename), buf);

  const dims = sig.ext === "png" ? pngDimensions(buf) : sig.ext === "jpg" ? jpegDimensions(buf) : null;

  return {
    path: `/uploads/${branchId}/${filename}`,
    width: dims?.width,
    height: dims?.height,
  };
}

const SAFE_FILENAME = /^[a-f0-9-]{36}\.(png|jpg|gif|webp)$/;
const SAFE_BRANCH = /^[a-zA-Z0-9_-]+$/;

export function resolveUploadPath(uploadsRoot: string, branchId: string, file: string): string | null {
  if (!SAFE_BRANCH.test(branchId) || !SAFE_FILENAME.test(file)) return null;
  return join(uploadsRoot, branchId, file);
}
