import type { Text } from "mdast";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

// Unified pipeline: HTML → HAST → MDAST → Markdown
// Mirrors mdxeditor's MDAST-based approach instead of using Turndown.
//
// remark-gfm (WITH tables) is intentional here, unlike the parse
// pipeline: this converts foreign HTML to markdown text, and an HTML
// <table> stringifies to pipe-table rows with every cell intact. The
// editor then shows those rows as plain text (its parse side has no
// table syntax), which is Inkwell's representation for tables.
const processor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeRemark)
  .use(remarkGfm)
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
export function htmlToMarkdown(html: string): string {
  return String(processor.processSync(html)).trim();
}
