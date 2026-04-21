import type { Text } from "mdast";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import remarkNoTables from "../lib/remark-no-tables";

// Unified pipeline: HTML → HAST → MDAST → Markdown
// Mirrors mdxeditor's MDAST-based approach instead of using Turndown.
const processor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkNoTables)
  .use(remarkStringify, {
    bullet: "-",
    emphasis: "_",
    strong: "*",
    fences: true,
    handlers: {
      // Don't escape markdown syntax in text nodes — this allows users to
      // type markdown directly in the editor (e.g. _foo_ for italic,
      // # for headings) and have it rendered via the markdown pipeline.
      text(node: Text) {
        return node.value;
      },
    },
  });

/**
 * Convert an HTML string to a markdown string
 */
export function serializeToMarkdown(html: string): string {
  return String(processor.processSync(html)).trim();
}
