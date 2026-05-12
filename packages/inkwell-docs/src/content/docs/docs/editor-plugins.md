---
title: "Plugins"
---

Plugins extend the editor with custom UI and behavior. Inkwell ships built-in plugins for formatting, snippets, emoji, mentions, completions, slash commands, and attachments, and supports creating your own.

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

### Bubble menu option shape

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

## Snippets

A searchable picker for inserting predefined Markdown templates. Type a
trigger key to open the picker, then search by title.

```tsx
import { createSnippetsPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

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
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[snippets]}
    />
  );
}
```

The default trigger key is `[`. To change it:

```tsx
const snippets = createSnippetsPlugin({
  snippets: [...],
  trigger: "/",
});
```

Once the picker is open:

- Type in the editor to filter snippets by title; there is no separate search input
- `↑` / `↓` to navigate the list
- `Enter` to insert the selected snippet
- `Esc` to close without inserting

## Emoji

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

### Emoji options

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

## Completions

A generic completion plugin for suggested text flows. You provide the current Markdown completion, and Inkwell shows it through the editor placeholder while the document is empty. By default the placeholder is prefixed with `[tab ↹]`. Users press `Tab` to accept. `Escape` or normal typing calls `onDismiss`; clear your completion state there so `getCompletion()` returns `null`.

```tsx
import { createCompletionsPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("");
  const [completion, setCompletion] = useState<string | null>(
    "Welcome to Inkwell — Markdown stays readable and portable.",
  );
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[
        createCompletionsPlugin({
          getCompletion: () => completion,
          isLoading: () => false,
          loadingText: "Drafting a suggestion…",
          onAccept: () => setCompletion(null),
          onDismiss: () => setCompletion(null),
          onRestore: restored => setCompletion(restored),
        }),
      ]}
    />
  );
}
```

`getCompletion` should return `null` when no completion should be visible. The plugin itself checks whether the editor is empty, so `getCompletion` usually does not need to inspect the current content. The plugin does not fetch suggestions itself; connect it to your own completion source, cache, or streaming state.

Plugin objects are cheap to create. You can create plugins inline as shown above or memoize them with normal React dependencies; you do not need refs to avoid stale closures.

### Completion options

```tsx
interface CompletionsPluginOptions {
  name?: string;
  getCompletion: () => string | null;
  isLoading?: () => boolean;
  loadingText?: string;
  acceptHint?: string;
  onAccept?: (completion: string) => void;
  onDismiss?: (completion: string) => void;
  onRestore?: (completion: string) => void;
  restoreOnUndo?: boolean;
}
```

When `restoreOnUndo` is true (the default), undoing an accepted completion back to an empty document calls `onRestore(completion)`. Use that callback to put the completion back into your host state.

Completion placeholder text is source content text. `acceptHint` controls the prefix prepended to the placeholder text and defaults to `[tab ↹]`.

## Slash commands

A reusable chat-style command palette. The menu opens when `/` is typed on an
empty or whitespace-only line, then filters as the user types without a separate
search input. Selecting or executing a command removes only the introduced
command text, such as `/label Idea`, so unrelated prose stays intact. The plugin
supports one optional argument with choices, async choice loading, disabled
commands/choices, readiness reporting for Enter-to-submit, and structured
`onExecute` payloads.

```tsx
import {
  createSlashCommandsPlugin,
  InkwellEditor,
  type SlashCommandExecution,
} from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("");
  const handleCommand = (command: SlashCommandExecution) => {
    console.log("Execute command", command);
  };

  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[
        createSlashCommandsPlugin({
          commands: [
            {
              name: "label",
              description: "Apply a document label",
              arg: {
                name: "label",
                description: "Label to apply",
                  choices: [
                  { value: "idea", label: "Idea" },
                  { value: "bug", label: "Bug" },
                ],
              },
            },
          ],
          onExecute: handleCommand,
        }),
      ]}
    />
  );
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

The execution `args` object uses the singular `arg` name from the command
definition and the selected choice value. `submitOnEnter` / `onSubmit` remain
generic editor APIs for non-slash composer submission; slash command execution
should use `onExecute`. Use `onReadyChange` only when the host UI needs to know
whether the mounted slash menu is staged for execution.

## Mentions

A searchable picker for inserting persisted mention markers, such as users,
teams, tickets, or any other entity in your app. Type the trigger key to open
the picker, search, then press `Enter` to insert the active item.

```tsx
import { createMentionsPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

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
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[mentions]}
    />
  );
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
It also handles copied HTML `<img>` elements by inserting a block image for
each safe `src` directly; those HTML URLs are not uploaded through `onUpload`.
Safe image URLs are `http:`, `https:`, protocol-relative, relative paths,
`blob:`, or raster `data:image/png|jpeg|jpg|gif|webp`. Missing or unsafe
values such as `javascript:`, `file:`, `data:text/html`, or
`data:image/svg+xml` are ignored.

```tsx
import { createAttachmentsPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

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
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[attachments]}
    />
  );
}
```

While upload is pending, Inkwell inserts an image placeholder with the default
alt text `Uploading…`. When the promise resolves, the returned URL is validated
against the same safe image URL allowlist before it is stored. Safe URLs update
the placeholder and use either the returned `alt`, when provided, or the
original file name as alt text. If upload fails or returns an unsafe URL, the
placeholder is removed and `onError` is called.

