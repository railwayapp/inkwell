---
title: "Styling"
---

Inkwell ships default editor, plugin, and renderer styles. Import them once in your app entry point:

```tsx
import "@railway/inkwell/styles.css";
```

The defaults are intentionally easy to override: every element also gets a stable CSS class, so you still have full control over the look and feel of both the editor and the rendered output.

## Sizing the editor

Inkwell ships no `min-height`, `max-height`, or `height` default on the
editor surface. The right container size depends on where the editor lives —
a chat composer wants to size to its content, a full-page editor wants to
fill the viewport, a panel just wants to fill its container. Set the size
you want on `styles.editor` or via your own class:

```tsx
// Fixed minimum height
<InkwellEditor styles={{ editor: { minHeight: 200 } }} />

// Chat-style composer that grows with content
<InkwellEditor
  classNames={{ editor: "chat-composer" }}
  styles={{ editor: { maxHeight: 160, overflowY: "auto" } }}
/>
```

## Overriding the layout defaults

The visual-chrome defaults that Inkwell does ship (padding, border,
border-radius, background, font-size, line-height, transition) are all
wrapped in `:where()` so they carry zero specificity. Any single-class
consumer rule wins automatically — no `!important`, no descendant scoping:

```tsx
// Tailwind utility classes Just Work
<InkwellEditor classNames={{ editor: "border-0 bg-transparent px-3 py-2" }} />
```

The same applies to `.inkwell-renderer` (font-size, line-height).

## Component props

Both `<InkwellEditor />` and `<InkwellRenderer />` accept props that let you attach classes and inline styles without writing a global stylesheet.

### Editor

| Prop | Type | Applied to |
|------|------|------------|
| `className` | `string` | The root wrapper. Alias for `classNames.root`. |
| `classNames.root` | `string` | The root wrapper (`.inkwell-editor-wrapper`). |
| `classNames.editor` | `string` | The editable surface (`.inkwell-editor`). |
| `styles.root` | `CSSProperties` | Inline styles on the root wrapper. |
| `styles.editor` | `CSSProperties` | Inline styles on the editable surface. |

There is no top-level `style` prop — use `styles.root` or `styles.editor` to be explicit about which slot the inline styles target.

```tsx
<InkwellEditor
  content={content}
  onChange={setContent}
  className="my-editor"
  classNames={{ editor: "my-editor-surface" }}
  styles={{ editor: { minHeight: 320, padding: "1.5rem" } }}
/>
```

### Renderer

| Prop | Type | Applied to |
|------|------|------------|
| `className` | `string` | The renderer wrapper (`.inkwell-renderer`). |

```tsx
<InkwellRenderer content={content} className="prose" />
```

## Editor

### Container

| Selector | Element |
|----------|---------|
| `.inkwell-editor-wrapper` | Outer wrapper (contains editor and plugin UI) |
| `.inkwell-editor` | The contenteditable editing area |

### Block elements

Each block-level element renders with a CSS class:

| Selector | Element |
|----------|---------|
| `.inkwell-editor-heading` | All headings (always combined with a level class below) |
| `.inkwell-editor-heading-1` through `-heading-6` | Specific heading level |
| `.inkwell-editor-blockquote` | Blockquotes |
| `.inkwell-editor-image` | Block image wrapper (`data-selected` when selected) |
| `.inkwell-editor-code-fence` | Code fence delimiter lines |
| `.inkwell-editor-code-line` | Lines inside a fenced code block |

### Inline formatting

Standard HTML elements are used for inline marks:

| Element | Formatting |
|---------|------------|
| `strong` | Bold text |
| `em` | Italic text |
| `del` | Strikethrough text |
| `code` | Inline code |

Target these within the editor: `.inkwell-editor strong`,
`.inkwell-editor code`, etc.

### Syntax markers

