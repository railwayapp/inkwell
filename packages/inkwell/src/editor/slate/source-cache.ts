import { canonicalize } from "./canonicalize";
import type { BlockLineRange } from "./deserialize";
import type { InkwellElement } from "./types";

/**
 * Per-block source cache. The editor instance owns one of these and
 * threads it through `deserialize` (at parse time) and `serialize`
 * (when emitting `text/plain` source).
 *
 * Why this exists: `mdast-util-to-markdown`-style canonical
 * serialization normalizes harmless source differences — `> a\n> b`
 * becomes `> a\n>\n> b`, `***` becomes `---`, the bullet character
 * becomes `-`. Without a cache, every round-trip rewrites the
 * document into the canonical form, which surprises users (their
 * source style flips after a save).
 *
 * The cache keys per top-level block by Slate node id and stores:
 * - `source`: the verbatim slice of the input string that produced
 *   this block.
 * - `canonical`: what `serialize([block])` returned at parse time.
 *
 * On serialize, we recompute the canonical form and compare. Equal →
 * the block hasn't structurally changed, emit `source`. Different →
 * the block has been edited, emit the fresh canonical form.
 *
 * Invalidation is triggered by an `editor.apply` interceptor — any
 * op whose path touches a top-level block drops that block's cache
 * entry. We don't try to be precise about which sub-mutations
 * preserve canonical equivalence; falling back to the canonical form
 * for an edited block is correct, just less stylistically faithful.
 */
export interface SourceCacheEntry {
  source: string;
  canonical: string;
}

export type SourceCache = Map<string, SourceCacheEntry>;

export function createSourceCache(): SourceCache {
  return new Map();
}

/**
 * Look up the cached source slice for a node. Returns `undefined` when
 * the cache has no entry or the node's current canonical form has
 * drifted from the cached one (meaning the block has been edited
 * since parse time).
 */
export function getCachedSource(
  cache: SourceCache,
  node: InkwellElement,
  currentCanonical: string,
): string | undefined {
  const entry = cache.get(node.id);
  if (!entry) return undefined;
  if (entry.canonical !== currentCanonical) return undefined;
  return entry.source;
}

/**
 * Populate a cache entry for a freshly-parsed top-level block.
 *
 * `source` should be the verbatim slice of input that the block came
 * from; `canonical` should be `canonicalize(node)`.
 */
export function setCacheEntry(
  cache: SourceCache,
  node: InkwellElement,
  source: string,
  canonical: string,
): void {
  cache.set(node.id, { source, canonical });
}

/**
 * Drop a single cache entry. Called when a Slate op edits the block.
 */
export function invalidateCacheEntry(cache: SourceCache, id: string): void {
  cache.delete(id);
}

/**
 * Populate the cache after a fresh parse. `content` is the input
 * string; `nodes` and `ranges` come paired from
 * `deserializeWithRanges`. For each top-level block we slice the
 * original source by line range and record the canonical form so
 * subsequent serializes can detect "no structural change".
 */
export function populateSourceCacheFromParse(
  cache: SourceCache,
  content: string,
  nodes: InkwellElement[],
  ranges: BlockLineRange[],
): void {
  if (nodes.length !== ranges.length) return;
  const lines = content.split("\n");
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const { startLine, endLine } = ranges[i];
    if (startLine < 0 || endLine >= lines.length) continue;
    const source = lines.slice(startLine, endLine + 1).join("\n");
    setCacheEntry(cache, node, source, canonicalize(node));
  }
}
