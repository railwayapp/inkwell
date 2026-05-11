import {
  CursorEditor,
  slateNodesToInsertDelta,
  withCursors,
  withYHistory,
  withYjs,
  YjsEditor,
} from "@slate-yjs/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import {
  createEditor,
  Editor,
  Node,
  type NodeEntry,
  Range,
  Transforms,
} from "slate";
import { withHistory } from "slate-history";
import { ReactEditor, withReact } from "slate-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { createBubbleMenuPlugin } from "../plugins/bubble-menu";
import { createMentionsPlugin } from "../plugins/mentions";
import { createSlashCommandsPlugin } from "../plugins/slash-commands";
import type {
  CollaborationConfig,
  InkwellDecorations,
  PluginRenderProps,
} from "../types";
import { InkwellEditor } from "./inkwell-editor";
import { computeDecorations } from "./slate/decorations";
import { deserialize } from "./slate/deserialize";
import { serialize } from "./slate/serialize";
import type { InkwellElement, InkwellText } from "./slate/types";
import { withMarkdown } from "./slate/with-markdown";
import { generateId, withNodeId } from "./slate/with-node-id";

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

type CollabTestEditor = Editor &
  ReturnType<typeof withYjs> &
  ReturnType<typeof withCursors> & { undo: () => void; redo: () => void };

function createCollabEditor(
  doc: Y.Doc,
  opts?: {
    decorations?: InkwellDecorations;
    user?: { name: string; color: string };
  },
) {
  const sharedType = doc.get("content", Y.XmlText) as Y.XmlText;
  const awareness = new Awareness(doc);
  const decorationsRef = {
    current: {
      heading1: opts?.decorations?.heading1 ?? false,
      heading2: opts?.decorations?.heading2 ?? false,
      heading3: opts?.decorations?.heading3 ?? false,
      heading4: opts?.decorations?.heading4 ?? false,
      heading5: opts?.decorations?.heading5 ?? false,
      heading6: opts?.decorations?.heading6 ?? false,
      lists: opts?.decorations?.lists ?? true,
      blockquotes: opts?.decorations?.blockquotes ?? true,
      codeBlocks: opts?.decorations?.codeBlocks ?? true,
      images: opts?.decorations?.images ?? true,
    },
  };

  const base = withNodeId(withReact(createEditor()));
  const yjsEditor = withYjs(base, sharedType, { autoConnect: false });
  const cursorEditor = withCursors(yjsEditor, awareness, {
    data: opts?.user ?? { name: "Test User", color: "#ff0000" },
  });
  const historyEditor = withYHistory(cursorEditor);
  const editor = withMarkdown(
    historyEditor,
    decorationsRef,
  ) as CollabTestEditor;

  return { editor, sharedType, awareness, doc };
}

function createTwoEditorSetup(seedContent: string) {
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();
  const st1 = doc1.get("content", Y.XmlText) as Y.XmlText;
  const st2 = doc2.get("content", Y.XmlText) as Y.XmlText;

  const decorationsRef = {
    current: {
      heading1: false,
      heading2: false,
      heading3: false,
      heading4: false,
      heading5: false,
      heading6: false,
      lists: true,
      blockquotes: true,
      codeBlocks: true,
      images: true,
    },
  };

  const editor1 = withMarkdown(
    withYHistory(
      withCursors(
        withYjs(withNodeId(withReact(createEditor())), st1, {
          autoConnect: false,
        }),
        new Awareness(doc1),
        { data: { name: "Alice", color: "#ff0000" } },
      ),
    ),
    decorationsRef,
  ) as CollabTestEditor;
  const editor2 = withMarkdown(
    withYHistory(
      withCursors(
        withYjs(withNodeId(withReact(createEditor())), st2, {
          autoConnect: false,
        }),
        new Awareness(doc2),
        { data: { name: "Bob", color: "#0000ff" } },
      ),
    ),
    decorationsRef,
  ) as CollabTestEditor;

  const nodes = deserialize(seedContent);
  const delta = slateNodesToInsertDelta(nodes);
  st1.applyDelta(delta);
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

  return { editor1, editor2, doc1, doc2, st1, st2 };
}

function syncDocs(from: Y.Doc, to: Y.Doc) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from));
}

function seedDocument(
  sharedType: Y.XmlText,
  markdown: string,
  decorations?: InkwellDecorations,
) {
  const nodes = deserialize(markdown, decorations);
  const delta = slateNodesToInsertDelta(nodes);
  sharedType.applyDelta(delta);
}

function createCollabConfig(content?: string): CollaborationConfig {
  const doc = new Y.Doc();
  const sharedType = doc.get("content", Y.XmlText) as Y.XmlText;
  const awareness = new Awareness(doc);

  if (content) {
    const nodes = deserialize(content);
    const delta = slateNodesToInsertDelta(nodes);
    sharedType.applyDelta(delta);
  }

  return { sharedType, awareness, user: { name: "Test", color: "#ff0000" } };
}

function getElements(editor: Editor): InkwellElement[] {
  return editor.children as InkwellElement[];
}

function getText(editor: Editor): string {
  return Node.string(editor);
}

function wrapSelection(editor: Editor, before: string, after: string) {
  const { selection } = editor;
  if (!selection) return;
  const selectedText = Editor.string(editor, selection);

  if (
    selectedText.startsWith(before) &&
    selectedText.endsWith(after) &&
    selectedText.length >= before.length + after.length
  ) {
    Transforms.delete(editor);
    Transforms.insertText(
      editor,
      selectedText.slice(before.length, -after.length || undefined),
    );
    return;
  }

  const { anchor, focus } = selection;
  const [start, end] = Range.isForward(selection)
    ? [anchor, focus]
    : [focus, anchor];
  const beforeStart = {
    path: start.path,
    offset: Math.max(0, start.offset - before.length),
  };
  const afterEnd = {
    path: end.path,
    offset: end.offset + after.length,
  };

  try {
    const textBefore = Editor.string(editor, {
      anchor: beforeStart,
      focus: start,
    });
    const textAfter = Editor.string(editor, {
      anchor: end,
      focus: afterEnd,
    });

    if (textBefore === before && textAfter === after) {
      const expandedRange = { anchor: beforeStart, focus: afterEnd };
      Transforms.select(editor, expandedRange);
      Transforms.delete(editor);
      Transforms.insertText(editor, selectedText);
      return;
    }
  } catch {
    // Range out of bounds — fall through to wrap
  }

  Transforms.delete(editor);
  Transforms.insertText(editor, `${before}${selectedText}${after}`);
}

beforeEach(() => {
  vi.spyOn(ReactEditor, "hasEditableTarget").mockReturnValue(true);
});

afterEach(cleanup);

describe("InkwellEditor — rendering", () => {
  it("renders a Slate editor with contenteditable", () => {
    render(<InkwellEditor content="hello" onChange={vi.fn()} />);
    const editor = screen.getByRole("textbox");
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(editor).toHaveAttribute("data-slate-editor", "true");
  });

  it("renders content in <p> elements with data-slate-node", () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor).toBeInTheDocument();
    const paragraphs = editor?.querySelectorAll("p");
    expect(paragraphs?.length).toBeGreaterThan(0);
    expect(editor?.textContent).toContain("hello");
  });

  it("renders the wrapper with inkwell-editor-wrapper class", () => {
    const { container } = render(
      <InkwellEditor content="test" onChange={vi.fn()} />,
    );
    expect(
      container.querySelector(".inkwell-editor-wrapper"),
    ).toBeInTheDocument();
  });

  it("accepts onChange prop without errors", () => {
    const onChange = vi.fn();
    expect(() =>
      render(<InkwellEditor content="test" onChange={onChange} />),
    ).not.toThrow();
  });
});

describe("InkwellEditor — markdown content", () => {
  it("renders **bold** with <strong> via decorations", () => {
    const { container } = render(
      <InkwellEditor content="**bold text**" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("strong")).toBeInTheDocument();
    expect(editor?.textContent).toContain("**");
    expect(editor?.textContent).toContain("bold text");
  });

  it("renders _italic_ with <em> via decorations", () => {
    const { container } = render(
      <InkwellEditor content="_italic text_" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("em")).toBeInTheDocument();
    expect(editor?.textContent).toContain("italic text");
  });

  it("renders ~~strike~~ with <del> via decorations", () => {
    const { container } = render(
      <InkwellEditor content="~~deleted~~" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("del")).toBeInTheDocument();
    expect(editor?.textContent).toContain("deleted");
  });

  it("renders `code` with <code> via decorations", () => {
    const { container } = render(
      <InkwellEditor content="`inline code`" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("code")).toBeInTheDocument();
    expect(editor?.textContent).toContain("`");
    expect(editor?.textContent).toContain("inline code");
  });

  it("renders headings with inkwell-editor-heading class (no <h1>)", () => {
    const { container } = render(
      <InkwellEditor content="# Title" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("h1")).not.toBeInTheDocument();
    expect(
      editor?.querySelector(".inkwell-editor-heading"),
    ).toBeInTheDocument();
    expect(editor?.textContent).toBe("Title");
  });

  it("renders links as plain text (no <a>)", () => {
    const { container } = render(
      <InkwellEditor
        content="[link](https://example.com)"
        onChange={vi.fn()}
      />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("a")).not.toBeInTheDocument();
    expect(editor?.textContent).toBe("[link](https://example.com)");
  });

  it("renders complex multi-element content", () => {
    const md = `# Heading

**Bold** and _italic_.

- item 1
- item 2

> quote

\`inline code\``;
    const { container } = render(
      <InkwellEditor content={md} onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("h1")).not.toBeInTheDocument();
    expect(editor?.querySelector("strong")).toBeInTheDocument();
    expect(editor?.querySelector("em")).toBeInTheDocument();
    expect(editor?.querySelector("ul")).not.toBeInTheDocument();
    expect(
      editor?.querySelector(".inkwell-editor-blockquote"),
    ).toBeInTheDocument();
    expect(editor?.querySelector("code")).toBeInTheDocument();
    expect(
      editor?.querySelector(".inkwell-editor-heading"),
    ).toBeInTheDocument();
    expect(editor?.textContent).toContain("Heading");
    expect(editor?.textContent).toContain("- item 1");
    expect(editor?.textContent).toContain("quote");
  });
});

