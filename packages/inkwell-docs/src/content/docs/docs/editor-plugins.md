---
title: "Plugins"
---

Plugins extend the editor with custom UI and behavior. Inkwell ships built-in plugins for formatting, snippets, mentions, completions, slash commands, and attachments, and supports creating your own.

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

- Type in the editor to filter snippets by title; there is no separate search input
- `↑` / `↓` to navigate the list
- `Enter` to insert the selected snippet
- `Esc` to close without inserting

## Emoji

A searchable emoji picker triggered by `:`. It ships with a small default set
and can accept your own emoji list or async search function.

```tsx
import { createEmojiPlugin, useInkwell } from "@railway/inkwell";

const emoji = createEmojiPlugin();

function App() {
  const [content, setContent] = useState("");
  const { EditorInstance } = useInkwell({
    content,
    onChange: setContent,
    plugins: [emoji],
  });

  return <EditorInstance />;
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

## Completions

A generic completion plugin for suggested text flows. You provide the current Markdown completion, and Inkwell shows it through the editor placeholder while the document is empty. By default the placeholder is prefixed with `[tab ↹]`. Users press `Tab` to accept, `Escape` to dismiss, or type normally to dismiss and continue writing.

```tsx
import { createCompletionsPlugin, useInkwell } from "@railway/inkwell";

function App() {
  const [content, setContent] = useState("");
  const [completion, setCompletion] = useState<string | null>(
    "Welcome to Inkwell — Markdown stays readable and portable.",
  );
  const { EditorInstance } = useInkwell({
    content,
    onChange: setContent,
    plugins: [
      createCompletionsPlugin({
        getCompletion: () => completion,
        isLoading: () => false,
        loadingText: "Drafting a suggestion…",
        onAccept: () => setCompletion(null),
        onDismiss: () => setCompletion(null),
        onRestore: restored => setCompletion(restored),
      }),
    ],
  });

  return <EditorInstance />;
}
```

`getCompletion` should return `null` when no completion should be visible. The plugin itself checks whether the editor is empty, so `getCompletion` usually does not need to inspect the current content. The plugin does not fetch suggestions itself; connect it to your own completion source, cache, or streaming state.

Plugin objects are cheap to create. You can create plugins inline as shown above or memoize them with normal React dependencies; you do not need refs to avoid stale closures.

### Completion options

```tsx
interface CompletionPluginOptions {
  name?: string;
  getCompletion: () => string | null;
  isLoading?: () => boolean;
  loadingText?: string;
  acceptHint?: string;
  onAccept?: (completion: string) => void;
  onDismiss?: (completion: string) => void;
  onRestore?: (completion: string) => void;
  restoreOnUndo?: boolean;
  rehypePlugins?: RehypePluginConfig[];
}
```

When `restoreOnUndo` is true (the default), undoing an accepted completion back to an empty document calls `onRestore(completion)`. Use that callback to put the completion back into your host state.

Completion placeholder text is plain text. `acceptHint` controls the prefix prepended to the placeholder text and defaults to `[tab ↹]`. `rehypePlugins` is kept for API compatibility; native placeholders cannot render rich Markdown.

When a completion placeholder is active, Inkwell normalizes an otherwise empty editor to a single plain paragraph. This prevents placeholders from inheriting stale heading, code, list, or blockquote styles after the user clears existing content.

## Slash commands

A reusable chat-style command palette. The menu opens when `/` is typed
with no prose between the start of the current line and the caret — so
it fires on a blank line, after a newline, and at the very start of an
existing line, but never in the middle of prose. The plugin keeps the
command UI inside Inkwell, supports required first-argument choices,
async choice loading, disabled commands/choices, reports when the
command is ready for Enter-to-submit, and can emit a structured command
payload via `onExecute`. Slash commands are intentionally Discord-style:
`/` after prose does not open the menu, typing after `/` filters the
menu without a dedicated search input, and selecting/executing a
command only removes the slash-command text that was introduced (for
example, `/label Idea`) rather than clearing the whole editor.

```tsx
import { createSlashCommandsPlugin, useInkwell } from "@railway/inkwell";

function App() {
  const [content, setContent] = useState("");

  const { EditorInstance } = useInkwell({
    content,
    onChange: setContent,
    plugins: [
      createSlashCommandsPlugin({
        commands: [
          {
            name: "label",
            description: "Apply a document label",
            args: [
              {
                name: "label",
                description: "Label to apply",
                required: true,
                choices: [
                  { value: "idea", label: "Idea" },
                  { value: "bug", label: "Bug" },
                ],
              },
            ],
          },
        ],
        onExecute: command => runCommand(command),
      }),
    ],
  });

  return <EditorInstance />;
}
```

When ready, Enter calls `onExecute` with a string-only structured payload and
then clears only the active command line; the rest of the document is preserved.
For `/label Idea`, the payload is:

```ts
{
  name: "label",
  args: { label: "idea" },
  raw: "/label Idea",
}
```

The `args` object uses argument names from the command definition and string
values from selected choices. `submitOnEnter` / `onSubmit` remain generic editor
APIs for non-slash composer submission; slash command execution should use
`onExecute`. Use `onReadyChange` only when the host UI needs to know whether a
slash command is staged for execution.

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

`InkwellRenderer` can hydrate persisted mention markers (e.g.
`@user[<id>]`) into custom React components via the `mentions` prop.
It accepts an array of `MentionRenderer` entries; each entry pairs a
regex with a `resolve` callback that maps a `RegExpExecArray` match to
a React node:

```tsx
import { InkwellRenderer, type MentionRenderer } from "@railway/inkwell";

const mentionRenderers: MentionRenderer[] = [
  {
    pattern: /@user\[([a-z0-9-]+)\]/g,
    resolve: match => {
      const id = match[1];
      return <a href={`/users/${id}`}>@{id}</a>;
    },
  },
];

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
  // When true, only render while this plugin is the active one. Plugins
  // with a `trigger` are activatable by default; non-trigger plugins
  // that claim activation through `ctx.setActivePlugin` (e.g. slash
  // commands) must set this explicitly.
  activatable?: boolean;
  render: (props: PluginRenderProps) => ReactNode;
  getPlaceholder?: (editor: Editor) => string | InkwellPluginPlaceholder | null;
  onEditorChange?: (editor: Editor) => void;
  shouldTrigger?: (event: React.KeyboardEvent, editor: Editor) => boolean;
  onKeyDown?: (
    event: React.KeyboardEvent,
    ctx: PluginKeyDownContext,
    editor: Editor,
  ) => void;
  onActiveKeyDown?: (
    event: React.KeyboardEvent,
    ctx: PluginKeyDownContext & { dismiss: () => void },
    editor: Editor,
  ) => false | void;
  setup?: (editor: Editor) => void | (() => void);
}

interface PluginKeyDownContext {
  wrapSelection: (before: string, after: string) => void;
  // Claim or release editor activation imperatively. Used by plugins
  // (e.g. slash commands) that activate from context rather than from a
  // single character trigger.
  setActivePlugin: (
    plugin: { name: string; query?: string } | null,
  ) => void;
}

interface InkwellPluginPlaceholder {
  text: string;
  hint?: string;
}
```

Plugins also receive a `subscribeForwardedKey` callback through
`PluginRenderProps`. While a plugin is the active one, the editor forwards
navigation keys (ArrowUp/Down, Enter, Backspace) and typed printable
characters to all subscribers. The channel is scoped per editor instance,
so two editors on the same page do not cross-talk.

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
