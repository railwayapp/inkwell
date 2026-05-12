"use client";

import {
  CursorEditor,
  relativePositionToSlatePoint,
  withCursors,
  withYHistory,
  withYjs,
  YjsEditor,
} from "@slate-yjs/core";
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
  Node,
  type NodeEntry,
  Range,
  Transforms,
} from "slate";
import { withHistory } from "slate-history";
import { Editable, ReactEditor, Slate, withReact } from "slate-react";
import { createBubbleMenuPlugin } from "../plugins/bubble-menu";
import type {
  InkwellDecorations,
  InkwellEditorFocusOptions,
  InkwellEditorHandle,
  InkwellEditorProps,
  InkwellEditorState,
  InkwellPlugin,
  InkwellPluginPlaceholder,
  InkwellSetMarkdownOptions,
  PluginKeyDownContext,
  SubscribeForwardedKey,
} from "../types";
import { computeDecorations } from "./slate/decorations";
import { deserialize } from "./slate/deserialize";
import { RenderElement } from "./slate/render-element";
import { RenderLeaf } from "./slate/render-leaf";
import { serialize } from "./slate/serialize";
import type {
  InkwellElement,
  InkwellEditor as InkwellSlateEditor,
  InkwellText,
} from "./slate/types";
import { withCharacterLimit } from "./slate/with-character-limit";
import { withMarkdown } from "./slate/with-markdown";
import { generateId, withNodeId } from "./slate/with-node-id";

const IS_SERVER = typeof window === "undefined";

/**
 * Built-in toast surfaced at the top-right of the editor when the document
 * meets or exceeds `characterLimit`. Styled via `.inkwell-editor-limit-toast`
 * in the package stylesheet. Pointer-events are disabled so the toast
 * never intercepts typing or selection.
 */
function LimitToast({
  count,
  limit,
}: {
  count: number;
  limit: number;
  enforced: boolean;
}) {
  const over = count > limit;
  return (
    <div
      className="inkwell-editor-limit-toast"
      role="status"
      aria-live="polite"
    >
      <svg
        className="inkwell-editor-limit-toast-icon"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <span>
        {over ? `Over limit by ${count - limit}` : "Character limit reached"}
      </span>
    </div>
  );
}

