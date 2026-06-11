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

describe("withMarkdown — code block triggers", () => {
  it("``` + Enter promotes a typed paragraph to a code-block with the language tag", () => {
    // Typing `"```typescript"` builds a paragraph (the normalizer does
    // not auto-promote fence openings on its own — only deserialize
    // does, which the user reaches via paste/load, not typing). Pressing
    // Enter is the explicit "open the fence" gesture.
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "```typescript" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("code-block");
    expect(elements[0].lang).toBe("typescript");
    expect(Node.string(elements[0])).toBe("");
  });

  it("Enter inside a code-block inserts a literal newline into the text", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\nline1\n```");
    editor.onChange();

    // Caret at end of the inner text leaf.
    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("code-block");
    expect(Node.string(elements[0])).toBe("line1\n");
  });

  it("Shift+Enter inside a code-block also inserts a newline", () => {
    const editor = createTestEditor();
    editor.children = deserialize("```ts\nline1\n```");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    expect(Node.string(getElements(editor)[0])).toBe("line1\n");
  });

  it("round-trips a code block through deserialize → serialize", () => {
    const source = "```ts\nconst x = 1;\nconst y = 2;\n```";
    const nodes = deserialize(source);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("code-block");
    expect(nodes[0].lang).toBe("ts");
    expect(serialize(nodes)).toBe(source);
  });

  it("does not promote to code-block when codeBlocks disabled", () => {
    const editor = createTestEditor({ codeBlocks: false });
    editor.children = deserialize("```typescript", { codeBlocks: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const types = getElements(editor).map(e => e.type);
    expect(types).not.toContain("code-block");
  });
});

