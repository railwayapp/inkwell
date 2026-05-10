"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { pluginClass } from "../../lib/class-names";
import type { InkwellPlugin, PluginRenderProps } from "../../types";

const cls = pluginClass("mentions");

/**
 * Item shape a mentions plugin operates on. `id` is required so the default
 * reference-marker form (`@<marker>[<id>]`) has something to persist.
 */
export interface MentionItem {
  id: string;
  title: string;
}

export interface MentionsPluginOptions<T extends MentionItem = MentionItem> {
  /** Unique plugin name (must be unique per editor instance). */
  name: string;
  /** Key that opens the picker (e.g. "@", "["). */
  trigger: string;
  /**
   * Persisted marker name used when `onSelect` is not provided. Produces
   * `@<marker>[<id>]` in the document.
   */
  marker: string;
  /** Async search callback. Return items matching the query. */
  search: (query: string) => Promise<T[]> | T[];
  /** Render a single item row in the picker. */
  renderItem: (item: T, active: boolean) => ReactNode;
  /**
   * Map a selected item to the string inserted into the document. When
   * omitted, the plugin inserts the marker form `@<marker>[<id>]`.
   */
  onSelect?: (item: T) => string;
  /** Fallback message when `search` returns no results. */
  emptyMessage?: string;
}

interface MentionsPickerProps<T extends MentionItem> extends PluginRenderProps {
  options: MentionsPluginOptions<T>;
}

function MentionsPicker<T extends MentionItem>({
  options,
  onSelect,
  onDismiss,
}: MentionsPickerProps<T>): ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(options.search(query)).then(items => {
      if (cancelled) return;
      setResults(items);
      setSelectedIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [query, options.search]);

  const focusRef = useCallback((el: HTMLInputElement | null) => {
    if (el) requestAnimationFrame(() => el.focus());
  }, []);

  const activeItemRef = useCallback((el: HTMLDivElement | null) => {
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const commit = useCallback(
    (item: T) => {
      const text = options.onSelect
        ? options.onSelect(item)
        : `@${options.marker}[${item.id}]`;
      onSelect(text);
    },
    [onSelect, options],
  );

  const handlePluginKey = useCallback(
    (key: string) => {
      switch (key) {
        case "ArrowDown":
          setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case "Enter":
          if (results[selectedIndex]) commit(results[selectedIndex]);
          break;
        case "Backspace":
          setQuery(prev => prev.slice(0, -1));
          break;
        default:
          if (key.length === 1) setQuery(prev => `${prev}${key}`);
          break;
      }
    },
    [results, selectedIndex, commit],
  );

  useEffect(() => {
    const handleForwardedKey = (event: Event) => {
      const customEvent = event as CustomEvent<{ key: string }>;
      handlePluginKey(customEvent.detail.key);
    };

    window.addEventListener(
      `inkwell-plugin-keydown:${options.name}`,
      handleForwardedKey,
    );
    return () => {
      window.removeEventListener(
        `inkwell-plugin-keydown:${options.name}`,
        handleForwardedKey,
      );
    };
  }, [handlePluginKey, options.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case "Backspace":
          e.preventDefault();
          handlePluginKey(e.key);
          break;
        case "Escape":
          e.preventDefault();
          onDismiss();
          break;
      }
    },
    [handlePluginKey, onDismiss],
  );

  return (
    <div className={cls("picker")}>
      <input
        ref={focusRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cls("search")}
      />
      {results.length === 0 ? (
        <div className={cls("empty")}>
          {options.emptyMessage ?? "No results"}
        </div>
      ) : (
        <div>
          {results.map((item, i) => (
            <div
              key={item.id}
              ref={i === selectedIndex ? activeItemRef : undefined}
              className={`${cls("item")} ${
                i === selectedIndex ? cls("item-active") : ""
              }`}
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => commit(item)}
            >
              {options.renderItem(item, i === selectedIndex)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Generic mentions plugin. Pick items from an async source and insert either
 * the expanded content (via `onSelect`) or a persisted marker `@<marker>[<id>]`.
 */
export function createMentionsPlugin<T extends MentionItem = MentionItem>(
  options: MentionsPluginOptions<T>,
): InkwellPlugin {
  return {
    name: options.name,
    trigger: { key: options.trigger },
    render: (props: PluginRenderProps) => (
      <div
        className={cls("popup")}
        style={{
          position: "absolute",
          top: props.position.top,
          left: props.position.left,
          zIndex: 2147483647,
        }}
      >
        <MentionsPicker options={options} {...props} />
      </div>
    ),
  };
}
