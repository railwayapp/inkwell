"use client";

import {
  forwardRef,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type {
  InkwellPlugin,
  InkwellPluginEditor,
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
  choices?: SlashCommandChoice[];
  fetchChoices?: () => Promise<SlashCommandChoice[]>;
}

export interface SlashCommandItem {
  name: string;
  description: string;
  aliases?: string[];
  arg?: SlashCommandArg;
  disabled?: () => string | false;
}

export interface SlashCommandExecution {
  name: string;
  args: Record<string, string>;
  raw: string;
}

export interface SlashCommandsPluginOptions<
  T extends SlashCommandItem = SlashCommandItem,
> {
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

interface SlashCommandMenuProps<T extends SlashCommandItem>
  extends PluginRenderProps {
  commands: T[];
  emptyMessage: string;
  onReadyChange?: (ready: boolean) => void;
  onExecute?: (command: SlashCommandExecution) => void;
  getEditor: () => InkwellPluginEditor | null;
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

      const firstArg = selectedCommand.arg;
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
            : (selectedCommand?.arg?.description ?? ""),
          disabled: choice.disabled,
        })),
    [argChoices, query, selectedCommand],
  );

  const items = mode === "args" ? argItems : commandItems;
  const reactId = useId().replace(/:/g, "");
  const listboxId = `${pluginPickerClass.picker}-${reactId}-slash-listbox`;
  const activeOptionId = `${listboxId}-option-${selectedIndex}`;

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
      editor.replaceCurrentBlockContent(line);
    },
    [getEditor],
  );

  const handleSelect = useCallback(
    (item: SlashCommandAutocompleteItem<T>) => {
      if (item.disabled) return;

      if (item.type === "command") {
        const command = item.command;
        if (!command) return;
        const hasArg = !!command.arg;
        const nextLine = `/${command.name}${hasArg ? " " : ""}`;
        writeSlashLine(nextLine);
        setSelectedCommand(command);
        setSelectedArg(null);
        setQuery("");
        setMode(hasArg ? "args" : "ready");
        return;
      }

      if (!selectedCommand) return;
      const firstArg = selectedCommand.arg;
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
        const raw =
          editor?.getCurrentBlockContent() ?? `/${selectedCommand.name}`;
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
          <div
            id={listboxId}
            role="listbox"
            aria-activedescendant={activeOptionId}
          >
            {items.map((item, index) => {
              const active = index === selectedIndex;
              return (
                <div
                  key={`${item.type}-${item.value}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={active}
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
  // Captured through setup and refreshed on every keydown so recreated plugin
  // instances still operate on the current editor controller.
  let editorRef: InkwellPluginEditor | null = null;
  // The rendered menu component publishes its imperative surface here so
  // the editor-side keydown handler can drive it without writing to refs
  // during render.
  const menuRef: RefObject<SlashMenuHandle | null> = { current: null };

  const enterReadyOrExecuteCleanup = (
    editor: InkwellPluginEditor,
    ctx: PluginKeyDownContext,
    action: () => void,
  ) => {
    action();
    ctx.dismiss();
    // Defer the block clear so the action's final selection/state has a
    // chance to settle before we remove the slash line.
    requestAnimationFrame(() => editor.clearCurrentBlock());
  };

  return {
    name,
    activation: { type: "manual" },
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
    onKeyDown: (event, ctx) => {
      editorRef = ctx.editor;
      // Opening: `/` typed on an empty or whitespace-only line. This avoids
      // rewriting/deleting unrelated suffix text when the caret is before
      // existing prose in the same block.
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const beforeCursor = ctx.editor.getCurrentBlockContentBeforeCursor();
        const blockText = ctx.editor.getCurrentBlockContent();
        if (
          beforeCursor !== null &&
          beforeCursor.trim() === "" &&
          blockText !== null &&
          blockText.trim() === ""
        ) {
          event.preventDefault();
          ctx.editor.insertContent("/");
          ctx.activate();
          // Reset state machine on (re)open.
          menuRef.current?.reset();
        }
      }
    },
    onActiveKeyDown: (event, ctx) => {
      editorRef = ctx.editor;
      const menu = menuRef.current;
      if (!menu) return;

      if (event.key === "Escape") {
        event.preventDefault();
        // Only the execute (ready) phase clears the typed slash line. In
        // the commands/args phases Escape just closes the menu and leaves
        // the user's typed text intact (matching the test contract).
        if (menu.isReady()) {
          enterReadyOrExecuteCleanup(ctx.editor, ctx, () => {
            // No execute on escape — just clear.
          });
        } else {
          ctx.dismiss();
          menu.reset();
        }
        return;
      }

      if (menu.isReady() && event.key === "Enter") {
        event.preventDefault();
        enterReadyOrExecuteCleanup(ctx.editor, ctx, () => {
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
        const beforeCursor = ctx.editor.getCurrentBlockContentBeforeCursor();
        if (beforeCursor === "/") {
          // The user backspaced over the trigger — close the menu.
          ctx.dismiss();
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
