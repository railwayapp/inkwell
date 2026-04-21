import { Editor, Element, Node, Path, Transforms } from "slate";
import type { InkwellDecorations } from "../../types";
import { deserialize } from "./deserialize";
import type { InkwellEditor, InkwellElement } from "./types";
import { generateId } from "./with-node-id";

const HEADING_RE = /^#{1,6}$/;

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
 * - Paste → parse as markdown, insert structured nodes
 *
 * The `decorationsRef` allows the latest element config to be read
 * from within closures that outlive the initial call.
 */
export function withMarkdown(
  editor: InkwellEditor,
  decorationsRef: { current: Required<InkwellDecorations> },
): InkwellEditor {
  const { insertBreak, insertData, insertText } = editor;

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

    // Enter on list-item
    if (element.type === "list-item") {
      const text = Node.string(node);
      // Empty list item (just the marker) → convert to paragraph
      if (
        text.trim() === "-" ||
        text.trim() === "*" ||
        text.trim() === "+" ||
        text === "- " ||
        text === "* " ||
        text === "+ "
      ) {
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
      // Non-empty list item → insert new list item with same marker
      const marker = text.match(/^([-*+] )/)?.[1] || "- ";
      const newItem: InkwellElement = {
        type: "list-item",
        id: generateId(),
        children: [{ text: marker }],
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

    // Detect "- ", "* ", "+ " typed at start of paragraph → convert to list-item
    if (
      deco.lists &&
      element.type === "paragraph" &&
      text === " " &&
      (currentText === "-" || currentText === "*" || currentText === "+")
    ) {
      // Insert the space first so the text becomes "- " / "* " / "+ "
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
