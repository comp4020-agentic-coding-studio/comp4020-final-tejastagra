// Fixed allow-lists for music and generic embed cards. Safe link-out for a
// small, known set of URL patterns — not universal embed support (see
// README.md's non-goals and docs/adr/0004-embeds-and-uploads.md).

export type MusicPlatform = "spotify" | "youtube" | "soundcloud";

const MUSIC_PATTERNS: Array<{ platform: MusicPlatform; test: (url: URL) => boolean }> = [
  {
    platform: "spotify",
    test: (url) =>
      url.hostname === "open.spotify.com" &&
      /^\/(track|album|playlist|episode)\//.test(url.pathname),
  },
  {
    platform: "youtube",
    test: (url) =>
      (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") &&
      url.pathname === "/watch" &&
      url.searchParams.has("v"),
  },
  {
    platform: "youtube",
    test: (url) => url.hostname === "youtu.be" && url.pathname.length > 1,
  },
  {
    platform: "soundcloud",
    test: (url) =>
      url.hostname === "soundcloud.com" && /^\/[^/]+\/[^/]+/.test(url.pathname),
  },
];

export function classifyMusicUrl(raw: string): MusicPlatform | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  for (const { platform, test } of MUSIC_PATTERNS) {
    if (test(url)) return platform;
  }
  return null;
}

// Embed src built server-side from the validated, canonical URL — never
// from whatever the client happened to send — so the iframe always points
// at the platform's own embed path, not an arbitrary query string.
export function musicEmbedSrc(platform: MusicPlatform, raw: string): string | null {
  const url = new URL(raw);
  switch (platform) {
    case "spotify": {
      const path = url.pathname.replace(/^\/(track|album|playlist|episode)\//, "$1/");
      return `https://open.spotify.com/embed/${path}`;
    }
    case "youtube": {
      if (url.hostname === "youtu.be") {
        return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
      }
      return `https://www.youtube.com/embed/${url.searchParams.get("v")}`;
    }
    case "soundcloud":
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.toString())}&auto_play=false`;
  }
}

// Generic iframe embeds: a small, fixed hostname allow-list. Anything else
// is a safe link-out at best, never an iframe — arbitrary iframe embedding
// is a real attack surface (clickjacking, postMessage abuse), not a feature
// gap to "fix" by widening this list casually.
const EMBED_HOSTNAMES = new Set([
  "www.google.com", // Maps embed
  "www.figma.com",
  "codepen.io",
  "codesandbox.io",
  "giphy.com",
  "docs.google.com",
]);

export function isAllowedEmbedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && EMBED_HOSTNAMES.has(url.hostname);
}
