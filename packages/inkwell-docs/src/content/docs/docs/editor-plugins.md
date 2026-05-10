---
title: "Plugins"
---

Plugins extend the editor with custom UI and behavior. Inkwell ships built-in plugins for formatting, snippets, mentions, and attachments, and supports creating your own.

## Bubble Menu

A floating toolbar that appears when you select text. Included by default
with bold, italic, and strikethrough buttons.

To customize the items, create a new instance with
`createBubbleMenuPlugin` and pass it via the `plugins` option. Disable the
built-in one with `bubbleMenu: false` to avoid duplicates:

```tsx
import {
  createBubbleMenuPlugin,
  defaultBubbleMenuItems,
  useInkwell,
} from "@railway/inkwell";

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
  const { EditorInstance } = useInkwell({
    content,
    onChange: setContent,
    bubbleMenu: false,
    plugins: [customBubbleMenu],
  });

  return <EditorInstance />;
}
```

Each item receives `{ wrapSelection }` as props. Call
`wrapSelection(before, after)` to toggle Markdown markers around the
selected text. If the selection is already wrapped with those markers,
it removes them instead.

Items can include an optional `shortcut` (a single key, automatically
paired with Cmd/Ctrl) and an `onShortcut` handler for keyboard
activation.

### Bubble menu item shape

```tsx
interface BubbleMenuItem {
  key: string;
  shortcut?: string;
  onShortcut?: (wrapSelection: (before: string, after: string) => void) => void;
  render: (props: {
    wrapSelection: (before: string, after: string) => void;
  }) => ReactNode;
}
```

## Snippets

A searchable picker for inserting predefined Markdown templates. Type a
trigger key to open the picker, then search by title.

```tsx
import { createSnippetsPlugin, useInkwell } from "@railway/inkwell";

const snippets = createSnippetsPlugin({
  snippets: [
    {
      title: "Bug Report",
      content:
        "## Bug Report\n\n**Description:**\n\n**Steps to reproduce:**\n1. \n2. \n3. \n",
    },
    {
      title: "Meeting Notes",
      content:
        "## Meeting Notes\n\n**Date:**\n**Attendees:**\n\n### Action Items\n\n- [ ] \n",
    },
  ],
});

function App() {
  const [content, setContent] = useState("");
  const { EditorInstance } = useInkwell({
    content,
    onChange: setContent,
    plugins: [snippets],
  });

  return <EditorInstance />;
}
```

The default trigger key is `[`. To change it:

```tsx
const snippets = createSnippetsPlugin({
  snippets: [...],
  key: "/",
});
```

Once the picker is open:

- Type to filter snippets by title
- `↑` / `↓` to navigate the list
- `Enter` to insert the selected snippet
- `Esc` to close without inserting

## Mentions

A searchable picker for inserting persisted mention markers, such as users,
teams, tickets, or any other entity in your app. Type the trigger key to open
the picker, search, then press `Enter` to insert the active item.

```tsx
import { createMentionsPlugin, useInkwell } from "@railway/inkwell";

type UserMention = {
  id: string;
  title: string;
  username: string;
};

const users: UserMention[] = [
  { id: "usr_1", title: "Ada Lovelace", username: "ada" },
  { id: "usr_2", title: "Grace Hopper", username: "grace" },
];

const mentions = createMentionsPlugin<UserMention>({
  name: "users",
  trigger: "@",
  marker: "user",
  search: query =>
    users.filter(user =>
      user.title.toLowerCase().includes(query.toLowerCase()),
    ),
  renderItem: (user, active) => (
    <div className={active ? "mention-active" : undefined}>
      <strong>{user.title}</strong> @{user.username}
    </div>
  ),
  emptyMessage: "No users found",
});

function App() {
  const [content, setContent] = useState("");
  const { EditorInstance } = useInkwell({
    content,
    onChange: setContent,
    plugins: [mentions],
  });

  return <EditorInstance />;
}
```

By default, selecting an item inserts a marker in this form:

```md
@user[usr_1]
```

Use `onSelect` when you want to insert a different string:

```tsx
const mentions = createMentionsPlugin<UserMention>({
  name: "users",
  trigger: "@",
  marker: "user",
  search,
  renderItem,
  onSelect: user => `@${user.username}`,
});
```

Once the picker is open:

- Type to filter items using your `search` callback
- `↑` / `↓` to navigate the list
- `Enter` to insert the selected item
- `Esc` to close without inserting

### Rendering mention markers

`InkwellRenderer` can hydrate mention markers into custom React components via
the `mentions` prop:

```tsx
import { InkwellRenderer } from "@railway/inkwell";

const mentionRenderers = {
  user: ({ id }: { id: string }) => <a href={`/users/${id}`}>@{id}</a>,
};

function Preview({ content }: { content: string }) {
  return <InkwellRenderer content={content} mentions={mentionRenderers} />;
}
```

## Attachments

The attachments plugin intercepts pasted or dropped files, uploads each file
with your `onUpload` callback, and inserts an image block into the Markdown.
It also handles copied HTML images by inserting their `src` URL directly.

```tsx
import { createAttachmentsPlugin, useInkwell } from "@railway/inkwell";

const attachments = createAttachmentsPlugin({
  accept: "image/*",
  onUpload: async file => {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/uploads", {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("Upload failed");

    const { url } = (await res.json()) as { url: string };
    return url;
  },
  onError: (error, file) => {
    console.error("Failed to upload", file.name, error);
  },
});

function App() {
  const [content, setContent] = useState("");
  const { EditorInstance } = useInkwell({
    content,
    onChange: setContent,
    plugins: [attachments],
  });

  return <EditorInstance />;
}
```

