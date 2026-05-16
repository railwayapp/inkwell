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

## Overriding the visual defaults

Every visual-chrome default Inkwell ships — colors, backgrounds, borders,
padding, typography on the editor, plugins, and renderer — is wrapped in
`:where()` so it carries zero specificity. Any single-class consumer rule
wins automatically by specificity tie-break, no `!important` or
descendant scoping required.

That covers `.inkwell-editor` and its inline marks (`strong`, `em`,
`del`, `code`), the heading and blockquote block classes, every
`.inkwell-renderer <tag>` rule (including links, headings, lists, code,
images, `hr`), the bubble menu chrome, and the shared plugin picker
chrome. Three concrete patterns:

```tsx
// Tailwind utility classes on the editor surface
<InkwellEditor classNames={{ editor: "border-0 bg-transparent px-3 py-2" }} />

// Restyle rendered links with a single class
<InkwellRenderer
  content={content}
  components={{
    a: ({ children, href }) => (
      <a className="text-pink-500 underline" href={href}>
        {children}
      </a>
    ),
  }}
/>

// Or with global CSS — a single-class rule wins
// .my-renderer-link { color: hotpink; }
```

What does NOT live in `:where()` is layout-critical geometry: the editor
wrapper's `position: relative`, the bubble menu and picker popup
positioning, the picker list's structural `max-height`, the renderer
copy button's absolute placement, and a handful of structural overflow
rules. Those keep their normal specificity so a consumer utility class
can't silently break positioning or break the picker's flip math.
Override them with descendant selectors or an explicit `!important` when
you actually mean to.

For sweeping color changes without per-element overrides, set the CSS
custom properties on the wrapper instead:

```css
.my-editor {
  --inkwell-accent: hotpink;
  --inkwell-text: #111;
  --inkwell-border: #eee;
}
```

### Typography & spacing tokens

Font sizes, line heights, heading weights, paragraph margins, list
spacing, and so on are defined once and consumed by both the editor and
the renderer. Override one token and both surfaces follow — the editor
stays WYSIWYG with the rendered output.

| Token | Default | What it controls |
|-------|---------|------------------|
| `--inkwell-font-size` | `0.95rem` | Body text size on both surfaces |
| `--inkwell-line-height` | `1.6` | Body line-height on both surfaces |
| `--inkwell-heading-weight` | `600` | Heading font-weight |
| `--inkwell-heading-line-height` | `1.3` | Heading line-height |
| `--inkwell-h1-size` | `1.75em` | `h1` font-size |
| `--inkwell-h2-size` | `1.4em` | `h2` font-size |
| `--inkwell-h3-size` | `1.2em` | `h3` font-size |
| `--inkwell-h4-size` | `1em` | `h4` font-size |
| `--inkwell-h5-size` | `0.9em` | `h5` font-size |
| `--inkwell-h6-size` | `0.8em` | `h6` font-size |
| `--inkwell-code-font-size` | `0.85em` | Inline and block code font-size |
| `--inkwell-space-paragraph` | `0.5em` | Top/bottom margin on renderer paragraphs. The editor's paragraph margin stays at `0` regardless — see the note below. |
| `--inkwell-space-heading` | `0.75em` | Top/bottom margin on headings |
| `--inkwell-space-blockquote` | `1em` | Top/bottom margin on blockquotes |
| `--inkwell-space-list` | `1em` | Top/bottom margin on `ul` / `ol` |
| `--inkwell-space-list-item` | `0.25em` | Top/bottom margin on `li` |
| `--inkwell-list-indent` | `1.5em` | Left padding on `ul` / `ol` |
| `--inkwell-space-code-block` | `1em` | Top/bottom margin on code blocks |
| `--inkwell-space-image` | `1em` | Top/bottom margin on images |
| `--inkwell-space-hr` | `2em` | Top/bottom margin on `hr` |

Apply tokens on either the editor wrapper, the renderer wrapper, or
both — the surfaces share the token namespace:

```css
/* Retune everywhere */
.inkwell-editor,
.inkwell-renderer {
  --inkwell-font-size: 1rem;
  --inkwell-line-height: 1.7;
  --inkwell-h1-size: 2em;
}
```

#### Why editor paragraphs ship with `margin: 0`

The editor's content model stores one `<p>` node per source line, so a
blank line in the Markdown source becomes an empty `<p>` between two
paragraphs — a cursor target that keeps the source round-trip lossless.
If the editor honored `--inkwell-space-paragraph` by default, those
empty paragraphs would add their own top/bottom margin on top of the
real paragraphs', visually multiplying the gap and breaking WYSIWYG in
the opposite direction. The editor opts out of the token and keeps
paragraph margins at `0`. If you want non-zero spacing in the editor,
set it explicitly with a higher-specificity rule:

```css
.my-editor.inkwell-editor p { margin: 0.5em 0; }
```

### Class-driven theming

The token defaults themselves — including the dark-mode set inside
`@media (prefers-color-scheme: dark)` — also live in `:where()`. That
means apps that drive light/dark via a class on the root element (not
the OS preference) can override Inkwell's tokens with a single-class
rule:

```css
:root.cs-light .inkwell-renderer { --inkwell-text: #1a1a1a; }
:root.cs-dark  .inkwell-renderer { --inkwell-text: #f4f4f4; }
```

Or map Inkwell's tokens onto your design-system tokens in one block:

```css
.inkwell-editor,
.inkwell-editor-wrapper,
.inkwell-renderer,
.inkwell-plugin-bubble-menu-container,
.inkwell-plugin-picker-popup {
  --inkwell-bg: var(--background);
  --inkwell-text: var(--foreground);
  --inkwell-border: var(--border);
}
```

No doubled-class selectors needed. The `prefers-color-scheme: dark`
defaults still apply whenever a consumer hasn't overridden a token.

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

`characterLimit` is a soft budget — typing past it is allowed. When a limit is configured the editor renders a small `count / limit` readout overlaying the top-right of the wrapper, but only once the count reaches 80% of the limit (inclusive — at limit 50, the readout shows at 40). The readout sits on a solid surface background and is absolutely positioned, so it visually layers above wrapped text without shifting content. The wrapper picks up a class while the limit is configured and a separate class while the count exceeds the limit.

| Selector | Element |
|----------|---------|
| `.inkwell-editor-character-count` | The `count / limit` readout. Muted gray text on the editor surface background, only rendered once the count reaches 80% of `characterLimit`. |
| `.inkwell-editor-character-count.inkwell-editor-character-count-over` | The readout when the count exceeds the limit. Red by default. |
| `.inkwell-editor-wrapper.inkwell-editor-has-character-limit` | The wrapper while any `characterLimit` is configured. Acts purely as a styling hook — the bundled stylesheet ships no rules against it. |
| `.inkwell-editor-wrapper.inkwell-editor-over-limit` | The wrapper while `characterCount > characterLimit`. The bundled stylesheet paints a soft red halo (`--inkwell-danger-soft`) around the editor surface; override or extend as you like. |

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
| `.inkwell-plugin-picker-popup-flipped` | Added when the popup was flipped above the caret (not enough room below in the editor wrapper or the viewport) |
| `.inkwell-plugin-picker` | Picker wrapper |
| `.inkwell-plugin-picker-search` | Inline query display (characters typed after the trigger) |
| `.inkwell-plugin-picker-list` | Scrollable item list (capped at a fixed height with a themed scrollbar) |
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