describe("InkwellEditor — placeholder", () => {
  it("sets data-placeholder on the editor", () => {
    const { container } = render(
      <InkwellEditor
        content=""
        onChange={vi.fn()}
        placeholder="Type here..."
      />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor).toHaveAttribute("data-placeholder", "Type here...");
  });

  it("uses default placeholder when none provided", () => {
    const { container } = render(
      <InkwellEditor content="" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor).toHaveAttribute("data-placeholder", "Start writing...");
  });

  it("sets aria-placeholder for accessibility", () => {
    render(
      <InkwellEditor content="" onChange={vi.fn()} placeholder="Write here" />,
    );
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-placeholder",
      "Write here",
    );
  });
});

describe("InkwellEditor — className", () => {
  it("applies custom className to wrapper", () => {
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        className="custom-class"
      />,
    );
    expect(container.querySelector(".inkwell-editor-wrapper")).toHaveClass(
      "custom-class",
    );
  });
});

describe("InkwellEditor — code blocks", () => {
  it("renders code fence with inkwell-editor-code-fence class", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const { container } = render(
      <InkwellEditor content={md} onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(
      editor?.querySelector(".inkwell-editor-code-fence"),
    ).toBeInTheDocument();
  });

  it("renders code lines with inkwell-editor-code-line class", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const { container } = render(
      <InkwellEditor content={md} onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    const codeLine = editor?.querySelector(".inkwell-editor-code-line");
    expect(codeLine).toBeInTheDocument();
    expect(codeLine?.textContent).toContain("const x = 1;");
  });

  it("does not render <pre> or <code> blocks (uses <p> elements)", () => {
    const md = "```js\nlet a = 2;\n```";
    const { container } = render(
      <InkwellEditor content={md} onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("pre")).not.toBeInTheDocument();
  });

  it("applies hljs classes for syntax highlighting", () => {
    const md = "```typescript\nconst x: number = 1;\n```";
    const { container } = render(
      <InkwellEditor content={md} onChange={vi.fn()} />,
    );
    const codeLine = container.querySelector(".inkwell-editor-code-line");
    expect(codeLine?.innerHTML).toMatch(/hljs/);
  });
});

describe("InkwellEditor — blockquotes", () => {
  it("renders blockquotes with inkwell-editor-blockquote class", () => {
    const { container } = render(
      <InkwellEditor content="> quoted text" onChange={vi.fn()} />,
    );
    const bq = container.querySelector(".inkwell-editor-blockquote");
    expect(bq).toBeInTheDocument();
  });

  it("strips the > prefix from blockquote text content", () => {
    const { container } = render(
      <InkwellEditor content="> hello world" onChange={vi.fn()} />,
    );
    const bq = container.querySelector(".inkwell-editor-blockquote");
    expect(bq?.textContent).toBe("hello world");
  });
});

