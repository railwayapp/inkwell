import { describe, expect, it } from "vitest";
import { serialize } from "./serialize";
import type { InkwellElement } from "./types";
import { generateId } from "./with-node-id";

function el(
  type: string,
  text: string,
  extra?: Record<string, unknown>,
): InkwellElement {
  return {
    type,
    id: generateId(),
    children: [{ text }],
    ...extra,
  } as InkwellElement;
}

describe("serialize", () => {
  it("serializes a paragraph", () => {
    expect(serialize([el("paragraph", "hello")])).toBe("hello");
  });

  it("serializes heading with correct # prefix", () => {
    expect(serialize([el("heading", "# Title", { level: 1 })])).toBe("# Title");
    expect(serialize([el("heading", "## Sub", { level: 2 })])).toBe("## Sub");
    expect(serialize([el("heading", "### H3", { level: 3 })])).toBe("### H3");
  });

  it("defaults heading level to 1 when undefined", () => {
    expect(serialize([el("heading", "# No level")])).toBe("# No level");
  });

  it("serializes blockquote with > prefix", () => {
    expect(serialize([el("blockquote", "> quoted")])).toBe("> quoted");
  });

  it("serializes empty blockquote", () => {
    expect(serialize([el("blockquote", ">")])).toBe(">");
  });

  it("escapes leading > in blockquote content", () => {
    expect(serialize([el("blockquote", "> nested")])).toBe("> nested");
  });

  it("serializes multi-line blockquote with > separators", () => {
    expect(serialize([el("blockquote", "> line 1\n>\n> line 2")])).toBe(
      "> line 1\n>\n> line 2",
    );
  });

  it("serializes list items as-is (marker preserved in text)", () => {
    expect(serialize([el("list-item", "- item")])).toBe("- item");
  });

  it("serializes code fence with lines", () => {
    const nodes = [
      el("code-fence", "```ts"),
      el("code-line", "const x = 1;"),
      el("code-fence", "```"),
    ];
    expect(serialize(nodes)).toBe("```ts\nconst x = 1;\n```");
  });

  it("joins consecutive code elements with single newline", () => {
    const nodes = [
      el("code-fence", "```"),
      el("code-line", "a"),
      el("code-line", "b"),
      el("code-fence", "```"),
    ];
    expect(serialize(nodes)).toBe("```\na\nb\n```");
  });

  it("joins consecutive blockquotes with single newline", () => {
    const nodes = [el("blockquote", "> a"), el("blockquote", "> b")];
    expect(serialize(nodes)).toBe("> a\n> b");
  });

  it("joins consecutive unordered list-like paragraphs with single newline", () => {
    const nodes = [
      el("paragraph", "- a"),
      el("paragraph", "- b"),
      el("paragraph", "- c"),
    ];
    expect(serialize(nodes)).toBe("- a\n- b\n- c");
  });

  it("round-trips ordered list-like paragraphs", () => {
    const nodes = [el("paragraph", "1. a"), el("paragraph", "2. b")];
    expect(serialize(nodes)).toBe("1. a\n2. b");
  });

  it("preserves nested-list indentation across paragraph runs", () => {
    const nodes = [el("paragraph", "- a"), el("paragraph", "  - b")];
    expect(serialize(nodes)).toBe("- a\n  - b");
  });

  it("joins different types with double newline", () => {
    const nodes = [el("paragraph", "text"), el("blockquote", "> quote")];
    expect(serialize(nodes)).toBe("text\n\n> quote");
  });

  it("skips empty separator paragraphs cleanly", () => {
    const nodes = [
      el("paragraph", "first"),
      el("paragraph", ""),
      el("paragraph", "second"),
    ];
    const result = serialize(nodes);
    expect(result).toBe("first\n\nsecond");
  });

  it("serializes image element as markdown syntax", () => {
    const nodes = [
      el("image", "![caption](https://x.png)", {
        url: "https://x.png",
        alt: "caption",
      }),
    ];
    expect(serialize(nodes)).toBe("![caption](https://x.png)");
  });

  it("serializes image with empty alt", () => {
    const nodes = [el("image", "![](x.png)", { url: "x.png" })];
    expect(serialize(nodes)).toBe("![](x.png)");
  });

  it("synthesizes image source for plugin-created image nodes", () => {
    const nodes = [el("image", "", { url: "x.png", alt: "caption" })];
    expect(serialize(nodes)).toBe("![caption](x.png)");
  });

  it("handles empty document", () => {
    const nodes = [el("paragraph", "")];
    expect(serialize(nodes)).toBe("");
  });

  it("round-trips complex markdown", () => {
    const md = "## Title\n\n**bold** and _italic_\n\n> quote\n\n- item";
    // We can't import deserialize here (circular), so test serialize directly
    const nodes = [
      el("heading", "## Title", { level: 2 }),
      el("paragraph", ""),
      el("paragraph", "**bold** and _italic_"),
      el("paragraph", ""),
      el("blockquote", "> quote"),
      el("paragraph", ""),
      el("list-item", "- item"),
    ];
    expect(serialize(nodes)).toBe(md);
  });
});
