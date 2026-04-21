import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PluginRenderProps, Snippet } from "../../types";
import { createSnippetsPlugin } from ".";

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
    expect(plugin.trigger?.key).toBe("[");
    expect(plugin.render).toBeTypeOf("function");
  });

  it("uses default key of [", () => {
    const plugin = createSnippetsPlugin({ snippets: SNIPPETS });
    expect(plugin.trigger).toEqual({ key: "[" });
  });

  it("allows custom key configuration", () => {
    const plugin = createSnippetsPlugin({
      snippets: SNIPPETS,
      key: "Meta+j",
    });
    expect(plugin.trigger).toEqual({ key: "Meta+j" });
  });

  describe("SnippetPicker rendering", () => {
    const defaultRenderProps: PluginRenderProps = {
      active: true,
      query: "",
      onSelect: vi.fn(),
      onDismiss: vi.fn(),
      position: { top: 100, left: 50 },
      editorRef: { current: null },
      wrapSelection: vi.fn(),
    };

    function renderPlugin(
      snippets: Snippet[] = SNIPPETS,
      props: Partial<PluginRenderProps> = {},
    ) {
      const plugin = createSnippetsPlugin({ snippets });
      return render(
        <div>{plugin.render({ ...defaultRenderProps, ...props })}</div>,
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
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "bug" } });
      expect(screen.getByText("Bug Report")).toBeInTheDocument();
      expect(screen.queryByText("Feature Request")).not.toBeInTheDocument();
      expect(screen.queryByText("Meeting Notes")).not.toBeInTheDocument();
    });

    it("is case-insensitive when filtering", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "BUG" } });
      expect(screen.getByText("Bug Report")).toBeInTheDocument();
    });

    it("shows empty state when no snippets match", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "nonexistent" } });
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
      const items = container.querySelectorAll("[data-snippet-item]");
      expect(items[0]).toHaveClass("inkwell-plugin-snippets-item-active");
    });

    it("navigates down with ArrowDown", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      const items = container.querySelectorAll("[data-snippet-item]");
      expect(items[1]).toHaveClass("inkwell-plugin-snippets-item-active");
    });

    it("navigates up with ArrowUp", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;

      // Go down first, then up
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      fireEvent.keyDown(searchInput, { key: "ArrowUp" });

      const items = container.querySelectorAll("[data-snippet-item]");
      expect(items[0]).toHaveClass("inkwell-plugin-snippets-item-active");
    });

    it("wraps around from last to first on ArrowDown", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;

      // Navigate past the last item
      for (let i = 0; i < SNIPPETS.length; i++) {
        fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      }

      const items = container.querySelectorAll("[data-snippet-item]");
      expect(items[0]).toHaveClass("inkwell-plugin-snippets-item-active");
    });

    it("wraps around from first to last on ArrowUp", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "ArrowUp" });

      const items = container.querySelectorAll("[data-snippet-item]");
      expect(items[SNIPPETS.length - 1]).toHaveClass(
        "inkwell-plugin-snippets-item-active",
      );
    });

    it("selects item with Enter", () => {
      const onSelect = vi.fn();
      const { container } = renderPlugin(SNIPPETS, { onSelect });
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith(SNIPPETS[0].content);
    });

    it("selects navigated item with Enter", () => {
      const onSelect = vi.fn();
      const { container } = renderPlugin(SNIPPETS, { onSelect });
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      fireEvent.keyDown(searchInput, { key: "Enter" });

      expect(onSelect).toHaveBeenCalledWith(SNIPPETS[1].content);
    });

    it("dismisses with Escape", () => {
      const onDismiss = vi.fn();
      const { container } = renderPlugin(SNIPPETS, { onDismiss });
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;

      fireEvent.keyDown(searchInput, { key: "Escape" });
      expect(onDismiss).toHaveBeenCalled();
    });

    it("highlights item on mouse enter", () => {
      const { container } = renderPlugin();

      const items = container.querySelectorAll("[data-snippet-item]");
      fireEvent.mouseEnter(items[2]);

      expect(items[2]).toHaveClass("inkwell-plugin-snippets-item-active");
    });

    it("resets selection when query changes", () => {
      const { container } = renderPlugin();
      const searchInput = container.querySelector(
        ".inkwell-plugin-snippets-search",
      ) as HTMLInputElement;

      // Navigate down
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });

      // Change query — selection should reset to 0
      fireEvent.change(searchInput, { target: { value: "b" } });

      const items = container.querySelectorAll("[data-snippet-item]");
      if (items.length > 0) {
        expect(items[0]).toHaveClass("inkwell-plugin-snippets-item-active");
      }
    });

    it("handles empty snippets array", () => {
      renderPlugin([]);
      expect(screen.getByText("No snippets found")).toBeInTheDocument();
    });
  });
});