describe("withMarkdown — blockquote triggers", () => {
  it("typing `> ` on an empty paragraph wraps it in a blockquote", () => {
    const editor = createTestEditor();
    editor.children = deserialize(">");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("blockquote");
    expect(serialize(elements)).toBe(">");
  });

  it("does not convert when blockquotes disabled", () => {
    const editor = createTestEditor({ blockquotes: false });
    editor.children = deserialize(">", { blockquotes: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("Enter inside a non-empty blockquote paragraph inserts a sibling inside the quote", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> some quote");
    editor.onChange();

    // Caret at end of the inner paragraph
    Transforms.select(editor, Editor.end(editor, [0, 0]));
    editor.insertBreak();

    const top = getElements(editor);
    expect(top).toHaveLength(1);
    expect(top[0].type).toBe("blockquote");
    expect(top[0].children).toHaveLength(2);
  });

  it("Enter on an empty inner paragraph exits the blockquote", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> ");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0, 0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
  });

  it("Shift+Enter inside a blockquote inserts another inner paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("> first");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0, 0]));
    editor.insertSoftBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("blockquote");
    expect(elements[0].children).toHaveLength(2);
    expect(serialize(elements)).toBe("> first\n>");
  });
});

describe("withMarkdown — select-all + delete", () => {
  it("cmd+A → delete on a code-block resets to a single empty paragraph", () => {
    // Slate's default `deleteFragment` only clears content inside the
    // covered range; the anchoring code-block shell would otherwise
    // survive, leaving the user with an empty `<pre>` block they
    // can't dismiss.
    const editor = createTestEditor();
    editor.children = deserialize("```ts\nconst x = 1;\n```");
    editor.onChange();

    Transforms.select(editor, {
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });
    editor.deleteFragment();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("");
  });

  it("cmd+A → delete on a heading resets to a single empty paragraph", () => {
    const editor = createTestEditor({ heading1: true });
    editor.children = deserialize("# title");
    editor.onChange();

    Transforms.select(editor, {
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });
    editor.deleteFragment();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("");
  });

  it("cmd+A → delete across mixed blocks resets to a single empty paragraph", () => {
    const editor = createTestEditor({ heading1: true });
    editor.children = deserialize(
      "# title\n\n> quoted\n\n```\ncode\n```\n\npara",
    );
    editor.onChange();

    Transforms.select(editor, {
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });
    editor.deleteFragment();

    const elements = getElements(editor);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("");
  });

  it("partial range delete still goes through Slate's default", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello world");
    editor.onChange();

    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 5 },
    });
    editor.deleteFragment();

    expect(Node.string(editor)).toBe(" world");
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

  it("Enter at the end of a heading inserts a paragraph below, heading preserved", () => {
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
        children: [{ text: "## Title" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("heading");
    expect(Node.string(elements[0])).toBe("## Title");
    expect(elements[1].type).toBe("paragraph");
    expect(Node.string(elements[1])).toBe("");
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

  it("Enter inside the heading mark splits at the caret and reclassifies both halves", () => {
    // Cursor between the two `#`s of `## Try it out`. The head `#` is no
    // longer a valid heading mark (no trailing space) — drops to paragraph.
    // The tail `# Try it out` is still a valid h1 — stays as a heading.
    const editor = createTestEditor({
      heading1: true,
      heading2: true,
    });
    editor.children = deserialize("## Try it out", {
      heading1: true,
      heading2: true,
    });
    editor.onChange();
    expect(getElements(editor)[0].type).toBe("heading");

    Transforms.select(editor, { path: [0, 0], offset: 1 });
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("#");
    expect(elements[1].type).toBe("heading");
    expect(elements[1].level).toBe(1);
    expect(Node.string(elements[1])).toBe("# Try it out");
  });

  it("Enter in heading body keeps the head as a heading, drops the tail to paragraph", () => {
    const editor = createTestEditor({ heading2: true });
    editor.children = deserialize("## Try it out", { heading2: true });
    editor.onChange();

    // Caret after "## T", before "ry it out".
    Transforms.select(editor, { path: [0, 0], offset: 4 });
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe("heading");
    expect(elements[0].level).toBe(2);
    expect(Node.string(elements[0])).toBe("## T");
    expect(elements[1].type).toBe("paragraph");
    expect(Node.string(elements[1])).toBe("ry it out");
  });

  it("Enter at the very start of a heading inserts an empty paragraph above", () => {
    const editor = createTestEditor({ heading2: true });
    editor.children = deserialize("## Title", { heading2: true });
    editor.onChange();

    Transforms.select(editor, { path: [0, 0], offset: 0 });
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("");
    expect(elements[1].type).toBe("heading");
    expect(Node.string(elements[1])).toBe("## Title");
  });

  it("normalizer promotes a paragraph to heading when its text matches heading syntax", () => {
    const editor = createTestEditor({ heading2: true });
    // Construct a malformed state: paragraph element carrying heading
    // text. Could arise from backspace, paste-inside-block, programmatic
    // setContent, etc. — the deserializer would catch it, but in-editor
    // edits previously didn't.
    editor.children = [
      {
        type: "paragraph" as const,
        id: generateId(),
        children: [{ text: "## Features" }],
      },
    ];
    Editor.normalize(editor, { force: true });

    const el = getElements(editor)[0];
    expect(el.type).toBe("heading");
    expect(el.level).toBe(2);
  });

  it("normalizer demotes a heading to paragraph when its text no longer matches", () => {
    const editor = createTestEditor({ heading2: true });
    editor.children = [
      {
        type: "heading" as const,
        id: generateId(),
        level: 2,
        children: [{ text: "##" }],
      },
    ];
    Editor.normalize(editor, { force: true });

    const el = getElements(editor)[0];
    expect(el.type).toBe("paragraph");
    expect(el.level).toBeUndefined();
  });

  it("normalizer adjusts heading level when the marker count changes", () => {
    const editor = createTestEditor({ heading1: true, heading2: true });
    editor.children = [
      {
        type: "heading" as const,
        id: generateId(),
        level: 2,
        children: [{ text: "# Now h1" }],
      },
    ];
    Editor.normalize(editor, { force: true });

    const el = getElements(editor)[0];
    expect(el.type).toBe("heading");
    expect(el.level).toBe(1);
  });

  it("normalizer promotes paragraph to blockquote when text starts with `> `", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph" as const,
        id: generateId(),
        children: [{ text: "> quoted" }],
      },
    ];
    Editor.normalize(editor, { force: true });

    expect(getElements(editor)[0].type).toBe("blockquote");
  });

  it("keeps `---` as a paragraph (thematic-break support removed)", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph" as const,
        id: generateId(),
        children: [{ text: "---" }],
      },
    ];
    Editor.normalize(editor, { force: true });

    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("backspacing the trailing char of a heading source down-grades to paragraph", () => {
    const editor = createTestEditor({ heading2: true });
    editor.children = deserialize("## ", { heading2: true });
    editor.onChange();

    // Initial state: heading h2 from `## ` (which matches `^(#{1,6})\s`).
    // Wait — `## ` (with trailing space) does match the regex; deserialize
    // creates a heading. Now backspace the space.
    Transforms.select(editor, Editor.end(editor, [0]));
    editor.deleteBackward("character");

    const el = getElements(editor)[0];
    expect(Node.string(el)).toBe("##");
    expect(el.type).toBe("paragraph");
  });

  it("typing a `#` after content keeps the heading; backspacing the space drops it", () => {
    const editor = createTestEditor({ heading1: true });
    editor.children = deserialize("# foo", { heading1: true });
    editor.onChange();
    expect(getElements(editor)[0].type).toBe("heading");

    // Backspace down to "# "; still a heading.
    Transforms.select(editor, Editor.end(editor, [0]));
    editor.deleteBackward("character");
    editor.deleteBackward("character");
    editor.deleteBackward("character");
    expect(Node.string(getElements(editor)[0])).toBe("# ");
    expect(getElements(editor)[0].type).toBe("heading");

    // Backspace the space — syntax breaks, element demotes.
    editor.deleteBackward("character");
    expect(Node.string(getElements(editor)[0])).toBe("#");
    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("normalizer keeps an h2 element when its text still matches h2 syntax", () => {
    const editor = createTestEditor({ heading2: true });
    editor.children = deserialize("## Title", { heading2: true });
    editor.onChange();

    const before = getElements(editor)[0];
    expect(before.type).toBe("heading");
    expect(before.level).toBe(2);

    // Trigger another normalization with an unrelated transform.
    Transforms.select(editor, Editor.end(editor, [0]));
    Transforms.insertText(editor, "!");

    const after = getElements(editor)[0];
    expect(after.type).toBe("heading");
    expect(after.level).toBe(2);
    expect(after.id).toBe(before.id);
  });

  it("split tail that would be a heading at a disabled level falls back to paragraph", () => {
    // h2 is on, h1 is off. Splitting `## Foo` between the `#`s would
    // produce an h1 tail, but the feature is off so the tail must drop to
    // paragraph.
    const editor = createTestEditor({ heading1: false, heading2: true });
    editor.children = deserialize("## Foo", {
      heading1: false,
      heading2: true,
    });
    editor.onChange();

    Transforms.select(editor, { path: [0, 0], offset: 1 });
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("#");
    expect(elements[1].type).toBe("paragraph");
    expect(Node.string(elements[1])).toBe("# Foo");
  });
});

describe("withMarkdown — list triggers", () => {
  it("typing `- ` on an empty paragraph wraps it in an unordered list", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "-" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const top = getElements(editor);
    expect(top).toHaveLength(1);
    expect(top[0].type).toBe("list");
    expect(top[0].ordered).toBeUndefined();
    expect(top[0].children).toHaveLength(1);
  });

  it("typing `* ` and `+ ` also produce unordered lists", () => {
    for (const marker of ["*", "+"] as const) {
      const editor = createTestEditor();
      editor.children = [
        {
          type: "paragraph",
          id: generateId(),
          children: [{ text: marker }],
        },
      ];
      editor.onChange();
      Transforms.select(editor, Editor.end(editor, [0]));
      editor.insertText(" ");
      expect(getElements(editor)[0].type).toBe("list");
    }
  });

  it("typing `1. ` produces an ordered list", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "1." }],
      },
    ];
    editor.onChange();
    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");
    const top = getElements(editor);
    expect(top[0].type).toBe("list");
    expect(top[0].ordered).toBe(true);
    expect(top[0].start).toBeUndefined();
  });

  it("typing `3. ` captures the starting number on the list", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "3." }],
      },
    ];
    editor.onChange();
    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");
    expect(getElements(editor)[0].start).toBe(3);
  });

  it("Enter on a non-empty list-item paragraph splits into two items", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- one");
    editor.onChange();

    // Caret at end of the inner paragraph (path [0, 0, 0]).
    Transforms.select(editor, Editor.end(editor, [0, 0, 0]));
    editor.insertBreak();

    const top = getElements(editor);
    expect(top).toHaveLength(1);
    expect(top[0].type).toBe("list");
    expect(top[0].children).toHaveLength(2);
  });

  it("Enter on an empty inner paragraph exits the list", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- ");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0, 0, 0]));
    editor.insertBreak();

    expect(getElements(editor)[0].type).toBe("paragraph");
  });

  it("does not re-trigger inside an existing list-item", () => {
    // Typing `- ` inside a list-item that already has `-` content should
    // remain as text — the trigger only fires when we're outside a list.
    const editor = createTestEditor();
    editor.children = deserialize("- ");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0, 0, 0]));
    editor.insertText("-");
    Transforms.select(editor, Editor.end(editor, [0, 0, 0]));
    editor.insertText(" ");
    // The inner paragraph keeps the literal `- ` text.
    const list = getElements(editor)[0];
    expect(list.type).toBe("list");
    expect(Node.string(list)).toBe("- ");
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
    // `\n\n` deserializes to two paragraphs (no empty separator), so
    // the second paragraph sits at path [1].
    editor.children = deserialize("hello world\n\nfoo bar");
    editor.onChange();

    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [1, 0], offset: 3 },
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

  it("Enter at the end of a paragraph containing an inline image inserts a sibling paragraph", () => {
    // Inline-image shape: a paragraph wrapping `[text"", image, text""]`.
    // Enter at the end of that paragraph follows Slate's default split
    // (a new sibling paragraph), not a special "paragraph-after-void-
    // image" path.
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph",
        id: generateId(),
        children: [
          { text: "" },
          {
            type: "image",
            id: generateId(),
            url: "https://x.png",
            alt: "img",
            children: [{ text: "" }],
          },
          { text: "" },
        ],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements.length).toBeGreaterThanOrEqual(2);
    // The original paragraph still carries the image; a fresh paragraph
    // sits below it.
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

describe("withMarkdown — insertSoftBreak fallthrough", () => {
  it("Shift+Enter on paragraph falls through to insertBreak", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    expect(getElements(editor).length).toBe(2);
  });
});

