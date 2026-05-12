"use client";

import type { KeyboardEvent } from "react";
import type { InkwellPlugin, InkwellPluginEditor } from "../../types";

export interface CompletionsPluginOptions {
  /** Unique plugin name. Defaults to `completions`. */
  name?: string;
  /** Completion content to render as placeholder text. Return null when inactive. */
  getCompletion: () => string | null;
  /** Whether to show a loading placeholder while no completion is available. */
  isLoading?: () => boolean;
  /** Text shown while `isLoading()` is true. */
  loadingText?: string;
  /** Hint rendered while the completion placeholder is visible. */
  acceptHint?: string;
  /** Called after Tab accepts and inserts the completion. */
  onAccept?: (completion: string) => void;
  /** Called when Escape or user typing dismisses the current completion. */
  onDismiss?: (completion: string) => void;
  /**
   * Called when an accepted completion is undone back to an empty document.
   * Enabled by default; set `restoreOnUndo` to false to opt out.
   */
  onRestore?: (completion: string) => void;
  /** Whether undo-to-empty should restore the accepted completion. Defaults to true. */
  restoreOnUndo?: boolean;
}

const isPlainTypingKey = (event: KeyboardEvent): boolean => {
  return (
    event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
  );
};

const lastAcceptedCompletionByEditor = new WeakMap<
  InkwellPluginEditor,
  Map<string, string>
>();

const setLastAcceptedCompletion = (
  editor: InkwellPluginEditor,
  pluginName: string,
  completion: string,
) => {
  const completions = lastAcceptedCompletionByEditor.get(editor) ?? new Map();
  completions.set(pluginName, completion);
  lastAcceptedCompletionByEditor.set(editor, completions);
};

const takeLastAcceptedCompletion = (
  editor: InkwellPluginEditor,
  pluginName: string,
): string | null => {
  const completions = lastAcceptedCompletionByEditor.get(editor);
  if (!completions) return null;
  const completion = completions.get(pluginName) ?? null;
  completions.delete(pluginName);
  if (completions.size === 0) {
    lastAcceptedCompletionByEditor.delete(editor);
  }
  return completion;
};

export function createCompletionsPlugin({
  name = "completions",
  getCompletion,
  isLoading,
  loadingText = "Loading suggestion…",
  acceptHint = "[tab ↹]",
  onAccept,
  onDismiss,
  onRestore,
  restoreOnUndo = true,
}: CompletionsPluginOptions): InkwellPlugin {
  return {
    name,
    getPlaceholder: editor => {
      if (!editor.isEmpty()) return null;
      const text = getCompletion() ?? (isLoading?.() ? loadingText : null);
      if (!text) return null;
      return { text, hint: acceptHint };
    },
    onKeyDown: (event, { editor }) => {
      const completion = getCompletion();
      if (!completion) return;
      if (!editor.isEmpty()) return;

      if (event.key === "Tab") {
        event.preventDefault();
        setLastAcceptedCompletion(editor, name, completion);
        editor.insertContent(completion);
        onAccept?.(completion);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss?.(completion);
        return;
      }

      if (isPlainTypingKey(event)) {
        onDismiss?.(completion);
      }
    },
    onEditorChange: editor => {
      if (!restoreOnUndo) return;
      if (!editor.isEmpty()) return;
      const lastAcceptedCompletion = takeLastAcceptedCompletion(editor, name);
      if (!lastAcceptedCompletion) return;
      onRestore?.(lastAcceptedCompletion);
    },
  };
}
