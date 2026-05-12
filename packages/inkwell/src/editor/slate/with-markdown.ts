import { Editor, Element, Node, Path, Transforms } from "slate";
import type { InkwellDecorations } from "../../types";
import { deserialize } from "./deserialize";
import type { InkwellEditor, InkwellElement } from "./types";
import { generateId } from "./with-node-id";

const HEADING_RE = /^#{1,6}$/;
/**
 * Matches a line that has been typed up to — but not including — the trailing
 * space that completes a list marker. E.g. `-`, `*`, `+`, `1.`, `  2.`
 */
const LIST_TRIGGER_RE = /^(\s*)(\d+\.|[-*+])$/;
/**
 * Matches the leading marker of a list-item element's text. Captures leading
 * whitespace (indent), the marker itself, and includes the trailing space.
 * E.g. `"  1. foo"` → match[1] = `"  "`, match[2] = `"1."`.
 */
const LIST_MARKER_RE = /^(\s*)(\d+\.|[-*+]) /;

/**
 * Slate plugin that adds markdown-specific editor behaviors:
 * - Enter on code-fence → new paragraph (exit code block)
 * - Enter on blockquote → new paragraph (exit blockquote)
 * - Enter on heading → new paragraph (exit heading)
 * - Shift+Enter on blockquote → soft break (stay in blockquote)
 * - Typing "> " at start of paragraph → convert to blockquote
 * - Typing "# " at start of paragraph → convert to heading
 * - Typing `- `, `1. `, or indented list markers → convert to list-item
 * - Typing ``` at start of paragraph → convert to code-fence
 * - Closing ``` on code-line → convert to code-fence, exit code block
 * - Enter on image → insert a paragraph after the void image block
 * - Paste → parse as markdown, insert structured nodes (including images)
 *
 * The `decorationsRef` allows the latest element config to be read
 * from within closures that outlive the initial call.
 */
export function withMarkdown(
  editor: InkwellEditor,
  decorationsRef: { current: Required<InkwellDecorations> },
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
    const deco = decorationsRef.current;

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
      if (!text.trim()) {
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

    // Enter on heading → exit to new paragraph
    if (element.type === "heading") {
      if (!text.trim()) {
        Transforms.setNodes(editor, {
          type: "paragraph",
        } as Partial<InkwellElement>);
        Transforms.unsetNodes(editor, "level");
        return;
      }
      const newParagraph: InkwellElement = {
        type: "paragraph",
        id: generateId(),
        children: [{ text: "" }],
      };
      Transforms.insertNodes(editor, newParagraph, { at: Path.next(path) });
      Transforms.select(editor, Editor.start(editor, Path.next(path)));
      return;
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

    // Enter on list-item
    if (element.type === "list-item") {
      const markerMatch = LIST_MARKER_RE.exec(text);
      const indent = markerMatch?.[1] ?? "";
      const rawMarker = markerMatch?.[2] ?? "-";
      const body = markerMatch ? text.slice(markerMatch[0].length) : "";

      // Empty body → outdent by two spaces, or revert to paragraph at indent 0
      if (!body.trim()) {
        if (indent.length >= 2) {
          const outdent = indent.slice(2);
          const nextMarker = /^\d+\.$/.test(rawMarker) ? "1." : rawMarker;
          Transforms.delete(editor, {
            at: {
              anchor: Editor.start(editor, path),
              focus: Editor.end(editor, path),
            },
          });
          editor.insertText(`${outdent}${nextMarker} `);
          return;
        }
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

      // Non-empty → insert new list item with the same marker.
      // Ordered markers auto-increment (e.g. `1.` → `2.`).
      let nextMarker = rawMarker;
      const orderedMatch = /^(\d+)\.$/.exec(rawMarker);
      if (orderedMatch) {
        nextMarker = `${parseInt(orderedMatch[1], 10) + 1}.`;
      }
      const newItem: InkwellElement = {
        type: "list-item",
        id: generateId(),
        children: [{ text: `${indent}${nextMarker} ` }],
      };
      Transforms.insertNodes(editor, newItem, { at: Path.next(path) });
      Transforms.select(editor, Editor.end(editor, Path.next(path)));
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
          children: [{ text: "" }],
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
    const deco = decorationsRef.current;

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
      // Clear the text and convert to blockquote
      Transforms.delete(editor, {
        at: {
          anchor: Editor.start(editor, path),
          focus: Editor.end(editor, path),
        },
      });
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
      Transforms.delete(editor, {
        at: {
          anchor: Editor.start(editor, path),
          focus: Editor.end(editor, path),
        },
      });
      Transforms.setNodes(editor, {
        type: "heading",
        level,
      } as Partial<InkwellElement>);
      return;
    }

    // Detect list marker typed at start of paragraph (e.g. `-`, `*`, `+`,
    // `1.`, or indented variants) followed by space → convert to list-item
    if (
      deco.lists &&
      element.type === "paragraph" &&
      text === " " &&
      LIST_TRIGGER_RE.test(currentText)
    ) {
      // Insert the space first so the text becomes `<marker> `
      insertText(text);
      Transforms.setNodes(editor, {
        type: "list-item",
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
      const nodes = deserialize(text, decorationsRef.current);
      Transforms.insertNodes(editor, nodes);
      return;
    }
    insertData(data);
  };

  return editor;
}