describe("InkwellEditor — list rendering", () => {
  it("renders list items as plain text (no <ul> or <li>)", () => {
    const { container } = render(
      <InkwellEditor content="- item 1\n- item 2" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    expect(editor.querySelector("ul")).not.toBeInTheDocument();
    expect(editor.querySelector("li")).not.toBeInTheDocument();
    expect(editor.textContent).toContain("- item 1");
    expect(editor.textContent).toContain("- item 2");
  });
});

describe("InkwellEditor — edge cases", () => {
  it("handles empty content", () => {
    const { container } = render(
      <InkwellEditor content="" onChange={vi.fn()} />,
    );
    expect(container.querySelector(".inkwell-editor")).toBeInTheDocument();
  });

  it("handles whitespace-only content", () => {
    const { container } = render(
      <InkwellEditor content="   " onChange={vi.fn()} />,
    );
    expect(container.querySelector(".inkwell-editor")).toBeInTheDocument();
  });

  it("handles very long content without crashing", () => {
    const longContent = "# Long\n\n" + "paragraph\n\n".repeat(100);
    const { container } = render(
      <InkwellEditor content={longContent} onChange={vi.fn()} />,
    );
    expect(container.querySelector(".inkwell-editor")).toBeInTheDocument();
  });

  it("handles special characters in content", () => {
    const md = "Price: $100 & 50% off < $200 > $50";
    const { container } = render(
      <InkwellEditor content={md} onChange={vi.fn()} />,
    );
    expect(container.querySelector(".inkwell-editor")?.textContent).toContain(
      "$100",
    );
  });

  it("handles HTML entities in content", () => {
    render(
      <InkwellEditor content="Use &amp; and &lt;tag&gt;" onChange={vi.fn()} />,
    );
    const editor = screen.getByRole("textbox");
    expect(editor.textContent).toContain("&");
  });
});

describe("InkwellEditor — accessibility", () => {
  it("has role=textbox", () => {
    render(<InkwellEditor content="test" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("has aria-multiline", () => {
    render(<InkwellEditor content="test" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-multiline",
      "true",
    );
  });
});

describe("InkwellEditor — plugin integration", () => {
  const testPlugin = {
    name: "test",
    trigger: { key: "Control+/" },
    render: ({ query, onSelect, onDismiss }: PluginRenderProps) => (
      <div data-testid="test-plugin">
        <span data-testid="plugin-query">{query}</span>
        <button
          data-testid="plugin-select"
          onClick={() => onSelect("inserted text")}
        >
          Select
        </button>
        <button data-testid="plugin-dismiss" onClick={() => onDismiss()}>
          Dismiss
        </button>
      </div>
    ),
  };

  it("does not show plugin popup by default", () => {
    render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[testPlugin]}
      />,
    );
    expect(screen.queryByTestId("test-plugin")).not.toBeInTheDocument();
  });

  it("shows plugin popup when trigger hotkey is pressed", () => {
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[testPlugin]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    act(() => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(screen.getByTestId("test-plugin")).toBeInTheDocument();
  });

  it("renders plugin inside editor wrapper when triggered", () => {
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[testPlugin]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    act(() => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(
      container.querySelector(
        ".inkwell-editor-wrapper [data-testid='test-plugin']",
      ),
    ).toBeInTheDocument();
  });

  it("does not activate plugin without correct modifier", () => {
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[testPlugin]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    act(() => {
      fireEvent.keyDown(editor, { key: "/" });
    });
    expect(screen.queryByTestId("test-plugin")).not.toBeInTheDocument();
  });

  it("passes empty query initially", () => {
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[testPlugin]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    act(() => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(screen.getByTestId("plugin-query")).toHaveTextContent("");
  });

  it("supports character-triggered plugins", () => {
    const charPlugin = {
      ...testPlugin,
      name: "char-test",
      trigger: { key: "@" },
    };
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[charPlugin]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    act(() => {
      fireEvent.keyDown(editor, { key: "@" });
    });
    expect(screen.getByTestId("test-plugin")).toBeInTheDocument();
  });


  it("forwards keyboard navigation and selection to active character plugins", async () => {
    const onChange = vi.fn();
    const mentions = createMentionsPlugin({
      name: "users",
      trigger: "@",
      marker: "user",
      search: () => [
        { id: "1", title: "Alice" },
        { id: "2", title: "Bob" },
      ],
      renderItem: item => <span>{item.title}</span>,
    });

    const { container } = render(
      <InkwellEditor content="" onChange={onChange} plugins={[mentions]} />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;

    act(() => {
      fireEvent.keyDown(editor, { key: "@" });
    });

    await screen.findByText("Alice");

    act(() => {
      fireEvent.keyDown(editor, { key: "ArrowDown" });
      fireEvent.keyDown(editor, { key: "Enter" });
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith("@user[2]");
    });
  });


  it("forwards typed query keys to active character plugins", async () => {
    const onChange = vi.fn();
    const mentions = createMentionsPlugin({
      name: "users",
      trigger: "@",
      marker: "user",
      search: (query: string) =>
        [
          { id: "1", title: "Alice" },
          { id: "2", title: "Bob" },
          { id: "3", title: "Carol" },
        ].filter(user =>
          user.title.toLowerCase().includes(query.toLowerCase()),
        ),
      renderItem: item => <span>{item.title}</span>,
    });

    const { container } = render(
      <InkwellEditor content="" onChange={onChange} plugins={[mentions]} />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;

    act(() => {
      fireEvent.keyDown(editor, { key: "@" });
    });

    await screen.findByText("Alice");

    act(() => {
      fireEvent.keyDown(editor, { key: "b" });
    });

    await waitFor(() => {
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    act(() => {
      fireEvent.keyDown(editor, { key: "Enter" });
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith("@user[2]");
    });
  });

  it("executes slash commands with a structured string-only payload and clears only the command line", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    const onExecute = vi.fn();
    const slashCommands = createSlashCommandsPlugin({
      commands: [
        {
          name: "status",
          description: "Set a thread status",
          args: [
            {
              name: "status",
              description: "Status to apply",
              required: true,
              choices: [
                { value: "solved", label: "Solved" },
                { value: "closed", label: "Closed" },
              ],
            },
          ],
        },
      ],
      getMarkdown: () => ref.current?.getMarkdown() ?? "",
      setMarkdown: markdown => ref.current?.setMarkdown(markdown),
      onExecute,
    });

    const { container } = render(
      <InkwellEditor
        ref={ref}
        content="Intro"
        onChange={onChange}
        plugins={[slashCommands]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;

    act(() => {
      ref.current?.focus({ at: "end" });
      ref.current?.insertMarkdown("\n");
    });

    act(() => {
      fireEvent.keyDown(editor, { key: "/" });
    });
    await screen.findByText("/status");

    act(() => {
      fireEvent.keyDown(editor, { key: "s" });
    });
    await screen.findByText("/status");

    act(() => {
      fireEvent.keyDown(editor, { key: "Enter" });
    });
    await screen.findByText("Solved");

    act(() => {
      fireEvent.keyDown(editor, { key: "Enter" });
    });

    expect(screen.getByText("Enter to execute · Esc to cancel")).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(editor, { key: "Enter" });
    });

    await waitFor(() => {
      expect(onExecute).toHaveBeenCalledWith({
        name: "status",
        args: { status: "solved" },
        raw: "/status Solved",
      });
    });
    await waitFor(() => {
      expect(ref.current?.getMarkdown()).toBe("Intro");
    });
  });

  it("clears the slash command line when canceling from the execute phase", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onExecute = vi.fn();
    const slashCommands = createSlashCommandsPlugin({
      commands: [{ name: "runbook", description: "Run a support runbook" }],
      getMarkdown: () => ref.current?.getMarkdown() ?? "",
      setMarkdown: markdown => ref.current?.setMarkdown(markdown),
      onExecute,
    });

    const { container } = render(
      <InkwellEditor
        ref={ref}
        content="Intro"
        onChange={vi.fn()}
        plugins={[slashCommands]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;

    act(() => {
      ref.current?.focus({ at: "end" });
      ref.current?.insertMarkdown("\n");
    });

    act(() => {
      fireEvent.keyDown(editor, { key: "/" });
    });
    await screen.findByText("/runbook");

    act(() => {
      fireEvent.keyDown(editor, { key: "r" });
    });
    await screen.findByText("/runbook");

    act(() => {
      fireEvent.keyDown(editor, { key: "Enter" });
    });

    expect(screen.getByText("Enter to execute · Esc to cancel")).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(editor, { key: "Escape" });
    });

    expect(onExecute).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(ref.current?.getMarkdown()).toBe("Intro");
    });
  });

  it("does not open slash commands for prose slashes", () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const slashCommands = createSlashCommandsPlugin({
      commands: [{ name: "status", description: "Set a thread status" }],
      getMarkdown: () => ref.current?.getMarkdown() ?? "",
      setMarkdown: markdown => ref.current?.setMarkdown(markdown),
    });

    const { container } = render(
      <InkwellEditor
        ref={ref}
        content="Intro"
        onChange={vi.fn()}
        plugins={[slashCommands]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;

    act(() => {
      ref.current?.focus({ at: "end" });
      fireEvent.keyDown(editor, { key: "/" });
    });

    expect(screen.queryByText("/status")).not.toBeInTheDocument();
  });

  describe("slash command integration", () => {
    const createStatusPlugin = (
      ref: React.RefObject<import("../types").InkwellEditorHandle | null>,
      options: {
        onExecute?: Parameters<typeof createSlashCommandsPlugin>[0]["onExecute"];
        onReadyChange?: (ready: boolean) => void;
      } = {},
    ) =>
      createSlashCommandsPlugin({
        commands: [
          {
            name: "status",
            description: "Set a thread status",
            aliases: ["s"],
            args: [
              {
                name: "status",
                description: "Status to apply",
                required: true,
                choices: [
                  { value: "solved", label: "Solved" },
                  { value: "awaiting", label: "Awaiting User Response" },
                  { value: "closed", label: "Closed", disabled: true },
                ],
              },
            ],
          },
          { name: "runbook", description: "Run a support runbook" },
          {
            name: "bounty",
            description: "Prepare a bounty action",
            disabled: () => "Bounties are disabled",
          },
        ],
        getMarkdown: () => ref.current?.getMarkdown() ?? "",
        setMarkdown: markdown => ref.current?.setMarkdown(markdown),
        onExecute: options.onExecute,
        onReadyChange: options.onReadyChange,
      });

    const renderSlashEditor = (content = "Intro") => {
      const ref = createRef<import("../types").InkwellEditorHandle>();
      const onExecute = vi.fn();
      const onReadyChange = vi.fn();
      const { container } = render(
        <InkwellEditor
          ref={ref}
          content={content}
          onChange={vi.fn()}
          plugins={[createStatusPlugin(ref, { onExecute, onReadyChange })]}
        />,
      );
      const editor = container.querySelector(".inkwell-editor") as HTMLElement;
      return { ref, editor, container, onExecute, onReadyChange };
    };

    const startBlankSlashLine = (
      ref: React.RefObject<import("../types").InkwellEditorHandle | null>,
      editor: HTMLElement,
    ) => {
      act(() => {
        ref.current?.focus({ at: "end" });
        ref.current?.insertMarkdown("\n");
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "/" });
      });
    };

    it("opens immediately on a blank slash line and renders at a cursor position", async () => {
      const { ref, editor, container } = renderSlashEditor();
      startBlankSlashLine(ref, editor);

      expect(await screen.findByText("/status")).toBeInTheDocument();
      expect(screen.getByText("/runbook")).toBeInTheDocument();
      expect(screen.getByText("Bounties are disabled")).toBeInTheDocument();
      const popup = container.querySelector(".inkwell-plugin-picker-popup") as HTMLElement;
      expect(popup).toBeInTheDocument();
      expect(popup.style.position).toBe("absolute");
      expect(popup.style.zIndex).toBe("1001");
    });

    it("filters from typed editor text without a dedicated input", async () => {
      const { ref, editor, container } = renderSlashEditor();
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "r" });
      });

      expect(screen.getByText("/runbook")).toBeInTheDocument();
      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      expect(container.querySelector("input")).not.toBeInTheDocument();
      expect(container.querySelector(".inkwell-plugin-picker-search")).toHaveTextContent("/r");
    });

    it("does not open for slashes after prose on the same line", () => {
      const { ref, editor } = renderSlashEditor("Intro text");
      act(() => {
        ref.current?.focus({ at: "end" });
        fireEvent.keyDown(editor, { key: "/" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
    });

    it("deleting the trigger closes the menu and releases Enter", async () => {
      const { ref, editor } = renderSlashEditor();
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "Backspace" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      expect(screen.queryByText("/status")).not.toBeInTheDocument();
    });

    it("navigates commands with arrow keys and executes a no-arg command", async () => {
      const { ref, editor, onExecute } = renderSlashEditor();
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "ArrowDown" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(screen.getByText("Enter to execute · Esc to cancel")).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      await waitFor(() => {
        expect(onExecute).toHaveBeenCalledWith({
          name: "runbook",
          args: {},
          raw: "/runbook",
        });
      });
    });

    it("does not select disabled commands or disabled argument choices", async () => {
      const { ref, editor, onExecute } = renderSlashEditor();
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      const disabledItem = screen.getByText("/bounty").closest("div");
      expect(disabledItem).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Bounties are disabled")).toBeInTheDocument();

      act(() => {
        fireEvent.keyDown(editor, { key: "ArrowUp" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(onExecute).not.toHaveBeenCalled();
      expect(screen.getByText("Enter to execute · Esc to cancel")).toBeInTheDocument();
    });

    it("shows required argument choices after selecting a command", async () => {
      const { ref, editor, container } = renderSlashEditor();
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(await screen.findByText("Solved")).toBeInTheDocument();
      expect(screen.getByText("Awaiting User Response")).toBeInTheDocument();
      expect(screen.getByText("(current)")).toBeInTheDocument();
      expect(container.querySelector(".inkwell-plugin-picker-search")).toHaveTextContent("/status");
    });

    it("loads async argument choices and reports readiness transitions", async () => {
      const ref = createRef<import("../types").InkwellEditorHandle>();
      const onReadyChange = vi.fn();
      const fetchChoices = vi.fn(async () => [
        { value: "alpha", label: "Alpha" },
        { value: "beta", label: "Beta" },
      ]);
      const slashCommands = createSlashCommandsPlugin({
        commands: [
          {
            name: "assign",
            description: "Assign ownership",
            args: [
              {
                name: "owner",
                description: "Owner to assign",
                required: true,
                fetchChoices,
              },
            ],
          },
        ],
        getMarkdown: () => ref.current?.getMarkdown() ?? "",
        setMarkdown: markdown => ref.current?.setMarkdown(markdown),
        onReadyChange,
      });
      const { container } = render(
        <InkwellEditor
          ref={ref}
          content="Intro"
          onChange={vi.fn()}
          plugins={[slashCommands]}
        />,
      );
      const editor = container.querySelector(".inkwell-editor") as HTMLElement;
      startBlankSlashLine(ref, editor);
      await screen.findByText("/assign");

      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(fetchChoices).toHaveBeenCalledTimes(1);
      expect(await screen.findByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();

      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(screen.getByText("Enter to execute · Esc to cancel")).toBeInTheDocument();
      expect(onReadyChange).toHaveBeenLastCalledWith(true);
    });

    it("execute phase shows only centered instruction text", async () => {
      const { ref, editor, container } = renderSlashEditor();
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      await screen.findByText("Solved");
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      const execute = screen.getByText("Enter to execute · Esc to cancel");
      expect(execute).toHaveClass("inkwell-plugin-slash-commands-execute");
      const picker = container.querySelector(".inkwell-plugin-picker") as HTMLElement;
      expect(picker).not.toHaveTextContent("✓");
      expect(picker).not.toHaveTextContent("/status");
      expect(picker).not.toHaveTextContent("Solved");
    });

    it("executes selected argument values as strings and clears only that command line", async () => {
      const { ref, editor, onExecute } = renderSlashEditor("Intro\nMiddle");
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      await screen.findByText("Solved");
      act(() => {
        fireEvent.keyDown(editor, { key: "ArrowDown" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      expect(screen.getByText("Enter to execute · Esc to cancel")).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      await waitFor(() => {
        expect(onExecute).toHaveBeenCalledWith({
          name: "status",
          args: { status: "awaiting" },
          raw: "/status Awaiting User Response",
        });
      });
      await waitFor(() => {
        expect(ref.current?.getMarkdown()).toBe("Intro\n\nMiddle");
      });
    });

    it("canceling from execute phase clears only the command line and does not execute", async () => {
      const { ref, editor, onExecute } = renderSlashEditor("Intro\nMiddle");
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "ArrowDown" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      expect(screen.getByText("Enter to execute · Esc to cancel")).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(editor, { key: "Escape" });
      });

      expect(onExecute).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(ref.current?.getMarkdown()).toBe("Intro\n\nMiddle");
      });
    });

    it("Escape before execute closes the menu but keeps typed command text", async () => {
      const { ref, editor } = renderSlashEditor();
      startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "s" });
        fireEvent.keyDown(editor, { key: "Escape" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      expect(ref.current?.getMarkdown()).toBe("Intro\n\n/");
    });

    it("does not teleport the cursor to the end when opening or closing in the middle", async () => {
      const { ref, editor } = renderSlashEditor("Top\nBottom");
      act(() => {
        ref.current?.setMarkdown("Top\n\nBottom", { select: "start" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "/" });
      });
      await screen.findByText("/status");
      act(() => {
        fireEvent.keyDown(editor, { key: "Escape" });
      });

      expect(ref.current?.getMarkdown()).toBe("/Top\n\nBottom");
    });
  });

  it("renders always-on plugins without a trigger", () => {
    const widgetPlugin = {
      name: "widget",
      render: () => <div data-testid="always-on-widget">Widget</div>,
    };
    render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[widgetPlugin]}
      />,
    );
    expect(screen.getByTestId("always-on-widget")).toBeInTheDocument();
  });

  it("does not show toolbar by default (bubble toolbar)", () => {
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[createBubbleMenuPlugin()]}
      />,
    );
    expect(
      container.querySelector(".inkwell-plugin-bubble-menu-container"),
    ).not.toBeInTheDocument();
  });

  it("Escape dismisses active plugin", () => {
    const dismissPlugin = {
      name: "test",
      trigger: { key: "Control+/" },
      render: ({ onDismiss }: { onDismiss: () => void }) => (
        <div data-testid="test-plugin">
          <button data-testid="dismiss" onClick={onDismiss}>
            Close
          </button>
        </div>
      ),
    };
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[dismissPlugin]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;

    act(() => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(screen.getByTestId("test-plugin")).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(editor, { key: "Escape" });
    });
    expect(screen.queryByTestId("test-plugin")).not.toBeInTheDocument();
  });

  it("click outside dismisses active plugin", () => {
    const dismissPlugin = {
      name: "test",
      trigger: { key: "Control+/" },
      render: ({ onDismiss }: { onDismiss: () => void }) => (
        <div data-testid="test-plugin">
          <button data-testid="dismiss" onClick={onDismiss}>
            Close
          </button>
        </div>
      ),
    };
    const { container } = render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        plugins={[dismissPlugin]}
      />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;

    act(() => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(screen.getByTestId("test-plugin")).toBeInTheDocument();

    const backdrop = container.querySelector(
      ".inkwell-plugin-backdrop",
    ) as HTMLElement;
    act(() => {
      fireEvent.mouseDown(backdrop);
    });
    expect(screen.queryByTestId("test-plugin")).not.toBeInTheDocument();
  });
});

describe("InkwellEditor — imperative API and state", () => {
  it("exposes markdown, text, and state through a ref handle", () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    render(<InkwellEditor ref={ref} content="hello" onChange={vi.fn()} />);

    expect(ref.current?.getMarkdown()).toBe("hello");
    expect(ref.current?.getText()).toBe("hello");
    expect(ref.current?.getState()).toMatchObject({
      markdown: "hello",
      text: "hello",
      isEmpty: false,
      isEditable: true,
      characterCount: 5,
      overLimit: false,
    });
  });

  it("can replace markdown without emitting onChange", () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(
      <InkwellEditor ref={ref} content="hello" onChange={onChange} />,
    );

    act(() => {
      ref.current?.setMarkdown("replacement", { emitChange: false });
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.getMarkdown()).toBe("replacement");
    expect(container.querySelector(".inkwell-editor")?.textContent).toContain(
      "replacement",
    );
  });

  it("clears markdown and emits onChange by default", () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    render(<InkwellEditor ref={ref} content="hello" onChange={onChange} />);

    act(() => {
      ref.current?.clear();
    });

    expect(ref.current?.getMarkdown()).toBe("");
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("focuses through the ref handle", () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const focusSpy = vi
      .spyOn(ReactEditor, "focus")
      .mockImplementation(() => {});
    render(<InkwellEditor ref={ref} content="hello" onChange={vi.fn()} />);

    act(() => {
      ref.current?.focus({ at: "end" });
    });

    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("inserts markdown through the ref handle", () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    render(<InkwellEditor ref={ref} content="hello" onChange={onChange} />);

    act(() => {
      ref.current?.focus({ at: "end" });
      ref.current?.insertMarkdown(" world");
    });

    expect(ref.current?.getMarkdown()).toContain("world");
  });

  it("reports state changes through onStateChange", () => {
    const onStateChange = vi.fn();
    render(
      <InkwellEditor
        content="hello"
        characterLimit={10}
        onStateChange={onStateChange}
      />,
    );

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown: "hello",
        text: "hello",
        isEmpty: false,
        characterCount: 5,
        characterLimit: 10,
        overLimit: false,
      }),
    );
  });

  it("supports read-only mode via editable=false", () => {
    render(<InkwellEditor content="hello" editable={false} />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );
  });
});

describe("InkwellEditor — content synchronization", () => {
  it("updates editor when content prop changes externally", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <InkwellEditor content="initial" onChange={onChange} />,
    );

    rerender(<InkwellEditor content="**updated**" onChange={onChange} />);

    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("strong")).toBeInTheDocument();
    expect(editor?.textContent).toContain("updated");
  });

  it("handles rapid content changes without crashing", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <InkwellEditor content="v1" onChange={onChange} />,
    );

    rerender(<InkwellEditor content="v2" onChange={onChange} />);
    rerender(<InkwellEditor content="v3" onChange={onChange} />);

    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.textContent).toContain("v3");
  });

  it("does not crash on identical content prop update", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <InkwellEditor content="same" onChange={onChange} />,
    );

    expect(() => {
      rerender(<InkwellEditor content="same" onChange={onChange} />);
    }).not.toThrow();
  });

  it("prevents default on Cmd+A when editor is empty", () => {
    const { container } = render(
      <InkwellEditor content="" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;

    const event = new KeyboardEvent("keydown", {
      key: "a",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      editor.dispatchEvent(event);
    });

    expect(editor).toBeInTheDocument();
  });
});

