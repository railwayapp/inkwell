import { Node } from "slate";
import { describe, expect, it } from "vitest";
import { deserialize, deserializeWithRanges } from "./deserialize";
import { serialize } from "./serialize";
import {
  createSourceCache,
  populateSourceCacheFromParse,
} from "./source-cache";

/**
 * Round-trip corpus.
 *
 * Two passes per case:
 *
 * 1. **Canonical pass** — `deserialize → serialize` with no cache.
 *    Compares against `canonical` (defaults to `source` when omitted).
 *    Documents the canonical/normalized form mdast-style serialize
 *    produces.
 *
 * 2. **Source-cache pass** — `deserializeWithRanges → populate cache →
 *    serialize(..., {cache})`. Always asserts byte-equal to `source`.
 *    This is the D2 contract: untouched blocks round-trip
 *    byte-for-byte through the editor.
 */

const CASES: Array<{
  name: string;
  source: string;
  /** Canonical (no-cache) form. Defaults to `source` when omitted. */
  canonical?: string;
}> = [
  { name: "single paragraph", source: "hello world" },
  { name: "two paragraphs", source: "first\n\nsecond" },
  {
    name: "headings 1-6",
    source: "# h1\n\n## h2\n\n### h3\n\n#### h4\n\n##### h5\n\n###### h6",
  },
  { name: "blockquote with single line", source: "> quoted" },
  {
    name: "blockquote with two lines (canonical adds blank `>` separator)",
    source: "> a\n> b",
    canonical: "> a\n>\n> b",
  },
  {
    name: "blockquote with explicit blank `>` separator",
    source: "> a\n>\n> b",
  },
  { name: "nested blockquote", source: "> > nested" },
  {
    name: "blockquote then paragraph",
    source: "> quoted\n\nbody",
  },
  { name: "`---` stays as paragraph text", source: "---" },
  {
    name: "`---` between paragraphs stays as paragraph",
    source: "before\n\n---\n\nafter",
  },
  {
    // `***` parsed inside a paragraph is 3 literal asterisks.
    // mdast-util-to-markdown defensively escapes them per character
    // (`\*\*\*`); the post-process unescapes whole marker-only lines
    // because they re-parse as thematic breaks, which
    // `remarkNoThematicBreak` maps back to verbatim paragraphs.
    name: "`***` stays as paragraph text (escapes stripped)",
    source: "***",
  },
  {
    name: "heading + blockquote + paragraph mix",
    source: "# title\n\n> quote\n\nrest",
  },
  { name: "code block without language", source: "```\ncode\n```" },
  { name: "code block with language", source: "```ts\nconst x = 1;\n```" },
  {
    name: "multi-line code block preserves inner newlines",
    source: "```ts\nconst x = 1;\nconst y = 2;\n```",
  },
  {
    name: "unclosed code block (canonical closes the fence)",
    source: "```ts\nunclosed",
    canonical: "```ts\nunclosed\n```",
  },
  { name: "unordered list", source: "- one\n- two\n- three" },
  {
    name: "unordered list with `*` markers (canonical switches to `-`)",
    source: "* one\n* two",
    canonical: "- one\n- two",
  },
  {
    name: "unordered list with `+` markers (canonical switches to `-`)",
    source: "+ one\n+ two",
    canonical: "- one\n- two",
  },
  { name: "ordered list", source: "1. one\n2. two\n3. three" },
  { name: "ordered list with custom start", source: "5. five\n6. six" },
  {
    // mdast normalizes nested lists to tight form (no blank line
    // between outer item and inner list). The source-cache path
    // still preserves the loose original.
    name: "nested unordered list (canonical tightens)",
    source: "- outer\n\n  - inner",
    canonical: "- outer\n  - inner",
  },
  {
    name: "image on its own line",
    source: "![alt](https://img/cat.png)",
  },
  {
    name: "image with empty alt",
    source: "![](https://img/cat.png)",
  },
  {
    // Regression: a document-wide `\n{3,}` collapse in serialize used to
    // eat the double blank line INSIDE the fence — even via the cache.
    name: "code block with consecutive blank lines",
    source: "```py\ndef a():\n    pass\n\n\ndef b():\n    pass\n```",
  },
  {
    // Regression: the bare-`>` escape used to apply inside fences,
    // baking a literal `\` into code on both surfaces.
    name: "code block with bare-`>` lines (doctest)",
    source: "```\n>>> print(1)\n```",
  },
  {
    // Regression: the stringify bare-`>`-run collapse used to delete
    // one of these lines from edited blocks.
    name: "code block with consecutive `>` lines",
    source: "```\n>\n>\n```",
  },
  {
    // Regression: the `\[`/`\]` escape strip used to run inside fence
    // content.
    name: "code block with literal backslash-bracket",
    source: "```\nmatch \\[a-z]\n```",
  },
  {
    // Regression: ContainerChild omitted Heading — `> # title` used to
    // serialize as a bare `>`.
    name: "heading inside blockquote",
    source: "> # title\n> body",
    canonical: "> # title\n>\n> body",
  },
];

