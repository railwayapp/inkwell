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
  /**
   * Cache-pass form when it deliberately differs from `source`.
   * Only used by slices the cache refuses to store — an UNCLOSED
   * construct would absorb the following sibling block on re-parse
   * (see `sliceTerminates` in source-cache.ts).
   */
  cached?: string;
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
    // The cache refuses this slice: emitting the unclosed fence with a
    // sibling block after it would absorb that sibling on re-parse.
    cached: "```ts\nunclosed\n```",
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
  it.each(CASES)("$name preserves source verbatim", ({ source, cached }) => {
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    const out = serialize(nodes, { cache });
    expect(out).toBe(cached ?? source);
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
  // `cachedOut` — what the AT-REST (cache-faithful) pass emits. The
  // inter-block gap map re-emits the verbatim separator between
  // untouched adjacent blocks, so soft-wrapped documents stay
  // byte-exact at rest; only the canonical pass (edited blocks)
  // normalizes the single-newline gap to a blank line.
  const SPLIT_CASES: Array<{
    name: string;
    source: string;
    out: string;
    cachedOut?: string;
  }> = [
    {
      name: "two soft-wrapped lines",
      source: "hello\nworld",
      out: "hello\n\nworld",
      cachedOut: "hello\nworld",
    },
    {
      name: "three soft-wrapped lines",
      source: "first line\nsecond line\nthird line",
      out: "first line\n\nsecond line\n\nthird line",
      cachedOut: "first line\nsecond line\nthird line",
    },
    {
      name: "inline markers survive the split",
      source: "**bold** tail\nnext line",
      out: "**bold** tail\n\nnext line",
      cachedOut: "**bold** tail\nnext line",
    },
    {
      name: "heading then soft-wrapped paragraph",
      source: "# title\n\nfoo\nbar",
      out: "# title\n\nfoo\n\nbar",
      cachedOut: "# title\n\nfoo\nbar",
    },
    {
      name: "CRLF soft breaks leave no stray carriage return",
      source: "hello\r\nworld",
      out: "hello\n\nworld",
      // CR documents skip the cache entirely (documented) — the cache
      // pass degrades to the canonical form.
    },
  ];

  it.each(SPLIT_CASES)("$name (canonical pass)", ({ source, out }) => {
    expect(serialize(deserialize(source))).toBe(out);
  });

  it.each(SPLIT_CASES)("$name (cache pass)", ({ source, out, cachedOut }) => {
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    expect(serialize(nodes, { cache })).toBe(cachedOut ?? out);
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

/**
 * Regression corpus from the 2026-08 adversarial review of the unified
 * mdast pipeline. Each case pins a confirmed finding's fix; numbers
 * reference the review report.
 */
describe("round-trip — adversarial review regression fixes", () => {
  const rt = (s: string) => serialize(deserialize(s));

  it("#1 GFM tables: rows byte-preserved, no cell deletion, no \\| escapes", () => {
    const t = "| **a** | b |\n| - | - |\n| [x](https://x.com) | 2 |";
    // Rows are soft-wrapped sibling paragraphs; the single-newline gap
    // normalizes to a blank line (documented, identical to main's old
    // behavior). Every row keeps its exact bytes.
    expect(rt(t)).toBe(
      "| **a** | b |\n\n| - | - |\n\n| [x](https://x.com) | 2 |",
    );
    // The at-rest (cache) pass is byte-exact: the inter-block gap map
    // re-emits the single-newline separators between untouched rows.
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(t);
    populateSourceCacheFromParse(cache, t, nodes, ranges);
    expect(serialize(nodes, { cache })).toBe(t);
  });

  it("#2 task lists: marker visible in the model and byte-exact round trip", () => {
    const t = "- [ ] first task\n- [x] done task";
    const nodes = deserialize(t);
    expect(Node.string(nodes[0])).toContain("[ ] first task");
    expect(rt(t)).toBe(t);
  });

  it("#3 table nested in a blockquote: no `> ` leak, all rows preserved", () => {
    const t = "> | a | b |\n> | - | - |\n> | 1 | 2 |";
    const nodes = deserialize(t);
    expect(JSON.stringify(nodes)).not.toContain("> |");
    const out = rt(t);
    expect(out).toContain("| a | b |");
    expect(out).toContain("| 1 | 2 |");
  });

  it("#5 typed text keeps its bytes: no `\\_` / `\\*` escape injection", () => {
    expect(rt("snake_case_var costs 2 * 3 dollars")).toBe(
      "snake_case_var costs 2 * 3 dollars",
    );
  });

  it("#6 bare URLs and www links stay verbatim", () => {
    expect(rt("see https://x.com/a?b=1&c=2. thanks")).toBe(
      "see https://x.com/a?b=1&c=2. thanks",
    );
    expect(rt("visit www.example.com today")).toBe(
      "visit www.example.com today",
    );
  });

  it("#10 setext headings normalize to a single-line ATX model", () => {
    const nodes = deserialize("Title\n=====");
    expect(Node.string(nodes[0])).toBe("# Title");
    expect(nodes[0].level).toBe(1);
    expect(Node.string(nodes[0])).not.toContain("\n");
  });

  it("#11 bare-`>` runs and lazy continuations carry no backslash", () => {
    const nodes = deserialize(">a\n>b");
    expect(Node.string(nodes[0])).toBe(">a");
    expect(rt(">a\n>b")).toBe(">a\n\n>b");
    expect(rt(">foo\nbar")).toBe(">foo\n\nbar");
  });

  it("#12 links whose label contains escaped brackets survive", () => {
    const t = "[a\\[b](https://u.com)";
    expect(rt(t)).toBe(t);
  });

  it("#14 literal `\\>` text inside a quote is not upgraded to nesting", () => {
    expect(rt("> \\>foo")).toBe("> \\>foo");
  });

  it("#15 image title survives the round trip", () => {
    expect(rt('![a](u "t")')).toBe('![a](u "t")');
  });

  it("#18 thematic break nested in a blockquote stays verbatim text", () => {
    const nodes = deserialize("> ***");
    expect(JSON.stringify(nodes)).toContain("***");
    expect(rt("> ***")).toBe("> ***");
  });

  it("#19 mention markers keep their brackets", () => {
    expect(rt("ping @user[alice] now")).toBe("ping @user[alice] now");
  });

  it("headings with inline markers emit verbatim", () => {
    expect(rt("## Hey **bold** _it_ https://x.com")).toBe(
      "## Hey **bold** _it_ https://x.com",
    );
  });

  it("unsafe verbatim falls back to escaping: `1. ` paragraph never becomes a list", () => {
    const nodes = deserialize("**Steps:**\n1. \n2. ");
    const out = serialize(nodes);
    expect(out).not.toMatch(/^1\. $/m);
  });

  it("#4 multi-line leaf text serializes whole, not first-block-only", () => {
    // A paragraph leaf holding "a\n# b" (plugin replaceCurrentBlockContent
    // shape) must not silently drop everything after the first block.
    const nodes = deserialize("placeholder");
    (nodes[0].children[0] as { text: string }).text = "summary line\n# details";
    const out = serialize(nodes);
    expect(out).toContain("summary line");
    expect(out).toContain("details");
  });
});

describe("round-trip — inter-block gap map and definition verbatim (re-review fixes)", () => {
  const cachedRt = (source: string) => {
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    return serialize(nodes, { cache });
  };

  it("R2: marker-alternating list runs stay byte-exact at rest", () => {
    expect(cachedRt("- a\n* b\n+ c")).toBe("- a\n* b\n+ c");
  });

  it("blank-line runs between blocks stay byte-exact at rest", () => {
    expect(cachedRt("one\n\n\n\ntwo")).toBe("one\n\n\n\ntwo");
  });

  it("gap map degrades safely when a block between neighbors is edited", () => {
    const source = "hello\nworld";
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    // Simulate an edit to the second block: replace its text so the
    // canonical check misses. The pair is no longer fully cached, so
    // the join falls back to the normalized blank line.
    const edited = nodes.map((n, i) =>
      i === 1 ? { ...n, children: [{ text: "world!" }] } : n,
    );
    expect(serialize(edited, { cache })).toBe("hello\n\nworld!");
  });

  it("gap map degrades safely when blocks are reordered", () => {
    const source = "alpha\nbeta";
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    const reversed = [nodes[1], nodes[0]];
    expect(serialize(reversed, { cache })).toBe("beta\n\nalpha");
  });

  it("link reference definitions keep their brackets when edited", () => {
    // A definition is modeled as a verbatim-text paragraph; escaping
    // its bracket (`\[ref]:`) would break every reference link.
    expect(serialize(deserialize("[ref]: https://example.com"))).toBe(
      "[ref]: https://example.com",
    );
  });

  it("footnote definitions keep their brackets when edited", () => {
    expect(serialize(deserialize("[^1]: a note"))).toBe("[^1]: a note");
  });

  it("html blocks stay verbatim when edited", () => {
    expect(serialize(deserialize("<div>x</div>"))).toBe("<div>x</div>");
  });
});

describe("round-trip — re-review fixes (second adversarial pass)", () => {
  const rt = (s: string) => serialize(deserialize(s));
  const cachedRt = (source: string) => {
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    return { out: serialize(nodes, { cache }), nodes, cache };
  };

  it("RR#0 unclosed fence is never cached — a sibling can't be absorbed", () => {
    const { out } = cachedRt("```ts\nunclosed");
    expect(out).toBe("```ts\nunclosed\n```");
    // Joined with a following block, the closed canonical stays 2 blocks.
    const reparsed = deserialize(`${out}\n\nhello`);
    expect(reparsed).toHaveLength(2);
  });

  it("RR#1 task marker not doubled when content starts with an inline element", () => {
    for (const src of [
      "- [x] **b**",
      "- [ ] `code` first",
      "- [x] [link](https://x.com)",
      "- [x] _i_ task",
    ]) {
      const nodes = deserialize(src);
      const item = JSON.stringify(nodes);
      expect(item).not.toContain("[x] [x]");
      expect(item).not.toContain("[ ] [ ]");
      expect(rt(src)).toBe(src);
    }
    // plain-text-first control
    expect(rt("- [x] done")).toBe("- [x] done");
  });

  it("RR#2 bare-`>` text inside containers is not upgraded to nested quotes", () => {
    // Blockquote whose inner paragraph text literally starts with '>'
    const src = "> \\>inner";
    const out = rt(src);
    expect(deserialize(out)).toHaveLength(1);
    const tree = JSON.stringify(deserialize(out));
    // still ONE level of quoting — no nested blockquote appeared
    expect(tree.split('"blockquote"').length - 1).toBe(1);
  });

  it("RR#3 literally-typed trailing &#x20; survives serialization", () => {
    const out = rt("keep &#x20;");
    expect(out).toContain("#x20");
  });

  it("RR#4 unclosed <pre> paragraph cannot absorb following blocks", () => {
    const nodes = deserialize("hello");
    (nodes[0].children[0] as { text: string }).text = "<pre>oops";
    const out = serialize(nodes);
    const reparsed = deserialize(`${out}\n\nworld`);
    expect(reparsed.length).toBeGreaterThanOrEqual(2);
  });

  it("RR#4b closed html block stays verbatim", () => {
    expect(rt("<div>x</div>")).toBe("<div>x</div>");
  });

  it("RR#6 escaped markers stay escaped through container fallback", () => {
    const out = rt("> \\*\\*bold\\*\\*\n> next");
    // must NOT become live formatting
    expect(out).toContain("\\*");
  });

  it("RR#7 empty task-list scaffold keeps its markers", () => {
    const out = rt("- [x] done\n- [ ] ");
    expect(out).toContain("- [x] done");
    expect(out).toContain("[ ]");
  });

  it("RR#11 gap re-emission requires true adjacency (index check)", () => {
    const source = "a\nb";
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);
    // Insert an empty paragraph between the siblings (Enter gesture).
    const withEmpty = [
      nodes[0],
      { type: "paragraph", id: "fresh", children: [{ text: "" }] },
      nodes[1],
    ] as typeof nodes;
    expect(serialize(withEmpty, { cache })).toBe("a\n\nb");
    // Untouched doc still byte-exact.
    expect(serialize(nodes, { cache })).toBe("a\nb");
  });

  it("RR#13 setext heading in a blockquote does not leak `> ` into the model", () => {
    const nodes = deserialize("> Title\n> =====");
    const flat = JSON.stringify(nodes);
    expect(flat).toContain("# Title");
    expect(flat).not.toContain("> =");
  });

  it("RR-low multi-space heading prefix falls back without entity injection", () => {
    const out = rt("#  spaced");
    expect(out).not.toContain("&#x20;");
  });
});
