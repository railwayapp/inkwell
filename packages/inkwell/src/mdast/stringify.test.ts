import { describe, expect, it } from "vitest";
import { parseMarkdownToMdast } from "./parse";
import { stringifyMdast } from "./stringify";

describe("stringifyMdast", () => {
  it("round-trips a simple heading + paragraph", () => {
    const source = "# hello\n\nworld\n";
    const tree = parseMarkdownToMdast(source);
    const out = stringifyMdast(tree);
    expect(out.trim()).toBe("# hello\n\nworld".trim());
  });

  it("normalizes bullet character to '-' on stringify", () => {
    const tree = parseMarkdownToMdast("* one\n* two\n");
    const out = stringifyMdast(tree);
    expect(out).toContain("- one");
    expect(out).toContain("- two");
  });

  it("normalizes emphasis to '_' on stringify", () => {
    const tree = parseMarkdownToMdast("*emph*\n");
    const out = stringifyMdast(tree);
    expect(out).toContain("_emph_");
  });

  it("supports GFM strikethrough round-trip", () => {
    const tree = parseMarkdownToMdast("~~gone~~\n");
    const out = stringifyMdast(tree);
    expect(out).toContain("~~gone~~");
  });

  it("can override toMarkdown options for tests", () => {
    const tree = parseMarkdownToMdast("- one\n");
    const out = stringifyMdast(tree, {
      toMarkdown: { bullet: "*", extensions: [] },
    });
    expect(out).toContain("* one");
  });
});

describe("stringifyMdast — post-process escape stripping", () => {
  // These cases hit the post-process layer directly. The mdast input
  // for each is hand-constructed (rather than re-parsed from source)
  // so the test pins down exactly which escape mdast-util-to-markdown
  // emits and which our post-process drops.
  //
  // `mdast-util-to-markdown` always appends a single trailing newline;
  // we trim before comparing (the editor's `serialize` strips it
  // separately).

  it("strips leading `\\---` thematic-break protection", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "---" }] },
      ],
    });
    expect(out.trimEnd()).toBe("---");
  });

  it("strips `\\*\\*\\*` thematic-break protection (per-char escapes)", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "***" }] },
      ],
    });
    // mdast escapes `***` per character (`\*\*\*`), unlike `---` which
    // gets a single leading escape. A line consisting only of marker
    // characters always re-parses as a thematic break — which
    // `remarkNoThematicBreak` maps back to a verbatim paragraph — so
    // unescaping the whole line is safe and round-trips cleanly.
    expect(out.trimEnd()).toBe("***");
  });

  it("strips `\\[` / `\\]` link-bracket protection in plain text", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "see [section]" }],
        },
      ],
    });
    expect(out.trimEnd()).toBe("see [section]");
  });

  it("keeps real `[label](url)` link brackets (no escapes to strip)", () => {
    // Sanity check: real Link nodes don't go through the escape
    // mechanism, so the strip leaves their brackets alone.
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "see " },
            {
              type: "link",
              url: "https://example.com",
              children: [{ type: "text", value: "here" }],
            },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe("see [here](https://example.com)");
  });

  it("strips trailing `&#x20;` whitespace protection at end of line", () => {
    // `&#x20;` only gets injected at end-of-line, so the strip is
    // anchored there. A literal `&#x20;` typed mid-content shouldn't
    // be deleted — see the next case.
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            { type: "paragraph", children: [{ type: "text", value: " " }] },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe(">");
  });

  it("preserves `&#x20;` typed mid-content", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "foo &#x20; bar" }],
        },
      ],
    });
    // mdast-util-to-markdown escapes the `&` and `;` to avoid
    // re-parsing as an entity; our post-process only touches the
    // trailing-position case, so the literal mid-content sequence
    // survives in some escaped form. The important guarantee is
    // that the substring `&#x20;` isn't silently deleted.
    expect(out).toContain("&");
    expect(out).toContain("#x20");
  });

  it("strips `\\>` after a blockquote prefix at line start", () => {
    // Hand-built mdast: outer blockquote containing a paragraph whose
    // text starts with `>`. mdast emits `> \>foo` to protect the `>`
    // from being read as another nesting level on re-parse; for
    // Inkwell that's exactly the nested-quote behavior we want.
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: ">foo" }],
            },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe("> >foo");
  });

  it("collapses runs of consecutive bare-`>` lines to a single `>`", () => {
    // Trailing empty paragraph inside a blockquote: mdast emits
    // `> first\n>\n>` (first line + paragraph separator `>` line +
    // trailing empty `>` line). The collapse trims that to `> first\n>`.
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "first" }],
            },
            { type: "paragraph", children: [] },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe("> first\n>");
  });

  it("collapses an internal run of bare-`>` lines between content", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            { type: "paragraph", children: [{ type: "text", value: "a" }] },
            { type: "paragraph", children: [] },
            { type: "paragraph", children: [] },
            { type: "paragraph", children: [{ type: "text", value: "b" }] },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe("> a\n>\n> b");
  });
});

