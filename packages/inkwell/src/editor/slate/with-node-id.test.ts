import { createEditor, Editor, Transforms } from "slate";
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

  it("assigns IDs to code fence elements", () => {
    const elements = deserialize("```ts\nconst x = 1;\n```");
    for (const el of elements) {
      expect(el.id).toBeDefined();
      expect(typeof el.id).toBe("string");
    }
    expect(elements[0].type).toBe("code-fence");
    expect(elements[1].type).toBe("code-line");
    expect(elements[2].type).toBe("code-fence");
  });

  it("assigns IDs to blockquote elements", () => {
    const elements = deserialize("> quoted");
    expect(elements[0].id).toBeDefined();
    expect(elements[0].type).toBe("blockquote");
  });

  it("assigns IDs to list-item elements", () => {
    const elements = deserialize("- item 1\n- item 2");
    for (const el of elements) {
      expect(el.id).toBeDefined();
      expect(el.type).toBe("list-item");
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

  it("assigns IDs to blank-line separator paragraphs", () => {
    const elements = deserialize("first\n\nsecond");
    expect(elements.length).toBe(3);
    for (const el of elements) {
      expect(el.id).toBeDefined();
      expect(typeof el.id).toBe("string");
    }
  });

  it("assigns IDs for unclosed code block elements", () => {
    const elements = deserialize("```js\nunclosed");
    for (const el of elements) {
      expect(el.id).toBeDefined();
    }
    expect(elements[0].type).toBe("code-fence");
    expect(elements[1].type).toBe("code-line");
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
      lists: true,
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

    const idsBefore = getAllIds(editor);

    Transforms.select(editor, Editor.start(editor, [2]));
    Transforms.mergeNodes(editor);

    const idsAfter = getAllIds(editor);
    expect(new Set(idsAfter).size).toBe(idsAfter.length);
    expect(idsAfter.length).toBeLessThan(idsBefore.length);
  });
});

describe("withMarkdown — element creation IDs", () => {
  it("creates elements with IDs via insertBreak on code fence", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```typescript");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    for (const el of getElements(editor)) {
      expect(el.id).toBeDefined();
      expect(typeof el.id).toBe("string");
    }
  });

  it("creates elements with IDs via insertBreak on blockquote", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> some quote");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    for (const el of elements) {
      expect(el.id).toBeDefined();
    }
    expect(elements.length).toBe(2);
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

  it("code-line closing fence creates elements with IDs", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\n```");
    editor.onChange();

    const codeLineIdx = getElements(editor).findIndex(
      e => e.type === "code-line" && e.children[0]?.text === "```",
    );

    if (codeLineIdx >= 0) {
      Transforms.select(editor, Editor.end(editor, [codeLineIdx]));
      editor.insertBreak();

      for (const el of getElements(editor)) {
        expect(el.id).toBeDefined();
      }
    }
  });

  it("code-fence Enter (opening fence) creates code-line with ID", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```typescript\ncode\n```");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    for (const el of getElements(editor)) {
      expect(el.id).toBeDefined();
    }
  });

  it("code-fence Enter (closing fence) creates paragraph with ID", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\ncode\n```");
    editor.onChange();

    const elements = getElements(editor);
    const closingIdx = elements.length - 1;
    if (elements[closingIdx].type === "code-fence") {
      Transforms.select(editor, Editor.end(editor, [closingIdx]));
      editor.insertBreak();

      for (const el of getElements(editor)) {
        expect(el.id).toBeDefined();
      }
    }
  });

  it("code-line insertSoftBreak creates code-line with ID", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\nline1\n```");
    editor.onChange();

    const codeLineIdx = getElements(editor).findIndex(
      e => e.type === "code-line",
    );
    if (codeLineIdx >= 0) {
      Transforms.select(editor, Editor.end(editor, [codeLineIdx]));
      editor.insertSoftBreak();

      for (const el of getElements(editor)) {
        expect(el.id).toBeDefined();
      }
    }
  });

  it("code-line overflow (typing after ```) creates paragraph with ID", () => {
    const editor = createTestEditor();
    editor.children = [
      { type: "code-fence", id: generateId(), children: [{ text: "```ts" }] },
      { type: "code-line", id: generateId(), children: [{ text: "```" }] },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [1]));
    editor.insertText("x");

    for (const el of getElements(editor)) {
      expect(el.id).toBeDefined();
    }
  });

  it("code-fence overflow (typing after closing fence) creates paragraph with ID", () => {
    const editor = createTestEditor();
    editor.children = [
      { type: "code-fence", id: generateId(), children: [{ text: "```ts" }] },
      { type: "code-line", id: generateId(), children: [{ text: "code" }] },
      { type: "code-fence", id: generateId(), children: [{ text: "```" }] },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [2]));
    editor.insertText("x");

    for (const el of getElements(editor)) {
      expect(el.id).toBeDefined();
    }
  });

  it("empty blockquote Enter converts in-place (preserves ID)", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> ");
    editor.onChange();

    const originalId = getElements(editor)[0].id;

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
    expect(elements[0].id).toBe(originalId);
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