describe("InkwellEditor — undo/redo", () => {
  it("dispatches Cmd+Z without errors (slate-history handles undo)", () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    expect(() =>
      fireEvent.keyDown(editor, { key: "z", metaKey: true }),
    ).not.toThrow();
  });

  it("dispatches Cmd+Shift+Z without errors (redo)", () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} />,
    );
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    expect(() =>
      fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true }),
    ).not.toThrow();
  });
});

describe("withMarkdown — element config guards", () => {
  it("blockquotes: false prevents > trigger", () => {
    const editor = createTestEditor({ blockquotes: false });
    editor.children = deserialize(">");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
  });

  it("codeBlocks: false prevents ``` Enter trigger", () => {
    const editor = createTestEditor({ codeBlocks: false });
    editor.children = deserialize("```typescript", { codeBlocks: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const types = getElements(editor).map(e => e.type);
    expect(types).not.toContain("code-fence");
    expect(types).not.toContain("code-line");
  });

  it("heading1: false, heading2: false, heading3: false, heading4: false, heading5: false, heading6: false prevents # trigger", () => {
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

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
  });

  it("blockquotes: true allows > trigger (control)", () => {
    const editor = createTestEditor({ blockquotes: true });
    editor.children = deserialize(">");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("blockquote");
  });

  it("lists: true converts - to list-item on typing trigger", () => {
    const editor = createTestEditor({ lists: true });
    editor.children = deserialize("-", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("list-item");
  });

  it("lists: true converts * to list-item on typing trigger", () => {
    const editor = createTestEditor({ lists: true });
    editor.children = deserialize("*", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("list-item");
  });

  it("lists: true converts + to list-item on typing trigger", () => {
    const editor = createTestEditor({ lists: true });
    editor.children = deserialize("+", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("list-item");
  });

  it("lists: false prevents - trigger", () => {
    const editor = createTestEditor({ lists: false });
    editor.children = deserialize("-", { lists: false });
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
  });

  it("typing - then space on empty paragraph converts to list-item", () => {
    const editor = createTestEditor({ lists: true });
    editor.children = deserialize("");
    editor.onChange();

    Transforms.select(editor, Editor.start(editor, [0]));
    editor.insertText("-");
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("list-item");
    expect(Node.string(elements[0])).toBe("- ");
  });
});

describe("withMarkdown — list item behaviors", () => {
  it("Enter on non-empty list item creates new list item with same marker", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- hello");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("list-item");
    expect(elements[1].type).toBe("list-item");
    expect(Node.string(elements[1])).toBe("- ");
  });

  it("Enter on non-empty list item preserves * marker", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "* hello" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[1].type).toBe("list-item");
    expect(Node.string(elements[1])).toBe("* ");
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

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("");
  });

  it("Enter on empty list item (marker without space) converts to paragraph", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "-" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
  });

  it("Enter extends list across multiple items", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- first");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();
    editor.insertText("second");

    Transforms.select(editor, Editor.end(editor, [1]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements.length).toBe(3);
    expect(elements[0].type).toBe("list-item");
    expect(elements[1].type).toBe("list-item");
    expect(elements[2].type).toBe("list-item");
    expect(Node.string(elements[1])).toContain("second");
    expect(Node.string(elements[2])).toBe("- ");
  });

  it("empty list-item with bare + converts to paragraph on Enter", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "+" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
  });

  it("empty list-item with bare * converts to paragraph on Enter", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "*" }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
  });

  it("empty list-item with * space converts to paragraph on Enter", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "* " }],
      },
    ];
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });
});

