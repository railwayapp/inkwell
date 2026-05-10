"use client";

import { type ReactNode, useCallback } from "react";
import { pluginClass } from "../../lib/class-names";
import type { InkwellPlugin, PluginRenderProps, Snippet } from "../../types";
import { PluginPicker } from "../plugin-picker";

const cls = pluginClass("snippets");

interface SnippetPickerProps extends PluginRenderProps {
  snippets: Snippet[];
  pluginName: string;
}

function SnippetPicker({
  snippets,
  pluginName,
  onSelect,
  onDismiss,
}: SnippetPickerProps): ReactNode {
  const renderItem = useCallback((snippet: Snippet) => {
    return (
      <>
        <div className={cls("title")}>{snippet.title}</div>
        <div className={cls("preview")}>
          {snippet.content.length > 80
            ? `${snippet.content.slice(0, 80)}...`
            : snippet.content}
        </div>
      </>
    );
  }, []);

  return (
    <PluginPicker
      pluginName={pluginName}
      className={cls("picker")}
      searchClassName={cls("search")}
      itemClassName={cls("item")}
      activeItemClassName={cls("item-active")}
      emptyClassName={cls("empty")}
      items={snippets}
      renderItem={renderItem}
      getKey={snippet => snippet.title}
      onSelect={snippet => onSelect(snippet.content)}
      onDismiss={onDismiss}
      placeholder="Search snippets..."
      emptyMessage="No snippets found"
      itemDataAttribute="data-snippet-item"
    />
  );
}

export function createSnippetsPlugin(options: {
  snippets: Snippet[];
  key?: string;
}): InkwellPlugin {
  const { snippets, key = "[" } = options;
  const name = "snippets";

  return {
    name,
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
        <SnippetPicker snippets={snippets} pluginName={name} {...props} />
      </div>
    ),
  };
}
