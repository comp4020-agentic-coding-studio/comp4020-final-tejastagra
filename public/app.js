// The Wall — client. Vanilla JS, no build step. An infinite pan/zoom
// "camera" over a world-space canvas: every object (stroke, sticky, text,
// music, embed, image) is a positioned DOM/SVG node inside #camera, moved
// as one group by a single CSS transform. Durable state comes from the
// branch's HTTP snapshot; live diffs arrive over WebSocket; presence/cursor
// messages never touch persisted state.

const params = new URLSearchParams(location.search);
const branchId = params.get("branch") ?? "main";

const canvasWrap = document.getElementById("canvas-wrap");
const camera = document.getElementById("camera");
const strokesLayer = document.getElementById("strokes-layer");
const objectsLayer = document.getElementById("objects-layer");
const cursorLayer = document.getElementById("cursor-layer");
const statusEl = document.getElementById("status");
const whoEl = document.getElementById("who");
const zoomPill = document.getElementById("zoom-pill");
const imageInput = document.getElementById("image-input");

const SVG_NS = "http://www.w3.org/2000/svg";

let tool = "select";
let color = "#fff2a8"; // selected palette colour, used for sticky backgrounds

// The palette is a set of pastel sticky-note backgrounds; a stroke drawn in
// the raw pastel would barely show against the light canvas, so each entry
// maps to a bold "ink" version for strokes. Falls back to a near-black ink
// if a colour outside this fixed set is ever selected.
const STROKE_INK = {
  "#fff2a8": "#8a6d00",
  "#ffd1e6": "#a3245c",
  "#bfe3ff": "#19588f",
  "#c8f2d4": "#1f7a42",
  "#ffdcb0": "#9a5200",
};
const DEFAULT_INK = "#1b1d23";
function currentStrokeColor() {
  return STROKE_INK[color] ?? DEFAULT_INK;
}

const objects = new Map(); // id -> server object (data already JSON-parsed)
const objectEls = new Map(); // id -> DOM node
const strokeEls = new Map(); // id -> <path>

let myLabel = "";

// --- Nickname: purely cosmetic, stored client-side only. Never replaces
// the server's own anonymous identity (the HttpOnly cookie) that grounds
// permissions and logging — this is a display label layered on top, sent
// fresh with every cursor ping, never persisted as part of any object. ---

const NICKNAME_KEY = "wall_nickname";
const SEEN_WELCOME_KEY = "wall_seen_welcome";

function getStoredNickname() {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? "";
  } catch {
    return ""; // localStorage can throw in a private window or with blocked site data
  }
}
function setStoredNickname(value) {
  try {
    localStorage.setItem(NICKNAME_KEY, value);
  } catch {
    // per-viewer convenience only; losing it just means asking again next visit
  }
}
function hasSeenWelcome() {
  try {
    return localStorage.getItem(SEEN_WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}
function markWelcomeSeen() {
  try {
    localStorage.setItem(SEEN_WELCOME_KEY, "1");
  } catch {
    // worst case, the welcome screen shows again next visit — not harmful
  }
}

// --- Camera (world <-> screen) ---

const cam = { x: 0, y: 0, scale: 1 };

function applyCameraTransform() {
  camera.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
  zoomPill.textContent = `${Math.round(cam.scale * 100)}%`;
}

function screenToWorld(sx, sy) {
  return [(sx - cam.x) / cam.scale, (sy - cam.y) / cam.scale];
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.dataset.state = isError ? "error" : "ok";
}

// --- API ---

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

function parsedData(obj) {
  try {
    return JSON.parse(obj.data);
  } catch {
    return {};
  }
}

// --- Rendering: strokes (SVG) ---

function strokePathD(points) {
  if (!points || points.length < 2) return "";
  return `M ${points[0][0]} ${points[0][1]} ` + points.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ");
}

function renderStroke(obj) {
  const data = parsedData(obj);
  let path = strokeEls.get(obj.id);
  if (!path) {
    path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    strokesLayer.appendChild(path);
    strokeEls.set(obj.id, path);
  }
  const absolute = (data.points ?? []).map(([x, y]) => [x + obj.x, y + obj.y]);
  path.setAttribute("d", strokePathD(absolute));
  path.setAttribute("stroke", data.color ?? DEFAULT_INK);
  path.setAttribute("stroke-width", String(data.width ?? 2.5));
}

function removeStroke(id) {
  const path = strokeEls.get(id);
  if (path) path.remove();
  strokeEls.delete(id);
}

// --- Rendering: cards (sticky / text / music / embed / image) ---

function positionCard(el, obj) {
  el.style.left = `${obj.x}px`;
  el.style.top = `${obj.y}px`;
}

function makeDraggable(el, obj, { onFinish } = {}) {
  let dragging = null;
  el.addEventListener("pointerdown", (e) => {
    if (tool !== "select") return;
    if (e.target.closest("[contenteditable]") && document.activeElement === e.target) return;
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    dragging = { startScreenX: e.clientX, startScreenY: e.clientY, startX: obj.x, startY: obj.y };
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - dragging.startScreenX) / cam.scale;
    const dy = (e.clientY - dragging.startScreenY) / cam.scale;
    obj.x = dragging.startX + dx;
    obj.y = dragging.startY + dy;
    positionCard(el, obj);
  });
  el.addEventListener("pointerup", async (e) => {
    if (!dragging) return;
    el.classList.remove("dragging");
    dragging = null;
    try {
      await api(`/api/branches/${branchId}/objects/${obj.id}`, "PATCH", { x: obj.x, y: obj.y });
    } catch {
      setStatus("Failed to save position", true);
    }
    onFinish?.();
  });
}

function renderSticky(obj) {
  const data = parsedData(obj);
  const stickyColor = data.color ?? "#fff2a8";
  let el = objectEls.get(obj.id);
  if (!el) {
    el = document.createElement("div");
    el.className = "card card-sticky";
    el.dataset.id = obj.id;
    const inner = document.createElement("div");
    inner.contentEditable = "true";
    inner.spellcheck = false;
    inner.style.outline = "none";
    el.appendChild(inner);
    objectsLayer.appendChild(el);
    objectEls.set(obj.id, el);
    makeDraggable(el, obj);
    let saveTimer;
    inner.addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        // Colour is fixed at creation time; only the text can be edited.
        api(`/api/branches/${branchId}/objects/${obj.id}`, "PATCH", {
          data: { text: inner.textContent, color: stickyColor },
        }).catch(() => setStatus("Failed to save note", true));
      }, 400);
    });
  }
  positionCard(el, obj);
  el.style.background = stickyColor;
  const inner = el.firstChild;
  if (document.activeElement !== inner) inner.textContent = data.text ?? "";
}

