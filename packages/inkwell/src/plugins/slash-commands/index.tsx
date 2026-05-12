"use client";

import {
  forwardRef,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Editor, type Path, Range, Transforms } from "slate";
import type { InkwellEditor } from "../../editor/slate/types";
import type {
  InkwellPlugin,
  PluginKeyDownContext,
  PluginRenderProps,
} from "../../types";
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

export interface SlashCommandsPluginOptions<T extends SlashCommandItem> {
  /** Plugin name. Defaults to `"slash-commands"`. */
  name?: string;
  /** Commands shown in the picker. */
  commands: T[];
  /** Called whenever the menu transitions in and out of the execute phase. */
  onReadyChange?: (ready: boolean) => void;
  /** Called with the structured execution payload when the user presses Enter
   *  during the execute phase. */
  onExecute?: (command: SlashCommandExecution) => void;
  /** Fallback message when filtering returns no commands. */
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

/** Imperative surface the editor-side `onKeyDown`/`onActiveKeyDown` handlers
 *  use to drive the menu without resorting to writing to refs during render. */
interface SlashMenuHandle {
  /** Whether the menu is currently in execute (ready-to-confirm) phase. */
  isReady: () => boolean;
  /** Append `value` to the current query. */
  appendQuery: (value: string) => void;
  /** Drop the last character from the query. */
  removeQueryChar: () => void;
  /** Move the active selection by one step. */
  move: (direction: 1 | -1) => void;
  /** Confirm the currently highlighted item (commands or args). */
  selectActive: () => void;
  /** Fire the configured `onExecute` with the current command + args. */
  execute: () => void;
  /** Reset state on dismissal. */
  reset: () => void;
}

const fuzzyMatch = (query: string, text: string): boolean => {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  return t.includes(q) || t.startsWith(q);
};

/** Replace the content of the block at `path` with `text`. */
const setBlockText = (editor: InkwellEditor, path: Path, text: string) => {
  const start = Editor.start(editor, path);
  const end = Editor.end(editor, path);
  Transforms.select(editor, { anchor: start, focus: end });
  Transforms.insertText(editor, text);
  Transforms.select(editor, Editor.end(editor, path));
};

/** Clear the content of the block at `path` to an empty string. */
const clearBlockAtPath = (editor: InkwellEditor, path: Path) => {
  try {
    const start = Editor.start(editor, path);
    const end = Editor.end(editor, path);
    Transforms.select(editor, { anchor: start, focus: end });
    Transforms.delete(editor);
    editor.onChange();
  } catch {
    // The block may have already been removed by an external edit.
  }
};

const getCurrentBlockPath = (editor: InkwellEditor): Path | null => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return null;
  // The first segment of the path is the block index at the root.
  return selection.anchor.path.slice(0, 1) as Path;
};

const getCurrentBlockText = (editor: InkwellEditor): string => {
  const path = getCurrentBlockPath(editor);
  if (!path) return "";
  try {
    return Editor.string(editor, path);
  } catch {
    return "";
  }
};

const getTextBeforeCursorInBlock = (editor: InkwellEditor): string | null => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return null;
  const anchor = selection.anchor;
  const blockStart = { path: anchor.path, offset: 0 };
  try {
    return Editor.string(editor, { anchor: blockStart, focus: anchor });
  } catch {
    return null;
  }
};

interface SlashCommandMenuProps<T extends SlashCommandItem>
  extends PluginRenderProps {
  commands: T[];
  emptyMessage: string;
  onReadyChange?: (ready: boolean) => void;
  onExecute?: (command: SlashCommandExecution) => void;
  getEditor: () => InkwellEditor | null;
}

