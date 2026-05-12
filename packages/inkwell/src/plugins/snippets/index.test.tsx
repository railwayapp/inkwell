import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  InkwellPluginEditor,
  PluginRenderProps,
  Snippet,
  SubscribeForwardedKey,
} from "../../types";
import { createSnippetsPlugin } from ".";

/**
 * Build a controllable forwarded-key channel for tests.
 */
function createForwardedKeyChannel(): {
  subscribe: SubscribeForwardedKey;
  emit: (key: string) => void;
} {
  const listeners = new Set<(key: string) => void>();
  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: key => {
      for (const listener of listeners) listener(key);
    },
  };
}

function createPluginEditor(): InkwellPluginEditor {
  return {
    getState: () => ({
      content: "",
      isEmpty: true,
      isFocused: false,
      isEditable: true,
      characterCount: 0,
      overLimit: false,
      isEnforcingCharacterLimit: false,
    }),
    isEmpty: () => true,
    focus: () => {},
    clear: () => {},
    setContent: () => {},
    insertContent: () => {},
    getContentBeforeCursor: () => "",
    getCurrentBlockContent: () => "",
    getCurrentBlockContentBeforeCursor: () => "",
    replaceCurrentBlockContent: () => {},
    clearCurrentBlock: () => {},
    wrapSelection: () => {},
    insertImage: () => "image-id",
    updateImage: () => {},
    removeImage: () => {},
  };
}

const SNIPPETS: Snippet[] = [
  { title: "Bug Report", content: "## Bug Report\n\n**Steps:**\n1. " },
  { title: "Feature Request", content: "## Feature Request\n\n" },
  { title: "Meeting Notes", content: "## Meeting Notes\n\n**Date:** " },
  { title: "Code Review", content: "## Code Review\n\n" },
];