function renderTextObject(obj) {
  const data = parsedData(obj);
  let el = objectEls.get(obj.id);
  if (!el) {
    el = document.createElement("div");
    el.className = "text-object";
    el.contentEditable = "true";
    el.spellcheck = false;
    el.dataset.id = obj.id;
    objectsLayer.appendChild(el);
    objectEls.set(obj.id, el);
    makeDraggable(el, obj);
    let saveTimer;
    el.addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api(`/api/branches/${branchId}/objects/${obj.id}`, "PATCH", {
          data: { text: el.textContent },
        }).catch(() => setStatus("Failed to save text", true));
      }, 400);
    });
  }
  positionCard(el, obj);
  el.style.color = data.color ?? "#1b1d23";
  if (document.activeElement !== el) el.textContent = data.text ?? "";
}

function musicEmbedSrc(platform, url) {
  try {
    const u = new URL(url);
    if (platform === "spotify") {
      const path = u.pathname.replace(/^\/(track|album|playlist|episode)\//, "$1/");
      return `https://open.spotify.com/embed/${path}`;
    }
    if (platform === "youtube") {
      const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
      return `https://www.youtube.com/embed/${id}`;
    }
    if (platform === "soundcloud") {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.toString())}&auto_play=false`;
    }
  } catch {
    return null;
  }
  return null;
}

function renderMusic(obj) {
  const data = parsedData(obj);
  let el = objectEls.get(obj.id);
  if (!el) {
    el = document.createElement("div");
    el.className = "card card-music";
    el.dataset.id = obj.id;
    const iframe = document.createElement("iframe");
    iframe.loading = "lazy";
    iframe.allow = "autoplay; encrypted-media";
    iframe.referrerPolicy = "no-referrer";
    const src = musicEmbedSrc(data.platform, data.url);
    if (src) iframe.src = src;
    el.appendChild(iframe);
    objectsLayer.appendChild(el);
    objectEls.set(obj.id, el);
    makeDraggable(el, obj);
    allowIframeInteractionOnDoubleClick(el);
  }
  positionCard(el, obj);
}

function renderEmbed(obj) {
  const data = parsedData(obj);
  let el = objectEls.get(obj.id);
  if (!el) {
    el = document.createElement("div");
    el.className = "card card-embed";
    el.dataset.id = obj.id;
    const iframe = document.createElement("iframe");
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    // No allow-same-origin: a compromised embedded page still can't read
    // this origin's cookies or DOM. See docs/adr/0004-embeds-and-uploads.md.
    iframe.sandbox = "allow-scripts allow-popups allow-popups-to-escape-sandbox";
    iframe.src = data.url;
    el.appendChild(iframe);
    objectsLayer.appendChild(el);
    objectEls.set(obj.id, el);
    makeDraggable(el, obj);
    allowIframeInteractionOnDoubleClick(el);
  }
  positionCard(el, obj);
}

// A draggable card's iframe would otherwise eat every pointer event; let a
// double-click toggle "interacting" so the embed becomes usable, and click
// elsewhere on the canvas to hand dragging back.
function allowIframeInteractionOnDoubleClick(el) {
  el.addEventListener("dblclick", () => el.classList.toggle("interacting"));
}

function renderImage(obj) {
  const data = parsedData(obj);
  let el = objectEls.get(obj.id);
  if (!el) {
    el = document.createElement("div");
    el.className = "card card-image";
    el.dataset.id = obj.id;
    const img = document.createElement("img");
    img.src = data.path;
    img.alt = "";
    img.draggable = false;
    el.appendChild(img);
    objectsLayer.appendChild(el);
    objectEls.set(obj.id, el);
    makeDraggable(el, obj);
  }
  positionCard(el, obj);
}

function removeCard(id) {
  const el = objectEls.get(id);
  if (el) el.remove();
  objectEls.delete(id);
}

const RENDERERS = {
  stroke: renderStroke,
  sticky: renderSticky,
  text: renderTextObject,
  music: renderMusic,
  embed: renderEmbed,
  image: renderImage,
};

function applyObject(obj) {
  objects.set(obj.id, obj);
  const render = RENDERERS[obj.type];
  if (render) render(obj);
}

function removeObject(id) {
  const obj = objects.get(id);
  objects.delete(id);
  if (obj?.type === "stroke") removeStroke(id);
  else removeCard(id);
}

async function loadSnapshot() {
  const { objects: list } = await api(`/api/branches/${branchId}/objects`);
  objects.clear();
  objectsLayer.innerHTML = "";
  strokesLayer.innerHTML = "";
  objectEls.clear();
  strokeEls.clear();
  for (const obj of list) applyObject(obj);
}

// --- WebSocket: live updates + ephemeral presence ---

let ws;
function connectWs() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws?branch=${encodeURIComponent(branchId)}`);

  ws.addEventListener("open", () => setStatus("Connected"));
  ws.addEventListener("close", () => {
    setStatus("Disconnected — retrying…", true);
    setTimeout(connectWs, 1500);
  });
  ws.addEventListener("error", () => setStatus("Connection error", true));

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "snapshot":
        myLabel = getStoredNickname() || msg.you;
        whoEl.textContent = `you: ${myLabel}`;
        for (const obj of msg.objects) applyObject(obj);
        break;
      case "object_created":
      case "object_updated":
        applyObject(msg.object);
        break;
      case "object_deleted":
        removeObject(msg.id);
        break;
      case "cursor":
        showCursor(msg.userId, msg.x, msg.y);
        break;
      case "presence_left":
        hideCursor(msg.userId);
        break;
    }
  });
}

