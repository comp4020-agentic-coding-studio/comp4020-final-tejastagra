// Unit check: needs no running app. ADR 0006 and CLAUDE.md: every colour and
// font lives in public/theme.css as a CSS variable, and nothing else may define one.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/;
// A font may only be named through a variable: `font-family: var(--font-display)`
// and `font: 700 1rem/1 var(--font-body)`. A literal family name or a generic
// family such as sans-serif anywhere else is a font defined outside theme.css.
function definesFont(css: string): boolean {
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]*)/g)) if (!m[1].trim().startsWith("var(")) return true;
  for (const m of css.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]*)/g)) {
    if (!/var\(--font-/.test(m[1]) && !/^inherit\b/.test(m[1].trim())) return true;
  }
  return false;
}

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(ts|css|html)$/.test(name)) out.push(path);
  }
  return out;
}

// The screens that have not been restyled yet still carry the old plain
// stylesheet inside src/server/index.ts (the `const STYLES` block). Each
// screen restyle removes its share of it; when the last is restyled the block
// is deleted and this list must become empty (the next test enforces it).
const LEGACY_STYLE_BLOCK_IN = "src/server/index.ts";

function scannable(path: string): string {
  // Comments define nothing, so prose in them (such as "never defines a font") is not a definition.
  const text = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (path !== LEGACY_STYLE_BLOCK_IN) return text;
  return text.replace(/const STYLES = `[\s\S]*?\n`;\n/, "");
}

