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
import remarkParse from "remark-parse";
import { Node } from "slate";
import { unified } from "unified";
import type { InkwellElement } from "../editor/slate/types";
import remarkGfmNoTables from "../lib/remark-gfm-no-tables";
import { parseMarkdownToMdast } from "./parse";
import type { InkwellRaw } from "./stringify";

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
      .map(n => convertBlock(n, false))
      .filter((n): n is RootContent => n !== null),
  };
}

function convertBlock(
  node: InkwellElement,
  inContainer: boolean,
): RootContent | null {
  switch (node.type) {
    case "paragraph":
      return convertParagraphBlock(node, inContainer);
    case "heading":
      return convertHeadingBlock(node, inContainer);
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

function convertParagraphBlock(
  node: InkwellElement,
  inContainer: boolean,
): Paragraph {
  const text = Node.string(node);
  // Whitespace-only paragraphs are cursor targets, not content — treat
  // them as empty so the container empty-paragraph policies see them
  // (a space-only quote paragraph used to emit `> &#x20;`).
  if (text.trim() === "") {
    return { type: "paragraph", children: [] };
  }
  if (verbatimSafe(text, { type: "paragraph" }, inContainer)) {
    return {
      type: "paragraph",
      children: [{ type: "inkwellRaw", value: text } satisfies InkwellRaw],
    };
  }
  return {
    type: "paragraph",
    children: parseInline(text),
  };
}

const HEADING_PREFIX_RE = /^(#{1,6})\s+/;

function convertHeadingBlock(
  node: InkwellElement,
  inContainer: boolean,
): Heading {
  const raw = Node.string(node);
  const match = HEADING_PREFIX_RE.exec(raw);
  const depth = clampHeadingDepth(node.level ?? match?.[1].length ?? 1);
  // Verbatim path: toMarkdown emits `#{depth} ` + children, so raw must
  // start with exactly that prefix and a SINGLE space for the emitted
  // bytes to equal the leaf text — a second space would be re-emitted
  // as a `&#x20;` entity by the heading handler, injecting visible
  // text. Multi-space prefixes fall back to the escaped path.
  if (
    raw.startsWith("#".repeat(depth)) &&
    raw[depth] === " " &&
    raw[depth + 1] !== " "
  ) {
    const inner = raw.slice(depth + 1);
    if (
      inner !== "" &&
      verbatimSafe(raw, { type: "heading", depth }, inContainer)
    ) {
      return {
        type: "heading",
        depth,
        children: [{ type: "inkwellRaw", value: inner } satisfies InkwellRaw],
      };
    }
  }
  const inner = match ? raw.slice(match[0].length) : raw;
  return {
    type: "heading",
    depth,
    children: parseInline(inner),
  };
}

/**
 * Sentinel paragraph appended after a blank line for the termination
 * check below. Any string that always parses as its own paragraph
 * works; this one is unlikely to interact with user text.
 */
const SENTINEL = "InkwellSentinel7";

/**
 * True when `text` can be emitted VERBATIM as the source of a block of
 * the expected shape: re-parsing it through the SAME pipeline the
 * editor loads content with (bare-`>` escaping, no tables, no thematic
 * breaks) yields exactly one block of that type — AND that block
 * terminates before a following sibling. This is what lets typed text
 * keep its bytes — `snake_case`, `2 * 3`, bare URLs, and bracketed
 * mention markers all serialize exactly as typed instead of gaining
 * `\_`/`\*`/`<>` defensive escapes.
 *
 * Guards:
 * - Leading indentation is rejected: once blocks are joined, an
 *   indented first line could chain into a preceding list item as a
 *   continuation line, or read as an indented code block.
 * - `\r` is rejected: carriage returns desync the LF-based pipeline.
 * - Inside a container, any line-leading `>` is rejected: the
 *   top-level parse escapes it into paragraph text, but after the
 *   container's `> ` prefix is prepended on emit it re-reads as a
 *   NESTED blockquote marker.
 * - The parse runs with a sentinel paragraph appended after a blank
 *   line, and the result must be exactly [expected block, sentinel].
 *   A block that swallows the sentinel — an unclosed `<pre>`/
 *   `<script>`/`<!--` HTML block, a fence-opening line — would absorb
 *   every later sibling once blocks are joined in the document.
 * - `softBreak: "br"` keeps a multi-line leaf a single paragraph for
 *   the check, mirroring how the editor displays it in one block.
 */
function verbatimSafe(
  text: string,
  expect: { type: "paragraph" } | { type: "heading"; depth: number },
  inContainer: boolean,
): boolean {
  if (/^[ \t]/.test(text) || text.includes("\r")) return false;
  if (inContainer && /^>/m.test(text)) return false;
  const tree = parseMarkdownToMdast(`${text}\n\n${SENTINEL}`, {
    softBreak: "br",
  });
  if (tree.children.length !== 2) return false;
  const [only, tail] = tree.children;
  if (tail.type !== "paragraph") return false;
  const tailChild = tail.children.length === 1 ? tail.children[0] : undefined;
  if (!tailChild || tailChild.type !== "text" || tailChild.value !== SENTINEL) {
    return false;
  }
  if (expect.type === "paragraph") {
    // Besides paragraphs proper, accept the block kinds the editor
    // MODELS as verbatim-text paragraphs (to-slate's default case):
    // link-reference definitions, footnote definitions, and HTML
    // blocks that terminate before the sentinel. Emitting their source
    // verbatim keeps them functioning on re-parse — the escaped
    // fallback turned `[ref]: url` into `\[ref]: url`, silently
    // breaking every reference link that pointed at it.
    return (
      only.type === "paragraph" ||
      only.type === "definition" ||
      only.type === "footnoteDefinition" ||
      only.type === "html"
    );
  }
  return only.type === "heading" && only.depth === expect.depth;
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
        c.type === "heading" ||
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

const TASK_MARKER_RE = /^\[([ xX])\] /;

function convertListItemNode(node: InkwellElement): ListItem {
  // Task-list items: the editor stores the `[x] `/`[ ] ` marker as
  // visible text at the start of the item's first paragraph (mirroring
  // to-slate, which reconstructs it from mdast's `listItem.checked`).
  // Move it back onto `checked` so the GFM stringifier emits
  // `- [x] …` — leaving it in the text would double the marker or, on
  // the escaped fallback path, emit `\[x]`.
  const firstBlock = node.children.find(
    (c): c is InkwellElement => !("text" in c),
  );
  let checked: boolean | undefined;
  let itemNode = node;
  if (firstBlock && firstBlock.type === "paragraph") {
    const text = Node.string(firstBlock);
    const m = TASK_MARKER_RE.exec(text);
    // Only move the marker onto `checked` when content follows it. An
    // EMPTY scaffold item (`- [ ] `) must keep the marker as literal
    // paragraph text: stripping it leaves an empty paragraph that the
    // `"none"` policy drops, and the GFM stringifier has no first
    // child to inject the checkbox into — the marker bytes vanished
    // from the output.
    if (m && text.slice(m[0].length) !== "") {
      checked = m[1] !== " ";
      itemNode = {
        ...node,
        children: node.children.map(c =>
          c === firstBlock
            ? {
                ...firstBlock,
                children: [{ text: text.slice(m[0].length) }],
              }
            : c,
        ),
      };
    }
  }
  const item: ListItem = {
    type: "listItem",
    spread: false,
    children: convertContainerChildren(itemNode, {
      keepEmptyParagraphs: "none",
    }),
  };
  if (checked !== undefined) item.checked = checked;
  return item;
}

type EmptyParagraphPolicy = "none" | "edges";

type ContainerChild = Paragraph | Heading | Blockquote | List | Code;

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
    const c = convertBlock(child, true);
    if (!c) continue;
    // Admit every block type a container can hold. Headings used to be
    // missing here and were silently dropped — `> # title` serialized
    // to a bare `>`. Keep this list in sync with the ContainerChild
    // union; anything convertBlock can produce inside a container must
    // be admitted or content is lost.
    if (
      c.type === "paragraph" ||
      c.type === "heading" ||
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
    title: node.title ?? null,
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
  // Inline source is parsed as a one-block document. A single
  // paragraph's children are the phrasing nodes we want. Anything else
  // (block-level content in the text, or MULTIPLE blocks) falls back to
  // one literal text leaf covering the WHOLE text — returning only the
  // first block's children here used to silently delete every later
  // block from the serialized output while the editor kept displaying
  // it. toMarkdown escapes whatever the literal needs to stay one
  // paragraph, so nothing is lost.
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfmNoTables)
    .parse(text) as Root;
  const first = tree.children[0];
  if (tree.children.length === 1 && first && first.type === "paragraph") {
    return first.children;
  }
  return [{ type: "text", value: text }];
}
