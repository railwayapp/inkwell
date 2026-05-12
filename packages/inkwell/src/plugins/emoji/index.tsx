"use client";

import type { ReactNode } from "react";
import type { InkwellPlugin } from "../../types";
import { PluginMenuPrimitive, pluginPickerClass } from "../plugin-picker";

export interface EmojiItem {
  /** Emoji glyph inserted into the document. */
  emoji: string;
  /** Primary searchable name, without surrounding colons. */
  name: string;
  /** Optional aliases/shortcodes, without surrounding colons. */
  shortcodes?: string[];
  /** Optional searchable tags. */
  tags?: string[];
}

interface EmojiPluginBaseOptions<T extends EmojiItem> {
  name?: string;
  trigger?: string;
  renderItem?: (item: T, active: boolean) => ReactNode;
  emptyMessage?: string;
}

type IsExactEmojiItem<T extends EmojiItem> = EmojiItem extends T
  ? T extends EmojiItem
    ? true
    : false
  : false;

export type EmojiPluginOptions<T extends EmojiItem = EmojiItem> =
  EmojiPluginBaseOptions<T> &
    (IsExactEmojiItem<T> extends true
      ? {
          emojis?: T[];
          search?: (query: string) => Promise<T[]> | T[];
        }
      :
          | {
              emojis: T[];
              search?: (query: string) => Promise<T[]> | T[];
            }
          | {
              emojis?: T[];
              search: (query: string) => Promise<T[]> | T[];
            });

export const defaultEmojis: EmojiItem[] = [
  { emoji: "😀", name: "grinning", shortcodes: ["smile"], tags: ["happy"] },
  { emoji: "😄", name: "smile", shortcodes: ["smiley"], tags: ["happy"] },
  { emoji: "😂", name: "joy", shortcodes: ["laugh"], tags: ["tears"] },
  { emoji: "🤣", name: "rofl", shortcodes: ["rolling_on_the_floor_laughing"] },
  { emoji: "😊", name: "blush", shortcodes: ["smiling"] },
  { emoji: "🙂", name: "slight_smile", shortcodes: ["slightly_smiling_face"] },
  { emoji: "😉", name: "wink" },
  { emoji: "😍", name: "heart_eyes", tags: ["love"] },
  { emoji: "😘", name: "kissing_heart" },
  { emoji: "😎", name: "sunglasses", shortcodes: ["cool"] },
  { emoji: "🤔", name: "thinking", shortcodes: ["thinking_face"] },
  { emoji: "😕", name: "confused", shortcodes: ["slash"] },
  { emoji: "😭", name: "sob", tags: ["cry"] },
  { emoji: "😡", name: "rage", shortcodes: ["angry"] },
  { emoji: "👍", name: "thumbsup", shortcodes: ["+1", "like"] },
  { emoji: "👎", name: "thumbsdown", shortcodes: ["-1", "dislike"] },
  { emoji: "👏", name: "clap" },
  { emoji: "🙌", name: "raised_hands" },
  { emoji: "🙏", name: "pray", shortcodes: ["thanks"] },
  { emoji: "💪", name: "muscle", shortcodes: ["strong"] },
  { emoji: "👀", name: "eyes" },
  { emoji: "💯", name: "100" },
  { emoji: "🔥", name: "fire" },
  { emoji: "✨", name: "sparkles" },
  { emoji: "🎉", name: "tada", shortcodes: ["party"] },
  { emoji: "🚀", name: "rocket", tags: ["ship", "launch"] },
  { emoji: "✅", name: "white_check_mark", shortcodes: ["check", "done"] },
  { emoji: "❌", name: "x", shortcodes: ["cross"] },
  { emoji: "⚠️", name: "warning" },
  { emoji: "🚨", name: "rotating_light", shortcodes: ["alert"] },
  { emoji: "🐛", name: "bug" },
  { emoji: "💡", name: "bulb", shortcodes: ["idea"] },
  { emoji: "🧵", name: "yarn" },
  { emoji: "🛠️", name: "tools", shortcodes: ["wrench"] },
  { emoji: "📌", name: "pushpin", shortcodes: ["pin"] },
  { emoji: "📝", name: "memo", shortcodes: ["note"] },
  { emoji: "📎", name: "paperclip", shortcodes: ["attachment"] },
  { emoji: "🔒", name: "lock" },
  { emoji: "🔓", name: "unlock" },
  { emoji: "💬", name: "speech_balloon", shortcodes: ["comment"] },
  { emoji: "❤️", name: "heart", shortcodes: ["love"] },
  { emoji: "💔", name: "broken_heart" },
  { emoji: "☁️", name: "cloud" },
  { emoji: "🚂", name: "train", tags: ["railway"] },
];

const itemText = (emoji: EmojiItem): string =>
  [emoji.name, ...(emoji.shortcodes ?? []), ...(emoji.tags ?? [])].join(" ");

const defaultSearch = <T extends EmojiItem>(
  emojis: T[],
  query: string,
): T[] => {
  const q = query.toLowerCase();
  const slashQuery = q === "/" ? "confused" : q;
  return emojis
    .filter(
      emoji =>
        !slashQuery || itemText(emoji).toLowerCase().includes(slashQuery),
    )
    .slice(0, 20);
};

const DefaultEmojiItem = ({ item }: { item: EmojiItem }) => (
  <>
    <span aria-hidden="true">{item.emoji}</span>
    <span className={pluginPickerClass.title}>:{item.name}:</span>
    {item.shortcodes?.[0] ? (
      <span className={pluginPickerClass.subtitle}>:{item.shortcodes[0]}:</span>
    ) : null}
  </>
);

export function createEmojiPlugin<T extends EmojiItem>(
  options: EmojiPluginOptions<T>,
): InkwellPlugin;
export function createEmojiPlugin(options?: EmojiPluginOptions): InkwellPlugin;
export function createEmojiPlugin({
  name = "emoji",
  trigger = ":",
  emojis,
  search,
  renderItem,
  emptyMessage = "No emoji found",
}: EmojiPluginOptions = {}): InkwellPlugin {
  const resolvedEmojis = emojis ?? defaultEmojis;
  return {
    name,
    shouldTrigger: (event, { editor }) => {
      if (
        event.key !== trigger ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return false;
      }

      const beforeCursor = editor.getContentBeforeCursor();
      if (beforeCursor === null) return false;
      const previous = beforeCursor.at(-1) ?? "";

      // Open at token boundaries only. This keeps the plugin out of the way
      // for emoticons and punctuation-heavy prose (`:)`, `http://`, `foo:bar`).
      return previous === "" || /\s|[([{]/.test(previous);
    },
    activation: { type: "trigger", key: trigger },
    onActiveKeyDown: event => {
      if (event.key.length !== 1) return;
      if (/[\p{L}\p{N}_+-]/u.test(event.key)) return;
      return false;
    },
    render: props => {
      if (!props.active) return null;
      return (
        <PluginMenuPrimitive<EmojiItem>
          {...props}
          pluginName={name}
          items={search ? undefined : emojis}
          search={search ?? (query => defaultSearch(resolvedEmojis, query))}
          getKey={item => item.name}
          renderItem={
            renderItem ?? ((item, _active) => <DefaultEmojiItem item={item} />)
          }
          itemToText={item => item.emoji}
          placeholder="Search emoji..."
          emptyMessage={emptyMessage}
        />
      );
    },
  };
}
