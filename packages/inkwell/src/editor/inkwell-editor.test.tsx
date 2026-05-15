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
import {
  type AttachmentsHandle,
  createAttachmentsPlugin,
} from "../plugins/attachments";
import { createBubbleMenuPlugin } from "../plugins/bubble-menu";
import { createCompletionsPlugin } from "../plugins/completions";
import { createMentionsPlugin } from "../plugins/mentions";
import { createSlashCommandsPlugin } from "../plugins/slash-commands";
import type { PluginRenderProps, ResolvedInkwellFeatures } from "../types";
import { InkwellEditor } from "./inkwell-editor";
import { computeDecorations } from "./slate/decorations";
import { deserialize } from "./slate/deserialize";
import { serialize } from "./slate/serialize";
import type { InkwellElement, InkwellText } from "./slate/types";
import { withMarkdown } from "./slate/with-markdown";
import { generateId, withNodeId } from "./slate/with-node-id";

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

function getContent(editor: Editor): string {
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

/**
 * Flush queued effects + microtasks so React 19 + slate-react state
 * updates triggered after the initial mount land inside `act`. Without
 * this, slate-react's `setIsFocused(...)` useEffect (and similar) fires
 * after our render() returns and React warns about "not wrapped in
 * act(...)".
 *
 * Call this immediately after `render(...)` (or any imperative ref
 * action) when the test needs to wait for state to settle before
 * asserting.
 */
async function flushEffects(): Promise<void> {
  await act(async () => {});
}

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

  it("applies style to the editable surface", () => {
    render(
      <InkwellEditor
        content="test"
        onChange={vi.fn()}
        styles={{ editor: { minHeight: "480px", width: "100%" } }}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveStyle({
      minHeight: "480px",
      width: "100%",
    });
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
    expect(editor?.textContent).toBe("# Title");
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

  it("prefixes plugin placeholder text with the hint", async () => {
    render(
      <InkwellEditor
        content=""
        onChange={vi.fn()}
        plugins={[
          createCompletionsPlugin({
            getCompletion: () => "Suggested text",
            acceptHint: "[tab ↹]",
          }),
        ]}
      />,
    );
    await flushEffects();

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "data-placeholder",
      "[tab ↹]  Suggested text",
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

  it("preserves the > prefix in blockquote source content", () => {
    const { container } = render(
      <InkwellEditor content="> hello world" onChange={vi.fn()} />,
    );
    const bq = container.querySelector(".inkwell-editor-blockquote");
    expect(bq?.textContent).toBe("> hello world");
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
    activation: { type: "trigger" as const, key: "Control+/" },
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

  it("handles character-triggered plugins", () => {
    const charPlugin = {
      ...testPlugin,
      name: "char-test",
      activation: { type: "trigger" as const, key: "@" },
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

  it(
    "deletes the trigger plus all typed query chars from the document " +
      "when an item is selected (regression: rAF-deferred delete was reading " +
      "a query ref that dismiss() had already cleared)",
    async () => {
      const ref = createRef<import("../types").InkwellEditorHandle>();
      const onChange = vi.fn();
      const mentions = createMentionsPlugin({
        name: "users",
        trigger: "@",
        marker: "user",
        search: (query: string) =>
          [
            { id: "1", title: "Alice" },
            { id: "2", title: "Bob" },
          ].filter(u => u.title.toLowerCase().includes(query.toLowerCase())),
        renderItem: item => <span>{item.title}</span>,
      });

      const { container } = render(
        <InkwellEditor
          ref={ref}
          content="Hello "
          onChange={onChange}
          plugins={[mentions]}
        />,
      );
      const editor = container.querySelector(".inkwell-editor") as HTMLElement;
      await flushEffects();
      await act(async () => {
        ref.current?.focus({ at: "end" });
      });

      // Simulate real-browser typing: each printable keydown also lands
      // the corresponding character in the contenteditable. jsdom's
      // fireEvent doesn't do that, so insert the characters explicitly
      // alongside the keydown events that drive the picker state.
      await act(async () => {
        fireEvent.keyDown(editor, { key: "@" });
        ref.current?.insertContent("@");
      });
      await screen.findByText("Alice");

      await act(async () => {
        fireEvent.keyDown(editor, { key: "b" });
        ref.current?.insertContent("b");
      });
      await act(async () => {
        fireEvent.keyDown(editor, { key: "o" });
        ref.current?.insertContent("o");
      });
      await screen.findByText("Bob");

      // Pre-select assertion: the document currently contains the typed
      // chars verbatim.
      expect(ref.current?.getState().content).toBe("Hello @bo");

      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      await waitFor(() => {
        // After selection the trigger and query chars must be removed and
        // the mention marker inserted in their place — not appended.
        expect(ref.current?.getState().content).toBe("Hello @user[2]");
      });
    },
  );

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
          description: "Set a document status",
          arg: {
            name: "status",
            description: "Status to apply",
            choices: [
              { value: "solved", label: "Solved" },
              { value: "closed", label: "Closed" },
            ],
          },
        },
      ],
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
      ref.current?.insertContent("\n");
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

    expect(
      screen.getByText("Enter to execute · Esc to cancel"),
    ).toBeInTheDocument();

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
      expect(ref.current?.getState().content).toBe("Intro");
    });
  });

  it("clears the slash command line when canceling from the execute phase", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onExecute = vi.fn();
    const slashCommands = createSlashCommandsPlugin({
      commands: [{ name: "runbook", description: "Run a project runbook" }],
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
      ref.current?.insertContent("\n");
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

    expect(
      screen.getByText("Enter to execute · Esc to cancel"),
    ).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(editor, { key: "Escape" });
    });

    expect(onExecute).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(ref.current?.getState().content).toBe("Intro");
    });
  });

  it("does not open slash commands for prose slashes", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const slashCommands = createSlashCommandsPlugin({
      commands: [{ name: "status", description: "Set a document status" }],
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
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
      fireEvent.keyDown(editor, { key: "/" });
    });

    expect(screen.queryByText("/status")).not.toBeInTheDocument();
  });

  describe("slash command integration", () => {
    const createStatusPlugin = (
      ref: React.RefObject<import("../types").InkwellEditorHandle | null>,
      options: {
        onExecute?: Parameters<
          typeof createSlashCommandsPlugin
        >[0]["onExecute"];
        onReadyChange?: (ready: boolean) => void;
      } = {},
    ) =>
      createSlashCommandsPlugin({
        commands: [
          {
            name: "status",
            description: "Set a document status",
            aliases: ["s"],
            arg: {
              name: "status",
              description: "Status to apply",
              choices: [
                { value: "solved", label: "Solved" },
                { value: "awaiting", label: "Awaiting User Response" },
                { value: "closed", label: "Closed", disabled: true },
              ],
            },
          },
          { name: "runbook", description: "Run a project runbook" },
          {
            name: "bounty",
            description: "Prepare a bounty action",
            disabled: () => "Bounties are disabled",
          },
        ],
        onExecute: options.onExecute,
        onReadyChange: options.onReadyChange,
      });

    const renderSlashEditor = async (content = "Intro") => {
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
      // Flush slate-react's post-mount effects so the test's later state
      // changes don't trip React's act-warning when those effects finally
      // settle.
      await flushEffects();
      return { ref, editor, container, onExecute, onReadyChange };
    };

    const startBlankSlashLine = async (
      ref: React.RefObject<import("../types").InkwellEditorHandle | null>,
      editor: HTMLElement,
    ) => {
      await act(async () => {
        ref.current?.focus({ at: "end" });
        ref.current?.insertContent("\n");
      });
      await act(async () => {
        fireEvent.keyDown(editor, { key: "/" });
      });
    };

    it("opens immediately on a blank slash line and renders at a cursor position", async () => {
      const { ref, editor, container } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);

      expect(await screen.findByText("/status")).toBeInTheDocument();
      expect(screen.getByText("/runbook")).toBeInTheDocument();
      expect(screen.getByText("Bounties are disabled")).toBeInTheDocument();
      const listbox = screen.getByRole("listbox");
      const options = screen.getAllByRole("option");
      expect(listbox).toHaveAttribute(
        "aria-activedescendant",
        options[0]?.getAttribute("id") ?? "",
      );
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(options[1]).toHaveAttribute("aria-selected", "false");
      const popup = container.querySelector(
        ".inkwell-plugin-picker-popup",
      ) as HTMLElement;
      expect(popup).toBeInTheDocument();
      expect(popup.style.position).toBe("absolute");
      expect(popup.style.zIndex).toBe("1001");
    });

    it("filters from typed editor text without a dedicated input", async () => {
      const { ref, editor, container } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "r" });
      });

      expect(screen.getByText("/runbook")).toBeInTheDocument();
      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      expect(container.querySelector("input")).not.toBeInTheDocument();
      expect(
        container.querySelector(".inkwell-plugin-picker-search"),
      ).toHaveTextContent("/r");
    });

    it("does not open for slashes after prose on the same line", async () => {
      const { ref, editor } = await renderSlashEditor("Intro text");
      await act(async () => {
        ref.current?.focus({ at: "end" });
        fireEvent.keyDown(editor, { key: "/" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
    });

    it("deleting the trigger closes the menu and releases Enter", async () => {
      const { ref, editor } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
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
      const { ref, editor, onExecute } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "ArrowDown" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
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
      const { ref, editor, onExecute } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      const disabledItem = screen.getByText("/bounty").closest("div");
      expect(disabledItem).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Bounties are disabled")).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(editor, { key: "ArrowUp" });
      });
      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(onExecute).not.toHaveBeenCalled();
      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
    });

    it("shows argument choices after selecting a command", async () => {
      const { ref, editor, container } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(await screen.findByText("Solved")).toBeInTheDocument();
      expect(screen.getByText("Awaiting User Response")).toBeInTheDocument();
      expect(screen.getByText("(current)")).toBeInTheDocument();
      expect(
        container.querySelector(".inkwell-plugin-picker-search"),
      ).toHaveTextContent("/status");
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
            arg: {
              name: "owner",
              description: "Owner to assign",
              fetchChoices,
            },
          },
        ],
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
      await flushEffects();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/assign");

      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(fetchChoices).toHaveBeenCalledTimes(1);
      expect(await screen.findByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
      expect(onReadyChange).toHaveBeenLastCalledWith(true);
    });

    it("execute phase shows only centered instruction text", async () => {
      const { ref, editor, container } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      await screen.findByText("Solved");
      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      const execute = screen.getByText("Enter to execute · Esc to cancel");
      expect(execute).toHaveClass("inkwell-plugin-slash-commands-execute");
      const picker = container.querySelector(
        ".inkwell-plugin-picker",
      ) as HTMLElement;
      expect(picker).not.toHaveTextContent("✓");
      expect(picker).not.toHaveTextContent("/status");
      expect(picker).not.toHaveTextContent("Solved");
    });

    it("executes selected argument values as strings and clears only that command line", async () => {
      const { ref, editor, onExecute } =
        await renderSlashEditor("Intro\nMiddle");
      await startBlankSlashLine(ref, editor);
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
      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
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
        expect(ref.current?.getState().content).toBe("Intro\n\nMiddle");
      });
    });

    it("canceling from execute phase clears only the command line and does not execute", async () => {
      const { ref, editor, onExecute } =
        await renderSlashEditor("Intro\nMiddle");
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "ArrowDown" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(editor, { key: "Escape" });
      });

      expect(onExecute).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(ref.current?.getState().content).toBe("Intro\n\nMiddle");
      });
    });

    it("Escape before execute closes the menu but keeps typed command text", async () => {
      const { ref, editor } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "s" });
        fireEvent.keyDown(editor, { key: "Escape" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      expect(ref.current?.getState().content).toBe("Intro\n\n/");
    });

    it("does not open before existing text on the same line", async () => {
      const { ref, editor } = await renderSlashEditor("Top\nBottom");
      act(() => {
        ref.current?.setContent("Top\n\nBottom", { select: "start" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "/" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      expect(ref.current?.getState().content).toBe("Top\n\nBottom");
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

  it("Escape dismisses active plugin", async () => {
    const dismissPlugin = {
      name: "test",
      activation: { type: "trigger" as const, key: "Control+/" },
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
    await flushEffects();

    await act(async () => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(screen.getByTestId("test-plugin")).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(editor, { key: "Escape" });
    });
    expect(screen.queryByTestId("test-plugin")).not.toBeInTheDocument();
  });

  it("click outside dismisses active plugin", async () => {
    const dismissPlugin = {
      name: "test",
      activation: { type: "trigger" as const, key: "Control+/" },
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
    await flushEffects();

    await act(async () => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(screen.getByTestId("test-plugin")).toBeInTheDocument();

    const backdrop = container.querySelector(
      ".inkwell-plugin-backdrop",
    ) as HTMLElement;
    await act(async () => {
      fireEvent.mouseDown(backdrop);
    });
    expect(screen.queryByTestId("test-plugin")).not.toBeInTheDocument();
  });
});

describe("InkwellEditor — imperative API and state", () => {
  it("exposes content and state through a ref handle", () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    render(<InkwellEditor ref={ref} content="hello" onChange={vi.fn()} />);

    expect(ref.current?.getState().content).toBe("hello");
    expect(ref.current?.getState()).toMatchObject({
      content: "hello",
      isEmpty: false,
      isEditable: true,
      characterCount: 5,
    });
  });

  it("can replace content without emitting onChange", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(
      <InkwellEditor ref={ref} content="hello" onChange={onChange} />,
    );
    await flushEffects();

    await act(async () => {
      ref.current?.setContent("replacement");
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.getState().content).toBe("replacement");
    expect(container.querySelector(".inkwell-editor")?.textContent).toContain(
      "replacement",
    );
  });

  it("clears content without emitting onChange", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    render(<InkwellEditor ref={ref} content="hello" onChange={onChange} />);
    await flushEffects();

    await act(async () => {
      ref.current?.clear();
    });

    expect(ref.current?.getState().content).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("focuses through the ref handle", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const focusSpy = vi
      .spyOn(ReactEditor, "focus")
      .mockImplementation(() => {});
    render(<InkwellEditor ref={ref} content="hello" onChange={vi.fn()} />);
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
    });

    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("inserts content through the ref handle", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    render(<InkwellEditor ref={ref} content="hello" onChange={onChange} />);
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
      ref.current?.insertContent(" world");
    });

    expect(ref.current?.getState().content).toContain("world");
  });

  it("does not change ordered list markers on Tab", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const { container } = render(
      <InkwellEditor ref={ref} content="1. item" onChange={vi.fn()} />,
    );
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
    });

    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(ref.current?.getState().content).toBe("1. item");
  });

  it("indents unordered list markers on Tab", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const { container } = render(
      <InkwellEditor ref={ref} content="- item" onChange={vi.fn()} />,
    );
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
    });

    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(ref.current?.getState().content).toBe("  - item");
  });

  it("indents bare unordered list markers on Tab", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const { container } = render(
      <InkwellEditor ref={ref} content="-" onChange={vi.fn()} />,
    );
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
    });

    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    const event = fireEvent.keyDown(editor, { key: "Tab" });

    expect(event).toBe(false);
    expect(ref.current?.getState().content).toBe("  -");
  });

  it("populates the attachments plugin ref after mount and routes upload() through it", async () => {
    const attachmentsRef: { current: AttachmentsHandle | null } = {
      current: null,
    };
    const onUpload = vi.fn(async () => "https://cdn/cat.png");
    const plugin = createAttachmentsPlugin({
      onUpload,
      ref: attachmentsRef,
    });

    const { container, unmount } = render(
      <InkwellEditor content="" plugins={[plugin]} />,
    );
    await flushEffects();

    expect(attachmentsRef.current).not.toBeNull();

    const file = new File(["data"], "cat.png", { type: "image/png" });
    await act(async () => {
      attachmentsRef.current?.upload([file]);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(onUpload).toHaveBeenCalledWith(file);
    const img = container.querySelector(".inkwell-editor img");
    expect(img).toHaveAttribute("src", "https://cdn/cat.png");

    unmount();
    expect(attachmentsRef.current).toBeNull();
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
        content: "hello",
        isEmpty: false,
        characterCount: 5,
        characterLimit: 10,
      }),
    );
  });

  it("handles read-only mode via editable=false", () => {
    render(<InkwellEditor content="hello" editable={false} />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );
  });
});

