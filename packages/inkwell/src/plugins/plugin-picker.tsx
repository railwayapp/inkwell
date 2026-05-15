"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PluginRenderProps } from "../types";

const BASE = "inkwell-plugin-picker";

export const pluginPickerClass = {
  popup: `${BASE}-popup`,
  popupFlipped: `${BASE}-popup-flipped`,
  picker: `${BASE}`,
  search: `${BASE}-search`,
  list: `${BASE}-list`,
  item: `${BASE}-item`,
  itemActive: `${BASE}-item-active`,
  empty: `${BASE}-empty`,
  title: `${BASE}-title`,
  subtitle: `${BASE}-subtitle`,
  preview: `${BASE}-preview`,
};

interface PickerPosition {
  top: number;
  left: number;
}

interface PickerCursorRect {
  top: number;
  bottom: number;
  left: number;
}

/** Gap (px) between the caret and the popup. Matches the gap baked into
 *  `getCursorPosition` for the below-anchor case so the above-anchor case
 *  mirrors it. */
const POPUP_GAP = 4;
/** Breathing room from the viewport edge when deciding whether the popup
 *  fits in a given direction. */
const VIEWPORT_MARGIN = 8;
/** Fallback caret height used when `cursorRect` is missing (older render
 *  fixtures). Roughly one editor line height — good enough for the flip
 *  heuristic in test paths that don't supply real geometry. */
const CURSOR_HEIGHT_FALLBACK = 20;

interface PickerPlacementResult {
  /** Ref callback to attach to the popup root. */
  setPopupEl: (el: HTMLDivElement | null) => void;
  /** Style to apply to the popup root (position, top, left, transform). */
  style: CSSProperties;
  /** Class names to apply to the popup root for flipped-state styling. */
  className: string;
  /** True when the popup was flipped above the caret. */
  flippedAbove: boolean;
}

/**
 * Wrapper- and viewport-aware popup placement. Picks an anchor based on
 * available space:
 *
 *  - vertical: flips above the caret when the popup would clip either the
 *    editor wrapper's bottom or the viewport bottom, as long as there is
 *    room above the caret in the viewport. Falls back to below otherwise.
 *  - horizontal: shifts left when the popup would clip the viewport right
 *    edge, clamping to a small margin.
 *
 * The wrapper-bottom check catches the common case where the editor's
 * visible box is short (chat composer, small embeds, or any editor where
 * the wrapper height is much smaller than the viewport) — a popup
 * extending past the editor's visual bottom looks broken even if it fits
 * in the viewport, so we flip above instead.
 *
 * Re-measures on resize, scroll, and content-driven popup resizes via
 * `ResizeObserver`, so mode transitions inside a picker (e.g. slash
 * commands → args → ready) re-evaluate placement.
 *
 * The popup must be `position: absolute` inside the editor's positioned
 * wrapper so `offsetParent` resolves to the wrapper element.
 */
