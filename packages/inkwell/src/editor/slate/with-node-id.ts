import { Element } from "slate";
import type { InkwellEditor, InkwellElement } from "./types";

/**
 * Generate a unique element ID.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Slate plugin that ensures every Element node has a unique `id`.
 *
 * Intercepts `apply` to:
 * - Assign a fresh ID to inserted Elements that lack one
 * - Assign a fresh ID after split operations (prevents duplicates
 *   when Slate clones an Element's properties during a split)
 */
export function withNodeId(editor: InkwellEditor): InkwellEditor {
  const { apply } = editor;

  editor.apply = operation => {
    if (operation.type === "insert_node") {
      const node = operation.node;
      if (Element.isElement(node)) {
        const el = node as InkwellElement;
        if (!el.id) {
          operation = {
            ...operation,
            node: { ...node, id: generateId() },
          };
        }
      }
    }

    if (operation.type === "split_node") {
      const props = operation.properties;
      // Element splits have 'type' in properties; text splits don't
      if ("type" in props) {
        operation = {
          ...operation,
          properties: { ...props, id: generateId() },
        };
      }
    }

    apply(operation);
  };

  return editor;
}
