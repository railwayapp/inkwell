import { Editor, Element, Node, Path, Range, Transforms } from "slate";
import type { ResolvedInkwellFeatures } from "../../types";
import { deserialize } from "./deserialize";
import type { InkwellEditor, InkwellElement } from "./types";
import { generateId } from "./with-node-id";

const HEADING_RE = /^#{1,6}$/;
/**
 * Matches a paragraph that is a Markdown unordered-list line with a body —
 * leading indent, marker, trailing space, then some non-empty content.
 * Used to decide whether Enter should continue the list source.
 */
const UNORDERED_LIST_CONTINUE_RE = /^(\s*)([-*+]) \S/;
/**
 * Matches a paragraph that is an unordered-list marker with no body —
 * just the marker followed by an optional trailing space. Used to decide
 * whether Enter should outdent or exit list mode.
 */
const UNORDERED_LIST_EMPTY_RE = /^(\s*)([-*+]) ?$/;
/** Matches a line that opens with valid heading syntax: `#{1,6}` + space. */
const HEADING_LINE_RE = /^(#{1,6})\s/;

/**
 * Classify a single line of text into the element type it should render as.
 * Mirrors the deserializer's per-line block detection so a runtime split
 * (e.g., pressing Enter mid-heading) reclassifies each half the same way a
 * re-deserialization would.
 *
 * Only handles the block kinds that are reachable from a split: heading
 * (when the feature is enabled) and paragraph (the fallback). Blockquote
 * is intentionally excluded — Slate-level blockquote splits run through a
 * dedicated branch above.
 */
function classifyLine(
  text: string,
  deco: ResolvedInkwellFeatures,
): { type: "heading" | "paragraph"; level?: number } {
  const headingMatch = HEADING_LINE_RE.exec(text);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const key = `heading${level}` as keyof ResolvedInkwellFeatures;
    if (deco[key]) return { type: "heading", level };
  }
  return { type: "paragraph" };
}
/**
 * Slate plugin that adds markdown-specific editor behaviors:
 * - Enter on code-fence → new paragraph (exit code block)
 * - Enter on blockquote → new paragraph (exit blockquote)
 * - Enter on heading → new paragraph (exit heading)
 * - Shift+Enter on blockquote → soft break (stay in blockquote)
 * - Typing "> " at start of paragraph → convert to blockquote
 * - Typing "# " at start of paragraph → convert to heading
 * - Typing ``` at start of paragraph → convert to code-fence
 * - Closing ``` on code-line → convert to code-fence, exit code block
 * - Enter on image → insert a paragraph after the void image block
 * - Paste → parse as markdown, insert structured nodes (including images)
 *
 * The `featuresRef` allows the latest element config to be read
 * from within closures that outlive the initial call.
 */
