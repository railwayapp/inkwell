import { Editor, Element, Node, Path, Range, Transforms } from "slate";
import type { ResolvedInkwellFeatures } from "../../types";
import { deserialize } from "./deserialize";
import { serialize } from "./serialize";
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
 * Matches a single URL token on the clipboard — `https?://...` or `www....`,
 * no embedded whitespace. Used to detect "paste URL over selection" and wrap
 * the selection as `[selected](url)` rather than dropping the bare URL.
 */
const PASTED_URL_RE = /^(?:https?:\/\/|www\.)\S+$/i;

/**
 * Classify a single line of text into the element type it should render as.
 * Mirrors the deserializer's per-line block detection so a runtime edit
 * (split, backspace, paste, etc.) reclassifies the line the same way a
 * fresh deserialization would.
 *
 * Only covers the block kinds that are 1:1 with a markdown line and can
 * appear inside a paragraph-like element: heading (when the feature is
 * enabled), blockquote (when enabled), and the paragraph fallback.
 * Structural blocks (code-fence/code-line) and void blocks (image) are
 * handled separately by their own logic and are never reclassified here.
 */
function classifyLine(
  text: string,
  deco: ResolvedInkwellFeatures,
): { type: "heading" | "paragraph" | "blockquote"; level?: number } {
  const headingMatch = HEADING_LINE_RE.exec(text);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const key = `heading${level}` as keyof ResolvedInkwellFeatures;
    if (deco[key]) return { type: "heading", level };
  }
  if (deco.blockquotes && /^>\s/.test(text)) {
    return { type: "blockquote" };
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
  const {
    insertBreak,
    insertData,
    insertText,
    isVoid,
    normalizeNode,
    setFragmentData,
  } = editor;

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

  // Paste: parse as markdown and insert structured nodes. If the pasted
  // payload is a single URL and there's a non-empty selection, wrap the
  // selected text as `[selected](url)` instead — common "paste a URL onto
  // selected text" UX from rich editors.
  editor.insertData = (data: DataTransfer) => {
    const text = data.getData("text/plain");
    if (text) {
      const trimmed = text.trim();
      const sel = editor.selection;
      if (
        PASTED_URL_RE.test(trimmed) &&
        sel &&
        !Range.isCollapsed(sel) &&
        Editor.string(editor, sel).length > 0
      ) {
        const selectedText = Editor.string(editor, sel);
        Transforms.delete(editor);
        Transforms.insertText(editor, `[${selectedText}](${trimmed})`);
        return;
      }
      const nodes = deserialize(text, featuresRef.current);
      // insertFragment merges the first node's text into the current block
      // and only splits when the fragment introduces a new block. insertNodes
      // always splits at the caret, leaving an empty paragraph behind.
      Transforms.insertFragment(editor, nodes);
      return;
    }
    insertData(data);
  };

  // Copy/cut/drag: replace the default `text/plain` payload with our
  // Markdown serialization of the selection.
  //
  // slate-react's default derives `text/plain` from the rendered HTML's
  // `innerText`, which inserts an extra newline for each empty block
  // element. A single empty paragraph between two blocks (one blank line
  // in the editor) ends up as TWO blank lines on the clipboard, so pasting
  // into plain-text consumers like Discord shows an unintended extra gap.
  // The HTML and slate-fragment payloads stay as-is so paste-back into
  // Slate or other rich-text editors still works.
  editor.setFragmentData = (data, originEvent) => {
    // The default also populates `text/html` and the slate-fragment payload,
    // which require the editor to be mounted in the DOM. If that lookup
    // fails (tests, hot-reload races), we still set `text/plain` below so
    // copy never silently breaks.
    try {
      setFragmentData(data, originEvent);
    } catch {
      // intentionally swallow — text/plain is still set below
    }
    const fragment = editor.getFragment() as InkwellElement[];
    if (fragment.length > 0) {
      data.setData("text/plain", serialize(fragment));
    }
  };

  // Keep block element type in sync with the markdown line it carries.
  //
  // Element types are set at deserialize time and by the typing-triggered
  // promotions in `insertText`, but they don't auto-update when text is
  // edited by other means (backspace, paste-inside-block, programmatic
  // edits, the split-at-caret behavior above). Result: text like
  // `## Features` could end up in a paragraph element and render as
  // unstyled source.
  //
  // This normalizer reruns the same line-level classification the
  // deserializer uses on every operation. Only the text-driven block
  // kinds are reclassified — code-fence/code-line are structural and
  // images are void, so neither is in scope here.
  editor.normalizeNode = entry => {
    const [node, path] = entry;
    if (Element.isElement(node)) {
      const element = node as InkwellElement;
      const textDriven =
        element.type === "paragraph" ||
        element.type === "heading" ||
        element.type === "blockquote";
      if (textDriven) {
        const text = Node.string(node);
        const cls = classifyLine(text, featuresRef.current);
        if (cls.type === "heading" && cls.level !== undefined) {
          if (element.type !== "heading" || element.level !== cls.level) {
            Transforms.setNodes(
              editor,
              {
                type: "heading",
                level: cls.level,
              } as Partial<InkwellElement>,
              { at: path },
            );
            return;
          }
        } else if (cls.type === "blockquote") {
          if (element.type !== "blockquote") {
            Transforms.setNodes(
              editor,
              { type: "blockquote" } as Partial<InkwellElement>,
              { at: path },
            );
            if (element.level !== undefined) {
              Transforms.unsetNodes(editor, "level", { at: path });
            }
            return;
          }
        } else {
          // paragraph
          if (element.type !== "paragraph") {
            Transforms.setNodes(
              editor,
              { type: "paragraph" } as Partial<InkwellElement>,
              { at: path },
            );
            if (element.level !== undefined) {
              Transforms.unsetNodes(editor, "level", { at: path });
            }
            return;
          }
        }
      }
    }
    normalizeNode(entry);
  };

  return editor;
}
