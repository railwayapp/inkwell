import { describe, expect, it } from "vitest";
import { serializeToMarkdown } from "./html-serializer";

describe("serializeToMarkdown", () => {
  it("converts a paragraph to plain text", () => {
    const md = serializeToMarkdown("<p>Hello world</p>");
    expect(md).toBe("Hello world");
  });

  it("converts strong tags to markdown bold", () => {
    const md = serializeToMarkdown("<p><strong>bold</strong></p>");
    expect(md).toContain("**bold**");
  });

  it("converts em tags to markdown italic", () => {
    const md = serializeToMarkdown("<p><em>italic</em></p>");
    expect(md).toContain("_italic_");
  });

  it("converts del tags to markdown strikethrough", () => {
    const md = serializeToMarkdown("<p><del>deleted</del></p>");
    expect(md).toContain("~~deleted~~");
  });

  it("converts s tags to markdown strikethrough", () => {
    const md = serializeToMarkdown("<p><s>deleted</s></p>");
    expect(md).toContain("~~deleted~~");
  });

  it("converts strike tags to markdown strikethrough", () => {
    const md = serializeToMarkdown("<p><strike>deleted</strike></p>");
    expect(md).toContain("~~deleted~~");
  });

  it("converts links to markdown links", () => {
    const md = serializeToMarkdown(
      '<p><a href="https://example.com">click</a></p>',
    );
    expect(md).toContain("[click](https://example.com)");
  });

  it("converts headings to ATX style", () => {
    expect(serializeToMarkdown("<h1>Title</h1>")).toBe("# Title");
    expect(serializeToMarkdown("<h2>Subtitle</h2>")).toBe("## Subtitle");
    expect(serializeToMarkdown("<h3>Section</h3>")).toBe("### Section");
  });

  it("converts unordered lists", () => {
    const html = "<ul><li>one</li><li>two</li></ul>";
    const md = serializeToMarkdown(html);
    expect(md).toContain("one");
    expect(md).toContain("two");
    // Turndown uses 3-space indent for list items
    expect(md).toMatch(/-\s+one/);
  });

  it("converts ordered lists", () => {
    const html = "<ol><li>first</li><li>second</li></ol>";
    const md = serializeToMarkdown(html);
    expect(md).toContain("1. first");
    expect(md).toContain("2. second");
  });

  it("converts inline code", () => {
    const md = serializeToMarkdown("<p><code>foo()</code></p>");
    expect(md).toContain("`foo()`");
  });

  it("converts fenced code blocks with language", () => {
    const html =
      '<pre><code class="language-typescript">const x = 1;</code></pre>';
    const md = serializeToMarkdown(html);
    expect(md).toContain("```typescript");
    expect(md).toContain("const x = 1;");
    expect(md).toContain("```");
  });

  it("converts fenced code blocks without language", () => {
    const html = "<pre><code>plain code</code></pre>";
    const md = serializeToMarkdown(html);
    expect(md).toContain("```");
    expect(md).toContain("plain code");
  });

  it("converts blockquotes", () => {
    const md = serializeToMarkdown("<blockquote><p>quote</p></blockquote>");
    expect(md).toContain("> quote");
  });

  it("converts horizontal rules", () => {
    const md = serializeToMarkdown("<hr>");
    expect(md).toContain("***");
  });

  it("converts nested inline marks", () => {
    const md = serializeToMarkdown(
      "<p><strong><em>bold italic</em></strong></p>",
    );
    expect(md).toContain("**");
    expect(md).toContain("_");
    expect(md).toContain("bold italic");
  });

  it("handles empty input", () => {
    const md = serializeToMarkdown("");
    expect(md).toBe("");
  });

  it("handles plain text without HTML tags", () => {
    const md = serializeToMarkdown("just text");
    expect(md).toBe("just text");
  });

  it("preserves multi-paragraph structure", () => {
    const html = "<p>First</p><p>Second</p>";
    const md = serializeToMarkdown(html);
    expect(md).toContain("First");
    expect(md).toContain("Second");
  });

  it("does not escape markdown syntax in text nodes", () => {
    // Critical for WYSIWYG: typed markdown must survive the roundtrip
    expect(serializeToMarkdown("<p>**bold**</p>")).toBe("**bold**");
    expect(serializeToMarkdown("<p>_italic_</p>")).toBe("_italic_");
    expect(serializeToMarkdown("<p># heading</p>")).toBe("# heading");
  });

  it("renders tables as plain text (not as table markup)", () => {
    const html =
      "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
    const md = serializeToMarkdown(html);
    // Tables are converted to plain text, not rendered as HTML tables
    expect(md).toContain("A");
    expect(md).toContain("1");
  });

  it("preserves strikethrough despite table removal", () => {
    const md = serializeToMarkdown("<p><del>struck</del></p>");
    expect(md).toContain("~~struck~~");
  });
});
