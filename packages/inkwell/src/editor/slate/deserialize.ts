import type { Root, RootContent } from "mdast";
import { parseMarkdownToMdast } from "../../mdast/parse";
import { mdastToSlate } from "../../mdast/to-slate";
import type { InkwellFeatures, ResolvedInkwellFeatures } from "../../types";
import { resolveFeatures } from "./features";
import type { InkwellElement } from "./types";
import { generateId } from "./with-node-id";

/** Per top-level block, the line range it occupied in the input. */
export interface BlockLineRange {
  startLine: number;
  endLine: number;
}

/**
 * Deserialize a markdown source string into Slate elements.
 *
 * Single pass: `parseMarkdownToMdast` produces an mdast tree (with
 * `remark-no-tables` / `remark-no-thematic-break` already applied) and
 * `mdastToSlate` adapts it into the editor's Slate schema. The
 * line-based regex scanner that previously implemented this is gone —
 * both surfaces of Inkwell now derive from the same mdast tree, the
 * editor adapter just shapes it differently from the renderer's hast
 * adapter.
 *
 * `features` toggles per-feature recognition. Disabled features are
 * post-processed back into paragraph text so the rest of the editor
 * (decorations, plugins, etc.) sees unmodeled syntax as plain text.
 */
export function deserialize(
  content: string,
  features?: InkwellFeatures | Partial<ResolvedInkwellFeatures>,
): InkwellElement[] {
  return deserializeWithRanges(content, features).nodes;
}

/**
 * Same as `deserialize`, but also returns per top-level block the
 * line range it occupied in the source. Used by the source-cache
 * layer to remember which characters produced which block so we can
 * re-emit the verbatim source on round-trip.
 */
export function deserializeWithRanges(
  content: string,
  features?: InkwellFeatures | Partial<ResolvedInkwellFeatures>,
): { nodes: InkwellElement[]; ranges: BlockLineRange[] } {
  if (!content) {
    return {
      nodes: [
        { type: "paragraph", id: generateId(), children: [{ text: "" }] },
      ],
      ranges: [{ startLine: 0, endLine: 0 }],
    };
  }

  const cfg = resolveFeatures(features);
  const tree = parseMarkdownToMdast(content);
  const filtered = applyFeatureGates(tree, cfg, content);
  const nodes = mdastToSlate(filtered, content);
  const ranges = filtered.children.map(toRange);

  if (nodes.length === 0) {
    return {
      nodes: [
        { type: "paragraph", id: generateId(), children: [{ text: "" }] },
      ],
      ranges: [{ startLine: 0, endLine: 0 }],
    };
  }

  // Preserve leading/trailing whitespace on the single-line plain
  // paragraph case: mdast strips leading whitespace from paragraph
  // source slices, but paste paths feed text like " there" through
  // here and expect to round-trip with the space intact. Limit to
  // single-block single-line input so we don't perturb structural
  // markdown (headings, lists, blockquotes, code fences, etc.).
  if (
    !content.includes("\n") &&
    nodes.length === 1 &&
    nodes[0].type === "paragraph"
  ) {
    nodes[0].children = [{ text: content }];
  }

  return { nodes, ranges };
}

/**
 * Re-shape the mdast tree based on the editor's per-feature toggles.
 * Disabled features collapse back into paragraph nodes whose text is
 * the original source slice — preserving what the user typed so the
 * decoration layer can still surface it as text, and so the source
 * cache round-trips unchanged.
 */
function applyFeatureGates(
  tree: Root,
  cfg: ResolvedInkwellFeatures,
  content: string,
): Root {
  const headingEnabled: Record<number, boolean> = {
    1: cfg.heading1,
    2: cfg.heading2,
    3: cfg.heading3,
    4: cfg.heading4,
    5: cfg.heading5,
    6: cfg.heading6,
  };
  const next: RootContent[] = tree.children.map(node => {
    if (node.type === "heading") {
      if (!headingEnabled[node.depth]) return paragraphFromSlice(node, content);
      return node;
    }
    if (node.type === "blockquote" && !cfg.blockquotes) {
      return paragraphFromSlice(node, content);
    }
    if (node.type === "code" && !cfg.codeBlocks) {
      return paragraphFromSlice(node, content);
    }
    if (!cfg.images && node.type === "paragraph") {
      // `![alt](url)` on its own line — mdast wraps it in a paragraph
      // with a single Image child. When images are disabled, keep
      // the source slice as plain text so the user sees what they
      // typed and the decoration layer can style it.
      const only = node.children.length === 1 ? node.children[0] : undefined;
      if (only?.type === "image") {
        return paragraphFromSlice(node, content);
      }
    }
    return node;
  });
  return { ...tree, children: next };
}

function paragraphFromSlice(node: RootContent, content: string): RootContent {
  const slice =
    node.position?.start.offset != null && node.position.end.offset != null
      ? content.slice(node.position.start.offset, node.position.end.offset)
      : "";
  return {
    type: "paragraph",
    children: [{ type: "text", value: slice }],
    position: node.position,
  };
}

function toRange(node: RootContent): BlockLineRange {
  const pos = node.position;
  if (!pos) return { startLine: 0, endLine: 0 };
  // mdast lines are 1-based; convert to the 0-based lines the source
  // cache expects (matches `content.split("\n")` indexing).
  return {
    startLine: pos.start.line - 1,
    endLine: pos.end.line - 1,
  };
}
