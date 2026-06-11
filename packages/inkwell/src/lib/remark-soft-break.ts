import type { Break, Paragraph, PhrasingContent, Root, Text } from "mdast";
import { SKIP, visit } from "unist-util-visit";

export interface SoftBreakOptions {
  /**
   * The exact source string the tree was parsed from. When provided,
   * split text parts derive real `position` info from the original
   * text node via offset arithmetic — which the editor's verbatim
   * slicing (`mdastToSlate`) and the source cache both depend on.
   * Without it (or when entity/escape decoding desyncs the node value
   * from its source slice), split parts stay positionless and the
   * source-cache layer skips those blocks instead of caching them.
   */
  source?: string;
}

/**
 * Split a text node on newlines, returning a list of phrasing children
 * with `break` nodes inserted in place of each newline. CRLF endings
 * drop their `\r` from the part text so no stray carriage return leaks
 * into editor leaves or rendered DOM text.
 *
 * When `source` is available and the node's source slice matches its
 * value byte-for-byte, each part carries a freshly-built `position`
 * (new Point objects — never aliased from the original node).
 */
function splitTextOnNewlines(text: Text, source?: string): PhrasingContent[] {
  if (!text.value.includes("\n")) return [text];
  const { value } = text;
  const pos = text.position;
  // `baseOffset` is defined only when per-part positions can be derived
  // safely: the node has offsets and its source slice equals its value
  // (entity/escape decoding can desync the two, in which case parts stay
  // positionless and the source-cache layer skips their blocks).
  const baseOffset =
    source !== undefined &&
    pos !== undefined &&
    typeof pos.start.offset === "number" &&
    typeof pos.end.offset === "number" &&
    source.slice(pos.start.offset, pos.end.offset) === value
      ? pos.start.offset
      : undefined;

  const result: PhrasingContent[] = [];
  let partStart = 0;
  let line = pos?.start.line ?? 1;
  let column = pos?.start.column ?? 1;
  for (let i = 0; i <= value.length; i++) {
    if (i !== value.length && value[i] !== "\n") continue;
    // [partStart, i) is one part; trim the `\r` a CRLF ending leaves.
    let partEnd = i;
    if (partEnd > partStart && value[partEnd - 1] === "\r") partEnd -= 1;
    const partValue = value.slice(partStart, partEnd);
    if (partValue !== "") {
      const part: Text = { type: "text", value: partValue };
      if (baseOffset !== undefined) {
        part.position = {
          start: { line, column, offset: baseOffset + partStart },
          end: {
            line,
            column: column + (partEnd - partStart),
            offset: baseOffset + partEnd,
          },
        };
      }
      result.push(part);
    }
    if (i !== value.length) {
      result.push({ type: "break" } satisfies Break);
      line += 1;
      column = 1;
      partStart = i + 1;
    }
  }
  return result;
}

/**
 * Expand any `\n` characters inside text-node children into `break` nodes.
 * Returns the new children list, or `null` if nothing changed.
 */
function expandParagraphChildren(
  children: readonly PhrasingContent[],
  source?: string,
): PhrasingContent[] | null {
  let changed = false;
  const next: PhrasingContent[] = [];
  for (const child of children) {
    if (child.type === "text" && child.value.includes("\n")) {
      next.push(...splitTextOnNewlines(child, source));
      changed = true;
    } else {
      next.push(child);
    }
  }
  return changed ? next : null;
}

/**
 * Remark plugin that turns CommonMark soft breaks (newlines inside a
 * paragraph) into `break` mdast nodes, which mdast-util-to-hast renders as
 * `<br />`.
 *
 * Only paragraph children are touched. Code blocks keep their value verbatim;
 * lists and blockquotes are unaffected at their own level — paragraphs nested
 * inside them are still visited.
 */
export function remarkSoftBreakAsBreak(options: SoftBreakOptions = {}) {
  return (tree: Root) => {
    visit(tree, "paragraph", (node: Paragraph) => {
      const expanded = expandParagraphChildren(node.children, options.source);
      if (expanded) node.children = expanded;
    });
  };
}

/**
 * Remark plugin that splits a paragraph at every soft break, producing
 * sibling paragraph nodes that render with normal paragraph margins.
 *
 * Only paragraph nodes are split. Code blocks stay intact because their
 * content lives on `value`, not in phrasing children. List items and
 * blockquotes that wrap a soft-break-containing paragraph end up with two
 * sibling paragraphs inside the same container, which is the standard
 * GFM-style representation for "multiple paragraphs in one list item".
 */
export function remarkSoftBreakAsParagraph(options: SoftBreakOptions = {}) {
  return (tree: Root) => {
    visit(tree, "paragraph", (node: Paragraph, index, parent) => {
      if (!parent || index == null) return;

      const expanded =
        expandParagraphChildren(node.children, options.source) ??
        node.children.slice();
      const breakIndices: number[] = [];
      for (let i = 0; i < expanded.length; i++) {
        if (expanded[i].type === "break") breakIndices.push(i);
      }
      if (breakIndices.length === 0) {
        return;
      }

      const newParagraphs: Paragraph[] = [];
      let start = 0;
      for (const breakIdx of [...breakIndices, expanded.length]) {
        if (breakIdx > start) {
          const slice = expanded.slice(start, breakIdx);
          const paragraph: Paragraph = {
            type: "paragraph",
            children: slice,
          };
          // Preserve mdast position info on the split paragraph. The
          // source-faithful adapter (`mdastToSlate`) reads
          // `position.offset` to slice the original source — without
          // this the split paragraphs come through with empty text.
          // The Points are copied, never aliased: `remapTreeOffsets`
          // (parse.ts) remaps Points by identity, and an aliased Point
          // shared between two nodes would otherwise be remapped twice.
          const firstPos = slice[0]?.position;
          const lastPos = slice[slice.length - 1]?.position;
          if (firstPos && lastPos) {
            paragraph.position = {
              start: { ...firstPos.start },
              end: { ...lastPos.end },
            };
          }
          newParagraphs.push(paragraph);
        }
        start = breakIdx + 1;
      }

      // biome-ignore lint/suspicious/noExplicitAny: mdast parent.children union
      (parent as any).children.splice(index, 1, ...newParagraphs);
      return [SKIP, index + newParagraphs.length];
    });
  };
}
