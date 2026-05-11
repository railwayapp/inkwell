"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

interface SlashCommandParsedInput {
  command: string;
  args: string[];
  rawArgs: string;
}

interface SlashCommandMenuState {
  visible: boolean;
  ready: boolean;
  selectActive: () => void;
  close: () => void;
  move: (direction: 1 | -1) => void;
}

export interface SlashCommandsPluginOptions<T extends SlashCommandItem> {
  name?: string;
  commands: T[];
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  onReadyChange?: (ready: boolean) => void;
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

const isSlashCommand = (input: string): boolean => input.trim().startsWith("/");

const findActiveSlashLineIndex = (markdown: string): number => {
  const lines = markdown.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index] ?? "";
    if (line.trim() === "") continue;
    return line.trimStart().startsWith("/") ? index : -1;
  }
  return -1;
};

const getActiveSlashLine = (markdown: string): string => {
  const lines = markdown.split("\n");
  const index = findActiveSlashLineIndex(markdown);
  return index === -1 ? "" : (lines[index] ?? "");
};

const replaceActiveSlashLine = (markdown: string, nextLine: string): string => {
  const lines = markdown.split("\n");
  const index = findActiveSlashLineIndex(markdown);
  if (index === -1) return markdown;
  lines[index] = nextLine;
  return lines.join("\n");
};

const parseSlashCommand = (input: string): SlashCommandParsedInput | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const withoutSlash = trimmed.slice(1);
  const [commandPart, ...argParts] = withoutSlash.split(/\s+/);
  if (!commandPart) return null;

  return {
    command: commandPart.toLowerCase(),
    args: argParts.filter(Boolean),
    rawArgs: argParts.join(" "),
  };
};

const isTypingCommandName = (input: string): boolean => {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith("/")) return false;
  return !trimmedStart.slice(1).includes(" ");
};

const getPartialCommand = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(" ");
  return spaceIndex === -1
    ? withoutSlash.toLowerCase()
    : withoutSlash.slice(0, spaceIndex).toLowerCase();
};

const getPartialArg = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(" ");
  if (spaceIndex === -1) return null;
  return withoutSlash.slice(spaceIndex + 1);
};

