---
title: "Creating custom plugins"
---

Plugins extend the editor with custom UI and behavior. Use a built-in plugin from the [Plugins overview](/docs/plugins) when one fits, or write your own with the `InkwellPlugin` API below.

## Plugin shape

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

## Basic example

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

## Activation

The `activation` field determines how a plugin activates. Trigger keys allow
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

## Render props

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

## Keyboard shortcuts

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

## Lifecycle

- Plugins mount and unmount with the editor
- Only one plugin can be active at a time
- Pressing `Escape` or clicking outside the editor dismisses the active
  plugin

## Example: simple slash-like trigger

For production slash command flows, prefer the built-in
[Slash Commands plugin](/docs/plugins/slash-commands). This example shows how a custom
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
