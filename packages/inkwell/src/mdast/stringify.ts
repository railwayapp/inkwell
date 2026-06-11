import type { Nodes } from "mdast";
import { gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";

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
 * stringifier so strikethrough / autolinks survive a round-trip. Tables
 * pass through as plain text because the parse side runs
 * `remarkNoTables` upstream.
 *
 * Post-processing strips a few defensive escapes that `mdast-util-to-markdown`
 * inserts but Inkwell's parse pipeline doesn't need:
 *
 * - Escaped thematic-break lines (`\---`, `\*\*\*`, `\* \* \*`, `\_\_\_`) —
 *   `remarkNoThematicBreak` upstream means the unescaped marker re-parses
 *   as a paragraph, so the escapes just show as stray backslashes in the
 *   editor. Only lines consisting entirely of (escaped) marker characters
 *   are unescaped.
 * - `\[` / `\]` (link-bracket protection) — Inkwell stores link source
 *   verbatim in text and never emits the literal `\[` escape, so any
 *   `\[`/`\]` outside code is always the to-markdown defensive escape
 *   for literal brackets in plain text. Real `[label](url)` links emit
 *   their brackets unescaped.
 * - Trailing `&#x20;` (trailing-whitespace protection) — mdast inserts
 *   this entity only at end-of-line to preserve trailing whitespace
 *   (which is otherwise stripped on re-parse). The editor doesn't
 *   represent trailing spaces as significant content, so the entity is
 *   pure visual noise. Anchored to end-of-line so a literal `&#x20;`
 *   typed mid-content isn't silently deleted.
 * - `\>` after a blockquote prefix (`> \>foo` → `> >foo`) — comes from
 *   the legacy text-leaf blockquote path; in that context the inner
 *   `>` is meant as a nested blockquote marker, not a literal `>`.
 *   Anchored to start-of-line.
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
    extensions: [gfmToMarkdown()],
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

  for (const line of lines) {
    if (inFence) {
      const m = /^((?:> ?)*)( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (
        m &&
        m[1] === fencePrefix &&
        m[3][0] === fenceChar &&
        m[3].length >= fenceLen
      ) {
        inFence = false;
      }
      walked.push({ text: line, protectedLine: true });
      continue;
    }
    const open = /^((?:> ?)*)( {0,3})(`{3,}|~{3,})/.exec(line);
    const isOpener =
      open && !(open[3][0] === "`" && line.slice(open[0].length).includes("`"));
    if (isOpener && open) {
      inFence = true;
      fencePrefix = open[1];
      fenceChar = open[3][0];
      fenceLen = open[3].length;
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
  if (
    out.includes("\\") &&
    /^(?:\\?[*_-])(?:[ \t]*\\?[*_-]){2,}[ \t]*$/.test(out)
  ) {
    out = out.replace(/\\/g, "");
  }
  // Link-bracket unescape, skipping inline code spans.
  out = mapOutsideCodeSpans(out, seg => seg.replace(/\\([[\]])/g, "$1"));
  // Trailing-whitespace entity at end-of-line. A code span's content
  // can't sit at end-of-line (its closing backtick follows it), so no
  // span check is needed.
  out = out.replace(/ ?&#x20;$/, "");
  // Legacy text-leaf blockquote nested-marker unescape.
  out = out.replace(/^(>+ )\\>/, "$1>");
  return out;
}

/**
 * Apply `fn` to the segments of `line` that sit outside inline code
 * spans. A code span is delimited by backtick runs of equal length
 * (CommonMark); unmatched runs are treated as plain text.
 */
function mapOutsideCodeSpans(
  line: string,
  fn: (segment: string) => string,
): string {
  if (!line.includes("`")) return fn(line);
  let out = "";
  let i = 0;
  while (i < line.length) {
    const open = line.indexOf("`", i);
    if (open === -1) {
      out += fn(line.slice(i));
      return out;
    }
    let openEnd = open;
    while (line[openEnd] === "`") openEnd++;
    const runLen = openEnd - open;
    // Find the next backtick run of exactly the same length.
    let close = -1;
    let j = openEnd;
    while (j < line.length) {
      const k = line.indexOf("`", j);
      if (k === -1) break;
      let kEnd = k;
      while (line[kEnd] === "`") kEnd++;
      if (kEnd - k === runLen) {
        close = k;
        break;
      }
      j = kEnd;
    }
    if (close === -1) {
      // Unmatched run: the backticks are literal text.
      out += fn(line.slice(i, openEnd));
      i = openEnd;
      continue;
    }
    out += fn(line.slice(i, open));
    out += line.slice(open, close + runLen);
    i = close + runLen;
  }
  return out;
}
