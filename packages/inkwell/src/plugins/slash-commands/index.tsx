"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { Editor, Range, Transforms } from "slate";
import type { InkwellPlugin } from "../../types";
import { pluginPickerClass } from "../plugin-picker";

export interface SlashCommandChoice {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SlashCommandArg {
  name: string;
  description: string;
  required: boolean;
  choices?: SlashCommandChoice[];
  fetchChoices?: () => Promise<SlashCommandChoice[]>;
}

export interface SlashCommandItem {
  name: string;
  description: string;
  aliases?: string[];
  args?: SlashCommandArg[];
  disabled?: () => string | false;
}

export interface SlashCommandExecution {
  name: string;
  args: Record<string, string>;
  raw: string;
}

interface SlashCommandMenuState {
  visible: boolean;
  open: () => void;
  close: () => void;
  appendQuery: (value: string) => void;
  removeQueryChar: () => void;
  move: (direction: 1 | -1) => void;
  selectActive: () => void;
  execute: () => void;
  ready: boolean;
}

export interface SlashCommandsPluginOptions<T extends SlashCommandItem> {
  name?: string;
  commands: T[];
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  onReadyChange?: (ready: boolean) => void;
  onExecute?: (command: SlashCommandExecution) => void;
  emptyMessage?: string;
}

interface SlashCommandAutocompleteItem<T extends SlashCommandItem> {
  type: "command" | "arg";
  value: string;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  command?: T;
}

const fuzzyMatch = (query: string, text: string): boolean => {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  return t.includes(q) || t.startsWith(q);
};

const findActiveSlashLineIndex = (markdown: string): number => {
  const lines = markdown.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index] ?? "";
    if (/^\s*\//.test(line)) return index;
  }
  return -1;
};

const replaceActiveSlashLine = (markdown: string, nextLine: string): string => {
  const lines = markdown.split("\n");
  const index = findActiveSlashLineIndex(markdown);
  if (index === -1) return markdown;
  lines[index] = nextLine;
  return lines.join("\n");
};

const clearBlockAtPath = (editor: Editor, path: number[]) => {
  const start = Editor.start(editor, path);
  const end = Editor.end(editor, path);
  Transforms.select(editor, { anchor: start, focus: end });
  Transforms.delete(editor);
  editor.onChange();
};

const getCurrentBlockText = (editor: Editor): string | null => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return null;
  return Editor.string(editor, selection.anchor.path);
};

const getTextBeforeCursorInBlock = (editor: Editor): string | null => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return null;
  const anchor = selection.anchor;
  const blockStart = { path: anchor.path, offset: 0 };
  return Editor.string(editor, { anchor: blockStart, focus: anchor });
};