function SlashCommandMenu<T extends SlashCommandItem>({
  commands,
  emptyMessage,
  getMarkdown,
  setMarkdown,
  stateRef,
  onReadyChange,
}: {
  commands: T[];
  emptyMessage: string;
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  stateRef: { current: SlashCommandMenuState };
  onReadyChange?: (ready: boolean) => void;
}) {
  const markdown = getMarkdown();
  const input = getActiveSlashLine(markdown);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [argChoices, setArgChoices] = useState<SlashCommandChoice[]>([]);
  const [loadingArgs, setLoadingArgs] = useState(false);

  const parsed = parseSlashCommand(input);
  const typingCommand = isTypingCommandName(input);
  const partialCommand = getPartialCommand(input);
  const partialArg = getPartialArg(input);

  const currentCommand = useMemo(() => {
    if (!parsed) return null;
    return commands.find(
      command =>
        command.name === parsed.command ||
        command.aliases?.includes(parsed.command),
    );
  }, [commands, parsed]);

  useEffect(() => {
    let cancelled = false;

    const fetchChoices = async () => {
      if (!currentCommand || typingCommand) {
        setArgChoices([]);
        return;
      }

      const firstArg = currentCommand.args?.[0];
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

    void fetchChoices();
    return () => {
      cancelled = true;
    };
  }, [currentCommand, typingCommand]);

  const items: SlashCommandAutocompleteItem<T>[] = useMemo(() => {
    if (typingCommand) {
      const query = partialCommand ?? "";
      return commands
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
        });
    }

    if (currentCommand && argChoices.length > 0) {
      const query = partialArg ?? "";
      return argChoices
        .filter(choice => !query || fuzzyMatch(query, choice.label))
        .map(choice => ({
          type: "arg" as const,
          value: choice.value,
          label: choice.label,
          description: choice.disabled
            ? "(current)"
            : (currentCommand.args?.[0]?.description ?? ""),
          disabled: choice.disabled,
        }));
    }

    return [];
  }, [argChoices, commands, currentCommand, partialArg, partialCommand, typingCommand]);

  useEffect(() => {
    const firstEnabled = items.findIndex(item => !item.disabled);
    setSelectedIndex(firstEnabled >= 0 ? firstEnabled : 0);
  }, [items.length, input]);

  const commandIsComplete = useMemo(() => {
    if (!currentCommand) return false;
    const args = currentCommand.args ?? [];
    const hasNoRequiredArgs = args.length === 0 || args.every(arg => !arg.required);
    if (hasNoRequiredArgs) return true;
    if (typingCommand) return false;

    return args.every((arg, index) => {
      if (!arg.required) return true;
      const argValue = index === 0 ? partialArg : parsed?.args[index];
      if (!argValue) return false;
      if (index === 0 && argChoices.length > 0) {
        return argChoices.some(
          choice =>
            !choice.disabled &&
            choice.label.toLowerCase() === argValue.toLowerCase(),
        );
      }
      return true;
    });
  }, [argChoices, currentCommand, parsed, partialArg, typingCommand]);

  useEffect(() => {
    onReadyChange?.(commandIsComplete);
  }, [commandIsComplete, onReadyChange]);

  const close = useCallback(() => {
    onReadyChange?.(false);
    setMarkdown(replaceActiveSlashLine(getMarkdown(), ""));
  }, [getMarkdown, onReadyChange, setMarkdown]);

  const handleSelect = useCallback(
    (item: SlashCommandAutocompleteItem<T>) => {
      if (item.disabled) return;
      if (item.type === "command") {
        const hasArgs = item.command?.args && item.command.args.length > 0;
        setMarkdown(
          replaceActiveSlashLine(
            getMarkdown(),
            `/${item.value}${hasArgs ? " " : ""}`,
          ),
        );
        return;
      }

      const commandPart = parsed?.command ?? "";
      setMarkdown(
        replaceActiveSlashLine(getMarkdown(), `/${commandPart} ${item.label}`),
      );
    },
    [getMarkdown, parsed, setMarkdown],
  );

  const findNextEnabled = useCallback(
    (from: number, direction: 1 | -1): number => {
      if (items.length === 0) return from;
      for (let step = 1; step <= items.length; step++) {
        const index = (from + direction * step + items.length) % items.length;
        if (!items[index]?.disabled) return index;
      }
      return from;
    },
    [items],
  );

  const selectActive = useCallback(() => {
    const item = items[selectedIndex];
    if (item) handleSelect(item);
  }, [handleSelect, items, selectedIndex]);

  const move = useCallback(
    (direction: 1 | -1) => {
      setSelectedIndex(index => findNextEnabled(index, direction));
    },
    [findNextEnabled],
  );

  stateRef.current = {
    visible: isSlashCommand(input),
    ready: commandIsComplete,
    selectActive,
    close,
    move,
  };

  if (!isSlashCommand(input)) return null;

  if (commandIsComplete && currentCommand) {
    return (
      <div className={pluginPickerClass.popup} style={{ position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 1001 }}>
        <div className={pluginPickerClass.picker}>
          <div className={pluginPickerClass.item}>
            <span aria-hidden="true">✓</span>
            <span className={pluginPickerClass.title}>/{currentCommand.name}</span>
            <span className={pluginPickerClass.subtitle}>{currentCommand.description}</span>
          </div>
          <div className={pluginPickerClass.empty}>Enter execute · Esc cancel</div>
        </div>
      </div>
    );
  }

  return (
    <div className={pluginPickerClass.popup} style={{ position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 1001 }}>
      <div className={pluginPickerClass.picker}>
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
                  <span aria-hidden="true">/</span>
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
  emptyMessage = "No commands found",
}: SlashCommandsPluginOptions<T>): InkwellPlugin => {
  const stateRef: { current: SlashCommandMenuState } = {
    current: {
      visible: false,
      ready: false,
      selectActive: () => {},
      close: () => {},
      move: () => {},
    },
  };

  return {
    name,
    render: () => (
      <SlashCommandMenu
        commands={commands}
        emptyMessage={emptyMessage}
        getMarkdown={getMarkdown}
        setMarkdown={setMarkdown}
        stateRef={stateRef}
        onReadyChange={onReadyChange}
      />
    ),
    onKeyDown: event => {
      const state = stateRef.current;
      if (!state.visible) return;

      if (event.key === "Escape") {
        event.preventDefault();
        state.close();
        return;
      }

      if (state.ready) return;

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
      }
    },
  };
};
