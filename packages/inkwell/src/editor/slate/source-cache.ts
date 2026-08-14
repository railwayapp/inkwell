import { Node } from "slate";
import { parseMarkdownToMdast } from "../../mdast/parse";
import { canonicalize } from "./canonicalize";
import type { BlockLineRange } from "./deserialize";
import type { InkwellElement } from "./types";

/**
 * A cached slice must TERMINATE: emitting an unclosed construct (a
 * fence with no closing line, an unclosed `<pre>`/`<script>`/comment
 * HTML block) followed by `\n\n` + the next block's source makes the
 * re-parse absorb that sibling into the construct — silent content
 * loss the moment a block exists after it. The canonical fallback
 * closes fences and is always join-safe. Cheap prefilter first; the
 * sentinel parse runs only for suspicious slices.
 */
const ABSORPTION_SUSPECT_RE =
  /(^|\n)[ \t]{0,3}(`{3,}|~{3,})|<\/?(pre|script|style|textarea)\b|(^|\n)<!--/i;
const SENTINEL = "InkwellSentinel7";

function sliceTerminates(source: string): boolean {
  if (!ABSORPTION_SUSPECT_RE.test(source)) return true;
  const tree = parseMarkdownToMdast(`${source}\n\n${SENTINEL}`);
  const tail = tree.children[tree.children.length - 1];
  if (!tail || tail.type !== "paragraph") return false;
  const child = tail.children.length === 1 ? tail.children[0] : undefined;
  return !!child && child.type === "text" && child.value === SENTINEL;
}

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
 * There is no per-op invalidation: that read-time re-validation is the
 * whole consistency story, and RETAINING entries is what lets
 * edit → undo restore a block's original source style instead of the
 * canonical form. Entries are rebuilt wholesale on setContent/clear.
 */
export interface SourceCacheEntry {
  source: string;
  canonical: string;
  /**
   * Plain text of the node at populate time. Guards the canonical
   * comparison against lossy collisions: canonicalization strips
   * trailing whitespace, so a clipboard fragment clipped to `"hello"`
   * shares a canonical with the full `"hello "` block — without the
   * text check, copy would emit the unselected trailing space.
   */
  text: string;
  /**
   * Verbatim separator between this block and the NEXT top-level block
   * at parse time (`"\n"` for soft-wrap siblings and marker-alternating
   * list runs, `"\n\n"` for a normal blank line, longer for blank
   * runs). `serialize` re-emits it only when BOTH neighbors emit from
   * cache AND the recorded `nextId` still matches — so `- a\n* b\n+ c`
   * and soft-wrapped paragraphs stay byte-exact at rest instead of
   * gaining normalized blank lines. Any edit, reorder, insert, or
   * delete on either side breaks the id/adjacency check and falls back
   * to the canonical `"\n\n"` join.
   */
  gapToNext?: { nextId: string; gap: string };
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
  if (entry.text !== Node.string(node)) return undefined;
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
  cache.set(node.id, { source, canonical, text: Node.string(node) });
}

/**
 * Drop a single cache entry, forcing the block to its canonical form on
 * the next serialize. The editor does NOT call this per-op anymore —
 * `getCachedSource` re-validates every hit (canonical + text compare),
 * so retained entries can never emit stale bytes, and retaining them is
 * what lets edit → undo restore a block's original source style.
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
  ranges: (BlockLineRange | null)[],
): void {
  if (nodes.length !== ranges.length) return;
  // Carriage returns defeat the `\n`-based slicing below: lone CRs
  // (classic-Mac) desync it from micromark's line accounting entirely,
  // and CRLF slices keep their `\r`, splicing mixed line endings into
  // serialized output. Skip caching and let every block fall back to
  // its canonical (LF-normalized) form.
  if (content.includes("\r")) return;
  const lines = content.split("\n");
  let cachedIndices: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const range = ranges[i];
    // A null range means the block has no source provenance (synthetic
    // mdast node). Caching a guessed slice corrupts serialization —
    // skipping just costs the canonical fallback.
    if (!range) continue;
    const { startLine, endLine } = range;
    if (startLine < 0 || endLine >= lines.length) continue;
    const source = lines.slice(startLine, endLine + 1).join("\n");
    if (!sliceTerminates(source)) continue;
    setCacheEntry(cache, node, source, canonicalize(node));
    cachedIndices.push(i);
  }
  // Record the verbatim inter-block separator for consecutive cached
  // blocks, so at-rest serialization can re-emit the exact gap (a
  // single `\n` for soft-wrap siblings and marker-alternating lists, a
  // blank-line run for spaced-out documents) instead of the normalized
  // `\n\n`.
  cachedIndices = cachedIndices.filter(i => ranges[i] !== null);
  for (let k = 0; k + 1 < cachedIndices.length; k++) {
    const i = cachedIndices[k];
    const j = cachedIndices[k + 1];
    if (j !== i + 1) continue; // an uncached block sits between them
    const a = ranges[i];
    const b = ranges[j];
    if (!a || !b || b.startLine <= a.endLine) continue;
    const between = lines.slice(a.endLine + 1, b.startLine);
    const gap = between.length === 0 ? "\n" : `\n${between.join("\n")}\n`;
    const entry = cache.get(nodes[i].id);
    if (entry) {
      entry.gapToNext = { nextId: nodes[j].id, gap };
    }
  }
}
