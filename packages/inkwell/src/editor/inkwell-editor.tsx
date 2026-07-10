"use client";

import {
  Fragment,
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createEditor,
  type Descendant,
  Editor,
  Element,
  Node,
  type NodeEntry,
  Path,
  type Point,
  Range,
  Transforms,
} from "slate";
import { HistoryEditor, withHistory } from "slate-history";
import {
  Editable,
  ReactEditor,
  type RenderPlaceholderProps,
  Slate,
  withReact,
} from "slate-react";
import { createBubbleMenuPlugin } from "../plugins/bubble-menu";
import type {
  InkwellEditorFocusOptions,
  InkwellEditorHandle,
  InkwellEditorProps,
  InkwellEditorState,
  InkwellPlugin,
  InkwellPluginEditor,
  InkwellPluginPlaceholder,
  PluginKeyDownContext,
  ResolvedInkwellFeatures,
  SubscribeForwardedKey,
} from "../types";
import { computeDecorations } from "./slate/decorations";
import { deserialize } from "./slate/deserialize";
import { resolveFeatures } from "./slate/features";
import { RenderElement } from "./slate/render-element";
import { RenderLeaf } from "./slate/render-leaf";
import { serialize } from "./slate/serialize";
import type {
  InkwellElement,
  InkwellEditor as InkwellSlateEditor,
} from "./slate/types";
import { withMarkdown } from "./slate/with-markdown";
import { generateId, withNodeId } from "./slate/with-node-id";

const IS_SERVER = typeof window === "undefined";
const EMPTY_PLUGINS: InkwellPlugin[] = [];

function CharacterCount({
  count,
  limit,
  over,
}: {
  count: number;
  limit: number;
  over: boolean;
}) {
  const label = `${count} of ${limit} characters${over ? ", over limit" : ""}`;

  return (
    <div
      className={`inkwell-editor-character-count${over ? " inkwell-editor-character-count-over" : ""}`}
      role={over ? "status" : undefined}
      aria-live={over ? "polite" : "off"}
      aria-atomic={over ? true : undefined}
      aria-label={label}
    >
      {count} / {limit}
    </div>
  );
}

/**
 * Tab-on-list-marker recognizers. Markdown list lines stay as paragraph
 * text in the editor model, so Tab handling matches the raw text instead
 * of element type.
 */
const ORDERED_LIST_MARKER_RE = /^\s*\d+\.(?:\s|$)/;
const UNORDERED_LIST_MARKER_RE = /^(\s*)([-*+])(?:\s|$)/;

/**
 * Find the plugin activated by typing a single character (e.g. `[` for
 * snippets, `@` for mentions). Modifier combos (`Meta+j`) are keyboard-only
 * and never come through typed input, so they're skipped here. Used by the
 * content-driven mobile/IME activation path (see syncMobilePluginState).
 */
function findCharTriggerPlugin(
  plugins: InkwellPlugin[],
  char: string,
): InkwellPlugin | null {
  const lower = char.toLowerCase();
  for (const plugin of plugins) {
    const activation = plugin.activation;
    if (activation?.type !== "trigger") continue;
    if (activation.key.includes("+")) continue;
    if (activation.key.toLowerCase() === lower) return plugin;
  }
  return null;
}

function replaceEditorChildren(
  editor: InkwellSlateEditor,
  nodes: Descendant[],
  withoutSaving: boolean,
) {
  const replace = () => {
    Editor.withoutNormalizing(editor, () => {
      for (let index = editor.children.length - 1; index >= 0; index--) {
        Transforms.removeNodes(editor, { at: [index] });
      }
      Transforms.insertNodes(editor, nodes, { at: [0] });
    });
  };

  if (withoutSaving && HistoryEditor.isHistoryEditor(editor)) {
    HistoryEditor.withoutSaving(editor, replace);
    return;
  }

  replace();
}

/**
 * Resolve the collapsed DOM caret range under a viewport coordinate, bridging
 * the two browser APIs — `caretRangeFromPoint` (WebKit/Blink) and
 * `caretPositionFromPoint` (Firefox). Returns null when neither exists (e.g.
 * jsdom) or the point lands on no node.
 */
