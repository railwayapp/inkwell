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
  type ReactNode,
  useCallback,
  useEffect,
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
  InkwellEditorProps,
  InkwellPlugin,
} from "../types";
import { computeDecorations } from "./slate/decorations";
import { deserialize } from "./slate/deserialize";
import { RenderElement } from "./slate/render-element";
import { RenderLeaf } from "./slate/render-leaf";
import { serialize } from "./slate/serialize";
import type { InkwellElement, InkwellText } from "./slate/types";
import { withMarkdown } from "./slate/with-markdown";
import { generateId, withNodeId } from "./slate/with-node-id";

const IS_SERVER = typeof window === "undefined";

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
};

export function InkwellEditor({
  content,
  onChange,
  className,
  placeholder,
  plugins: userPlugins = [],
  rehypePlugins,
  decorations,
  collaboration,
  bubbleMenu = true,
}: InkwellEditorProps): ReactNode {
  const resolvedDecorations = useMemo(
    () => ({ ...DEFAULT_DECORATIONS, ...decorations }),
    [decorations],
  );
  const decorationsRef = useRef(resolvedDecorations);
  decorationsRef.current = resolvedDecorations;

  const plugins = useMemo(() => {
    const builtIn = bubbleMenu ? [createBubbleMenuPlugin()] : [];
    return [...builtIn, ...userPlugins];
  }, [userPlugins, bubbleMenu]);

  const editor = useMemo(() => {
    if (IS_SERVER) return null;

    const base = withNodeId(withReact(createEditor()));

    if (collaboration) {
      const { sharedType, awareness, user } = collaboration;
      const yjsEditor = withYjs(base, sharedType, { autoConnect: false });
      const cursorEditor = withCursors(yjsEditor, awareness, {
        data: user,
      });
      const historyEditor = withYHistory(cursorEditor);
      return withMarkdown(historyEditor, decorationsRef);
    }

    return withMarkdown(withHistory(base), decorationsRef);
  }, []);

  if (!editor) return null;

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
    editor.onChange();
    lastContent.current = content;
  }, [content, editor, collaboration]);

  const handleChange = useCallback(
    (value: Descendant[]) => {
      // Only serialize when the document actually changed
      const isAstChange = editor.operations.some(
        op => op.type !== "set_selection",
      );
      if (!isAstChange) return;
      if (!onChange) return;

      const md = serialize(value as InkwellElement[]);
      if (collaboration) {
        // In collab mode, always fire onChange (no echo prevention needed)
        onChange(md);
      } else {
        // In standalone mode, prevent echo loops
        if (md !== lastContent.current) {
          lastContent.current = md;
          isInternalChange.current = true;
          onChange(md);
        }
      }
    },
    [editor, onChange, collaboration],
  );

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

  const [activePlugin, setActivePlugin] = useState<InkwellPlugin | null>(null);
  const pluginPositionRef = useRef<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorElRef = useRef<HTMLDivElement | null>(null);

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
    setActivePlugin(null);
    ReactEditor.focus(editor);
  }, [editor]);

  const handlePluginSelect = useCallback(
    (text: string) => {
      const triggerKey = activePlugin?.trigger?.key;
      const isCharTrigger = triggerKey && !triggerKey.includes("+");
      dismissPlugin();
      requestAnimationFrame(() => {
        ReactEditor.focus(editor);
        // If character trigger, delete the trigger character
        if (isCharTrigger) {
          Transforms.delete(editor, {
            distance: 1,
            unit: "character",
            reverse: true,
          });
        }
        insertTextAtCursor(text);
      });
    },
    [dismissPlugin, insertTextAtCursor, activePlugin, editor],
  );

  const makePluginProps = (plugin: InkwellPlugin) => ({
    active: plugin.trigger ? activePlugin === plugin : true,
    query: "",
    onSelect: handlePluginSelect,
    onDismiss: dismissPlugin,
    position: pluginPositionRef.current,
    editorRef: editorElRef,
    wrapSelection,
  });

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // If a plugin is active, Escape dismisses it
      if (activePlugin) {
        if (event.key === "Escape") {
          event.preventDefault();
          dismissPlugin();
        }
        return;
      }

      // Dispatch to plugin onKeyDown handlers. Short-circuit if a plugin
      // calls preventDefault so trigger matching doesn't run for the same event.
      for (const plugin of plugins) {
        plugin.onKeyDown?.(event, { wrapSelection });
        if (event.defaultPrevented) return;
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
          if (hasModifiers) event.preventDefault();
          pluginPositionRef.current = getCursorPosition();
          setActivePlugin(plugin);
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
      wrapSelection,
    ],
  );

  return (
    <div
      ref={wrapperRef}
      className={`inkwell-editor-wrapper ${className ?? ""}`}
    >
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
          renderElement={RenderElement}
          renderLeaf={RenderLeaf}
          decorate={decorate}
          placeholder={placeholder ?? "Start writing..."}
          spellCheck
          role="textbox"
          aria-multiline
          aria-placeholder={placeholder}
          data-placeholder={placeholder ?? "Start writing..."}
          onKeyDown={handleKeyDown}
        />
      </Slate>
    </div>
  );
}
