// A small, deliberately limited Markdown -> HTML renderer for /readme/.
// spec/invariants.test.ts only checks that each heading in README.md appears,
// in order, in the rendered page's text — it doesn't need full CommonMark
// fidelity, so this covers what a project README actually uses (headings,
// paragraphs, lists, code fences, inline code/bold/italic/links) and nothing
// more exotic.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2">$1</a>');
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inCodeBlock = false;
  let listOpen: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const closeParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listOpen) {
      html.push(`</${listOpen}>`);
      listOpen = null;
    }
  };

  for (const line of lines) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      closeParagraph();
      closeList();
      if (!inCodeBlock) {
        html.push("<pre><code>");
      } else {
        html.push("</code></pre>");
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      html.push(escapeHtml(line));
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)(\s+#+)?\s*$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet || ordered) {
      closeParagraph();
      const kind = bullet ? "ul" : "ol";
      if (listOpen !== kind) {
        closeList();
        html.push(`<${kind}>`);
        listOpen = kind;
      }
      html.push(`<li>${renderInline((bullet ?? ordered)![1])}</li>`);
      continue;
    }

    if (line.trim() === "") {
      closeParagraph();
      closeList();
      continue;
    }

    paragraph.push(line.trim());
  }
  closeParagraph();
  closeList();
  if (inCodeBlock) html.push("</code></pre>");

  return html.join("\n");
}