describe("stringifyMdast — accepted round-trip fidelity gaps", () => {
  // These cases document the canonical mdast normalizations Inkwell
  // doesn't reverse without the source cache. Listed here so the next
  // person changing serialize sees the trade-off explicitly.

  it("a leading empty paragraph inside a blockquote does not round-trip", () => {
    // Editor side: blockquote([empty paragraph, "first"]) keeps the
    // leading empty paragraph in mdast (the "edges" empty-paragraph
    // policy). mdast-util-to-markdown emits `>\n> first` for it; our
    // collapse runs over CONSECUTIVE bare `>` lines, so a single
    // leading `>\n` followed by `> first` doesn't collapse — the
    // structure survives in the canonical mdast output. On re-parse
    // CommonMark strips the leading blank quoted line, so an edit-
    // and-reload cycle still loses the original empty paragraph.
    //
    // Recovering byte-faithful "I started this quote with a blank
    // line" intent needs the source cache; this test captures the
    // canonical-form behavior so future changes stay deliberate.
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            { type: "paragraph", children: [] },
            {
              type: "paragraph",
              children: [{ type: "text", value: "first" }],
            },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe(">\n> first");
  });
});

describe("stringifyMdast — post-process is code-aware", () => {
  // Regression battery: every escape strip and the bare-`>` collapse
  // used to run blindly over the whole output, corrupting code content
  // (fenced and inline) that legitimately contains the same byte
  // patterns toMarkdown emits as defensive escapes elsewhere.

  it("keeps `\\[` inside an inline code span", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "see " },
            { type: "inlineCode", value: "\\[a-z]" },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe("see `\\[a-z]`");
  });

  it("still strips `\\[` outside the code span on the same line", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "[x " },
            { type: "inlineCode", value: "\\[y]" },
            { type: "text", value: " z]" },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe("[x `\\[y]` z]");
  });

  it("keeps fence content verbatim: brackets, marker lines, entities, `>` runs", () => {
    const value = "match \\[a-z]\n---\nuse &#x20;\n>\n>";
    const out = stringifyMdast({
      type: "root",
      children: [{ type: "code", lang: null, meta: null, value }],
    });
    expect(out.trimEnd()).toBe("```\n" + value + "\n```");
  });

  it("keeps content of a blockquote-wrapped fence verbatim", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [{ type: "code", lang: null, meta: null, value: ">\n>" }],
        },
      ],
    });
    expect(out.trimEnd()).toBe("> ```\n> >\n> >\n> ```");
  });

  it("still collapses bare-`>` runs outside fences", () => {
    const out = stringifyMdast({
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            { type: "paragraph", children: [] },
            { type: "paragraph", children: [] },
            { type: "paragraph", children: [{ type: "text", value: "x" }] },
          ],
        },
      ],
    });
    expect(out.trimEnd()).toBe(">\n> x");
  });
});
