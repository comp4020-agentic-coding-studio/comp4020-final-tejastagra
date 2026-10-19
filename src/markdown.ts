// A small Markdown -> HTML renderer, just enough to satisfy
// spec/invariants.test.ts (every README heading appears, in order, as text
// at /readme/) without pulling in a markdown dependency for one page.
// Not a general-purpose renderer: headings, paragraphs, lists, code fences,
// links, emphasis and inline code are supported; anything else passes
// through as escaped text.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2">$1</a>');
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const html: string[] = [];
  let i = 0;
  let inList = false;
  let inCode = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^ {0,3}(```|~~~)/.test(line)) {
      closeList();
      if (!inCode) {
        html.push("<pre><code>");
        inCode = true;
      } else {
        html.push("</code></pre>");
        inCode = false;
      }
      i++;
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      i++;
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)(\s+#+)?\s*$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    const listItem = line.match(/^ {0,3}[-*]\s+(.*)$/);
    if (listItem) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(listItem[1])}</li>`);
      i++;
      continue;
    }
    closeList();

    if (line.trim() === "") {
      i++;
      continue;
    }

    html.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeList();
  if (inCode) html.push("</code></pre>");

  return html.join("\n");
}
