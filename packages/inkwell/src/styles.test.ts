/**
 * Locks in three contracts of the bundled stylesheet:
 *
 *  1. No container-size opinion (`min-height`, `max-height`, `height`)
 *     is shipped on `.inkwell-editor`. Sizing is a consumer decision —
 *     a chat composer wants `min-height: 0`, a full-page editor wants
 *     `min-height: 60vh`, etc.
 *  2. Visual-chrome defaults (color, background, border, padding, type)
 *     across the editor, plugins, and renderer are wrapped in `:where()`
 *     so any single-class consumer rule (Tailwind utilities,
 *     `classNames` slot styling, `components` overrides on the renderer)
 *     wins by specificity tie-break — no `!important`, no descendant
 *     scoping, no inline-style hacks.
 *  3. Layout-critical rules (positioning, z-index, picker flip math,
 *     structural overflow) stay at normal specificity so consumers can't
 *     silently break editor or picker geometry.
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

  it("positions the character count as a top-right overlay", () => {
    const body = ruleBody(/^\.inkwell-editor-character-count$/);
    expect(body).not.toBeNull();
    const props = declarations(body ?? "");
    expect(props).toContain("position");
    expect(props).toContain("top");
    expect(props).toContain("right");
    expect(props).not.toContain("bottom");
  });

  it("does not reserve editor padding for the character count", () => {
    const body = ruleBody(
      /\.inkwell-editor-wrapper\.inkwell-editor-has-character-limit \.inkwell-editor/,
    );
    expect(body).toBeNull();
  });

  it("wraps the .inkwell-renderer typography defaults in :where()", () => {
    const body = ruleBody(/^:where\(\.inkwell-renderer\)$/);
    expect(body).not.toBeNull();
    const props = declarations(body ?? "");
    expect(props).toContain("font-size");
    expect(props).toContain("line-height");
  });

  // The renderer emits standard HTML elements (`a`, `h1`–`h3`, `p`,
  // `blockquote`, `ul`, `ol`, `li`, `code`, `pre`, `hr`, `strong`, `em`,
  // `del`, `img`) which consumers customize via
  // `<InkwellRenderer components={{ a: ... }} />` or by adding a class on
  // the rendered element. Every chrome rule on those elements must live
  // inside `:where()` so a single consumer class wins automatically.
  it.each([
    ".inkwell-renderer a",
    ".inkwell-renderer h1",
    ".inkwell-renderer h2",
    ".inkwell-renderer h3",
    ".inkwell-renderer p",
    ".inkwell-renderer blockquote",
    ".inkwell-renderer li",
    ".inkwell-renderer code",
    ".inkwell-renderer pre",
    ".inkwell-renderer pre code",
    ".inkwell-renderer hr",
    ".inkwell-renderer strong",
    ".inkwell-renderer em",
    ".inkwell-renderer del",
    ".inkwell-renderer img",
  ])("wraps renderer chrome rule for `%s` in :where()", selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wrapped = new RegExp(`:where\\(${escaped}\\)`);
    const unwrapped = new RegExp(`(^|[\\s,}])${escaped}\\s*[,{]`, "m");
    expect(STYLES_CSS).toMatch(wrapped);
    // The selector must not appear bare (outside of :where()) anywhere
    // else, otherwise the chrome rule keeps its old specificity.
    const withoutWhereForm = STYLES_CSS.replace(
      new RegExp(`:where\\(${escaped}\\)`, "g"),
      "",
    );
    expect(withoutWhereForm).not.toMatch(unwrapped);
  });

  // Same contract for editor inline marks, block elements, and code chrome.
  it.each([
    ":where(.inkwell-editor strong)",
    ":where(.inkwell-editor em)",
    ":where(.inkwell-editor del)",
    ":where(.inkwell-editor code)",
    ":where(.inkwell-editor-blockquote)",
    ":where(.inkwell-editor-heading)",
    ":where(.inkwell-editor-heading-1)",
    ":where(.inkwell-editor-heading-2)",
    ":where(.inkwell-editor-heading-3)",
    ":where(.inkwell-editor-image)",
    ":where(.inkwell-editor-link)",
    ":where(.inkwell-editor-link-url)",
  ])("wraps editor chrome rule `%s` in :where()", wrappedSelector => {
    expect(STYLES_CSS).toContain(wrappedSelector);
  });

  // Same contract for plugin chrome — bubble menu buttons, picker items,
  // and slash command surface.
  it.each([
    ":where(.inkwell-plugin-bubble-menu-inner)",
    ":where(.inkwell-plugin-bubble-menu-btn)",
    ":where(.inkwell-plugin-picker)",
    ":where(.inkwell-plugin-picker-search)",
    ":where(.inkwell-plugin-picker-item)",
    ":where(.inkwell-plugin-picker-title)",
    ":where(.inkwell-plugin-slash-commands-execute)",
  ])("wraps plugin chrome rule `%s` in :where()", wrappedSelector => {
    expect(STYLES_CSS).toContain(wrappedSelector);
  });

  // Layout-critical rules MUST stay at normal specificity. If any of these
  // ends up inside `:where()`, consumer classes can silently break
  // positioning, z-index, or the picker flip math.
  it.each([
    ".inkwell-editor-wrapper",
    ".inkwell-plugin-bubble-menu-container",
    ".inkwell-plugin-picker-popup",
    ".inkwell-renderer-code-block",
    ".inkwell-renderer-copy-btn",
  ])("keeps layout-critical rule `%s` unwrapped", selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A bare occurrence of the selector at the start of a rule block.
    const bare = new RegExp(`(^|[\\s,}])${escaped}\\s*\\{`, "m");
    expect(STYLES_CSS).toMatch(bare);
    // And inside the bare rule, a positioning declaration.
    const bareBody = ruleBody(new RegExp(`^${escaped}$`));
    expect(bareBody).not.toBeNull();
    expect(declarations(bareBody ?? "")).toContain("position");
  });

  // Token definitions (CSS custom properties on the editor / wrapper /
  // renderer / bubble menu / picker popup) are wrapped in `:where()` so
  // a consumer can override them at single-class specificity (e.g.
  // `.dark .inkwell-renderer { --inkwell-text: ... }` for class-driven
  // theming that does not rely on `prefers-color-scheme`). Without the
  // wrapper the rule sits at 0,0,1,0 and consumer overrides need a
  // doubled-class selector to win. Pattern check on the raw source —
  // looking for the 5-selector list inside `:where()`.
  const TOKEN_BLOCK_SELECTOR =
    /:where\(\s*\.inkwell-editor\s*,\s*\.inkwell-editor-wrapper\s*,\s*\.inkwell-renderer\s*,\s*\.inkwell-plugin-bubble-menu-container\s*,\s*\.inkwell-plugin-picker-popup\s*\)/;

  it("wraps the light-mode token definitions in :where()", () => {
    expect(STYLES_CSS).toMatch(TOKEN_BLOCK_SELECTOR);
    // And the same selectors must NOT appear as a bare top-level rule
    // list (which would re-introduce the 0,0,1,0 specificity).
    const bareList =
      /(^|\n)\s*\.inkwell-editor\s*,\s*\.inkwell-editor-wrapper\s*,\s*\.inkwell-renderer\s*,\s*\.inkwell-plugin-bubble-menu-container\s*,\s*\.inkwell-plugin-picker-popup\s*\{/;
    expect(STYLES_CSS).not.toMatch(bareList);
  });

  it("wraps the dark-mode token definitions in :where() inside @media", () => {
    // Find the dark-mode @media block and assert it uses the `:where()`
    // wrapper for the same 5-selector list.
    const mediaMatch = STYLES_CSS.match(
      /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/,
    );
    expect(mediaMatch).not.toBeNull();
    expect(mediaMatch?.[1] ?? "").toMatch(TOKEN_BLOCK_SELECTOR);
  });

  // Typography and spacing tokens are the single source of truth shared
  // between the editor and renderer surfaces. The contract:
  //   1. Each token is declared in the light-mode token block.
  //   2. Both `.inkwell-editor` rules and `.inkwell-renderer` rules
  //      reference the token via `var(--inkwell-...)`.
  // Without this, the two surfaces drift on font-size / line-height /
  // heading sizes / paragraph spacing and the editor stops being WYSIWYG.
  const TYPOGRAPHY_TOKENS = [
    "--inkwell-font-size",
    "--inkwell-line-height",
    "--inkwell-heading-weight",
    "--inkwell-heading-line-height",
    "--inkwell-h1-size",
    "--inkwell-h2-size",
    "--inkwell-h3-size",
    "--inkwell-h4-size",
    "--inkwell-h5-size",
    "--inkwell-h6-size",
    "--inkwell-code-font-size",
    "--inkwell-space-paragraph",
    "--inkwell-space-heading",
    "--inkwell-space-blockquote",
    "--inkwell-space-list",
    "--inkwell-space-list-item",
    "--inkwell-list-indent",
    "--inkwell-space-code-block",
    "--inkwell-space-image",
    "--inkwell-space-hr",
  ];

  it.each(TYPOGRAPHY_TOKENS)("declares %s in the token block", token => {
    // The token block uses the 5-selector `:where()` list (see
    // `TOKEN_BLOCK_SELECTOR` above) which already has its own contract
    // test. Here we only need to assert the declaration is present.
    const escaped = token.replace(/-/g, "\\-");
    expect(STYLES_CSS).toMatch(new RegExp(`${escaped}\\s*:`));
  });

  // Tokens that appear in both editor and renderer rules. If a future
  // change tokenizes a value on only one surface, the WYSIWYG promise
  // breaks — call that out by making the missing reference a test
  // failure.
  //
  // `--inkwell-space-paragraph` is intentionally NOT in this list. The
  // editor model emits one `<p>` per source line (blank lines become
  // empty paragraph nodes that serve as cursor targets), so a non-zero
  // paragraph margin in the editor would compound with those empty
  // paragraphs and visually multiply the gap between blocks. The
  // editor's paragraph margin stays at `0` until the empty-paragraph
  // encoding is reworked; the renderer keeps the token as its source
  // of truth.
  const SHARED_TOKENS = [
    "--inkwell-font-size",
    "--inkwell-line-height",
    "--inkwell-h1-size",
    "--inkwell-h2-size",
    "--inkwell-h3-size",
    "--inkwell-heading-weight",
    "--inkwell-heading-line-height",
    "--inkwell-space-heading",
    "--inkwell-space-blockquote",
    "--inkwell-space-image",
    "--inkwell-code-font-size",
  ];

  it.each(SHARED_TOKENS)("references %s in both editor and renderer", token => {
    // Strip the token-definition block so we only count *references*,
    // not the declaration line.
    const declStripped = STYLES_CSS.replace(/--inkwell-[a-z-]+\s*:[^;]+;/g, "");
    const escaped = token.replace(/-/g, "\\-");
    const usage = new RegExp(`var\\(${escaped}\\)`, "g");
    const declMatches = declStripped.match(usage) ?? [];
    expect(declMatches.length).toBeGreaterThan(0);

    // Walk each top-level rule body that targets the editor or renderer
    // surface (or one of its descendant selectors) and check the token
    // is referenced in at least one rule per surface.
    const ruleMatches = STYLES_CSS.matchAll(/([^{}]*)\{([^}]*)\}/g);
    let editorRefs = 0;
    let rendererRefs = 0;
    for (const m of ruleMatches) {
      const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const body = m[2];
      if (!body.includes(`var(${token})`)) continue;
      if (/\.inkwell-editor(?![\w-])|\.inkwell-editor-/.test(selector)) {
        editorRefs++;
      }
      if (/\.inkwell-renderer(?![\w-])|\.inkwell-renderer /.test(selector)) {
        rendererRefs++;
      }
    }
    expect(editorRefs).toBeGreaterThan(0);
    expect(rendererRefs).toBeGreaterThan(0);
  });

  // The character-count overlay splits positioning (unwrapped) from chrome
  // (wrapped). The contract: the bare selector keeps `position` / `top` /
  // `right`, while color / background / typography moved into `:where()`
  // so a consumer class can restyle the readout without losing placement.
  it("splits character-count positioning from chrome", () => {
    const positioning = ruleBody(/^\.inkwell-editor-character-count$/);
    expect(positioning).not.toBeNull();
    const layoutProps = declarations(positioning ?? "");
    expect(layoutProps).toContain("position");
    expect(layoutProps).toContain("top");
    expect(layoutProps).toContain("right");
    expect(layoutProps).not.toContain("color");
    expect(layoutProps).not.toContain("background");

    const chrome = ruleBody(/^:where\(\.inkwell-editor-character-count\)$/);
    expect(chrome).not.toBeNull();
    const chromeProps = declarations(chrome ?? "");
    expect(chromeProps).toContain("color");
    expect(chromeProps).toContain("background");
    expect(chromeProps).toContain("font-size");
  });
});