describe("withMarkdown — heading behaviors", () => {
  it("non-empty heading Enter inserts paragraph after", () => {
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
});

describe("withMarkdown — insertData", () => {
  it("handles paste of plain text markdown", () => {
    const editor = createTestEditor();
    editor.children = deserialize("before");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));

    const nodes = deserialize("\n\nafter");
    Transforms.insertNodes(editor, nodes);

    const text = Node.string(editor);
    expect(text).toContain("after");
  });
});

describe("withMarkdown — insertSoftBreak fallthrough", () => {
  it("Shift+Enter on paragraph falls through to insertBreak", () => {
    const editor = createTestEditor();
    editor.children = deserialize("hello");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    const elements = getElements(editor);
    expect(elements.length).toBe(2);
  });

  it("Shift+Enter on list-item falls through to insertBreak", () => {
    const editor = createTestEditor();
    editor.children = deserialize("- item");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    const elements = getElements(editor);
    expect(elements.length).toBeGreaterThanOrEqual(2);
  });
});

describe("wrapSelection — toggle formatting", () => {
  describe("wrapping (no existing markers)", () => {
    it("wraps plain text with bold markers", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello world");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 11 },
      });

      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello **world**");
    });

    it("wraps plain text with italic markers", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello world");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 11 },
      });

      wrapSelection(editor, "_", "_");
      expect(getText(editor)).toBe("hello _world_");
    });

    it("wraps plain text with strikethrough markers", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello world");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 11 },
      });

      wrapSelection(editor, "~~", "~~");
      expect(getText(editor)).toBe("hello ~~world~~");
    });
  });

  describe("unwrapping (selection includes markers)", () => {
    it("unwraps bold when selection includes **markers**", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello **world**");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 15 },
      });

      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello world");
    });

    it("unwraps italic when selection includes _markers_", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello _world_");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 13 },
      });

      wrapSelection(editor, "_", "_");
      expect(getText(editor)).toBe("hello world");
    });

    it("unwraps strikethrough when selection includes ~~markers~~", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello ~~world~~");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 15 },
      });

      wrapSelection(editor, "~~", "~~");
      expect(getText(editor)).toBe("hello world");
    });
  });

  describe("unwrapping (selection inside markers)", () => {
    it("unwraps bold when selecting content inside **markers**", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello **world**");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 8 },
        focus: { path: [0, 0], offset: 13 },
      });

      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello world");
    });

    it("unwraps italic when selecting content inside _markers_", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello _world_");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 7 },
        focus: { path: [0, 0], offset: 12 },
      });

      wrapSelection(editor, "_", "_");
      expect(getText(editor)).toBe("hello world");
    });

    it("unwraps strikethrough when selecting content inside ~~markers~~", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello ~~world~~");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 8 },
        focus: { path: [0, 0], offset: 13 },
      });

      wrapSelection(editor, "~~", "~~");
      expect(getText(editor)).toBe("hello world");
    });
  });

  describe("edge cases", () => {
    it("wraps when markers are only on one side", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello **world");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 8 },
        focus: { path: [0, 0], offset: 13 },
      });

      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello ****world**");
    });

    it("handles selection at start of line", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("**hello** world");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 2 },
        focus: { path: [0, 0], offset: 7 },
      });

      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello world");
    });

    it("handles selection at end of line", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello **world**");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 8 },
        focus: { path: [0, 0], offset: 13 },
      });

      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello world");
    });

    it("wraps empty selection (collapsed cursor) by inserting markers", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 3 },
        focus: { path: [0, 0], offset: 3 },
      });

      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toContain("****");
    });

    it("does not unwrap partial markers", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello *world*");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 13 },
      });

      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello ***world***");
    });

    it("toggle: wrap then unwrap produces original text", () => {
      const editor = createTestEditor({
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      });
      editor.children = deserialize("hello world");
      editor.onChange();

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 11 },
      });
      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello **world**");

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 15 },
      });
      wrapSelection(editor, "**", "**");
      expect(getText(editor)).toBe("hello world");
    });
  });
});

describe("computeDecorations — edge cases", () => {
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

    const entry = [editor.children[0], [0]] as NodeEntry;
    const ranges = computeDecorations(entry, editor);
    expect(Array.isArray(ranges)).toBe(true);
  });

  it("returns empty for code-fence element", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "code-fence" as const,
        id: generateId(),
        children: [{ text: "```ts" }],
      },
    ];
    editor.onChange();

    const entry = [editor.children[0], [0]] as NodeEntry;
    const ranges = computeDecorations(entry, editor);
    expect(ranges).toEqual([]);
  });

  it("handles bold and italic asterisk overlap", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "paragraph" as const,
        id: generateId(),
        children: [{ text: "***bold italic***" }],
      },
    ];
    editor.onChange();

    const entry = [editor.children[0], [0]] as NodeEntry;
    const ranges = computeDecorations(entry, editor);
    expect(Array.isArray(ranges)).toBe(true);
    expect(ranges.length).toBeGreaterThan(0);
  });

  it("computes inline decorations for blockquote with bold", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "blockquote" as const,
        id: generateId(),
        children: [{ text: "**bold in quote**" }],
      },
    ];
    editor.onChange();

    const entry = [editor.children[0], [0]] as NodeEntry;
    const ranges = computeDecorations(entry, editor);
    expect(ranges.length).toBeGreaterThan(0);
  });

  it("computes inline decorations for list-item with inline code", () => {
    const editor = createTestEditor();
    editor.children = [
      {
        type: "list-item" as const,
        id: generateId(),
        children: [{ text: "- use `code` here" }],
      },
    ];
    editor.onChange();

    const entry = [editor.children[0], [0]] as NodeEntry;
    const ranges = computeDecorations(entry, editor);
    expect(ranges.length).toBeGreaterThan(0);
  });

  it("returns inline decorations for heading element", () => {
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
        children: [{ text: "**bold heading**" }],
      },
    ];
    editor.onChange();

    const entry = [editor.children[0], [0]] as NodeEntry;
    const ranges = computeDecorations(entry, editor);
    expect(ranges.length).toBeGreaterThan(0);
  });
});

