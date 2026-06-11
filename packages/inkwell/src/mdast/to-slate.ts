import type {
  Blockquote,
  Code,
  Heading,
  Image,
  List,
  ListItem,
  Paragraph,
  Root,
  RootContent,
} from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import type { InkwellElement } from "../editor/slate/types";
import { generateId } from "../editor/slate/with-node-id";
import { stringifyMdast } from "./stringify";

/**
 * Convert an mdast tree into a Slate `InkwellElement[]`.
 *
 * The conversion is structural for container blocks (blockquote, list,
 * list-item) and source-faithful for leaf-bearing blocks (paragraph,
 * heading). For leaves we pull the verbatim source slice using mdast
 * `position` offsets so the inline markdown markers (`**bold**`,
 * `_italic_`, `[label](url)`, etc.) stay in the text — matching the
 * D1=visible editor model where markers live in text and the
 * decoration layer styles them.
 *
 * Standalone images (`![alt](url)` on its own line) — represented in
 * mdast as a paragraph wrapping a single image inline node — are
 * promoted to a top-level void `image` element so Slate's arrow-key
 * navigation has a block-level stop to land on. An inline-void image
 * inside an otherwise-empty paragraph would be skipped.
 *
 * Thematic breaks are intentionally not handled — `remark-no-thematic-break`
 * upstream replaces them with paragraphs, so they never reach this
 * function.
 */
export function mdastToSlate(tree: Root, content: string): InkwellElement[] {
  return tree.children
    .map(node => convertBlock(node, content))
    .filter((node): node is InkwellElement => node !== null);
}

function convertBlock(
  node: RootContent,
  content: string,
): InkwellElement | null {
  switch (node.type) {
    case "paragraph":
      return convertParagraph(node, content);
    case "heading":
      return convertHeading(node, content);
    case "blockquote":
      return convertBlockquote(node, content);
    case "list":
      return convertList(node, content);
    case "code":
      return convertCode(node);
    default:
      // Unknown block types fall back to a paragraph of their flat
      // text representation. Includes any custom mdast nodes a
      // consumer might inject via remark plugins.
      return {
        type: "paragraph",
        id: generateId(),
        children: [{ text: sourceSlice(node, content) ?? "" }],
      };
  }
}

function convertParagraph(node: Paragraph, content: string): InkwellElement {
  // Standalone image: `![alt](url)` on its own line parses as a
  // paragraph wrapping a single Image node. Promote to a top-level
  // void image block — Slate's arrow-key nav needs a block-level
  // void to land on.
  const onlyChild = node.children.length === 1 ? node.children[0] : undefined;
  if (onlyChild && onlyChild.type === "image") {
    return convertImageBlock(onlyChild);
  }

  const text = sourceSlice(node, content) ?? inlineFallback(node);
  return {
    type: "paragraph",
    id: generateId(),
    children: [{ text }],
  };
}

/**
 * Fallback text for a positionless paragraph (split parts whose value
 * desynced from the source slice — container `> `/indent prefixes,
 * entity decoding). Re-stringify the inline children instead of
 * flattening with mdast-util-to-string: the flat fallback stripped
 * `**bold**` / `[label](url)` markers from the model, silently
 * destroying formatting (and link URLs) on the first edit. The
 * canonical re-stringify keeps the structure; escape normalization
 * (e.g. `&` → `\&`) is the accepted cost.
 */
function inlineFallback(node: Paragraph): string {
  return stringifyMdast({ type: "root", children: [node] }).replace(/\n+$/, "");
}

function convertHeading(node: Heading, content: string): InkwellElement {
  const slice = sourceSlice(node, content);
  // Heading source includes the `# ` prefix (D1=visible). When we
  // fall back to mdast-util-to-string (synthetic nodes from
  // soft-break splitting, etc.) we reconstruct the prefix from
  // `depth` so the editor model still sees it as visible text.
  const text =
    slice ??
    `${"#".repeat(node.depth)} ${mdastToString(node)}`.replace(/\s+$/, "");
  return {
    type: "heading",
    id: generateId(),
    level: node.depth,
    children: [{ text }],
  };
}

function convertBlockquote(node: Blockquote, content: string): InkwellElement {
  const children = node.children
    .map(child => convertBlock(child, content))
    .filter((c): c is InkwellElement => c !== null);
  return {
    type: "blockquote",
    id: generateId(),
    children:
      children.length > 0
        ? children
        : [
            {
              type: "paragraph",
              id: generateId(),
              children: [{ text: "" }],
            },
          ],
  };
}

function convertList(node: List, content: string): InkwellElement {
  const items: InkwellElement[] = [];
  for (const child of node.children) {
    if (child.type !== "listItem") continue;
    items.push(convertListItem(child, content));
  }
  const out: InkwellElement = {
    type: "list",
    id: generateId(),
    children: items,
  };
  if (node.ordered) {
    out.ordered = true;
    if (typeof node.start === "number" && node.start !== 1) {
      out.start = node.start;
    }
  }
  return out;
}

function convertListItem(node: ListItem, content: string): InkwellElement {
  const children = node.children
    .map(child => convertBlock(child, content))
    .filter((c): c is InkwellElement => c !== null);
  return {
    type: "list-item",
    id: generateId(),
    children:
      children.length > 0
        ? children
        : [
            {
              type: "paragraph",
              id: generateId(),
              children: [{ text: "" }],
            },
          ],
  };
}

function convertCode(node: Code): InkwellElement {
  // micromark does NOT normalize line endings inside code values, so a
  // CRLF document would put literal `\r` characters into the editor
  // leaf (and serialize would emit mixed endings). Normalize to LF —
  // `\r`-containing documents skip the source cache anyway.
  const out: InkwellElement = {
    type: "code-block",
    id: generateId(),
    children: [{ text: node.value.replace(/\r\n/g, "\n") }],
  };
  if (node.lang) out.lang = node.lang;
  return out;
}

function convertImageBlock(node: Image): InkwellElement {
  return {
    type: "image",
    id: generateId(),
    url: node.url,
    alt: node.alt ?? "",
    children: [{ text: "" }],
  };
}

/**
 * Verbatim source slice for an mdast node, using its `position` byte
 * offsets. Returns `undefined` when the node lacks position info
 * (synthetic nodes inserted by a remark plugin, etc.).
 */
function sourceSlice(node: RootContent, content: string): string | undefined {
  const pos = node.position;
  if (!pos?.start || !pos?.end) return undefined;
  if (
    typeof pos.start.offset !== "number" ||
    typeof pos.end.offset !== "number"
  ) {
    return undefined;
  }
  return content.slice(pos.start.offset, pos.end.offset);
}