The raw Markdown characters (`**`, `_`, `` ` ``, `~~`) are wrapped in
spans you can style separately — useful for dimming or hiding them:

| Selector | Characters |
|----------|------------|
| `.inkwell-editor-marker` | General syntax markers |
| `.inkwell-editor-backtick` | Backtick characters |

### Remote cursors


| Selector | Element |
|----------|---------|

The cursor color is applied inline from `user.color`, so your CSS only
needs to handle positioning and opacity.

### Character limit

`characterLimit` is a soft budget — typing past it is allowed. When a limit is configured the editor renders a small `count / limit` readout in the bottom-right of the wrapper and flags the over-limit state with a wrapper class.

| Selector | Element |
|----------|---------|
| `.inkwell-editor-character-count` | The `count / limit` readout. Muted gray by default. |
| `.inkwell-editor-character-count.inkwell-editor-character-count-over` | The readout when the count exceeds the limit. Red by default. |
| `.inkwell-editor-wrapper.inkwell-editor-has-character-limit` | The wrapper while any `characterLimit` is configured. The bundled stylesheet reserves bottom-right editor padding for the count. |
| `.inkwell-editor-wrapper.inkwell-editor-over-limit` | The wrapper while `characterCount > characterLimit`. The bundled stylesheet paints a red border on the editor surface; override or extend as you like. |

## Renderer

The renderer wraps output in `<div class="inkwell-renderer">`. Inside,
standard HTML elements are used: `h1`–`h6`, `p`, `blockquote`, `ul`,
`ol`, `li`, `pre`, `code`, `a`, `strong`, `em`, `del`, `hr`, `img`.
GFM table syntax is rendered as source text rather than `<table>` elements.

Target them with descendant selectors:

```css
.inkwell-renderer h1 { }
.inkwell-renderer blockquote { }
.inkwell-renderer pre code { }
```

### Code block copy button

Fenced code blocks are wrapped with a container and a copy button:

| Selector | Element |
|----------|---------|
| `.inkwell-renderer-code-block` | Wrapper around each `<pre>` |
| `.inkwell-renderer-copy-btn` | The copy button (appears on hover) |

## Plugins

### Bubble menu

| Selector | Element |
|----------|---------|
| `.inkwell-plugin-bubble-menu-container` | Positioned container |
| `.inkwell-plugin-bubble-menu-inner` | Inner flex wrapper |
| `.inkwell-plugin-bubble-menu-btn` | Button |
| `.inkwell-plugin-bubble-menu-item-bold` | Bold button label |
| `.inkwell-plugin-bubble-menu-item-italic` | Italic button label |
| `.inkwell-plugin-bubble-menu-item-strike` | Strikethrough button label |

### Completions

Completions use the editor's native placeholder. Style completion text with your existing placeholder styles on `.inkwell-editor [data-slate-placeholder="true"]`. The accept hint is part of the placeholder text itself, for example `[tab ↹] Suggested text`; there is no separate completion hint element.

### Plugin picker (snippets, emoji, mentions, etc.)

All picker-based plugins share a single set of classes so the menu UI
is consistent regardless of which plugin opened it.

| Selector | Element |
|----------|---------|
| `.inkwell-plugin-picker-popup` | Positioned container |
| `.inkwell-plugin-picker` | Picker wrapper |
| `.inkwell-plugin-picker-search` | Inline query display (characters typed after the trigger) |
| `.inkwell-plugin-picker-item` | Item row |
| `.inkwell-plugin-picker-item-active` | Highlighted row |
| `.inkwell-plugin-picker-title` | Item title |
| `.inkwell-plugin-picker-subtitle` | Item subtitle |
| `.inkwell-plugin-picker-preview` | Item preview text |
| `.inkwell-plugin-picker-empty` | Empty state message |

## Code highlighting

Syntax highlighting in code blocks uses highlight.js by default. Import
a highlight.js theme for colors to appear:

```tsx
import "highlight.js/styles/github-dark.css";
```

If you use a different highlighter via `rehypePlugins`, import that
highlighter's CSS instead.

## Example stylesheet

A complete stylesheet to get started with. Adjust the values to match
your design system.

```css
/* ── Editor ── */

.inkwell-editor {
  min-height: 200px;
  padding: 1.5rem;
  outline: none;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
  color: #1a1a1a;
  font-size: 1rem;
  line-height: 1.7;
  transition: border-color 0.15s ease;
}

.inkwell-editor:focus-within {
  border-color: #6366f1;
}

/* Inline formatting */
.inkwell-editor strong { font-weight: 700; }
.inkwell-editor em { font-style: italic; }
.inkwell-editor del { text-decoration: line-through; color: #9ca3af; }
.inkwell-editor code {
  background: #f3f4f6;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-size: 0.85em;
}

/* Block elements */
.inkwell-editor-heading { font-weight: 700; line-height: 1.3; }
.inkwell-editor-heading-1 { font-size: 2em; }
.inkwell-editor-heading-2 { font-size: 1.5em; }
.inkwell-editor-heading-3 { font-size: 1.25em; }

.inkwell-editor-blockquote {
  border-left: 3px solid #d1d5db;
  padding-left: 1em;
  color: #6b7280;
}


.inkwell-editor-image {
  margin: 0.75em 0;
  border-radius: 8px;
  overflow: hidden;
}
.inkwell-editor-image[data-selected] { outline: 2px solid #6366f1; }
.inkwell-editor-image img { display: block; max-width: 100%; height: auto; }

.inkwell-editor-code-fence { color: #9ca3af; }
.inkwell-editor-code-line {
  font-family: ui-monospace, monospace;
  font-size: 14px;
  white-space: pre-wrap;
}

/* Dim Markdown syntax characters */
.inkwell-editor-marker,
.inkwell-editor-backtick {
  color: #d1d5db;
}

/* ── Renderer ── */

.inkwell-renderer { font-size: 1rem; line-height: 1.7; }
.inkwell-renderer :first-child { margin-top: 0; }

.inkwell-renderer h1 { font-size: 2em; font-weight: 700; margin: 0.67em 0; }
.inkwell-renderer h2 { font-size: 1.5em; font-weight: 600; margin: 0.75em 0; }
.inkwell-renderer h3 { font-size: 1.25em; font-weight: 600; margin: 0.8em 0; }
.inkwell-renderer p { margin: 0.5em 0; }

.inkwell-renderer blockquote {
  border-left: 3px solid #d1d5db;
  padding-left: 1em;
  margin: 1em 0;
  color: #6b7280;
}

.inkwell-renderer ul,
.inkwell-renderer ol { padding-left: 1.5em; margin: 1em 0; }
.inkwell-renderer ul { list-style: disc; }
.inkwell-renderer ol { list-style: decimal; }
.inkwell-renderer li { margin: 0.25em 0; }
.inkwell-renderer img { max-width: 100%; height: auto; border-radius: 8px; }

.inkwell-renderer code {
  background: #f3f4f6;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-size: 0.85em;
}

.inkwell-renderer pre {
  margin: 1em 0;
  border-radius: 8px;
  overflow: auto;
}

.inkwell-renderer pre code {
  display: block;
  padding: 1em;
  background: #1a1a2e;
  color: #e2e8f0;
  font-size: 14px;
}

.inkwell-renderer a { color: #6366f1; text-decoration: underline; }
.inkwell-renderer strong { font-weight: 700; }
.inkwell-renderer em { font-style: italic; }
.inkwell-renderer del { text-decoration: line-through; }

/* ── Renderer copy button ── */

.inkwell-renderer-code-block {
  position: relative;
}

.inkwell-renderer-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #a1a1aa;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.inkwell-renderer-code-block:hover .inkwell-renderer-copy-btn {
  opacity: 1;
}

.inkwell-renderer-copy-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #f4f4f5;
}

/* ── Bubble menu plugin ── */

.inkwell-plugin-bubble-menu-inner {
  display: flex;
  gap: 2px;
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}

.inkwell-plugin-bubble-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #a1a1aa;
  border-radius: 6px;
  cursor: pointer;
}

.inkwell-plugin-bubble-menu-btn:hover {
  background: #27272a;
  color: #f4f4f5;
}

/* ── Snippets plugin ── */

.inkwell-plugin-picker {
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  overflow: hidden;
  min-width: 260px;
  max-width: 320px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}

.inkwell-plugin-picker-search {
  width: 100%;
  padding: 8px 12px;
  background: #09090b;
  border: none;
  border-bottom: 1px solid #27272a;
  color: #e4e4e7;
  font-size: 0.85rem;
  outline: none;
}

.inkwell-plugin-picker-item {
  padding: 8px 12px;
  cursor: pointer;
}

.inkwell-plugin-picker-item:hover,
.inkwell-plugin-picker-item-active {
  background: #27272a;
}
```
