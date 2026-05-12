import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import type { InkwellPluginEditor, PluginKeyDownContext } from "../../types";
import { createCompletionsPlugin } from ".";

const createKeyboardEvent = (key: string): ReactKeyboardEvent<Element> => {
  return new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  }) as unknown as ReactKeyboardEvent<Element>;
};

function createPluginEditor(content = ""): InkwellPluginEditor {
  let currentContent = content;
  return {
    getState: () => ({
      content: currentContent,
      isEmpty: currentContent.trim().length === 0,
      isFocused: false,
      isEditable: true,
      characterCount: currentContent.length,
      overLimit: false,
      isEnforcingCharacterLimit: false,
    }),
    isEmpty: () => currentContent.trim().length === 0,
    focus: () => {},
    clear: () => {
      currentContent = "";
    },
    setContent: next => {
      currentContent = next;
    },
    insertContent: next => {
      currentContent = `${currentContent}${next}`;
    },
    getContentBeforeCursor: () => currentContent,
    getCurrentBlockContent: () => currentContent,
    getCurrentBlockContentBeforeCursor: () => currentContent,
    replaceCurrentBlockContent: next => {
      currentContent = next;
    },
    clearCurrentBlock: () => {
      currentContent = "";
    },
    wrapSelection: () => {},
    insertImage: () => "image-id",
    updateImage: () => {},
    removeImage: () => {},
  };
}

const createContext = (editor: InkwellPluginEditor): PluginKeyDownContext => ({
  editor,
  wrapSelection: vi.fn(),
  activate: vi.fn(),
  dismiss: vi.fn(),
});

describe("createCompletionsPlugin", () => {
  it("returns a headless InkwellPlugin", () => {
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Hello",
    });

    expect(plugin.name).toBe("completions");
    expect(plugin.render).toBeUndefined();
    expect(plugin.onKeyDown).toBeTypeOf("function");
    expect(plugin.onEditorChange).toBeTypeOf("function");
  });

  it("uses the completion as the editor placeholder while empty", () => {
    const editor = createPluginEditor("");
    const plugin = createCompletionsPlugin({
      getCompletion: () => "**Suggested** reply",
    });

    expect(plugin.getPlaceholder?.(editor)).toEqual({
      text: "**Suggested** reply",
      hint: "[tab ↹]",
    });
  });

  it("uses loading text as the editor placeholder while loading", () => {
    const editor = createPluginEditor("");
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
    const editor = createPluginEditor("");
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
    const editor = createPluginEditor("Existing text");
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Suggested text",
    });

    expect(plugin.getPlaceholder?.(editor)).toBeNull();
  });

  it("accepts a completion with Tab", () => {
    const editor = createPluginEditor("");
    const onAccept = vi.fn();
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Accepted **reply**",
      onAccept,
    });

    const event = createKeyboardEvent("Tab");
    plugin.onKeyDown?.(event, createContext(editor));

    expect(event.defaultPrevented).toBe(true);
    expect(onAccept).toHaveBeenCalledWith("Accepted **reply**");
    expect(editor.getState().content).toBe("Accepted **reply**");
  });

  it("dismisses a completion with Escape", () => {
    const editor = createPluginEditor("");
    const onDismiss = vi.fn();
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Nope",
      onDismiss,
    });

    const event = createKeyboardEvent("Escape");
    plugin.onKeyDown?.(event, createContext(editor));

    expect(event.defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledWith("Nope");
  });

  it("dismisses on normal typing without preventing the key", () => {
    const editor = createPluginEditor("");
    const onDismiss = vi.fn();
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Suggestion",
      onDismiss,
    });

    const event = createKeyboardEvent("a");
    plugin.onKeyDown?.(event, createContext(editor));

    expect(event.defaultPrevented).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith("Suggestion");
  });

  it("restores an accepted completion when the document becomes empty", () => {
    const editor = createPluginEditor("");
    const onRestore = vi.fn();
    const plugin = createCompletionsPlugin({
      getCompletion: () => "Restorable",
      onRestore,
    });

    plugin.onKeyDown?.(createKeyboardEvent("Tab"), createContext(editor));
    editor.clear();
    plugin.onEditorChange?.(editor);

    expect(onRestore).toHaveBeenCalledWith("Restorable");
  });

  it("restores an accepted completion after plugin recreation", () => {
    const editor = createPluginEditor("");
    const onRestore = vi.fn();
    const firstPlugin = createCompletionsPlugin({
      name: "inline-completions",
      getCompletion: () => "Restorable",
      onRestore,
    });
    const nextPlugin = createCompletionsPlugin({
      name: "inline-completions",
      getCompletion: () => null,
      onRestore,
    });

    firstPlugin.onKeyDown?.(createKeyboardEvent("Tab"), createContext(editor));
    editor.clear();
    nextPlugin.onEditorChange?.(editor);

    expect(onRestore).toHaveBeenCalledWith("Restorable");
  });
});
