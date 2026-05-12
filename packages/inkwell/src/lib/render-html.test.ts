import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./render-html";

describe("renderMarkdownToHtml", () => {
  it("returns an HTML string", () => {
    const html = renderMarkdownToHtml("hello");
    expect(typeof html).toBe("string");
    expect(html).toContain("<p>hello</p>");
  });

  it("renders headings", () => {
    expect(renderMarkdownToHtml("# Title")).toContain("<h1>Title</h1>");
    expect(renderMarkdownToHtml("## Sub")).toContain("<h2>Sub</h2>");
  });

  it("renders bold text", () => {
    const html = renderMarkdownToHtml("**bold**");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders italic text", () => {
    const html = renderMarkdownToHtml("_italic_");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders strikethrough (GFM)", () => {
    const html = renderMarkdownToHtml("~~deleted~~");
    expect(html).toContain("<del>deleted</del>");
  });

  it("renders links", () => {
    const html = renderMarkdownToHtml("[link](https://example.com)");
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it("renders inline code", () => {
    const html = renderMarkdownToHtml("`code`");
    expect(html).toContain("<code>code</code>");
  });

  it("renders fenced code blocks", () => {
    const md = "```js\nconst x = 1;\n```";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("const");
  });

  it("applies syntax highlighting classes to code blocks", () => {
    const md = "```typescript\nconst x: number = 1;\n```";
    const html = renderMarkdownToHtml(md);
    expect(html).toMatch(/class=".*hljs.*"/);
  });

  it("renders unordered lists", () => {
    const md = "- a\n- b";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>b</li>");
  });

  it("renders ordered lists", () => {
    const md = "1. first\n2. second";
    const html = renderMarkdownToHtml(md);
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
  });

  it("renders blockquotes", () => {
    const html = renderMarkdownToHtml("> quote");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("quote");
  });

  it("renders horizontal rules", () => {
    const html = renderMarkdownToHtml("---");
    expect(html).toContain("<hr>");
  });

  it("strips GFM tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const html = renderMarkdownToHtml(md);
    expect(html).not.toContain("<table>");
  });

  it("handles empty input", () => {
    const html = renderMarkdownToHtml("");
    expect(html).toBe("");
  });

  it("handles multi-paragraph content", () => {
    const html = renderMarkdownToHtml("First\n\nSecond");
    expect(html).toContain("<p>First</p>");
    expect(html).toContain("<p>Second</p>");
  });

  it("does not render > without space as blockquote", () => {
    const html = renderMarkdownToHtml(">no space");
    expect(html).not.toContain("<blockquote>");
    expect(html).toContain(">no space");
  });

  it("renders > with space as blockquote", () => {
    const html = renderMarkdownToHtml("> with space");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("with space");
  });

  it("flattens nested blockquotes to single level", () => {
    const html = renderMarkdownToHtml("> > nested");
    // Should be a single blockquote, not nested
    const blockquoteCount = (html.match(/<blockquote>/g) || []).length;
    expect(blockquoteCount).toBe(1);
    // Inner > should appear as text
    expect(html).toContain("> nested");
  });

  it("renders blockquote lines as separate paragraphs", () => {
    const html = renderMarkdownToHtml("> line1\n>\n> line2");
    expect(html).toContain("<p>line1</p>");
    expect(html).toContain("<p>line2</p>");
    // No <br> between them
    expect(html).not.toContain("<br");
  });

  describe("sanitization", () => {
    it("strips script tags", () => {
      const html = renderMarkdownToHtml('<script>alert("xss")</script>');
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("alert");
    });

    it("strips event handler attributes", () => {
      const html = renderMarkdownToHtml(
        '<img src="x" onerror="alert(1)" alt="test">',
      );
      expect(html).not.toContain("onerror");
    });

    it("strips javascript: URLs from links", () => {
      const html = renderMarkdownToHtml('[click](javascript:alert("xss"))');
      expect(html).not.toContain("javascript:");
    });

    it("strips iframe tags", () => {
      const html = renderMarkdownToHtml(
        '<iframe src="https://evil.com"></iframe>',
      );
      expect(html).not.toContain("<iframe");
    });

    it("preserves safe HTML elements", () => {
      const html = renderMarkdownToHtml("**bold** and _italic_");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<em>italic</em>");
    });

    it("preserves syntax highlighting classes after sanitization", () => {
      const md = "```typescript\nconst x: number = 1;\n```";
      const html = renderMarkdownToHtml(md);
      expect(html).toMatch(/class=".*hljs.*"/);
    });
  });
});
