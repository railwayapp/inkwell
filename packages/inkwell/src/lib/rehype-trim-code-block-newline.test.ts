import type { Element, Root, Text } from "hast";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import rehypeTrimCodeBlockTrailingNewline from "./rehype-trim-code-block-newline";

function text(value: string): Text {
  return { type: "text", value };
}

function el(tagName: string, children: Element["children"]): Element {
  return { type: "element", tagName, properties: {}, children };
}

function run(tree: Root): Root {
  const proc = unified().use(rehypeTrimCodeBlockTrailingNewline);
  return proc.runSync(tree) as Root;
}

function stringify(tree: Root): string {
  return unified().use(rehypeStringify).stringify(tree);
}

function preCode(content: Element["children"]): Root {
  return {
    type: "root",
    children: [el("pre", [el("code", content)])],
  };
}

function getInnerCodeText(tree: Root): string {
  const pre = tree.children[0] as Element;
  const code = pre.children[0] as Element;
  return stringify({ type: "root", children: code.children });
}

describe("rehypeTrimCodeBlockTrailingNewline", () => {
  it("strips a single trailing newline from a plain code block", () => {
    const tree = run(preCode([text("hello\n")]));
    expect(getInnerCodeText(tree)).toBe("hello");
  });

  it("preserves multi-line content but drops only the final newline", () => {
    const tree = run(preCode([text("hello\nworld\n")]));
    expect(getInnerCodeText(tree)).toBe("hello\nworld");
  });

  it("leaves an empty code block as an empty code block", () => {
    const tree = run(preCode([]));
    expect(getInnerCodeText(tree)).toBe("");
  });

  it("preserves intentional trailing blank lines (strips exactly one)", () => {
    const tree = run(preCode([text("hello\n\n\n")]));
    expect(getInnerCodeText(tree)).toBe("hello\n\n");
  });

  it("walks into nested spans (rehype-highlight shape)", () => {
    const tree = run(
      preCode([
        el("span", [text("const")]),
        text(" "),
        el("span", [text("x = 1;\n")]),
      ]),
    );
    expect(getInnerCodeText(tree)).toBe(
      "<span>const</span> <span>x = 1;</span>",
    );
  });

  it("removes the trailing text node entirely when it contained only \\n", () => {
    const tree = run(preCode([el("span", [text("const x = 1;")]), text("\n")]));
    const pre = tree.children[0] as Element;
    const code = pre.children[0] as Element;
    expect(code.children).toHaveLength(1);
    expect(getInnerCodeText(tree)).toBe("<span>const x = 1;</span>");
  });

  it("ignores inline <code> without a <pre> parent", () => {
    const tree: Root = {
      type: "root",
      children: [
        el("p", [text("see "), el("code", [text("inline\n")]), text(" here")]),
      ],
    };
    run(tree);
    const p = tree.children[0] as Element;
    const inlineCode = p.children[1] as Element;
    expect((inlineCode.children[0] as Text).value).toBe("inline\n");
  });

  it("is a no-op when there is no trailing newline", () => {
    const tree = run(preCode([text("hello")]));
    expect(getInnerCodeText(tree)).toBe("hello");
  });
});