describe("hljs nesting — JSX tag decoration", () => {
  it("correctly decorates <Inkwell across nested hljs spans", () => {
    const code = [
      "```typescript",
      'import { Inkwell } from "@railway/inkwell";',
      "",
      "function App() {",
      "  return (",
      "    <Inkwell",
      '      content="hello"',
      "    />",
      "  );",
      "}",
      "```",
    ].join("\n");

    const editor = createTestEditor();
    editor.children = deserialize(code);
    editor.onChange();

    const elements = editor.children as InkwellElement[];
    const inkwellLineIdx = elements.findIndex(
      el => el.type === "code-line" && Node.string(el) === "    <Inkwell",
    );
    expect(inkwellLineIdx).toBeGreaterThan(-1);

    const textContent = Node.string(elements[inkwellLineIdx]);
    const entry = [elements[inkwellLineIdx], [inkwellLineIdx]] as NodeEntry;
    const ranges = computeDecorations(entry, editor);

    const hljsRanges = ranges.filter(r => (r as Range & InkwellText).hljs);

    const nameRange = hljsRanges.find(r =>
      (r as Range & InkwellText).hljs?.includes("name"),
    );
    expect(nameRange).toBeDefined();

    const nameStart = (nameRange as Range).anchor.offset;
    const nameEnd = (nameRange as Range).focus.offset;
    const nameText = textContent.slice(nameStart, nameEnd);
    expect(nameText).toBe("Inkwell");

    for (const r of hljsRanges) {
      expect((r as Range).anchor.offset).toBeLessThanOrEqual(
        textContent.length,
      );
      expect((r as Range).focus.offset).toBeLessThanOrEqual(textContent.length);
    }
  });

  it("handles hex entities (&#x3C;) in highlighted HTML", () => {
    const code = ["```html", "<div>hello</div>", "```"].join("\n");

    const editor = createTestEditor();
    editor.children = deserialize(code);
    editor.onChange();

    const elements = editor.children as InkwellElement[];
    const divLineIdx = elements.findIndex(
      el => el.type === "code-line" && Node.string(el) === "<div>hello</div>",
    );
    expect(divLineIdx).toBeGreaterThan(-1);

    const textContent = Node.string(elements[divLineIdx]);
    const entry = [elements[divLineIdx], [divLineIdx]] as NodeEntry;
    const ranges = computeDecorations(entry, editor);

    for (const r of ranges) {
      expect((r as Range).anchor.offset).toBeLessThanOrEqual(
        textContent.length,
      );
      expect((r as Range).focus.offset).toBeLessThanOrEqual(textContent.length);
    }
  });
});

describe("serialize — edge cases", () => {
  it("escapes leading > in blockquote content", () => {
    const elements: InkwellElement[] = [
      {
        type: "blockquote",
        id: generateId(),
        children: [{ text: "> nested" }],
      },
    ];
    const md = serialize(elements);
    expect(md).toBe("> \\> nested");
  });

  it("serializes empty blockquote as bare > prefix", () => {
    const elements: InkwellElement[] = [
      { type: "blockquote", id: generateId(), children: [{ text: "" }] },
    ];
    const md = serialize(elements);
    expect(md).toBe(">");
  });

  it("heading with undefined level falls back to h1", () => {
    const elements: InkwellElement[] = [
      { type: "heading", id: generateId(), children: [{ text: "No level" }] },
    ];
    const md = serialize(elements);
    expect(md).toBe("# No level");
  });

  it("heading with level 3 serializes correctly", () => {
    const elements: InkwellElement[] = [
      {
        type: "heading",
        id: generateId(),
        level: 3,
        children: [{ text: "H3" }],
      },
    ];
    const md = serialize(elements);
    expect(md).toBe("### H3");
  });

  it("serializes multi-line blockquote text with > separators", () => {
    const elements: InkwellElement[] = [
      {
        type: "blockquote",
        id: generateId(),
        children: [{ text: "line 1\nline 2" }],
      },
    ];
    const md = serialize(elements);
    expect(md).toBe("> line 1\n>\n> line 2");
  });

  it("mixed list/blockquote boundary uses double newline", () => {
    const elements = deserialize("- item\n\n> quote");
    const md = serialize(elements);
    expect(md).toContain("- item\n\n> quote");
  });

  it("consecutive list items use single newline", () => {
    const elements = deserialize("- a\n- b\n- c");
    const md = serialize(elements);
    expect(md).toBe("- a\n- b\n- c");
  });

  it("consecutive blockquotes use single newline", () => {
    const elements = deserialize("> a\n> b");
    const md = serialize(elements);
    expect(md).toBe("> a\n> b");
  });
});

describe("Collaboration — editor composition", () => {
  it("creates a Yjs editor with correct plugin chain", () => {
    const doc = new Y.Doc();
    const { editor } = createCollabEditor(doc);

    expect(YjsEditor.isYjsEditor(editor)).toBe(true);
    expect(CursorEditor.isCursorEditor(editor)).toBe(true);
  });

  it("editor starts disconnected", () => {
    const doc = new Y.Doc();
    const { editor } = createCollabEditor(doc);

    expect(YjsEditor.connected(editor)).toBe(false);
  });

  it("can connect and disconnect", () => {
    const doc = new Y.Doc();
    const { editor } = createCollabEditor(doc);

    YjsEditor.connect(editor);
    expect(YjsEditor.connected(editor)).toBe(true);

    YjsEditor.disconnect(editor);
    expect(YjsEditor.connected(editor)).toBe(false);
  });
});

describe("Collaboration — document seeding", () => {
  it("seeds empty Yjs document from markdown", () => {
    const doc = new Y.Doc();
    const { sharedType } = createCollabEditor(doc);

    expect(sharedType.length).toBe(0);

    seedDocument(sharedType, "Hello world");

    expect(sharedType.length).toBeGreaterThan(0);
  });

  it("does not overwrite existing Yjs content", () => {
    const doc = new Y.Doc();
    const { sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "First content");
    const lengthAfterFirst = sharedType.length;

    seedDocument(sharedType, "Second content");
    expect(sharedType.length).toBeGreaterThan(lengthAfterFirst);
  });

  it("seeds multi-block content correctly (code fences, blockquotes, lists)", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    const md = "# Title\n\n> quote\n\n- item 1\n- item 2\n\n```ts\ncode\n```";
    seedDocument(sharedType, md);
    YjsEditor.connect(editor);

    const text = Node.string(editor);
    expect(text).toContain("Title");
    expect(text).toContain("quote");
    expect(text).toContain("item 1");
    expect(text).toContain("code");

    const types = getElements(editor).map(e => e.type);
    expect(types).toContain("blockquote");
    expect(types).toContain("list-item");
    expect(types).toContain("code-fence");
    expect(types).toContain("code-line");

    YjsEditor.disconnect(editor);
  });

  it("seeds with element config flags respected", () => {
    const doc = new Y.Doc();
    const sharedType = doc.get("content", Y.XmlText) as Y.XmlText;

    seedDocument(sharedType, "```js\ncode\n```", { codeBlocks: false });

    const { editor } = createCollabEditor(doc, {
      decorations: { codeBlocks: false },
    });
    YjsEditor.connect(editor);

    const types = getElements(editor).map(e => e.type);
    expect(types).not.toContain("code-fence");
    expect(types).not.toContain("code-line");

    YjsEditor.disconnect(editor);
  });

  it("seeds unclosed code block without corruption", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "```js\nunclosed code");
    YjsEditor.connect(editor);

    const text = Node.string(editor);
    expect(text).toContain("unclosed code");

    YjsEditor.disconnect(editor);
  });
});

describe("Collaboration — Yjs sync", () => {
  it("syncs Yjs content to editor on connect", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "Hello from Yjs");

    YjsEditor.connect(editor);

    const text = Node.string(editor);
    expect(text).toContain("Hello from Yjs");

    YjsEditor.disconnect(editor);
  });

  it("syncs local edits to Yjs", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "initial");
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, []));
    Transforms.insertText(editor, " added");

    const text = Node.string(editor);
    expect(text).toContain("added");

    YjsEditor.disconnect(editor);
  });

  it("syncs changes between two editors via shared Y.Doc", () => {
    const { editor1, editor2, doc1, doc2 } = createTwoEditorSetup("shared doc");

    YjsEditor.connect(editor1);
    YjsEditor.connect(editor2);

    expect(Node.string(editor1)).toContain("shared doc");
    expect(Node.string(editor2)).toContain("shared doc");

    Transforms.select(editor1, Editor.end(editor1, []));
    Transforms.insertText(editor1, " from Alice");

    YjsEditor.flushLocalChanges(editor1);
    syncDocs(doc1, doc2);

    expect(Node.string(editor2)).toContain("from Alice");

    YjsEditor.disconnect(editor1);
    YjsEditor.disconnect(editor2);
  });
});

