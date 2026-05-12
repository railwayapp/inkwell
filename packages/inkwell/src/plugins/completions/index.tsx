"use client";

import type { KeyboardEvent } from "react";
import { Editor, Transforms } from "slate";
import { deserialize } from "../../editor/slate/deserialize";
import { serialize } from "../../editor/slate/serialize";
import type { InkwellElement } from "../../editor/slate/types";
import type { InkwellPlugin, RehypePluginConfig } from "../../types";

export interface CompletionPluginOptions {
  /** Unique plugin name. Defaults to `completions`. */
  name?: string;
  /** Markdown completion to render as placeholder text. Return null when inactive. */
  getCompletion: () => string | null;
  /** Whether to show a loading placeholder while no completion is available. */
  isLoading?: () => boolean;
  /** Text shown while `isLoading()` is true. */
  loadingText?: string;
  /** Hint rendered as a pill while the completion placeholder is visible. */
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
  /** Reserved for API compatibility. Native placeholders are plain text. */
  rehypePlugins?: RehypePluginConfig[];
}

const isPlainTypingKey = (event: KeyboardEvent): boolean => {
  return (
    event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
  );
};

const getSerializedMarkdown = (editor: Editor): string => {
  return serialize(editor.children as InkwellElement[]);
};

const isEditorEmpty = (editor: Editor): boolean => {
  return getSerializedMarkdown(editor).trim().length === 0;
};

const insertCompletion = (editor: Editor, completion: string): void => {
  const nodes = deserialize(completion);
  Transforms.insertFragment(editor, nodes);
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
}: CompletionPluginOptions): InkwellPlugin {
  // Per-plugin-instance map of editors to the most recently accepted
  // completion. Module scope would mean two `createCompletionsPlugin`
  // instances on the same editor clobber each other's undo-restore state.
  const lastAcceptedCompletionByEditor = new WeakMap<Editor, string>();

  return {
    name,
    render: () => null,
    getPlaceholder: (editor: Editor) => {
      if (!isEditorEmpty(editor)) return null;
      const text = getCompletion() ?? (isLoading?.() ? loadingText : null);
      if (!text) return null;
      return { text, hint: acceptHint };
    },
    onKeyDown: (event, _ctx, editor) => {
      const completion = getCompletion();
      if (!completion) return;
      if (!isEditorEmpty(editor)) return;

      if (event.key === "Tab") {
        event.preventDefault();
        lastAcceptedCompletionByEditor.set(editor, completion);
        insertCompletion(editor, completion);
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
    onEditorChange: (editor: Editor) => {
      if (!restoreOnUndo) return;
      const lastAcceptedCompletion = lastAcceptedCompletionByEditor.get(editor);
      if (!lastAcceptedCompletion) return;
      if (!isEditorEmpty(editor)) return;

      lastAcceptedCompletionByEditor.delete(editor);
      onRestore?.(lastAcceptedCompletion);
    },
  };
}
