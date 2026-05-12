import { createEditor, Editor, Node, Transforms } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it } from "vitest";
import type { InkwellDecorations } from "../../types";
import { deserialize } from "./deserialize";
import { serialize } from "./serialize";
import type { InkwellElement } from "./types";
import { withMarkdown } from "./with-markdown";
import { generateId, withNodeId } from "./with-node-id";

function createTestEditor(decorations?: InkwellDecorations) {
  const decorationsRef = {
    current: {
      heading1: decorations?.heading1 ?? false,
      heading2: decorations?.heading2 ?? false,
      heading3: decorations?.heading3 ?? false,
      heading4: decorations?.heading4 ?? false,
      heading5: decorations?.heading5 ?? false,
      heading6: decorations?.heading6 ?? false,
      lists: decorations?.lists ?? true,
      blockquotes: decorations?.blockquotes ?? true,
      codeBlocks: decorations?.codeBlocks ?? true,
      images: decorations?.images ?? true,
    },
  };
  return withMarkdown(
    withHistory(withNodeId(withReact(createEditor()))),
    decorationsRef,
  );
}

function getElements(editor: Editor): InkwellElement[] {
  return editor.children as InkwellElement[];
}

describe("withMarkdown — code fence triggers", () => {
  it("``` + Enter converts paragraph to code-fence and inserts code-line", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```typescript");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const types = getElements(editor).map(e => e.type);
    expect(types).toContain("code-fence");
    expect(types).toContain("code-line");
  });

  it("closing ``` on code-line converts to fence and exits", () => {
    const editor = createTestEditor();
    editor.children = [
      { type: "code-fence", id: generateId(), children: [{ text: "```ts" }] },
      { type: "code-line", id: generateId(), children: [{ text: "```" }] },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [1]));
    editor.insertBreak();

    const types = getElements(editor).map(e => e.type);
    expect(types.filter(t => t === "code-fence")).toHaveLength(2);
    expect(types).toContain("paragraph");
  });

  it("Enter on opening fence inserts code-line", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\ncode\n```");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[1].type).toBe("code-line");
  });

  it("Enter on closing fence inserts paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\ncode\n```");
    editor.onChange();

    const elements = getElements(editor);
    const closingIdx = elements.length - 1;
    Transforms.select(editor, Editor.end(editor, [closingIdx]));
    editor.insertBreak();

    const last = getElements(editor).at(-1);
    expect(last?.type).toBe("paragraph");
  });

  it("Enter on code-line inserts new code-line", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\nline1\n```");
    editor.onChange();

    const codeLineIdx = getElements(editor).findIndex(
      e => e.type === "code-line",
    );
    Transforms.select(editor, Editor.end(editor, [codeLineIdx]));
    editor.insertBreak();

    const types = getElements(editor).map(e => e.type);
    expect(types.filter(t => t === "code-line")).toHaveLength(2);
  });

  it("does not create code fence when codeBlocks disabled", () => {
    const editor = createTestEditor({ codeBlocks: false });
    editor.children = deserialize("```typescript", { codeBlocks: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const types = getElements(editor).map(e => e.type);
    expect(types).not.toContain("code-fence");
  });
});

describe("withMarkdown — blockquote triggers", () => {
  it("> space converts paragraph to blockquote", () => {
    const editor = createTestEditor();
    editor.children = deserialize(">");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("blockquote");
  });

  it("does not convert when blockquotes disabled", () => {
    const editor = createTestEditor({ blockquotes: false });
    editor.children = deserialize(">");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("Enter on non-empty blockquote exits to paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> some quote");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("blockquote");
    expect(elements[1].type).toBe("paragraph");
  });

  it("Enter on empty blockquote converts to paragraph in place", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> ");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("Shift+Enter on blockquote creates new blockquote", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> first");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    const elements = getElements(editor);
    const bqCount = elements.filter(e => e.type === "blockquote").length;
    expect(bqCount).toBe(2);
    expect(serialize(elements)).toBe("> first\n>");
  });
});

