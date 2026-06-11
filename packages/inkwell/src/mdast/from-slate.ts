import type {
  Blockquote,
  Code,
  Heading,
  Image,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { Node } from "slate";
import { unified } from "unified";
import type { InkwellElement } from "../editor/slate/types";
import { parseMarkdownToMdast } from "./parse";

/**
 * Convert a Slate `InkwellElement[]` back into an mdast tree.
 *
 * Block-level conversion is direct (each Slate element maps 1:1 to an
 * mdast type). Inline content lives in Slate as flat text with the
 * markdown markers in it (`**bold**`, `[label](url)`, etc., per the
 * D1=visible model). To emit a valid mdast tree we *re-parse* each
 * inline text through remark so `mdast-util-to-markdown` (the
 * stringify pass) sees structured `Strong`/`Emphasis`/`Link`/etc.
 * nodes and emits them correctly without escaping the markers.
 *
 * Round-trip: source ──parse──▶ mdast ──to-slate──▶ Slate (text with
 * markers) ──from-slate──▶ mdast (markers re-parsed) ──stringify──▶
 * source. For untouched blocks the source cache short-circuits the
 * stringify and re-emits the original slice, so style normalizations
 * (`*` → `-`, `> a\n> b` → `> a\n>\n> b`, etc.) only fire for edited
 * blocks.
 */
export function slateToMdast(nodes: InkwellElement[]): Root {
  return {
    type: "root",
    children: nodes
      .map(convertBlock)
      .filter((n): n is RootContent => n !== null),
  };
}

function convertBlock(node: InkwellElement): RootContent | null {
  switch (node.type) {
    case "paragraph":
      return convertParagraphBlock(node);
    case "heading":
      return convertHeadingBlock(node);
    case "blockquote":
      return convertBlockquoteBlock(node);
    case "list":
      return convertListBlock(node);
    case "list-item":
      // List items only appear as children of a list; if one shows up
      // at the top level it's likely an editor state mid-transform.
      // Wrap in a stub list so the tree stays valid.
      return {
        type: "list",
        ordered: false,
        spread: false,
        children: [convertListItemNode(node)],
      } satisfies List;
    case "code-block":
      return convertCodeBlock(node);
    case "image":
      return convertImageBlock(node);
    default:
      return null;
  }
}

function convertParagraphBlock(node: InkwellElement): Paragraph {
  const text = Node.string(node);
  return {
    type: "paragraph",
    children: parseInline(text),
  };
}

const HEADING_PREFIX_RE = /^(#{1,6})\s+/;

function convertHeadingBlock(node: InkwellElement): Heading {
  const raw = Node.string(node);
  const match = HEADING_PREFIX_RE.exec(raw);
  const inner = match ? raw.slice(match[0].length) : raw;
  const depth = clampHeadingDepth(node.level ?? match?.[1].length ?? 1);
  return {
    type: "heading",
    depth,
    children: parseInline(inner),
  };
}

function clampHeadingDepth(level: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (level <= 1) return 1;
  if (level >= 6) return 6;
  return level as 1 | 2 | 3 | 4 | 5 | 6;
}

function convertBlockquoteBlock(node: InkwellElement): Blockquote {
  // Legacy compatibility: older blockquote shapes stored their `> `
  // marker as text directly on the blockquote element (no inner
  // paragraph). Re-parse that text as a full markdown sub-document so
  // any structural markers it contained (nested blockquotes, lists,
  // etc.) are recovered — the legacy text `> nested` round-trips back
  // to `> > nested` instead of `> \> nested` or `> nested`.
  const hasTextChild = node.children.some(c => "text" in c);
  if (hasTextChild) {
    const text = Node.string(node);
    const subTree = parseMarkdownToMdast(text);
    const children = subTree.children.filter(
      (c): c is ContainerChild =>
        c.type === "paragraph" ||
        c.type === "blockquote" ||
        c.type === "list" ||
        c.type === "code",
    );
    return {
      type: "blockquote",
      children:
        children.length > 0
          ? children
          : [{ type: "paragraph", children: parseInline(text) }],
    };
  }
  return {
    type: "blockquote",
    children: convertContainerChildren(node, {
      keepEmptyParagraphs: "edges",
    }),
  };
}

function convertListBlock(node: InkwellElement): List {
  const items: ListItem[] = [];
  for (const child of node.children) {
    if ("text" in child) continue;
    if (child.type !== "list-item") continue;
    items.push(convertListItemNode(child));
  }
  const out: List = {
    type: "list",
    ordered: node.ordered === true,
    spread: false,
    children: items,
  };
  if (out.ordered && typeof node.start === "number" && node.start !== 1) {
    out.start = node.start;
  }
  return out;
}

function convertListItemNode(node: InkwellElement): ListItem {
  return {
    type: "listItem",
    spread: false,
    children: convertContainerChildren(node, { keepEmptyParagraphs: "none" }),
  };
}

type EmptyParagraphPolicy = "none" | "edges";

type ContainerChild = Paragraph | Blockquote | List | Code;

function isEmptyParagraph(node: ContainerChild): boolean {
  return node.type === "paragraph" && node.children.length === 0;
}

/**
 * Convert the block children of a container (blockquote / list-item).
 *
 * Empty paragraphs are an editor-side representation artifact (a cursor
 * target). Their treatment depends on the container:
 *
 * - `"none"` (list item): drop all empty paragraphs. mdast list items
 *   gain extra blank lines for empty paragraph children, which the
 *   editor never represents.
 *
 * - `"edges"` (blockquote): drop **internal** empty paragraphs (an
 *   empty paragraph with non-empty siblings on both sides), keep
 *   leading and trailing ones. Rationale: mdast paragraphs are
 *   already separated by a blank line when serialized, so an
 *   internal empty paragraph would compound and produce an extra
 *   `>` line. A leading/trailing empty paragraph, by contrast, has
 *   no implicit separator on one side, so dropping it would lose the
 *   `>` line the user sees in the editor (Shift+Enter at the end of
 *   a quote, the structural empty-paragraph cursor target).
 *
 * When the filter leaves nothing we synthesize one empty paragraph so
 * the container still satisfies the at-least-one-child shape mdast
 * expects for non-root containers.
 */
function convertContainerChildren(
  node: InkwellElement,
  opts: { keepEmptyParagraphs: EmptyParagraphPolicy },
): ContainerChild[] {
  const converted: ContainerChild[] = [];
  for (const child of node.children) {
    if ("text" in child) continue;
    const c = convertBlock(child);
    if (!c) continue;
    if (
      c.type === "paragraph" ||
      c.type === "blockquote" ||
      c.type === "list" ||
      c.type === "code"
    ) {
      converted.push(c);
    }
  }

  let result: ContainerChild[];
  if (opts.keepEmptyParagraphs === "none") {
    result = converted.filter(c => !isEmptyParagraph(c));
  } else {
    result = [];
    for (let i = 0; i < converted.length; i++) {
      const c = converted[i];
      if (!isEmptyParagraph(c)) {
        result.push(c);
        continue;
      }
      const hasNonEmptyBefore = converted
        .slice(0, i)
        .some(n => !isEmptyParagraph(n));
      const hasNonEmptyAfter = converted
        .slice(i + 1)
        .some(n => !isEmptyParagraph(n));
      if (hasNonEmptyBefore && hasNonEmptyAfter) continue;
      result.push(c);
    }
  }

  if (result.length === 0) result.push({ type: "paragraph", children: [] });
  return result;
}

function convertCodeBlock(node: InkwellElement): Code {
  return {
    type: "code",
    lang: node.lang ?? null,
    meta: null,
    value: Node.string(node),
  };
}

function convertImageBlock(node: InkwellElement): Paragraph {
  const image: Image = {
    type: "image",
    url: node.url ?? "",
    alt: node.alt ?? "",
    title: null,
  };
  return { type: "paragraph", children: [image] };
}

/**
 * Parse a string as inline markdown content and return the resulting
 * `PhrasingContent[]`. This recovers structural inline nodes (Strong,
 * Emphasis, InlineCode, Link, Image, etc.) from text that carries
 * markdown markers, so the downstream stringifier emits them
 * properly without escaping.
 */
function parseInline(text: string): PhrasingContent[] {
  if (text === "") return [];
  // Inline source is parsed as a one-block document. The first child
  // is a paragraph whose children are the phrasing nodes we want.
  // Anything else (block-level content slipping into a paragraph's
  // text — which the editor shape doesn't allow) falls back to a
  // literal text leaf.
  const tree = unified().use(remarkParse).use(remarkGfm).parse(text) as Root;
  const first = tree.children[0];
  if (first && first.type === "paragraph") return first.children;
  return [{ type: "text", value: text }];
}
