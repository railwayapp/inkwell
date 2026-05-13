import { createEditor, Editor, Node, Transforms } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it } from "vitest";
import type { ResolvedInkwellFeatures } from "../../types";
import { deserialize } from "./deserialize";
import { serialize } from "./serialize";
import type { InkwellElement } from "./types";
import { withMarkdown } from "./with-markdown";
import { generateId, withNodeId } from "./with-node-id";

function createTestEditor(decorations?: Partial<ResolvedInkwellFeatures>) {
  const decorationsRef = {
    current: {
      heading1: decorations?.heading1 ?? false,
      heading2: decorations?.heading2 ?? false,
      heading3: decorations?.heading3 ?? false,
      heading4: decorations?.heading4 ?? false,
      heading5: decorations?.heading5 ?? false,
      heading6: decorations?.heading6 ?? false,
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
    expect(serialize(elements)).toBe("> first\n> ");
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

describe("withMarkdown — list-like input", () => {
  it("keeps unordered marker text as a paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("-");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("paragraph");
    expect(Node.string(getElements(editor)[0])).toBe("- ");
  });

  it("keeps ordered marker text as a paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("1.");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("paragraph");
    expect(Node.string(getElements(editor)[0])).toBe("1. ");
  });

  it("continues unordered list marker text on Enter", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- asdf");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
    expect(elements[1].type).toBe("paragraph");
    expect(Node.string(elements[1])).toBe("- ");
  });

  it("Enter on empty `- ` at indent 0 clears line to plain paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- ");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("");
  });

  it("Enter on `  - ` outdents to `- ` on the same line", () => {
    const editor = createTestEditor();
    editor.children = deserialize("  - ");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("- ");
  });

  it("Enter on `    - ` outdents to `  - ` on the same line", () => {
    const editor = createTestEditor();
    editor.children = deserialize("    - ");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("  - ");
  });

  it("Enter on `  - asdf` continues with `  - ` on the next line", () => {
    const editor = createTestEditor();
    editor.children = deserialize("  - asdf");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(elements[1].type).toBe("paragraph");
    expect(Node.string(elements[1])).toBe("  - ");
  });

  it("Enter mid-content carries the tail onto the next list item", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- asdf");
    editor.onChange();

    // Place caret after "asd", before "f".
    Transforms.select(editor, { path: [0, 0], offset: 5 });
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(Node.string(elements[0])).toBe("- asd");
    expect(Node.string(elements[1])).toBe("- f");
    expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 2 });
  });

  it("Enter at the start of content pushes an empty item above, caret stays with content", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- asdf");
    editor.onChange();

    // Original node id so we can verify the content node was preserved
    // (not destroyed and recreated) when the empty line is inserted above.
    const originalId = (editor.children[0] as InkwellElement).id;

    // Place caret right after "- " and before "asdf".
    Transforms.select(editor, { path: [0, 0], offset: 2 });
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(Node.string(elements[0])).toBe("- ");
    expect(Node.string(elements[1])).toBe("- asdf");
    // The original "- asdf" node should now be at index 1 — the new node is
    // the empty one above, not the content one below.
    expect(elements[1].id).toBe(originalId);
    expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 2 });
  });

  it("Enter with a selected range deletes the selection, then splits", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- asdf");
    editor.onChange();

    // Select "sd" — from offset 3 to offset 5.
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 3 },
      focus: { path: [0, 0], offset: 5 },
    });
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(Node.string(elements[0])).toBe("- a");
    expect(Node.string(elements[1])).toBe("- f");
  });

  it("Enter on indented `  - asdf` mid-content preserves the indent", () => {
    const editor = createTestEditor();
    editor.children = deserialize("  - asdf");
    editor.onChange();

    // Place caret after "  - as", before "df".
    Transforms.select(editor, { path: [0, 0], offset: 6 });
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(Node.string(elements[0])).toBe("  - as");
    expect(Node.string(elements[1])).toBe("  - df");
    expect(editor.selection?.anchor).toEqual({ path: [1, 0], offset: 4 });
  });
});

describe("withMarkdown — clipboard text/plain", () => {
  // Minimal DataTransfer stub — jsdom doesn't provide one and slate-react's
  // default setFragmentData only touches setData/getData/types here.
  function makeDataTransfer(): DataTransfer {
    const store: Record<string, string> = {};
    return {
      setData: (type: string, value: string) => {
        store[type] = value;
      },
      getData: (type: string) => store[type] ?? "",
      clearData: (type?: string) => {
        if (type) delete store[type];
        else for (const key of Object.keys(store)) delete store[key];
      },
      types: [],
    } as unknown as DataTransfer;
  }

  it("uses the markdown serializer for text/plain — one blank line between blocks, not two", () => {
    const editor = createTestEditor({ heading2: true, heading3: true });
    // Two headings separated by an empty paragraph in the editor model.
    // slate-react's default text/plain would derive from rendered HTML and
    // emit "## a\n\n\n## b" (two blank lines); our override should emit
    // "## a\n\n## b" (one blank line).
    editor.children = deserialize("## a\n\n## b");
    editor.onChange();

    Transforms.select(editor, {
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });

    const data = makeDataTransfer();
    editor.setFragmentData(data);
    expect(data.getData("text/plain")).toBe("## a\n\n## b");
  });

  it("preserves consecutive list markers as single-newline groups", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- a\n- b\n- c");
    editor.onChange();

    Transforms.select(editor, {
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });

    const data = makeDataTransfer();
    editor.setFragmentData(data);
    expect(data.getData("text/plain")).toBe("- a\n- b\n- c");
  });

  it("serializes partial selections across paragraphs without phantom blank lines", () => {
    const editor = createTestEditor();
    // `\n\n` deserializes to three blocks (paragraph, empty paragraph,
    // paragraph), so paragraph 2 sits at path [2].
    editor.children = deserialize("hello world\n\nfoo bar");
    editor.onChange();

    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [2, 0], offset: 3 },
    });

    const data = makeDataTransfer();
    editor.setFragmentData(data);
    expect(data.getData("text/plain")).toBe("world\n\nfoo");
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
