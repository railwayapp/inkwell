"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PluginRenderProps } from "../types";

const BASE = "inkwell-plugin-picker";

export const pluginPickerClass = {
  popup: `${BASE}-popup`,
  picker: `${BASE}`,
  search: `${BASE}-search`,
  item: `${BASE}-item`,
  itemActive: `${BASE}-item-active`,
  empty: `${BASE}-empty`,
  title: `${BASE}-title`,
  subtitle: `${BASE}-subtitle`,
  preview: `${BASE}-preview`,
};

interface PluginMenuPrimitiveProps<T> extends PluginRenderProps {
  /** Plugin name (used for the forwarded keyboard event channel). */
  pluginName: string;
  /** Sync item list. Used when `search` is not provided. */
  items?: T[];
  /** Async/sync search callback. When provided, replaces sync filtering. */
  search?: (query: string) => Promise<T[]> | T[];
  /** Stable key for an item. Also used by the default sync filter. */
  getKey: (item: T) => string;
  /** Render a single item row inside the picker. */
  renderItem: (item: T, active: boolean) => ReactNode;
  /** Map a selected item to the string inserted into the document. */
  itemToText: (item: T) => string;
  /** Optional search input placeholder. */
  placeholder?: string;
  /** Fallback message when there are no results. */
  emptyMessage?: string;
}

/**
 * Shared picker primitive used by plugins like snippets and mentions. Renders
 * the popup wrapper, search input, and item list, and handles focus, keyboard
 * navigation (locally and via forwarded editor keys), and selection.
 */
export function PluginMenuPrimitive<T>({
  pluginName,
  items,
  search,
  getKey,
  renderItem,
  itemToText,
  placeholder,
  emptyMessage = "No results",
  onSelect,
  onDismiss,
  position,
}: PluginMenuPrimitiveProps<T>): ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [asyncResults, setAsyncResults] = useState<T[]>([]);
  const selectedIndexRef = useRef(0);
  const resultsRef = useRef<T[]>(items ?? []);

  const updateSelectedIndex = useCallback((next: number) => {
    selectedIndexRef.current = next;
    setSelectedIndex(next);
  }, []);

  const syncResults = useMemo(() => {
    if (search) return null;
    const all = items ?? [];
    return all.filter(item =>
      getKey(item).toLowerCase().includes(query.toLowerCase()),
    );
  }, [getKey, items, query, search]);

  const results = syncResults ?? asyncResults;

  useEffect(() => {
    if (!syncResults) return;
    resultsRef.current = syncResults;
    if (selectedIndexRef.current >= syncResults.length) {
      updateSelectedIndex(0);
    }
  }, [syncResults, updateSelectedIndex]);

  useEffect(() => {
    if (!search) return;
    let cancelled = false;

    Promise.resolve(search(query)).then(next => {
      if (cancelled) return;
      resultsRef.current = next;
      setAsyncResults(next);
      updateSelectedIndex(0);
    });

    return () => {
      cancelled = true;
    };
  }, [query, search, updateSelectedIndex]);

  const commitItem = useCallback(
    (item: T) => onSelect(itemToText(item)),
    [itemToText, onSelect],
  );

  const commitSelected = useCallback(() => {
    const item = resultsRef.current[selectedIndexRef.current];
    if (item) commitItem(item);
  }, [commitItem]);

  const handlePluginKey = useCallback(
    (key: string) => {
      switch (key) {
        case "ArrowDown": {
          const length = resultsRef.current.length;
          if (length === 0) break;
          updateSelectedIndex(
            selectedIndexRef.current < length - 1
              ? selectedIndexRef.current + 1
              : 0,
          );
          break;
        }
        case "ArrowUp": {
          const length = resultsRef.current.length;
          if (length === 0) break;
          updateSelectedIndex(
            selectedIndexRef.current > 0
              ? selectedIndexRef.current - 1
              : length - 1,
          );
          break;
        }
        case "Enter":
          commitSelected();
          break;
        case "Backspace":
          setQuery(prev => prev.slice(0, -1));
          break;
        default:
          if (key.length === 1) setQuery(prev => `${prev}${key}`);
          break;
      }
    },
    [commitSelected, updateSelectedIndex],
  );

  useEffect(() => {
    const handleForwardedKey = (event: Event) => {
      const customEvent = event as CustomEvent<{ key: string }>;
      handlePluginKey(customEvent.detail.key);
    };

    window.addEventListener(
      `inkwell-plugin-keydown:${pluginName}`,
      handleForwardedKey,
    );
    return () => {
      window.removeEventListener(
        `inkwell-plugin-keydown:${pluginName}`,
        handleForwardedKey,
      );
    };
  }, [handlePluginKey, pluginName]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      event.stopPropagation();
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case "Backspace":
          event.preventDefault();
          handlePluginKey(event.key);
          break;
        case "Escape":
          event.preventDefault();
          onDismiss();
          break;
      }
    },
    [handlePluginKey, onDismiss],
  );

  const focusRef = useCallback((el: HTMLInputElement | null) => {
    if (el) requestAnimationFrame(() => el.focus());
  }, []);

  const activeItemRef = useCallback((el: HTMLDivElement | null) => {
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const renderedResults = useMemo(
    () =>
      results.map((item, index) => {
        const active = index === selectedIndex;
        return (
          <div
            key={getKey(item)}
            ref={active ? activeItemRef : undefined}
            className={`${pluginPickerClass.item} ${
              active ? pluginPickerClass.itemActive : ""
            }`}
            onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => updateSelectedIndex(index)}
            onClick={() => commitItem(item)}
          >
            {renderItem(item, active)}
          </div>
        );
      }),
    [
      activeItemRef,
      commitItem,
      getKey,
      renderItem,
      results,
      selectedIndex,
      updateSelectedIndex,
    ],
  );

  return (
    <div
      className={pluginPickerClass.popup}
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        zIndex: 1001,
      }}
      onMouseDown={event => event.preventDefault()}
    >
      <div className={pluginPickerClass.picker}>
        <input
          ref={focusRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          className={pluginPickerClass.search}
        />
        {results.length === 0 ? (
          <div className={pluginPickerClass.empty}>{emptyMessage}</div>
        ) : (
          <div>{renderedResults}</div>
        )}
      </div>
    </div>
  );
}