describe("withMarkdown — heading triggers", () => {
  it("## space converts paragraph to heading", () => {
    const editor = createTestEditor({
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
    });
    editor.children = deserialize("##");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const el = getElements(editor)[0];
    expect(el.type).toBe("heading");
    expect(el.level).toBe(2);
  });

  it("does not convert when headings disabled", () => {
    const editor = createTestEditor({
      heading1: false,
      heading2: false,
      heading3: false,
      heading4: false,
      heading5: false,
      heading6: false,
    });
    editor.children = deserialize("##");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("converts h1 but not h2 when heading2 is disabled", () => {
    const editor = createTestEditor({ heading1: true, heading2: false });
    editor.children = deserialize("#");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");
    expect(getElements(editor)[0].type).toBe("heading");
  });

  it("does not convert h2 when heading2 is disabled", () => {
    const editor = createTestEditor({ heading1: true, heading2: false });
    editor.children = deserialize("##");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");
    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("Enter on non-empty heading exits to paragraph", () => {
    const editor = createTestEditor({
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
    });
    editor.children = [
      {
        type: "heading" as const,
        id: generateId(),
        level: 2,
        children: [{ text: "Title" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("heading");
    expect(elements[1].type).toBe("paragraph");
  });

  it("Enter on empty heading converts to paragraph in place", () => {
    const editor = createTestEditor({
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
    });
    editor.children = [
      {
        type: "heading" as const,
        id: generateId(),
        level: 2,
        children: [{ text: "" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.start(editor, [0]));
    editor.insertBreak();

    expect(getElements(editor)[0].type).toBe("paragraph");
  });
});

describe("withMarkdown — list item triggers", () => {
  it("- space converts paragraph to list-item", () => {
    const editor = createTestEditor({ lists: true });
    editor.children = deserialize("-", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("list-item");
    expect(Node.string(getElements(editor)[0])).toBe("- ");
  });

  it("* space converts paragraph to list-item", () => {
    const editor = createTestEditor({ lists: true });
    editor.children = deserialize("*", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("list-item");
  });

  it("+ space converts paragraph to list-item", () => {
    const editor = createTestEditor({ lists: true });
    editor.children = deserialize("+", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("list-item");
  });

  it("does not convert when lists disabled", () => {
    const editor = createTestEditor({ lists: false });
    editor.children = deserialize("-", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("Enter on non-empty list item creates new item with same marker", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- hello");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[1].type).toBe("list-item");
    expect(Node.string(elements[1])).toBe("- ");
  });

  it("Enter on empty list item (just marker) converts to paragraph", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "- " }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    expect(getElements(editor)[0].type).toBe("paragraph");
    expect(Node.string(getElements(editor)[0])).toBe("");
  });

  it("`1.` + space converts paragraph to ordered list-item", () => {
    const editor = createTestEditor({ lists: true });
    editor.children = deserialize("1.", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("list-item");
    expect(Node.string(getElements(editor)[0])).toBe("1. ");
  });

  it("Enter on ordered list item auto-increments the marker", () => {
    const editor = createTestEditor();
    editor.children = deserialize("1. first");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[1].type).toBe("list-item");
    expect(Node.string(elements[1])).toBe("2. ");
  });

  it("Enter on nested bullet list-item preserves indent", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "  - item" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[1].type).toBe("list-item");
    expect(Node.string(elements[1])).toBe("  - ");
  });

  it("Enter on empty nested list-item outdents instead of reverting", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "  - " }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const first = getElements(editor)[0];
    expect(first.type).toBe("list-item");
    expect(Node.string(first)).toBe("- ");
  });

  it("Enter on empty indented ordered list-item outdents and resets to 1.", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "  3. " }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const first = getElements(editor)[0];
    expect(first.type).toBe("list-item");
    expect(Node.string(first)).toBe("1. ");
  });
});

describe("withMarkdown — image element", () => {
  it("marks image elements as void", () => {
    const editor = createTestEditor();
    const imgEl: InkwellElement = {
      type: "image",
      id: generateId(),
      url: "https://x.png",
      alt: "img",
      children: [{ text: "" }],
    };
    editor.children = [imgEl];
    editor.onChange();
    expect(editor.isVoid(imgEl)).toBe(true);
  });

  it("does not mark non-image elements as void", () => {
    const editor = createTestEditor();
    const pEl: InkwellElement = {
      type: "paragraph",
      id: generateId(),
      children: [{ text: "hello" }],
    };
    editor.children = [pEl];
    editor.onChange();
    expect(editor.isVoid(pEl)).toBe(false);
  });

  it("Enter on image inserts a paragraph after it", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "image" as const,
        id: generateId(),
        url: "https://x.png",
        alt: "img",
        children: [{ text: "" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe("image");
    expect(elements[1].type).toBe("paragraph");
  });

  it("deletes image via Transforms.removeNodes", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph" as const,
        id: generateId(),
        children: [{ text: "before" }],
      },
      {
        type: "image" as const,
        id: generateId(),
        url: "https://x.png",
        alt: "img",
        children: [{ text: "" }],
      },
    ];
    editor.onChange();

    Transforms.removeNodes(editor, { at: [1] });

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("paragraph");
  });
});

describe("withMarkdown — code-line overflow", () => {
  it("typing after ``` on code-line closes fence and creates paragraph", () => {
    const editor = createTestEditor();
    editor.children = [
      { type: "code-fence", id: generateId(), children: [{ text: "```ts" }] },
      { type: "code-line", id: generateId(), children: [{ text: "```" }] },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [1]));
    editor.insertText("x");

    const types = getElements(editor).map(e => e.type);
    expect(types).toContain("paragraph");
  });

  it("typing after closing code-fence creates paragraph", () => {
    const editor = createTestEditor();
    editor.children = [
      { type: "code-fence", id: generateId(), children: [{ text: "```ts" }] },
      { type: "code-line", id: generateId(), children: [{ text: "code" }] },
      { type: "code-fence", id: generateId(), children: [{ text: "```" }] },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [2]));
    editor.insertText("x");

    const last = getElements(editor).at(-1);
    expect(last?.type).toBe("paragraph");
  });
});

describe("withMarkdown — insertSoftBreak fallthrough", () => {
  it("Shift+Enter on paragraph falls through to insertBreak", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    expect(getElements(editor).length).toBe(2);
  });

  it("Shift+Enter on code-line creates new code-line", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\nline1\n```");
    editor.onChange();

    const codeLineIdx = getElements(editor).findIndex(
      e => e.type === "code-line",
    );
    Transforms.select(editor, Editor.end(editor, [codeLineIdx]));
    editor.insertSoftBreak();

    const types = getElements(editor).map(e => e.type);
    expect(types.filter(t => t === "code-line")).toHaveLength(2);
  });
});

describe("withMarkdown — paste (insertData)", () => {
  it("parses pasted text as markdown", () => {
    const editor = createTestEditor();
    editor.children = deserialize("before");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));

    const nodes = deserialize("\n\nafter");
    Transforms.insertNodes(editor, nodes);

    expect(Node.string(editor)).toContain("after");
  });
});