function SlashCommandMenu<T extends SlashCommandItem>({
  commands,
  emptyMessage,
  getMarkdown,
  setMarkdown,
  stateRef,
  onReadyChange,
  editorRef,
  getEditor,
  onExecute,
}: {
  commands: T[];
  emptyMessage: string;
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  stateRef: { current: SlashCommandMenuState };
  onReadyChange?: (ready: boolean) => void;
  editorRef: RefObject<HTMLDivElement | null>;
  getEditor: () => Editor | null;
  onExecute?: (command: SlashCommandExecution) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"commands" | "args" | "ready">("commands");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState<T | null>(null);
  const [selectedArg, setSelectedArg] = useState<{ name: string; value: string } | null>(null);
  const [argChoices, setArgChoices] = useState<SlashCommandChoice[]>([]);
  const [loadingArgs, setLoadingArgs] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    onReadyChange?.(visible && mode === "ready");
  }, [mode, onReadyChange, visible]);

  useLayoutEffect(() => {
    if (!visible) return;

    const selection = window.getSelection();
    const editorEl = editorRef.current;
    const wrapperEl = editorEl?.parentElement;
    if (!selection || selection.rangeCount === 0 || !wrapperEl) return;

    const range = selection.getRangeAt(0);
    let rect =
      "getBoundingClientRect" in range
        ? range.getBoundingClientRect()
        : new DOMRect(0, 0, 0, 0);
    if (rect.width === 0 && rect.height === 0 && selection.anchorNode) {
      const node =
        selection.anchorNode instanceof HTMLElement
          ? selection.anchorNode
          : selection.anchorNode.parentElement;
      if (node) rect = node.getBoundingClientRect();
    }

    const wrapperRect = wrapperEl.getBoundingClientRect();
    setPosition({
      top: rect.bottom - wrapperRect.top + 6,
      left: Math.max(0, rect.left - wrapperRect.left),
    });
  }, [editorRef, mode, query, visible]);

  useEffect(() => {
    let cancelled = false;

    const loadChoices = async () => {
      if (!visible || mode !== "args" || !selectedCommand) {
        setArgChoices([]);
        return;
      }

      const firstArg = selectedCommand.args?.[0];
      if (!firstArg) {
        setArgChoices([]);
        return;
      }

      if (firstArg.choices) {
        setArgChoices(firstArg.choices);
        return;
      }

      if (!firstArg.fetchChoices) {
        setArgChoices([]);
        return;
      }

      setLoadingArgs(true);
      try {
        const choices = await firstArg.fetchChoices();
        if (!cancelled) setArgChoices(choices);
      } finally {
        if (!cancelled) setLoadingArgs(false);
      }
    };

    void loadChoices();
    return () => {
      cancelled = true;
    };
  }, [mode, selectedCommand, visible]);

  const commandItems: SlashCommandAutocompleteItem<T>[] = useMemo(
    () =>
      commands
        .filter(command => {
          if (!query) return true;
          return (
            fuzzyMatch(query, command.name) ||
            command.aliases?.some(alias => fuzzyMatch(query, alias))
          );
        })
        .map(command => {
          const disabledReason = command.disabled?.();
          return {
            type: "command" as const,
            value: command.name,
            label: `/${command.name}`,
            description: command.description,
            disabled: !!disabledReason,
            disabledReason: disabledReason || undefined,
            command,
          };
        }),
    [commands, query],
  );

  const argItems: SlashCommandAutocompleteItem<T>[] = useMemo(
    () =>
      argChoices
        .filter(choice => !query || fuzzyMatch(query, choice.label))
        .map(choice => ({
          type: "arg" as const,
          value: choice.value,
          label: choice.label,
          description: choice.disabled
            ? "(current)"
            : (selectedCommand?.args?.[0]?.description ?? ""),
          disabled: choice.disabled,
        })),
    [argChoices, query, selectedCommand],
  );

  const items = mode === "args" ? argItems : commandItems;

  useEffect(() => {
    const firstEnabled = items.findIndex(item => !item.disabled);
    setSelectedIndex(firstEnabled >= 0 ? firstEnabled : 0);
  }, [items.length, mode, query]);

  const close = useCallback(() => {
    setVisible(false);
    setMode("commands");
    setQuery("");
    setSelectedCommand(null);
    setSelectedArg(null);
    onReadyChange?.(false);
  }, [onReadyChange]);

  const writeSlashLine = useCallback(
    (line: string) => {
      const editor = getEditor();
      if (editor?.selection && Range.isCollapsed(editor.selection)) {
        const path = editor.selection.anchor.path;
        const start = Editor.start(editor, path);
        const end = Editor.end(editor, path);
        Transforms.select(editor, { anchor: start, focus: end });
        Transforms.insertText(editor, line);
        Transforms.select(editor, Editor.end(editor, path));
        editor.onChange();
        return;
      }

      setMarkdown(replaceActiveSlashLine(getMarkdown(), line));
    },
    [getEditor, getMarkdown, setMarkdown],
  );

  const handleSelect = useCallback(
    (item: SlashCommandAutocompleteItem<T>) => {
      if (item.disabled) return;

      if (item.type === "command") {
        const command = item.command;
        if (!command) return;
        const hasRequiredArgs = command.args?.some(arg => arg.required) ?? false;
        const nextLine = `/${command.name}${hasRequiredArgs ? " " : ""}`;
        writeSlashLine(nextLine);
        setSelectedCommand(command);
        setSelectedArg(null);
        setQuery("");
        setMode(hasRequiredArgs ? "args" : "ready");
        return;
      }

      if (!selectedCommand) return;
      const firstArg = selectedCommand.args?.[0];
      writeSlashLine(`/${selectedCommand.name} ${item.label}`);
      setSelectedArg(firstArg ? { name: firstArg.name, value: item.value } : null);
      setQuery("");
      setMode("ready");
    },
    [selectedCommand, writeSlashLine],
  );

  const move = useCallback(
    (direction: 1 | -1) => {
      setSelectedIndex(current => {
        if (items.length === 0) return current;
        for (let step = 1; step <= items.length; step++) {
          const next = (current + direction * step + items.length) % items.length;
          if (!items[next]?.disabled) return next;
        }
        return current;
      });
    },
    [items],
  );

  const selectActive = useCallback(() => {
    const item = items[selectedIndex];
    if (item) handleSelect(item);
  }, [handleSelect, items, selectedIndex]);

  stateRef.current = {
    visible,
    open: () => {
      setVisible(true);
      setMode("commands");
      setQuery("");
      setSelectedCommand(null);
      onReadyChange?.(false);
    },
    close,
    appendQuery: value => setQuery(current => `${current}${value}`),
    removeQueryChar: () => setQuery(current => current.slice(0, -1)),
    move,
    selectActive,
    execute: () => {
      if (!selectedCommand) return;
      const editor = getEditor();
      const raw = editor ? (getCurrentBlockText(editor) ?? `/${selectedCommand.name}`) : `/${selectedCommand.name}`;
      onExecute?.({
        name: selectedCommand.name,
        args: selectedArg ? { [selectedArg.name]: selectedArg.value } : {},
        raw,
      });
    },
    ready: visible && mode === "ready",
  };

  if (!visible) return null;

  if (mode === "ready" && selectedCommand) {
    return (
      <div
        className={pluginPickerClass.popup}
        style={{
          position: "absolute",
          top: position.top,
          left: position.left,
          zIndex: 1001,
        }}
      >
        <div className={pluginPickerClass.picker}>
          <div className="inkwell-plugin-slash-commands-execute">
            Enter to execute · Esc to cancel
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={pluginPickerClass.popup}
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        zIndex: 1001,
      }}
    >
      <div className={pluginPickerClass.picker}>
        <div className={pluginPickerClass.search}>
          {mode === "commands" ? `/${query}` : `${selectedCommand ? `/${selectedCommand.name} ` : ""}${query}`}
        </div>
        {loadingArgs && items.length === 0 ? (
          <div className={pluginPickerClass.empty}>Loading...</div>
        ) : items.length === 0 ? (
          <div className={pluginPickerClass.empty}>{emptyMessage}</div>
        ) : (
          <div>
            {items.map((item, index) => {
              const active = index === selectedIndex;
              return (
                <div
                  key={`${item.type}-${item.value}`}
                  className={`${pluginPickerClass.item} ${active ? pluginPickerClass.itemActive : ""}`}
                  onMouseDown={event => event.preventDefault()}
                  onMouseEnter={() => {
                    if (!item.disabled) setSelectedIndex(index);
                  }}
                  onClick={() => handleSelect(item)}
                  aria-disabled={item.disabled}
                >
                  <span className={pluginPickerClass.title}>{item.label}</span>
                  <span className={pluginPickerClass.subtitle}>
                    {item.disabledReason ?? item.description}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className={pluginPickerClass.empty}>↑↓ navigate · Tab select · Esc close</div>
      </div>
    </div>
  );
}

export const createSlashCommandsPlugin = <T extends SlashCommandItem>({
  name = "slash-commands",
  commands,
  getMarkdown,
  setMarkdown,
  onReadyChange,
  onExecute,
  emptyMessage = "No commands found",
}: SlashCommandsPluginOptions<T>): InkwellPlugin => {
  let editorRef: Editor | null = null;
  const stateRef: { current: SlashCommandMenuState } = {
    current: {
      visible: false,
      open: () => {},
      close: () => {},
      appendQuery: () => {},
      removeQueryChar: () => {},
      move: () => {},
      selectActive: () => {},
      execute: () => {},
      ready: false,
    },
  };

  return {
    name,
    setup: editor => {
      editorRef = editor;
      return () => {
        editorRef = null;
      };
    },
    render: props => (
      <SlashCommandMenu
        commands={commands}
        emptyMessage={emptyMessage}
        getMarkdown={getMarkdown}
        setMarkdown={setMarkdown}
        stateRef={stateRef}
        onReadyChange={onReadyChange}
        editorRef={props.editorRef}
        getEditor={() => editorRef}
        onExecute={onExecute}
      />
    ),
    onKeyDown: (event, _ctx, editor) => {
      editorRef = editor;
      const state = stateRef.current;

      if (!state.visible && event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const beforeCursor = getTextBeforeCursorInBlock(editor);
        if (beforeCursor !== null && beforeCursor.trim() === "") {
          event.preventDefault();
          Transforms.insertText(editor, "/");
          state.open();
        }
        return;
      }

      if (!state.visible) return;

      if (event.key === "Escape") {
        event.preventDefault();
        const path = state.ready && editor.selection && Range.isCollapsed(editor.selection)
          ? [...editor.selection.anchor.path]
          : null;
        state.close();
        requestAnimationFrame(() => {
          if (!path) return;
          try {
            clearBlockAtPath(editor, path);
          } catch {
            // The command line may already have been removed by the host.
          }
        });
        return;
      }

      if (state.ready && event.key === "Enter") {
        event.preventDefault();
        const path = editor.selection && Range.isCollapsed(editor.selection)
          ? [...editor.selection.anchor.path]
          : null;
        state.execute();
        state.close();
        requestAnimationFrame(() => {
          if (!path) return;
          try {
            clearBlockAtPath(editor, path);
          } catch {
            // The command line may already have been removed by the host.
          }
        });
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        state.move(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        state.move(-1);
        return;
      }

      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        state.selectActive();
        return;
      }

      if (event.key === "Backspace") {
        const beforeCursor = getTextBeforeCursorInBlock(editor);
        if (beforeCursor === "/") {
          state.close();
          return;
        }
        state.removeQueryChar();
        return;
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
        state.appendQuery(event.key);
      }
    },
  };
};
