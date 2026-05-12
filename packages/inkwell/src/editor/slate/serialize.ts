import { Node } from "slate";
import type { InkwellElement } from "./types";

/**
 * Serialize Slate elements back to a markdown string.
 *
 * Consecutive code elements (fence + lines) and consecutive blockquotes/
 * list items are joined with single newlines. Everything else uses double
 * newlines (paragraph breaks).
 */
export function serialize(nodes: InkwellElement[]): string {
  const entries: { text: string; type: string }[] = [];

  for (const node of nodes) {
    const text = Node.string(node);
    const type = node.type;

    // Markdown source markers are stored as text. Element metadata only drives
    // rendering and editing behavior; serialization returns the source content.
    // Image nodes created by plugins may not have source text yet, so synthesize
    // their source form from node metadata at the content boundary.
    if (type === "image" && !text) {
      const url = node.url ?? "";
      const alt = node.alt ?? "";
      entries.push({ text: `![${alt}](${url})`, type });
      continue;
    }

    // Skip empty paragraphs that are just separators
    if (type === "paragraph" && !text.trim()) {
      entries.push({ text: "", type });
      continue;
    }

    entries.push({ text, type });
  }

  // Join: consecutive code/blockquote/list elements use \n,
  // everything else uses \n\n.
  const codeTypes = new Set(["code-fence", "code-line"]);
  let result = "";
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) {
      const prev = entries[i - 1].type;
      const curr = entries[i].type;
      const sameGroup =
        (prev === "blockquote" && curr === "blockquote") ||
        (prev === "list-item" && curr === "list-item") ||
        (codeTypes.has(prev) && codeTypes.has(curr));
      result += sameGroup ? "\n" : "\n\n";
    }
    result += entries[i].text;
  }

  // Clean up excessive blank lines
  return result.replace(/\n{3,}/g, "\n\n").trim();
}