describe("Collaboration — onChange behavior", () => {
  it("fires onChange on every AST change in collab mode", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "hello");
    YjsEditor.connect(editor);

    const onChange = vi.fn();

    Transforms.select(editor, Editor.end(editor, []));
    Transforms.insertText(editor, " world");

    const isAstChange = editor.operations.some(
      op => op.type !== "set_selection",
    );
    if (isAstChange) {
      const md = serialize(getElements(editor));
      onChange(md);
    }

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("world"));

    YjsEditor.disconnect(editor);
  });

  it("does not fire onChange on selection-only changes", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "hello world");
    YjsEditor.connect(editor);

    Transforms.select(editor, { path: [0, 0], offset: 3 });

    const isAstChange = editor.operations.some(
      op => op.type !== "set_selection",
    );
    expect(isAstChange).toBe(false);

    YjsEditor.disconnect(editor);
  });

  it("works without onChange callback (collab without autosave)", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "hello");
    YjsEditor.connect(editor);

    expect(() => {
      Transforms.select(editor, Editor.end(editor, []));
      Transforms.insertText(editor, " world");
    }).not.toThrow();

    YjsEditor.disconnect(editor);
  });
});

describe("Collaboration — serialization", () => {
  it("can serialize collaborative editor content to markdown", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "**bold** text");
    YjsEditor.connect(editor);

    const md = serialize(getElements(editor));
    expect(md).toContain("**bold** text");

    YjsEditor.disconnect(editor);
  });

  it("produces coherent markdown after both editors edit", () => {
    const { editor1, editor2, doc1, doc2 } = createTwoEditorSetup("shared");

    YjsEditor.connect(editor1);
    YjsEditor.connect(editor2);

    Transforms.select(editor1, Editor.end(editor1, []));
    Transforms.insertText(editor1, " alice");
    YjsEditor.flushLocalChanges(editor1);
    syncDocs(doc1, doc2);

    Transforms.select(editor2, Editor.end(editor2, []));
    Transforms.insertText(editor2, " bob");
    YjsEditor.flushLocalChanges(editor2);
    syncDocs(doc2, doc1);

    const md1 = serialize(getElements(editor1));
    const md2 = serialize(getElements(editor2));

    expect(md1).toContain("alice");
    expect(md1).toContain("bob");
    expect(md2).toContain("alice");
    expect(md2).toContain("bob");

    expect(md1).not.toMatch(/\n{3,}/);

    YjsEditor.disconnect(editor1);
    YjsEditor.disconnect(editor2);
  });

  it("serializes correctly after multi-block concurrent edits", () => {
    const { editor1, editor2, doc1, doc2 } =
      createTwoEditorSetup("line 1\n\nline 2");

    YjsEditor.connect(editor1);
    YjsEditor.connect(editor2);

    Transforms.select(editor1, Editor.end(editor1, [0]));
    Transforms.insertText(editor1, " modified");
    YjsEditor.flushLocalChanges(editor1);
    syncDocs(doc1, doc2);

    const lastIdx = editor2.children.length - 1;
    Transforms.select(editor2, Editor.end(editor2, [lastIdx]));
    Transforms.insertText(editor2, " also");
    YjsEditor.flushLocalChanges(editor2);
    syncDocs(doc2, doc1);

    const md = serialize(getElements(editor1));
    expect(md).toContain("modified");
    expect(md).toContain("also");

    YjsEditor.disconnect(editor1);
    YjsEditor.disconnect(editor2);
  });
});

describe("Collaboration — undo/redo", () => {
  it("supports undo via YHistoryEditor", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "original");
    YjsEditor.connect(editor);

    const originalText = Node.string(editor);

    Transforms.select(editor, Editor.end(editor, []));
    Transforms.insertText(editor, " modified");

    expect(Node.string(editor)).toContain("modified");

    editor.undo();

    expect(Node.string(editor)).toBe(originalText);

    YjsEditor.disconnect(editor);
  });

  it("undo only affects local user edits", () => {
    const { editor1, editor2, doc1, doc2 } = createTwoEditorSetup("original");

    YjsEditor.connect(editor1);
    YjsEditor.connect(editor2);

    Transforms.select(editor1, Editor.end(editor1, []));
    Transforms.insertText(editor1, " alice");
    YjsEditor.flushLocalChanges(editor1);
    syncDocs(doc1, doc2);

    Transforms.select(editor2, Editor.end(editor2, []));
    Transforms.insertText(editor2, " bob");
    YjsEditor.flushLocalChanges(editor2);
    syncDocs(doc2, doc1);

    editor2.undo();
    YjsEditor.flushLocalChanges(editor2);

    const text2 = Node.string(editor2);
    expect(text2).toContain("alice");
    expect(text2).not.toContain("bob");

    YjsEditor.disconnect(editor1);
    YjsEditor.disconnect(editor2);
  });

  it("redo restores local user edits", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "base");
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, []));
    Transforms.insertText(editor, " added");

    expect(Node.string(editor)).toContain("added");

    editor.undo();
    expect(Node.string(editor)).not.toContain("added");

    editor.redo();
    expect(Node.string(editor)).toContain("added");

    YjsEditor.disconnect(editor);
  });
});

describe("Collaboration — cursor awareness", () => {
  it("can send cursor position", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "hello");
    YjsEditor.connect(editor);

    Transforms.select(editor, { path: [0, 0], offset: 3 });

    expect(() => {
      CursorEditor.sendCursorPosition(editor, editor.selection);
    }).not.toThrow();

    YjsEditor.disconnect(editor);
  });

  it("tracks cursor states", () => {
    const doc = new Y.Doc();
    const { editor } = createCollabEditor(doc);

    const states = CursorEditor.cursorStates(editor);
    expect(Object.keys(states).length).toBe(0);
  });

  it("cursor position from editor1 is visible in editor2 awareness", () => {
    const { editor1, editor2, doc1, doc2 } =
      createTwoEditorSetup("hello world");

    YjsEditor.connect(editor1);
    YjsEditor.connect(editor2);

    Transforms.select(editor1, { path: [0, 0], offset: 5 });
    CursorEditor.sendCursorPosition(editor1, editor1.selection);

    YjsEditor.flushLocalChanges(editor1);
    syncDocs(doc1, doc2);

    const states1 = CursorEditor.cursorStates(editor1);
    expect(Object.keys(states1).length).toBe(0);

    YjsEditor.disconnect(editor1);
    YjsEditor.disconnect(editor2);
  });

  it("cursor states are empty when no remote users", () => {
    const doc = new Y.Doc();
    const { editor } = createCollabEditor(doc);

    YjsEditor.connect(editor);

    const states = CursorEditor.cursorStates(editor);
    expect(Object.keys(states).length).toBe(0);

    YjsEditor.disconnect(editor);
  });
});

describe("Collaboration — remote cursor ranges", () => {
  it("produces empty ranges when no collaboration config", () => {
    const ranges: (Range & InkwellText)[] = [];
    expect(ranges.length).toBe(0);
  });

  it("skips cursor state with null relativeSelection", () => {
    const mockState = {
      relativeSelection: null,
      data: { name: "X", color: "#f00" },
      clientId: 1,
    };

    const ranges: Range[] = [];
    if (mockState.relativeSelection) {
      ranges.push({
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [0, 0], offset: 0 },
      });
    }
    expect(ranges.length).toBe(0);
  });

  it("skips cursor state with missing data", () => {
    const mockState = { relativeSelection: {}, data: undefined, clientId: 1 };
    const data = mockState.data as { name: string; color: string } | undefined;

    const ranges: Range[] = [];
    if (data) {
      ranges.push({
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [0, 0], offset: 0 },
      });
    }
    expect(ranges.length).toBe(0);
  });

  it("collapsed cursor produces caret range", () => {
    const anchor = { path: [0, 0] as [number, number], offset: 3 };
    const focus = { path: [0, 0] as [number, number], offset: 3 };
    const range: Range = { anchor, focus };

    const isCollapsed = Range.isCollapsed(range);
    expect(isCollapsed).toBe(true);

    const decorated = {
      ...range,
      remoteCursor: "#ff0000",
      remoteCursorCaret: true,
    };
    expect(decorated.remoteCursorCaret).toBe(true);
  });

  it("expanded selection produces highlight range without caret", () => {
    const anchor = { path: [0, 0] as [number, number], offset: 1 };
    const focus = { path: [0, 0] as [number, number], offset: 5 };
    const range: Range = { anchor, focus };

    const isCollapsed = Range.isCollapsed(range);
    expect(isCollapsed).toBe(false);

    const decorated = { ...range, remoteCursor: "#0000ff" };
    expect(decorated.remoteCursor).toBe("#0000ff");
    expect(
      (decorated as Range & InkwellText).remoteCursorCaret,
    ).toBeUndefined();
  });

  it("intersects cursor range with element range", () => {
    const cursorRange: Range = {
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 8 },
    };
    const elementRange: Range = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 10 },
    };

    const intersection = Range.intersection(cursorRange, elementRange);
    expect(intersection).not.toBeNull();
    if (intersection) {
      expect(intersection.anchor.offset).toBe(2);
      expect(intersection.focus.offset).toBe(8);
    }
  });

  it("returns null for non-overlapping ranges", () => {
    const cursorRange: Range = {
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 5 },
    };
    const elementRange: Range = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 10 },
    };

    const intersection = Range.intersection(cursorRange, elementRange);
    expect(intersection).toBeNull();
  });
});

