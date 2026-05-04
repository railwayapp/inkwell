import { Node } from "slate";
import type { InkwellEditor } from "./types";

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
  const { insertText, insertData } = editor;

  editor.insertText = (text: string) => {
    const cfg = configRef.current;
    if (cfg.enforce && cfg.limit !== undefined) {
      const current = Node.string(editor).length;
      if (current + text.length > cfg.limit) {
        const remaining = Math.max(0, cfg.limit - current);
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
      const current = Node.string(editor).length;
      if (pasted && current + pasted.length > cfg.limit) {
        const remaining = Math.max(0, cfg.limit - current);
        if (remaining === 0) return;
        return insertText(pasted.slice(0, remaining));
      }
    }
    insertData(data);
  };

  return editor;
}