export function withMarkdown(
  editor: InkwellEditor,
  featuresRef: { current: ResolvedInkwellFeatures },
): InkwellEditor {
  const { insertBreak, insertData, insertText, isVoid } = editor;

  editor.isVoid = (element: InkwellElement) => {
    if (element.type === "image") return true;
    return isVoid(element);
  };

  editor.insertBreak = () => {
    const { selection } = editor;
    if (!selection) return insertBreak();

    const [match] = Editor.nodes(editor, {
      match: n => Element.isElement(n),
    });
    if (!match) return insertBreak();

    const [node, path] = match;
    const element = node as InkwellElement;
    const text = Node.string(node);
    const deco = featuresRef.current;

    // Paragraph starting with ``` → convert to code-fence, insert code-line
    if (
      deco.codeBlocks &&
      element.type === "paragraph" &&
      text.startsWith("```")
    ) {
      Transforms.setNodes(editor, {
        type: "code-fence",
      } as Partial<InkwellElement>);
      const newLine: InkwellElement = {
        type: "code-line",
        id: generateId(),
        children: [{ text: "" }],
      };
      Transforms.insertNodes(editor, newLine, { at: Path.next(path) });
      Transforms.select(editor, Editor.start(editor, Path.next(path)));
      return;
    }

    // Code-line with exactly ``` → closing fence, insert paragraph
    if (element.type === "code-line" && text.trim() === "```") {
      Transforms.setNodes(editor, {
        type: "code-fence",
      } as Partial<InkwellElement>);
      const newParagraph: InkwellElement = {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "" }],
      };
      Transforms.insertNodes(editor, newParagraph, { at: Path.next(path) });
      Transforms.select(editor, Editor.start(editor, Path.next(path)));
      return;
    }

    // Enter on code-fence → depends on opening vs closing
    if (element.type === "code-fence") {
      // Closing fence: previous sibling is code-line → insert paragraph
      const prevIdx = path[0] - 1;
      const isClosing =
        prevIdx >= 0 &&
        (editor.children[prevIdx] as InkwellElement).type === "code-line";

      const newNode: InkwellElement = isClosing
        ? { type: "paragraph", id: generateId(), children: [{ text: "" }] }
        : { type: "code-line", id: generateId(), children: [{ text: "" }] };

      Transforms.insertNodes(editor, newNode, { at: Path.next(path) });
      Transforms.select(editor, Editor.start(editor, Path.next(path)));
      return;
    }

    // Enter on blockquote → exit to new paragraph
    if (element.type === "blockquote") {
      // Empty blockquote → remove it and insert paragraph
      const text = Node.string(node);
      if (/^>\s*$/.test(text)) {
        Transforms.delete(editor, {
          at: {
            anchor: Editor.start(editor, path),
            focus: Editor.end(editor, path),
          },
        });
        Transforms.setNodes(editor, {
          type: "paragraph",
        } as Partial<InkwellElement>);
        return;
      }
      // Non-empty → insert paragraph after
      const newParagraph: InkwellElement = {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "" }],
      };
      Transforms.insertNodes(editor, newParagraph, {
        at: Path.next(path),
      });
      Transforms.select(editor, Editor.start(editor, Path.next(path)));
      return;
    }

    // Enter on heading → split at caret. Each half is re-classified against
    // the markdown syntax it now contains: a head of `#` (no trailing space)
    // is no longer a valid heading, so it drops to a paragraph; a tail like
    // `# rest` is still a valid h1, so it stays a heading. This matches what
    // the user would get from re-deserializing each line.
    if (element.type === "heading") {
      // Empty heading or marker-only — clear back to a plain paragraph.
      if (!text.trim() || /^#{1,6}\s*$/.test(text)) {
        Transforms.delete(editor, {
          at: {
            anchor: Editor.start(editor, path),
            focus: Editor.end(editor, path),
          },
        });
        Transforms.setNodes(editor, {
          type: "paragraph",
        } as Partial<InkwellElement>);
        Transforms.unsetNodes(editor, "level");
        return;
      }

      if (!Range.isCollapsed(selection)) {
        Transforms.delete(editor);
      }
      const point = editor.selection?.anchor;
      const cursorOffset = point?.offset ?? text.length;
      const endPoint = Editor.end(editor, path);
      const tail = point
        ? Editor.string(editor, { anchor: point, focus: endPoint })
        : "";
      if (point && tail.length > 0) {
        Transforms.delete(editor, { at: { anchor: point, focus: endPoint } });
      }

      // Re-classify what's left in the original node based on its remaining
      // text. If still a heading (possibly at a different level), update;
      // otherwise downgrade to a paragraph.
      const head = text.slice(0, cursorOffset);
      const headClass = classifyLine(head, deco);
      if (headClass.type === "heading" && headClass.level !== undefined) {
        Transforms.setNodes(editor, {
          type: "heading",
          level: headClass.level,
        } as Partial<InkwellElement>);
      } else {
        Transforms.setNodes(editor, {
          type: headClass.type,
        } as Partial<InkwellElement>);
        Transforms.unsetNodes(editor, "level");
      }

      // Insert the tail as the appropriate element type for its own content.
      const tailClass = classifyLine(tail, deco);
      const newNode: InkwellElement =
        tailClass.type === "heading" && tailClass.level !== undefined
          ? {
              type: "heading",
              id: generateId(),
              level: tailClass.level,
              children: [{ text: tail }],
            }
          : {
              type: "paragraph",
              id: generateId(),
              children: [{ text: tail }],
            };
      Transforms.insertNodes(editor, newNode, { at: Path.next(path) });
      Transforms.select(editor, Editor.start(editor, Path.next(path)));
      return;
    }

    // Enter on a Markdown unordered list-like paragraph. List source stays as
    // plain paragraph text (no `list-item` element), so we replicate the
    // list-ergonomics here:
    //   • non-empty body          → insert next paragraph `${indent}${marker} `
    //   • empty body, indent ≥ 2  → outdent same line to `${indent-2}${marker} `
    //   • empty body, indent 0    → clear the line, stay as empty paragraph
    if (element.type === "paragraph") {
      const emptyMatch = UNORDERED_LIST_EMPTY_RE.exec(text);
      if (emptyMatch) {
        const [, indent, marker] = emptyMatch;
        Transforms.delete(editor, {
          at: {
            anchor: Editor.start(editor, path),
            focus: Editor.end(editor, path),
          },
        });
        if (indent.length >= 2) {
          editor.insertText(`${indent.slice(2)}${marker} `);
        }
        return;
      }

      const continueMatch = UNORDERED_LIST_CONTINUE_RE.exec(text);
      if (continueMatch) {
        const [, indent, marker] = continueMatch;
        const prefix = `${indent}${marker} `;

        // Collapse any selected range first so the split happens at a point.
        if (!Range.isCollapsed(selection)) {
          Transforms.delete(editor);
        }

        // List source paragraphs are a single text leaf, so the anchor
        // offset is the offset within the paragraph string.
        const point = editor.selection?.anchor;
        const cursorOffset = point?.offset ?? text.length;

        // Caret inside the indent/marker prefix → keep the original
        // empty-continuation behavior. Splitting in the prefix would yield a
        // malformed marker on the new line.
        if (cursorOffset < prefix.length) {
          const newParagraph: InkwellElement = {
            type: "paragraph",
            id: generateId(),
            children: [{ text: prefix }],
          };
          Transforms.insertNodes(editor, newParagraph, {
            at: Path.next(path),
          });
          Transforms.select(editor, Editor.end(editor, Path.next(path)));
          return;
        }

        // Caret exactly at the start of the content (just past the marker) →
        // push an empty list item above the current line, leaving the
        // original content and caret in place. This mirrors how text editors
        // handle Enter at the start of typed text: the line you're on stays
        // with you, an empty line appears above.
        if (cursorOffset === prefix.length) {
          const newParagraph: InkwellElement = {
            type: "paragraph",
            id: generateId(),
            children: [{ text: prefix }],
          };
          Transforms.insertNodes(editor, newParagraph, { at: path });
          // After the insert, the original paragraph shifted from `path` to
          // Path.next(path). Re-anchor the caret at the same column on what
          // is now the second line.
          Transforms.select(editor, {
            path: [...Path.next(path), 0],
            offset: prefix.length,
          });
          return;
        }

        // Caret mid-content → split: carve off the tail and carry it onto
        // a new line below, with the marker prefix re-applied.
        const endPoint = Editor.end(editor, path);
        const tail = point
          ? Editor.string(editor, { anchor: point, focus: endPoint })
          : "";
        if (point && tail.length > 0) {
          Transforms.delete(editor, { at: { anchor: point, focus: endPoint } });
        }

        const newParagraph: InkwellElement = {
          type: "paragraph",
          id: generateId(),
          children: [{ text: `${prefix}${tail}` }],
        };
        Transforms.insertNodes(editor, newParagraph, { at: Path.next(path) });
        // Place caret right after the prefix on the new line, before the
        // moved tail.
        Transforms.select(editor, {
          path: [...Path.next(path), 0],
          offset: prefix.length,
        });
        return;
      }
    }

    // Enter on code-line → new code-line (stay in code block)
    if (element.type === "code-line") {
      // Normal code line → insert new code-line
      const newLine: InkwellElement = {
        type: "code-line",
        id: generateId(),
        children: [{ text: "" }],
      };
      Transforms.insertNodes(editor, newLine, { at: Path.next(path) });
      Transforms.select(editor, Editor.start(editor, Path.next(path)));
      return;
    }

    // Enter on image → insert paragraph after the image (void elements
    // can't hold a cursor internally)
    if (element.type === "image") {
      const newParagraph: InkwellElement = {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "" }],
      };
      Transforms.insertNodes(editor, newParagraph, { at: Path.next(path) });
      Transforms.select(editor, Editor.start(editor, Path.next(path)));
      return;
    }

    // Default: insert new paragraph
    insertBreak();
    // Force the new block to be a paragraph (prevent type inheritance)
    Transforms.setNodes(editor, {
      type: "paragraph",
    } as Partial<InkwellElement>);
  };

  editor.insertSoftBreak = () => {
    const [match] = Editor.nodes(editor, {
      match: n => Element.isElement(n),
    });
    if (match) {
      const [node, path] = match;
      const element = node as InkwellElement;
      // Shift+Enter in blockquote → new blockquote line
      if (element.type === "blockquote") {
        const newBq: InkwellElement = {
          type: "blockquote",
          id: generateId(),
          children: [{ text: "> " }],
        };
        Transforms.insertNodes(editor, newBq, { at: Path.next(path) });
        Transforms.select(editor, Editor.start(editor, Path.next(path)));
        return;
      }
      // Shift+Enter in code-line → new code-line
      if (element.type === "code-line") {
        const newLine: InkwellElement = {
          type: "code-line",
          id: generateId(),
          children: [{ text: "" }],
        };
        Transforms.insertNodes(editor, newLine, { at: Path.next(path) });
        Transforms.select(editor, Editor.start(editor, Path.next(path)));
        return;
      }
    }
    // For everything else, treat Shift+Enter as regular Enter
    editor.insertBreak();
  };

  editor.insertText = (text: string) => {
    const { selection } = editor;
    if (!selection) return insertText(text);

    const [match] = Editor.nodes(editor, {
      match: n => Element.isElement(n),
    });
    if (!match) return insertText(text);

    const [node, path] = match;
    const element = node as InkwellElement;
    const currentText = Node.string(node);
    const deco = featuresRef.current;

    // Code-line with ``` and user types more → close fence, overflow to paragraph
    if (
      element.type === "code-line" &&
      currentText === "```" &&
      text !== "" &&
      text !== "\n"
    ) {
      // Convert to closing fence
      Transforms.setNodes(editor, {
        type: "code-fence",
      } as Partial<InkwellElement>);
      // Insert the typed text as a new paragraph after
      const newParagraph: InkwellElement = {
        type: "paragraph",
        id: generateId(),
        children: [{ text }],
      };
      Transforms.insertNodes(editor, newParagraph, { at: Path.next(path) });
      Transforms.select(editor, Editor.end(editor, Path.next(path)));
      return;
    }

    // Detect "> " typed at start of paragraph → convert to blockquote
    if (
      deco.blockquotes &&
      element.type === "paragraph" &&
      text === " " &&
      currentText === ">"
    ) {
      insertText(text);
      Transforms.setNodes(editor, {
        type: "blockquote",
      } as Partial<InkwellElement>);
      return;
    }

    // Detect "# " typed at start of paragraph → convert to heading
    const headingLevel = currentText.length;
    const headingKey = `heading${headingLevel}` as keyof typeof deco;
    if (
      element.type === "paragraph" &&
      text === " " &&
      HEADING_RE.test(currentText) &&
      deco[headingKey]
    ) {
      const level = headingLevel;
      insertText(text);
      Transforms.setNodes(editor, {
        type: "heading",
        level,
      } as Partial<InkwellElement>);
      return;
    }

    // Text typed after closing ``` on a code-fence → overflow to new paragraph
    if (element.type === "code-fence") {
      // Check if this is a closing fence (has code-line before it)
      const prevIdx = path[0] - 1;
      if (prevIdx >= 0) {
        const prev = editor.children[prevIdx] as InkwellElement;
        if (prev.type === "code-line" && currentText === "```") {
          // Insert text as new paragraph after the fence
          const newParagraph: InkwellElement = {
            type: "paragraph",
            id: generateId(),
            children: [{ text }],
          };
          Transforms.insertNodes(editor, newParagraph, {
            at: Path.next(path),
          });
          Transforms.select(editor, Editor.end(editor, Path.next(path)));
          return;
        }
      }
    }

    insertText(text);
  };

  // Paste: parse as markdown and insert structured nodes
  editor.insertData = (data: DataTransfer) => {
    const text = data.getData("text/plain");
    if (text) {
      const nodes = deserialize(text, featuresRef.current);
      Transforms.insertNodes(editor, nodes);
      return;
    }
    insertData(data);
  };

  return editor;
}
