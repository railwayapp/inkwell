import type { Break, Paragraph, PhrasingContent, Root, Text } from "mdast";
import { SKIP, visit } from "unist-util-visit";

/**
 * Split a text node on `\n` characters, returning a list of phrasing children
 * with `break` nodes inserted in place of each newline.
 */
function splitTextOnNewlines(text: Text): PhrasingContent[] {
  if (!text.value.includes("\n")) return [text];
  const parts = text.value.split("\n");
  const result: PhrasingContent[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== "") {
      result.push({ type: "text", value: parts[i] } satisfies Text);
    }
    if (i < parts.length - 1) {
      result.push({ type: "break" } satisfies Break);
    }
  }
  return result;
}

/**
 * Expand any `\n` characters inside text-node children into `break` nodes.
 * Returns the new children list, or `null` if nothing changed.
 */
function expandParagraphChildren(
  children: readonly PhrasingContent[],
): PhrasingContent[] | null {
  let changed = false;
  const next: PhrasingContent[] = [];
  for (const child of children) {
    if (child.type === "text" && child.value.includes("\n")) {
      next.push(...splitTextOnNewlines(child));
      changed = true;
    } else {
      next.push(child);
    }
  }
  return changed ? next : null;
}

/**
 * Remark plugin that turns CommonMark soft breaks (newlines inside a
 * paragraph) into `break` mdast nodes, which mdast-util-to-hast renders as
 * `<br />`.
 *
 * Only paragraph children are touched. Code blocks keep their value verbatim;
 * lists and blockquotes are unaffected at their own level — paragraphs nested
 * inside them are still visited.
 */
export function remarkSoftBreakAsBreak() {
  return (tree: Root) => {
    visit(tree, "paragraph", (node: Paragraph) => {
      const expanded = expandParagraphChildren(node.children);
      if (expanded) node.children = expanded;
    });
  };
}

/**
 * Remark plugin that splits a paragraph at every soft break, producing
 * sibling paragraph nodes that render with normal paragraph margins.
 *
 * Only paragraph nodes are split. Code blocks stay intact because their
 * content lives on `value`, not in phrasing children. List items and
 * blockquotes that wrap a soft-break-containing paragraph end up with two
 * sibling paragraphs inside the same container, which is the standard
 * GFM-style representation for "multiple paragraphs in one list item".
 */
export function remarkSoftBreakAsParagraph() {
  return (tree: Root) => {
    visit(tree, "paragraph", (node: Paragraph, index, parent) => {
      if (!parent || index == null) return;

      const expanded =
        expandParagraphChildren(node.children) ?? node.children.slice();
      const breakIndices: number[] = [];
      for (let i = 0; i < expanded.length; i++) {
        if (expanded[i].type === "break") breakIndices.push(i);
      }
      if (breakIndices.length === 0) {
        return;
      }

      const newParagraphs: Paragraph[] = [];
      let start = 0;
      for (const breakIdx of [...breakIndices, expanded.length]) {
        if (breakIdx > start) {
          newParagraphs.push({
            type: "paragraph",
            children: expanded.slice(start, breakIdx),
          });
        }
        start = breakIdx + 1;
      }

      // biome-ignore lint/suspicious/noExplicitAny: mdast parent.children union
      (parent as any).children.splice(index, 1, ...newParagraphs);
      return [SKIP, index + newParagraphs.length];
    });
  };
}
