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
  // Walk line by line, tracking top-level fenced-code state so `>` lines
  // inside fences are never escaped — code content is verbatim, so an
  // injected `\` would land in `code.value` and show up on both surfaces
  // (`>>> doctest`, diff/email quotes, shell `2>err` heredocs).
  // The scanner only models column-0..3 fences; fences carrying a
  // blockquote prefix (`> ```) can't contain column-0 `>` lines anyway.
  // Known limitation: an inline code span that wraps a newline followed
  // by a bare-`>` line still gets escaped — code spans are not visible
  // at this line-based layer.
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let lineStart = 0;
  while (lineStart <= content.length) {
    const nl = content.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? content.length : nl;
    const line = content.slice(lineStart, lineEnd);
    if (inFence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(line);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        inFence = false;
      }
    } else {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      // A backtick fence's info string cannot contain backticks — a line
      // like ``` `code` ``` is a code span, not a fence opener.
      const isOpener =
        open &&
        !(open[1][0] === "`" && line.slice(open[0].length).includes("`"));
      if (isOpener) {
        inFence = true;
        fenceChar = open[1][0];
        fenceLen = open[1].length;
      } else if (/^>(?=\S)/.test(line)) {
        originalOffsets.push(lineStart);
      }
    }
    if (nl === -1) break;
    lineStart = nl + 1;
  }

  if (originalOffsets.length === 0) {
    return { escaped: content, insertions: [] };
  }
  let escaped = "";
  let prev = 0;
  for (const offset of originalOffsets) {
    escaped += content.slice(prev, offset) + "\\";
    prev = offset;
  }
  escaped += content.slice(prev);
  // The k-th inserted `\` (0-indexed, offsets ascend) lands at escaped
  // index `originalOffset + k`, since each earlier insertion shifted the
  // remainder of the string by one.
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
  // Plugins may alias the same Point object into multiple nodes'
  // positions (the soft-break paragraph splitter reuses boundary
  // children's points for the split paragraph). Track visited Points by
  // identity so an aliased Point is never remapped twice — a double
  // subtraction would shift the offset one byte left per bare-`>` line.
  const seen = new Set<object>();
  visit(tree, node => {
    const pos = node.position;
    if (!pos) return;
    for (const point of [pos.start, pos.end]) {
      if (seen.has(point)) continue;
      seen.add(point);
      if (typeof point.offset === "number") {
        point.offset = toOriginalOffset(point.offset, insertions);
      }
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

  // The shapers take the (escaped) source so split text parts can carry
  // real positions — the editor's verbatim slicing and the source cache
  // both depend on split paragraphs staying positioned.
  if (softBreak === "br") {
    proc.use(remarkSoftBreakAsBreak, { source: escaped });
  } else if (softBreak === "paragraph") {
    proc.use(remarkSoftBreakAsParagraph, { source: escaped });
  }

  const tree = proc.runSync(proc.parse(escaped)) as Root;
  remapTreeOffsets(tree, insertions);
  return tree;
}