describe("Round-trip corpus — canonical pass (no cache)", () => {
  it.each(CASES)("$name", ({ source, canonical }) => {
    const out = serialize(deserialize(source));
    expect(out).toBe(canonical ?? source);
  });
});

describe("Round-trip corpus — source-cache pass (byte-perfect)", () => {
  it.each(CASES)("$name preserves source verbatim", ({ source }) => {
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    const out = serialize(nodes, { cache });
    expect(out).toBe(source);
  });
});

/**
 * Soft-wrapped paragraphs split into sibling blocks (the editor's
 * documented model), so a single-newline gap normalizes to a blank
 * line — the per-block source cache cannot express "no blank line
 * between blocks". These cases pin the NON-CORRUPTING normalization;
 * the regression they guard: positionless split paragraphs used to
 * cache the document's FIRST LINE as every block's source, so
 * "hello\nworld" serialized as "hello\n\nhello" and inline markers
 * vanished via the mdastToString fallback.
 */
describe("Round-trip — soft-wrapped (split-block) shapes normalize without corruption", () => {
  const SPLIT_CASES: Array<{ name: string; source: string; out: string }> = [
    {
      name: "two soft-wrapped lines",
      source: "hello\nworld",
      out: "hello\n\nworld",
    },
    {
      name: "three soft-wrapped lines",
      source: "first line\nsecond line\nthird line",
      out: "first line\n\nsecond line\n\nthird line",
    },
    {
      name: "inline markers survive the split",
      source: "**bold** tail\nnext line",
      out: "**bold** tail\n\nnext line",
    },
    {
      name: "heading then soft-wrapped paragraph",
      source: "# title\n\nfoo\nbar",
      out: "# title\n\nfoo\n\nbar",
    },
    {
      name: "CRLF soft breaks leave no stray carriage return",
      source: "hello\r\nworld",
      out: "hello\n\nworld",
    },
  ];

  it.each(SPLIT_CASES)("$name (canonical pass)", ({ source, out }) => {
    expect(serialize(deserialize(source))).toBe(out);
  });

  it.each(SPLIT_CASES)("$name (cache pass)", ({ source, out }) => {
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    expect(serialize(nodes, { cache })).toBe(out);
  });

  it("split paragraphs carry real line ranges, not fabricated {0,0}", () => {
    const { nodes, ranges } = deserializeWithRanges("hello\nworld");
    expect(nodes.map(n => Node.string(n))).toEqual(["hello", "world"]);
    expect(ranges).toEqual([
      { startLine: 0, endLine: 0 },
      { startLine: 1, endLine: 1 },
    ]);
  });

  it("bare-`>` line plus soft-wrapped markers slice correctly (offset remap aliasing)", () => {
    // Regression: the offset remap used to double-subtract on Point
    // objects the paragraph splitter aliased into split paragraphs,
    // shifting every slice left and garbling editor text.
    const source = ">x\n\n**a**\n**b**";
    const nodes = deserialize(source);
    expect(nodes.map(n => Node.string(n))).toEqual([">x", "**a**", "**b**"]);
  });

  it("GFM tables degrade to row paragraphs without duplicating line 0", () => {
    // Regression: the positionless paragraph remark-no-tables
    // synthesizes used to poison the cache the same way — every table
    // row serialized as a copy of the document's first line.
    const source = "intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 |";
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    const out = serialize(nodes, { cache });
    expect(out).toContain("intro");
    expect(out).toContain("| a | b |");
    expect(out).toContain("| 1 | 2 |");
    expect(out).not.toContain("intro\n\nintro");
  });
});

describe("Round-trip — container soft-wraps and CRLF code values", () => {
  it("keeps inline markers visible inside soft-wrapped blockquote paragraphs", () => {
    // Container-nested split paragraphs are always positionless (the
    // source slice carries `> ` prefixes the value lacks), so they hit
    // the to-slate fallback. The fallback must re-stringify inline
    // structure — the old mdast-util-to-string path dropped `**` and
    // link URLs from the model.
    const nodes = deserialize("> **b** a\n> c");
    expect(Node.string(nodes[0])).toContain("**b**");
  });

  it("keeps link URLs visible inside soft-wrapped list-item paragraphs", () => {
    const nodes = deserialize("- see [docs](https://d.com)\n  next line");
    expect(Node.string(nodes[0])).toContain("[docs](https://d.com)");
  });

  it("normalizes CRLF line endings inside code-block values", () => {
    const nodes = deserialize("```js\r\nfoo\r\nbar\r\n```");
    expect(nodes[0].type).toBe("code-block");
    expect(Node.string(nodes[0])).toBe("foo\nbar");
    expect(Node.string(nodes[0])).not.toContain("\r");
  });
});
