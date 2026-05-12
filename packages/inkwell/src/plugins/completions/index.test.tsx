import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createEditor } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it, vi } from "vitest";
import { deserialize } from "../../editor/slate/deserialize";
import { serialize } from "../../editor/slate/serialize";
import type { InkwellElement } from "../../editor/slate/types";
import { withMarkdown } from "../../editor/slate/with-markdown";
import { withNodeId } from "../../editor/slate/with-node-id";
import type { PluginRenderProps } from "../../types";
import { createCompletionsPlugin } from ".";

function createTestEditor() {
  const decorationsRef = {
    current: {
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
      lists: true,
      blockquotes: true,
      codeBlocks: true,
      images: true,
    },
  };
  return withMarkdown(
    withHistory(withNodeId(withReact(createEditor()))),
    decorationsRef,
  );
}

const createKeyboardEvent = (key: string): ReactKeyboardEvent<Element> => {
  return new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  }) as unknown as ReactKeyboardEvent<Element>;
};

const defaultRenderProps: PluginRenderProps = {
  active: true,
  query: "",
  onSelect: vi.fn(),
  onDismiss: vi.fn(),
  position: { top: 100, left: 50 },
  editorRef: { current: null },
  wrapSelection: vi.fn(),
};

describe("createCompletionsPlugin", () => {
  it("returns a valid InkwellPlugin", () => {
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Hello",
    });

    expect(plugin.name).toBe("completions");
    expect(plugin.render).toBeTypeOf("function");
    expect(plugin.onKeyDown).toBeTypeOf("function");
    expect(plugin.onEditorChange).toBeTypeOf("function");
  });

  it("uses the completion as the editor placeholder while empty", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    const plugin = createCompletionsPlugin({
      getCompletion: () => "**Suggested** reply",
    });

    expect(plugin.render(defaultRenderProps)).toBeNull();
    expect(plugin.getPlaceholder?.(editor)).toEqual({
      text: "**Suggested** reply",
      hint: "[tab ↹]",
    });
  });

  it("uses loading text as the editor placeholder while loading", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    const plugin = createCompletionsPlugin({
      getCompletion: () => null,
      isLoading: () => true,
      loadingText: "Finding suggestions...",
    });

    expect(plugin.getPlaceholder?.(editor)).toEqual({
      text: "Finding suggestions...",
      hint: "[tab ↹]",
    });
  });

  it("uses a custom accept hint", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Suggested text",
      acceptHint: "Apply",
    });

    expect(plugin.getPlaceholder?.(editor)).toEqual({
      text: "Suggested text",
      hint: "Apply",
    });
  });

  it("does not override the placeholder when the editor is not empty", () => {
    const editor = createTestEditor();
    editor.children = deserialize("Existing text");
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Suggested text",
    });

    expect(plugin.getPlaceholder?.(editor)).toBeNull();
  });

  it("accepts a completion with Tab", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    };

    const onAccept = vi.fn();
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Accepted **reply**",
      onAccept,
    });

    const event = createKeyboardEvent("Tab");

    plugin.onKeyDown?.(event, { wrapSelection: vi.fn() }, editor);

    expect(event.defaultPrevented).toBe(true);
    expect(onAccept).toHaveBeenCalledWith("Accepted **reply**");
    expect(serialize(editor.children as InkwellElement[])).toBe(
      "Accepted **reply**",
    );
  });

  it("dismisses a completion with Escape", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");

    const onDismiss = vi.fn();
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Nope",
      onDismiss,
    });

    const event = createKeyboardEvent("Escape");

    plugin.onKeyDown?.(event, { wrapSelection: vi.fn() }, editor);

    expect(event.defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledWith("Nope");
  });

  it("dismisses on normal typing without preventing the key", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");

    const onDismiss = vi.fn();
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Suggestion",
      onDismiss,
    });

    const event = createKeyboardEvent("a");

    plugin.onKeyDown?.(event, { wrapSelection: vi.fn() }, editor);

    expect(event.defaultPrevented).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith("Suggestion");
  });

  it("restores an accepted completion when the document becomes empty", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    };

    const onRestore = vi.fn();
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Restorable",
      onRestore,
    });

    plugin.onKeyDown?.(
      createKeyboardEvent("Tab"),
      { wrapSelection: vi.fn() },
      editor,
    );

    editor.children = deserialize("");
    plugin.onEditorChange?.(editor);

    expect(onRestore).toHaveBeenCalledWith("Restorable");
  });
});
