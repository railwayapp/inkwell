"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface PluginPickerProps<T> {
  pluginName: string;
  className: string;
  searchClassName: string;
  itemClassName: string;
  activeItemClassName: string;
  emptyClassName: string;
  items: T[];
  search?: (query: string) => Promise<T[]> | T[];
  renderItem: (item: T, active: boolean) => ReactNode;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  onDismiss: () => void;
  placeholder?: string;
  emptyMessage: string;
  itemDataAttribute?: string;
}

export function PluginPicker<T>({
  pluginName,
  className,
  searchClassName,
  itemClassName,
  activeItemClassName,
  emptyClassName,
  items,
  search,
  renderItem,
  getKey,
  onSelect,
  onDismiss,
  placeholder,
  emptyMessage,
  itemDataAttribute,
}: PluginPickerProps<T>): ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [asyncResults, setAsyncResults] = useState<T[]>([]);
  const selectedIndexRef = useRef(0);
  const resultsRef = useRef<T[]>(items);

  const updateSelectedIndex = useCallback((next: number) => {
    selectedIndexRef.current = next;
    setSelectedIndex(next);
  }, []);

  const syncResults = useMemo(() => {
    if (search) return null;
    return items.filter(item =>
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

  const commitSelected = useCallback(() => {
    const item = resultsRef.current[selectedIndexRef.current];
    if (item) onSelect(item);
  }, [onSelect]);

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
            {...(itemDataAttribute ? { [itemDataAttribute]: "" } : {})}
            className={`${itemClassName} ${active ? activeItemClassName : ""}`}
            onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => updateSelectedIndex(index)}
            onClick={() => onSelect(item)}
          >
            {renderItem(item, active)}
          </div>
        );
      }),
    [
      activeItemClassName,
      activeItemRef,
      getKey,
      itemClassName,
      itemDataAttribute,
      onSelect,
      renderItem,
      results,
      selectedIndex,
      updateSelectedIndex,
    ],
  );

  return (
    <div className={className}>
      <input
        ref={focusRef}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        className={searchClassName}
      />
      {results.length === 0 ? (
        <div className={emptyClassName}>{emptyMessage}</div>
      ) : (
        <div>{renderedResults}</div>
      )}
    </div>
  );
}
