---
title: "Renderer"
---

`InkwellRenderer` converts a Markdown string into React elements. It
produces semantic HTML, has no browser dependencies, and works in any
React environment including server-side rendering.

## Usage

```tsx
import { InkwellRenderer } from "@railway/inkwell";

<InkwellRenderer content="# Hello **world**" />;
```

The renderer supports the full CommonMark spec plus GitHub Flavored
Markdown extensions (tables, strikethrough, task lists).

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
`blockquote`, `pre`, `code`, `ul`, `ol`, `li`, `table`, `strong`, `em`,
`del`, and more.

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
[`useInkwell`](/docs/editor#syntax-highlighting).

## Props reference

### `content`

**Type:** `string`

The Markdown string to render.

### `components`

**Type:** `InkwellComponents`

A map of HTML element names to React components. See
[Custom components](#custom-components).

### `rehypePlugins`

**Type:** `RehypePluginConfig[]`

Custom rehype plugins for the Markdown rendering pipeline. Accepts a
plugin function or a `[plugin, options]` tuple.

### `copyButton`

**Type:** `boolean` — default: `true`

Show a copy button on fenced code blocks. Hover over a code block to
reveal the button.

```tsx
<InkwellRenderer content={content} copyButton={false} />
```

### `className`

**Type:** `string`

CSS class applied to the wrapper `<div>`.
