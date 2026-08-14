import type { Literal, Nodes } from "mdast";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmNoTablesToMarkdown } from "../lib/remark-gfm-no-tables";

/**
 * Inline node whose value is emitted VERBATIM — no defensive escaping.
 * `from-slate` produces one for a paragraph/heading leaf whose text has
 * passed the verbatim-safety check (re-parsing the text yields exactly
 * the block shape it lives in), so the user's typed bytes survive
 * serialization: `snake_case` stays `snake_case` instead of gaining
 * `\_` escapes, bare URLs stay bare instead of `<autolink>` brackets.
 */
export interface InkwellRaw extends Literal {
  type: "inkwellRaw";
}

declare module "mdast" {
  interface PhrasingContentMap {
    inkwellRaw: InkwellRaw;
  }
  interface RootContentMap {
    inkwellRaw: InkwellRaw;
  }
}

function inkwellRawHandler(node: InkwellRaw): string {
  return node.value;
}
inkwellRawHandler.peek = (node: InkwellRaw): string =>
  node.value.charAt(0) || " ";

/**
 * Default `mdast-util-to-markdown` options. The bullet/fence/emphasis
 * characters here become the normalized form when a block is
 * re-stringified from mdast (i.e. when no source slice is cached for
 * it). For untouched blocks the source cache short-circuits these
 * defaults entirely and re-emits the original slice byte-for-byte.
 */
const TO_MARKDOWN_DEFAULTS = {
  bullet: "-" as const,
  fence: "`" as const,
  emphasis: "_" as const,
  strong: "*" as const,
  listItemIndent: "one" as const,
  rule: "-" as const,
  tightDefinitions: true as const,
} as const;

export interface StringifyOptions {
  /**
   * Overrides for `mdast-util-to-markdown` options. Useful for tests that
   * want to assert against a specific stringification of an mdast tree.
   */
  toMarkdown?: Parameters<typeof toMarkdown>[1];
}

/**
 * Stringify an mdast tree back to markdown source. Applies the GFM
 * subset stringifier (no tables — see `remark-gfm-no-tables`) so
 * strikethrough / autolinks / task lists survive a round-trip while
 * pipe characters in plain text stay unescaped.
 *
 * `inkwellRaw` nodes (see above) are emitted verbatim — that is the
 * primary inline path for edited paragraph/heading blocks. The
 * remaining post-processing strips the defensive escapes
 * `mdast-util-to-markdown` inserts on the FALLBACK inline path that
 * Inkwell's parse pipeline doesn't need:
 *
 * - Escaped thematic-break lines (`\---`, `\*\*\*`, `\* \* \*`, `\_\_\_`) —
 *   `remarkNoThematicBreak` upstream means the unescaped marker re-parses
 *   as a paragraph, so the escapes just show as stray backslashes in the
 *   editor. Only lines consisting entirely of (escaped) marker characters
 *   are unescaped.
 * - Trailing `&#x20;` (trailing-whitespace protection) — mdast inserts
 *   this entity only at end-of-line to preserve trailing whitespace
 *   (which is otherwise stripped on re-parse). The editor doesn't
 *   represent trailing spaces as significant content, so the entity is
 *   pure visual noise. Anchored to end-of-line so a literal `&#x20;`
 *   typed mid-content isn't silently deleted.
 *
 * Runs of consecutive bare-`>` lines collapse to a single `>`. These
 * come up when a trailing or leading empty paragraph is paired with the
 * natural mdast paragraph separator — both contribute a blank quoted
 * line, doubling up.
 *
 * Every transformation above is CODE-AWARE: fenced-code content lines
 * and inline code spans are emitted verbatim by `toMarkdown`, so any
 * backslash, entity, or `>` line inside them is the user's actual code
 * — stripping or collapsing there corrupts content. The line walker
 * below tracks fence state (including blockquote-prefixed fences) and
 * the in-line pass skips backtick spans.
 */
export function stringifyMdast(
  tree: Nodes,
  options: StringifyOptions = {},
): string {
  const raw = toMarkdown(tree, {
    ...TO_MARKDOWN_DEFAULTS,
    extensions: [gfmNoTablesToMarkdown()],
    handlers: { inkwellRaw: inkwellRawHandler },
    ...options.toMarkdown,
  });
  return postProcess(raw);
}

interface WalkedLine {
  text: string;
  /** True for fence delimiter + fence content lines — never transformed. */
  protectedLine: boolean;
}

