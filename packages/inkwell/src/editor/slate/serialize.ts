import { canonicalize } from "./canonicalize";
import { getCachedSource, type SourceCache } from "./source-cache";
import type { InkwellElement } from "./types";

export interface SerializeOptions {
  /**
   * Optional per-block source cache (see `source-cache.ts`). When
   * provided, each top-level block is emitted as the cached source
   * slice if its current canonical form matches the cached one,
   * preserving byte-for-byte fidelity for untouched blocks. Edited
   * blocks fall back to the canonical form produced by
   * `slateToMdast → stringifyMdast`.
   */
  cache?: SourceCache;
}

/**
 * Serialize Slate elements back to a markdown string.
 *
 * Single pass: `slateToMdast` adapts the Slate tree into an mdast
 * tree (re-parsing inline content from paragraph text so the markers
 * become structural inline nodes), then `stringifyMdast` emits
 * canonical markdown via `mdast-util-to-markdown`. The bespoke
 * blockquote/list source-emission logic that used to live here is
 * gone — both Inkwell surfaces produce markdown through the same
 * stringifier now.
 *
 * Source-cache short-circuit: for each top-level block, recompute the
 * canonical form and compare against the cached one. On match, emit
 * the cached source slice verbatim — that's how `> a\n> b` survives
 * round-trip even though mdast would canonicalize it to
 * `> a\n>\n> b`.
 */
export function serialize(
  nodes: InkwellElement[],
  options: SerializeOptions = {},
): string {
  const cache = options.cache;
  const pieces: {
    text: string;
    node: InkwellElement;
    cached: boolean;
    /** Position in the ORIGINAL nodes array — see the join below. */
    index: number;
  }[] = [];

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (cache) {
      const canonical = canonicalize(node);
      const cached = getCachedSource(cache, node, canonical);
      if (cached !== undefined) {
        pieces.push({ text: cached, node, cached: true, index });
        continue;
      }
      pieces.push({ text: canonical, node, cached: false, index });
      continue;
    }
    pieces.push({ text: canonicalize(node), node, cached: false, index });
  }

  // mdast-util-to-markdown emits a trailing newline per block. Trim
  // newlines at each piece's EDGES only — blank-run collapsing must
  // never reach inside a piece, where a cached code-block slice can
  // legitimately contain consecutive blank lines (a document-wide
  // `\n{3,}` collapse here used to corrupt those even for untouched,
  // cache-faithful blocks).
  const cleaned = pieces
    .map(p => ({ ...p, text: p.text.replace(/^\n+|\n+$/g, "") }))
    .filter(p => p.text.length > 0);

  // Join with the normalized blank line — EXCEPT between two blocks
  // that both emitted their cached source and are TRULY adjacent: same
  // recorded id pair AND consecutive in the live nodes array. The
  // index check matters — empty blocks are filtered out above, so
  // without it a freshly inserted empty paragraph between two cached
  // soft-wrap siblings would be invisible to the join, the output
  // would be byte-identical to the previous serialize, and the echo
  // guard would swallow the onChange for a visible editor change.
  let out = "";
  for (let i = 0; i < cleaned.length; i++) {
    if (i > 0) {
      let sep = "\n\n";
      const prev = cleaned[i - 1];
      const cur = cleaned[i];
      if (cache && prev.cached && cur.cached && cur.index === prev.index + 1) {
        const gap = cache.get(prev.node.id)?.gapToNext;
        if (gap && gap.nextId === cur.node.id) sep = gap.gap;
      }
      out += sep;
    }
    out += cleaned[i].text;
  }
  return out;
}

export { canonicalize } from "./canonicalize";
