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

function getAllIds(editor: Editor): string[] {
  return getElements(editor).map(el => el.id);
}

describe("generateId", () => {
  it("returns a string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique values on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it("produces UUID v4 format", () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("deserialize — node IDs", () => {
  it("assigns IDs to all elements", () => {
    const elements = deserialize("hello\n\nworld");
    for (const el of elements) {
      expect(el.id).toBeDefined();
      expect(typeof el.id).toBe("string");
      expect(el.id.length).toBeGreaterThan(0);
    }
  });

  it("assigns unique IDs to each element", () => {
    const elements = deserialize("line 1\nline 2\nline 3");
    const ids = elements.map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("generates different IDs for the same content deserialized twice", () => {
    const first = deserialize("hello");
    const second = deserialize("hello");
    expect(first[0].id).not.toBe(second[0].id);
  });

  it("assigns IDs to empty content fallback", () => {
    const elements = deserialize("");
    expect(elements[0].id).toBeDefined();
    expect(typeof elements[0].id).toBe("string");
  });

  it("assigns IDs to code-block elements", () => {
    const elements = deserialize("```ts\nconst x = 1;\n```");
    expect(elements).toHaveLength(1);
    expect(elements[0].id).toBeDefined();
    expect(typeof elements[0].id).toBe("string");
    expect(elements[0].type).toBe("code-block");
  });

  it("assigns IDs to blockquote elements", () => {
    const elements = deserialize("> quoted");
    expect(elements[0].id).toBeDefined();
    expect(elements[0].type).toBe("blockquote");
  });

  it("assigns IDs to list, list-item, and inner paragraph elements", () => {
    const elements = deserialize("- item 1\n- item 2");
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("list");
    expect(elements[0].id).toBeDefined();
    for (const item of elements[0].children) {
      if (!("type" in item) || item.type !== "list-item") continue;
      expect(item.id).toBeDefined();
      for (const inner of item.children) {
        if ("type" in inner) expect(inner.id).toBeDefined();
      }
    }
  });

  it("assigns IDs to heading elements", () => {
    const elements = deserialize("## Hello", {
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
    });
    expect(elements[0].id).toBeDefined();
    expect(elements[0].type).toBe("heading");
  });

  it("assigns IDs to both paragraphs across a blank-line separator", () => {
    const elements = deserialize("first\n\nsecond");
    expect(elements.length).toBe(2);
    for (const el of elements) {
      expect(el.id).toBeDefined();
      expect(typeof el.id).toBe("string");
    }
  });

  it("assigns an ID to an unclosed code-block", () => {
    const elements = deserialize("```js\nunclosed");
    expect(elements).toHaveLength(1);
    expect(elements[0].id).toBeDefined();
    expect(elements[0].type).toBe("code-block");
    expect(elements[0].lang).toBe("js");
  });

  it("assigns IDs for trailing empty line fallback", () => {
    const elements = deserialize("   ");
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.id).toBeDefined();
    }
  });
});

describe("serialize — node IDs", () => {
  it("does not include IDs in serialized markdown", () => {
    const elements = deserialize("# Hello\n\nworld");
    const md = serialize(elements);
    expect(md).not.toContain("id");
    expect(md).toBe("# Hello\n\nworld");
  });

  it("round-trips markdown content correctly despite IDs", () => {
    const original = "## Title\n\n**bold** and _italic_\n\n> quote\n\n- item";
    const elements = deserialize(original, {
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
      blockquotes: true,
    });
    const result = serialize(elements);
    expect(result).toBe(original);
  });

  it("handles heading followed by blockquote with correct spacing", () => {
    const elements = deserialize("## Title\n\n> quote", {
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
      blockquotes: true,
    });
    const md = serialize(elements);
    expect(md).toBe("## Title\n\n> quote");
  });

  it("handles list followed by code block with correct spacing", () => {
    const elements = deserialize("- item\n\n```\ncode\n```");
    const md = serialize(elements);
    expect(md).toBe("- item\n\n```\ncode\n```");
  });

  it("handles empty document", () => {
    const elements = deserialize("");
    const md = serialize(elements);
    expect(md).toBe("");
  });
});

describe("withNodeId — split deduplication", () => {
  it("assigns a new ID when splitting an element", () => {
    const editor = createTestEditor();
    const initial = deserialize("hello world");
    editor.children = initial;
    editor.onChange();

    const originalId = (editor.children[0] as InkwellElement).id;

    Transforms.select(editor, { path: [0, 0], offset: 5 });
    Transforms.splitNodes(editor);

    const elements = getElements(editor);
    expect(elements.length).toBe(2);
    expect(elements[0].id).toBe(originalId);
    expect(elements[1].id).toBeDefined();
    expect(elements[1].id).not.toBe(originalId);
  });

  it("never produces duplicate IDs after multiple splits", () => {
    const editor = createTestEditor();
    editor.children = deserialize("abcdefghij");
    editor.onChange();

    Transforms.select(editor, { path: [0, 0], offset: 3 });
    Transforms.splitNodes(editor);
    Transforms.select(editor, { path: [1, 0], offset: 2 });
    Transforms.splitNodes(editor);

    const ids = getAllIds(editor);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("withNodeId — insert_node", () => {
  it("assigns ID to inserted element without one", () => {
    const editor = createTestEditor();
    editor.children = deserialize("first");
    editor.onChange();

    Transforms.insertNodes(
      editor,
      {
        type: "paragraph",
        children: [{ text: "second" }],
      } as InkwellElement,
      { at: [1] },
    );

    const elements = getElements(editor);
    expect(elements[1].id).toBeDefined();
    expect(typeof elements[1].id).toBe("string");
  });

  it("preserves existing ID on inserted element", () => {
    const editor = createTestEditor();
    editor.children = deserialize("first");
    editor.onChange();

    const existingId = generateId();
    Transforms.insertNodes(
      editor,
      {
        type: "paragraph",
        id: existingId,
        children: [{ text: "second" }],
      } as InkwellElement,
      { at: [1] },
    );

    const elements = getElements(editor);
    expect(elements[1].id).toBe(existingId);
  });
});

describe("withNodeId — merge_node", () => {
  it("merge does not create duplicate IDs", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello\n\nworld");
    editor.onChange();

    // `hello\n\nworld` deserializes to two paragraphs (no empty
    // separator). Merge them by selecting the start of the second
    // paragraph and calling `mergeNodes`.
    const idsBefore = getAllIds(editor);
    expect(idsBefore.length).toBe(2);

    Transforms.select(editor, Editor.start(editor, [1]));
    Transforms.mergeNodes(editor);

    const idsAfter = getAllIds(editor);
    expect(new Set(idsAfter).size).toBe(idsAfter.length);
    expect(idsAfter.length).toBeLessThan(idsBefore.length);
  });
});

describe("withMarkdown — element creation IDs", () => {
  it("Enter inside a code-block keeps its ID intact", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```typescript\n```");
    editor.onChange();

    const originalId = getElements(editor)[0].id;
    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    for (const el of getElements(editor)) {
      expect(el.id).toBeDefined();
      expect(typeof el.id).toBe("string");
    }
    expect(getElements(editor)[0].id).toBe(originalId);
  });

  it("creates elements with IDs via insertBreak inside a blockquote paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> some quote");
    editor.onChange();

    // Caret at the end of the inner paragraph — Slate's default
    // insertBreak splits the paragraph in two siblings inside the
    // existing blockquote, so the tree still has one top-level element.
    Transforms.select(editor, Editor.end(editor, [0, 0]));
    editor.insertBreak();

    const top = getElements(editor);
    expect(top).toHaveLength(1);
    expect(top[0].type).toBe("blockquote");
    expect(top[0].id).toBeDefined();
    // Both inner paragraphs must carry IDs as well.
    for (const child of top[0].children) {
      if ("id" in child) expect(child.id).toBeDefined();
    }
    expect(top[0].children).toHaveLength(2);
  });

  it("creates elements with IDs via insertSoftBreak on blockquote", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> first");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    for (const el of getElements(editor)) {
      expect(el.id).toBeDefined();
    }
  });

  it("creates heading with ID via typing trigger", () => {
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

    const elements = getElements(editor);
    expect(elements[0].type).toBe("heading");
    expect(elements[0].id).toBeDefined();
  });

  it("creates blockquote with ID via typing trigger", () => {
    const editor = createTestEditor();
    editor.children = deserialize(">");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("blockquote");
    expect(elements[0].id).toBeDefined();
  });

  it("``` Enter promotes to a code-block with an ID", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```typescript");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("code-block");
    for (const el of elements) {
      expect(el.id).toBeDefined();
    }
  });

  it("deserialized code-block retains its ID across Enter", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\nconst x = 1;\n```");
    editor.onChange();

    const originalId = getElements(editor)[0].id;
    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("code-block");
    expect(elements[0].id).toBe(originalId);
  });

  it("code-block Shift+Enter preserves the block ID", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\nline1\n```");
    editor.onChange();

    const originalId = getElements(editor)[0].id;
    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    expect(getElements(editor)[0].id).toBe(originalId);
  });

  it("inserting text into an existing code-block doesn't allocate new IDs", () => {
    const codeBlockId = generateId();
    const editor = createTestEditor();
    editor.children = [
      { type: "code-block", id: codeBlockId, children: [{ text: "code" }] },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText("x");

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].id).toBe(codeBlockId);
    expect(Node.string(elements[0])).toBe("codex");
  });

  it("Enter on an empty blockquote paragraph yields an ID'd outer paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> ");
    editor.onChange();

    // Caret inside the empty inner paragraph.
    Transforms.select(editor, Editor.end(editor, [0, 0]));
    editor.insertBreak();

    // Exit path: the blockquote is replaced by a fresh paragraph.
    // Under nestable-blockquote the original blockquote/paragraph IDs
    // are not threaded through — the replacement paragraph is a new
    // node — but it must still carry an ID for downstream features
    // that key on stable node IDs.
    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
    expect(elements[0].id).toBeDefined();
    expect(typeof elements[0].id).toBe("string");
  });

  it("empty heading Enter converts in-place (preserves ID)", () => {
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

    const originalId = getElements(editor)[0].id;

    Transforms.select(editor, Editor.start(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
    expect(elements[0].id).toBe(originalId);
  });

  it("default insertBreak forces paragraph type with ID", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello world");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    for (const el of getElements(editor)) {
      expect(el.id).toBeDefined();
      expect(el.type).toBe("paragraph");
    }
    expect(getElements(editor).length).toBe(2);
  });

  it("all IDs are unique across the document after operations", () => {
    const editor = createTestEditor();
    editor.children = deserialize("line 1\n\nline 2\n\nline 3");
    editor.onChange();

    Transforms.select(editor, { path: [2, 0], offset: 3 });
    Transforms.splitNodes(editor);

    Transforms.insertNodes(
      editor,
      {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "new" }],
      } as InkwellElement,
      { at: [editor.children.length] },
    );

    const ids = getAllIds(editor);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("paste — node IDs", () => {
  it("pasted nodes get unique IDs via insertNodes", () => {
    const editor = createTestEditor();
    editor.children = deserialize("existing");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));

    const pastedNodes = deserialize("hello\n\nworld");
    Transforms.insertNodes(editor, pastedNodes);

    const ids = getAllIds(editor);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
