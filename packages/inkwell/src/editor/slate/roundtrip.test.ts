import { describe, expect, it } from "vitest";
import { deserialize } from "./deserialize";
import { serialize } from "./serialize";

/**
 * `serialize(deserialize(x))` must be the identity for normalized markdown.
 * Editing must not inflate single-newline line breaks to double newlines.
 */
describe("serialize/deserialize round-trip", () => {
  const roundTrip = (md: string) => serialize(deserialize(md));

  it("preserves single-newline line breaks", () => {
    const md = "the quick\nlittle brown\nfox jumps";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves double-newline paragraph breaks", () => {
    const md = "the quick\n\nlittle brown\n\nfox jumps";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves a mix of single and double newlines", () => {
    const md = "line one\nline two\n\nnew paragraph\nstill same paragraph";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves fenced code blocks, including blank lines inside", () => {
    const md = "```ts\nconst x = 1;\n\nconst y = 2;\n```";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves headings separated by blank lines", () => {
    const md = "# Title\n\nbody text\n\n## Subhead\n\nmore body";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves multi-line blockquotes", () => {
    const md = "> line one\n> line two";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves tight lists", () => {
    const md = "- a\n- b\n- c";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves loose lists", () => {
    const md = "- a\n\n- b\n\n- c";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves ordered lists", () => {
    const md = "1. first\n2. second\n3. third";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves images", () => {
    const md = "![alt text](https://example.com/img.png)";
    expect(roundTrip(md)).toBe(md);
  });

  it("preserves a mixed document", () => {
    const md = [
      "# Heading",
      "",
      "A paragraph with a soft break",
      "and a continuation line.",
      "",
      "> a quote",
      "> spanning lines",
      "",
      "- list item one",
      "- list item two",
      "",
      "```js",
      "const fn = () => {",
      "  return 1;",
      "};",
      "```",
      "",
      "Closing paragraph.",
    ].join("\n");
    expect(roundTrip(md)).toBe(md);
  });

  it("is idempotent: a no-op edit does not mutate content", () => {
    const md = "the quick\nlittle brown\nfox jumps\n\nsecond paragraph";
    const once = roundTrip(md);
    const twice = roundTrip(once);
    expect(twice).toBe(once);
  });
});
