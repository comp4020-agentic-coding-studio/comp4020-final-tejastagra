// Taskflow frontend. No framework or build step: the DOM is small enough to
// manage directly, and that keeps the Docker image to one static file plus
// the server. State lives in `tasks` (a Map keyed by id) and is kept in sync
// by a WebSocket; /api/tasks is only used for the initial load and reconnect.

/** @type {Map<string, any>} */
const tasks = new Map();
let filter = "all";
/** @type {{id: string, name: string} | null} */
let me = null;

// ADR 0003: a room is just whatever's in ?room=, shared by linking the URL —
// no creation step, no switcher. Absent or blank means the one room that
// existed before rooms did.
const room = new URLSearchParams(location.search).get("room")?.trim() || "general";
const roomQuery = `room=${encodeURIComponent(room)}`;

const listEl = document.getElementById("task-list");
const emptyEl = document.getElementById("empty-state");
const loadingEl = document.getElementById("loading-state");
const errorEl = document.getElementById("error-banner");
const connEl = document.getElementById("connection");
const form = document.getElementById("create-form");
const titleInput = document.getElementById("title-input");
const descInput = document.getElementById("description-input");
const whoEl = document.getElementById("whoami");
const roomEl = document.getElementById("room");
roomEl.textContent = `room: ${room}`;
const renameForm = document.getElementById("rename-form");
const nameInput = document.getElementById("name-input");

async function loadMe() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) throw new Error(`me failed: ${res.status}`);
    me = await res.json();
    whoEl.textContent = `you: ${me.name}`;
    nameInput.value = me.name;
  } catch {
    showError("Couldn't identify this session. Reload to try again.");
  }
}

renameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  try {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`rename failed: ${res.status}`);
    me = await res.json();
    whoEl.textContent = `you: ${me.name}`;
    render();
  } catch {
    showError("Couldn't update your name. Try again.");
  }
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  setTimeout(() => { errorEl.hidden = true; }, 4000);
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function render() {
  const all = [...tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const visible = all.filter((t) =>
    filter === "all" ? true : filter === "active" ? !t.completed : t.completed,
  );

  loadingEl.hidden = true;
  listEl.innerHTML = "";
  emptyEl.hidden = visible.length > 0;

  for (const task of visible) {
    const mine = me != null && task.ownerId === me.id;

    const li = document.createElement("li");
    li.className = "task" + (task.completed ? " is-completed" : "") + (mine ? "" : " is-readonly");
    li.dataset.id = task.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = task.completed;
    checkbox.disabled = !mine;
    checkbox.setAttribute("aria-label", task.completed ? "Reopen task" : "Complete task");
    if (mine) checkbox.addEventListener("change", () => toggleTask(task));

    const body = document.createElement("div");
    body.className = "task-body";
    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = task.title;
    body.appendChild(title);
    if (task.description) {
      const desc = document.createElement("div");
      desc.className = "task-description";
      desc.textContent = task.description;
      body.appendChild(desc);
    }
    const meta = document.createElement("div");
    meta.className = "task-meta";
    const owner = mine ? "you" : task.ownerName;
    meta.textContent = task.completed
      ? `completed · created by ${owner} · ${timeAgo(task.createdAt)}`
      : `created by ${owner} · ${timeAgo(task.createdAt)}`;
    body.appendChild(meta);

    li.append(checkbox, body);

    if (mine) {
      const del = document.createElement("button");
      del.className = "task-delete";
      del.type = "button";
      del.textContent = "Delete";
      del.setAttribute("aria-label", `Delete "${task.title}"`);
      del.addEventListener("click", () => deleteTask(task));
      li.append(del);
    }

    listEl.appendChild(li);
  }
}

async function loadTasks() {
  try {
    const res = await fetch(`/api/tasks?${roomQuery}`);
    if (!res.ok) throw new Error(`load failed: ${res.status}`);
    const data = await res.json();
    tasks.clear();
    for (const t of data) tasks.set(t.id, t);
    render();
  } catch (err) {
    loadingEl.hidden = true;
    showError("Couldn't load tasks. Check your connection and reload.");
  }
}

async function createTask(title, description) {
  try {
    const res = await fetch(`/api/tasks?${roomQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    if (!res.ok) throw new Error(`create failed: ${res.status}`);
    const task = await res.json();
    tasks.set(task.id, task);
    render();
  } catch {
    showError("Couldn't create that task. Try again.");
  }
}

async function toggleTask(task) {
  const optimistic = { ...task, completed: !task.completed };
  tasks.set(task.id, optimistic);
  render();
  try {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: optimistic.completed, version: task.version }),
    });
    if (res.status === 409) {
      const { current } = await res.json();
      tasks.set(task.id, current);
      render();
      showError("This task changed elsewhere — your update wasn't applied.");
      return;
    }
    if (!res.ok) throw new Error(`update failed: ${res.status}`);
    const updated = await res.json();
    tasks.set(updated.id, updated);
    render();
  } catch {
    tasks.set(task.id, task); // roll back the optimistic change
    render();
    showError("Couldn't update that task. Try again.");
  }
}

async function deleteTask(task) {
  if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
  try {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: task.version }),
    });
    if (res.status === 409) {
      const { current } = await res.json();
      tasks.set(task.id, current);
      render();
      showError("This task changed elsewhere — delete it again to confirm.");
      return;
    }
    if (!res.ok && res.status !== 204) throw new Error(`delete failed: ${res.status}`);
    tasks.delete(task.id);
    render();
  } catch {
    showError("Couldn't delete that task. Try again.");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const description = descInput.value.trim();
  createTask(title, description);
  titleInput.value = "";
  descInput.value = "";
  titleInput.focus();
});

for (const btn of document.querySelectorAll(".filter-btn")) {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    for (const b of document.querySelectorAll(".filter-btn")) {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-pressed", String(b === btn));
    }
    render();
  });
}

// WebSocket sync: live diffs on top of the initial snapshot, with a reconnect
// loop (exponential-ish backoff capped at 5s) so a dropped connection recovers
// on its own rather than leaving the UI stale.
let socket;
let reconnectDelay = 500;

function connect() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${proto}//${location.host}/?${roomQuery}`);

  socket.addEventListener("open", () => {
    connEl.textContent = "live";
    connEl.dataset.state = "online";
    reconnectDelay = 500;
    // A reconnect may have missed events; re-sync the full state.
    loadTasks();
  });

  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "created" || msg.type === "updated") {
      tasks.set(msg.task.id, msg.task);
    } else if (msg.type === "deleted") {
      tasks.delete(msg.id);
    }
    render();
  });

  socket.addEventListener("close", () => {
    connEl.textContent = "reconnecting…";
    connEl.dataset.state = "offline";
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 5000);
  });

  socket.addEventListener("error", () => socket.close());
}

loadMe().then(loadTasks);
connect();