describe("withMarkdown — paste (insertData)", () => {
  function makeDataTransfer(text: string): DataTransfer {
    const store: Record<string, string> = { "text/plain": text };
    return {
      setData: (type: string, value: string) => {
        store[type] = value;
      },
      getData: (type: string) => store[type] ?? "",
      clearData: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
      types: ["text/plain"],
    } as unknown as DataTransfer;
  }

  it("parses pasted text as markdown", () => {
    const editor = createTestEditor();
    editor.children = deserialize("before");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));

    editor.insertData(makeDataTransfer("\n\nafter"));

    expect(Node.string(editor)).toContain("after");
  });

  it("pasting plain text into an empty editor stays in a single paragraph", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertData(makeDataTransfer("hello"));

    const elements = getElements(editor);
    expect(elements.length).toBe(1);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(editor)).toBe("hello");
  });

  it("pasting plain text at the end of a paragraph merges into the same block", () => {
    const editor = createTestEditor();
    editor.children = deserialize("foo");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertData(makeDataTransfer("bar"));

    const elements = getElements(editor);
    expect(elements.length).toBe(1);
    expect(Node.string(editor)).toBe("foobar");
  });

  it("pasting plain text into the middle of a paragraph merges inline", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello world");
    editor.onChange();

    Transforms.select(editor, { path: [0, 0], offset: 5 });
    editor.insertData(makeDataTransfer(" there"));

    const elements = getElements(editor);
    expect(elements.length).toBe(1);
    expect(Node.string(editor)).toBe("hello there world");
  });

  it("pasting a URL over a selection wraps the selection as [text](url)", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello world");
    editor.onChange();

    // Select "world" (offsets 6..11).
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [0, 0], offset: 11 },
    });

    editor.insertData(makeDataTransfer("https://example.com"));

    expect(Node.string(editor)).toBe("hello [world](https://example.com)");
  });

  it("pasting a URL with no selection inserts it bare", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello ");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertData(makeDataTransfer("https://example.com"));

    expect(Node.string(editor)).toBe("hello https://example.com");
  });

  it("pasting a URL with a collapsed selection inserts it bare (no wrapping)", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello world");
    editor.onChange();

    // Collapsed caret inside the text.
    Transforms.select(editor, { path: [0, 0], offset: 5 });
    editor.insertData(makeDataTransfer("https://example.com"));

    expect(Node.string(editor)).toBe("hellohttps://example.com world");
  });

  it("pasting non-URL text over a selection replaces it normally (no wrapping)", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello world");
    editor.onChange();

    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [0, 0], offset: 11 },
    });

    editor.insertData(makeDataTransfer("there"));

    expect(Node.string(editor)).toBe("hello there");
  });

  it("pasting a URL with surrounding whitespace still triggers wrapping", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello world");
    editor.onChange();

    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 6 },
      focus: { path: [0, 0], offset: 11 },
    });

    // Clipboard often includes trailing newlines / spaces from a copy.
    editor.insertData(makeDataTransfer("  https://example.com  "));

    expect(Node.string(editor)).toBe("hello [world](https://example.com)");
  });
});
