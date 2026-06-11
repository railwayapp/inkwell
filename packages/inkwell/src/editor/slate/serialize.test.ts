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

  it("serializes a blockquote with a single inner paragraph", () => {
    const bq: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [el("paragraph", "quoted")],
    };
    expect(serialize([bq])).toBe("> quoted");
  });

  it("serializes an empty blockquote as a bare `>`", () => {
    const bq: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [el("paragraph", "")],
    };
    expect(serialize([bq])).toBe(">");
  });

  it("serializes a multi-paragraph blockquote with `>` separator lines", () => {
    const bq: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [
        el("paragraph", "line 1"),
        el("paragraph", ""),
        el("paragraph", "line 2"),
      ],
    };
    expect(serialize([bq])).toBe("> line 1\n>\n> line 2");
  });

  it("serializes nested blockquotes with double `> > ` prefix", () => {
    const inner: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [el("paragraph", "nested")],
    };
    const outer: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [inner],
    };
    expect(serialize([outer])).toBe("> > nested");
  });

  it("serializes a single-item unordered list", () => {
    const list: InkwellElement = {
      type: "list",
      id: generateId(),
      children: [
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "item")],
        },
      ],
    };
    expect(serialize([list])).toBe("- item");
  });

  it("serializes a code-block with a language tag", () => {
    const nodes: InkwellElement[] = [
      {
        type: "code-block",
        id: generateId(),
        lang: "ts",
        children: [{ text: "const x = 1;" }],
      },
    ];
    expect(serialize(nodes)).toBe("```ts\nconst x = 1;\n```");
  });

  it("serializes a multi-line code-block keeping inner newlines", () => {
    const nodes: InkwellElement[] = [
      {
        type: "code-block",
        id: generateId(),
        children: [{ text: "a\nb" }],
      },
    ];
    expect(serialize(nodes)).toBe("```\na\nb\n```");
  });

  it("separates adjacent blockquote elements with a blank line", () => {
    // Two sibling blockquote elements correspond to two separate
    // blockquote blocks in source (a blank line in between breaks the
    // grouping; deserialize would otherwise have collapsed them into
    // one element).
    const a: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [el("paragraph", "a")],
    };
    const b: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [el("paragraph", "b")],
    };
    expect(serialize([a, b])).toBe("> a\n\n> b");
  });

  it("serializes a multi-item unordered list with `\\n` line separators", () => {
    const list: InkwellElement = {
      type: "list",
      id: generateId(),
      children: [
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "a")],
        },
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "b")],
        },
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "c")],
        },
      ],
    };
    expect(serialize([list])).toBe("- a\n- b\n- c");
  });

  it("serializes an ordered list with starting number from `start`", () => {
    const list: InkwellElement = {
      type: "list",
      id: generateId(),
      ordered: true,
      start: 3,
      children: [
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "three")],
        },
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "four")],
        },
      ],
    };
    expect(serialize([list])).toBe("3. three\n4. four");
  });

  it("serializes a nested unordered list with 2-space indentation", () => {
    const inner: InkwellElement = {
      type: "list",
      id: generateId(),
      children: [
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "inner")],
        },
      ],
    };
    const outer: InkwellElement = {
      type: "list",
      id: generateId(),
      children: [
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "outer"), inner],
        },
      ],
    };
    // mdast emits tight (non-loose) lists by default — nested list
    // sits directly under its parent item without a blank-line
    // separator. The blank-line "loose" form is also valid markdown
    // but mdast-util-to-markdown picks tight unless we set
    // `spread: true` on the list.
    expect(serialize([outer])).toBe(
      "- outer\n\n  - inner".replace(/\n\n/g, "\n"),
    );
  });

  it("joins different types with double newline", () => {
    const bq: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [el("paragraph", "quote")],
    };
    expect(serialize([el("paragraph", "text"), bq])).toBe("text\n\n> quote");
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

  it("serializes a top-level image block", () => {
    const nodes: InkwellElement[] = [
      {
        type: "image",
        id: generateId(),
        url: "https://x.png",
        alt: "caption",
        children: [{ text: "" }],
      },
    ];
    expect(serialize(nodes)).toBe("![caption](https://x.png)");
  });

  it("serializes a top-level image with empty alt", () => {
    const nodes: InkwellElement[] = [
      {
        type: "image",
        id: generateId(),
        url: "x.png",
        alt: "",
        children: [{ text: "" }],
      },
    ];
    expect(serialize(nodes)).toBe("![](x.png)");
  });

  it("preserves an inline `![alt](url)` mid-paragraph as text", () => {
    // Images are top-level blocks, so mid-paragraph images stay as
    // markdown text in the paragraph (the decoration layer styles
    // them, but they're not promoted to inline elements in the
    // schema). The text flows through inline parsing on
    // serialize — mdast-util-to-markdown recognizes the image syntax
    // and re-emits it.
    const nodes: InkwellElement[] = [
      {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "see ![cat](x.png) here" }],
      },
    ];
    expect(serialize(nodes)).toBe("see ![cat](x.png) here");
  });

  it("handles empty document", () => {
    const nodes = [el("paragraph", "")];
    expect(serialize(nodes)).toBe("");
  });

  it("round-trips complex markdown", () => {
    const md = "## Title\n\n**bold** and _italic_\n\n> quote\n\n- item";
    // We can't import deserialize here (circular), so test serialize directly
    const blockquote: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [el("paragraph", "quote")],
    };
    const list: InkwellElement = {
      type: "list",
      id: generateId(),
      children: [
        {
          type: "list-item",
          id: generateId(),
          children: [el("paragraph", "item")],
        },
      ],
    };
    const nodes = [
      el("heading", "## Title", { level: 2 }),
      el("paragraph", ""),
      el("paragraph", "**bold** and _italic_"),
      el("paragraph", ""),
      blockquote,
      el("paragraph", ""),
      list,
    ];
    expect(serialize(nodes)).toBe(md);
  });
});
