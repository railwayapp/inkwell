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
 * - Leading `\---`/`\***`/`\___` (thematic-break protection) —
 *   `remarkNoThematicBreak` upstream means `---` re-parses as a paragraph,
 *   so the escape just shows as a stray backslash in the editor. Anchored
 *   to start-of-line because that's the only context mdast inserts the
 *   defensive escape.
 * - `\[` / `\]` (link-bracket protection) — Inkwell stores link source
 *   verbatim in text and never emits the literal `\[` escape, so any
 *   `\[`/`\]` in the output is always the to-markdown defensive escape
 *   for literal brackets in plain text. Real `[label](url)` links emit
 *   their brackets unescaped, so this strip is safe globally.
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
 * Finally, runs of consecutive bare-`>` lines collapse to a single `>`.
 * These come up when a trailing or leading empty paragraph is paired
 * with the natural mdast paragraph separator — both contribute a blank
 * quoted line, doubling up.
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
  return collapseConsecutiveBareQuoteLines(
    raw
      .replace(/^\\(?=-{3,}|\*{3,}|_{3,})/gm, "")
      .replace(/\\([[\]])/g, "$1")
      .replace(/ ?&#x20;(?=\n|$)/g, "")
      .replace(/^(>+ )\\>/gm, "$1>"),
  );
}

function collapseConsecutiveBareQuoteLines(input: string): string {
  let prev = "";
  let next = input;
  while (prev !== next) {
    prev = next;
    next = next.replace(/(^|\n)>\n>(?=\n|$)/g, "$1>");
  }
  return next;
}
