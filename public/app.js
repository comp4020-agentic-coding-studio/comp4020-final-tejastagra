// The Wall — client. Vanilla JS, no build step: fetch the branch's
// persisted snapshot over HTTP, then apply live diffs from the WebSocket on
// top. Presence/cursor messages never touch persisted state.

const params = new URLSearchParams(location.search);
const branchId = params.get("branch") ?? "main";

const canvas = document.getElementById("canvas");
const ctx2d = canvas.getContext("2d");
const textLayer = document.getElementById("text-layer");
const cursorLayer = document.getElementById("cursor-layer");
const statusEl = document.getElementById("status");
const whoEl = document.getElementById("who");

let tool = "draw";
let color = "#1c1a17";
const objects = new Map(); // id -> object (as sent by the server)
let drawing = null; // { id, points: [[x,y],...] } while actively drawing
let myLabel = "";

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}
window.addEventListener("resize", resizeCanvas);

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.dataset.state = isError ? "error" : "ok";
}

// Strokes are stored relative to their own x/y; draw them translated into
// canvas space.
function drawStroke(obj) {
  const data = JSON.parse(obj.data);
  const points = (data.points ?? []).map(([px, py]) => [px + (obj.x ?? 0), py + (obj.y ?? 0)]);
  if (points.length < 2) return;
  ctx2d.strokeStyle = data.color ?? "#1c1a17";
  ctx2d.lineWidth = data.width ?? 2.5;
  ctx2d.lineJoin = "round";
  ctx2d.lineCap = "round";
  ctx2d.beginPath();
  ctx2d.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx2d.lineTo(x, y);
  ctx2d.stroke();
}

function redraw() {
  const rect = canvas.getBoundingClientRect();
  ctx2d.clearRect(0, 0, rect.width, rect.height);
  for (const obj of objects.values()) {
    if (obj.type === "stroke") drawStroke(obj);
  }
  if (drawing) drawStroke({ x: 0, y: 0, data: JSON.stringify({ points: drawing.points, color }) });
}

function renderTextObject(obj) {
  let el = document.getElementById(`text-${obj.id}`);
  const data = JSON.parse(obj.data);
  if (!el) {
    el = document.createElement("div");
    el.className = "text-object";
    el.id = `text-${obj.id}`;
    el.contentEditable = "true";
    el.spellcheck = false;
    textLayer.appendChild(el);
    let saveTimer;
    el.addEventListener("input", () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        api(`/api/branches/${branchId}/objects/${obj.id}`, "PATCH", {
          data: { text: el.textContent, color: data.color },
        });
      }, 400);
    });
  }
  el.style.left = `${obj.x}px`;
  el.style.top = `${obj.y}px`;
  el.style.color = data.color ?? "#1c1a17";
  if (document.activeElement !== el) el.textContent = data.text ?? "";
}

function removeObjectEl(id) {
  const el = document.getElementById(`text-${id}`);
  if (el) el.remove();
}

function applyObject(obj) {
  objects.set(obj.id, obj);
  if (obj.type === "stroke") redraw();
  else if (obj.type === "text") renderTextObject(obj);
}

function removeObject(id) {
  objects.delete(id);
  removeObjectEl(id);
  redraw();
}

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function loadSnapshot() {
  const { objects: list } = await api(`/api/branches/${branchId}/objects`);
  objects.clear();
  textLayer.innerHTML = "";
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
        myLabel = msg.you;
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
function showCursor(userId, x, y) {
  let el = cursorEls.get(userId);
  if (!el) {
    el = document.createElement("div");
    el.className = "cursor";
    el.innerHTML = `<div class="dot"></div><div class="label">${userId}</div>`;
    cursorLayer.appendChild(el);
    cursorEls.set(userId, el);
  }
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
function hideCursor(userId) {
  const el = cursorEls.get(userId);
  if (el) {
    el.remove();
    cursorEls.delete(userId);
  }
}

let lastCursorSend = 0;
function sendCursor(x, y) {
  const now = performance.now();
  if (now - lastCursorSend < 50) return; // throttle — presence is ephemeral, not logged, but still shouldn't flood
  lastCursorSend = now;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "cursor", x, y }));
  }
}

// --- Tools ---

document.getElementById("tool-draw").addEventListener("click", () => setTool("draw"));
document.getElementById("tool-text").addEventListener("click", () => setTool("text"));
document.getElementById("tool-select").addEventListener("click", () => setTool("select"));

function setTool(next) {
  tool = next;
  for (const btn of document.querySelectorAll(".palette button[id^='tool-']")) {
    const active = btn.id === `tool-${next}`;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
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
  if (e.target.isContentEditable) return;
  if (e.key === "d") setTool("draw");
  if (e.key === "t") setTool("text");
  if (e.key === "s") setTool("select");
});

// --- Canvas interaction ---

function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

canvas.addEventListener("pointerdown", (e) => {
  const [x, y] = canvasPoint(e);
  if (tool === "draw") {
    drawing = { points: [[x, y]] };
    canvas.setPointerCapture(e.pointerId);
  } else if (tool === "text") {
    createText(x, y);
    setTool("select");
  }
});

canvas.addEventListener("pointermove", (e) => {
  const [x, y] = canvasPoint(e);
  sendCursor(x, y);
  if (drawing) {
    drawing.points.push([x, y]);
    redraw();
  }
});

canvas.addEventListener("pointerup", async () => {
  if (!drawing) return;
  const points = drawing.points;
  drawing = null;
  if (points.length < 2) {
    redraw();
    return;
  }
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
      data: { points: relative, color, width: 2.5 },
    });
    objects.set(obj.id, obj);
  } catch (e) {
    setStatus("Failed to save stroke", true);
  }
  redraw();
});

async function createText(x, y) {
  try {
    const obj = await api(`/api/branches/${branchId}/objects`, "POST", {
      type: "text",
      x,
      y,
      data: { text: "", color },
    });
    applyObject(obj);
    document.getElementById(`text-${obj.id}`).focus();
  } catch (e) {
    setStatus("Failed to create text", true);
  }
}

// --- Fork ---

document.getElementById("fork-btn").addEventListener("click", async () => {
  try {
    const branch = await api(`/api/branches/${branchId}/fork`, "POST");
    location.href = `${location.pathname}?branch=${branch.id}`;
  } catch (e) {
    setStatus("Fork failed", true);
  }
});

// --- Boot ---

resizeCanvas();
loadSnapshot()
  .then(() => connectWs())
  .catch((e) => setStatus(`Failed to load canvas: ${e.message}`, true));
