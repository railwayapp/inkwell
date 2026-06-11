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
 */
export function canonicalize(node: InkwellElement): string {
  const tree = slateToMdast([node]);
  return stringifyMdast(tree).replace(/\n+$/, "");
}
