import type { InkwellDecorations } from "../../types";
import type { InkwellElement } from "./types";
import { generateId } from "./with-node-id";

const HEADING_RE = /^(#{1,6}) /;
const LIST_RE = /^(\s*)(\d+\.|[-*+]) /;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

/**
 * Deserialize a markdown string into Slate decorations.
 *
 * Each line becomes its own element. Block-level patterns (code fences,
 * blockquotes, list items, headings) get their own element types based
 * on the `decorations` config. Everything else is a paragraph. Text content
 * is stored verbatim — visual formatting is handled by decorations at
 * render time, not in the data model.
 */
export function deserialize(
  markdown: string,
  decorations?: InkwellDecorations,
): InkwellElement[] {
  if (!markdown) {
    return [{ type: "paragraph", id: generateId(), children: [{ text: "" }] }];
  }

  const headingEnabled = [
    decorations?.heading1 ?? true,
    decorations?.heading2 ?? true,
    decorations?.heading3 ?? true,
    decorations?.heading4 ?? true,
    decorations?.heading5 ?? true,
    decorations?.heading6 ?? true,
  ];

  const cfg = {
    lists: decorations?.lists ?? true,
    blockquotes: decorations?.blockquotes ?? true,
    codeBlocks: decorations?.codeBlocks ?? true,
    images: decorations?.images ?? true,
  };

  const lines = markdown.split("\n");
  const result: InkwellElement[] = [];
  let inCodeBlock = false;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    for (const line of paragraphLines) {
      // Headings: # through ######
      const hMatch = HEADING_RE.exec(line);
      if (hMatch && headingEnabled[hMatch[1].length - 1]) {
        result.push({
          type: "heading",
          id: generateId(),
          level: hMatch[1].length,
          children: [{ text: line.slice(hMatch[0].length) }],
        });
        continue;
      }

      const imageMatch = cfg.images ? IMAGE_RE.exec(line) : null;
      if (imageMatch) {
        result.push({
          type: "image",
          id: generateId(),
          alt: imageMatch[1],
          url: imageMatch[2],
          children: [{ text: "" }],
        });
      } else if (cfg.blockquotes && /^> /.test(line)) {
        result.push({
          type: "blockquote",
          id: generateId(),
          children: [{ text: line.slice(2) }],
        });
      } else if (cfg.lists && LIST_RE.test(line)) {
        result.push({
          type: "list-item",
          id: generateId(),
          children: [{ text: line }],
        });
      } else {
        result.push({
          type: "paragraph",
          id: generateId(),
          children: [{ text: line }],
        });
      }
    }
    paragraphLines = [];
  };

  for (const line of lines) {
    // Opening fence
    if (cfg.codeBlocks && !inCodeBlock && line.startsWith("```")) {
      flushParagraph();
      inCodeBlock = true;
      result.push({
        type: "code-fence",
        id: generateId(),
        children: [{ text: line }],
      });
      continue;
    }
    // Closing fence (exactly ```, optional trailing spaces)
    if (inCodeBlock && line.trim() === "```") {
      result.push({
        type: "code-fence",
        id: generateId(),
        children: [{ text: line }],
      });
      inCodeBlock = false;
      continue;
    }
    // Code content
    if (inCodeBlock) {
      result.push({
        type: "code-line",
        id: generateId(),
        children: [{ text: line }],
      });
      continue;
    }
    // Blank line — paragraph separator
    if (line.trim() === "") {
      flushParagraph();
      // Preserve blank line as empty paragraph
      result.push({
        type: "paragraph",
        id: generateId(),
        children: [{ text: "" }],
      });
      continue;
    }
    paragraphLines.push(line);
  }

  flushParagraph();

  // Handle unclosed code block — treat accumulated lines as plain text
  if (inCodeBlock) {
    // The elements already contain the fence + code lines, leave them
  }

  return result.length > 0
    ? result
    : [{ type: "paragraph", id: generateId(), children: [{ text: "" }] }];
}
