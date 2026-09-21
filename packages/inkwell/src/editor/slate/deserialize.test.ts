import { Node } from "slate";
import { describe, expect, it } from "vitest";
import { deserialize } from "./deserialize";

describe("deserialize", () => {
  it("returns empty paragraph for empty string", () => {
    const result = deserialize("");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("paragraph");
    expect(Node.string(result[0])).toBe("");
  });

  it("deserializes plain text as paragraph", () => {
    const result = deserialize("hello world");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("paragraph");
    expect(Node.string(result[0])).toBe("hello world");
  });

  it("splits on blank lines into separate paragraphs (no empty separator)", () => {
    // Blank lines function as paragraph separators — both text-bearing
    // paragraphs land in the tree, but no zero-width sibling sits
    // between them. Visual gap comes from paragraph margins on render.
    const result = deserialize("first\n\nsecond");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("paragraph");
    expect(Node.string(result[0])).toBe("first");
    expect(result[1].type).toBe("paragraph");
    expect(Node.string(result[1])).toBe("second");
  });

  it("deserializes headings when enabled", () => {
    const result = deserialize("## Title", {
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
    });
    expect(result[0].type).toBe("heading");
    expect(result[0].level).toBe(2);
    expect(Node.string(result[0])).toBe("## Title");
  });

  it("deserializes h1 through h6", () => {
    for (let level = 1; level <= 6; level++) {
      const prefix = "#".repeat(level);
      const result = deserialize(`${prefix} text`, {
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      expect(result[0].type).toBe("heading");
      expect(result[0].level).toBe(level);
    }
  });

  it("treats headings as paragraphs when disabled", () => {
    const result = deserialize("## Title", {
      heading1: false,
      heading2: false,
      heading3: false,
      heading4: false,
      heading5: false,
      heading6: false,
    });
    expect(result[0].type).toBe("paragraph");
    expect(Node.string(result[0])).toBe("## Title");
  });

  it("enables specific heading levels independently", () => {
    const h1 = deserialize("# H1", { heading1: true, heading2: false });
    expect(h1[0].type).toBe("heading");

    const h2 = deserialize("## H2", { heading1: true, heading2: false });
    expect(h2[0].type).toBe("paragraph");
    expect(Node.string(h2[0])).toBe("## H2");
  });

  it("disables only h3 while keeping others", () => {
    const h2 = deserialize("## H2", { heading3: false });
    expect(h2[0].type).toBe("heading");

    const h3 = deserialize("### H3", { heading3: false });
    expect(h3[0].type).toBe("paragraph");

    const h4 = deserialize("#### H4", { heading3: false });
    expect(h4[0].type).toBe("heading");
  });

  it("deserializes a blockquote with a single inner paragraph", () => {
    const result = deserialize("> quoted text");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("blockquote");
    expect(result[0].children).toHaveLength(1);
    const inner = result[0].children[0];
    expect("type" in inner ? inner.type : null).toBe("paragraph");
    // The `> ` marker is structural — text is just the quoted content.
    expect(Node.string(result[0])).toBe("quoted text");
  });

  it("groups consecutive `> ` lines into one blockquote", () => {
    const result = deserialize("> first\n> second");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("blockquote");
    expect(result[0].children).toHaveLength(2);
    expect(Node.string(result[0])).toBe("firstsecond");
  });

  it("nests `> > ` lines as a blockquote inside a blockquote", () => {
    const result = deserialize("> > nested");
    expect(result[0].type).toBe("blockquote");
    const inner = result[0].children[0];
    expect("type" in inner ? inner.type : null).toBe("blockquote");
  });

  it("treats blockquotes as paragraphs when disabled", () => {
    const result = deserialize("> text", { blockquotes: false });
    expect(result[0].type).toBe("paragraph");
    expect(Node.string(result[0])).toBe("> text");
  });

  it("keeps later blocks intact after a bare `>` line", () => {
    // Regression: the bare-`>` escape shifted mdast offsets, so slicing
    // the original source dropped a leading char from each later block
    // (`bar` -> `ar`).
    const result = deserialize(">foo\n\nbar");
    expect(result).toHaveLength(2);
    expect(Node.string(result[0])).toBe(">foo");
    expect(Node.string(result[1])).toBe("bar");
  });

  it("keeps every block intact after multiple bare `>` lines", () => {
    const result = deserialize(">a\n\nbravo\n\ncharlie");
    expect(result.map(node => Node.string(node))).toEqual([
      ">a",
      "bravo",
      "charlie",
    ]);
  });

  it("keeps `---` as plain paragraph text (thematic break removed)", () => {
    const result = deserialize("---");
    expect(result[0].type).toBe("paragraph");
    expect(Node.string(result[0])).toBe("---");
  });

  it("keeps `***` and `___` as plain paragraph text", () => {
    expect(deserialize("***")[0].type).toBe("paragraph");
    expect(deserialize("___")[0].type).toBe("paragraph");
  });

  it("`- ` starts a list rather than a thematic-break", () => {
    const result = deserialize("- item");
    expect(result[0].type).toBe("list");
  });

  it("groups `- item` lines into a list with list-item children", () => {
    const result = deserialize("- one\n- two");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("list");
    expect(result[0].ordered).toBeUndefined();
    expect(result[0].children).toHaveLength(2);
    expect(Node.string(result[0])).toContain("one");
    expect(Node.string(result[0])).toContain("two");
  });

  it("recognizes `*` and `+` as unordered markers", () => {
    expect(deserialize("* one")[0].type).toBe("list");
    expect(deserialize("+ one")[0].type).toBe("list");
  });

  it("recognizes ordered lists and captures the starting number", () => {
    const result = deserialize("3. three\n4. four");
    expect(result[0].type).toBe("list");
    expect(result[0].ordered).toBe(true);
    expect(result[0].start).toBe(3);
    expect(result[0].children).toHaveLength(2);
  });

  it("doesn't carry `start` on the default-start (1) ordered list", () => {
    const result = deserialize("1. one\n2. two");
    expect(result[0].ordered).toBe(true);
    expect(result[0].start).toBeUndefined();
  });

  it("nests a child list when a list-item's content recurses", () => {
    const result = deserialize("- outer\n  - inner");
    expect(result[0].type).toBe("list");
    expect(result[0].children).toHaveLength(1);
    const outerItem = result[0].children[0];
    if (!("type" in outerItem) || outerItem.type !== "list-item") {
      throw new Error("expected list-item");
    }
    // Outer list-item contains a paragraph "outer" + a nested list.
    const nested = outerItem.children.find(
      c => "type" in c && c.type === "list",
    );
    expect(nested).toBeDefined();
  });

  it("deserializes a fenced code block into a single code-block element", () => {
    const result = deserialize("```ts\nconst x = 1;\n```");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("code-block");
    expect(result[0].lang).toBe("ts");
    expect(Node.string(result[0])).toBe("const x = 1;");
  });

  it("preserves inner newlines on a multi-line code-block", () => {
    const result = deserialize("```ts\nconst x = 1;\nconst y = 2;\n```");
    expect(result).toHaveLength(1);
    expect(Node.string(result[0])).toBe("const x = 1;\nconst y = 2;");
  });

  it("handles unclosed code blocks by collapsing whatever was captured", () => {
    const result = deserialize("```js\nunclosed");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("code-block");
    expect(result[0].lang).toBe("js");
    expect(Node.string(result[0])).toBe("unclosed");
  });

  it("treats code fences as paragraphs when disabled", () => {
    const result = deserialize("```\ncode\n```", { codeBlocks: false });
    const types = result.map(e => e.type);
    expect(types).not.toContain("code-block");
  });

  it("assigns unique IDs to every element", () => {
    const result = deserialize("line 1\n\nline 2\n\nline 3");
    const ids = result.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("generates different IDs for same content deserialized twice", () => {
    const a = deserialize("hello");
    const b = deserialize("hello");
    expect(a[0].id).not.toBe(b[0].id);
  });

  it("groups three consecutive `- ` lines into a single list", () => {
    const result = deserialize("- a\n- b\n- c");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("list");
    expect(result[0].children).toHaveLength(3);
  });

  it("captures ordered list start when the run begins at a non-1 number", () => {
    const result = deserialize("3. a\n4. b");
    expect(result[0].type).toBe("list");
    expect(result[0].ordered).toBe(true);
    expect(result[0].start).toBe(3);
  });

  it("indented `- ` content nests inside the outer list-item", () => {
    const result = deserialize("- a\n  - b");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("list");
    const outerItem = result[0].children[0];
    if (!("type" in outerItem) || outerItem.type !== "list-item") {
      throw new Error("expected list-item");
    }
    expect(outerItem.children.some(c => "type" in c && c.type === "list")).toBe(
      true,
    );
  });

  it("deserializes a standalone `![alt](url)` line as a top-level image block", () => {
    const result = deserialize("![a cat](https://img/cat.png)");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("image");
    expect(result[0].alt).toBe("a cat");
    expect(result[0].url).toBe("https://img/cat.png");
  });

  it("leaves inline-mid-paragraph image syntax as paragraph text", () => {
    const result = deserialize("see ![cat](x.png) here");
    expect(result[0].type).toBe("paragraph");
    expect(Node.string(result[0])).toBe("see ![cat](x.png) here");
  });

  it("treats image syntax as paragraph when images disabled", () => {
    const result = deserialize("![a](b.png)", { images: false });
    expect(result[0].type).toBe("paragraph");
    expect(Node.string(result[0])).toBe("![a](b.png)");
  });

  it("handles whitespace-only input", () => {
    const result = deserialize("   ");
    expect(result.length).toBeGreaterThan(0);
    for (const el of result) {
      expect(el.id).toBeDefined();
    }
  });
});
