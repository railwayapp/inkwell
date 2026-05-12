import { Editor, Node, Range } from "slate";
import type { InkwellEditor } from "./types";

/**
 * Effective length of the document if the current selection were
 * deleted. Slate's `insertText`/`insertData` first delete the selection
 * (when non-collapsed) and then insert, so any limit check needs to use
 * the post-deletion length, not the raw `Node.string(editor).length`.
 */
function effectiveLength(editor: InkwellEditor): number {
  const total = Node.string(editor).length;
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection)) return total;
  try {
    const selectedText = Editor.string(editor, selection);
    return total - selectedText.length;
  } catch {
    return total;
  }
}

function remainingCharacters(editor: InkwellEditor, limit: number): number {
  return Math.max(0, limit - effectiveLength(editor));
}

function truncateFragment(fragment: Node[], maxChars: number): Node[] {
  let text = "";
  for (const node of fragment) {
    if (text.length >= maxChars) break;
    text += Node.string(node).slice(0, maxChars - text.length);
  }
  if (text.length === 0) return [];
  return [{ text }];
}

/**
 * Create a `DataTransfer`-shaped clone of `original` with the
 * `text/plain` payload sliced to `maxChars`. We avoid `new DataTransfer()`
 * because it is not available in jsdom and we only need the subset of the
 * interface that Slate's `insertData` calls (`getData`, `types`, `files`,
 * `items`).
 */
function truncateDataTransfer(
  original: DataTransfer,
  maxChars: number,
): DataTransfer {
  const truncatedPlain = original.getData("text/plain").slice(0, maxChars);
  // Copy through types other than plain text untouched. Slate paste
  // handlers may read HTML, vnd.slate-fragment, etc.
  const passthrough = new Map<string, string>();
  for (const type of original.types ?? []) {
    if (type === "text/plain") continue;
    passthrough.set(type, original.getData(type));
  }
  return {
    types: original.types ?? [],
    files: original.files,
    items: original.items,
    getData: (type: string) =>
      type === "text/plain" ? truncatedPlain : (passthrough.get(type) ?? ""),
    setData: () => {},
    clearData: () => {},
    setDragImage: () => {},
    dropEffect: original.dropEffect,
    effectAllowed: original.effectAllowed,
  } as DataTransfer;
}

/**
 * Runtime configuration for the character-limit enforcement.
 * Read via a ref so the editor instance reacts to prop changes.
 */
export interface CharacterLimitConfig {
  limit: number | undefined;
  enforce: boolean;
}

/**
 * Slate plugin that clamps `insertText` and `insertData` against a configured
 * character limit. Enforcement is opt-in — when `enforce` is false (or no
 * limit is configured) the plugin is a no-op.
 *
 * The caller owns the config ref; updating `configRef.current` immediately
 * changes the active behavior.
 */
export function withCharacterLimit(
  editor: InkwellEditor,
  configRef: { current: CharacterLimitConfig },
): InkwellEditor {
  const { insertText, insertData, insertFragment } = editor;

  editor.insertText = (text: string) => {
    const cfg = configRef.current;
    if (cfg.enforce && cfg.limit !== undefined) {
      const current = effectiveLength(editor);
      if (current + text.length > cfg.limit) {
        const remaining = remainingCharacters(editor, cfg.limit);
        if (remaining === 0) return;
        return insertText(text.slice(0, remaining));
      }
    }
    insertText(text);
  };

  editor.insertData = (data: DataTransfer) => {
    const cfg = configRef.current;
    if (cfg.enforce && cfg.limit !== undefined) {
      const pasted = data.getData("text/plain");
      const current = effectiveLength(editor);
      if (pasted && current + pasted.length > cfg.limit) {
        const remaining = remainingCharacters(editor, cfg.limit);
        if (remaining === 0) return;
        // Re-emit the paste through `insertData` with a truncated
        // text/plain payload so downstream paste handling (markdown
        // parsing, attachments, etc.) still runs against the trimmed
        // input rather than collapsing the structured paste into raw text.
        return insertData(truncateDataTransfer(data, remaining));
      }
    }
    insertData(data);
  };

  editor.insertFragment = (fragment: Node[]) => {
    const cfg = configRef.current;
    if (cfg.enforce && cfg.limit !== undefined) {
      const fragmentLength = fragment.reduce(
        (sum, node) => sum + Node.string(node).length,
        0,
      );
      const current = effectiveLength(editor);
      if (current + fragmentLength > cfg.limit) {
        const remaining = remainingCharacters(editor, cfg.limit);
        if (remaining === 0) return;
        const truncated = truncateFragment(fragment, remaining);
        if (truncated.length === 0) return;
        return insertFragment(truncated);
      }
    }
    insertFragment(fragment);
  };

  return editor;
}
