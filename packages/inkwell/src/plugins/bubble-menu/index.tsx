"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { pluginClass } from "../../lib/class-names";
import type {
  BubbleMenuItem,
  BubbleMenuItemProps,
  InkwellPlugin,
  PluginRenderProps,
} from "../../types";

const cls = pluginClass("bubble-menu");

function BoldButton({ wrapSelection }: BubbleMenuItemProps) {
  return (
    <button
      type="button"
      onClick={() => wrapSelection("**", "**")}
      className={cls("btn")}
      aria-label="Bold"
      title="Bold"
    >
      <span className={cls("item-bold")}>B</span>
    </button>
  );
}

function ItalicButton({ wrapSelection }: BubbleMenuItemProps) {
  return (
    <button
      type="button"
      onClick={() => wrapSelection("_", "_")}
      className={cls("btn")}
      aria-label="Italic"
      title="Italic"
    >
      <span className={cls("item-italic")}>I</span>
    </button>
  );
}

function StrikethroughButton({ wrapSelection }: BubbleMenuItemProps) {
  return (
    <button
      type="button"
      onClick={() => wrapSelection("~~", "~~")}
      className={cls("btn")}
      aria-label="Strikethrough"
      title="Strikethrough"
    >
      <span className={cls("item-strike")}>S</span>
    </button>
  );
}

/**
 * Default bubble menu items: bold, italic, strikethrough.
 */
export const defaultBubbleMenuItems: BubbleMenuItem[] = [
  {
    key: "bold",
    shortcut: "b",
    onShortcut: wrap => wrap("**", "**"),
    render: props => <BoldButton {...props} />,
  },
  {
    key: "italic",
    shortcut: "i",
    onShortcut: wrap => wrap("_", "_"),
    render: props => <ItalicButton {...props} />,
  },
  {
    key: "strikethrough",
    shortcut: "d",
    onShortcut: wrap => wrap("~~", "~~"),
    render: props => <StrikethroughButton {...props} />,
  },
];

interface BubbleMenuWidgetProps extends PluginRenderProps {
  items: BubbleMenuItem[];
}

function BubbleMenuWidget({
  editorRef,
  wrapSelection,
  items,
}: BubbleMenuWidgetProps): ReactNode {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const handleSelectionChange = useCallback(() => {
    const active = document.activeElement;
    if (active?.closest(`.${cls("container")}`)) return;

    const sel = window.getSelection();
    if (
      !sel ||
      !editorRef.current ||
      !editorRef.current.contains(sel.anchorNode) ||
      sel.isCollapsed ||
      !sel.toString().trim()
    ) {
      setPosition(null);
      return;
    }

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.top - editorRect.top,
      left: rect.left - editorRect.left + rect.width / 2,
    });
  }, [editorRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    const handleMouseUp = () => {
      requestAnimationFrame(handleSelectionChange);
    };
    editorRef.current?.addEventListener("mouseup", handleMouseUp);
    const el = editorRef.current;
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      el?.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleSelectionChange, editorRef]);

  if (!position) return null;

  return (
    <div
      className={cls("container")}
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        transform: "translateX(-50%) translateY(-100%)",
        marginTop: -8,
        zIndex: 1000,
      }}
      onMouseDown={e => e.preventDefault()}
    >
      <div className={cls("inner")}>
        {items.map(item => (
          <item.render key={item.key} wrapSelection={wrapSelection} />
        ))}
      </div>
    </div>
  );
}

export interface BubbleMenuOptions {
  /**
   * Menu items. Defaults to bold, italic, strikethrough.
   */
  items?: BubbleMenuItem[];
}

export function createBubbleMenuPlugin(
  options?: BubbleMenuOptions,
): InkwellPlugin {
  const items = options?.items ?? defaultBubbleMenuItems;
  return {
    name: "bubble-menu",
    render: (props: PluginRenderProps) => (
      <BubbleMenuWidget {...props} items={items} />
    ),
    onKeyDown: (event, { wrapSelection }) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const item = items.find(i => i.shortcut === event.key);
      if (item?.onShortcut) {
        event.preventDefault();
        item.onShortcut(wrapSelection);
      }
    },
  };
}
