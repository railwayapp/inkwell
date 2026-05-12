import { render } from "@testing-library/react";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown-parser";

/**
 * Recursively extract text content from a React element tree
 */
function extractText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: unknown }>;
    return extractText(el.props.children);
  }
  return "";
}

/**
 * Find a React element by type in a tree
 */
function findElementByType(node: unknown, type: string): ReactElement | null {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findElementByType(child, type);
        if (found) return found;
      }
    }
    return null;
  }
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.type === type) return el;
  return findElementByType(el.props.children, type);
}

function findAllElementsByType(node: unknown, type: string): ReactElement[] {
  const results: ReactElement[] = [];
  function walk(n: unknown) {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (isValidElement(n)) {
      const el = n as ReactElement<{ children?: unknown }>;
      if (el.type === type) results.push(el);
      walk(el.props.children);
    }
  }
  walk(node);
  return results;
}

describe("parseMarkdown", () => {
  it("returns a valid React element", () => {
    const result = parseMarkdown("hello");
    expect(result).toBeDefined();
    expect(isValidElement(result)).toBe(true);
  });

  it("parses plain text into a paragraph", () => {
    const result = parseMarkdown("Hello world");
    const p = findElementByType(result, "p");
    expect(p).not.toBeNull();
    expect(extractText(p)).toBe("Hello world");
  });

  it("parses headings (h1 through h3)", () => {
    const h1 = parseMarkdown("# Heading 1");
    expect(findElementByType(h1, "h1")).not.toBeNull();
    expect(extractText(findElementByType(h1, "h1"))).toBe("Heading 1");

    const h2 = parseMarkdown("## Heading 2");
    expect(findElementByType(h2, "h2")).not.toBeNull();

    const h3 = parseMarkdown("### Heading 3");
    expect(findElementByType(h3, "h3")).not.toBeNull();
  });

  it("parses bold text", () => {
    const result = parseMarkdown("**bold**");
    const strong = findElementByType(result, "strong");
    expect(strong).not.toBeNull();
    expect(extractText(strong)).toBe("bold");
  });

  it("parses italic text", () => {
    const result = parseMarkdown("_italic_");
    const em = findElementByType(result, "em");
    expect(em).not.toBeNull();
    expect(extractText(em)).toBe("italic");
  });

  it("parses strikethrough text (GFM)", () => {
    const result = parseMarkdown("~~deleted~~");
    const del = findElementByType(result, "del");
    expect(del).not.toBeNull();
    expect(extractText(del)).toBe("deleted");
  });

  it("parses links", () => {
    const result = parseMarkdown("[click here](https://example.com)");
    const a = findElementByType(result, "a");
    expect(a).not.toBeNull();
    expect(extractText(a)).toBe("click here");
    expect((a as ReactElement<{ href: string }>).props.href).toBe(
      "https://example.com",
    );
  });

  it("parses inline code", () => {
    const result = parseMarkdown("use `console.log`");
    const code = findElementByType(result, "code");
    expect(code).not.toBeNull();
    expect(extractText(code)).toBe("console.log");
  });

  it("parses fenced code blocks", () => {
    const md = "```js\nconst x = 1;\n```";
    const result = parseMarkdown(md);
    const pre = findElementByType(result, "pre");
    expect(pre).not.toBeNull();
    const code = findElementByType(pre, "code");
    expect(code).not.toBeNull();
    expect(extractText(code)).toContain("const x = 1;");
  });

  it("parses unordered lists", () => {
    const md = "- one\n- two\n- three";
    const result = parseMarkdown(md);
    const ul = findElementByType(result, "ul");
    expect(ul).not.toBeNull();
    const items = findAllElementsByType(ul, "li");
    expect(items).toHaveLength(3);
    expect(extractText(items[0])).toBe("one");
    expect(extractText(items[2])).toBe("three");
  });

  it("parses ordered lists", () => {
    const md = "1. first\n2. second";
    const result = parseMarkdown(md);
    const ol = findElementByType(result, "ol");
    expect(ol).not.toBeNull();
    const items = findAllElementsByType(ol, "li");
    expect(items).toHaveLength(2);
  });

  it("parses blockquotes", () => {
    const result = parseMarkdown("> quoted text");
    const bq = findElementByType(result, "blockquote");
    expect(bq).not.toBeNull();
    expect(extractText(bq)).toContain("quoted text");
  });

  it("parses horizontal rules", () => {
    const result = parseMarkdown("---");
    const hr = findElementByType(result, "hr");
    expect(hr).not.toBeNull();
  });

  it("does not parse GFM tables (not supported)", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const result = parseMarkdown(md);
    const table = findElementByType(result, "table");
    expect(table).toBeNull();
  });

  it("parses nested inline marks", () => {
    const result = parseMarkdown("**_bold and italic_**");
    const strong = findElementByType(result, "strong");
    expect(strong).not.toBeNull();
    const em = findElementByType(strong, "em");
    expect(em).not.toBeNull();
    expect(extractText(em)).toBe("bold and italic");
  });

  it("handles empty input", () => {
    const result = parseMarkdown("");
    expect(result).toBeDefined();
  });

  it("handles multi-paragraph content", () => {
    const md = "First paragraph.\n\nSecond paragraph.";
    const result = parseMarkdown(md);
    const paragraphs = findAllElementsByType(result, "p");
    expect(paragraphs).toHaveLength(2);
    expect(extractText(paragraphs[0])).toBe("First paragraph.");
    expect(extractText(paragraphs[1])).toBe("Second paragraph.");
  });

  it("accepts custom component overrides", () => {
    const result = parseMarkdown("# Test", {
      components: {
        h1: (props: { children?: ReactNode }) => {
          return `custom:${props.children}` as unknown as ReactNode;
        },
      },
    });
    // The custom component should be used in place of the default h1
    // Verify the result contains our custom output
    expect(findElementByType(result, "h1")).toBeNull();
  });

  it("applies syntax highlighting to code blocks", () => {
    const md = "```typescript\nconst x: number = 1;\n```";
    const result = parseMarkdown(md);
    const code = findElementByType(result, "code");
    expect(code).not.toBeNull();
    // rehype-highlight adds hljs class and language class
    const props = (code as ReactElement<{ className?: string }>).props;
    expect(props.className).toMatch(/hljs/);
  });

  describe("sanitization", () => {
    it("strips script tags", () => {
      const result = parseMarkdown('<script>alert("xss")</script>');
      const text = extractText(result);
      expect(text).not.toContain("alert");
      expect(findElementByType(result, "script")).toBeNull();
    });

    it("strips event handler attributes", () => {
      const result = parseMarkdown(
        '<img src="x" onerror="alert(1)" alt="test">',
      );
      const img = findElementByType(result, "img");
      if (img) {
        const props = img.props as Record<string, unknown>;
        expect(props.onerror).toBeUndefined();
        expect(props.onError).toBeUndefined();
      }
    });

    it("strips javascript: URLs from links", () => {
      const result = parseMarkdown('[click](javascript:alert("xss"))');
      const a = findElementByType(result, "a");
      if (a) {
        const props = a.props as Record<string, unknown>;
        const href = (props.href as string) ?? "";
        expect(href).not.toContain("javascript:");
      }
    });

    it("strips iframe tags", () => {
      const result = parseMarkdown('<iframe src="https://evil.com"></iframe>');
      expect(findElementByType(result, "iframe")).toBeNull();
    });

    it("preserves safe HTML elements", () => {
      const result = parseMarkdown("**bold** and _italic_");
      expect(findElementByType(result, "strong")).not.toBeNull();
      expect(findElementByType(result, "em")).not.toBeNull();
    });

    it("preserves syntax highlighting classes after sanitization", () => {
      const md = "```typescript\nconst x: number = 1;\n```";
      const result = parseMarkdown(md);
      const code = findElementByType(result, "code");
      expect(code).not.toBeNull();
      const props = (code as ReactElement<{ className?: string }>).props;
      expect(props.className).toMatch(/hljs/);
    });
  });

  describe("mentions", () => {
    it("replaces matching text with the resolved node", () => {
      const { container } = render(
        <>
          {parseMarkdown("hello @snippet[123] world", {
            mentions: [
              {
                pattern: /@snippet\[([^\]]+)\]/,
                resolve: match => `<snippet ${match[1]}>`,
              },
            ],
          })}
        </>,
      );
      expect(container.textContent).toBe("hello <snippet 123> world");
    });

    it("resolves multiple matches in a single text node", () => {
      const { container } = render(
        <>
          {parseMarkdown("a @u[1] b @u[2] c", {
            mentions: [
              {
                pattern: /@u\[(\d+)\]/,
                resolve: match => `U${match[1]}`,
              },
            ],
          })}
        </>,
      );
      expect(container.textContent).toBe("a U1 b U2 c");
    });

    it("leaves text without matches unchanged", () => {
      const { container } = render(
        <>
          {parseMarkdown("no mentions here", {
            mentions: [
              {
                pattern: /@x\[(\d+)\]/,
                resolve: () => "MATCH",
              },
            ],
          })}
        </>,
      );
      expect(container.textContent).toBe("no mentions here");
    });

    it("resolves matches inside inline code (documents current behavior)", () => {
      const { container } = render(
        <>
          {parseMarkdown("before `@snippet[9]` after", {
            mentions: [
              {
                pattern: /@snippet\[(\d+)\]/,
                resolve: match => `[S${match[1]}]`,
              },
            ],
          })}
        </>,
      );
      expect(container.textContent).toBe("before [S9] after");
    });

    it("supports resolvers that return JSX nodes", () => {
      const { container } = render(
        <>
          {parseMarkdown("hi @u[42] there", {
            mentions: [
              {
                pattern: /@u\[(\d+)\]/,
                resolve: match => (
                  <strong data-testid="mention">user-{match[1]}</strong>
                ),
              },
            ],
          })}
        </>,
      );
      const mention = container.querySelector("[data-testid=mention]");
      expect(mention).not.toBeNull();
      expect(mention?.textContent).toBe("user-42");
    });

    it("handles overlapping patterns by preferring the first registered", () => {
      const { container } = render(
        <>
          {parseMarkdown("@x[1]", {
            mentions: [
              {
                pattern: /@x\[1\]/,
                resolve: () => "A",
              },
              {
                pattern: /@x\[1\]/,
                resolve: () => "B",
              },
            ],
          })}
        </>,
      );
      expect(container.textContent).toBe("A");
    });
  });
});
