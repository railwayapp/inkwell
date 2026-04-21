import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import remarkFlattenBlockquotes from "./remark-flatten-blockquotes";

function process(md: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkFlattenBlockquotes)
      .use(remarkStringify)
      .processSync(md),
  );
}

describe("remarkFlattenBlockquotes", () => {
  it("flattens nested blockquote to text with > prefix", () => {
    const md = "> > nested";
    const result = process(md);
    expect(result).toContain("> nested");
    // Should be a single level blockquote, not nested
    expect(result).not.toMatch(/^> > /m);
  });

  it("preserves single-level blockquotes", () => {
    const md = "> hello world";
    const result = process(md);
    expect(result).toContain("> hello world");
  });

  it("preserves non-blockquote siblings inside the outer blockquote", () => {
    const md = "> normal\n>\n> > nested";
    const result = process(md);
    expect(result).toContain("normal");
    expect(result).toContain("> nested");
  });

  it("handles deeply nested blockquotes (triple >)", () => {
    const md = "> > > deep";
    const result = process(md);
    // The outermost blockquote should contain flattened content
    expect(result).toContain(">");
    expect(result).toContain("deep");
  });

  it("does not affect non-blockquote content", () => {
    const md = "# Title\n\nA paragraph.";
    const result = process(md);
    expect(result).toContain("# Title");
    expect(result).toContain("A paragraph.");
  });

  it("handles empty blockquotes", () => {
    const md = "> ";
    const result = process(md).trim();
    expect(result).toBe(">");
  });
});