describe("InkwellEditor — content synchronization", () => {
  it("updates editor when content prop changes externally", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <InkwellEditor content="initial" onChange={onChange} />,
    );
    await flushEffects();

    await act(async () => {
      rerender(<InkwellEditor content="**updated**" onChange={onChange} />);
    });

    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("strong")).toBeInTheDocument();
    expect(editor?.textContent).toContain("updated");
  });

  it("handles rapid content changes without crashing", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <InkwellEditor content="v1" onChange={onChange} />,
    );
    await flushEffects();

    await act(async () => {
      rerender(<InkwellEditor content="v2" onChange={onChange} />);
      rerender(<InkwellEditor content="v3" onChange={onChange} />);
    });

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

  it("keeps list marker typing as paragraph text", () => {
    const editor = createTestEditor();
    editor.children = deserialize("-");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("- ");
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
        children: [{ text: "## Title" }],
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

  it("Shift+Enter on list marker text falls through to insertBreak", () => {
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
      expect(getContent(editor)).toBe("hello **world**");
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
      expect(getContent(editor)).toBe("hello _world_");
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
      expect(getContent(editor)).toBe("hello ~~world~~");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello ****world**");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toContain("****");
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
      expect(getContent(editor)).toBe("hello ***world***");
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
      expect(getContent(editor)).toBe("hello **world**");

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 15 },
      });
      wrapSelection(editor, "**", "**");
      expect(getContent(editor)).toBe("hello world");
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

  it("does not compute inline decorations for legacy list-item", () => {
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
    expect(ranges).toEqual([]);
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
    expect(md).toBe("> nested");
  });

  it("serializes empty blockquote as bare > prefix", () => {
    const elements: InkwellElement[] = [
      { type: "blockquote", id: generateId(), children: [{ text: "" }] },
    ];
    const md = serialize(elements);
    expect(md).toBe("");
  });

  it("heading with undefined level falls back to h1", () => {
    const elements: InkwellElement[] = [
      { type: "heading", id: generateId(), children: [{ text: "# No level" }] },
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
        children: [{ text: "### H3" }],
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
        children: [{ text: "> line 1\n>\n> line 2" }],
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

  it("consecutive list-like paragraphs use single newline", () => {
    const elements = deserialize("- a\n- b\n- c");
    const md = serialize(elements);
    expect(md).toBe("- a\n- b\n- c");
  });

  it("preserves nested unordered list source on round-trip", () => {
    const source = "- a\n  - b\n    - c\n      - d";
    expect(serialize(deserialize(source))).toBe(source);
  });

  it("preserves consecutive ordered list-like paragraphs on round-trip", () => {
    const source = "1. a\n2. b\n3. c";
    expect(serialize(deserialize(source))).toBe(source);
  });

  it("consecutive blockquotes use single newline", () => {
    const elements = deserialize("> a\n> b");
    const md = serialize(elements);
    expect(md).toBe("> a\n> b");
  });
});

describe("InkwellEditor — character limit", () => {
  it("calls onCharacterCount with length and limit on change", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onCharacterCount = vi.fn();
    render(
      <InkwellEditor
        ref={ref}
        content="hello"
        onChange={vi.fn()}
        characterLimit={20}
        onCharacterCount={onCharacterCount}
      />,
    );
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
      ref.current?.insertContent(" world");
    });

    await waitFor(() => {
      expect(onCharacterCount).toHaveBeenCalledWith(11, 20);
    });
  });

  it("renders the character count when a limit is set", async () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} characterLimit={20} />,
    );
    await flushEffects();

    expect(container.querySelector(".inkwell-editor-wrapper")).toHaveClass(
      "inkwell-editor-has-character-limit",
    );
    const count = container.querySelector(".inkwell-editor-character-count");
    expect(count).not.toBeNull();
    expect(count).toHaveTextContent("5 / 20");
    expect(count).not.toHaveClass("inkwell-editor-character-count-over");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not render the character count without a configured limit", async () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} />,
    );
    await flushEffects();

    expect(
      container.querySelector(".inkwell-editor-character-count"),
    ).toBeNull();
    expect(container.querySelector(".inkwell-editor-wrapper")).not.toHaveClass(
      "inkwell-editor-has-character-limit",
    );
  });

  it("paints the count and the wrapper as over-limit when count > limit", async () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} characterLimit={3} />,
    );
    await flushEffects();

    const count = container.querySelector(".inkwell-editor-character-count");
    expect(count).toHaveTextContent("5 / 3");
    expect(count).toHaveClass("inkwell-editor-character-count-over");
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "5 of 3 characters, over limit",
    );
    expect(container.querySelector(".inkwell-editor-wrapper")).toHaveClass(
      "inkwell-editor-over-limit",
    );
  });

  it("does not flag the wrapper as over-limit at exactly the limit", async () => {
    const { container } = render(
      <InkwellEditor content="hey" onChange={vi.fn()} characterLimit={3} />,
    );
    await flushEffects();

    expect(container.querySelector(".inkwell-editor-wrapper")).not.toHaveClass(
      "inkwell-editor-over-limit",
    );
  });

  it("allows initial content over the limit (soft limit)", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    render(
      <InkwellEditor
        ref={ref}
        content="hello world"
        onChange={vi.fn()}
        characterLimit={5}
      />,
    );
    await flushEffects();

    expect(ref.current?.getState()).toMatchObject({
      content: "hello world",
      characterCount: 11,
      characterLimit: 5,
      overLimit: true,
    });
  });

  it("allows setContent past the limit (soft limit)", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    render(
      <InkwellEditor
        ref={ref}
        content=""
        onChange={vi.fn()}
        characterLimit={4}
      />,
    );
    await flushEffects();

    await act(async () => {
      ref.current?.setContent("hello world");
    });

    expect(ref.current?.getState().content).toBe("hello world");
    expect(ref.current?.getState().characterCount).toBe(11);
    expect(ref.current?.getState().overLimit).toBe(true);
  });

  it("allows insertContent past the limit (soft limit)", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    render(
      <InkwellEditor
        ref={ref}
        content="hello"
        onChange={vi.fn()}
        characterLimit={7}
      />,
    );
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
      ref.current?.insertContent(" world");
    });

    expect(ref.current?.getState().content).toBe("hello world");
    expect(ref.current?.getState().overLimit).toBe(true);
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

  it("prefixes plugin placeholder text with the hint", async () => {
    render(
      <InkwellEditor
        content=""
        onChange={vi.fn()}
        plugins={[
          createCompletionsPlugin({
            getCompletion: () => "Suggested text",
            acceptHint: "[tab ↹]",
          }),
        ]}
      />,
    );
    await flushEffects();

    expect(screen.getByRole("textbox")).toHaveAttribute(
      "data-placeholder",
      "[tab ↹]  Suggested text",
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

  it("preserves the > prefix in blockquote source content", () => {
    const { container } = render(
      <InkwellEditor content="> hello world" onChange={vi.fn()} />,
    );
    const bq = container.querySelector(".inkwell-editor-blockquote");
    expect(bq?.textContent).toBe("> hello world");
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
    activation: { type: "trigger" as const, key: "Control+/" },
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

  it("handles character-triggered plugins", () => {
    const charPlugin = {
      ...testPlugin,
      name: "char-test",
      activation: { type: "trigger" as const, key: "@" },
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

  it(
    "deletes the trigger plus all typed query chars from the document " +
      "when an item is selected (regression: rAF-deferred delete was reading " +
      "a query ref that dismiss() had already cleared)",
    async () => {
      const ref = createRef<import("../types").InkwellEditorHandle>();
      const onChange = vi.fn();
      const mentions = createMentionsPlugin({
        name: "users",
        trigger: "@",
        marker: "user",
        search: (query: string) =>
          [
            { id: "1", title: "Alice" },
            { id: "2", title: "Bob" },
          ].filter(u => u.title.toLowerCase().includes(query.toLowerCase())),
        renderItem: item => <span>{item.title}</span>,
      });

      const { container } = render(
        <InkwellEditor
          ref={ref}
          content="Hello "
          onChange={onChange}
          plugins={[mentions]}
        />,
      );
      const editor = container.querySelector(".inkwell-editor") as HTMLElement;
      await flushEffects();
      await act(async () => {
        ref.current?.focus({ at: "end" });
      });

      // Simulate real-browser typing: each printable keydown also lands
      // the corresponding character in the contenteditable. jsdom's
      // fireEvent doesn't do that, so insert the characters explicitly
      // alongside the keydown events that drive the picker state.
      await act(async () => {
        fireEvent.keyDown(editor, { key: "@" });
        ref.current?.insertContent("@");
      });
      await screen.findByText("Alice");

      await act(async () => {
        fireEvent.keyDown(editor, { key: "b" });
        ref.current?.insertContent("b");
      });
      await act(async () => {
        fireEvent.keyDown(editor, { key: "o" });
        ref.current?.insertContent("o");
      });
      await screen.findByText("Bob");

      // Pre-select assertion: the document currently contains the typed
      // chars verbatim.
      expect(ref.current?.getState().content).toBe("Hello @bo");

      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      await waitFor(() => {
        // After selection the trigger and query chars must be removed and
        // the mention marker inserted in their place — not appended.
        expect(ref.current?.getState().content).toBe("Hello @user[2]");
      });
    },
  );

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
          description: "Set a document status",
          arg: {
            name: "status",
            description: "Status to apply",
            choices: [
              { value: "solved", label: "Solved" },
              { value: "closed", label: "Closed" },
            ],
          },
        },
      ],
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
      ref.current?.insertContent("\n");
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

    expect(
      screen.getByText("Enter to execute · Esc to cancel"),
    ).toBeInTheDocument();

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
      expect(ref.current?.getState().content).toBe("Intro");
    });
  });

  it("clears the slash command line when canceling from the execute phase", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onExecute = vi.fn();
    const slashCommands = createSlashCommandsPlugin({
      commands: [{ name: "runbook", description: "Run a project runbook" }],
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
      ref.current?.insertContent("\n");
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

    expect(
      screen.getByText("Enter to execute · Esc to cancel"),
    ).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(editor, { key: "Escape" });
    });

    expect(onExecute).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(ref.current?.getState().content).toBe("Intro");
    });
  });

  it("does not open slash commands for prose slashes", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const slashCommands = createSlashCommandsPlugin({
      commands: [{ name: "status", description: "Set a document status" }],
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
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
      fireEvent.keyDown(editor, { key: "/" });
    });

    expect(screen.queryByText("/status")).not.toBeInTheDocument();
  });

  describe("slash command integration", () => {
    const createStatusPlugin = (
      ref: React.RefObject<import("../types").InkwellEditorHandle | null>,
      options: {
        onExecute?: Parameters<
          typeof createSlashCommandsPlugin
        >[0]["onExecute"];
        onReadyChange?: (ready: boolean) => void;
      } = {},
    ) =>
      createSlashCommandsPlugin({
        commands: [
          {
            name: "status",
            description: "Set a document status",
            aliases: ["s"],
            arg: {
              name: "status",
              description: "Status to apply",
              choices: [
                { value: "solved", label: "Solved" },
                { value: "awaiting", label: "Awaiting User Response" },
                { value: "closed", label: "Closed", disabled: true },
              ],
            },
          },
          { name: "runbook", description: "Run a project runbook" },
          {
            name: "bounty",
            description: "Prepare a bounty action",
            disabled: () => "Bounties are disabled",
          },
        ],
        onExecute: options.onExecute,
        onReadyChange: options.onReadyChange,
      });

    const renderSlashEditor = async (content = "Intro") => {
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
      // Flush slate-react's post-mount effects so the test's later state
      // changes don't trip React's act-warning when those effects finally
      // settle.
      await flushEffects();
      return { ref, editor, container, onExecute, onReadyChange };
    };

    const startBlankSlashLine = async (
      ref: React.RefObject<import("../types").InkwellEditorHandle | null>,
      editor: HTMLElement,
    ) => {
      await act(async () => {
        ref.current?.focus({ at: "end" });
        ref.current?.insertContent("\n");
      });
      await act(async () => {
        fireEvent.keyDown(editor, { key: "/" });
      });
    };

    it("opens immediately on a blank slash line and renders at a cursor position", async () => {
      const { ref, editor, container } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);

      expect(await screen.findByText("/status")).toBeInTheDocument();
      expect(screen.getByText("/runbook")).toBeInTheDocument();
      expect(screen.getByText("Bounties are disabled")).toBeInTheDocument();
      const listbox = screen.getByRole("listbox");
      const options = screen.getAllByRole("option");
      expect(listbox).toHaveAttribute(
        "aria-activedescendant",
        options[0]?.getAttribute("id") ?? "",
      );
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(options[1]).toHaveAttribute("aria-selected", "false");
      const popup = container.querySelector(
        ".inkwell-plugin-picker-popup",
      ) as HTMLElement;
      expect(popup).toBeInTheDocument();
      expect(popup.style.position).toBe("absolute");
      expect(popup.style.zIndex).toBe("1001");
    });

    it("filters from typed editor text without a dedicated input", async () => {
      const { ref, editor, container } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "r" });
      });

      expect(screen.getByText("/runbook")).toBeInTheDocument();
      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      expect(container.querySelector("input")).not.toBeInTheDocument();
      expect(
        container.querySelector(".inkwell-plugin-picker-search"),
      ).toHaveTextContent("/r");
    });

    it("does not open for slashes after prose on the same line", async () => {
      const { ref, editor } = await renderSlashEditor("Intro text");
      await act(async () => {
        ref.current?.focus({ at: "end" });
        fireEvent.keyDown(editor, { key: "/" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
    });

    it("deleting the trigger closes the menu and releases Enter", async () => {
      const { ref, editor } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
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
      const { ref, editor, onExecute } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "ArrowDown" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
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
      const { ref, editor, onExecute } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      const disabledItem = screen.getByText("/bounty").closest("div");
      expect(disabledItem).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Bounties are disabled")).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(editor, { key: "ArrowUp" });
      });
      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(onExecute).not.toHaveBeenCalled();
      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
    });

    it("shows argument choices after selecting a command", async () => {
      const { ref, editor, container } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(await screen.findByText("Solved")).toBeInTheDocument();
      expect(screen.getByText("Awaiting User Response")).toBeInTheDocument();
      expect(screen.getByText("(current)")).toBeInTheDocument();
      expect(
        container.querySelector(".inkwell-plugin-picker-search"),
      ).toHaveTextContent("/status");
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
            arg: {
              name: "owner",
              description: "Owner to assign",
              fetchChoices,
            },
          },
        ],
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
      await flushEffects();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/assign");

      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(fetchChoices).toHaveBeenCalledTimes(1);
      expect(await screen.findByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();

      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
      expect(onReadyChange).toHaveBeenLastCalledWith(true);
    });

    it("execute phase shows only centered instruction text", async () => {
      const { ref, editor, container } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      await screen.findByText("Solved");
      await act(async () => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });

      const execute = screen.getByText("Enter to execute · Esc to cancel");
      expect(execute).toHaveClass("inkwell-plugin-slash-commands-execute");
      const picker = container.querySelector(
        ".inkwell-plugin-picker",
      ) as HTMLElement;
      expect(picker).not.toHaveTextContent("✓");
      expect(picker).not.toHaveTextContent("/status");
      expect(picker).not.toHaveTextContent("Solved");
    });

    it("executes selected argument values as strings and clears only that command line", async () => {
      const { ref, editor, onExecute } =
        await renderSlashEditor("Intro\nMiddle");
      await startBlankSlashLine(ref, editor);
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
      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
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
        expect(ref.current?.getState().content).toBe("Intro\n\nMiddle");
      });
    });

    it("canceling from execute phase clears only the command line and does not execute", async () => {
      const { ref, editor, onExecute } =
        await renderSlashEditor("Intro\nMiddle");
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "ArrowDown" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "Enter" });
      });
      expect(
        screen.getByText("Enter to execute · Esc to cancel"),
      ).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(editor, { key: "Escape" });
      });

      expect(onExecute).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(ref.current?.getState().content).toBe("Intro\n\nMiddle");
      });
    });

    it("Escape before execute closes the menu but keeps typed command text", async () => {
      const { ref, editor } = await renderSlashEditor();
      await startBlankSlashLine(ref, editor);
      await screen.findByText("/status");

      act(() => {
        fireEvent.keyDown(editor, { key: "s" });
        fireEvent.keyDown(editor, { key: "Escape" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      expect(ref.current?.getState().content).toBe("Intro\n\n/");
    });

    it("does not open before existing text on the same line", async () => {
      const { ref, editor } = await renderSlashEditor("Top\nBottom");
      act(() => {
        ref.current?.setContent("Top\n\nBottom", { select: "start" });
      });
      act(() => {
        fireEvent.keyDown(editor, { key: "/" });
      });

      expect(screen.queryByText("/status")).not.toBeInTheDocument();
      expect(ref.current?.getState().content).toBe("Top\n\nBottom");
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

  it("Escape dismisses active plugin", async () => {
    const dismissPlugin = {
      name: "test",
      activation: { type: "trigger" as const, key: "Control+/" },
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
    await flushEffects();

    await act(async () => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(screen.getByTestId("test-plugin")).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(editor, { key: "Escape" });
    });
    expect(screen.queryByTestId("test-plugin")).not.toBeInTheDocument();
  });

  it("click outside dismisses active plugin", async () => {
    const dismissPlugin = {
      name: "test",
      activation: { type: "trigger" as const, key: "Control+/" },
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
    await flushEffects();

    await act(async () => {
      fireEvent.keyDown(editor, { key: "/", ctrlKey: true });
    });
    expect(screen.getByTestId("test-plugin")).toBeInTheDocument();

    const backdrop = container.querySelector(
      ".inkwell-plugin-backdrop",
    ) as HTMLElement;
    await act(async () => {
      fireEvent.mouseDown(backdrop);
    });
    expect(screen.queryByTestId("test-plugin")).not.toBeInTheDocument();
  });
});

describe("InkwellEditor — imperative API and state", () => {
  it("exposes content and state through a ref handle", () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    render(<InkwellEditor ref={ref} content="hello" onChange={vi.fn()} />);

    expect(ref.current?.getState().content).toBe("hello");
    expect(ref.current?.getState()).toMatchObject({
      content: "hello",
      isEmpty: false,
      isEditable: true,
      characterCount: 5,
    });
  });

  it("can replace content without emitting onChange", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(
      <InkwellEditor ref={ref} content="hello" onChange={onChange} />,
    );
    await flushEffects();

    await act(async () => {
      ref.current?.setContent("replacement");
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.getState().content).toBe("replacement");
    expect(container.querySelector(".inkwell-editor")?.textContent).toContain(
      "replacement",
    );
  });

  it("clears content without emitting onChange", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    render(<InkwellEditor ref={ref} content="hello" onChange={onChange} />);
    await flushEffects();

    await act(async () => {
      ref.current?.clear();
    });

    expect(ref.current?.getState().content).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("focuses through the ref handle", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const focusSpy = vi
      .spyOn(ReactEditor, "focus")
      .mockImplementation(() => {});
    render(<InkwellEditor ref={ref} content="hello" onChange={vi.fn()} />);
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
    });

    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("inserts content through the ref handle", async () => {
    const ref = createRef<import("../types").InkwellEditorHandle>();
    const onChange = vi.fn();
    render(<InkwellEditor ref={ref} content="hello" onChange={onChange} />);
    await flushEffects();

    await act(async () => {
      ref.current?.focus({ at: "end" });
      ref.current?.insertContent(" world");
    });

    expect(ref.current?.getState().content).toContain("world");
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
        content: "hello",
        isEmpty: false,
        characterCount: 5,
        characterLimit: 10,
      }),
    );
  });

  it("handles read-only mode via editable=false", () => {
    render(<InkwellEditor content="hello" editable={false} />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );
  });
});

describe("InkwellEditor — content synchronization", () => {
  it("updates editor when content prop changes externally", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <InkwellEditor content="initial" onChange={onChange} />,
    );
    await flushEffects();

    await act(async () => {
      rerender(<InkwellEditor content="**updated**" onChange={onChange} />);
    });

    const editor = container.querySelector(".inkwell-editor");
    expect(editor?.querySelector("strong")).toBeInTheDocument();
    expect(editor?.textContent).toContain("updated");
  });

  it("handles rapid content changes without crashing", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <InkwellEditor content="v1" onChange={onChange} />,
    );
    await flushEffects();

    await act(async () => {
      rerender(<InkwellEditor content="v2" onChange={onChange} />);
      rerender(<InkwellEditor content="v3" onChange={onChange} />);
    });

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

  it("keeps list marker typing as paragraph text", () => {
    const editor = createTestEditor();
    editor.children = deserialize("-");
    editor.onChange();

    Transforms.select(editor, Editor.end(editor, [0]));
    editor.insertText(" ");

    const elements = getElements(editor);
    expect(elements[0].type).toBe("paragraph");
    expect(Node.string(elements[0])).toBe("- ");
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
        children: [{ text: "## Title" }],
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

  it("Shift+Enter on list marker text falls through to insertBreak", () => {
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
      expect(getContent(editor)).toBe("hello **world**");
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
      expect(getContent(editor)).toBe("hello _world_");
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
      expect(getContent(editor)).toBe("hello ~~world~~");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello ****world**");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toBe("hello world");
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
      expect(getContent(editor)).toContain("****");
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
      expect(getContent(editor)).toBe("hello ***world***");
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
      expect(getContent(editor)).toBe("hello **world**");

      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 6 },
        focus: { path: [0, 0], offset: 15 },
      });
      wrapSelection(editor, "**", "**");
      expect(getContent(editor)).toBe("hello world");
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

  it("does not compute inline decorations for legacy list-item", () => {
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
    expect(ranges).toEqual([]);
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
    expect(md).toBe("> nested");
  });

  it("serializes empty blockquote as bare > prefix", () => {
    const elements: InkwellElement[] = [
      { type: "blockquote", id: generateId(), children: [{ text: "" }] },
    ];
    const md = serialize(elements);
    expect(md).toBe("");
  });

  it("heading with undefined level falls back to h1", () => {
    const elements: InkwellElement[] = [
      { type: "heading", id: generateId(), children: [{ text: "# No level" }] },
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
        children: [{ text: "### H3" }],
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
        children: [{ text: "> line 1\n>\n> line 2" }],
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

  it("consecutive list-like paragraphs use single newline", () => {
    const elements = deserialize("- a\n- b\n- c");
    const md = serialize(elements);
    expect(md).toBe("- a\n- b\n- c");
  });

  it("preserves nested unordered list source on round-trip", () => {
    const source = "- a\n  - b\n    - c\n      - d";
    expect(serialize(deserialize(source))).toBe(source);
  });

  it("preserves consecutive ordered list-like paragraphs on round-trip", () => {
    const source = "1. a\n2. b\n3. c";
    expect(serialize(deserialize(source))).toBe(source);
  });

  it("consecutive blockquotes use single newline", () => {
    const elements = deserialize("> a\n> b");
    const md = serialize(elements);
    expect(md).toBe("> a\n> b");
  });
});

describe("InkwellEditor — placeholder canonicalize keeps undo intact", () => {
  // Regression: when a delete leaves a non-paragraph block behind (e.g. a
  // stranded code-fence after select-all + delete on content that ends in a
  // code block) and a plugin placeholder forces canonicalize-to-empty-
  // paragraph, the canonicalize must NOT land in the history. If it does,
  // undo pops the canonicalize instead of the user's delete and the editor
  // "flashes" — flickering between code-fence and paragraph — without ever
  // restoring content.
  it("undo restores content after select-all + delete on code-fence-terminated content", async () => {
    const { HistoryEditor: HE } = await import("slate-history");
    const features: ResolvedInkwellFeatures = {
      heading1: true,
      heading2: false,
      heading3: false,
      heading4: false,
      heading5: false,
      heading6: false,
      blockquotes: true,
      codeBlocks: true,
      images: true,
    };
    const editor = createTestEditor(features);
    editor.children = deserialize(
      "# Title\n\n```ts\nconst x = 1;\n```",
      features,
    );
    editor.onChange();

    Transforms.select(editor, {
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });
    Editor.deleteFragment(editor);
    expect(getElements(editor)[0].type).toBe("code-fence");

    // Microtask flush mirrors the gap between Slate's onChange and the
    // useLayoutEffect that canonicalizes the empty editor — without this,
    // canonicalize ops merge into the delete batch and undo masks the bug.
    await Promise.resolve();
    await Promise.resolve();

    // Mirror canonicalizeEmptyEditor's exact shape, including the
    // withoutSaving wrap that keeps this reshape out of history.
    HE.withoutSaving(editor, () => {
      Editor.withoutNormalizing(editor, () => {
        for (let i = editor.children.length - 1; i >= 0; i--) {
          Transforms.removeNodes(editor, { at: [i] });
        }
        Transforms.insertNodes(editor, {
          type: "paragraph",
          id: generateId(),
          children: [{ text: "" }],
        });
      });
    });
    expect(getElements(editor)[0].type).toBe("paragraph");

    await Promise.resolve();
    await Promise.resolve();

    editor.undo();
    const restored = serialize(getElements(editor));
    expect(restored).toContain("# Title");
    expect(restored).toContain("const x = 1;");
  });
});
