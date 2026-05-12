import { describe, expect, it } from "vitest";
import { deserialize } from "./deserialize";

describe("deserialize", () => {
  it("returns empty paragraph for empty string", () => {
    const result = deserialize("");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("paragraph");
    expect(result[0].children[0].text).toBe("");
  });

  it("deserializes plain text as paragraph", () => {
    const result = deserialize("hello world");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("paragraph");
    expect(result[0].children[0].text).toBe("hello world");
  });

  it("splits on blank lines into separate paragraphs", () => {
    const result = deserialize("first\n\nsecond");
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("paragraph");
    expect(result[0].children[0].text).toBe("first");
    expect(result[1].type).toBe("paragraph");
    expect(result[1].children[0].text).toBe("");
    expect(result[2].type).toBe("paragraph");
    expect(result[2].children[0].text).toBe("second");
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
    expect(result[0].children[0].text).toBe("## Title");
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
    expect(result[0].children[0].text).toBe("## Title");
  });

  it("enables specific heading levels independently", () => {
    const h1 = deserialize("# H1", { heading1: true, heading2: false });
    expect(h1[0].type).toBe("heading");

    const h2 = deserialize("## H2", { heading1: true, heading2: false });
    expect(h2[0].type).toBe("paragraph");
    expect(h2[0].children[0].text).toBe("## H2");
  });

  it("disables only h3 while keeping others", () => {
    const h2 = deserialize("## H2", { heading3: false });
    expect(h2[0].type).toBe("heading");

    const h3 = deserialize("### H3", { heading3: false });
    expect(h3[0].type).toBe("paragraph");

    const h4 = deserialize("#### H4", { heading3: false });
    expect(h4[0].type).toBe("heading");
  });

  it("deserializes blockquotes", () => {
    const result = deserialize("> quoted text");
    expect(result[0].type).toBe("blockquote");
    expect(result[0].children[0].text).toBe("> quoted text");
  });

  it("preserves > prefix in blockquote source content", () => {
    const result = deserialize("> hello");
    expect(result[0].children[0].text).toBe("> hello");
  });

  it("treats blockquotes as paragraphs when disabled", () => {
    const result = deserialize("> text", { blockquotes: false });
    expect(result[0].type).toBe("paragraph");
    expect(result[0].children[0].text).toBe("> text");
  });

  it("deserializes list items with -", () => {
    const result = deserialize("- item");
    expect(result[0].type).toBe("list-item");
    expect(result[0].children[0].text).toBe("- item");
  });

  it("deserializes list items with * and +", () => {
    const star = deserialize("* item");
    expect(star[0].type).toBe("list-item");
    const plus = deserialize("+ item");
    expect(plus[0].type).toBe("list-item");
  });

  it("preserves list marker in text content", () => {
    const result = deserialize("- hello");
    expect(result[0].children[0].text).toBe("- hello");
  });

  it("treats list items as paragraphs when disabled", () => {
    const result = deserialize("- item", { lists: false });
    expect(result[0].type).toBe("paragraph");
  });

  it("deserializes code fences", () => {
    const result = deserialize("```ts\nconst x = 1;\n```");
    expect(result[0].type).toBe("code-fence");
    expect(result[0].children[0].text).toBe("```ts");
    expect(result[1].type).toBe("code-line");
    expect(result[1].children[0].text).toBe("const x = 1;");
    expect(result[2].type).toBe("code-fence");
    expect(result[2].children[0].text).toBe("```");
  });

  it("handles unclosed code blocks", () => {
    const result = deserialize("```js\nunclosed");
    expect(result[0].type).toBe("code-fence");
    expect(result[1].type).toBe("code-line");
    expect(result[1].children[0].text).toBe("unclosed");
  });

  it("treats code fences as paragraphs when disabled", () => {
    const result = deserialize("```\ncode\n```", { codeBlocks: false });
    const types = result.map(e => e.type);
    expect(types).not.toContain("code-fence");
    expect(types).not.toContain("code-line");
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

  it("handles multiple consecutive list items", () => {
    const result = deserialize("- a\n- b\n- c");
    expect(result).toHaveLength(3);
    expect(result.every(e => e.type === "list-item")).toBe(true);
  });

  it("deserializes ordered list items", () => {
    const result = deserialize("1. a\n2. b");
    expect(result).toHaveLength(2);
    expect(result.every(e => e.type === "list-item")).toBe(true);
    expect(result[0].children[0].text).toBe("1. a");
    expect(result[1].children[0].text).toBe("2. b");
  });

  it("deserializes nested bullet list items", () => {
    const result = deserialize("- a\n  - b");
    expect(result).toHaveLength(2);
    expect(result.every(e => e.type === "list-item")).toBe(true);
    expect(result[0].children[0].text).toBe("- a");
    expect(result[1].children[0].text).toBe("  - b");
  });

  it("deserializes block images on their own line", () => {
    const result = deserialize("![a cat](https://img/cat.png)");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("image");
    expect(result[0].alt).toBe("a cat");
    expect(result[0].url).toBe("https://img/cat.png");
    expect(result[0].children[0].text).toBe("![a cat](https://img/cat.png)");
  });

  it("leaves inline-mid-paragraph image syntax as paragraph text", () => {
    const result = deserialize("see ![cat](x.png) here");
    expect(result[0].type).toBe("paragraph");
    expect(result[0].children[0].text).toBe("see ![cat](x.png) here");
  });

  it("treats image syntax as paragraph when images disabled", () => {
    const result = deserialize("![a](b.png)", { images: false });
    expect(result[0].type).toBe("paragraph");
    expect(result[0].children[0].text).toBe("![a](b.png)");
  });

  it("handles whitespace-only input", () => {
    const result = deserialize("   ");
    expect(result.length).toBeGreaterThan(0);
    for (const el of result) {
      expect(el.id).toBeDefined();
    }
  });
});
