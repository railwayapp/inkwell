"use client";

import { type ReactNode, useCallback } from "react";
import { pluginClass } from "../../lib/class-names";
import type { InkwellPlugin, PluginRenderProps } from "../../types";
import { PluginPicker } from "../plugin-picker";

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
  const commit = useCallback(
    (item: T) => {
      const text = options.onSelect
        ? options.onSelect(item)
        : `@${options.marker}[${item.id}]`;
      onSelect(text);
    },
    [onSelect, options],
  );

  return (
    <PluginPicker
      pluginName={options.name}
      className={cls("picker")}
      searchClassName={cls("search")}
      itemClassName={cls("item")}
      activeItemClassName={cls("item-active")}
      emptyClassName={cls("empty")}
      items={[]}
      search={options.search}
      renderItem={options.renderItem}
      getKey={item => item.id}
      onSelect={commit}
      onDismiss={onDismiss}
      emptyMessage={options.emptyMessage ?? "No results"}
    />
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