const DEFAULT_DECORATIONS: Required<InkwellDecorations> = {
  heading1: true,
  heading2: true,
  heading3: true,
  heading4: true,
  heading5: true,
  heading6: true,
  lists: true,
  blockquotes: true,
  codeBlocks: true,
  images: true,
};

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
      content,
      onChange,
      onStateChange,
      className,
      style,
      placeholder,
      editable = true,
      plugins: userPlugins = [],
      rehypePlugins,
      decorations,
      collaboration,
      bubbleMenu = true,
      characterLimit,
      enforceCharacterLimit = false,
      onCharacterCount,
      limitToast = true,
      submitOnEnter = false,
      onSubmit,
    },
    ref,
  ) {
    const resolvedDecorations = useMemo(
      () => ({ ...DEFAULT_DECORATIONS, ...decorations }),
      [decorations],
    );
    const decorationsRef = useRef(resolvedDecorations);
    decorationsRef.current = resolvedDecorations;

    const plugins = useMemo(() => {
      const builtIn = bubbleMenu ? [createBubbleMenuPlugin()] : [];
      // User plugins win when names collide — a custom `bubble-menu` plugin
      // replaces the built-in toolbar. Plugin names must stay unique inside
      // the editor so React keys stay stable.
      const userNames = new Set(userPlugins.map(p => p.name));
      const survivingBuiltIns = builtIn.filter(p => !userNames.has(p.name));
      return [...survivingBuiltIns, ...userPlugins];
    }, [userPlugins, bubbleMenu]);

    const characterLimitRef = useRef({
      limit: characterLimit,
      enforce: enforceCharacterLimit,
    });
    characterLimitRef.current = {
      limit: characterLimit,
      enforce: enforceCharacterLimit,
    };

    const editor = useMemo<InkwellSlateEditor>(() => {
      const base = withNodeId(withReact(createEditor()));

      if (collaboration) {
        const { sharedType, awareness, user } = collaboration;
        const yjsEditor = withYjs(base, sharedType, { autoConnect: false });
        const cursorEditor = withCursors(yjsEditor, awareness, {
          data: user,
        });
        const historyEditor = withYHistory(cursorEditor);
        return withCharacterLimit(
          withMarkdown(historyEditor, decorationsRef),
          characterLimitRef,
        );
      }

      return withCharacterLimit(
        withMarkdown(withHistory(base), decorationsRef),
        characterLimitRef,
      );
    }, []);

    useEffect(() => {
      const cleanups: Array<() => void> = [];
      for (const plugin of plugins) {
        if (!plugin.setup) continue;
        const cleanup = plugin.setup(editor);
        if (typeof cleanup === "function") cleanups.push(cleanup);
      }
      return () => {
        // Run cleanups in reverse order so plugins that wrap editor
        // methods (e.g. `editor.insertData`) unwrap in the inverse order
        // they were stacked — each cleanup restores the editor to the
        // state the next-outer plugin captured.
        for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]();
      };
    }, [editor, plugins]);

    useEffect(() => {
      if (!collaboration || !YjsEditor.isYjsEditor(editor)) return;
      YjsEditor.connect(editor);
      return () => {
        YjsEditor.disconnect(editor);
      };
    }, [editor, collaboration]);

    const [cursorVersion, setCursorVersion] = useState(0);

    useEffect(() => {
      if (!collaboration || !CursorEditor.isCursorEditor(editor)) return;
      const handleChange = () => setCursorVersion(v => v + 1);
      CursorEditor.on(editor, "change", handleChange);
      return () => {
        CursorEditor.off(editor, "change", handleChange);
      };
    }, [editor, collaboration]);

    const remoteCursorRanges = useMemo(() => {
      if (!collaboration || !CursorEditor.isCursorEditor(editor)) return [];

      const ranges: (Range & InkwellText)[] = [];
      const states = CursorEditor.cursorStates(editor);

      for (const [, state] of Object.entries(states)) {
        if (!state.relativeSelection) continue;
        const data = state.data as { name: string; color: string } | undefined;
        if (!data) continue;

        try {
          const { anchor, focus } = state.relativeSelection;
          const anchorPoint = relativePositionToSlatePoint(
            collaboration.sharedType,
            editor,
            anchor,
          );
          const focusPoint = relativePositionToSlatePoint(
            collaboration.sharedType,
            editor,
            focus,
          );
          if (!anchorPoint || !focusPoint) continue;

          const range: Range = { anchor: anchorPoint, focus: focusPoint };

          if (Range.isCollapsed(range)) {
            // Collapsed cursor — render as caret
            ranges.push({
              ...range,
              remoteCursor: data.color,
              remoteCursorCaret: true,
            } as Range & InkwellText);
          } else {
            // Selection range — render as highlight
            ranges.push({
              ...range,
              remoteCursor: data.color,
            } as Range & InkwellText);
          }
        } catch {
          // Position conversion can fail if document is mid-sync
        }
      }

      return ranges;
    }, [editor, collaboration, cursorVersion]);

    const initialValue = useMemo(
      () =>
        collaboration
          ? [
              {
                type: "paragraph" as const,
                id: generateId(),
                children: [{ text: "" }],
              },
            ]
          : deserialize(content, resolvedDecorations),
      [],
    );

    const lastContent = useRef<string>(content);
    const isInternalChange = useRef(false);
    const [characterCount, setCharacterCount] = useState(() =>
      initialValue.reduce((sum, n) => sum + Node.string(n).length, 0),
    );
    const [isFocused, setIsFocused] = useState(false);
    const [stateVersion, setStateVersion] = useState(0);

    const bumpStateVersion = useCallback(() => {
      setStateVersion(version => version + 1);
    }, []);

    const updateCharacterCount = useCallback(() => {
      const length = Node.string(editor).length;
      setCharacterCount(length);
      onCharacterCount?.(length, characterLimit);
      return length;
    }, [editor, onCharacterCount, characterLimit]);

    const serializeMarkdown = useCallback(
      () => serialize(editor.children as InkwellElement[]),
      [editor],
    );

    const handleChange = useCallback(
      (value: Descendant[]) => {
        // Only serialize when the document actually changed
        const isAstChange = editor.operations.some(
          op => op.type !== "set_selection",
        );
        if (!isAstChange) return;

        updateCharacterCount();
        bumpStateVersion();

        for (const plugin of plugins) {
          plugin.onEditorChange?.(editor);
        }

        const md = serialize(value as InkwellElement[]);
        if (collaboration) {
          // In collab mode, always fire onChange (no echo prevention needed)
          onChange?.(md);
        } else {
          // In standalone mode, prevent echo loops
          if (md !== lastContent.current) {
            lastContent.current = md;
            isInternalChange.current = true;
            onChange?.(md);
          }
        }
      },
      [
        bumpStateVersion,
        collaboration,
        editor,
        onChange,
        plugins,
        updateCharacterCount,
      ],
    );

    const overLimit =
      characterLimit !== undefined && characterCount > characterLimit;

    const getEditorState = useCallback((): InkwellEditorState => {
      const text = Node.string(editor);
      return {
        markdown: serializeMarkdown(),
        text,
        isEmpty: text.trim().length === 0,
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
      serializeMarkdown,
    ]);

    useEffect(() => {
      if (collaboration) return; // Yjs is source of truth in collab mode

      if (isInternalChange.current) {
        isInternalChange.current = false;
        return;
      }
      if (content === lastContent.current) return;

      const newValue = deserialize(content, resolvedDecorations);
      editor.children = newValue;

      // Reset selection to start to avoid stale selection errors
      Transforms.select(editor, Editor.start(editor, []));
      lastContent.current = content;
      updateCharacterCount();
      bumpStateVersion();
      editor.onChange();
    }, [
      bumpStateVersion,
      collaboration,
      content,
      editor,
      resolvedDecorations,
      updateCharacterCount,
    ]);

    useEffect(() => {
      onStateChange?.(getEditorState());
    }, [getEditorState, onStateChange, stateVersion]);

    const decorate = useCallback(
      (entry: NodeEntry) => {
        const ranges = computeDecorations(entry, editor, rehypePlugins);

        // Add remote cursor decorations that overlap this node
        if (remoteCursorRanges.length > 0) {
          const [, path] = entry;
          for (const cursorRange of remoteCursorRanges) {
            try {
              const intersection = Range.intersection(
                cursorRange,
                Editor.range(editor, path),
              );
              if (intersection) {
                ranges.push({
                  ...intersection,
                  remoteCursor: cursorRange.remoteCursor,
                  remoteCursorCaret: cursorRange.remoteCursorCaret,
                } as Range & InkwellText);
              }
            } catch {
              // Range intersection can fail during document changes
            }
          }
        }

        return ranges;
      },
      [editor, rehypePlugins, remoteCursorRanges],
    );

    // ─── Plugin activation + key forwarding ───────────────────────────────────
    //
    // Two ways a plugin becomes "active":
    //
    // 1. Trigger-based (e.g. `@` for mentions): the editor matches the
    //    character or modifier combo and stores the matched plugin in
    //    `activePlugin`.
    // 2. Self-claimed (e.g. slash commands): the plugin's `onKeyDown` calls
    //    `setActivePlugin` from the keydown context. This is necessary for
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
    const pluginPositionRef = useRef<{ top: number; left: number }>({
      top: 0,
      left: 0,
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

    const canonicalizeEmptyEditor = useCallback(() => {
      if (Node.string(editor).trim().length !== 0) return;

      const onlyChild = editor.children[0] as InkwellElement | undefined;
      const isCanonicalEmptyParagraph =
        editor.children.length === 1 &&
        onlyChild?.type === "paragraph" &&
        Node.string(onlyChild).length === 0;
      if (isCanonicalEmptyParagraph) return;

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

    const replaceMarkdown = useCallback(
      (markdown: string, options?: InkwellSetMarkdownOptions) => {
        const emitChange = options?.emitChange ?? true;
        const select = options?.select ?? "start";
        const newValue = deserialize(markdown, resolvedDecorations);

        editor.children = newValue;
        updateCharacterCount();
        bumpStateVersion();

        if (select !== "preserve") selectEditor(select);
        const nextMarkdown = serializeMarkdown();
        lastContent.current = nextMarkdown;
        editor.onChange();
        if (emitChange) onChange?.(nextMarkdown);
      },
      [
        bumpStateVersion,
        editor,
        onChange,
        resolvedDecorations,
        selectEditor,
        serializeMarkdown,
        updateCharacterCount,
      ],
    );

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: serializeMarkdown,
        getText: () => Node.string(editor),
        getState: getEditorState,
        focus: focusEditor,
        clear: options => replaceMarkdown("", options),
        setMarkdown: replaceMarkdown,
        insertMarkdown: markdown => {
          focusEditor();
          const nodes = deserialize(markdown, resolvedDecorations);
          Transforms.insertFragment(editor, nodes);
        },
      }),
      [
        editor,
        focusEditor,
        getEditorState,
        replaceMarkdown,
        resolvedDecorations,
        serializeMarkdown,
      ],
    );

    const getCursorPosition = useCallback(() => {
      try {
        const domSelection = window.getSelection();
        if (!domSelection || domSelection.rangeCount === 0)
          return { top: 0, left: 0 };
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
        if (!wrapperEl) return { top: 0, left: 0 };
        const wrapperRect = wrapperEl.getBoundingClientRect();
        return {
          top: rect.bottom - wrapperRect.top + 4,
          left: rect.left - wrapperRect.left,
        };
      } catch {
        return { top: 0, left: 0 };
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
        const nodes = deserialize(text);
        // Use insertFragment to merge the first node into the current block
        // instead of splitting and creating a blank line
        Transforms.insertFragment(editor, nodes);
      },
      [editor],
    );

    const dismissPlugin = useCallback(() => {
      setActivePluginState(null);
      activePluginQueryRef.current = "";
      setActivePluginQuery("");
      ReactEditor.focus(editor);
    }, [editor]);

    // `setActivePlugin` is exposed through `PluginKeyDownContext` so plugins
    // (e.g. slash commands) can claim activation without a global trigger.
    // The ref is updated synchronously so the keydown loop can short-circuit
    // trigger matching as soon as a plugin claims activation in the same
    // event tick.
    const setActivePluginFromCtx = useCallback<
      PluginKeyDownContext["setActivePlugin"]
    >(
      descriptor => {
        if (!descriptor) {
          activePluginRef.current = null;
          dismissPlugin();
          return;
        }
        const plugin = plugins.find(p => p.name === descriptor.name);
        if (!plugin) return;
        const initialQuery = descriptor.query ?? "";
        activePluginQueryRef.current = initialQuery;
        setActivePluginQuery(initialQuery);
        pluginPositionRef.current = getCursorPosition();
        activePluginRef.current = plugin;
        setActivePluginState(plugin);
      },
      [dismissPlugin, getCursorPosition, plugins],
    );

    const handlePluginSelect = useCallback(
      (text: string) => {
        const triggerKey = activePlugin?.trigger?.key;
        const isCharTrigger = triggerKey && !triggerKey.includes("+");
        // Capture the query length *before* dismissing — dismiss clears
        // the ref, and the rAF-deferred delete below needs to remove the
        // trigger plus every query character the user typed into the
        // editor while the picker was open.
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

    // A plugin's `active` flag is true when the plugin is the current
    // editor-active plugin. Plugins with a `trigger` (mentions, emoji,
    // snippets) or that opt in with `activatable: true` (slash commands)
    // only render while active. Always-on plugins (bubble menu, attachments,
    // completions) leave both undefined and receive `active: true`.
    const isActivatablePlugin = (plugin: InkwellPlugin) =>
      Boolean(plugin.trigger || plugin.activatable);
    const makePluginProps = (plugin: InkwellPlugin) => ({
      active: isActivatablePlugin(plugin) ? activePlugin === plugin : true,
      query: activePlugin === plugin ? activePluginQuery : "",
      onSelect: handlePluginSelect,
      onDismiss: dismissPlugin,
      position: pluginPositionRef.current,
      editorRef: editorElRef,
      wrapSelection,
      subscribeForwardedKey: subscribeForwardedKeyFor(plugin.name),
    });

    const keyDownContext = useMemo<PluginKeyDownContext>(
      () => ({
        wrapSelection,
        setActivePlugin: setActivePluginFromCtx,
      }),
      [wrapSelection, setActivePluginFromCtx],
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
            { ...keyDownContext, dismiss: dismissPlugin },
            editor,
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
        // A plugin that calls `ctx.setActivePlugin(...)` here claims activation;
        // subsequent plugins still get a chance to run unless preventDefault was
        // called.
        for (const plugin of plugins) {
          plugin.onKeyDown?.(event, keyDownContext, editor);
          if (event.defaultPrevented) return;
          // If the keydown handler claimed activation, stop further matching
          // so the same event doesn't also fire a trigger.
          if (activePluginRef.current) return;
        }

        if (submitOnEnter && event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onSubmit?.(serializeMarkdown());
          return;
        }

        // Check plugin triggers
        for (const plugin of plugins) {
          const t = plugin.trigger;
          if (!t) continue;

          const parts = t.key
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
            if (plugin.shouldTrigger && !plugin.shouldTrigger(event, editor)) {
              continue;
            }
            if (hasModifiers) event.preventDefault();
            activePluginQueryRef.current = "";
            setActivePluginQuery("");
            pluginPositionRef.current = getCursorPosition();
            setActivePluginState(plugin);
            return;
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
        keyDownContext,
        emitForwardedKey,
        submitOnEnter,
        onSubmit,
        serializeMarkdown,
      ],
    );

    // The toast is visible whenever the document has hit the limit. With
    // `enforceCharacterLimit` the count never exceeds the limit, so we also
    // surface the toast at exactly the limit so the user gets feedback when
    // their typing is being blocked. Without enforcement we only show it
    // once the user has actually gone over.
    const showLimitToast =
      limitToast !== false &&
      characterLimit !== undefined &&
      (overLimit ||
        (enforceCharacterLimit && characterCount >= characterLimit));

    const pluginPlaceholder = plugins.reduce<InkwellPluginPlaceholder | null>(
      (value, plugin) => {
        if (value) return value;
        const nextPlaceholder = plugin.getPlaceholder?.(editor) ?? null;
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

    return (
      <div
        ref={wrapperRef}
        className={`inkwell-editor-wrapper${overLimit ? " inkwell-editor-over-limit" : ""}${className ? ` ${className}` : ""}`}
      >
        {showLimitToast && characterLimit !== undefined && (
          <LimitToast
            count={characterCount}
            limit={characterLimit}
            enforced={enforceCharacterLimit}
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
          if (!props.active) return null;
          return <Fragment key={plugin.name}>{plugin.render(props)}</Fragment>;
        })}
        <Slate
          editor={editor}
          initialValue={initialValue}
          onChange={handleChange}
        >
          <Editable
            ref={editorElRef}
            className="inkwell-editor"
            style={style}
            renderElement={RenderElement}
            renderLeaf={RenderLeaf}
            decorate={decorate}
            placeholder={resolvedPlaceholder}
            spellCheck
            role="textbox"
            aria-multiline
            aria-placeholder={resolvedPlaceholder}
            data-placeholder={resolvedPlaceholder}
            readOnly={!editable}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
          />
        </Slate>
      </div>
    );
  },
);
