import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { ReactEditor } from "slate-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InkwellEditor } from "../../editor/inkwell-editor";
import type { BubbleMenuItemProps } from "../../types";
import { createBubbleMenuPlugin, defaultBubbleMenuItems } from ".";

// Slate's ReactEditor.hasEditableTarget relies on internal WeakMaps that
// aren't populated in jsdom. Mock it to allow events to propagate.
beforeEach(() => {
  vi.spyOn(ReactEditor, "hasEditableTarget").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function getEditor(container: HTMLElement) {
  return container.querySelector("[data-slate-editor]") as HTMLElement;
}

function getToolbar(container: HTMLElement) {
  return container.querySelector(".inkwell-plugin-bubble-menu-container");
}

/**
 * Mock window.getSelection to simulate text selection inside the editor.
 */
function mockTextSelection(editorEl: HTMLElement, text: string) {
  const textNode = editorEl.querySelector("[data-slate-string]");

  const mockRect = {
    top: 100,
    left: 100,
    bottom: 120,
    right: 200,
    width: 100,
    height: 20,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  };

  vi.spyOn(window, "getSelection").mockReturnValue({
    anchorNode: textNode,
    focusNode: textNode,
    anchorOffset: 0,
    focusOffset: text.length,
    isCollapsed: false,
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({
      getBoundingClientRect: () => mockRect,
      getClientRects: () => [mockRect],
      selectNodeContents: vi.fn(),
    }),
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
    containsNode: () => true,
  } as unknown as Selection);
}

function mockCollapsedSelection(editorEl: HTMLElement) {
  const textNode = editorEl.querySelector("[data-slate-string]");
  const mockRect = {
    top: 100,
    left: 100,
    bottom: 120,
    right: 100,
    width: 0,
    height: 20,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  };

  vi.spyOn(window, "getSelection").mockReturnValue({
    anchorNode: textNode,
    focusNode: textNode,
    anchorOffset: 3,
    focusOffset: 3,
    isCollapsed: true,
    rangeCount: 1,
    toString: () => "",
    getRangeAt: () => ({
      getBoundingClientRect: () => mockRect,
      getClientRects: () => [],
      selectNodeContents: vi.fn(),
    }),
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
    containsNode: () => true,
  } as unknown as Selection);
}

function mockOutsideSelection() {
  vi.spyOn(window, "getSelection").mockReturnValue({
    anchorNode: document.body,
    focusNode: document.body,
    anchorOffset: 0,
    focusOffset: 0,
    isCollapsed: false,
    rangeCount: 1,
    toString: () => "outside",
    getRangeAt: () => ({
      getBoundingClientRect: () => ({
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      getClientRects: () => [],
      selectNodeContents: vi.fn(),
    }),
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
    containsNode: () => false,
  } as unknown as Selection);
}

describe("Bubble Editing Toolbar — selection triggers", () => {
  it("shows toolbar on selectionchange with text selection", async () => {
    const { container } = render(
      <InkwellEditor content="hello world" onChange={vi.fn()} />,
    );
    const editor = getEditor(container);

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    mockTextSelection(editor, "hello");

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(getToolbar(container)).toBeInTheDocument();
  });

  it("hides toolbar when selection collapses", async () => {
    const { container } = render(
      <InkwellEditor content="hello world" onChange={vi.fn()} />,
    );
    const editor = getEditor(container);

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    // Show toolbar
    mockTextSelection(editor, "hello");
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(getToolbar(container)).toBeInTheDocument();

    // Collapse
    mockCollapsedSelection(editor);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(getToolbar(container)).not.toBeInTheDocument();
  });

  it("shows toolbar after mouseup + selectionchange (double-click path)", async () => {
    const { container } = render(
      <InkwellEditor content="hello world" onChange={vi.fn()} />,
    );
    const editor = getEditor(container);

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    // Simulate collapsed selection first (mousedown of double-click)
    mockCollapsedSelection(editor);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(getToolbar(container)).not.toBeInTheDocument();

    // Then expanded selection (mouseup of double-click triggers selectionchange)
    mockTextSelection(editor, "hello");
    act(() => {
      fireEvent.mouseUp(editor);
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(getToolbar(container)).toBeInTheDocument();
  });

  it("does not show toolbar for whitespace-only selection", () => {
    const { container } = render(
      <InkwellEditor content="hello world" onChange={vi.fn()} />,
    );
    const editor = getEditor(container);
    const textNode = editor.querySelector("[data-slate-string]");

    vi.spyOn(window, "getSelection").mockReturnValue({
      anchorNode: textNode,
      focusNode: textNode,
      anchorOffset: 5,
      focusOffset: 6,
      isCollapsed: false,
      rangeCount: 1,
      toString: () => " ",
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          top: 100,
          left: 100,
          bottom: 120,
          right: 110,
          width: 10,
          height: 20,
          x: 100,
          y: 100,
          toJSON: () => ({}),
        }),
        getClientRects: () => [],
        selectNodeContents: vi.fn(),
      }),
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
      containsNode: () => true,
    } as unknown as Selection);

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(getToolbar(container)).not.toBeInTheDocument();
  });

  it("does not show toolbar for selection outside editor", () => {
    const { container } = render(
      <InkwellEditor content="hello world" onChange={vi.fn()} />,
    );

    mockOutsideSelection();

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(getToolbar(container)).not.toBeInTheDocument();
  });

  it("toolbar contains bold, italic, strikethrough buttons", async () => {
    const { container } = render(
      <InkwellEditor content="hello world" onChange={vi.fn()} />,
    );
    const editor = getEditor(container);

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    mockTextSelection(editor, "hello");

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    const toolbar = getToolbar(container)!;
    expect(toolbar).toBeInTheDocument();
    expect(
      toolbar.querySelectorAll(".inkwell-plugin-bubble-menu-btn").length,
    ).toBe(3);
    expect(
      toolbar.querySelector(".inkwell-plugin-bubble-menu-item-bold"),
    ).toBeInTheDocument();
    expect(
      toolbar.querySelector(".inkwell-plugin-bubble-menu-item-italic"),
    ).toBeInTheDocument();
    expect(
      toolbar.querySelector(".inkwell-plugin-bubble-menu-item-strike"),
    ).toBeInTheDocument();
  });
});

describe("Bubble Editing Toolbar — keyboard shortcuts", () => {
  it("Cmd+B does not throw", () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} />,
    );
    const editor = getEditor(container);

    expect(() => {
      act(() => {
        fireEvent.keyDown(editor, { key: "b", metaKey: true });
      });
    }).not.toThrow();
  });

  it("Cmd+I does not throw", () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} />,
    );
    const editor = getEditor(container);

    expect(() => {
      act(() => {
        fireEvent.keyDown(editor, { key: "i", metaKey: true });
      });
    }).not.toThrow();
  });

  it("Cmd+D does not throw", () => {
    const { container } = render(
      <InkwellEditor content="hello" onChange={vi.fn()} />,
    );
    const editor = getEditor(container);

    expect(() => {
      act(() => {
        fireEvent.keyDown(editor, { key: "d", metaKey: true });
      });
    }).not.toThrow();
  });
});

