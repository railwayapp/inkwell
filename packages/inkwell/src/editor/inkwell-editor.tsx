"use client";

import {
  Fragment,
  forwardRef,
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
import { deserialize, deserializeWithRanges } from "./slate/deserialize";
import { resolveFeatures } from "./slate/features";
import { RenderElement } from "./slate/render-element";
import { RenderLeaf } from "./slate/render-leaf";
import { serialize } from "./slate/serialize";
import {
  createSourceCache,
  invalidateCacheEntry,
  populateSourceCacheFromParse,
  type SourceCache,
} from "./slate/source-cache";
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
 * Walk the ancestor chain from a Slate path and return the path of the
 * nearest list-item ancestor (or `null`). Used by the Tab/Shift+Tab
 * keybindings to find the current bullet's container for nest /
 * un-nest operations.
 */
function nearestListItemPath(
  editor: InkwellSlateEditor,
  path: Path,
): Path | null {
  for (let p = path; p.length > 0; p = Path.parent(p)) {
    if (p.length === path.length) continue;
    const node = Node.get(editor, p) as InkwellElement;
    if (node?.type === "list-item") return p;
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

    // Per-editor source cache. Tracks the original source slice +
    // canonical form for each top-level block so untouched blocks
    // round-trip byte-perfect. The cache lives outside Slate state
    // (so undo/redo doesn't have to thread through it) and is
    // populated at parse time + invalidated by an `editor.apply`
    // interceptor whenever a top-level block is mutated.
    const sourceCacheRef = useRef<SourceCache>(createSourceCache());

    const editor = useMemo<InkwellSlateEditor>(() => {
      const base = withNodeId(withReact(createEditor()));
      const composed = withMarkdown(withHistory(base), featuresRef);
      const { apply } = composed;
      composed.apply = op => {
        // Most ops touch a single top-level block at `op.path[0]`.
        // Move ops also touch `op.newPath[0]`. Invalidating before
        // the op applies catches the case where the op replaces the
        // block — the OLD id's cache entry becomes meaningless.
        if (
          "path" in op &&
          op.path.length > 0 &&
          typeof op.path[0] === "number"
        ) {
          const topNode = composed.children[op.path[0]];
          if (topNode && "id" in topNode && typeof topNode.id === "string") {
            invalidateCacheEntry(sourceCacheRef.current, topNode.id);
          }
        }
        if (
          op.type === "move_node" &&
          op.newPath.length > 0 &&
          typeof op.newPath[0] === "number"
        ) {
          const destNode = composed.children[op.newPath[0]];
          if (destNode && "id" in destNode && typeof destNode.id === "string") {
            invalidateCacheEntry(sourceCacheRef.current, destNode.id);
          }
        }
        apply(op);
      };
      return composed;
    }, []);

    const initialValue = useMemo(() => {
      const parsed = deserializeWithRanges(content, resolvedFeatures);
      populateSourceCacheFromParse(
        sourceCacheRef.current,
        content,
        parsed.nodes,
        parsed.ranges,
      );
      return parsed.nodes;
    }, []);

    const lastContent = useRef<string>(content);
    const isInternalChange = useRef(false);
    const [characterCount, setCharacterCount] = useState(
      () =>
        serialize(initialValue as InkwellElement[], {
          cache: sourceCacheRef.current,
        }).length,
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

    const updateCharacterCount = useCallback(() => {
      const length = serialize(editor.children as InkwellElement[], {
        cache: sourceCacheRef.current,
      }).length;
      setCharacterCount(length);
      onCharacterCount?.(length, characterLimit);
      return length;
    }, [editor, onCharacterCount, characterLimit]);

    const serializeContent = useCallback(
      () =>
        serialize(editor.children as InkwellElement[], {
          cache: sourceCacheRef.current,
        }),
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

        // An active trigger/manual plugin holds a position anchor that
        // refers to a character somewhere in the editor (typically the
        // `@`/`/`/`:` the user typed). When the document gets cleared
        // out from under it (cmd+A → delete, setContent, paste-over-
        // selection, etc.) that anchor becomes meaningless and the
        // picker would render at stale coordinates. Dismiss as soon as
        // the editor is empty so the user sees a clean state. The
        // narrow check — single empty paragraph — keeps this from
        // misfiring on normal edits like clearing the last char of a
        // paragraph.
        if (
          activePluginRef.current &&
          editor.children.length === 1 &&
          Node.string(editor).length === 0
        ) {
          activePluginRef.current = null;
          setActivePluginState(null);
          activePluginQueryRef.current = "";
          setActivePluginQuery("");
        }

        // Serialize through the source cache so untouched sibling blocks
        // round-trip byte-for-byte (matching getState/onSubmit/character
        // count). Without the cache, editing one block re-canonicalizes
        // every untouched sibling (`*`→`-`, expanded blockquotes, escaped
        // `***`) in the onChange payload — diverging from getState and
        // breaking the source-cache contract. Cache-faithful serialization
        // also lets the echo guard below correctly suppress the onChange
        // that imperative setContent/clear would otherwise leak.
        const nextContent = serialize(value as InkwellElement[], {
          cache: sourceCacheRef.current,
        });
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

      sourceCacheRef.current.clear();
      const parsed = deserializeWithRanges(content, resolvedFeatures);
      populateSourceCacheFromParse(
        sourceCacheRef.current,
        content,
        parsed.nodes,
        parsed.ranges,
      );
      replaceEditorChildren(editor, parsed.nodes, true);

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
    // post-delete state (often a stranded code-block) in place.
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
        sourceCacheRef.current.clear();
        const parsed = deserializeWithRanges(content, resolvedFeatures);
        populateSourceCacheFromParse(
          sourceCacheRef.current,
          content,
          parsed.nodes,
          parsed.ranges,
        );

        replaceEditorChildren(editor, parsed.nodes, true);
        updateCharacterCount();
        bumpStateVersion();

        if (select !== "preserve") selectEditor(select);
        // Prime the echo guard with the cache-faithful serialization so
        // the `editor.onChange()` below is suppressed in handleChange —
        // setContent/clear must not emit onChange. Both this and
        // handleChange serialize through the same source cache, so the
        // strings match and the guard fires. (This is why the onChange
        // path above must use the cache too.)
        const nextContent = serializeContent();
        lastContent.current = nextContent;
        editor.onChange();
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
          // Pure-newline content means "paragraph break(s)" — the user
          // wants to split the current block, not insert empty text.
          // `deserialize("\n")` returns a single empty paragraph, which
          // `insertFragment` would no-op into the current paragraph.
          // Route to `insertBreak` per newline instead so the editor
          // surface gets the structural splits the caller asked for.
          if (/^\n+$/.test(content)) {
            for (let i = 0; i < content.length; i++) editor.insertBreak();
            return;
          }
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
        // Top-level void block. Block-level so Slate's Up/Down arrow
        // navigation lands cleanly on the image; the renderer side
        // already wraps a standalone image in `<p>` so source
        // round-trip stays mdast-shaped.
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
      ReactEditor.focus(editor);
    }, [editor]);

    const activatePlugin = useCallback(
      (plugin: InkwellPlugin, options?: { query?: string }) => {
        const initialQuery = options?.query ?? "";
        activePluginQueryRef.current = initialQuery;
        setActivePluginQuery(initialQuery);
        pluginPositionRef.current = getCursorPosition();
        activePluginRef.current = plugin;
        setActivePluginState(plugin);
      },
      [getCursorPosition],
    );

    const handlePluginSelect = useCallback(
      (text: string) => {
        const activation = activePlugin?.activation;
        const triggerKey =
          activation?.type === "trigger" ? activation.key : undefined;
        const isCharTrigger = triggerKey && !triggerKey.includes("+");
        const queryLength = activePluginQueryRef.current.length;
        dismissPlugin();
        requestAnimationFrame(() => {
          ReactEditor.focus(editor);
          if (isCharTrigger) {
            Transforms.delete(editor, {
              distance: 1 + queryLength,
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

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
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

        // Tab / Shift+Tab inside a list-item: nest the item one level
        // deeper or un-nest it one level.
        //
        // Tab nests by moving the current list-item *into* its previous
        // sibling's children (under a freshly-created or reused nested
        // list), matching how `<ul>` → `<li>` → `<ul>` round-trips. The
        // very first item in a list has no prev sibling to nest under
        // so Tab is a no-op there.
        //
        // Shift+Tab un-nests by moving the current list-item out of
        // its containing nested list, into the grandparent list as the
        // next sibling of its current parent list-item.
        if (
          event.key === "Tab" &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          const { selection } = editor;
          if (selection) {
            const [match] = Editor.nodes(editor, {
              match: n => Element.isElement(n),
              mode: "lowest",
            });
            if (match) {
              const [, path] = match;
              const liPath = nearestListItemPath(editor, path);
              if (liPath !== null) {
                event.preventDefault();
                const listPath = Path.parent(liPath);
                const list = Node.get(editor, listPath) as InkwellElement;

                if (event.shiftKey) {
                  // Un-nest. Only meaningful when the containing list
                  // sits inside another list-item.
                  if (listPath.length >= 2) {
                    const parentLiPath = Path.parent(listPath);
                    const parentLi = Node.get(
                      editor,
                      parentLiPath,
                    ) as InkwellElement;
                    if (parentLi?.type === "list-item") {
                      const grandListPath = Path.parent(parentLiPath);
                      const grandList = Node.get(
                        editor,
                        grandListPath,
                      ) as InkwellElement;
                      if (grandList?.type === "list") {
                        const targetIdx =
                          parentLiPath[parentLiPath.length - 1] + 1;
                        const targetPath: Path = [...grandListPath, targetIdx];
                        Transforms.moveNodes(editor, {
                          at: liPath,
                          to: targetPath,
                        });
                      }
                    }
                  }
                  return;
                }

                const liIdx = liPath[liPath.length - 1];
                if (liIdx === 0) return;
                const prevPath: Path = [...liPath.slice(0, -1), liIdx - 1];
                const prevItem = Node.get(editor, prevPath) as InkwellElement;
                if (!prevItem || prevItem.type !== "list-item") return;

                const lastChild =
                  prevItem.children[prevItem.children.length - 1];
                const lastChildIsList =
                  lastChild &&
                  "type" in lastChild &&
                  lastChild.type === "list" &&
                  lastChild.ordered === list.ordered;

                if (lastChildIsList) {
                  // Append into the existing nested list.
                  const nestedListPath: Path = [
                    ...prevPath,
                    prevItem.children.length - 1,
                  ];
                  const nestedList = Node.get(
                    editor,
                    nestedListPath,
                  ) as InkwellElement;
                  Transforms.moveNodes(editor, {
                    at: liPath,
                    to: [...nestedListPath, nestedList.children.length],
                  });
                } else {
                  // Create a new nested list inside the prev item.
                  Editor.withoutNormalizing(editor, () => {
                    const nestedListPath: Path = [
                      ...prevPath,
                      prevItem.children.length,
                    ];
                    Transforms.insertNodes(
                      editor,
                      {
                        type: "list",
                        id: crypto.randomUUID(),
                        ordered: list.ordered,
                        children: [],
                      } as unknown as Element,
                      { at: nestedListPath },
                    );
                    Transforms.moveNodes(editor, {
                      at: liPath,
                      to: [...nestedListPath, 0],
                    });
                  });
                }
                return;
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
            onFocus={() => scheduleFocusedState(true)}
            onBlur={() => scheduleFocusedState(false)}
            onKeyDown={handleKeyDown}
          />
        </Slate>
      </div>
    );
  },
);
