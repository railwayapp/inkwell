# CLAUDE.md

## Project Overview

Inkwell is a WYSIWYG Markdown editor for React, built on Slate.js. The editor
content model is the Markdown source string. Markdown syntax is part of the
content; visual formatting is computed at render time and is never stored as a
separate rich-text model. Supports real-time collaboration via Yjs.

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
  inkwell-demo-collab-server/  y-websocket demo collaboration server
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
types. Do not export internal Slate helpers or shared plugin primitives from the
root API.

## Editor Rendering Model

Formatting is feature-based. The public prop is `features`.
All features are enabled by default:

- `headings` with optional `h1`–`h6` overrides
- `lists`
- `blockquotes`
- `codeBlocks`
- `images`

Inline Markdown styling is still implemented internally with Slate decoration
ranges. Public docs should call the configurable behavior “features.”

Use slot styling:

- `className` aliases `classNames.root`
- `classNames.root`, `classNames.editor`
- `styles.root`, `styles.editor`

Do not add a public top-level `style` prop.

## Built-in Plugins

Built-in plugin factories:

- `createAttachmentsPlugin`
- `createBubbleMenuPlugin`
- `createCharacterLimitPlugin`
- `createCompletionsPlugin`
- `createEmojiPlugin`
- `createMentionsPlugin`
- `createSlashCommandsPlugin`
- `createSnippetsPlugin`

Character-limit toast UI lives in `createCharacterLimitPlugin()`. The editor
still owns `characterLimit`, `enforceCharacterLimit`, and `onCharacterCount` for
counting/enforcement.

Completions are generic placeholder completions. Do not frame them as AI,
support, or Central Station behavior in package docs.

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

## Collaboration

Standalone mode uses Slate history. Collaboration mode uses Yjs via
`CollaborationConfig` with `sharedType`, `awareness`, and `user`.

When collaboration is enabled, the optional `content` prop seeds an empty shared
document. After that, the Yjs shared type is the source of truth.

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
- `yjs` and `@slate-yjs/core` are direct deps; consumers who do not use
  collaboration still bundle them
