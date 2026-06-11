import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import remarkNoTables from "../lib/remark-no-tables";
import remarkNoThematicBreak from "../lib/remark-no-thematic-break";
import {
  remarkSoftBreakAsBreak,
  remarkSoftBreakAsParagraph,
} from "../lib/remark-soft-break";
import type { InkwellSoftBreakBehavior } from "../types";

export interface ParseOptions {
  /** How single-newline soft breaks are represented in the resulting mdast. */
  softBreak?: InkwellSoftBreakBehavior;
}

interface EscapeResult {
  /** Source with a `\` inserted before each bare-`>` line marker. */
  escaped: string;
  /** Escaped-string indices of every inserted `\`, ascending. */
  insertions: number[];
}

/**
 * Pre-process the source so `>` at start of a line without a following
 * space stays as paragraph text. CommonMark treats both `> foo` and
 * `>foo` as blockquote markers; Inkwell only treats the space-prefixed
 * form as structural, so the typing live-trigger (`/^>\s/`) and the
 * stored model line up.
 *
 * The escape happens at the source-string level so it applies uniformly
 * across the editor's deserialize, the renderer's parse, and the
 * inline highlight pipeline — no surface can drift on the convention.
 *
 * Inserting a `\` shifts every byte after it, so the parsed mdast
 * `position.offset` values index the escaped string, not the original.
 * We return the escaped offsets of each inserted `\` so the tree can be
 * remapped back to original-source offsets after parsing — otherwise
 * any byte-offset slice against the original content (the editor's
 * verbatim leaf slices, the source cache) lands one byte too far right
 * per preceding bare-`>` line.
 */
function escapeBareBlockquote(content: string): EscapeResult {
  const originalOffsets: number[] = [];
  const escaped = content.replace(/^>(?=\S)/gm, (_match, offset: number) => {
    originalOffsets.push(offset);
    return "\\>";
  });
  // The k-th inserted `\` (0-indexed, matches run left-to-right) lands at
  // escaped index `originalOffset + k`, since each earlier insertion
  // shifted the remainder of the string by one.
  const insertions = originalOffsets.map((offset, k) => offset + k);
  return { escaped, insertions };
}

/**
 * Map an offset in the escaped string back to the original source by
 * subtracting the count of inserted `\` that precede it.
 */
function toOriginalOffset(escapedOffset: number, insertions: number[]): number {
  let inserted = 0;
  for (const at of insertions) {
    if (at < escapedOffset) inserted += 1;
    else break;
  }
  return escapedOffset - inserted;
}

/**
 * Walk the tree and rewrite every node's `position.offset` from the
 * escaped-string domain back to the original-source domain. No-op when
 * nothing was escaped, so documents without bare-`>` lines are untouched.
 */
function remapTreeOffsets(tree: Root, insertions: number[]): void {
  if (insertions.length === 0) return;
  visit(tree, node => {
    const pos = node.position;
    if (!pos) return;
    if (typeof pos.start.offset === "number") {
      pos.start.offset = toOriginalOffset(pos.start.offset, insertions);
    }
    if (typeof pos.end.offset === "number") {
      pos.end.offset = toOriginalOffset(pos.end.offset, insertions);
    }
  });
}

/**
 * Parse a markdown source string into an mdast tree shared by the editor
 * and renderer pipelines. Applies the same project-specific transforms the
 * renderer uses (GFM minus tables, soft-break shaping) so both surfaces
 * consume an identical tree.
 *
 * The tree retains `position` data for every node so callers can map back to
 * the source slice for byte-faithful round-tripping via the source cache.
 * Those offsets are remapped to the original source after parsing so the
 * bare-`>` escape stays invisible to offset-based slicing.
 */
export function parseMarkdownToMdast(
  content: string,
  options: ParseOptions = {},
): Root {
  const softBreak: InkwellSoftBreakBehavior = options.softBreak ?? "paragraph";
  const { escaped, insertions } = escapeBareBlockquote(content);

  const proc = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkNoTables)
    .use(remarkNoThematicBreak, { source: escaped });

  if (softBreak === "br") {
    proc.use(remarkSoftBreakAsBreak);
  } else if (softBreak === "paragraph") {
    proc.use(remarkSoftBreakAsParagraph);
  }

  const tree = proc.runSync(proc.parse(escaped)) as Root;
  remapTreeOffsets(tree, insertions);
  return tree;
}
