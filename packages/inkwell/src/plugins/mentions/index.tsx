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
  /** Unique plugin name. Defaults to `mentions`. */
  name?: string;
  /** Key that opens the picker. Defaults to `@`. */
  trigger?: string;
  /**
   * Persisted marker name used when `onSelect` is not provided. Produces
   * `@<marker>[<id>]` in the document. Defaults to `mention`.
   */
  marker?: string;
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
  const name = options.name ?? "mentions";
  const trigger = options.trigger ?? "@";
  const marker = options.marker ?? "mention";
  const itemToText = (item: T): string =>
    options.onSelect ? options.onSelect(item) : `@${marker}[${item.id}]`;

  return {
    name,
    activation: { type: "trigger", key: trigger },
    // Dismiss the picker when the user types whitespace or punctuation —
    // matches the emoji plugin so `@john<space>` flows back into the
    // document instead of growing the query indefinitely.
    onActiveKeyDown: event => {
      if (event.key.length !== 1) return;
      if (/[\p{L}\p{N}_-]/u.test(event.key)) return;
      return false;
    },
    render: (props: PluginRenderProps) => (
      <PluginMenuPrimitive<T>
        pluginName={name}
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