### Attachment options

```tsx
type AttachmentUploadResult =
  | string
  | {
      url: string;
      alt?: string;
    };

interface AttachmentsPluginOptions {
  onUpload: (file: File) => Promise<AttachmentUploadResult>;
  accept?: string;
  uploadingPlaceholder?: (file: File) => string;
  onError?: (error: unknown, file: File) => void;
}
```

`accept` supports exact MIME types such as `image/png` and wildcards such as
`image/*`. Files that do not match are passed through to the editor's normal
paste/drop handling.

## Using multiple plugins

Pass an array to the `plugins` option. If you create plugin objects inside a
React component, memoize the array and plugin objects when possible so setup
plugins do not clean up and re-run on unrelated renders.

```tsx
return (
  <InkwellEditor
    content={content}
    onChange={setContent}
    plugins={[snippets, mentions, attachments, myCustomPlugin]}
  />
);
```

## Creating custom plugins

A plugin is an object that implements `InkwellPlugin`:

```tsx
interface InkwellPlugin {
  name: string;
  activation?:
    | { type: "always" }
    | { type: "trigger"; key: string }
    | { type: "manual" };
  render?: (props: PluginRenderProps) => ReactNode;
  getPlaceholder?: (
    editor: InkwellPluginEditor,
  ) => string | InkwellPluginPlaceholder | null;
  onEditorChange?: (editor: InkwellPluginEditor) => void;
  shouldTrigger?: (
    event: React.KeyboardEvent,
    ctx: PluginKeyDownContext,
  ) => boolean;
  onKeyDown?: (event: React.KeyboardEvent, ctx: PluginKeyDownContext) => void;
  onActiveKeyDown?: (
    event: React.KeyboardEvent,
    ctx: PluginKeyDownContext,
  ) => false | void;
  onInsertData?: (
    data: DataTransfer,
    ctx: PluginInsertDataContext,
  ) => boolean | void;
  setup?: (editor: InkwellPluginEditor) => void | (() => void);
}

interface PluginKeyDownContext {
  editor: InkwellPluginEditor;
  wrapSelection: (before: string, after: string) => void;
  activate: (options?: { query?: string }) => void;
  dismiss: () => void;
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
  activation: { type: "manual" },
  onKeyDown: (event, ctx) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      ctx.activate();
    }
  },
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

The `activation` field determines how a plugin activates. Trigger keys support
single keys and explicit modifier combos such as `Control+/`, `Meta+k`,
`Alt+x`, and `Shift+Enter`.

**Modifier combos** like `"Control+/"` or `"Meta+k"`:

- Prevents the default browser action
- Best for command palettes, search overlays, and similar UI

**Single characters** like `"["`, `":"`, or `"@"`:

- The character is typed into the editor first
- When the user selects via `onSelect`, the trigger character is
  automatically removed
- Best for inline pickers (snippets, emoji, mentions)

**Always active** (`activation: { type: "always" }`, or omit `activation`):

- The plugin is always rendered with `active: true`
- Best for persistent UI like status bars or word counts

**Manual activation** (`activation: { type: "manual" }`):

- The plugin renders only after it calls `ctx.activate()`
- Best for context-sensitive flows that are not driven by one trigger key

### Render props

Your `render` function receives these props:

| Prop                    | Type                                    | Description                                                                                                                       |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `active`                | `boolean`                               | Whether this plugin is active. Always-on plugins receive `true` every render.                                                     |
| `query`                 | `string`                                | Text typed since the trigger fired. Useful for filtering results.                                                                 |
| `position`              | `{ top, left }`                         | Cursor coordinates when the trigger fired. Use for positioning your UI.                                                           |
| `onSelect`              | `(text: string) => void`                | Insert content at the cursor. For character triggers, removes the trigger character first.                                       |
| `onDismiss`             | `() => void`                            | Deactivate the plugin and return focus to the editor.                                                                             |
| `wrapSelection`         | `(before, after) => void`               | Toggle Markdown markers around the current selection.                                                                             |
| `editorRef`             | `RefObject<HTMLDivElement \| null>`     | Ref to the editor's contenteditable element.                                                                                      |
| `editor`                | `InkwellPluginEditor`                   | Narrow editor controller for plugin actions.                                                                                      |
| `subscribeForwardedKey` | `SubscribeForwardedKey`                 | Subscribe to editor-forwarded ArrowUp/Down, Enter, Backspace, and printable keys while this plugin is active; returns cleanup.   |

### Keyboard shortcuts

Plugins can add keyboard shortcuts via `onKeyDown`. The handler fires
while the editor is focused and no other plugin is active.

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
- Only one plugin can be active at a time
- Pressing `Escape` or clicking outside the editor dismisses the active
  plugin

### Example: simple slash-like trigger

For production slash command flows, prefer the built-in
`createSlashCommandsPlugin` above. This example shows how a custom
single-character trigger can insert Markdown snippets.

````tsx
const slashCommands: InkwellPlugin = {
  name: "slash-commands",
  activation: { type: "trigger", key: "/" },
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
