"use client";

import type { ReactNode } from "react";
import type { InkwellPlugin, PluginRenderProps, Snippet } from "../../types";
import { PluginMenuPrimitive, pluginPickerClass } from "../plugin-picker";

function renderSnippet(snippet: Snippet): ReactNode {
  return (
    <>
      <div className={pluginPickerClass.title}>{snippet.title}</div>
      <div className={pluginPickerClass.preview}>
        {snippet.content.length > 80
          ? `${snippet.content.slice(0, 80)}...`
          : snippet.content}
      </div>
    </>
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
      <PluginMenuPrimitive<Snippet>
        pluginName={name}
        items={snippets}
        getKey={snippet => snippet.title}
        renderItem={renderSnippet}
        itemToText={snippet => snippet.content}
        placeholder="Search snippets..."
        emptyMessage="No snippets found"
        {...props}
      />
    ),
  };
}
