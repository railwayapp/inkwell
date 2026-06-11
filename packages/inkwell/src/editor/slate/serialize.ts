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
  const pieces: string[] = [];

  for (const node of nodes) {
    if (cache) {
      const canonical = canonicalize(node);
      const cached = getCachedSource(cache, node, canonical);
      if (cached !== undefined) {
        pieces.push(cached);
        continue;
      }
      pieces.push(canonical);
      continue;
    }
    pieces.push(canonicalize(node));
  }

  // mdast-util-to-markdown emits a trailing newline per block. Trim
  // newlines at each piece's EDGES only, then join with one blank line —
  // blank-run collapsing must never reach inside a piece, where a cached
  // code-block slice can legitimately contain consecutive blank lines
  // (a document-wide `\n{3,}` collapse here used to corrupt those even
  // for untouched, cache-faithful blocks).
  return pieces
    .map(p => p.replace(/^\n+|\n+$/g, ""))
    .filter(p => p.length > 0)
    .join("\n\n");
}

export { canonicalize } from "./canonicalize";
