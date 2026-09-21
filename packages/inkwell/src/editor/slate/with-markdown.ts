import { Editor, Element, Node, Path, Point, Range, Transforms } from "slate";
import type { ResolvedInkwellFeatures } from "../../types";
import { deserialize } from "./deserialize";
import { serialize } from "./serialize";
import type { InkwellEditor, InkwellElement } from "./types";
import { generateId } from "./with-node-id";

/**
 * True when `range` covers the entire editor from the very first text
 * offset to the very last. Used to short-circuit `deleteFragment` so
 * cmd+A → delete resets to a clean paragraph regardless of which block
 * type the editor currently holds.
 */
function isFullDocumentRange(editor: Editor, range: Range): boolean {
  const start = Range.start(range);
  const end = Range.end(range);
  const docStart = Editor.start(editor, []);
  const docEnd = Editor.end(editor, []);
  return Point.equals(start, docStart) && Point.equals(end, docEnd);
}

const HEADING_RE = /^#{1,6}$/;
/** Matches a line that opens with valid heading syntax: `#{1,6}` + space. */
const HEADING_LINE_RE = /^(#{1,6})\s/;
/** Matches an ordered-list bare marker like `1.`, `42.`, used as a typing trigger. */
const ORDERED_TRIGGER_RE = /^(\d+)\.$/;
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
 * Structural blocks (code-block) and block voids (image) are handled
 * separately by their own logic and are never reclassified here.
 */
function classifyLine(
  text: string,
  deco: ResolvedInkwellFeatures,
): {
  type: "heading" | "paragraph" | "blockquote";
  level?: number;
} {
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

/** Strip a single `> ` (or `>`) blockquote prefix from a line. */
function stripBlockquotePrefix(line: string): string {
  if (line === ">") return "";
  if (line.startsWith("> ") || line.startsWith(">\t")) return line.slice(2);
  return line.slice(1);
}

/**
 * Walk the ancestor chain starting at `path` and return the path of the
 * nearest blockquote ancestor, or `null` if there isn't one.
 */
function nearestBlockquotePath(editor: InkwellEditor, path: Path): Path | null {
  for (let p = path; p.length > 0; p = Path.parent(p)) {
    if (p.length === path.length) continue;
    const node = Node.get(editor, p) as InkwellElement;
    if (node?.type === "blockquote") return p;
  }
  return null;
}

/**
 * Walk the ancestor chain starting at `path` and return the path of the
 * nearest list-item ancestor, or `null` if there isn't one.
 */
function nearestListItemPath(editor: InkwellEditor, path: Path): Path | null {
  for (let p = path; p.length > 0; p = Path.parent(p)) {
    if (p.length === path.length) continue;
    const node = Node.get(editor, p) as InkwellElement;
    if (node?.type === "list-item") return p;
  }
  return null;
}
/**
 * Slate plugin that adds markdown-specific editor behaviors:
 * - `\`\`\`` + Enter on a paragraph → promote to a code-block
 * - Enter on blockquote → new paragraph (exit blockquote)
 * - Enter on heading → new paragraph (exit heading)
 * - Shift+Enter on blockquote → soft break (stay in blockquote)
 * - Typing "> " at start of paragraph → convert to blockquote
 * - Typing "# " at start of paragraph → convert to heading
 * - Enter on a paragraph that starts with ` ``` ` → convert to code-block
 * - Enter inside a code-block → insert a literal `\n` into its text
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
    deleteBackward,
    deleteFragment,
    insertBreak,
    insertData,
    insertText,
    isVoid,
    normalizeNode,
    setFragmentData,
  } = editor;

  // One-shot arm for the code-block double-Enter exit: set when an
  // Enter inserts the trailing newline at a block's end, checked (and
  // consumed) by the next Enter, disarmed by any other text edit.
  let pendingCodeExit: { id: string; text: string } | null = null;

  // Backspace inside an EMPTY code block converts it back to a
  // paragraph instead of merging into the previous block — the escape
  // hatch that makes an empty fence removable by keyboard (paired with
  // the double-Enter exit in insertBreak).
  editor.deleteBackward = unit => {
    pendingCodeExit = null;
    const [match] = Editor.nodes(editor, {
      match: n =>
        Element.isElement(n) && (n as InkwellElement).type === "code-block",
      mode: "lowest",
    });
    if (match) {
      const [node, path] = match;
      if (Node.string(node) === "") {
        Transforms.setNodes(
          editor,
          { type: "paragraph" } as Partial<InkwellElement>,
          { at: path },
        );
        Transforms.unsetNodes(editor, "lang", { at: path });
        return;
      }
    }
    deleteBackward(unit);
  };

  editor.isVoid = (element: InkwellElement) => {
    if (element.type === "image") return true;
    return isVoid(element);
  };

  // Slate's default `deleteFragment` clears the content covered by the
  // selection but never removes the top-level block that anchors the
  // selection — so deleting a full-editor selection (cmd+A → backspace)
  // over a code-block, heading, blockquote, or image leaves an empty
  // shell of that block behind. Reset the editor to a single empty
  // paragraph instead so the post-delete state matches what the user
  // expects: a fresh blank line.
  editor.deleteFragment = options => {
    const { selection } = editor;
    if (
      selection &&
      !Range.isCollapsed(selection) &&
      isFullDocumentRange(editor, selection)
    ) {
      Editor.withoutNormalizing(editor, () => {
        for (let i = editor.children.length - 1; i >= 0; i--) {
          Transforms.removeNodes(editor, { at: [i] });
        }
        // Anchor at `[0]` explicitly: after the remove loop the editor
        // has no children and no selection, and Slate's default insert
        // location math doesn't have an answer for "empty editor, no
        // selection". The explicit path keeps this deterministic.
        Transforms.insertNodes(
          editor,
          {
            type: "paragraph",
            id: generateId(),
            children: [{ text: "" }],
          } as InkwellElement,
          { at: [0] },
        );
      });
      Transforms.select(editor, Editor.start(editor, [0]));
      return;
    }
    deleteFragment(options);
  };

  editor.insertBreak = () => {
    const { selection } = editor;
    if (!selection) return insertBreak();

    const [match] = Editor.nodes(editor, {
      match: n => Element.isElement(n),
      mode: "lowest",
    });
    if (!match) return insertBreak();

    const [node, path] = match;
    const element = node as InkwellElement;
    const text = Node.string(node);
    const deco = featuresRef.current;

    // Paragraph starting with ``` → promote to a code-block. The fence
    // (and any language tag) becomes structural; the new code-block is
    // empty and ready to accept code.
    if (
      deco.codeBlocks &&
      element.type === "paragraph" &&
      text.startsWith("```")
    ) {
      const lang = text.slice(3).trim();
      Editor.withoutNormalizing(editor, () => {
        Transforms.delete(editor, {
          at: {
            anchor: Editor.start(editor, path),
            focus: Editor.end(editor, path),
          },
        });
        const update: Partial<InkwellElement> = { type: "code-block" };
        if (lang) update.lang = lang;
        Transforms.setNodes(editor, update);
      });
      Transforms.select(editor, Editor.start(editor, path));
      return;
    }

    // Enter inside a code-block. Two exit gestures come first — a code
    // block with no keyboard way out is a trap (the trailing code block
    // used to be inescapable):
    // - Second CONSECUTIVE Enter at the very end (tracked via
    //   pendingCodeExit — set only when the previous Enter inserted the
    //   trailing newline) → drop that blank line and insert a paragraph
    //   after the block, mirroring the blockquote exit. Keying on
    //   "text ends with \n" alone exited on the FIRST Enter for code
    //   that legitimately ends with a blank line, silently deleting it.
    // - Caret at the very end with the last line exactly ``` (the user
    //   typed a closing fence) → remove that line and exit the same way.
    // (Backspace in an EMPTY code block converts it back to a paragraph
    // — see deleteBackward below — so an empty fence is removable too.)
    // Anything else inserts a literal newline into the single text leaf
    // (the editor's `.inkwell-editor-code-block` rule renders it via
    // `white-space: pre-wrap`).
    if (element.type === "code-block") {
      const collapsed = Range.isCollapsed(selection);
      const blockEnd = Editor.end(editor, path);
      const atEnd = collapsed && Point.equals(selection.anchor, blockEnd);
      const closingFence = /(?:^|\n)```$/.exec(text);
      const pendingExit =
        pendingCodeExit !== null &&
        pendingCodeExit.id === element.id &&
        pendingCodeExit.text === text &&
        text.endsWith("\n");
      if (atEnd && (pendingExit || closingFence)) {
        // match[0] includes the leading `\n` when the fence isn't the
        // whole text, so its length is exactly what must be dropped.
        const dropLen = pendingExit
          ? 1
          : (closingFence as RegExpExecArray)[0].length;
        pendingCodeExit = null;
        Editor.withoutNormalizing(editor, () => {
          Transforms.delete(editor, {
            at: {
              anchor: {
                path: blockEnd.path,
                offset: blockEnd.offset - dropLen,
              },
              focus: blockEnd,
            },
          });
          Transforms.insertNodes(
            editor,
            {
              type: "paragraph",
              id: generateId(),
              children: [{ text: "" }],
            } as InkwellElement,
            { at: Path.next(path) },
          );
        });
        Transforms.select(editor, Editor.start(editor, Path.next(path)));
        return;
      }
      editor.insertText("\n");
      // Arm the exit only when THIS Enter added a trailing newline at
      // the block end; any other edit disarms it (see insertText).
      pendingCodeExit = atEnd ? { id: element.id, text: `${text}\n` } : null;
      return;
    }

    // Enter inside a paragraph that lives within a blockquote.
    // - Empty inner paragraph → exit the blockquote: drop the empty
    //   paragraph, insert a fresh paragraph as the blockquote's outer
    //   sibling, and move the caret there. If removing the empty
    //   paragraph would empty the blockquote, replace the entire
    //   blockquote with the fresh paragraph (in-place) so we never
    //   transition through a tree state where Slate has no blocks.
    // - Non-empty inner paragraph → fall through to Slate's default
    //   split, which inserts a sibling paragraph inside the blockquote.
    if (element.type === "paragraph") {
      const bqPath = nearestBlockquotePath(editor, path);
      // Only handle paragraphs that are DIRECT children of the
      // blockquote. An empty paragraph nested deeper (inside a list in
      // the quote) belongs to the list-exit branch below — handling it
      // here used to count the blockquote's direct children (just the
      // list), conclude "only child", and delete the entire blockquote
      // with all its content.
      if (bqPath !== null && text === "" && Path.isParent(bqPath, path)) {
        const blockquote = Node.get(editor, bqPath) as InkwellElement;
        const isOnlyChild = blockquote.children.length === 1;
        const newParagraph: InkwellElement = {
          type: "paragraph",
          id: generateId(),
          children: [{ text: "" }],
        };
        const insertAt = isOnlyChild ? bqPath : Path.next(bqPath);
        Editor.withoutNormalizing(editor, () => {
          if (isOnlyChild) {
            Transforms.removeNodes(editor, { at: bqPath });
          } else {
            Transforms.removeNodes(editor, { at: path });
          }
          Transforms.insertNodes(editor, newParagraph, { at: insertAt });
        });
        Transforms.select(editor, Editor.start(editor, insertAt));
        return;
      }
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

    // Enter inside a paragraph that lives within a list-item.
    // - Empty inner paragraph → exit the list (mirrors blockquote
    //   exit behavior). If the empty item was the list's only child,
    //   the entire list is replaced in-place with the fresh paragraph;
    //   otherwise the empty item is removed and a paragraph is
    //   inserted as the list's outer sibling.
    // - Non-empty inner paragraph → split the *list-item* at the
    //   caret, producing two sibling items inside the same list. This
    //   is the standard "Enter creates a new bullet" UX.
    if (element.type === "paragraph") {
      const liPath = nearestListItemPath(editor, path);
      if (liPath !== null) {
        if (text === "") {
          const listPath = Path.parent(liPath);
          const list = Node.get(editor, listPath) as InkwellElement;
          const li = Node.get(editor, liPath) as InkwellElement;
          // Decide how much structure the exit removes. Never remove a
          // node that still holds other content — "remove the whole
          // list" used to fire on `list.children.length === 1` alone,
          // destroying sibling paragraphs/nested lists via plain Enter
          // presses.
          const liHasOtherContent = li.children.length > 1;
          const listHasOtherItems = list.children.length > 1;
          const newParagraph: InkwellElement = {
            type: "paragraph",
            id: generateId(),
            children: [{ text: "" }],
          };
          let removeAt: Path;
          let insertAt: Path;
          if (liHasOtherContent) {
            // Only the empty paragraph goes; the item keeps its other
            // children. The fresh paragraph exits past the list.
            removeAt = path;
            insertAt = Path.next(listPath);
          } else if (listHasOtherItems) {
            // The item held nothing but the empty paragraph — drop it.
            removeAt = liPath;
            insertAt = Path.next(listPath);
          } else {
            // The whole list is just this one empty item — replace the
            // list with the paragraph in place.
            removeAt = listPath;
            insertAt = listPath;
          }
          Editor.withoutNormalizing(editor, () => {
            Transforms.removeNodes(editor, { at: removeAt });
            Transforms.insertNodes(editor, newParagraph, { at: insertAt });
          });
          Transforms.select(editor, Editor.start(editor, insertAt));
          return;
        }
        // Non-empty: split at the list-item boundary.
        if (!Range.isCollapsed(selection)) {
          Transforms.delete(editor);
        }
        Transforms.splitNodes(editor, {
          match: n => Element.isElement(n) && n.type === "list-item",
          always: true,
        });
        return;
      }
    }

    // Enter on image → insert paragraph after the image (void elements
    // can't hold a cursor internally). Without this branch the default
    // path below retypes the void element itself into a paragraph,
    // deleting the image.
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
      mode: "lowest",
    });
    if (match) {
      const [node, path] = match;
      const element = node as InkwellElement;
      // Shift+Enter inside a blockquote paragraph → insert another
      // paragraph as a sibling inside the blockquote so the caret stays
      // in the quoted context. (Pre-nesting this added a sibling
      // blockquote element instead; the structural marker is now
      // implicit, so the user-visible behavior is the same.)
      if (element.type === "paragraph") {
        const bqPath = nearestBlockquotePath(editor, path);
        if (bqPath !== null) {
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
      }
      // Shift+Enter inside a code-block → same as Enter: insert a
      // literal newline into the single text leaf.
      if (element.type === "code-block") {
        editor.insertText("\n");
        return;
      }
    }
    // For everything else, treat Shift+Enter as regular Enter
    editor.insertBreak();
  };

  editor.insertText = (text: string) => {
    pendingCodeExit = null;
    const { selection } = editor;
    if (!selection) return insertText(text);

    // Typing over a selection that spans multiple top-level blocks OR
    // covers the whole document: route the deletion through
    // editor.deleteFragment first (which resets a full-document
    // selection to a fresh paragraph), then insert at the collapsed
    // caret. Slate's built-in expanded-range insertText keeps the
    // surviving block's container — typing over select-all in a
    // document ending with (or consisting of) a code block used to
    // land the replacement text inside that fence.
    if (
      !Range.isCollapsed(selection) &&
      (selection.anchor.path[0] !== selection.focus.path[0] ||
        isFullDocumentRange(editor, selection))
    ) {
      editor.deleteFragment();
      editor.insertText(text);
      return;
    }

    const [match] = Editor.nodes(editor, {
      match: n => Element.isElement(n),
      mode: "lowest",
    });
    if (!match) return insertText(text);

    const [node, path] = match;
    const element = node as InkwellElement;
    const currentText = Node.string(node);
    const deco = featuresRef.current;

    // Detect "> " typed at the start of a paragraph → wrap the paragraph
    // in a blockquote (or, when the paragraph is already inside a
    // blockquote, deepen one more level of nesting). The `> ` marker is
    // structural — it doesn't stay in the text — so we drop the existing
    // `>` content before wrapping and don't re-insert the space.
    if (
      deco.blockquotes &&
      element.type === "paragraph" &&
      text === " " &&
      currentText === ">"
    ) {
      Transforms.delete(editor, {
        at: {
          anchor: Editor.start(editor, path),
          focus: Editor.end(editor, path),
        },
      });
      Transforms.wrapNodes(
        editor,
        {
          type: "blockquote",
          id: generateId(),
          children: [],
        } as InkwellElement,
        { at: path },
      );
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

    // List trigger: typing `<marker><space>` at the start of a paragraph
    // (and the paragraph isn't already inside a list-item) promotes the
    // paragraph into a `list → list-item → paragraph` chain. Unordered
    // markers (`-`, `*`, `+`) drop their character; ordered markers
    // (`<n>.`) carry the parsed number through to the list's `start`.
    if (
      element.type === "paragraph" &&
      text === " " &&
      nearestListItemPath(editor, path) === null
    ) {
      let listShape: { ordered: boolean; start?: number } | null = null;
      if (currentText === "-" || currentText === "*" || currentText === "+") {
        listShape = { ordered: false };
      } else {
        const ord = ORDERED_TRIGGER_RE.exec(currentText);
        if (ord) {
          listShape = { ordered: true, start: Number.parseInt(ord[1], 10) };
        }
      }
      if (listShape) {
        Editor.withoutNormalizing(editor, () => {
          Transforms.delete(editor, {
            at: {
              anchor: Editor.start(editor, path),
              focus: Editor.end(editor, path),
            },
          });
          Transforms.wrapNodes(
            editor,
            {
              type: "list-item",
              id: generateId(),
              children: [],
            } as InkwellElement,
            { at: path },
          );
          const listNode: InkwellElement = {
            type: "list",
            id: generateId(),
            children: [],
          };
          if (listShape.ordered) {
            listNode.ordered = true;
            if (listShape.start !== undefined && listShape.start !== 1) {
              listNode.start = listShape.start;
            }
          }
          Transforms.wrapNodes(editor, listNode, { at: path });
        });
        return;
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
      // Paste with the selection INSIDE a code block (collapsed caret,
      // or an expanded selection whose both edges sit in the SAME code
      // block): code content is verbatim. Deserializing the payload as
      // markdown used to keep only the first pasted line as code and
      // re-parse the remainder into real blocks OUTSIDE the fence (a
      // pasted `# comment` became an actual heading after the block).
      // A selection that merely TOUCHES a code block from outside falls
      // through to the normal markdown paste — hijacking it inserted
      // literal blank-line runs into the surviving paragraph.
      const selection = editor.selection;
      const codeBlockAt = (point: Point): InkwellElement | undefined => {
        const entry = Editor.above(editor, {
          at: point,
          match: n =>
            Element.isElement(n) && (n as InkwellElement).type === "code-block",
        });
        return entry ? (entry[0] as InkwellElement) : undefined;
      };
      if (selection) {
        const [start, end] = Range.edges(selection);
        const startCode = codeBlockAt(start);
        const insideOneCodeBlock =
          startCode !== undefined &&
          (Range.isCollapsed(selection) || codeBlockAt(end) === startCode);
        if (insideOneCodeBlock) {
          Transforms.insertText(editor, text.replace(/\r\n?/g, "\n"));
          return;
        }
      }
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
      // Thread the editor's source cache so fully-selected untouched
      // blocks hit the same byte-faithful short-circuit as getState /
      // onChange. Partially-selected blocks miss the canonical-equality
      // gate and fall back to canonical, which is correct.
      data.setData(
        "text/plain",
        serialize(fragment, { cache: editor.sourceCache }),
      );
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
  // kinds are reclassified — code-block is structural and
  // images are void, so neither is in scope here.
  editor.normalizeNode = entry => {
    const [node, path] = entry;
    if (Element.isElement(node)) {
      const element = node as InkwellElement;
      // Only text-bearing elements are reclassifiable. Blockquote holds
      // block children (no direct text) — its presence is structural,
      // driven by deserialize / the typing trigger / the wrap below, not
      // by line classification.
      const textDriven =
        element.type === "paragraph" || element.type === "heading";
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
          // The paragraph's text starts with `> ` — strip the marker and
          // wrap the paragraph in a blockquote so the resulting tree
          // matches what `deserialize` would produce for the same source.
          const stripped = stripBlockquotePrefix(text);
          Transforms.delete(editor, {
            at: {
              anchor: Editor.start(editor, path),
              focus: Editor.end(editor, path),
            },
          });
          if (stripped) {
            Transforms.insertText(editor, stripped, {
              at: Editor.start(editor, path),
            });
          }
          Transforms.wrapNodes(
            editor,
            {
              type: "blockquote",
              id: generateId(),
              children: [],
            } as InkwellElement,
            { at: path },
          );
          return;
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