describe("Bubble Menu — custom items", () => {
  it("renders custom items instead of defaults", async () => {
    const customPlugin = createBubbleMenuPlugin({
      items: [
        {
          key: "code",
          render: ({ wrapSelection }: BubbleMenuItemProps) => (
            <button
              data-testid="custom-code-btn"
              className="inkwell-plugin-bubble-menu-btn"
              onClick={() => wrapSelection("`", "`")}
            >
              Code
            </button>
          ),
        },
      ],
    });

    // Pass custom plugin explicitly (overrides built-in)
    const { container } = render(
      <InkwellEditor
        content="hello world"
        onChange={vi.fn()}
        plugins={[customPlugin]}
      />,
    );
    const editor = getEditor(container);

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    mockTextSelection(editor, "hello");
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    // Should have the custom toolbar (from our plugin) AND the built-in one
    const toolbars = container.querySelectorAll(
      ".inkwell-plugin-bubble-menu-container",
    );
    // Find the toolbar that has our custom button
    const hasCustomBtn = Array.from(toolbars).some(t =>
      t.querySelector("[data-testid='custom-code-btn']"),
    );
    expect(hasCustomBtn).toBe(true);
  });

  it("renders items that extend defaults", async () => {
    const extendedPlugin = createBubbleMenuPlugin({
      items: [
        ...defaultBubbleMenuItems,
        {
          key: "code",
          render: ({ wrapSelection }: BubbleMenuItemProps) => (
            <button
              data-testid="extra-btn"
              className="inkwell-plugin-bubble-menu-btn"
              onClick={() => wrapSelection("`", "`")}
            >
              Code
            </button>
          ),
        },
      ],
    });

    const { container } = render(
      <InkwellEditor
        content="hello world"
        onChange={vi.fn()}
        plugins={[extendedPlugin]}
      />,
    );
    const editor = getEditor(container);

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    mockTextSelection(editor, "hello");
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    const toolbars = container.querySelectorAll(
      ".inkwell-plugin-bubble-menu-container",
    );
    const extendedToolbar = Array.from(toolbars).find(t =>
      t.querySelector("[data-testid='extra-btn']"),
    );
    expect(extendedToolbar).toBeDefined();
    // Should have 4 buttons: bold + italic + strike + code
    expect(
      extendedToolbar!.querySelectorAll(".inkwell-plugin-bubble-menu-btn")
        .length,
    ).toBe(4);
  });

  it("custom item shortcut fires onShortcut", () => {
    const onShortcut = vi.fn();
    const customPlugin = createBubbleMenuPlugin({
      items: [
        {
          key: "custom",
          shortcut: "k",
          onShortcut,
          render: () => (
            <button className="inkwell-plugin-bubble-menu-btn">Custom</button>
          ),
        },
      ],
    });

    const { container } = render(
      <InkwellEditor
        content="hello"
        onChange={vi.fn()}
        plugins={[customPlugin]}
      />,
    );
    const editor = getEditor(container);

    act(() => {
      fireEvent.keyDown(editor, { key: "k", metaKey: true });
    });

    expect(onShortcut).toHaveBeenCalledTimes(1);
    expect(onShortcut).toHaveBeenCalledWith(expect.any(Function));
  });

  it("item without shortcut does not crash on keydown", () => {
    const customPlugin = createBubbleMenuPlugin({
      items: [
        {
          key: "no-shortcut",
          render: () => (
            <button className="inkwell-plugin-bubble-menu-btn">X</button>
          ),
        },
      ],
    });

    const { container } = render(
      <InkwellEditor
        content="hello"
        onChange={vi.fn()}
        plugins={[customPlugin]}
      />,
    );
    const editor = getEditor(container);

    expect(() => {
      act(() => {
        fireEvent.keyDown(editor, { key: "x", metaKey: true });
      });
    }).not.toThrow();
  });

  it("custom item receives wrapSelection in render props", async () => {
    const renderFn = vi.fn(({ wrapSelection }: BubbleMenuItemProps) => (
      <button
        className="inkwell-plugin-bubble-menu-btn"
        onClick={() => wrapSelection("*", "*")}
      >
        Test
      </button>
    ));

    const customPlugin = createBubbleMenuPlugin({
      items: [{ key: "test", render: renderFn }],
    });

    const { container } = render(
      <InkwellEditor
        content="hello world"
        onChange={vi.fn()}
        plugins={[customPlugin]}
      />,
    );
    const editor = getEditor(container);

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    mockTextSelection(editor, "hello");
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    // renderFn should have been called with wrapSelection
    expect(renderFn).toHaveBeenCalled();
    const lastCall = renderFn.mock.calls[renderFn.mock.calls.length - 1][0];
    expect(typeof lastCall.wrapSelection).toBe("function");
  });
});