const cursorEls = new Map();
function showCursor(label, worldX, worldY) {
  let el = cursorEls.get(label);
  if (!el) {
    el = document.createElement("div");
    el.className = "cursor";
    const pointer = document.createElement("div");
    pointer.className = "pointer";
    const tag = document.createElement("div");
    tag.className = "label";
    // A label may now be a client-chosen nickname (sanitised server-side
    // against control characters, but not HTML-escaped) — textContent,
    // never innerHTML, so it can never be interpreted as markup.
    tag.textContent = label;
    el.append(pointer, tag);
    cursorLayer.appendChild(el);
    cursorEls.set(label, el);
  }
  el.style.left = `${worldX * cam.scale + cam.x}px`;
  el.style.top = `${worldY * cam.scale + cam.y}px`;
}
function hideCursor(userId) {
  const el = cursorEls.get(userId);
  if (el) {
    el.remove();
    cursorEls.delete(userId);
  }
}

let lastCursorSend = 0;
function sendCursor(worldX, worldY) {
  const now = performance.now();
  if (now - lastCursorSend < 50) return; // throttle — presence is ephemeral, not logged, but still shouldn't flood
  lastCursorSend = now;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "cursor", x: worldX, y: worldY, nickname: getStoredNickname() }));
  }
}

// --- Tools ---

const TOOL_BUTTONS = {
  select: document.getElementById("tool-select"),
  draw: document.getElementById("tool-draw"),
  sticky: document.getElementById("tool-sticky"),
  text: document.getElementById("tool-text"),
};