describe("createSnippetsPlugin", () => {
  it("returns a valid InkwellPlugin", () => {
    const plugin = createSnippetsPlugin({ snippets: SNIPPETS });
    expect(plugin.name).toBe("snippets");
    expect(
      plugin.activation?.type === "trigger" ? plugin.activation.key : undefined,
    ).toBe("[");
    expect(plugin.render).toBeTypeOf("function");
  });

  it("uses default key of [", () => {
    const plugin = createSnippetsPlugin({ snippets: SNIPPETS });
    expect(plugin.activation).toEqual({ type: "trigger", key: "[" });
  });

  it("allows custom key configuration", () => {
    const plugin = createSnippetsPlugin({
      snippets: SNIPPETS,
      trigger: "Meta+j",
    });
    expect(plugin.activation).toEqual({ type: "trigger", key: "Meta+j" });
  });

  describe("SnippetPicker rendering", () => {
    /**
     * Each render gets its own forwarded-key channel so tests can
     * simulate editor-forwarded keystrokes without leaking state
     * across renders.
     */
    let activeChannel: ReturnType<typeof createForwardedKeyChannel> | null =
      null;

    function dispatchPluginKey(key: string) {
      if (!activeChannel) throw new Error("call renderPlugin first");
      act(() => {
        activeChannel?.emit(key);
      });
    }

    function typePluginQuery(query: string) {
      for (const key of query) dispatchPluginKey(key);
    }

    const baseRenderProps: Omit<PluginRenderProps, "subscribeForwardedKey"> = {
      active: true,
      query: "",
      onSelect: vi.fn(),
      onDismiss: vi.fn(),
      position: { top: 100, left: 50 },
      editorRef: { current: null },
      editor: createPluginEditor(),
      wrapSelection: vi.fn(),
    };

    function renderPlugin(
      snippets: Snippet[] = SNIPPETS,
      props: Partial<PluginRenderProps> = {},
    ) {
      const channel = createForwardedKeyChannel();
      activeChannel = channel;
      const plugin = createSnippetsPlugin({ snippets });
      return render(
        <div>
          {plugin.render?.({
            ...baseRenderProps,
            subscribeForwardedKey: channel.subscribe,
            ...props,
          })}
        </div>,
      );
    }

    it("renders all snippets when query is empty", () => {
      renderPlugin();
      expect(screen.getByText("Bug Report")).toBeInTheDocument();
      expect(screen.getByText("Feature Request")).toBeInTheDocument();
      expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
      expect(screen.getByText("Code Review")).toBeInTheDocument();
    });

    it("filters snippets by query", () => {
      renderPlugin();
      typePluginQuery("bug");
      expect(screen.getByText("Bug Report")).toBeInTheDocument();
      expect(screen.queryByText("Feature Request")).not.toBeInTheDocument();
      expect(screen.queryByText("Meeting Notes")).not.toBeInTheDocument();
    });

    it("is case-insensitive when filtering", () => {
      renderPlugin();
      typePluginQuery("BUG");
      expect(screen.getByText("Bug Report")).toBeInTheDocument();
    });

    it("shows empty state when no snippets match", () => {
      renderPlugin();
      typePluginQuery("nonexistent");
      expect(screen.getByText("No snippets found")).toBeInTheDocument();
    });

    it("shows content preview for each snippet", () => {
      renderPlugin();
      expect(screen.getByText(/## Bug Report/)).toBeInTheDocument();
    });

    it("truncates long previews", () => {
      const longSnippet: Snippet = {
        title: "Long",
        content: "A".repeat(100),
      };
      renderPlugin([longSnippet]);
      const preview = screen.getByText(/A+\.\.\./);
      expect(preview).toBeInTheDocument();
    });

    it("calls onSelect with snippet content on click", () => {
      const onSelect = vi.fn();
      renderPlugin(SNIPPETS, { onSelect });

      fireEvent.click(screen.getByText("Bug Report"));
      expect(onSelect).toHaveBeenCalledWith("## Bug Report\n\n**Steps:**\n1. ");
    });

    it("highlights the first item by default", () => {
      const { container } = renderPlugin();
      const items = container.querySelectorAll(".inkwell-plugin-picker-item");
      expect(items[0]).toHaveClass("inkwell-plugin-picker-item-active");
    });

    it("navigates down with ArrowDown", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-picker-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      const items = container.querySelectorAll(".inkwell-plugin-picker-item");
      expect(items[1]).toHaveClass("inkwell-plugin-picker-item-active");
    });

    it("navigates up with ArrowUp", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-picker-search",
      ) as HTMLInputElement;

      // Go down first, then up
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      fireEvent.keyDown(searchInput, { key: "ArrowUp" });

      const items = container.querySelectorAll(".inkwell-plugin-picker-item");
      expect(items[0]).toHaveClass("inkwell-plugin-picker-item-active");
    });

    it("wraps around from last to first on ArrowDown", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-picker-search",
      ) as HTMLInputElement;

      // Navigate past the last item
      for (let i = 0; i < SNIPPETS.length; i++) {
        fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      }

      const items = container.querySelectorAll(".inkwell-plugin-picker-item");
      expect(items[0]).toHaveClass("inkwell-plugin-picker-item-active");
    });

    it("wraps around from first to last on ArrowUp", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-picker-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "ArrowUp" });

      const items = container.querySelectorAll(".inkwell-plugin-picker-item");
      expect(items[SNIPPETS.length - 1]).toHaveClass(
        "inkwell-plugin-picker-item-active",
      );
    });

    it("selects item with Enter", () => {
      const onSelect = vi.fn();
      const { container } = renderPlugin(SNIPPETS, { onSelect });
      const searchInput = container.querySelector(
        ".inkwell-plugin-picker-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith(SNIPPETS[0].content);
    });

    it("selects navigated item with Enter", () => {
      const onSelect = vi.fn();
      const { container } = renderPlugin(SNIPPETS, { onSelect });
      const searchInput = container.querySelector(
        ".inkwell-plugin-picker-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      fireEvent.keyDown(searchInput, { key: "Enter" });

      expect(onSelect).toHaveBeenCalledWith(SNIPPETS[1].content);
    });

    it("dismisses with Escape", () => {
      const onDismiss = vi.fn();
      const { container } = renderPlugin(SNIPPETS, { onDismiss });
      const searchInput = container.querySelector(
        ".inkwell-plugin-picker-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "Escape" });
      expect(onDismiss).toHaveBeenCalled();
    });

    it("highlights item on mouse enter", () => {
      const { container } = renderPlugin();

      const items = container.querySelectorAll(".inkwell-plugin-picker-item");
      fireEvent.mouseEnter(items[2]);

      expect(items[2]).toHaveClass("inkwell-plugin-picker-item-active");
    });

    it("resets selection when query changes", () => {
      const { container } = renderPlugin();
      // Navigate down
      dispatchPluginKey("ArrowDown");
      dispatchPluginKey("ArrowDown");

      // Change query — selection should reset to 0
      typePluginQuery("b");

      const items = container.querySelectorAll(".inkwell-plugin-picker-item");
      if (items.length > 0) {
        expect(items[0]).toHaveClass("inkwell-plugin-picker-item-active");
      }
    });

    it("handles empty snippets array", () => {
      renderPlugin([]);
      expect(screen.getByText("No snippets found")).toBeInTheDocument();
    });

    it("selects the navigated snippet when ArrowDown and Enter fire before rerender", () => {
      const onSelect = vi.fn();
      const { container } = renderPlugin(SNIPPETS, { onSelect });
      const _input = container.querySelector(
        ".inkwell-plugin-picker-search",
      ) as HTMLInputElement;

      // Fire both keys in the same task to exercise the ref-backed
      // selection path inside PluginMenuPrimitive. Without it, the
      // selectedIndex state update from ArrowDown would not be visible
      // to the Enter handler in the same batch.
      dispatchPluginKey("ArrowDown");
      dispatchPluginKey("Enter");

      expect(onSelect).toHaveBeenCalledWith(SNIPPETS[1].content);
    });

    it("handles forwarded editor keydowns via subscribeForwardedKey", () => {
      const onSelect = vi.fn();
      renderPlugin(SNIPPETS, { onSelect });

      dispatchPluginKey("ArrowDown");
      dispatchPluginKey("Enter");

      expect(onSelect).toHaveBeenCalledWith(SNIPPETS[1].content);
    });
  });
});
