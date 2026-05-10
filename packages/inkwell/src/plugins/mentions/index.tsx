"use client";

import type { ReactNode } from "react";
import type { InkwellPlugin, PluginRenderProps } from "../../types";
import { PluginMenuPrimitive } from "../plugin-picker";

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

/**
 * Generic mentions plugin. Pick items from an async source and insert either
 * the expanded content (via `onSelect`) or a persisted marker `@<marker>[<id>]`.
 */
export function createMentionsPlugin<T extends MentionItem = MentionItem>(
  options: MentionsPluginOptions<T>,
): InkwellPlugin {
  const itemToText = (item: T): string =>
    options.onSelect
      ? options.onSelect(item)
      : `@${options.marker}[${item.id}]`;

  return {
    name: options.name,
    trigger: { key: options.trigger },
    render: (props: PluginRenderProps) => (
      <PluginMenuPrimitive<T>
        pluginName={options.name}
        placeholder="Search..."
        search={options.search}
        getKey={item => item.id}
        renderItem={options.renderItem}
        itemToText={itemToText}
        emptyMessage={options.emptyMessage ?? "No results"}
        {...props}
      />
    ),
  };
}
