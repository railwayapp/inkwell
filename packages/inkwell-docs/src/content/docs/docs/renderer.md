---
title: "Renderer"
---

`InkwellRenderer` converts a Markdown source string into React elements. It
produces semantic HTML, has no browser dependencies, and works in any
React environment including server-side rendering.

## Usage

```tsx
import { InkwellRenderer } from "@railway/inkwell";

<InkwellRenderer content="# Hello **world**" />;
```

The renderer handles CommonMark plus GitHub Flavored Markdown features such
as strikethrough, task lists, and autolinks. GFM table syntax is
intentionally rendered as source text; Inkwell does not emit `<table>`
elements by default.

## Custom components

Override how specific HTML elements render using the `components` prop.
Each component receives the original element's props and children.

```tsx
<InkwellRenderer
  content={content}
  components={{
    a: ({ children, ...props }) => (
      <a {...props} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    pre: ({ children, ...props }) => (
      <pre {...props} className="my-code-block">
        {children}
      </pre>
    ),
    img: ({ alt, ...props }) => (
      <figure>
        <img {...props} alt={alt} loading="lazy" />
        {alt && <figcaption>{alt}</figcaption>}
      </figure>
    ),
  }}
/>
```

You can override any HTML element: `h1`–`h6`, `p`, `a`, `img`,
`blockquote`, `pre`, `code`, `ul`, `ol`, `li`, `strong`, `em`, `del`,
and more.

## Syntax highlighting

Code blocks are highlighted with
[highlight.js](https://highlightjs.org/) by default. Import a theme CSS
file for colors to appear:

```tsx
import "highlight.js/styles/github-dark.css";
```

To use a different highlighter, pass it through `rehypePlugins`:

```tsx
import rehypeShiki from "@shikijs/rehype";

<InkwellRenderer
  content={content}
  rehypePlugins={[[rehypeShiki, { theme: "github-dark" }]]}
/>;
```

The same `rehypePlugins` option is available in
[`InkwellEditor`](/docs/editor#syntax-highlighting).

## Props reference

### `content`

**Type:** `string`

The Markdown source string to render.

### `components`

**Type:** `InkwellComponents`

A map of HTML element names to React components. See
[Custom components](#custom-components).

### `rehypePlugins`

**Type:** `RehypePluginConfig[]`

Custom rehype plugins for the Markdown rendering pipeline. Accepts a
plugin function or a tuple such as `[plugin, ...options]`.

Fenced code blocks include a copy button. Hover over a code block to reveal the button.

### `mentions`

**Type:** `MentionRenderer[]`

Text patterns to hydrate into custom React nodes during rendering. Each
entry provides a `pattern` regular expression and `resolve(match)` callback;
matches are replaced in rendered text. This is useful for persisted markers
inserted by the mentions plugin.

### `className`

**Type:** `string`

CSS class applied to the wrapper `<div>`.

## Utilities

Use the renderer utilities when you need the same parsing or HTML conversion
without rendering `<InkwellRenderer />` directly.

```tsx
import { htmlToMarkdown, parseMarkdown } from "@railway/inkwell";

const previewNodes = parseMarkdown(content, {
  components,
  rehypePlugins: [[rehypeShiki, { theme: "github-dark" }]],
  mentions,
});
const markdown = htmlToMarkdown(html);
```

### `parseMarkdown(content, options)`

Parses Markdown source into React nodes using the same component overrides,
rehype plugin pipeline, and mention hydration options as `InkwellRenderer`.

### `htmlToMarkdown(html)`

Converts an HTML string into Markdown source.