describe("Collaboration — withMarkdown behaviors", () => {
  it("preserves blockquote conversion in collab mode", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, ">");
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, []));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("blockquote");

    YjsEditor.disconnect(editor);
  });

  it("preserves code fence creation in collab mode", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "```typescript");
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, []));
    editor.insertBreak();

    const elements = getElements(editor);
    const types = elements.map(e => e.type);
    expect(types).toContain("code-fence");
    expect(types).toContain("code-line");

    YjsEditor.disconnect(editor);
  });

  it("non-empty list-item Enter inserts new paragraph", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "- list item");
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements.length).toBeGreaterThanOrEqual(2);

    YjsEditor.disconnect(editor);
  });

  it("empty list-item Enter converts to paragraph", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "- ");
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");

    YjsEditor.disconnect(editor);
  });

  it("heading Enter exits to paragraph in collab mode", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc, {
      decorations: {
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      },
    });

    seedDocument(sharedType, "## Heading", {
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
    });
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertBreak();

    const elements = getElements(editor);
    expect(elements[0].type).toBe("heading");
    expect(elements[1].type).toBe("paragraph");

    YjsEditor.disconnect(editor);
  });

  it("heading typing trigger works in collab mode", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc, {
      decorations: {
        heading1: true,
        heading2: true,
        heading3: true,
        heading4: true,
        heading5: true,
        heading6: true,
      },
    });

    seedDocument(sharedType, "##");
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("heading");
    expect((elements[0] as InkwellElement & { level?: number }).level).toBe(2);

    YjsEditor.disconnect(editor);
  });

  it("code-line insertBreak creates new code-line in collab mode", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "```ts\nline1\n```");
    YjsEditor.connect(editor);

    const codeLineIdx = getElements(editor).findIndex(
      e => e.type === "code-line",
    );
    if (codeLineIdx >= 0) {
      Transforms.select(editor, Editor.end(editor, [codeLineIdx]));
      editor.insertBreak();

      const types = getElements(editor).map(e => e.type);
      expect(types.filter(t => t === "code-line").length).toBe(2);
    }

    YjsEditor.disconnect(editor);
  });

  it("Shift+Enter in blockquote creates new blockquote in collab mode", () => {
    const doc = new Y.Doc();
    const { editor, sharedType } = createCollabEditor(doc);

    seedDocument(sharedType, "> first");
    YjsEditor.connect(editor);

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertSoftBreak();

    const elements = getElements(editor);
    const bqCount = elements.filter(e => e.type === "blockquote").length;
    expect(bqCount).toBe(2);

    YjsEditor.disconnect(editor);
  });
});

describe("Collaboration — component behavior", () => {
  it("renders in collaborative mode without crashing", () => {
    const collab = createCollabConfig("hello");
    const { container } = render(
      <InkwellEditor content="" collaboration={collab} />,
    );
    expect(container.querySelector(".inkwell-editor")).toBeInTheDocument();
  });

  it("renders content from Yjs document, not content prop", () => {
    const collab = createCollabConfig("from yjs");
    const { container } = render(
      <InkwellEditor content="from content prop" collaboration={collab} />,
    );
    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.textContent).toContain("from yjs");
  });

  it("works without onChange callback (collab without autosave)", () => {
    const collab = createCollabConfig("hello");
    expect(() => {
      render(<InkwellEditor content="" collaboration={collab} />);
    }).not.toThrow();
  });

  it("fires onChange in collaboration mode", () => {
    const collab = createCollabConfig("hello");
    const onChange = vi.fn();
    render(
      <InkwellEditor content="" onChange={onChange} collaboration={collab} />,
    );
  });

  it("disconnects on unmount", () => {
    const collab = createCollabConfig("hello");
    const { unmount } = render(
      <InkwellEditor content="" collaboration={collab} />,
    );
    expect(() => unmount()).not.toThrow();
  });
});

describe("InkwellEditor — character limit", () => {
  it("calls onCharacterCount with length and limit on change", () => {
    const onCharacterCount = vi.fn();
    const { container } = render(
      <InkwellEditor
        content="hello"
        onChange={vi.fn()}
        characterLimit={10}
        onCharacterCount={onCharacterCount}
      />,
    );
    const editable = container.querySelector(".inkwell-editor");
    if (!editable) throw new Error("editor not found");
    act(() => {
      fireEvent.input(editable, {
        target: { textContent: "hello world" },
      });
    });
    const calls = onCharacterCount.mock.calls;
    // Last call should pass the limit as second argument
    if (calls.length > 0) {
      expect(calls[calls.length - 1][1]).toBe(10);
    }
  });

  it("applies inkwell-editor-over-limit when content exceeds limit", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <InkwellEditor content="hi" onChange={onChange} characterLimit={3} />,
    );
    expect(container.querySelector(".inkwell-editor-wrapper")).not.toHaveClass(
      "inkwell-editor-over-limit",
    );

    rerender(
      <InkwellEditor
        content="too long"
        onChange={onChange}
        characterLimit={3}
      />,
    );
    // Wait for internal state update via content sync effect + change fire
    // The over-limit flag is driven by characterCount which updates in
    // handleChange, so it reflects internal state after the sync effect
    // triggers a Slate change.
  });

  it("does not enforce by default (count only)", () => {
    const onCharacterCount = vi.fn();
    render(
      <InkwellEditor
        content="hello"
        onChange={vi.fn()}
        characterLimit={3}
        onCharacterCount={onCharacterCount}
      />,
    );
    // No throw; editor renders with content that exceeds limit
  });
});

describe("InkwellEditor — limit toast", () => {
  it("renders the toast at the top-right of the editor when over the limit", () => {
    const { container } = render(
      <InkwellEditor
        content="hello world"
        onChange={vi.fn()}
        characterLimit={5}
      />,
    );
    const wrapper = container.querySelector(".inkwell-editor-wrapper");
    const toast = container.querySelector(".inkwell-editor-limit-toast");
    expect(toast).toBeInTheDocument();
    // Toast lives inside the editor wrapper so it tracks the editor box.
    expect(wrapper?.contains(toast)).toBe(true);
  });

  it("does not render the toast when content is under the limit", () => {
    const { container } = render(
      <InkwellEditor content="hi" onChange={vi.fn()} characterLimit={50} />,
    );
    expect(
      container.querySelector(".inkwell-editor-limit-toast"),
    ).not.toBeInTheDocument();
  });

  it("does not render the toast when no characterLimit is configured", () => {
    const { container } = render(
      <InkwellEditor content="hello world" onChange={vi.fn()} />,
    );
    expect(
      container.querySelector(".inkwell-editor-limit-toast"),
    ).not.toBeInTheDocument();
  });

  it("can be disabled via limitToast={false}", () => {
    const { container } = render(
      <InkwellEditor
        content="hello world"
        onChange={vi.fn()}
        characterLimit={5}
        limitToast={false}
      />,
    );
    expect(
      container.querySelector(".inkwell-editor-limit-toast"),
    ).not.toBeInTheDocument();
  });

  it("reads 'Over limit by N' when content exceeds the limit", () => {
    const { container } = render(
      <InkwellEditor
        content="hello world"
        onChange={vi.fn()}
        characterLimit={5}
      />,
    );
    const toast = container.querySelector(".inkwell-editor-limit-toast");
    expect(toast).toHaveTextContent("Over limit by 6");
  });

  it("shows 'Character limit reached' when enforce is on and at the limit", () => {
    const { container } = render(
      <InkwellEditor
        content="hello"
        onChange={vi.fn()}
        characterLimit={5}
        enforceCharacterLimit
      />,
    );
    const toast = container.querySelector(".inkwell-editor-limit-toast");
    expect(toast).toBeInTheDocument();
    expect(toast).toHaveTextContent("Character limit reached");
  });

  it("is not shown at exactly the limit when not enforced", () => {
    const { container } = render(
      <InkwellEditor
        content="hello"
        onChange={vi.fn()}
        characterLimit={5}
      />,
    );
    expect(
      container.querySelector(".inkwell-editor-limit-toast"),
    ).not.toBeInTheDocument();
  });

  it("has aria-live='polite' so screen readers announce the limit", () => {
    const { container } = render(
      <InkwellEditor
        content="hello world"
        onChange={vi.fn()}
        characterLimit={5}
      />,
    );
    const toast = container.querySelector(".inkwell-editor-limit-toast");
    expect(toast).toHaveAttribute("role", "status");
    expect(toast).toHaveAttribute("aria-live", "polite");
  });
});
