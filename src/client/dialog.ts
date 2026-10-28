// The one popup component (docs/design/popups.md U85 to U90). Every dialog on every screen is built here, so they all
// look and behave alike: a centred card over a dimmed page, a close button, Escape, focus kept inside, and nothing behind
// it moves (Q1). Built with textContent and DOM calls, never innerHTML, so a name can never inject markup.

export interface DialogOptions {
  testid: string; // the hook of the dialog, for example "nickname-dialog"
  title: string;
  // A popup that must be answered (the forced password change, U85) has no close button, no Escape and no tap on the dim.
  dismissible?: boolean;
  // Called when the form is submitted (Enter or the main button). Return nothing; show a problem with `error`.
  onSubmit?: (dialog: Dialog) => void | Promise<void>;
  onClose?: () => void;
}

export interface Dialog {
  root: HTMLElement;
  form: HTMLFormElement;
  // Text for a paragraph, field or button list is added to `form` before the actions.
  field(label: string, name: string, options?: { value?: string; type?: string; maxlength?: number; autocomplete?: string; capitalize?: boolean; hint?: string }): HTMLInputElement;
  text(words: string): HTMLParagraphElement;
  actions(...buttons: HTMLElement[]): HTMLElement;
  error(name: string | null, words: string): void; // directly under its field (U88); null for the whole popup
  clearErrors(): void;
  close(): void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

let open: Dialog | null = null;
// A popup opened from another remembers how to reopen it (U90). The reopen belongs to the popup that was opened `from`: it runs
// when that popup is closed, and never when it is replaced by another one.
let reopen: (() => void) | null = null;
let reopenFor: Dialog | null = null;

export function dialogButton(label: string, kind: "red" | "blue" | "yellow", testid: string, options: { type?: "button" | "submit"; onClick?: () => void } = {}): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = options.type ?? "button";
  b.className = `btn btn-${kind}`;
  b.dataset.testid = testid;
  const span = document.createElement("span");
  span.textContent = label;
  b.append(span);
  if (options.onClick) b.addEventListener("click", options.onClick);
  return b;
}

export function openDialog(options: DialogOptions): Dialog {
  if (open) {
    const previous = open;
    const keep = reopen; // a popup opened from another (openFrom) has already set its way back
    const keepFor = reopenFor;
    previous.close();
    reopen = keep;
    reopenFor = keepFor;
  }
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dismissible = options.dismissible !== false;
  const id = `dialog-${options.testid}`;

  const root = document.createElement("div");
  root.className = "dialog";
  root.dataset.testid = options.testid;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", `${id}-title`);

  const card = document.createElement("div");
  card.className = "panel dialog-card";
  const heading = document.createElement("h2");
  heading.id = `${id}-title`;
  heading.className = "dialog-title";
  heading.textContent = options.title;
  const form = document.createElement("form");
  form.className = "dialog-form";
  form.noValidate = true;
  card.append(heading, form);

  if (dismissible) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "dialog-close";
    close.dataset.testid = "dialog-close";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M5.7 4.3 12 10.6l6.3-6.3 1.4 1.4-6.3 6.3 6.3 6.3-1.4 1.4-6.3-6.3-6.3 6.3-1.4-1.4 6.3-6.3-6.3-6.3z"/></svg>';
    close.addEventListener("click", () => dialog.close());
    card.append(close);
  }
  root.append(card);

  const errors = new Map<string, HTMLElement>();
  const dialog: Dialog = {
    root,
    form,
    field(label, name, o = {}) {
      const wrap = document.createElement("div");
      wrap.className = "dialog-field";
      const labelEl = document.createElement("label");
      labelEl.htmlFor = `${id}-${name}`;
      labelEl.textContent = label;
      const input = document.createElement("input");
      input.id = `${id}-${name}`;
      input.name = name;
      input.type = o.type ?? "text";
      input.value = o.value ?? "";
      if (o.maxlength) input.maxLength = o.maxlength;
      input.autocomplete = (o.autocomplete ?? "off") as AutoFill;
      if (o.capitalize) input.autocapitalize = "characters";
      input.dataset.testid = `${name}-input`; // code-input, nickname-input: the hooks the screens always had
      const problem = document.createElement("p");
      problem.className = "dialog-error";
      problem.id = `${id}-${name}-error`;
      problem.setAttribute("role", "alert");
      problem.hidden = true;
      input.setAttribute("aria-describedby", problem.id);
      errors.set(name, problem);
      wrap.append(labelEl, input);
      if (o.hint) {
        const hint = document.createElement("p");
        hint.className = "dialog-hint";
        hint.id = `${id}-${name}-hint`;
        hint.textContent = o.hint;
        input.setAttribute("aria-describedby", `${hint.id} ${problem.id}`);
        wrap.append(hint);
      }
      wrap.append(problem);
      form.append(wrap);
      return input;
    },
    text(words) {
      const p = document.createElement("p");
      p.className = "dialog-text";
      p.textContent = words;
      form.append(p);
      return p;
    },
    actions(...buttons) {
      const row = document.createElement("div");
      row.className = "dialog-actions";
      row.dataset.count = String(buttons.length);
      row.append(...buttons);
      const whole = document.createElement("p");
      whole.className = "dialog-error";
      whole.setAttribute("role", "alert");
      whole.hidden = true;
      errors.set("", whole);
      form.append(whole, row);
      return row;
    },
    error(name, words) {
      this.clearErrors();
      const target = errors.get(name ?? "") ?? errors.get("");
      if (!target) return;
      target.textContent = words;
      target.hidden = false;
      const input = name ? form.elements.namedItem(name) : null;
      if (input instanceof HTMLInputElement) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
      }
    },
    clearErrors() {
      for (const p of errors.values()) {
        p.textContent = "";
        p.hidden = true;
      }
      for (const el of form.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
    },
    close() {
      if (open !== dialog) return;
      open = null;
      document.removeEventListener("keydown", onKey, true);
      root.remove();
      options.onClose?.();
      const back = reopenFor === dialog ? reopen : null;
      if (reopenFor === dialog) {
        reopen = null;
        reopenFor = null;
      }
      if (back) back();
      else opener?.focus();
    },
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    dialog.clearErrors();
    void options.onSubmit?.(dialog);
  });

  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape" && dismissible) {
      event.preventDefault();
      dialog.close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!root.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }
  document.addEventListener("keydown", onKey, true);

  // A tap on the dim closes it. The page behind never scrolls: the dim takes the wheel and touch moves itself, so no
  // scrollbar appears or goes and nothing behind it moves (Q1).
  root.addEventListener("pointerdown", (event) => {
    if (event.target === root && dismissible) dialog.close();
  });
  for (const type of ["wheel", "touchmove"] as const) {
    root.addEventListener(type, (event) => {
      if (event.target === root) event.preventDefault();
    }, { passive: false });
  }

  document.body.append(root);
  open = dialog;
  // Focus goes to the first field, or to the close button if there is none (U86).
  queueMicrotask(() => {
    const target = root.querySelector<HTMLElement>("input") ?? root.querySelector<HTMLElement>(".dialog-close") ?? root.querySelector<HTMLElement>("button");
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  });
  return dialog;
}

// A second popup opened from the first (U90): closing it goes back to the first.
export function openFrom(back: () => void, next: () => Dialog): Dialog {
  reopen = null;
  reopenFor = null;
  const previous = open;
  previous?.close(); // closing the first never runs its own way back: that is only for the one opened from it
  reopen = back;
  const dialog = next();
  reopenFor = dialog;
  return dialog;
}

export function closeDialog(): void {
  reopen = null;
  reopenFor = null;
  open?.close();
}
