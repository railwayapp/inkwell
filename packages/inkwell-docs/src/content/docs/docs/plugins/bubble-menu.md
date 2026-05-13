---
title: "Bubble Menu"
---

A floating toolbar that appears when you select text. Included by default
with bold, italic, and strikethrough buttons.

To customize the items, create a new instance with
`createBubbleMenuPlugin` and pass it via the `plugins` option. Disable the
built-in one with `bubbleMenu: false` to avoid duplicates:

```tsx
import {
  createBubbleMenuPlugin,
  defaultBubbleMenuItems,
  InkwellEditor,
} from "@railway/inkwell";
import { useState } from "react";

const customBubbleMenu = createBubbleMenuPlugin({
  items: [
    ...defaultBubbleMenuItems,
    {
      key: "code",
      shortcut: "e",
      onShortcut: (wrap) => wrap("`", "`"),
      render: ({ wrapSelection }) => (
        <button
          className="inkwell-plugin-bubble-menu-btn"
          onClick={() => wrapSelection("`", "`")}
        >
          &lt;/&gt;
        </button>
      ),
    },
  ],
});

function App() {
  const [content, setContent] = useState("");
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      bubbleMenu={false}
      plugins={[customBubbleMenu]}
    />
  );
}
```

Each item receives `{ wrapSelection }` as props. Call
`wrapSelection(before, after)` to toggle Markdown markers around the
selected text. If the selection is already wrapped with those markers,
it removes them instead.

Items can include an optional `shortcut` (a single key, automatically
paired with Cmd/Ctrl) and an `onShortcut` handler for keyboard
activation.

## Options

```tsx
interface BubbleMenuOptions {
  items?: BubbleMenuItem[];
}

interface BubbleMenuItem {
  key: string;
  shortcut?: string;
  onShortcut?: (wrapSelection: (before: string, after: string) => void) => void;
  render: (props: {
    wrapSelection: (before: string, after: string) => void;
  }) => ReactNode;
}
```

`BubbleMenuOptions` is exported for callers that build their bubble menu
configuration outside the `createBubbleMenuPlugin()` call.
