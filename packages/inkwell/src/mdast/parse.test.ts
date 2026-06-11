import { describe, expect, it } from "vitest";
import { parseMarkdownToMdast } from "./parse";

describe("parseMarkdownToMdast", () => {
  it("parses a heading", () => {
    const tree = parseMarkdownToMdast("# hello");
    expect(tree.type).toBe("root");
    expect(tree.children).toHaveLength(1);
    const heading = tree.children[0];
    expect(heading.type).toBe("heading");
    if (heading.type === "heading") expect(heading.depth).toBe(1);
  });

  it("retains position data for byte-faithful re-stringify", () => {
    const tree = parseMarkdownToMdast("# hello\n\nworld\n");
    for (const node of tree.children) {
      expect(node.position).toBeDefined();
      expect(node.position?.start.offset).toBeGreaterThanOrEqual(0);
      expect(node.position?.end.offset).toBeGreaterThan(
        node.position?.start.offset ?? 0,
      );
    }
  });

  it("strips tables (remarkNoTables) by default", () => {
    const tree = parseMarkdownToMdast("| a | b |\n|---|---|\n| 1 | 2 |\n");
    expect(tree.children.every(c => c.type !== "table")).toBe(true);
  });

  it("applies soft-break-as-paragraph by default", () => {
    const tree = parseMarkdownToMdast("one\ntwo");
    expect(tree.children).toHaveLength(2);
    expect(tree.children.every(c => c.type === "paragraph")).toBe(true);
  });

  it("applies soft-break-as-break when configured", () => {
    const tree = parseMarkdownToMdast("one\ntwo", { softBreak: "br" });
    expect(tree.children).toHaveLength(1);
    const para = tree.children[0];
    expect(para.type).toBe("paragraph");
    if (para.type === "paragraph") {
      const hasBreak = para.children.some(c => c.type === "break");
      expect(hasBreak).toBe(true);
    }
  });

  it("preserves soft breaks as literal newlines when configured", () => {
    const tree = parseMarkdownToMdast("one\ntwo", { softBreak: "preserve" });
    expect(tree.children).toHaveLength(1);
    const para = tree.children[0];
    if (para.type !== "paragraph") throw new Error("expected paragraph");
    expect(para.children).toHaveLength(1);
    const text = para.children[0];
    if (text.type !== "text") throw new Error("expected text");
    expect(text.value).toBe("one\ntwo");
  });

  it("escapes bare `>` at line start so `>foo` stays as paragraph text", () => {
    // The editor's typing trigger only treats `> ` (with space) as
    // structural. Without the source-level escape, deserializing saved
    // content that contains `>foo` (no space) would silently become a
    // blockquote even though the user typed it as plain text.
    // Anchoring the escape here means both the editor's deserialize
    // and the renderer's parse see the same shape.
    const tree = parseMarkdownToMdast(">foo");
    expect(tree.children).toHaveLength(1);
    const node = tree.children[0];
    expect(node.type).toBe("paragraph");
    if (node.type === "paragraph") {
      // The leading `>` survives as text content (mdast collapses the
      // backslash escape into a literal `>` text node).
      const text = node.children
        .map(c => (c.type === "text" ? c.value : ""))
        .join("");
      expect(text).toBe(">foo");
    }
  });

  it("still treats `> foo` (with space) as a blockquote", () => {
    const tree = parseMarkdownToMdast("> foo");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].type).toBe("blockquote");
  });

  it("remaps offsets to the original source after bare `>` lines", () => {
    // Regression: the bare-`>` escape inserts a `\` before parsing, so
    // raw mdast offsets index the escaped string. Slicing the ORIGINAL
    // source with them dropped a leading char from every later block
    // (`bar` -> `ar`). Offsets must point back into the original source.
    const content = ">foo\n\nbar\n\nbaz";
    const tree = parseMarkdownToMdast(content);
    const slices = tree.children.map(node => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      return content.slice(start, end);
    });
    expect(slices).toEqual([">foo", "bar", "baz"]);
  });

  it("compounds the offset remap across multiple bare `>` lines", () => {
    const content = ">a\n\nbravo\n\ncharlie";
    const tree = parseMarkdownToMdast(content);
    const last = tree.children[tree.children.length - 1];
    expect(
      content.slice(last.position?.start.offset, last.position?.end.offset),
    ).toBe("charlie");
  });

  it("preserves the verbatim thematic-break marker as paragraph text", () => {
    // A standard mdast `thematicBreak` carries no value, so the marker is
    // recovered by slicing the source. Without it the renderer collapsed
    // every marker to `---`, diverging from the editor (which slices the
    // verbatim source) and breaking WYSIWYG parity.
    for (const marker of ["***", "___", "* * *", "- - -"]) {
      const tree = parseMarkdownToMdast(marker);
      expect(tree.children).toHaveLength(1);
      const node = tree.children[0];
      expect(node.type).toBe("paragraph");
      if (node.type === "paragraph") {
        const text = node.children
          .map(c => (c.type === "text" ? c.value : ""))
          .join("");
        expect(text).toBe(marker);
      }
    }
  });
});

describe("parseMarkdownToMdast — bare-`>` escape is code-aware", () => {
  it("leaves `>` lines inside fenced code untouched", () => {
    // Regression: the escape used to apply line-blind across the whole
    // source, baking a literal `\` into code content on both surfaces.
    const tree = parseMarkdownToMdast("```\n>>> print(1)\n```");
    expect(tree.children[0].type).toBe("code");
    if (tree.children[0].type === "code") {
      expect(tree.children[0].value).toBe(">>> print(1)");
    }
  });

  it("leaves `>` lines inside tilde fences untouched", () => {
    const tree = parseMarkdownToMdast("~~~\n>x\n~~~");
    expect(tree.children[0].type).toBe("code");
    if (tree.children[0].type === "code") {
      expect(tree.children[0].value).toBe(">x");
    }
  });

  it("leaves `>` lines after an unclosed fence untouched", () => {
    const tree = parseMarkdownToMdast("```\n>x");
    expect(tree.children[0].type).toBe("code");
    if (tree.children[0].type === "code") {
      expect(tree.children[0].value).toBe(">x");
    }
  });

  it("resumes escaping after a closed fence", () => {
    const tree = parseMarkdownToMdast("```\ncode\n```\n\n>foo");
    expect(tree.children[1]?.type).toBe("paragraph");
  });

  it("does not treat an inline code span as a fence opener", () => {
    // ``` `x` ``` on one line is a code span, not a fence — the
    // following bare-`>` line must still be escaped to a paragraph.
    const tree = parseMarkdownToMdast("``` `x` ```\n\n>foo");
    expect(tree.children[1]?.type).toBe("paragraph");
  });

  it("remaps offsets exactly once for positions aliased by the paragraph splitter", () => {
    // Regression: the splitter reused boundary children's Point objects
    // for split paragraphs; the remap visited them twice and
    // double-subtracted, garbling every downstream source slice.
    const content = ">x\n\n**a**\n**b**";
    const tree = parseMarkdownToMdast(content);
    const [, second, third] = tree.children;
    expect(
      content.slice(
        second?.position?.start.offset,
        second?.position?.end.offset,
      ),
    ).toBe("**a**");
    expect(
      content.slice(third?.position?.start.offset, third?.position?.end.offset),
    ).toBe("**b**");
  });
});
