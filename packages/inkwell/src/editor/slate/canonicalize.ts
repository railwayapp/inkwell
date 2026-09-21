import { slateToMdast } from "../../mdast/from-slate";
import { stringifyMdast } from "../../mdast/stringify";
import type { InkwellElement } from "./types";

/**
 * Canonical-form serialization for a single top-level block. Routes
 * through `slateToMdast` + `stringifyMdast` and trims the trailing
 * newline `mdast-util-to-markdown` always appends. Both `serialize`
 * and the source cache call this — keeping it in its own module
 * breaks the import cycle that would otherwise exist between
 * `serialize.ts` and `source-cache.ts`.
 *
 * Memoized by node identity: Slate rebuilds the object for any block an
 * op touches (structural sharing), so an unchanged reference always has
 * an unchanged canonical form. Serialize runs over every top-level
 * block on every keystroke — without the memo each of those runs a
 * remark re-parse per block, making typing cost O(document); with it,
 * only the edited block pays.
 */
const memo = new WeakMap<InkwellElement, string>();

export function canonicalize(node: InkwellElement): string {
  const hit = memo.get(node);
  if (hit !== undefined) return hit;
  const tree = slateToMdast([node]);
  const out = stringifyMdast(tree).replace(/\n+$/, "");
  memo.set(node, out);
  return out;
}
