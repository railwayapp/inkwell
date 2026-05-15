/**
 * Locks in two contracts of the bundled stylesheet:
 *
 *  1. No container-size opinion (`min-height`, `max-height`, `height`)
 *     is shipped on `.inkwell-editor`. Sizing is a consumer decision —
 *     a chat composer wants `min-height: 0`, a full-page editor wants
 *     `min-height: 60vh`, etc.
 *  2. Visual-chrome defaults (padding, border, background, type) are
 *     wrapped in `:where()` so any single-class consumer rule wins by
 *     specificity tie-break — no `!important`, no descendant scoping.
 *
 * These are CSS-source checks rather than runtime-cascade checks because
 * jsdom's CSS engine caches rule indexing across tests, which masks
 * per-test cascade behavior.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const STYLES_CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "styles.css"),
  "utf8",
);

/** Return the body of the first top-level rule whose selector matches `re`. */
function ruleBody(re: RegExp): string | null {
  // Walk top-level rules; ignore rules nested inside @media / @keyframes.
  let depth = 0;
  let i = 0;
  while (i < STYLES_CSS.length) {
    const ch = STYLES_CSS[i];
    if (ch === "{") {
      if (depth === 0) {
        const head = STYLES_CSS.slice(0, i);
        const ruleStart = Math.max(
          head.lastIndexOf("}"),
          head.lastIndexOf("{"),
          -1,
        );
        const selector = STYLES_CSS.slice(ruleStart + 1, i)
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .trim();
        // Find the matching closing brace.
        let braceDepth = 1;
        let j = i + 1;
        while (j < STYLES_CSS.length && braceDepth > 0) {
          if (STYLES_CSS[j] === "{") braceDepth++;
          else if (STYLES_CSS[j] === "}") braceDepth--;
          j++;
        }
        if (re.test(selector) && !selector.startsWith("@")) {
          return STYLES_CSS.slice(i + 1, j - 1);
        }
        i = j;
        continue;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
    }
    i++;
  }
  return null;
}

function declarations(body: string): Set<string> {
  const props = new Set<string>();
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    if (prop && !prop.startsWith("/*")) props.add(prop);
  }
  return props;
}

describe("bundled stylesheet contract", () => {
  it("ships no container-size opinion on .inkwell-editor", () => {
    // Search every rule whose selector targets the editor surface itself
    // (`.inkwell-editor` as a final segment, optionally followed by a
    // pseudo-class) and assert none declare a height-axis length.
    // Sizing is the consumer's call.
    const sizeProps = new Set(["min-height", "max-height", "height"]);
    // `\.inkwell-editor` followed by something that ends the simple
    // selector — end-of-selector, whitespace, comma, `)`, or `:` (pseudo).
    // Excludes things like `.inkwell-editor-image` or
    // `.inkwell-editor img` (descendant, not the surface itself).
    const matches = STYLES_CSS.matchAll(/([^{}]*\{[^}]*\})/g);
    const offenders: string[] = [];
    for (const m of matches) {
      const block = m[1];
      const brace = block.indexOf("{");
      const selector = block
        .slice(0, brace)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim();
      const body = block.slice(brace + 1, -1);
      if (!/\.inkwell-editor(?![\w-])/.test(selector)) continue;
      // Skip rules whose selectors target descendants of the editor
      // surface (e.g. `.inkwell-editor img`) — those style content
      // inside, not the surface itself.
      const targetsSurface = selector
        .split(",")
        .some((s: string) =>
          /\.inkwell-editor(?:[:.]|\s*$|\s*\))/.test(s.trim()),
        );
      if (!targetsSurface) continue;
      for (const prop of declarations(body)) {
        if (sizeProps.has(prop)) offenders.push(`${selector} { ${prop} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("wraps .inkwell-editor visual-chrome defaults in :where()", () => {
    const body = ruleBody(/^:where\(\.inkwell-editor\)$/);
    expect(body).not.toBeNull();
    const props = declarations(body ?? "");
    // These are the rules that consumers will typically want to override
    // (chat composer, panel embed, custom theme, etc). They MUST live
    // inside :where() so a single-class consumer rule wins by specificity.
    expect(props).toContain("padding");
    expect(props).toContain("border");
    expect(props).toContain("border-radius");
    expect(props).toContain("background");
    expect(props).toContain("font-size");
    expect(props).toContain("line-height");
  });

  it("wraps the :focus-within border-color in :where()", () => {
    const body = ruleBody(/^:where\(\.inkwell-editor:focus-within\)$/);
    expect(body).not.toBeNull();
    expect(declarations(body ?? "")).toContain("border-color");
  });

  it("wraps the character-limit padding rule in :where()", () => {
    const body = ruleBody(
      /^:where\(\s*\.inkwell-editor-wrapper\.inkwell-editor-has-character-limit \.inkwell-editor\s*\)$/,
    );
    expect(body).not.toBeNull();
    const props = declarations(body ?? "");
    expect(props).toContain("padding-right");
    expect(props).toContain("padding-bottom");
  });

  it("wraps the .inkwell-renderer typography defaults in :where()", () => {
    const body = ruleBody(/^:where\(\.inkwell-renderer\)$/);
    expect(body).not.toBeNull();
    const props = declarations(body ?? "");
    expect(props).toContain("font-size");
    expect(props).toContain("line-height");
  });
});