While upload is pending, Inkwell inserts an image placeholder with the default
alt text `Uploading…`. When the promise resolves, the placeholder is updated to
use the returned URL and the original file name as alt text. If upload fails,
the placeholder is removed and `onError` is called.

### Attachment options

```tsx
interface AttachmentsPluginOptions {
  onUpload: (file: File) => Promise<string>;
  accept?: string;
  uploadingPlaceholder?: (file: File) => string;
  onError?: (error: unknown, file: File) => void;
}
```

`accept` supports exact MIME types such as `image/png` and wildcards such as
`image/*`. Files that do not match are passed through to the editor's normal
paste/drop handling.

## Using multiple plugins

Pass an array to the `plugins` option:

```tsx
const { EditorInstance } = useInkwell({
  content,
  onChange: setContent,
  plugins: [snippets, mentions, attachments, myCustomPlugin],
});

return <EditorInstance />;
```

## Creating custom plugins

A plugin is an object that implements `InkwellPlugin`:

```tsx
interface InkwellPlugin {
  name: string;
  trigger?: { key: string };
  render: (props: PluginRenderProps) => ReactNode;
  onKeyDown?: (
    event: React.KeyboardEvent,
    ctx: { wrapSelection: (before: string, after: string) => void },
  ) => void;
}
```

### Basic example

Here's a command palette that opens with `Ctrl+K`:

````tsx
import type { InkwellPlugin } from "@railway/inkwell";

const commandPalette: InkwellPlugin = {
  name: "command-palette",
  trigger: { key: "Control+k" },
  render: ({ active, query, onSelect, onDismiss, position }) => {
    if (!active) return null;

    const commands = [
      { label: "Heading", md: "## " },
      { label: "Bullet list", md: "- " },
      { label: "Code block", md: "```\n\n```" },
    ].filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

    return (
      <div
        style={{
          position: "absolute",
          top: position.top + 24,
          left: position.left,
        }}
      >
        {commands.map((cmd) => (
          <button key={cmd.label} onClick={() => onSelect(cmd.md)}>
            {cmd.label}
          </button>
        ))}
        <button onClick={onDismiss}>Cancel</button>
      </div>
    );
  },
};
````

### Triggers

The `trigger` field determines how a plugin activates. It uses
[tinykeys](https://github.com/jamiebuilds/tinykeys)-style key strings.

**Modifier combos** like `"Control+/"` or `"Meta+k"`:

- Prevents the default browser action
- Best for command palettes, search overlays, and similar UI

**Single characters** like `"["`, `"@"`, or `"/"`:

- The character is typed into the editor first
- When the user selects via `onSelect`, the trigger character is
  automatically removed
- Best for inline pickers (mentions, snippets, slash commands)

**No trigger** (omit the field entirely):

- The plugin is always rendered with `active: true`
- Best for persistent UI like status bars or word counts

### Render props

Your `render` function receives these props:

| Prop            | Type                                | Description                                                                                 |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `active`        | `boolean`                           | Whether the trigger has fired. Always `true` for plugins without triggers.                  |
| `query`         | `string`                            | Text typed since the trigger fired. Useful for filtering results.                           |
| `position`      | `{ top, left }`                     | Cursor coordinates when the trigger fired. Use for positioning your UI.                     |
| `onSelect`      | `(text: string) => void`            | Insert Markdown at the cursor. For character triggers, removes the trigger character first. |
| `onDismiss`     | `() => void`                        | Deactivate the plugin and return focus to the editor.                                       |
| `wrapSelection` | `(before, after) => void`           | Toggle Markdown markers around the current selection.                                       |
| `editorRef`     | `RefObject<HTMLDivElement \| null>` | Ref to the editor's contenteditable element.                                                |

### Keyboard shortcuts

Plugins can add keyboard shortcuts via `onKeyDown`. The handler fires
while the editor is focused and no other triggered plugin is active.

```tsx
const highlightShortcut: InkwellPlugin = {
  name: "highlight-shortcut",
  render: () => null,
  onKeyDown: (event, { wrapSelection }) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "h") {
      event.preventDefault();
      wrapSelection("==", "==");
    }
  },
};
```

Call `event.preventDefault()` to stop the key from propagating further.
The built-in bubble menu uses this same mechanism for its `⌘B` / `⌘I` /
`⌘D` shortcuts.

### Lifecycle

- Plugins mount and unmount with the editor
- Only one triggered plugin can be active at a time
- Pressing `Escape` or clicking outside the editor dismisses the active
  plugin

### Example: slash commands

````tsx
const slashCommands: InkwellPlugin = {
  name: "slash-commands",
  trigger: { key: "/" },
  render: ({ active, query, onSelect, onDismiss, position }) => {
    if (!active) return null;

    const commands = [
      { label: "Heading", md: "## " },
      { label: "Bullet list", md: "- " },
      { label: "Code block", md: "```\n\n```" },
    ].filter((c) => c.label.toLowerCase().includes(query.toLowerCase()));

    return (
      <div
        style={{ position: "absolute", top: position.top, left: position.left }}
      >
        {commands.map((cmd) => (
          <button key={cmd.label} onClick={() => onSelect(cmd.md)}>
            {cmd.label}
          </button>
        ))}
        <button onClick={onDismiss}>Cancel</button>
      </div>
    );
  },
};
````
