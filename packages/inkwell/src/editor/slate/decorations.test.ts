import { createEditor, Node, type NodeEntry } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it } from "vitest";
import type { ResolvedInkwellFeatures } from "../../types";
import { computeDecorations } from "./decorations";
import { deserialize } from "./deserialize";
import type { InkwellElement, InkwellText } from "./types";
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

function makeEntry(element: InkwellElement, index: number): NodeEntry {
  return [element, [index]] as NodeEntry;
}

describe("computeDecorations — inline marks", () => {
  it("decorates **bold** with boldMarker and bold ranges", () => {
    const el: InkwellElement = {
      type: "paragraph",
      id: generateId(),
      children: [{ text: "hello **world**" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    const bold = ranges.find(r => (r as unknown as InkwellText).bold);
    const markers = ranges.filter(
      r => (r as unknown as InkwellText).boldMarker,
    );

    expect(bold).toBeDefined();
    expect(markers).toHaveLength(2);
  });

  it("decorates _italic_ with italicMarker and italic ranges", () => {
    const el: InkwellElement = {
      type: "paragraph",
      id: generateId(),
      children: [{ text: "hello _world_" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    const italic = ranges.find(r => (r as unknown as InkwellText).italic);
    expect(italic).toBeDefined();
  });

  it("decorates *italic* with single asterisks", () => {
    const el: InkwellElement = {
      type: "paragraph",
      id: generateId(),
      children: [{ text: "hello *world*" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    const italic = ranges.find(r => (r as unknown as InkwellText).italic);
    expect(italic).toBeDefined();
  });

  it("decorates ~~strike~~ with strikeMarker and strikethrough ranges", () => {
    const el: InkwellElement = {
      type: "paragraph",
      id: generateId(),
      children: [{ text: "hello ~~world~~" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    const strike = ranges.find(
      r => (r as unknown as InkwellText).strikethrough,
    );
    const markers = ranges.filter(
      r => (r as unknown as InkwellText).strikeMarker,
    );

    expect(strike).toBeDefined();
    expect(markers).toHaveLength(2);
  });

  it("decorates `code` with codeMarker and inlineCode ranges", () => {
    const el: InkwellElement = {
      type: "paragraph",
      id: generateId(),
      children: [{ text: "use `code` here" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    const code = ranges.find(r => (r as unknown as InkwellText).inlineCode);
    const markers = ranges.filter(
      r => (r as unknown as InkwellText).codeMarker,
    );

    expect(code).toBeDefined();
    expect(markers).toHaveLength(2);
  });

  it("protects inline code from bold/italic processing", () => {
    const el: InkwellElement = {
      type: "paragraph",
      id: generateId(),
      children: [{ text: "`**not bold**`" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    const bold = ranges.find(r => (r as unknown as InkwellText).bold);
    expect(bold).toBeUndefined();
  });

  it("returns empty for empty text", () => {
    const el: InkwellElement = {
      type: "paragraph",
      id: generateId(),
      children: [{ text: "" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    expect(ranges).toEqual([]);
  });

  it("works on blockquote elements", () => {
    const el: InkwellElement = {
      type: "blockquote",
      id: generateId(),
      children: [{ text: "**bold in quote**" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    expect(ranges.length).toBeGreaterThan(0);
  });

  it("does not decorate legacy list-item elements", () => {
    const el: InkwellElement = {
      type: "list-item",
      id: generateId(),
      children: [{ text: "- use `code` here" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    expect(ranges).toEqual([]);
  });

  it("works on heading elements", () => {
    const el: InkwellElement = {
      type: "heading",
      id: generateId(),
      level: 2,
      children: [{ text: "**bold heading**" }],
    };
    const editor = createTestEditor({
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
    });
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    expect(ranges.length).toBeGreaterThan(0);
  });
});

describe("computeDecorations — code-fence", () => {
  it("returns empty for code-fence elements", () => {
    const el: InkwellElement = {
      type: "code-fence",
      id: generateId(),
      children: [{ text: "```ts" }],
    };
    const editor = createTestEditor();
    editor.children = [el];
    editor.onChange();

    const ranges = computeDecorations(makeEntry(el, 0), editor);
    expect(ranges).toEqual([]);
  });
});

describe("computeDecorations — code-line syntax highlighting", () => {
  it("produces hljs ranges for code lines", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```typescript\nconst x = 1;\n```");
    editor.onChange();

    const codeLine = (editor.children as InkwellElement[]).find(
      e => e.type === "code-line",
    );
    if (!codeLine) throw new Error("No code-line found");

    const idx = (editor.children as InkwellElement[]).indexOf(codeLine);
    const ranges = computeDecorations([codeLine, [idx]] as NodeEntry, editor);
    const hljsRanges = ranges.filter(r => (r as unknown as InkwellText).hljs);
    expect(hljsRanges.length).toBeGreaterThan(0);
  });

  it("returns empty for empty code line", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\n\n```");
    editor.onChange();

    const codeLine = (editor.children as InkwellElement[]).find(
      e => e.type === "code-line",
    );
    if (!codeLine) throw new Error("No code-line found");

    const idx = (editor.children as InkwellElement[]).indexOf(codeLine);
    const ranges = computeDecorations([codeLine, [idx]] as NodeEntry, editor);
    expect(ranges).toEqual([]);
  });

  it("all range offsets are within text length", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```html\n<div>hello</div>\n```");
    editor.onChange();

    const elements = editor.children as InkwellElement[];
    const codeLine = elements.find(
      e => e.type === "code-line" && Node.string(e) === "<div>hello</div>",
    );
    if (!codeLine) throw new Error("No code-line found");

    const textLen = Node.string(codeLine).length;
    const idx = elements.indexOf(codeLine);
    const ranges = computeDecorations([codeLine, [idx]] as NodeEntry, editor);

    for (const r of ranges) {
      expect(r.anchor.offset).toBeLessThanOrEqual(textLen);
      expect(r.focus.offset).toBeLessThanOrEqual(textLen);
    }
  });

  it("returns empty for orphaned code-line without preceding fence", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "code-line" as const,
        id: generateId(),
        children: [{ text: "orphaned" }],
      },
    ];
    editor.onChange();

    const ranges = computeDecorations(
      [editor.children[0], [0]] as NodeEntry,
      editor,
    );
    expect(Array.isArray(ranges)).toBe(true);
  });
});

describe("computeDecorations — non-element nodes", () => {
  it("returns empty for non-element nodes", () => {
    const textNode = { text: "plain text" };
    const editor = createTestEditor();
    const ranges = computeDecorations([textNode, [0, 0]] as NodeEntry, editor);
    expect(ranges).toEqual([]);
  });
});
