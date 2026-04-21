"use client";

import { type ReactNode, useCallback, useState } from "react";
import { pluginClass } from "../../lib/class-names";
import type { InkwellPlugin, PluginRenderProps, Snippet } from "../../types";

const cls = pluginClass("snippets");

interface SnippetPickerProps extends PluginRenderProps {
  snippets: Snippet[];
}

function SnippetPicker({
  snippets,
  onSelect,
  onDismiss,
}: SnippetPickerProps): ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");

  const filtered = snippets.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  );

  const focusRef = useCallback((el: HTMLInputElement | null) => {
    if (el) requestAnimationFrame(() => el.focus());
  }, []);

  const activeItemRef = useCallback((el: HTMLDivElement | null) => {
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIndex]) {
            onSelect(filtered[selectedIndex].content);
          }
          break;
        case "Escape":
          e.preventDefault();
          onDismiss();
          break;
      }
    },
    [filtered, selectedIndex, onSelect, onDismiss],
  );

  return (
    <div className={cls("picker")}>
      <input
        ref={focusRef}
        type="text"
        placeholder="Search snippets..."
        value={search}
        onChange={e => {
          setSearch(e.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={handleSearchKeyDown}
        className={cls("search")}
      />
      {filtered.length === 0 ? (
        <div className={cls("empty")}>No snippets found</div>
      ) : (
        <div>
          {filtered.map((snippet, i) => (
            <div
              key={snippet.title}
              ref={i === selectedIndex ? activeItemRef : undefined}
              data-snippet-item
              className={`${cls("item")} ${
                i === selectedIndex ? cls("item-active") : ""
              }`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => onSelect(snippet.content)}
            >
              <div className={cls("title")}>{snippet.title}</div>
              <div className={cls("preview")}>
                {snippet.content.length > 80
                  ? `${snippet.content.slice(0, 80)}...`
                  : snippet.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function createSnippetsPlugin(options: {
  snippets: Snippet[];
  key?: string;
}): InkwellPlugin {
  const { snippets, key = "[" } = options;

  return {
    name: "snippets",
    trigger: { key },
    render: (props: PluginRenderProps) => (
      <div
        className={cls("popup")}
        style={{
          position: "absolute",
          top: props.position.top,
          left: props.position.left,
          zIndex: 1001,
        }}
        onMouseDown={e => e.preventDefault()}
      >
        <SnippetPicker snippets={snippets} {...props} />
      </div>
    ),
  };
}
