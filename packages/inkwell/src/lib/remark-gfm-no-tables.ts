import {
  gfmAutolinkLiteralFromMarkdown,
  gfmAutolinkLiteralToMarkdown,
} from "mdast-util-gfm-autolink-literal";
import {
  gfmFootnoteFromMarkdown,
  gfmFootnoteToMarkdown,
} from "mdast-util-gfm-footnote";
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from "mdast-util-gfm-strikethrough";
import {
  gfmTaskListItemFromMarkdown,
  gfmTaskListItemToMarkdown,
} from "mdast-util-gfm-task-list-item";
import type { Options as ToMarkdownExtension } from "mdast-util-to-markdown";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import type { Processor } from "unified";

/**
 * The `mdast-util-to-markdown` extension bundle matching the parse-side
 * subset below. Used directly by `stringifyMdast` (which calls
 * `toMarkdown` without a unified processor).
 *
 * Table support is deliberately absent on BOTH sides: with it present
 * only in the stringifier, `|` would be listed as an unsafe character
 * and every pipe in plain paragraph text would serialize as `\|`.
 */
export function gfmNoTablesToMarkdown(): ToMarkdownExtension {
  return {
    extensions: [
      gfmAutolinkLiteralToMarkdown(),
      gfmFootnoteToMarkdown(),
      gfmStrikethroughToMarkdown(),
      gfmTaskListItemToMarkdown(),
    ],
  };
}

/**
 * GFM without tables: autolink literals, footnotes, strikethrough, and
 * task-list items.
 *
 * Inkwell does not model tables — they stay plain paragraph text on
 * both surfaces (the editor shows the typed pipe rows verbatim; the
 * renderer shows the same text). Disabling the table syntax extension
 * at the micromark level — instead of parsing tables and flattening
 * them back to text (the old `remark-no-tables` plugin) — means the
 * source is never reconstructed from a lossy table tree: rows keep
 * their exact bytes, positions stay real, and the source cache can do
 * its job at any nesting depth.
 */
export default function remarkGfmNoTables(this: Processor) {
  const data = this.data();

  const micromarkExtensions =
    data.micromarkExtensions || (data.micromarkExtensions = []);
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

  micromarkExtensions.push(
    gfmAutolinkLiteral(),
    gfmFootnote(),
    gfmStrikethrough(),
    gfmTaskListItem(),
  );
  fromMarkdownExtensions.push(
    gfmAutolinkLiteralFromMarkdown(),
    gfmFootnoteFromMarkdown(),
    gfmStrikethroughFromMarkdown(),
    gfmTaskListItemFromMarkdown(),
  );
  toMarkdownExtensions.push(gfmNoTablesToMarkdown());
}