describe("Bubble Menu — defaultBubbleMenuItems", () => {
  it("exports 3 default items", () => {
    expect(defaultBubbleMenuItems).toHaveLength(3);
  });

  it("each default item has key, shortcut, onShortcut, and render", () => {
    for (const item of defaultBubbleMenuItems) {
      expect(item.key).toBeDefined();
      expect(typeof item.shortcut).toBe("string");
      expect(typeof item.onShortcut).toBe("function");
      expect(typeof item.render).toBe("function");
    }
  });

  it("default items have keys: bold, italic, strikethrough", () => {
    const keys = defaultBubbleMenuItems.map(i => i.key);
    expect(keys).toEqual(["bold", "italic", "strikethrough"]);
  });

  it("default item render returns a React element", () => {
    const mockWrap = vi.fn();
    for (const item of defaultBubbleMenuItems) {
      const result = item.render({ wrapSelection: mockWrap });
      expect(result).toBeDefined();
    }
  });

  it("default item onShortcut calls wrapSelection with correct markers", () => {
    const mockWrap = vi.fn();

    defaultBubbleMenuItems[0].onShortcut!(mockWrap); // bold
    expect(mockWrap).toHaveBeenCalledWith("**", "**");

    mockWrap.mockClear();
    defaultBubbleMenuItems[1].onShortcut!(mockWrap); // italic
    expect(mockWrap).toHaveBeenCalledWith("_", "_");

    mockWrap.mockClear();
    defaultBubbleMenuItems[2].onShortcut!(mockWrap); // strikethrough
    expect(mockWrap).toHaveBeenCalledWith("~~", "~~");
  });
});