for (const [name, btn] of Object.entries(TOOL_BUTTONS)) {
  btn.addEventListener("click", () => setTool(name));
}
document.getElementById("tool-music").addEventListener("click", addMusicCard);
document.getElementById("tool-embed").addEventListener("click", addEmbedCard);
document.getElementById("tool-image").addEventListener("click", () => imageInput.click());

function setTool(next) {
  tool = next;
  for (const [name, btn] of Object.entries(TOOL_BUTTONS)) {
    const active = name === next;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
  canvasWrap.classList.toggle("tool-draw", next === "draw");
  canvasWrap.classList.toggle("tool-sticky", next === "sticky");
  canvasWrap.classList.toggle("tool-text", next === "text");
}

for (const swatch of document.querySelectorAll(".swatch")) {
  swatch.addEventListener("click", () => {
    color = swatch.dataset.color;
    for (const s of document.querySelectorAll(".swatch")) {
      s.classList.toggle("selected", s === swatch);
      s.setAttribute("aria-pressed", String(s === swatch));
    }
  });
}

window.addEventListener("keydown", (e) => {
  if (e.target.isContentEditable || e.target.tagName === "INPUT") return;
  if (e.key === "v") setTool("select");
  if (e.key === "d") setTool("draw");
  if (e.key === "s") setTool("sticky");
  if (e.key === "t") setTool("text");
  if (e.key === "m") addMusicCard();
  if (e.key === "e") addEmbedCard();
  if (e.key === "i") imageInput.click();
});

// --- Canvas interaction: pan, zoom, draw, place ---

let drawing = null; // { points: [[worldX, worldY], ...] }
let panState = null; // { startScreenX, startScreenY, startCamX, startCamY }
let spacePanning = false;

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.target.isContentEditable) spacePanning = true;
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spacePanning = false;
});

canvasWrap.addEventListener("pointerdown", (e) => {
  const onBareCanvas =
    e.target === canvasWrap || e.target === camera || e.target === strokesLayer || e.target === objectsLayer;

  if (tool === "select" || spacePanning) {
    if (!onBareCanvas) return; // a card handled its own drag via stopPropagation
    canvasWrap.classList.add("panning");
    panState = { startScreenX: e.clientX, startScreenY: e.clientY, startCamX: cam.x, startCamY: cam.y };
    canvasWrap.setPointerCapture(e.pointerId);
    return;
  }

  // Creation tools (draw/sticky/text) always place a new object at the
  // clicked point, even if an existing card happens to be underneath —
  // otherwise a click that lands on another object silently does nothing
  // except leave that object's own contenteditable focused, and the next
  // keystroke types into it instead of the new object the user meant to
  // create. This was a real bug (found by a design-review subagent and
  // confirmed by reproducing it): placing a sticky near an existing one
  // appended text into the existing note instead of creating a new one.
  const [wx, wy] = screenToWorld(e.clientX, e.clientY);

  if (tool === "draw") {
    drawing = { points: [[wx, wy]] };
    canvasWrap.setPointerCapture(e.pointerId);
    return;
  }
  if (tool === "sticky") {
    createSticky(wx, wy);
    setTool("select");
    return;
  }
  if (tool === "text") {
    createText(wx, wy);
    setTool("select");
    return;
  }
});

canvasWrap.addEventListener("pointermove", (e) => {
  const [wx, wy] = screenToWorld(e.clientX, e.clientY);
  sendCursor(wx, wy);

  if (panState) {
    cam.x = panState.startCamX + (e.clientX - panState.startScreenX);
    cam.y = panState.startCamY + (e.clientY - panState.startScreenY);
    applyCameraTransform();
    return;
  }
  if (drawing) {
    drawing.points.push([wx, wy]);
    renderLiveStroke();
  }
});

canvasWrap.addEventListener("pointerup", async (e) => {
  if (panState) {
    panState = null;
    canvasWrap.classList.remove("panning");
    return;
  }
  if (!drawing) return;
  const points = drawing.points;
  const liveEl = strokeEls.get("__live__");
  if (liveEl) liveEl.remove();
  strokeEls.delete("__live__");
  drawing = null;
  if (points.length < 2) return;

  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const relative = points.map(([px, py]) => [px - x, py - y]);
  try {
    const obj = await api(`/api/branches/${branchId}/objects`, "POST", {
      type: "stroke",
      x,
      y,
      data: { points: relative, color: currentStrokeColor(), width: 2.5 },
    });
    applyObject(obj);
  } catch {
    setStatus("Failed to save stroke", true);
  }
});