describe("theme: no colour or font outside public/theme.css (ADR 0006)", () => {
  const all = [...files("src"), ...files("public")].filter((f) => f !== join("public", "theme.css"));

  it("no hex, rgb, hsl or similar colour appears in any other source or style file", () => {
    const offenders = all.filter((f) => COLOUR.test(scannable(f)));
    expect(offenders).toEqual([]);
  });

  it("no font-family is defined in any other file", () => {
    const offenders = all.filter((f) => definesFont(scannable(f)));
    expect(offenders).toEqual([]);
  });

  it("the font check itself catches a literal family and accepts a variable", () => {
    expect(definesFont("a{font-family: Arial, sans-serif}")).toBe(true);
    expect(definesFont("a{font: 16px system-ui}")).toBe(true);
    expect(definesFont("a{font: 700 1rem/1 Fredoka}")).toBe(true);
    expect(definesFont("a{font-family: var(--font-display)}")).toBe(false);
    expect(definesFont("a{font: 700 1rem/1 var(--font-display)}")).toBe(false);
    expect(definesFont("a{font:inherit}")).toBe(false);
  });

  it("the colour check itself catches hex and functions", () => {
    for (const bad of ["color:#fff", "color: #1a1a1a", "background:rgb(0,0,0)", "x:rgba(1,2,3,.5)", "x:hsl(1 2% 3%)"]) expect(COLOUR.test(bad), bad).toBe(true);
    expect(COLOUR.test("color: var(--text)")).toBe(false);
  });

  const theme = readFileSync("public/theme.css", "utf8");
  const doc = readFileSync("docs/design/look-and-feel.md", "utf8");

  // The value of a token in theme.css, following one level of var(--other).
  function token(name: string): string {
    const m = theme.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!m) throw new Error(`theme.css does not define ${name}`);
    const v = m[1].trim();
    const ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
    return ref ? token(ref[1]) : v;
  }

  it("U2 theme.css defines every colour in look-and-feel.md's token table, with the same value", () => {
    const rows = [...doc.matchAll(/^\| `(--[a-z-]+)` \| `(#[0-9A-Fa-f]{6})`/gm)];
    expect(rows.length).toBeGreaterThanOrEqual(14);
    for (const [, name, hex] of rows) expect(token(name).toLowerCase(), name).toBe(hex.toLowerCase());
  });

  it("U2 the dimensions in look-and-feel.md are in theme.css", () => {
    expect(token("--radius-button")).toBe("14px");
    expect(token("--radius-panel")).toBe("20px");
    expect(token("--outline")).toBe("3px solid var(--ink)");
    expect(theme).toContain('"Fredoka"');
  });

  // WCAG contrast, computed from the real theme values.
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(token(a)), lum(token(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("U8 every text and background pair meets 4.5:1, and white is never on yellow", () => {
    const text: Array<[string, string]> = [
      ["--text", "--ground-top"], ["--text", "--ground-bottom"], ["--text", "--panel"],
      ["--text-muted", "--ground-bottom"], ["--text-muted", "--panel"],
      ["--link", "--ground-bottom"], ["--link", "--panel"],
      ["--text", "--red"], ["--text", "--blue"], ["--ink", "--yellow"],
      ["--yellow", "--ground-bottom"], ["--yellow", "--panel"],
      ["--error", "--panel"], ["--ok", "--panel"], ["--disabled-text", "--disabled"], ["--text", "--field"], ["--text-muted", "--field"], ["--error", "--ground-bottom"], ["--ok", "--ground-bottom"],
    ];
    for (const [fg, bg] of text) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--text", "--yellow")).toBeLessThan(3); // which is why no button puts white on yellow
    const css = readFileSync("public/components.css", "utf8");
    expect(css).toMatch(/\.btn-yellow\s*{[^}]*color:\s*var\(--ink\)/);
    expect(css).toMatch(/\.btn-red\s*{[^}]*color:\s*var\(--text\)/);
    expect(css).toMatch(/\.btn-blue\s*{[^}]*color:\s*var\(--text\)/);
  });

  it("U7 graphics that carry meaning meet 3:1 against what they sit on", () => {
    for (const [fg, bg] of [["--yellow", "--hole"], ["--red", "--hole"], ["--marker-you", "--red"], ["--marker-opponent", "--yellow"], ["--rubble", "--ink"], ["--rock", "--ink"], ["--timer-ok", "--field"], ["--timer-warn", "--field"], ["--timer-urgent", "--field"]] as Array<[string, string]>) {
      expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("the ratios printed in look-and-feel.md are the ones the theme gives", () => {
    const printed: Array<[string, string, string, number]> = [
      ["--text", "--ground-top", "`--text` on `--ground-top`", 17.64],
      ["--text", "--red", "white on `--red` (button labels)", 5.3],
      ["--text", "--blue", "white on `--blue` (button labels)", 5.93],
      ["--ink", "--yellow", "`--ink` on `--yellow` (button labels)", 12.55],
      ["--disabled-text", "--disabled", "`--disabled-text` on `--disabled` (a disabled button)", 5.94],
      ["--text", "--field", "`--text` on `--field` (an input)", 16.5],
      ["--error", "--ground-bottom", "`--error` on `--ground-bottom`", 8.58],
      ["--ok", "--ground-bottom", "`--ok` on `--ground-bottom`", 9.28],
      ["--rock", "--ink", "`--rock` on `--ink`", 4.4],
      ["--text", "--yellow", "white on `--yellow`", 1.56],
    ];
    for (const [fg, bg, label, value] of printed) {
      expect(doc, label).toContain(label);
      expect(doc, label).toContain(String(value));
      expect(Math.abs(ratio(fg, bg) - value), `${label} computed ${ratio(fg, bg).toFixed(2)}`).toBeLessThan(0.01);
    }
  });

  it("U3 bubbles are faint: no bubble colour is more than 22% opaque", () => {
    for (const name of ["--bubble-red", "--bubble-yellow", "--bubble-blue", "--bubble-rim"]) {
      const alpha = Number(token(name).match(/,\s*([0-9.]+)\)$/)?.[1]);
      expect(alpha, name).toBeLessThanOrEqual(0.22);
    }
  });

  it("U30 under reduced motion the bubbles and chips stop", () => {
    const css = readFileSync("public/components.css", "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.bubble\s*{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.chip\s*{[^}]*animation:\s*none/);
  });

  it("the shared stylesheet only uses variables from theme.css, and each one exists", () => {
    const theme = readFileSync("public/theme.css", "utf8");
    const defined = new Set([...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set<string>();
    for (const f of all) for (const m of readFileSync(f, "utf8").matchAll(/var\((--[a-z0-9-]+)/g)) used.add(m[1]);
    // Layout variables that components.css and the screens define for themselves.
    const local = new Set(["--page-pad", "--gap-board", "--board-pad", "--frame", "--ghost-size", "--board-width", "--left", "--fall", "--x", "--delay", "--size", "--time", "--rest", "--i"]);
    used.delete("--avatar-"); // built as `--avatar-${n}`: checked by the next test
    const missing = [...used].filter((v) => !defined.has(v) && !local.has(v));
    expect(missing).toEqual([]);
  });

  it("every avatar variable the code can build exists in theme.css", () => {
    const theme = readFileSync("public/theme.css", "utf8");
    for (let n = 1; n <= 6; n++) expect(theme).toContain(`--avatar-${n}:`);
    expect(readFileSync("src/client/arcade.ts", "utf8")).toContain("% 6) + 1");
  });

  it("the legacy style block is the only exemption, and only in src/server/index.ts", () => {
    expect(LEGACY_STYLE_BLOCK_IN).toBe("src/server/index.ts");
    const stray = all.filter((f) => f !== LEGACY_STYLE_BLOCK_IN && /const STYLES\b/.test(readFileSync(f, "utf8")));
    expect(stray).toEqual([]);
  });

  // U1 also covers outlines, radii and durations: they come from theme.css as variables.
  const shapeLiterals = (css: string): string[] => {
    const found: string[] = [];
    for (const m of css.matchAll(/(?:^|[;{\s])(border(?:-[a-z]+)*|outline|border-radius)\s*:\s*([^;}]*)/gm)) {
      const value = m[2].trim();
      if (value.startsWith("var(") || /^(0|none|inherit)$/.test(value)) continue;
      if (/\d+(\.\d+)?(px|rem|em|%)/.test(value) && !/var\(/.test(value)) found.push(`${m[1]}: ${value}`);
    }
    return found;
  };

  it("U1 no outline width or corner radius is a literal in the shared styles: they are theme variables", () => {
    expect(shapeLiterals(scannable("public/components.css"))).toEqual([]);
  });

  it("U1 no animation or transition duration is a literal in the shared styles", () => {
    const css = scannable("public/components.css");
    const literals = [...css.matchAll(/(?:animation|transition)\s*:\s*([^;]*)/g)]
      .map((m) => m[1])
      .filter((v) => /(^|\s)\d*\.?\d+m?s\b/.test(v.replace(/var\([^)]*\)/g, "")));
    expect(literals).toEqual([]);
  });

  it("U1 the scripts hold no pacing of their own: waits, delays and sizes come from the theme", () => {
    for (const f of ["src/client/preview.ts", "src/client/bubbles.ts", "src/client/arcade.ts"]) {
      const code = scannable(f);
      expect(code, `${f} has a literal wait`).not.toMatch(/\bwait\(\s*\d/);
      expect(code, `${f} has a literal setTimeout delay`).not.toMatch(/setTimeout\([^)]*,\s*\d{2,}\s*\)/);
      expect(code, `${f} has an inline seconds literal`).not.toMatch(/`[^`]*\d\.?\d*s`/);
    }
  });

  it("U19 there is no countdown: the fall alone lands within one second of the result arriving", () => {
    expect(theme).not.toMatch(/--ms-count/); // the countdown's pacing is gone from the theme
    const fall = parseFloat(token("--dur-drop")) * 1000;
    expect(fall).toBeLessThan(1000); // promise 2
    const client = readFileSync("src/client/game.ts", "utf8");
    expect(client).not.toContain("async function countdown");
    expect(readFileSync("src/server/screens.ts", "utf8")).not.toContain('data-testid="countdown"');
  });

  it("U25 the round timer is 10 seconds, with warn and urgent colours from the theme", () => {
    expect(readFileSync("src/client/game.ts", "utf8")).toContain("const ROUND_SECONDS = 10");
    const game = readFileSync("src/client/game.ts", "utf8");
    expect(game).toContain('seconds <= 3 ? "urgent" : seconds <= 5 ? "warn"'); // orange at 5, red at 3
    for (const v of ["--timer-ok", "--timer-warn", "--timer-urgent"]) expect(token(v)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("the shape check itself catches a literal outline and radius and allows variables", () => {
    expect(shapeLiterals("a{border: 2px solid red}")).toHaveLength(1);
    expect(shapeLiterals("a{border-radius: 10px}")).toHaveLength(1);
    expect(shapeLiterals("a{border-top: 7px solid #000}")).toHaveLength(1);
    expect(shapeLiterals("a{border: var(--outline); border-radius: var(--radius-panel); border: 0}")).toEqual([]);
  });
});
