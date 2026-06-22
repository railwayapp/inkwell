import { Node } from "slate";
import type { InkwellElement } from "./types";

/**
 * Serialize Slate elements back to a markdown string, the inverse of the
 * line-based `deserialize`. Same-group nodes (paragraph/blockquote/code) join
 * with `\n`; different block types join with `\n\n` (valid CommonMark).
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

  // Join: consecutive same-group elements (paragraph/blockquote/code) use \n,
  // everything else uses \n\n.
  const codeTypes = new Set(["code-fence", "code-line"]);
  let result = "";
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) {
      const prev = entries[i - 1];
      const curr = entries[i];
      const sameGroup =
        (prev.type === "paragraph" && curr.type === "paragraph") ||
        (prev.type === "blockquote" && curr.type === "blockquote") ||
        (codeTypes.has(prev.type) && codeTypes.has(curr.type));
      result += sameGroup ? "\n" : "\n\n";
    }
    result += entries[i].text;
  }

  // Trim leading/trailing blank lines and collapse runs of 3+ blanks to 2,
  // but preserve leading whitespace on individual lines (Markdown list indent).
  return result.replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
}
