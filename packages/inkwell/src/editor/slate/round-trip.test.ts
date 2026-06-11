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
    // `***` parsed inside a paragraph is 3 literal asterisks (no
    // emphasis content to wrap). mdast-util-to-markdown defensively
    // escapes them to `\*\*\*` so a re-parse can't reinterpret them
    // as emphasis. The source-cache path preserves the original.
    name: "`***` stays as paragraph text (canonical escapes)",
    source: "***",
    canonical: "\\*\\*\\*",
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
