import type { Paragraph, Root, Text, ThematicBreak } from "mdast";

export interface RemarkNoThematicBreakOptions {
  /**
   * The exact source string that was parsed. Used to recover the
   * verbatim marker (`***`, `___`, `- - -`, …) via `position.offset`,
   * since a standard mdast `thematicBreak` node carries neither a value
   * nor children. When omitted, the marker falls back to `---`.
   */
  source?: string;
}

/**
 * Remark plugin that disables thematic breaks. Each `thematicBreak`
 * node becomes a paragraph carrying the verbatim source marker the user
 * typed — sliced from `source` by the node's `position` offsets — so
 * `***` shows up as text `***` on the renderer side, matching the
 * editor, which slices the same offsets from the same source and never
 * recognizes thematic breaks as a structural feature. Falls back to
 * `---` only when no source/position is available (synthetic nodes).
 *
 * `source` is the escaped string parse.ts feeds the parser; thematic
 * markers (`*`/`_`/`-`/spaces) never contain `>`, so they are identical
 * in the escaped and original source — slicing either yields the same
 * marker, and the paragraph keeps the node's escaped offsets for the
 * later original-offset remap in parse.ts.
 */
export default function remarkNoThematicBreak(
  options: RemarkNoThematicBreakOptions = {},
) {
  const { source } = options;
  return (tree: Root) => {
    tree.children = tree.children.map(node => {
      if (node.type !== "thematicBreak") return node;
      const tb = node as ThematicBreak;
      const value = markerSource(tb, source) ?? "---";
      const paragraph: Paragraph = {
        type: "paragraph",
        children: [{ type: "text", value } satisfies Text],
      };
      if (tb.position) paragraph.position = tb.position;
      return paragraph;
    });
  };
}

/** Verbatim marker slice for a thematic break, or `undefined`. */
function markerSource(
  tb: ThematicBreak,
  source: string | undefined,
): string | undefined {
  if (source === undefined) return undefined;
  const start = tb.position?.start.offset;
  const end = tb.position?.end.offset;
  if (typeof start !== "number" || typeof end !== "number") return undefined;
  const slice = source.slice(start, end);
  return slice.length > 0 ? slice : undefined;
}