const SlashCommandMenuInner = forwardRef(function SlashCommandMenuInner<
  T extends SlashCommandItem,
>(
  {
    commands,
    emptyMessage,
    onReadyChange,
    onExecute,
    onDismiss,
    position,
    getEditor,
  }: SlashCommandMenuProps<T>,
  ref: React.Ref<SlashMenuHandle>,
) {
  const [mode, setMode] = useState<"commands" | "args" | "ready">("commands");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState<T | null>(null);
  const [selectedArg, setSelectedArg] = useState<{
    name: string;
    value: string;
  } | null>(null);
  const [argChoices, setArgChoices] = useState<SlashCommandChoice[]>([]);
  const [loadingArgs, setLoadingArgs] = useState(false);

  useEffect(() => {
    onReadyChange?.(mode === "ready");
  }, [mode, onReadyChange]);

  // Load arg choices for the currently selected command when entering the
  // `args` phase. Async fetches are cancellation-safe.
  useEffect(() => {
    let cancelled = false;

    const loadChoices = async () => {
      if (mode !== "args" || !selectedCommand) {
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
  }, [mode, selectedCommand]);

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

  // Reset selection to the first enabled item whenever items change. Using
  // `items.length`/`mode`/`query` as deps keeps this cheap without
  // depending on the full items array identity.
  useEffect(() => {
    const firstEnabled = items.findIndex(item => !item.disabled);
    setSelectedIndex(firstEnabled >= 0 ? firstEnabled : 0);
  }, [items.length, mode, query]);

  const writeSlashLine = useCallback(
    (line: string) => {
      const editor = getEditor();
      if (!editor) return;
      const path = getCurrentBlockPath(editor);
      if (!path) return;
      try {
        setBlockText(editor, path, line);
        editor.onChange();
      } catch {
        // Block may have been removed by an external edit.
      }
    },
    [getEditor],
  );

  const handleSelect = useCallback(
    (item: SlashCommandAutocompleteItem<T>) => {
      if (item.disabled) return;

      if (item.type === "command") {
        const command = item.command;
        if (!command) return;
        const hasRequiredArgs =
          command.args?.some(arg => arg.required) ?? false;
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
      setSelectedArg(
        firstArg ? { name: firstArg.name, value: item.value } : null,
      );
      setQuery("");
      setMode("ready");
    },
    [selectedCommand, writeSlashLine],
  );

  useImperativeHandle(
    ref,
    () => ({
      isReady: () => mode === "ready",
      appendQuery: value => setQuery(current => `${current}${value}`),
      removeQueryChar: () =>
        setQuery(current => (current.length > 0 ? current.slice(0, -1) : "")),
      move: direction =>
        setSelectedIndex(current => {
          if (items.length === 0) return current;
          for (let step = 1; step <= items.length; step++) {
            const next =
              (current + direction * step + items.length) % items.length;
            if (!items[next]?.disabled) return next;
          }
          return current;
        }),
      selectActive: () => {
        const item = items[selectedIndex];
        if (item) handleSelect(item);
      },
      execute: () => {
        if (!selectedCommand) return;
        const editor = getEditor();
        const raw = editor
          ? (getCurrentBlockText(editor) ?? `/${selectedCommand.name}`)
          : `/${selectedCommand.name}`;
        onExecute?.({
          name: selectedCommand.name,
          args: selectedArg ? { [selectedArg.name]: selectedArg.value } : {},
          raw,
        });
      },
      reset: () => {
        setMode("commands");
        setQuery("");
        setSelectedCommand(null);
        setSelectedArg(null);
        setSelectedIndex(0);
        setArgChoices([]);
      },
    }),
    [
      getEditor,
      handleSelect,
      items,
      mode,
      onExecute,
      selectedArg,
      selectedCommand,
      selectedIndex,
    ],
  );

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
          {mode === "commands"
            ? `/${query}`
            : `${selectedCommand ? `/${selectedCommand.name} ` : ""}${query}`}
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
        <div className={pluginPickerClass.empty}>
          ↑↓ navigate · Tab/Enter select · Esc close
        </div>
      </div>
    </div>
  );
}) as <T extends SlashCommandItem>(
  props: SlashCommandMenuProps<T> & { ref?: React.Ref<SlashMenuHandle> },
) => React.ReactElement | null;

export const createSlashCommandsPlugin = <T extends SlashCommandItem>({
  name = "slash-commands",
  commands,
  onReadyChange,
  onExecute,
  emptyMessage = "No commands found",
}: SlashCommandsPluginOptions<T>): InkwellPlugin => {
  // Captured once via `setup` and again on every keydown — the latter
  // covers tests that re-create plugin instances per render.
  let editorRef: InkwellEditor | null = null;
  // The rendered menu component publishes its imperative surface here so
  // the editor-side keydown handler can drive it without writing to refs
  // during render.
  const menuRef: RefObject<SlashMenuHandle | null> = { current: null };

  const enterReadyOrExecuteCleanup = (
    editor: InkwellEditor,
    ctx: PluginKeyDownContext,
    action: () => void,
  ) => {
    const path = getCurrentBlockPath(editor);
    action();
    ctx.setActivePlugin(null);
    if (!path) return;
    // Defer the block clear so the action's final selection/state has a
    // chance to settle before we remove the slash line.
    requestAnimationFrame(() => clearBlockAtPath(editor, path));
  };

  return {
    name,
    // Slash commands has no trigger character — it activates from
    // `onKeyDown` once `/` is typed with no prose between the start of
    // the current line and the caret. Without this flag the editor would
    // render the menu by default (since there is no trigger).
    activatable: true,
    setup: editor => {
      editorRef = editor;
      return () => {
        editorRef = null;
      };
    },
    render: (props: PluginRenderProps) => {
      if (!props.active) return null;
      return (
        <SlashCommandMenuInner<T>
          {...props}
          ref={menuRef}
          commands={commands}
          emptyMessage={emptyMessage}
          onReadyChange={onReadyChange}
          onExecute={onExecute}
          getEditor={() => editorRef}
        />
      );
    },
    onKeyDown: (event, ctx, editor) => {
      editorRef = editor;
      // Opening: `/` typed with no prose between the start of the
      // current line and the caret. This permits opening at the start of
      // an otherwise non-empty line (the typed `/` is inserted ahead of
      // the existing line content) as long as the user hasn't started
      // writing prose first.
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const beforeCursor = getTextBeforeCursorInBlock(editor);
        if (beforeCursor !== null && beforeCursor.trim() === "") {
          event.preventDefault();
          Transforms.insertText(editor, "/");
          ctx.setActivePlugin({ name });
          // Reset state machine on (re)open.
          menuRef.current?.reset();
        }
      }
    },
    onActiveKeyDown: (event, ctx, editor) => {
      editorRef = editor;
      const menu = menuRef.current;
      if (!menu) return;

      if (event.key === "Escape") {
        event.preventDefault();
        // Only the execute (ready) phase clears the typed slash line. In
        // the commands/args phases Escape just closes the menu and leaves
        // the user's typed text intact (matching the test contract).
        if (menu.isReady()) {
          enterReadyOrExecuteCleanup(editor, ctx, () => {
            // No execute on escape — just clear.
          });
        } else {
          ctx.setActivePlugin(null);
          menu.reset();
        }
        return;
      }

      if (menu.isReady() && event.key === "Enter") {
        event.preventDefault();
        enterReadyOrExecuteCleanup(editor, ctx, () => {
          menu.execute();
        });
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        menu.move(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        menu.move(-1);
        return;
      }

      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        menu.selectActive();
        return;
      }

      if (event.key === "Backspace") {
        const beforeCursor = getTextBeforeCursorInBlock(editor);
        if (beforeCursor === "/") {
          // The user backspaced over the trigger — close the menu.
          ctx.setActivePlugin(null);
          menu.reset();
          return;
        }
        menu.removeQueryChar();
        return;
      }

      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.length === 1
      ) {
        menu.appendQuery(event.key);
      }
    },
  };
};
