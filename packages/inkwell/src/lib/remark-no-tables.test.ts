import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import remarkNoTables from "./remark-no-tables";

function process(md: string): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkNoTables)
      .use(remarkStringify)
      .processSync(md),
  );
}

describe("remarkNoTables", () => {
  it("converts a simple table to plain text", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const result = process(md);
    expect(result).toContain("| A | B |");
    expect(result).toContain("| 1 | 2 |");
    expect(result).not.toContain("<table>");
  });

  it("preserves the header separator row", () => {
    const md = "| Name | Age |\n|---|---|\n| Alice | 30 |";
    const result = process(md);
    expect(result).toContain("| --- | --- |");
  });

  it("handles multi-row tables", () => {
    const md = "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";
    const result = process(md);
    expect(result).toContain("| 1 | 2 | 3 |");
    expect(result).toContain("| 4 | 5 | 6 |");
  });

  it("does not affect non-table content", () => {
    const md = "# Hello\n\nA paragraph.\n\n- list item";
    const result = process(md);
    expect(result).toContain("# Hello");
    expect(result).toContain("A paragraph.");
    expect(result).toContain("* list item");
  });

  it("preserves content around tables", () => {
    const md = "before\n\n| A |\n|---|\n| 1 |\n\nafter";
    const result = process(md);
    expect(result).toContain("before");
    expect(result).toContain("after");
    expect(result).toContain("| A |");
  });

  it("handles single-column tables", () => {
    const md = "| X |\n|---|\n| 1 |";
    const result = process(md);
    expect(result).toContain("| X |");
    expect(result).toContain("| 1 |");
  });
});