function renderLiveStroke() {
  let path = strokeEls.get("__live__");
  if (!path) {
    path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", currentStrokeColor());
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    strokesLayer.appendChild(path);
    strokeEls.set("__live__", path);
  }
  path.setAttribute("d", strokePathD(drawing.points));
}

// Zoom anchored at the cursor: recompute cam.x/y so the world point under
// the cursor stays fixed on screen.
canvasWrap.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvasWrap.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = screenToWorld(sx, sy);

    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    const nextScale = Math.min(3, Math.max(0.2, cam.scale * zoomFactor));

    cam.x = sx - wx * nextScale;
    cam.y = sy - wy * nextScale;
    cam.scale = nextScale;
    applyCameraTransform();
  },
  { passive: false },
);

zoomPill.addEventListener("click", () => {
  cam.scale = 1;
  applyCameraTransform();
});

async function createSticky(x, y) {
  try {
    const obj = await api(`/api/branches/${branchId}/objects`, "POST", {
      type: "sticky",
      x,
      y,
      data: { text: "", color },
    });
    applyObject(obj);
    const el = objectEls.get(obj.id);
    el?.firstChild?.focus();
  } catch {
    setStatus("Failed to create note", true);
  }
}

async function createText(x, y) {
  try {
    const obj = await api(`/api/branches/${branchId}/objects`, "POST", {
      type: "text",
      x,
      y,
      data: { text: "" },
    });
    applyObject(obj);
    objectEls.get(obj.id)?.focus();
  } catch {
    setStatus("Failed to create text", true);
  }
}

async function addMusicCard() {
  const url = prompt("Paste a Spotify, YouTube or SoundCloud link:");
  if (!url) return;
  const rect = canvasWrap.getBoundingClientRect();
  const [x, y] = screenToWorld(rect.width / 2, rect.height / 2);
  try {
    const obj = await api(`/api/branches/${branchId}/objects`, "POST", {
      type: "music",
      x,
      y,
      data: { url },
    });
    applyObject(obj);
  } catch (e) {
    setStatus("That link isn't supported yet", true);
  }
}

async function addEmbedCard() {
  const url = prompt("Paste a link to embed (Figma, Google Maps, CodePen, CodeSandbox, Giphy, Google Docs):");
  if (!url) return;
  const rect = canvasWrap.getBoundingClientRect();
  const [x, y] = screenToWorld(rect.width / 2, rect.height / 2);
  try {
    const obj = await api(`/api/branches/${branchId}/objects`, "POST", {
      type: "embed",
      x,
      y,
      data: { url },
    });
    applyObject(obj);
  } catch (e) {
    setStatus("That link isn't on the embed allow-list", true);
  }
}

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  imageInput.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.toString().split(",")[1];
    const rect = canvasWrap.getBoundingClientRect();
    const [x, y] = screenToWorld(rect.width / 2, rect.height / 2);
    try {
      const obj = await api(`/api/branches/${branchId}/objects`, "POST", {
        type: "image",
        x,
        y,
        data: { imageBase64: base64 },
      });
      applyObject(obj);
    } catch {
      setStatus("Failed to upload image", true);
    }
  };
  reader.readAsDataURL(file);
});

// --- Fork ---

document.getElementById("fork-btn").addEventListener("click", async () => {
  try {
    const branch = await api(`/api/branches/${branchId}/fork`, "POST");
    location.href = `${location.pathname}?branch=${branch.id}`;
  } catch {
    setStatus("Fork failed", true);
  }
});

// --- Welcome overlay ---

const welcomeOverlay = document.getElementById("welcome-overlay");
const nicknameInput = document.getElementById("nickname-input");
const welcomeContinue = document.getElementById("welcome-continue");
const helpBtn = document.getElementById("help-btn");

function openWelcome({ resetFocus = true } = {}) {
  nicknameInput.value = getStoredNickname();
  welcomeOverlay.hidden = false;
  if (resetFocus) nicknameInput.focus();
}

function closeWelcomeAndBoot() {
  setStoredNickname(nicknameInput.value.trim());
  markWelcomeSeen();
  welcomeOverlay.hidden = true;
  boot();
}

welcomeContinue.addEventListener("click", closeWelcomeAndBoot);
nicknameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") closeWelcomeAndBoot();
});
helpBtn.addEventListener("click", () => openWelcome({ resetFocus: false }));

// --- Boot ---

let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  applyCameraTransform();
  loadSnapshot()
    .then(() => connectWs())
    .catch((e) => setStatus(`Failed to load canvas: ${e.message}`, true));
}

if (hasSeenWelcome()) {
  welcomeOverlay.hidden = true;
  boot();
} else {
  openWelcome();
}
