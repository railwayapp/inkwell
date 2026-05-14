# CLAUDE.md

## Project Overview

Inkwell is a WYSIWYG Markdown editor for React, built on Slate.js. The editor
content model is the Markdown source string. Markdown syntax is part of the
content; visual formatting is computed at render time and is never stored as a
separate rich-text model.

## Monorepo Structure

pnpm workspaces + Turborepo monorepo. Three packages, all in one workspace:

```
packages/
  inkwell/                     Library package: @railway/inkwell
    src/
      index.ts                 Public exports
      types.ts                 Public TypeScript types
      editor/inkwell-editor.tsx
      editor/slate/            Slate model, serialize/deserialize, features
      renderer/                Read-only renderer + renderer utilities
      plugins/                 Built-in plugins and tests
  inkwell-docs/                Astro Starlight docs + React demo island
```

## Commands

Run from the workspace root:

- `pnpm test` — Run all tests via turbo
- `pnpm dev` — Start docs dev server
- `pnpm build` — Build all packages
- `pnpm typecheck` — TypeScript type checking
- `pnpm lint` / `pnpm lint:fix` — Biome
- `pnpm changeset` — Add a changelog entry

Package-scoped validation used during API work:

- `pnpm --filter=@railway/inkwell typecheck`
- `pnpm --filter=@railway/inkwell test`
- `pnpm --filter=@railway/inkwell build`
- `pnpm --filter=inkwell-docs typecheck`
- `pnpm --filter=inkwell-docs build`

## Public API

`<InkwellEditor />` is the primary editor API.

```tsx
import { InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("# Hello **world**");

  return <InkwellEditor content={content} onChange={setContent} />;
}
```

Use `ref={useRef<InkwellEditorHandle>(null)}` for imperative actions:

- `getState()`
- `focus({ at?: "start" | "end" })`
- `clear({ select?: "start" | "end" | "preserve" })`
- `setContent(content, { select?: "start" | "end" | "preserve" })`
- `insertContent(content)`

`setContent()` and `clear()` do not call `onChange`. `insertContent()` behaves
like a normal edit and flows through change handling.

The root package exports the component APIs, built-in plugin factories, renderer
utilities (`parseMarkdown(content, options)`, `htmlToMarkdown(html)`), and public
types. `RehypePluginConfig` accepts plugin tuples with rest options:
`[plugin, ...options]`. Do not export internal Slate helpers or shared plugin
primitives from the root API.

## Editor Rendering Model

Formatting is feature-based. The public prop is `features`.
All features are enabled by default:

- `headings` with optional `h1`–`h6` overrides
- `blockquotes`
- `codeBlocks`
- `images`

List markers (`-`, `*`, `+`, `1.`) stay plain text in the editor and are not
part of configurable editor features.

Inline Markdown styling is still implemented internally with Slate decoration
ranges. Public docs should call the configurable behavior “features.”

Use slot styling:

- `className` aliases `classNames.root`
- `classNames.root`, `classNames.editor`
- `styles.root`, `styles.editor`

Do not add a public top-level `style` prop.

## Built-in Plugins

Built-in plugin factories:

- `createAttachmentsPlugin` — uploads can resolve to a URL string or
  `{ url, alt? }`. Image files insert inline; non-image files surface
  through optional `onAttachmentAdd(attachment)` so consumers can track
  them as message-level state (the markdown source has no syntax for
  arbitrary file attachments). Non-image files with no `onAttachmentAdd`
  pass through to default paste/drop.
- `createBubbleMenuPlugin` — `BubbleMenuOptions` is public for reusable
  menu configuration.
- `createCharacterLimitPlugin`
- `createCompletionsPlugin` — options type is `CompletionsPluginOptions`.
- `createEmojiPlugin` — custom item generics work when callers provide
  `emojis` or `search`.
- `createMentionsPlugin`
- `createSlashCommandsPlugin` — commands use one optional `arg`, not an
  `args` array.
- `createSnippetsPlugin`

Character-limit toast UI lives in `createCharacterLimitPlugin()`. The editor
still owns `characterLimit`, `enforceCharacterLimit`, and `onCharacterCount` for
counting/enforcement.


## Plugin API

Plugins use explicit activation:

```ts
type InkwellPluginActivation =
  | { type: "always" }
  | { type: "trigger"; key: string }
  | { type: "manual" };
```

- Omitted activation defaults to `{ type: "always" }`.
- Trigger activation inserts/uses the trigger key and tracks the query after it.
- Manual activation is claimed with `ctx.activate({ query? })` and released with
  `ctx.dismiss()`.

Plugin callbacks receive a narrow `InkwellPluginEditor` controller. Do not expose
raw Slate editor instances in public plugin callbacks.

```ts
interface PluginKeyDownContext {
  editor: InkwellPluginEditor;
  wrapSelection: (before: string, after: string) => void;
  activate: (options?: { query?: string }) => void;
  dismiss: () => void;
}
```

Picker-style built-ins may share internal primitives, but those primitives are
not part of the root public API.

## Code Conventions

- TypeScript strict mode, kebab-case file names (Biome enforced)
- No `any` unless required by third-party generic types and locally justified
- Keep imports at the top
- Tests live beside implementation files
- Every public API, type, CSS class, prop, export, or behavior change must update:
  - package docs under `packages/inkwell-docs/src/content/docs/docs/`
  - `packages/inkwell-docs/public/llms.txt`
  - this file when architecture/API guidance changes

## Known Issues / Pitfalls

- `parseHljsRanges` must handle hex/decimal HTML entities (`&#x3C;`)
- `parseHljsRanges` uses a class stack for nested hljs spans
- `computeInlineFeatures` assumes a single text node per element
