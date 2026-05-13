---
title: "Plugins"
---

Plugins extend the editor with custom UI and behavior. Inkwell ships built-in plugins for formatting, snippets, emoji, mentions, completions, slash commands, and attachments, and lets you create your own.

## Built-in plugins

- [Bubble Menu](/docs/plugins/bubble-menu) — floating formatting toolbar shown when text is selected
- [Snippets](/docs/plugins/snippets) — searchable palette of reusable Markdown blocks
- [Emoji](/docs/plugins/emoji) — searchable emoji picker triggered by colon shortcodes
- [Completions](/docs/plugins/completions) — placeholder completions for suggested text flows
- [Slash Commands](/docs/plugins/slash-commands) — chat-style command palette with structured arguments
- [Mentions](/docs/plugins/mentions) — searchable user picker that inserts a chip marker
- [Attachments](/docs/plugins/attachments) — paste or drop images to upload and insert
- [Character Limit](/docs/plugins/character-limit) — optional toast UI for the editor's character-limit feature

## Build your own

See [Custom plugins](/docs/custom-plugins) for the `InkwellPlugin` shape, activation modes, render props, and full examples.

## Using multiple plugins

Pass an array to the `plugins` prop. If you create plugin objects inside a React component, memoize the array and the plugin objects so setup plugins do not clean up and re-run on unrelated renders.

```tsx
return (
  <InkwellEditor
    content={content}
    onChange={setContent}
    plugins={[snippets, mentions, attachments, myCustomPlugin]}
  />
);
```
