---
title: "Emoji"
---

A searchable emoji picker. By default it opens when `:` is typed at a token
boundary (the start of the document, after whitespace, or after an opening
bracket/parenthesis). It intentionally stays closed for emoticons, URLs, and
prose such as `foo:bar`. It ships with a default emoji list exported as
`defaultEmojis`, and can accept your own emoji list or async search function.

```tsx
import { createEmojiPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

const emoji = createEmojiPlugin();

function App() {
  const [content, setContent] = useState("");
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[emoji]}
    />
  );
}
```

Custom emoji source:

```tsx
const emoji = createEmojiPlugin({
  emojis: [
    { emoji: "🚂", name: "train", tags: ["railway"] },
    { emoji: "🚀", name: "rocket", shortcodes: ["ship"] },
  ],
});
```

## Options

```tsx
type EmojiPluginOptions<T extends EmojiItem = EmojiItem> = {
  name?: string;
  trigger?: string;
  renderItem?: (item: T, active: boolean) => ReactNode;
  emptyMessage?: string;
} & EmojiSource<T>;

type EmojiSource<T extends EmojiItem> =
  // The default EmojiItem path can use Inkwell's default emoji list.
  | { emojis?: EmojiItem[]; search?: (query: string) => Promise<EmojiItem[]> | EmojiItem[] }
  // Custom item fields are preserved when you provide `emojis` or `search`.
  | { emojis: T[]; search?: (query: string) => Promise<T[]> | T[] }
  | { emojis?: T[]; search: (query: string) => Promise<T[]> | T[] };

// Custom item fields are preserved in `renderItem` when `emojis` or `search`
// provides the custom item type.
interface CustomEmoji extends EmojiItem {
  category: string;
}

const emoji = createEmojiPlugin<CustomEmoji>({
  emojis: [{ emoji: "🚂", name: "train", category: "transport" }],
  renderItem: item => <span>{item.category}: {item.emoji}</span>,
});
```
