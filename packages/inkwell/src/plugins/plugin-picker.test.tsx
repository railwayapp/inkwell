/**
 * Direct unit tests for the shared PluginMenuPrimitive. The snippets and
 * mentions plugins exercise this primitive end-to-end, but these tests
 * pin down the contract directly so future plugins built on top of it
 * can rely on the documented behavior.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PluginRenderProps, SubscribeForwardedKey } from "../types";
import { PluginMenuPrimitive, pluginPickerClass } from "./plugin-picker";

interface Item {
  id: string;
  label: string;
}

const ITEMS: Item[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
];

/**
 * Build a controllable forwarded-key channel for tests. The picker
 * subscribes through props — tests drive keys by calling `emit`.
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

function baseProps(
  overrides: Partial<PluginRenderProps> = {},
): PluginRenderProps {
  return {
    active: true,
    query: "",
    onSelect: vi.fn(),
    onDismiss: vi.fn(),
    position: { top: 0, left: 0 },
    editorRef: { current: null },
    wrapSelection: vi.fn(),
    subscribeForwardedKey: () => () => {},
    ...overrides,
  };
}

function renderPrimitive(
  props: Partial<{
    pluginName: string;
    items: Item[];
    search: (q: string) => Item[] | Promise<Item[]>;
    onSelect: (text: string) => void;
    onDismiss: () => void;
  }> = {},
) {
  const onSelect = props.onSelect ?? vi.fn();
  const onDismiss = props.onDismiss ?? vi.fn();
  const channel = createForwardedKeyChannel();
  const renderResult = render(
    <PluginMenuPrimitive<Item>
      pluginName={props.pluginName ?? "test"}
      items={props.items}
      search={props.search}
      getKey={item => item.id}
      renderItem={(item, active) => (
        <span data-active={active ? "true" : "false"}>{item.label}</span>
      )}
      itemToText={item => item.id}
      emptyMessage="No matches"
      {...baseProps({
        onSelect,
        onDismiss,
        subscribeForwardedKey: channel.subscribe,
      })}
    />,
  );

  const dispatchPluginKey = (key: string) => {
    act(() => channel.emit(key));
  };
  const typePluginQuery = (query: string) => {
    for (const key of query) dispatchPluginKey(key);
  };

  return {
    ...renderResult,
    onSelect,
    onDismiss,
    dispatchPluginKey,
    typePluginQuery,
  };
}

describe("PluginMenuPrimitive", () => {
  describe("class contract", () => {
    it("uses the shared inkwell-plugin-picker-* class namespace", () => {
      const { container } = renderPrimitive({ items: ITEMS });
      expect(
        container.querySelector(`.${pluginPickerClass.popup}`),
      ).toBeInTheDocument();
      expect(
        container.querySelector(`.${pluginPickerClass.picker}`),
      ).toBeInTheDocument();
      expect(
        container.querySelector(`.${pluginPickerClass.search}`),
      ).toBeInTheDocument();
      expect(
        container.querySelectorAll(`.${pluginPickerClass.item}`).length,
      ).toBe(ITEMS.length);
      expect(
        container.querySelector(`.${pluginPickerClass.itemActive}`),
      ).toBeInTheDocument();
    });

    it("matches the documented class names", () => {
      expect(pluginPickerClass).toEqual({
        popup: "inkwell-plugin-picker-popup",
        picker: "inkwell-plugin-picker",
        search: "inkwell-plugin-picker-search",
        item: "inkwell-plugin-picker-item",
        itemActive: "inkwell-plugin-picker-item-active",
        empty: "inkwell-plugin-picker-empty",
        title: "inkwell-plugin-picker-title",
        subtitle: "inkwell-plugin-picker-subtitle",
        preview: "inkwell-plugin-picker-preview",
      });
    });
  });

  describe("query display", () => {
    it("renders the placeholder before editor-forwarded typing", () => {
      renderPrimitive({ items: ITEMS });
      expect(
        document.querySelector(`.${pluginPickerClass.search}`),
      ).toBeInTheDocument();
    });

    it("highlights the first result by default", () => {
      const { container } = renderPrimitive({ items: ITEMS });
      const items = container.querySelectorAll(`.${pluginPickerClass.item}`);
      expect(items[0]).toHaveClass(pluginPickerClass.itemActive);
    });
  });

  describe("sync items path", () => {
    it("filters items by getKey on query change", () => {
      const { typePluginQuery } = renderPrimitive({
        pluginName: "sync",
        items: ITEMS,
      });
      typePluginQuery("b");
      expect(screen.getByText("Bravo")).toBeInTheDocument();
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
      expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
    });

    it("renders empty message when nothing matches", () => {
      const { typePluginQuery } = renderPrimitive({
        pluginName: "sync",
        items: ITEMS,
      });
      typePluginQuery("zzz");
      expect(screen.getByText("No matches")).toBeInTheDocument();
    });
  });

  describe("async search path", () => {
    it("filters via async search callback", async () => {
      const search = vi.fn(async (q: string) =>
        ITEMS.filter(i => i.label.toLowerCase().includes(q.toLowerCase())),
      );
      const { typePluginQuery } = renderPrimitive({
        pluginName: "async",
        search,
      });
      await waitFor(() =>
        expect(screen.getByText("Alpha")).toBeInTheDocument(),
      );

      typePluginQuery("char");
      await waitFor(() => {
        expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
        expect(screen.getByText("Charlie")).toBeInTheDocument();
      });
    });

    it("ignores stale async results when query changes", async () => {
      let resolveFirst!: (items: Item[]) => void;
      const firstCall = new Promise<Item[]>(r => {
        resolveFirst = r;
      });
      const search = vi.fn((q: string) => {
        if (q === "first") return firstCall;
        return ITEMS.filter(i =>
          i.label.toLowerCase().includes(q.toLowerCase()),
        );
      });
      const { dispatchPluginKey, typePluginQuery } = renderPrimitive({
        pluginName: "async-stale",
        search,
      });
      typePluginQuery("first");
      await act(async () => {});
      for (let i = 0; i < "first".length; i++) dispatchPluginKey("Backspace");
      typePluginQuery("b");
      // Late-arriving first response should be ignored.
      await act(async () => {
        resolveFirst(ITEMS);
      });
      await waitFor(() => {
        expect(screen.getByText("Bravo")).toBeInTheDocument();
        expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
      });
    });
  });

  describe("keyboard", () => {
    it("ArrowDown selects the next item and wraps to the first", () => {
      const { container, dispatchPluginKey } = renderPrimitive({
        pluginName: "keys",
        items: ITEMS,
      });
      for (let i = 0; i < ITEMS.length; i++) {
        dispatchPluginKey("ArrowDown");
      }
      const items = container.querySelectorAll(`.${pluginPickerClass.item}`);
      expect(items[0]).toHaveClass(pluginPickerClass.itemActive);
    });

    it("ArrowUp wraps from first to last", () => {
      const { container, dispatchPluginKey } = renderPrimitive({
        pluginName: "keys",
        items: ITEMS,
      });
      dispatchPluginKey("ArrowUp");
      const items = container.querySelectorAll(`.${pluginPickerClass.item}`);
      expect(items[ITEMS.length - 1]).toHaveClass(pluginPickerClass.itemActive);
    });

    it("Enter selects the currently highlighted item", () => {
      const onSelect = vi.fn();
      const { dispatchPluginKey } = renderPrimitive({
        pluginName: "keys",
        items: ITEMS,
        onSelect,
      });
      dispatchPluginKey("ArrowDown");
      dispatchPluginKey("Enter");
      expect(onSelect).toHaveBeenCalledWith("b");
    });

    it("Escape dismisses", () => {
      const onDismiss = vi.fn();
      const { container } = renderPrimitive({ items: ITEMS, onDismiss });
      const picker = container.querySelector(`.${pluginPickerClass.picker}`);
      if (!picker) throw new Error("picker not rendered");
      fireEvent.keyDown(picker, { key: "Escape" });
      expect(onDismiss).toHaveBeenCalled();
    });

    it("clicking an item calls onSelect with the mapped text", () => {
      const onSelect = vi.fn();
      renderPrimitive({ items: ITEMS, onSelect });
      fireEvent.click(screen.getByText("Charlie"));
      expect(onSelect).toHaveBeenCalledWith("c");
    });
  });

  describe("forwarded editor keys", () => {
    it("navigates via the subscribed channel", () => {
      const onSelect = vi.fn();
      const { dispatchPluginKey } = renderPrimitive({
        pluginName: "fwd",
        items: ITEMS,
        onSelect,
      });
      dispatchPluginKey("ArrowDown");
      dispatchPluginKey("Enter");
      expect(onSelect).toHaveBeenCalledWith("b");
    });

    it("typed characters extend the query and filter results", async () => {
      const { dispatchPluginKey } = renderPrimitive({
        pluginName: "fwd",
        items: ITEMS,
      });
      dispatchPluginKey("c");
      await waitFor(() => {
        expect(screen.getByText("Charlie")).toBeInTheDocument();
        expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
      });
    });

    it("Backspace shrinks the query", async () => {
      const { dispatchPluginKey, typePluginQuery } = renderPrimitive({
        pluginName: "fwd",
        items: ITEMS,
      });
      typePluginQuery("br");
      dispatchPluginKey("Backspace");
      await waitFor(() => {
        expect(
          document.querySelector(`.${pluginPickerClass.search}`),
        ).toHaveTextContent("b");
      });
    });

    it("each picker is scoped to its own channel", () => {
      // Two separate renders — each gets its own channel. Dispatching on
      // one does not affect the other.
      const onSelectA = vi.fn();
      const onSelectB = vi.fn();
      const a = renderPrimitive({
        pluginName: "alpha",
        items: ITEMS,
        onSelect: onSelectA,
      });
      const b = renderPrimitive({
        pluginName: "beta",
        items: ITEMS,
        onSelect: onSelectB,
      });
      a.dispatchPluginKey("Enter");
      expect(onSelectA).toHaveBeenCalled();
      expect(onSelectB).not.toHaveBeenCalled();
      // Drive only on b's channel; a should not fire again.
      onSelectA.mockClear();
      b.dispatchPluginKey("Enter");
      expect(onSelectA).not.toHaveBeenCalled();
      expect(onSelectB).toHaveBeenCalled();
    });
  });
});
