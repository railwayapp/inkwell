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

    // Headings: re-add "#" prefix (stripped during deserialize).
    if (type === "heading") {
      const level = (node as InkwellElement & { level?: number }).level ?? 1;
      const prefix = "#".repeat(level);
      entries.push({ text: `${prefix} ${text}`, type });
      continue;
    }

    // Blockquotes: re-add "> " prefix (stripped during deserialize).
    // Escape leading ">" in content to prevent nested blockquote parsing.
    if (type === "blockquote") {
      const lines = text.split("\n").filter(l => l.trim() !== "");
      if (lines.length === 0) {
        entries.push({ text: "> ", type });
      } else {
        const prefixed = lines
          .map(line => {
            const escaped = line.replace(/^(>+)/g, m => "\\>".repeat(m.length));
            return "> " + escaped;
          })
          .join("\n>\n");
        entries.push({ text: prefixed, type });
      }
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
  // everything else uses \n\n
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