function postProcess(output: string): string {
  const lines = output.split("\n");
  const walked: WalkedLine[] = [];
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let fencePrefix = "";
  let fenceMaxCloseIndent = 3;

  for (const line of lines) {
    if (inFence) {
      const m = /^((?:> ?)*)([ \t]*)(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (
        m &&
        m[1] === fencePrefix &&
        m[2].length <= fenceMaxCloseIndent &&
        m[3][0] === fenceChar &&
        m[3].length >= fenceLen
      ) {
        inFence = false;
      }
      walked.push({ text: line, protectedLine: true });
      continue;
    }
    // Unlike the parse-side scanner (which only sees user input and
    // must stay conservative), this walker runs over OUR OWN toMarkdown
    // output, whose shapes are predictable: fences appear at column 0,
    // after `> ` quote prefixes, after a list marker (`- ```` ` for a
    // code block opening a list item), or indented as a list-item
    // continuation. Admit all of those as openers; the closer must
    // carry the same quote prefix and stay within the opener's
    // container indent + 3 so deeply-indented fence-lookalike CONTENT
    // lines don't close it early.
    const open =
      /^((?:> ?)*)((?:(?:[-*+]|\d{1,9}[.)]) )?[ \t]*)(`{3,}|~{3,})/.exec(line);
    const isOpener =
      open && !(open[3][0] === "`" && line.slice(open[0].length).includes("`"));
    if (isOpener && open) {
      inFence = true;
      fencePrefix = open[1];
      fenceChar = open[3][0];
      fenceLen = open[3].length;
      fenceMaxCloseIndent = open[2].length + 3;
      walked.push({ text: line, protectedLine: true });
      continue;
    }
    walked.push({ text: transformLine(line), protectedLine: false });
  }

  // Collapse runs of consecutive bare-`>` lines to a single `>` —
  // skipping protected (fence content) lines, where a `>` line is code.
  const result: string[] = [];
  let prevWasBareQuote = false;
  for (const entry of walked) {
    const isBareQuote = !entry.protectedLine && entry.text === ">";
    if (isBareQuote && prevWasBareQuote) continue;
    prevWasBareQuote = isBareQuote;
    result.push(entry.text);
  }
  return result.join("\n");
}

/** Apply the escape strips to a single non-code line. */
function transformLine(line: string): string {
  let out = line;
  // Escaped thematic-break line → unescape. toMarkdown escapes `---` as
  // `\---` but `***`/`___`/`* * *` per character (`\*\*\*`), so match a
  // whole line of marker characters where at least some are escaped.
  // The backreference pins all markers to the SAME character — a
  // thematic break requires 3+ of one character, so a mixed line like
  // `\*-\*` is NOT a thematic break and unescaping it would re-parse
  // as emphasis/list structure.
  if (
    out.includes("\\") &&
    /^(?:\\?([*_-]))(?:[ \t]*\\?\1){2,}[ \t]*$/.test(out)
  ) {
    out = out.replace(/\\/g, "");
  }
  // NOTE: two strips that used to live here are deliberately GONE.
  //
  // - `\[`/`\]` unescape: it destroyed links/images whose label or alt
  //   legitimately contains brackets (`[a\[b](url)` un-escaped to
  //   `[a[b](url)`, which no longer parses as a link). The verbatim
  //   inline path now emits typed bracket text byte-for-byte, so the
  //   defensive `\[` only appears on genuine fallback paths, where the
  //   escape is semantically required.
  //
  // - `\>` unescape after a blockquote prefix: it upgraded a user's
  //   LITERAL `>`-prefixed text inside a quote into a nested blockquote
  //   on the next parse. The structural nested-blockquote model emits
  //   real `> > ` prefixes itself and never needs the unescape.
  //
  // Trailing-whitespace entity at end-of-line. toMarkdown's protection
  // REPLACES the final space, so its entity is always attached directly
  // to a non-space character (`foo&#x20;`) — only that exact shape is
  // stripped. A user's literally-typed ` &#x20;` (space before the
  // entity, emitted verbatim by the inkwellRaw path) and an entity-only
  // line both survive; the lookbehind also keeps a backslash-escaped
  // `\&#x20;` intact. A code span's content can't sit at end-of-line
  // (its closing backtick follows it), so no span check is needed.
  out = out.replace(/(?<=[^\\ \t])&#x20;$/, "");
  return out;
}