function caretRangeFromClientPoint(
  x: number,
  y: number,
): globalThis.Range | null {
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

/**
 * Collapsed range at the end of the document, or null if the (possibly
 * transient) tree can't resolve an end point yet. Used as the caret fallback
 * for clicks the hit-test can't place — e.g. the empty space below the text.
 */
function endOfDocumentRange(editor: InkwellSlateEditor): Range | null {
  try {
    const end = Editor.end(editor, []);
    return { anchor: end, focus: end };
  } catch {
    return null;
  }
}

/**
 * Public wrapper. Returns `null` during SSR so all hooks in the client
 * component below are always called in the same order on the client.
 */
export const InkwellEditor = forwardRef<
  InkwellEditorHandle,
  InkwellEditorProps
>(function InkwellEditor(props, ref) {
  if (IS_SERVER) return null;
  return <InkwellEditorClient {...props} ref={ref} />;
});

const InkwellEditorClient = forwardRef<InkwellEditorHandle, InkwellEditorProps>(
  function InkwellEditorClient(
    {
      content = "",
      onChange,
      onStateChange,
      className,
      classNames,
      styles,
      placeholder,
      editable = true,
      plugins: userPlugins = EMPTY_PLUGINS,
      rehypePlugins,
      features,
      bubbleMenu = true,
      characterLimit,
      onCharacterCount,
      submitOnEnter = false,
      onSubmit,
    },
    ref,
  ) {
    const resolvedFeatures = useMemo(
      () => resolveFeatures(features),
      [features],
    );
    const featuresRef = useRef<ResolvedInkwellFeatures>(resolvedFeatures);
    featuresRef.current = resolvedFeatures;

    const plugins = useMemo(() => {
      const builtIn = bubbleMenu ? [createBubbleMenuPlugin()] : [];
      // User plugins win when names collide — a custom `bubble-menu` plugin
      // replaces the built-in toolbar. Plugin names must stay unique inside
      // the editor so React keys stay stable.
      const userNames = new Set(userPlugins.map(p => p.name));
      const survivingBuiltIns = builtIn.filter(p => !userNames.has(p.name));
      return [...survivingBuiltIns, ...userPlugins];
    }, [userPlugins, bubbleMenu]);

    const editor = useMemo<InkwellSlateEditor>(() => {
      const base = withNodeId(withReact(createEditor()));
      return withMarkdown(withHistory(base), featuresRef);
    }, []);

    const initialValue = useMemo(
      () => deserialize(content, resolvedFeatures),
      [],
    );

    const lastContent = useRef<string>(content);
    const isInternalChange = useRef(false);
    const suppressImperativeOnChange = useRef(false);
    const [characterCount, setCharacterCount] = useState(
      () => serialize(initialValue as InkwellElement[]).length,
    );
    const [isFocused, setIsFocused] = useState(false);
    const focusStateFrameRef = useRef<number | null>(null);
    const [stateVersion, setStateVersion] = useState(0);

    const bumpStateVersion = useCallback(() => {
      setStateVersion(version => version + 1);
    }, []);

    // Some browsers can fail to visibly paint the caret on first click if
    // React re-renders during the native contenteditable focus/selection path.
    // Defer focus UI state one frame so browser selection settles first.
    const scheduleFocusedState = useCallback((nextFocused: boolean) => {
      if (focusStateFrameRef.current !== null) {
        cancelAnimationFrame(focusStateFrameRef.current);
      }

      focusStateFrameRef.current = requestAnimationFrame(() => {
        focusStateFrameRef.current = null;
        setIsFocused(nextFocused);
      });
    }, []);

    useEffect(
      () => () => {
        if (focusStateFrameRef.current !== null) {
          cancelAnimationFrame(focusStateFrameRef.current);
        }
      },
      [],
    );

    // Caret captured on pointer-down, committed on the focus it triggers.
    // See handleEditableFocus for why first focus needs an explicit selection.
    const pendingClickRangeRef = useRef<Range | null>(null);

    const handleEditablePointerDown = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        // Capture the caret here, on pointer-down, because by the time the
        // editable's focus event fires the browser hasn't reliably committed
        // the click's DOM selection yet — so the focus handler can't read it
        // back. Covers mouse, touch, and pen via pointer events. Read-only
        // editors take no caret, and shift- or secondary-clicks (range-extend,
        // context menu) fall through to the browser / Slate's native handling.
        if (!editable || event.button !== 0 || event.shiftKey) {
          pendingClickRangeRef.current = null;
          return;
        }
        const domRange = caretRangeFromClientPoint(
          event.clientX,
          event.clientY,
        );
        const mapped = domRange
          ? ReactEditor.toSlateRange(editor, domRange, {
              exactMatch: false,
              suppressThrow: true,
            })
          : null;
        // Clicking the empty space below the text hit-tests to no caret
        // position; fall back to the document end (where the browser drops the
        // caret anyway) so the click still lands and the focus sync can't wipe
        // it.
        pendingClickRangeRef.current = mapped ?? endOfDocumentRange(editor);
      },
      [editable, editor],
    );

    const handleEditableFocus = useCallback(() => {
      scheduleFocusedState(true);

      // Commit the clicked caret as the Slate selection the moment the editable
      // takes focus. This fixes two things:
      // - First focus inside a modal: an outside-driven re-render can run
      //   slate-react's selection sync while the editor is focused but
      //   editor.selection is still null, wiping the freshly placed DOM caret
      //   (removeAllRanges) so it looks focused but ignores typing. A non-null
      //   selection keeps the sync from clearing it.
      // - Re-focusing by click: Slate retains the previous selection across
      //   blur, so without this the caret snaps back to where it last was
      //   instead of where the user just clicked.
      // A fresh pointer click therefore always wins; keyboard or programmatic
      // focus (no pending click) falls through to Slate's own handling.
      const clickRange = pendingClickRangeRef.current;
      pendingClickRangeRef.current = null;
      if (clickRange) {
        try {
          Transforms.select(editor, clickRange);
        } catch {
          // The captured point may not map onto the live tree; let Slate's own
          // selection handling recover.
        }
      }
    }, [editor, scheduleFocusedState]);

    const updateCharacterCount = useCallback(() => {
      const length = serialize(editor.children as InkwellElement[]).length;
      setCharacterCount(length);
      onCharacterCount?.(length, characterLimit);
      return length;
    }, [editor, onCharacterCount, characterLimit]);

    const serializeContent = useCallback(
      () => serialize(editor.children as InkwellElement[]),
      [editor],
    );
    const pluginEditorRef = useRef<InkwellPluginEditor | null>(null);

    const handleChange = useCallback(
      (value: Descendant[]) => {
        // Only serialize when the document actually changed
        const isAstChange = editor.operations.some(
          op => op.type !== "set_selection",
        );
        if (!isAstChange) return;

        updateCharacterCount();
        bumpStateVersion();

        const currentPluginEditor = pluginEditorRef.current;
        if (currentPluginEditor) {
          for (const plugin of plugins) {
            plugin.onEditorChange?.(currentPluginEditor);
          }
        }

        // Mobile/IME: the keydown never carried the character (Android soft
        // keyboards send "Unidentified"), so drive char-trigger plugins from
        // the committed document here. onChange fires AFTER slate-react's
        // Android input flush, so opening the picker here can't re-render mid
        // input and duplicate the typed character. Desktop keydowns set the
        // flag, so this is a no-op there. Called via ref because the sync
        // callback is defined after this one.
        if (!keydownConsumedInputRef.current) {
          syncMobilePluginStateRef.current();
        }

        const nextContent = serialize(value as InkwellElement[]);
        // Prevent echo loops
        if (nextContent !== lastContent.current) {
          lastContent.current = nextContent;
          isInternalChange.current = true;
          onChange?.(nextContent);
        }
      },
      [bumpStateVersion, editor, onChange, plugins, updateCharacterCount],
    );

    const overLimit =
      characterLimit !== undefined && characterCount > characterLimit;
    const hasCharacterLimit = characterLimit !== undefined;
    const showCharacterCount =
      characterLimit !== undefined && characterCount >= characterLimit * 0.8;

    const getEditorState = useCallback((): InkwellEditorState => {
      const content = serializeContent();
      return {
        content,
        isEmpty: content.trim().length === 0,
        isFocused,
        isEditable: editable,
        characterCount,
        characterLimit,
        overLimit,
      };
    }, [
      characterCount,
      characterLimit,
      editable,
      editor,
      isFocused,
      overLimit,
      serializeContent,
    ]);

    useEffect(() => {
      if (isInternalChange.current) {
        isInternalChange.current = false;
        return;
      }
      if (content === lastContent.current) return;

      const newValue = deserialize(content, resolvedFeatures);
      replaceEditorChildren(editor, newValue, true);

      // Reset selection to start to avoid stale selection errors
      Transforms.select(editor, Editor.start(editor, []));
      lastContent.current = content;
      updateCharacterCount();
      bumpStateVersion();
      editor.onChange();
    }, [
      bumpStateVersion,
      content,
      editor,
      resolvedFeatures,
      updateCharacterCount,
    ]);

    useEffect(() => {
      onStateChange?.(getEditorState());
    }, [getEditorState, onStateChange, stateVersion]);

    const decorate = useCallback(
      (entry: NodeEntry) => {
        const ranges = computeDecorations(entry, editor, rehypePlugins);

        return ranges;
      },
      [editor, rehypePlugins],
    );

    // ─── Plugin activation + key forwarding ───────────────────────────────────
    //
    // Two ways a plugin becomes "active":
    //
    // 1. Trigger-based (e.g. `@` for mentions): the editor matches the
    //    character or modifier combo and stores the matched plugin in
    //    `activePlugin`.
    // 2. Self-claimed (e.g. slash commands): the plugin's `onKeyDown` calls
    //    `activate` from the keydown context. This is necessary for
    //    plugins that conditionally activate based on context (only at the
    //    start of a blank line, etc.) without consuming a single global
    //    trigger character.
    //
    // While a plugin is active:
    //
    // - The Slate editable still owns DOM focus.
    // - Navigation keys + typed printable characters are forwarded to
    //   subscribers registered via `subscribeForwardedKey`, scoped per
    //   plugin name. Listeners only see keys when their plugin is the
    //   active one (no cross-editor cross-talk).
    // - Trigger matching is skipped, so e.g. typing `:` while slash
    //   commands are open does not open the emoji picker on top.
    const [activePlugin, setActivePluginState] = useState<InkwellPlugin | null>(
      null,
    );
    const [activePluginQuery, setActivePluginQuery] = useState("");
    const activePluginQueryRef = useRef("");
    const activePluginRef = useRef<InkwellPlugin | null>(null);
    activePluginRef.current = activePlugin;
    // Document point of the trigger character for the active char-trigger
    // plugin (null for modifier/manual activation). Lets selection delete the
    // exact "<trigger><query>" span even when the typed-query mirror
    // undercounts on mobile/IME input.
    const triggerPointRef = useRef<Point | null>(null);
    // True when the current keydown carried a real character/Backspace, so the
    // content-driven mobile sync (in handleChange) skips inputs the keydown
    // path already handled. Stays false for Android soft-keyboard keydowns
    // (key "Unidentified"/keyCode 229), whose characters only reach the model
    // via slate-react's Android input flush.
    const keydownConsumedInputRef = useRef(false);
    // Indirection so handleChange (defined above the activation helpers) can
    // call the latest content-driven mobile sync without a dep cycle.
    const syncMobilePluginStateRef = useRef<() => void>(() => {});
    const pluginPositionRef = useRef<{
      top: number;
      left: number;
      cursorRect: { top: number; bottom: number; left: number };
    }>({
      top: 0,
      left: 0,
      cursorRect: { top: 0, bottom: 0, left: 0 },
    });
    const forwardedKeyListenersRef = useRef<
      Map<string, Set<(key: string) => void>>
    >(new Map());

    const wrapperRef = useRef<HTMLDivElement>(null);
    const editorElRef = useRef<HTMLDivElement | null>(null);

    // Stable `subscribeForwardedKey` factory. Returned to plugins via render
    // props; identity is stable per plugin name so subscribers can use it
    // safely in effect deps.
    const subscribeForwardedKeyFor = useCallback(
      (pluginName: string): SubscribeForwardedKey =>
        listener => {
          const map = forwardedKeyListenersRef.current;
          let listeners = map.get(pluginName);
          if (!listeners) {
            listeners = new Set();
            map.set(pluginName, listeners);
          }
          listeners.add(listener);
          return () => {
            listeners?.delete(listener);
            if (listeners && listeners.size === 0) map.delete(pluginName);
          };
        },
      [],
    );

    const emitForwardedKey = useCallback((pluginName: string, key: string) => {
      const listeners = forwardedKeyListenersRef.current.get(pluginName);
      if (!listeners || listeners.size === 0) return;
      for (const listener of listeners) listener(key);
    }, []);

    // Reshape an "empty" editor (no visible text) into the canonical single
    // empty paragraph so the placeholder UI has a stable block to render in.
    // Wrapped in `HistoryEditor.withoutSaving` so cmd+a-delete + cmd+z still
    // undoes the user's delete — without it, this reshape is recorded as its
    // own batch and the first undo just pops the canonicalize, leaving the
    // post-delete state (often a stranded code-fence) in place.
    const canonicalizeEmptyEditor = useCallback(() => {
      if (Node.string(editor).trim().length !== 0) return;

      const onlyChild = editor.children[0] as InkwellElement | undefined;
      const isCanonicalEmptyParagraph =
        editor.children.length === 1 &&
        onlyChild?.type === "paragraph" &&
        Node.string(onlyChild).length === 0;
      if (isCanonicalEmptyParagraph) return;

      HistoryEditor.withoutSaving(editor, () => {
        Editor.withoutNormalizing(editor, () => {
          for (let index = editor.children.length - 1; index >= 0; index--) {
            Transforms.removeNodes(editor, { at: [index] });
          }
          Transforms.insertNodes(editor, {
            type: "paragraph",
            id: generateId(),
            children: [{ text: "" }],
          } satisfies InkwellElement);
        });
      });
    }, [editor]);

    const selectEditor = useCallback(
      (at: InkwellEditorFocusOptions["at"] = "end") => {
        try {
          Transforms.select(
            editor,
            at === "start" ? Editor.start(editor, []) : Editor.end(editor, []),
          );
        } catch {
          // Empty/transient Slate trees can fail selection math during setup.
        }
      },
      [editor],
    );

    const focusEditor = useCallback(
      (options?: InkwellEditorFocusOptions) => {
        ReactEditor.focus(editor);
        if (options?.at) selectEditor(options.at);
      },
      [editor, selectEditor],
    );

    const replaceContent = useCallback(
      (
        content: string,
        options?: { select?: "start" | "end" | "preserve" },
      ) => {
        const select = options?.select ?? "start";
        const newValue = deserialize(content, resolvedFeatures);

        suppressImperativeOnChange.current = true;
        replaceEditorChildren(editor, newValue, true);
        updateCharacterCount();
        bumpStateVersion();

        if (select !== "preserve") selectEditor(select);
        const nextContent = serializeContent();
        lastContent.current = nextContent;
        editor.onChange();
        queueMicrotask(() => {
          suppressImperativeOnChange.current = false;
        });
      },
      [
        bumpStateVersion,
        editor,
        resolvedFeatures,
        selectEditor,
        serializeContent,
        updateCharacterCount,
      ],
    );

    useImperativeHandle(
      ref,
      () => ({
        getState: getEditorState,
        focus: focusEditor,
        clear: options => replaceContent("", options),
        setContent: replaceContent,
        insertContent: content => {
          focusEditor();
          const nodes = deserialize(content, resolvedFeatures);
          Transforms.insertFragment(editor, nodes);
        },
      }),
      [
        editor,
        focusEditor,
        getEditorState,
        replaceContent,
        resolvedFeatures,
        serializeContent,
      ],
    );

    const getCursorPosition = useCallback(() => {
      const empty = {
        top: 0,
        left: 0,
        cursorRect: { top: 0, bottom: 0, left: 0 },
      };
      try {
        const domSelection = window.getSelection();
        if (!domSelection || domSelection.rangeCount === 0) return empty;
        const range = domSelection.getRangeAt(0);
        let rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && domSelection.anchorNode) {
          const node =
            domSelection.anchorNode instanceof HTMLElement
              ? domSelection.anchorNode
              : domSelection.anchorNode.parentElement;
          if (node) rect = node.getBoundingClientRect();
        }
        const wrapperEl = wrapperRef.current;
        if (!wrapperEl) return empty;
        const wrapperRect = wrapperEl.getBoundingClientRect();
        const cursorTop = rect.top - wrapperRect.top;
        const cursorBottom = rect.bottom - wrapperRect.top;
        const cursorLeft = rect.left - wrapperRect.left;
        return {
          top: cursorBottom + 4,
          left: cursorLeft,
          cursorRect: {
            top: cursorTop,
            bottom: cursorBottom,
            left: cursorLeft,
          },
        };
      } catch {
        return empty;
      }
    }, []);

    const wrapSelection = useCallback(
      (before: string, after: string) => {
        const { selection } = editor;
        if (!selection) return;
        const selectedText = Editor.string(editor, selection);

        // If already wrapped, unwrap
        if (
          selectedText.startsWith(before) &&
          selectedText.endsWith(after) &&
          selectedText.length >= before.length + after.length
        ) {
          Transforms.delete(editor);
          Transforms.insertText(
            editor,
            selectedText.slice(before.length, -after.length || undefined),
          );
          return;
        }

        // Check if the surrounding text contains the markers (selection is inside markers)
        const { anchor, focus } = selection;
        const [start, end] = Range.isForward(selection)
          ? [anchor, focus]
          : [focus, anchor];
        const beforeStart = {
          path: start.path,
          offset: Math.max(0, start.offset - before.length),
        };
        const afterEnd = { path: end.path, offset: end.offset + after.length };

        try {
          const textBefore = Editor.string(editor, {
            anchor: beforeStart,
            focus: start,
          });
          const textAfter = Editor.string(editor, {
            anchor: end,
            focus: afterEnd,
          });

          if (textBefore === before && textAfter === after) {
            // Remove surrounding markers
            const expandedRange = { anchor: beforeStart, focus: afterEnd };
            Transforms.select(editor, expandedRange);
            Transforms.delete(editor);
            Transforms.insertText(editor, selectedText);
            return;
          }
        } catch {
          // Range might be out of bounds — fall through to wrap
        }

        // Wrap with markers
        Transforms.delete(editor);
        Transforms.insertText(editor, `${before}${selectedText}${after}`);
      },
      [editor],
    );

    const insertTextAtCursor = useCallback(
      (text: string) => {
        ReactEditor.focus(editor);
        const nodes = deserialize(text, resolvedFeatures);
        // Use insertFragment to merge the first node into the current block
        // instead of splitting and creating a blank line
        Transforms.insertFragment(editor, nodes);
      },
      [editor, resolvedFeatures],
    );

    const getCurrentBlockPath = useCallback(() => {
      const { selection } = editor;
      if (!selection || !Range.isCollapsed(selection)) return null;
      return selection.anchor.path.slice(0, 1);
    }, [editor]);

    const getRangeContent = useCallback(
      (range: Range) => {
        try {
          return Editor.string(editor, range);
        } catch {
          return null;
        }
      },
      [editor],
    );

    const getCurrentBlockContent = useCallback(() => {
      const path = getCurrentBlockPath();
      if (!path) return null;
      try {
        return Editor.string(editor, path);
      } catch {
        return null;
      }
    }, [editor, getCurrentBlockPath]);

    const getCurrentBlockContentBeforeCursor = useCallback(() => {
      const { selection } = editor;
      if (!selection || !Range.isCollapsed(selection)) return null;
      const anchor = selection.anchor;
      return getRangeContent({
        anchor: { path: anchor.path, offset: 0 },
        focus: anchor,
      });
    }, [editor, getRangeContent]);

    const replaceCurrentBlockContent = useCallback(
      (nextContent: string) => {
        const path = getCurrentBlockPath();
        if (!path) return;
        const start = Editor.start(editor, path);
        const end = Editor.end(editor, path);
        Transforms.select(editor, { anchor: start, focus: end });
        Transforms.insertText(editor, nextContent);
        Transforms.select(editor, Editor.end(editor, path));
      },
      [editor, getCurrentBlockPath],
    );

    const clearCurrentBlock = useCallback(() => {
      const path = getCurrentBlockPath();
      if (!path) return;
      try {
        const start = Editor.start(editor, path);
        const end = Editor.end(editor, path);
        Transforms.select(editor, { anchor: start, focus: end });
        Transforms.delete(editor);
        editor.onChange();
      } catch {
        // The block may have already been removed by an external edit.
      }
    }, [editor, getCurrentBlockPath]);

    const insertImage = useCallback(
      (image: { id?: string; url: string; alt: string }) => {
        const id = image.id ?? generateId();
        Transforms.insertNodes(editor, {
          type: "image",
          id,
          url: image.url,
          alt: image.alt,
          children: [{ text: "" }],
        } satisfies InkwellElement);
        return id;
      },
      [editor],
    );

    const updateImage = useCallback(
      (id: string, image: { url?: string; alt?: string }) => {
        for (const [node, path] of Node.nodes(editor)) {
          if (
            Editor.isEditor(node) ||
            !("type" in node) ||
            node.type !== "image" ||
            node.id !== id
          ) {
            continue;
          }
          Transforms.setNodes(editor, image, { at: path });
          break;
        }
      },
      [editor],
    );

    const removeImage = useCallback(
      (id: string) => {
        for (const [node, path] of Node.nodes(editor)) {
          if (
            Editor.isEditor(node) ||
            !("type" in node) ||
            node.type !== "image" ||
            node.id !== id
          ) {
            continue;
          }
          Transforms.removeNodes(editor, { at: path });
          break;
        }
      },
      [editor],
    );

    const pluginEditorImplRef = useRef<InkwellPluginEditor | null>(null);
    const getPluginEditorImpl = useCallback(() => {
      const impl = pluginEditorImplRef.current;
      if (!impl) throw new Error("Inkwell plugin editor is not ready");
      return impl;
    }, []);
    const pluginEditor = useMemo<InkwellPluginEditor>(
      () => ({
        getState: () => getPluginEditorImpl().getState(),
        isEmpty: () => getPluginEditorImpl().isEmpty(),
        focus: options => getPluginEditorImpl().focus(options),
        clear: options => getPluginEditorImpl().clear(options),
        setContent: (content, options) =>
          getPluginEditorImpl().setContent(content, options),
        insertContent: content => getPluginEditorImpl().insertContent(content),
        getContentBeforeCursor: () =>
          getPluginEditorImpl().getContentBeforeCursor(),
        getCurrentBlockContent: () =>
          getPluginEditorImpl().getCurrentBlockContent(),
        getCurrentBlockContentBeforeCursor: () =>
          getPluginEditorImpl().getCurrentBlockContentBeforeCursor(),
        replaceCurrentBlockContent: content =>
          getPluginEditorImpl().replaceCurrentBlockContent(content),
        clearCurrentBlock: () => getPluginEditorImpl().clearCurrentBlock(),
        wrapSelection: (before, after) =>
          getPluginEditorImpl().wrapSelection(before, after),
        insertImage: image => getPluginEditorImpl().insertImage(image),
        updateImage: (id, image) =>
          getPluginEditorImpl().updateImage(id, image),
        removeImage: id => getPluginEditorImpl().removeImage(id),
      }),
      [getPluginEditorImpl],
    );

    pluginEditorImplRef.current = {
      getState: getEditorState,
      isEmpty: () => serializeContent().trim().length === 0,
      focus: focusEditor,
      clear: options => replaceContent("", options),
      setContent: replaceContent,
      insertContent: insertTextAtCursor,
      getContentBeforeCursor: () => {
        const { selection } = editor;
        if (!selection || !Range.isCollapsed(selection)) return null;
        return getRangeContent({
          anchor: Editor.start(editor, []),
          focus: selection.anchor,
        });
      },
      getCurrentBlockContent,
      getCurrentBlockContentBeforeCursor,
      replaceCurrentBlockContent,
      clearCurrentBlock,
      wrapSelection,
      insertImage,
      updateImage,
      removeImage,
    };

    useEffect(() => {
      const { insertData } = editor;
      editor.insertData = (data: DataTransfer) => {
        const baseContext = {
          editor: pluginEditor,
          insertData,
        };

        for (const plugin of plugins) {
          if (plugin.onInsertData?.(data, baseContext)) return;
        }

        insertData(data);
      };

      const cleanups: Array<() => void> = [];
      for (const plugin of plugins) {
        if (!plugin.setup) continue;
        const cleanup = plugin.setup(pluginEditor);
        if (typeof cleanup === "function") cleanups.push(cleanup);
      }

      return () => {
        editor.insertData = insertData;
        for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]();
      };
    }, [editor, plugins, pluginEditor, wrapSelection]);

    pluginEditorRef.current = pluginEditor;

    const dismissPlugin = useCallback(() => {
      activePluginRef.current = null;
      setActivePluginState(null);
      activePluginQueryRef.current = "";
      setActivePluginQuery("");
      triggerPointRef.current = null;
      ReactEditor.focus(editor);
    }, [editor]);

    const activatePlugin = useCallback(
      (plugin: InkwellPlugin, options?: { query?: string }) => {
        const initialQuery = options?.query ?? "";
        activePluginQueryRef.current = initialQuery;
        setActivePluginQuery(initialQuery);
        pluginPositionRef.current = getCursorPosition();
        // The trigger char for a single-character trigger is inserted at the
        // caret right after activation, so the caret here marks where it lands.
        // Modifier and manual activations insert no trigger char.
        const activation = plugin.activation;
        const isCharTrigger =
          activation?.type === "trigger" && !activation.key.includes("+");
        triggerPointRef.current = isCharTrigger
          ? (editor.selection?.anchor ?? null)
          : null;
        activePluginRef.current = plugin;
        setActivePluginState(plugin);
      },
      [editor, getCursorPosition],
    );

    const handlePluginSelect = useCallback(
      (text: string) => {
        const activation = activePlugin?.activation;
        const triggerKey =
          activation?.type === "trigger" ? activation.key : undefined;
        const isCharTrigger = triggerKey && !triggerKey.includes("+");
        const queryLength = activePluginQueryRef.current.length;
        // Captured before dismiss() clears it. On mobile/IME the query mirror
        // can undercount (composed characters never reach the keydown or
        // beforeinput char path), so we prefer the actual span from the
        // trigger char to the caret when it is available and longer.
        const triggerPoint = triggerPointRef.current;
        dismissPlugin();
        requestAnimationFrame(() => {
          ReactEditor.focus(editor);
          if (isCharTrigger) {
            let distance = 1 + queryLength;
            const selection = editor.selection;
            if (triggerPoint && selection && Range.isCollapsed(selection)) {
              try {
                const span = Editor.string(editor, {
                  anchor: triggerPoint,
                  focus: selection.anchor,
                });
                distance = Math.max(distance, span.length);
              } catch {
                // Stale trigger point (tree changed) — keep the mirror count.
              }
            }
            Transforms.delete(editor, {
              distance,
              unit: "character",
              reverse: true,
            });
          }
          insertTextAtCursor(text);
        });
      },
      [dismissPlugin, insertTextAtCursor, activePlugin, editor],
    );

    const isActivatablePlugin = (plugin: InkwellPlugin) =>
      (plugin.activation?.type ?? "always") !== "always";
    const makePluginProps = (plugin: InkwellPlugin) => ({
      active: isActivatablePlugin(plugin) ? activePlugin === plugin : true,
      query: activePlugin === plugin ? activePluginQuery : "",
      onSelect: handlePluginSelect,
      onDismiss: dismissPlugin,
      position: {
        top: pluginPositionRef.current.top,
        left: pluginPositionRef.current.left,
      },
      cursorRect: pluginPositionRef.current.cursorRect,
      editorRef: editorElRef,
      editor: pluginEditor,
      wrapSelection,
      subscribeForwardedKey: subscribeForwardedKeyFor(plugin.name),
    });

    const makeKeyDownContext = useCallback(
      (plugin: InkwellPlugin): PluginKeyDownContext => ({
        editor: pluginEditor,
        wrapSelection,
        activate: options => activatePlugin(plugin, options),
        dismiss: dismissPlugin,
      }),
      [activatePlugin, dismissPlugin, pluginEditor, wrapSelection],
    );

    // ─── Mobile / IME plugin driving ──────────────────────────────────────────
    //
    // Android soft keyboards (Gboard) fire `keydown` with key "Unidentified" /
    // keyCode 229 for printable characters, so the keydown-driven trigger and
    // query logic never sees the character and pickers like snippets (`[`)
    // never open. slate-react commits Android input to the model on a debounced
    // flush, then calls onChange, so we detect char triggers and track the
    // query from the *committed document* in handleChange instead. Running
    // post-flush (rather than in beforeinput, mid-input) is what keeps opening
    // the picker from re-rendering the editable during reconciliation and
    // duplicating the just-typed character. The picker still filters through
    // its existing forwarded-key channel — we replay the query delta into it.

    const emitQueryDelta = useCallback(
      (previous: string, next: string) => {
        const plugin = activePluginRef.current;
        if (!plugin || previous === next) return;
        let shared = 0;
        while (
          shared < previous.length &&
          shared < next.length &&
          previous[shared] === next[shared]
        ) {
          shared++;
        }
        for (let i = previous.length; i > shared; i--) {
          emitForwardedKey(plugin.name, "Backspace");
        }
        for (let i = shared; i < next.length; i++) {
          emitForwardedKey(plugin.name, next[i]);
        }
        activePluginQueryRef.current = next;
        setActivePluginQuery(next);
      },
      [emitForwardedKey],
    );

    const syncMobilePluginState = useCallback(() => {
      const selection = editor.selection;
      const active = activePluginRef.current;

      if (active) {
        const activation = active.activation;
        const point = triggerPointRef.current;
        const isCharTrigger =
          activation?.type === "trigger" && !activation.key.includes("+");
        if (!isCharTrigger || !point || !activation) return;

        // Dismiss if the caret left the trigger's block or moved to/before the
        // trigger character (e.g. the user backspaced the `[` itself).
        const caret = selection?.anchor;
        if (
          !selection ||
          !Range.isCollapsed(selection) ||
          !caret ||
          !Path.equals(caret.path, point.path) ||
          caret.offset < point.offset + 1
        ) {
          dismissPlugin();
          return;
        }

        try {
          const triggerChar = Editor.string(editor, {
            anchor: point,
            focus: { path: point.path, offset: point.offset + 1 },
          });
          if (triggerChar.toLowerCase() !== activation.key.toLowerCase()) {
            dismissPlugin();
            return;
          }
          const query = Editor.string(editor, {
            anchor: { path: point.path, offset: point.offset + 1 },
            focus: caret,
          });
          emitQueryDelta(activePluginQueryRef.current, query);
        } catch {
          dismissPlugin();
        }
        return;
      }

      // No active plugin: did a single character trigger just land before the
      // caret? (onChange only fires on document edits, so this can't misfire on
      // a bare cursor move.)
      const caret = selection?.anchor;
      if (!selection || !Range.isCollapsed(selection) || !caret) return;
      if (caret.offset < 1) return;
      let typed = "";
      try {
        typed = Editor.string(editor, {
          anchor: { path: caret.path, offset: caret.offset - 1 },
          focus: caret,
        });
      } catch {
        return;
      }
      const plugin = findCharTriggerPlugin(plugins, typed);
      if (!plugin) return;
      if (plugin.shouldTrigger) {
        // shouldTrigger only reads the key + modifier flags; typed characters
        // carry no modifiers, so synthesize that minimal shape.
        const syntheticEvent = {
          key: typed,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          shiftKey: false,
        } as unknown as React.KeyboardEvent<HTMLDivElement>;
        if (!plugin.shouldTrigger(syntheticEvent, makeKeyDownContext(plugin))) {
          return;
        }
      }
      activatePlugin(plugin);
      // activatePlugin recorded the post-insertion caret; the trigger char sits
      // one position back, so correct it here.
      triggerPointRef.current = {
        path: caret.path,
        offset: caret.offset - 1,
      };
    }, [
      activatePlugin,
      dismissPlugin,
      editor,
      emitQueryDelta,
      makeKeyDownContext,
      plugins,
    ]);

    syncMobilePluginStateRef.current = syncMobilePluginState;

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Record whether this keydown carried a real character so the
        // content-driven mobile sync can skip inputs the keydown path already
        // handles. Android soft keyboards report "Unidentified" here, leaving
        // this false so those characters are handled from the committed
        // document in handleChange.
        keydownConsumedInputRef.current =
          event.key === "Backspace" || event.key.length === 1;

        // If a plugin is active, keep keyboard interaction inside that plugin.
        // The plugin picker may not have focus yet (for character triggers, the
        // editor receives the trigger key first), so forward navigation, submit,
        // editing, and printable keys via the editor-scoped emitter so the
        // picker can react without owning DOM focus.
        if (activePlugin) {
          // Plugins customize their own active-state behavior via
          // `onActiveKeyDown`. Returning `false` dismisses the plugin and lets
          // the key flow into the editor (e.g. emoji closes on space).
          // Calling `event.preventDefault()` consumes the key entirely.
          const activeResult = activePlugin.onActiveKeyDown?.(
            event,
            makeKeyDownContext(activePlugin),
          );
          if (activeResult === false) {
            dismissPlugin();
            // Fall through — the dismissing key still gets a chance at
            // trigger matching below (so typing `:` after a closed emoji
            // can reopen the picker, for example).
          } else {
            if (event.defaultPrevented) return;

            if (event.key === "Escape") {
              event.preventDefault();
              dismissPlugin();
              return;
            }

            const isPrintable =
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              event.key.length === 1;
            const shouldForward =
              event.key === "ArrowDown" ||
              event.key === "ArrowUp" ||
              event.key === "Enter" ||
              event.key === "Backspace" ||
              isPrintable;

            if (shouldForward) {
              if (event.key === "Enter") {
                event.preventDefault();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
              } else if (event.key === "Backspace") {
                if (activePluginQueryRef.current.length === 0) {
                  dismissPlugin();
                  return;
                }
                const nextQuery = activePluginQueryRef.current.slice(0, -1);
                activePluginQueryRef.current = nextQuery;
                setActivePluginQuery(nextQuery);
              } else if (isPrintable) {
                const nextQuery = `${activePluginQueryRef.current}${event.key}`;
                activePluginQueryRef.current = nextQuery;
                setActivePluginQuery(nextQuery);
              }

              emitForwardedKey(activePlugin.name, event.key);
            }
            return;
          }
        }

        // Dispatch to plugin onKeyDown handlers. Short-circuit if a plugin
        // calls preventDefault so trigger matching doesn't run for the same event.
        // A plugin that calls `ctx.activate(...)` here claims activation;
        // subsequent plugins still get a chance to run unless preventDefault was
        // called.
        for (const plugin of plugins) {
          plugin.onKeyDown?.(event, makeKeyDownContext(plugin));
          if (event.defaultPrevented) return;
          // If the keydown handler claimed activation, stop further matching
          // so the same event doesn't also fire a trigger.
          if (activePluginRef.current) return;
        }

        if (submitOnEnter && event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit?.(serializeContent());
          return;
        }

        // Check plugin triggers
        for (const plugin of plugins) {
          const activation = plugin.activation;
          if (activation?.type !== "trigger") continue;

          const parts = activation.key
            .toLowerCase()
            .split("+")
            .map(s => s.trim());
          const key = parts[parts.length - 1];
          const mods = new Set(parts.slice(0, -1));
          const hasModifiers = mods.size > 0;
          const needCtrl = mods.has("control") || mods.has("ctrl");
          const needMeta =
            mods.has("meta") || mods.has("cmd") || mods.has("command");
          const needAlt = mods.has("alt");
          const needShift = mods.has("shift");

          const keyMatch = event.key.toLowerCase() === key;
          const modMatch = hasModifiers
            ? event.ctrlKey === needCtrl &&
              event.metaKey === needMeta &&
              event.altKey === needAlt &&
              event.shiftKey === needShift
            : !event.ctrlKey && !event.metaKey;

          if (keyMatch && modMatch) {
            if (
              plugin.shouldTrigger &&
              !plugin.shouldTrigger(event, makeKeyDownContext(plugin))
            ) {
              continue;
            }
            if (hasModifiers) event.preventDefault();
            activatePlugin(plugin);
            return;
          }
        }

        // Tab on a Markdown list-like paragraph: indent unordered markers by
        // two leading spaces; preserve ordered markers verbatim. Either way,
        // consume the event so focus stays in the editor.
        if (
          event.key === "Tab" &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          const { selection } = editor;
          if (selection) {
            const [match] = Editor.nodes(editor, {
              match: n => Element.isElement(n),
            });
            if (match) {
              const [node, path] = match;
              const element = node as InkwellElement;
              if (element.type === "paragraph") {
                const text = Node.string(node);
                if (ORDERED_LIST_MARKER_RE.test(text)) {
                  event.preventDefault();
                  return;
                }
                if (UNORDERED_LIST_MARKER_RE.test(text)) {
                  event.preventDefault();
                  const savedSelection = editor.selection;
                  Transforms.insertText(editor, "  ", {
                    at: { path: [...path, 0], offset: 0 },
                  });
                  if (savedSelection) {
                    Transforms.select(editor, {
                      anchor: {
                        path: savedSelection.anchor.path,
                        offset: savedSelection.anchor.offset + 2,
                      },
                      focus: {
                        path: savedSelection.focus.path,
                        offset: savedSelection.focus.offset + 2,
                      },
                    });
                  }
                  return;
                }
              }
            }
          }
        }

        // Cmd+A on empty editor: no-op
        if (
          event.key === "a" &&
          (event.metaKey || event.ctrlKey) &&
          !Node.string(editor).trim()
        ) {
          event.preventDefault();
          return;
        }
      },
      [
        plugins,
        activePlugin,
        editor,
        getCursorPosition,
        dismissPlugin,
        makeKeyDownContext,
        activatePlugin,
        emitForwardedKey,
        submitOnEnter,
        onSubmit,
        serializeContent,
      ],
    );

    const pluginPlaceholder = plugins.reduce<InkwellPluginPlaceholder | null>(
      (value, plugin) => {
        if (value) return value;
        const nextPlaceholder = plugin.getPlaceholder?.(pluginEditor) ?? null;
        if (!nextPlaceholder) return null;
        return typeof nextPlaceholder === "string"
          ? { text: nextPlaceholder }
          : nextPlaceholder;
      },
      null,
    );
    const basePlaceholder =
      pluginPlaceholder?.text ?? placeholder ?? "Start writing...";
    const resolvedPlaceholder = pluginPlaceholder?.hint
      ? `${pluginPlaceholder.hint}  ${basePlaceholder}`
      : basePlaceholder;

    useLayoutEffect(() => {
      if (!pluginPlaceholder) return;
      if (Node.string(editor).trim().length !== 0) return;

      canonicalizeEmptyEditor();
      selectEditor("start");
    }, [
      canonicalizeEmptyEditor,
      editor,
      pluginPlaceholder,
      selectEditor,
      stateVersion,
    ]);

    // slate-react drives editor growth for multi-line placeholders by
    // observing the placeholder element's size and writing
    // `min-height: placeholderHeight` onto the editable. The measurement
    // doesn't include the editable's own padding, so under
    // `box-sizing: border-box` (the common case in consumer apps) the
    // editable's content area ends up shorter than the placeholder by
    // exactly its vertical padding and the placeholder text overflows
    // the visible editor — see the createCompletionsPlugin ghost-text
    // case where the LLM completion can be many lines long.
    //
    // Hack: pad the placeholder element's bottom by 2rem (the editor's
    // default top + bottom padding) so slate's measured height already
    // includes the frame, and the resulting min-height covers the full
    // visible box. The bottom padding sits below opacity-0.333 text in
    // an absolutely positioned element, so it's invisible — pure
    // measurement padding. Two known limitations:
    //
    //  1. If a consumer overrides the editor's vertical padding via
    //     `styles.editor` / `classNames.editor`, the 2rem buffer is off
    //     by the delta. The padding is consciously hardcoded to the
    //     library's default; reading `getComputedStyle` per-render
    //     wasn't worth the complexity.
    //  2. If a consumer passes `minHeight` on `styles.editor`, slate's
    //     own `min-height` is overridden (`userStyle` spreads last on
    //     `<Editable>`), so this hack has no effect. Consumers in that
    //     state need to size the editor large enough to fit completions
    //     themselves.
    const renderPlaceholder = useCallback(
      ({ attributes, children }: RenderPlaceholderProps) => (
        <span
          {...attributes}
          style={{
            ...attributes.style,
            paddingBottom: "2rem",
          }}
        >
          {children}
        </span>
      ),
      [],
    );

    return (
      <div
        ref={wrapperRef}
        className={`inkwell-editor-wrapper${hasCharacterLimit ? " inkwell-editor-has-character-limit" : ""}${overLimit ? " inkwell-editor-over-limit" : ""}${className ? ` ${className}` : ""}${classNames?.root ? ` ${classNames.root}` : ""}`}
        style={styles?.root}
      >
        {showCharacterCount && (
          <CharacterCount
            count={characterCount}
            limit={characterLimit}
            over={overLimit}
          />
        )}
        {activePlugin && (
          <div
            className="inkwell-plugin-backdrop"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
              background: "transparent",
            }}
            onMouseDown={dismissPlugin}
          />
        )}
        {plugins.map(plugin => {
          const props = makePluginProps(plugin);
          if (!props.active || !plugin.render) return null;
          return <Fragment key={plugin.name}>{plugin.render(props)}</Fragment>;
        })}
        <Slate
          editor={editor}
          initialValue={initialValue}
          onChange={handleChange}
        >
          <Editable
            ref={editorElRef}
            className={`inkwell-editor${classNames?.editor ? ` ${classNames.editor}` : ""}`}
            style={styles?.editor}
            renderElement={RenderElement}
            renderLeaf={RenderLeaf}
            renderPlaceholder={renderPlaceholder}
            decorate={decorate}
            placeholder={resolvedPlaceholder}
            spellCheck
            role="textbox"
            aria-multiline
            aria-placeholder={resolvedPlaceholder}
            data-placeholder={resolvedPlaceholder}
            readOnly={!editable}
            onPointerDown={handleEditablePointerDown}
            onFocus={handleEditableFocus}
            onBlur={() => {
              // Drop any captured click so it can't leak into a later
              // keyboard/programmatic focus that should restore the selection.
              pendingClickRangeRef.current = null;
              scheduleFocusedState(false);
            }}
            onKeyDown={handleKeyDown}
          />
        </Slate>
      </div>
    );
  },
);