function usePickerPlacement(
  position: PickerPosition,
  cursorRect: PickerCursorRect | undefined,
): PickerPlacementResult {
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{
    flippedAbove: boolean;
    leftOverride: number | null;
  }>({ flippedAbove: false, leftOverride: null });

  const cursorTopWrapper =
    cursorRect?.top ??
    Math.max(0, position.top - POPUP_GAP - CURSOR_HEIGHT_FALLBACK);
  const cursorBottomWrapper =
    cursorRect?.bottom ?? Math.max(0, position.top - POPUP_GAP);
  const cursorLeftWrapper = cursorRect?.left ?? position.left;

  useLayoutEffect(() => {
    if (!popupEl) return;

    const measure = () => {
      const offsetParent = popupEl.offsetParent;
      if (!(offsetParent instanceof HTMLElement)) return;
      const wrapperRect = offsetParent.getBoundingClientRect();
      const popupRect = popupEl.getBoundingClientRect();
      const popupHeight = popupRect.height;
      const popupWidth = popupRect.width;

      const cursorTopViewport = wrapperRect.top + cursorTopWrapper;
      const cursorBottomViewport = wrapperRect.top + cursorBottomWrapper;
      const cursorLeftViewport = wrapperRect.left + cursorLeftWrapper;

      const spaceBelowViewport =
        window.innerHeight - cursorBottomViewport - VIEWPORT_MARGIN;
      const spaceBelowWrapper = wrapperRect.bottom - cursorBottomViewport;
      const spaceBelow = Math.min(spaceBelowViewport, spaceBelowWrapper);
      const spaceAbove = cursorTopViewport - VIEWPORT_MARGIN;
      const needsFlip = popupHeight + POPUP_GAP > spaceBelow;
      const fitsAbove = popupHeight + POPUP_GAP <= spaceAbove;
      const flippedAbove = needsFlip && fitsAbove;

      const maxRightViewport = window.innerWidth - VIEWPORT_MARGIN;
      const popupRightIfDefault = cursorLeftViewport + popupWidth;
      const leftOverride =
        popupRightIfDefault > maxRightViewport
          ? Math.max(
              VIEWPORT_MARGIN - wrapperRect.left,
              maxRightViewport - popupWidth - wrapperRect.left,
            )
          : null;

      setPlacement(prev =>
        prev.flippedAbove === flippedAbove && prev.leftOverride === leftOverride
          ? prev
          : { flippedAbove, leftOverride },
      );
    };

    measure();

    const ResizeObserverCtor =
      typeof window !== "undefined"
        ? (window as unknown as { ResizeObserver?: typeof ResizeObserver })
            .ResizeObserver
        : undefined;
    const resizeObserver = ResizeObserverCtor
      ? new ResizeObserverCtor(() => measure())
      : null;
    resizeObserver?.observe(popupEl);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [popupEl, cursorTopWrapper, cursorBottomWrapper, cursorLeftWrapper]);

  const style: CSSProperties = {
    position: "absolute",
    top: placement.flippedAbove ? cursorTopWrapper - POPUP_GAP : position.top,
    left: placement.leftOverride ?? position.left,
    transform: placement.flippedAbove ? "translateY(-100%)" : undefined,
    zIndex: 1001,
  };

  const className = placement.flippedAbove
    ? `${pluginPickerClass.popup} ${pluginPickerClass.popupFlipped}`
    : pluginPickerClass.popup;

  return {
    setPopupEl,
    style,
    className,
    flippedAbove: placement.flippedAbove,
  };
}

/**
 * Shared placement helper exported for built-in plugins that render their
 * own popup wrappers (e.g. the slash commands menu has separate popups
 * for the picker and the ready-to-execute hint). External plugins should
 * prefer `PluginMenuPrimitive`, which wires this in automatically.
 */
export function usePluginPopupPlacement(
  position: PickerPosition,
  cursorRect: PickerCursorRect | undefined,
): PickerPlacementResult {
  return usePickerPlacement(position, cursorRect);
}

interface PluginMenuPrimitiveProps<T> extends PluginRenderProps {
  /**
   * Plugin name. Retained for backwards compatibility but no longer used
   * for routing forwarded keys — those come through
   * `subscribeForwardedKey` from `PluginRenderProps`.
   */
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
  cursorRect,
  subscribeForwardedKey,
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
        case "Backspace":
          if (query.length === 0) {
            onSelect("");
          } else {
            setQuery(prev => prev.slice(0, -1));
          }
          break;
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
        default:
          if (key.length === 1) setQuery(prev => `${prev}${key}`);
          break;
      }
    },
    [commitSelected, onSelect, query.length, updateSelectedIndex],
  );

  useEffect(
    () => subscribeForwardedKey(handlePluginKey),
    [handlePluginKey, subscribeForwardedKey],
  );

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

  const activeItemRef = useCallback((el: HTMLDivElement | null) => {
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const reactId = useId().replace(/:/g, "");
  const listboxId = `${pluginPickerClass.picker}-${reactId}-listbox`;
  const activeOptionId = `${listboxId}-option-${selectedIndex}`;
  const renderedResults = useMemo(
    () =>
      results.map((item, index) => {
        const active = index === selectedIndex;
        return (
          <div
            key={getKey(item)}
            ref={active ? activeItemRef : undefined}
            id={`${listboxId}-option-${index}`}
            role="option"
            aria-selected={active}
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
      listboxId,
      renderItem,
      results,
      selectedIndex,
      updateSelectedIndex,
    ],
  );

  const placement = usePickerPlacement(position, cursorRect);

  return (
    <div
      ref={placement.setPopupEl}
      className={placement.className}
      style={placement.style}
      onMouseDown={event => event.preventDefault()}
    >
      <div
        className={pluginPickerClass.picker}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={results.length > 0 ? activeOptionId : undefined}
      >
        <div className={pluginPickerClass.search} aria-label={placeholder}>
          {query || placeholder}
        </div>
        {results.length === 0 ? (
          <div className={pluginPickerClass.empty} role="status">
            {emptyMessage}
          </div>
        ) : (
          <div id={listboxId} role="listbox" className={pluginPickerClass.list}>
            {renderedResults}
          </div>
        )}
      </div>
    </div>
  );
}
