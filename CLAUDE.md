# CLAUDE.md

## Project Overview

Inkwell is a WYSIWYG markdown editor for React, built on Slate.js. The editor uses a decoration-based approach where the text content IS the markdown — visual formatting is computed at render time, never stored in the data model. Supports real-time collaboration via Yjs.

## Monorepo Structure

pnpm workspaces + Turborepo monorepo. Three packages, all in one workspace:

```
inkwell-dev/
  package.json              (workspace root — name: "inkwell", pnpm + turbo)
  pnpm-workspace.yaml
  turbo.json
  biome.json                (linter/formatter config)
  packages/
    inkwell/                (library — @railway/inkwell)
      package.json          (name: "@railway/inkwell")
      tsconfig.json
      vitest.config.ts
      src/
        index.ts             Public exports (components, plugins, serializers, types)
        types.ts             All public TypeScript types
        editor/
          inkwell-editor.tsx   Slate.js editor (standalone + collaborative modes)
          slate/
            types.ts           Slate custom types (InkwellElement, InkwellText)
            deserialize.ts     Markdown → Slate elements
            serialize.ts       Slate elements → Markdown
            decorations.ts     Inline mark + syntax highlighting decorations
            with-markdown.ts   Slate plugin: block behaviors + typing triggers
            with-node-id.ts    Slate plugin: unique element IDs
            render-element.tsx Block element renderer
            render-leaf.tsx    Leaf renderer (decoration marks + remote cursors)
        renderer/
          inkwell-renderer.tsx Read-only renderer
          copy-code-block.tsx  Copy button for fenced code blocks
          html-serializer.ts   HTML → Markdown (unified/rehype pipeline)
          markdown-parser.ts   Markdown → React elements
        lib/
          class-names.ts       editorClass() + pluginClass() CSS helpers
          render-html.ts       Markdown → HTML pipeline
          remark-flatten-blockquotes.ts  Custom remark plugin
          remark-no-tables.ts            Custom remark plugin
        plugins/
          bubble-menu/         Built-in bubble menu plugin (19 tests)
            index.tsx
            index.test.tsx
          snippets/            Snippet picker plugin (21 tests)
            index.tsx
            index.test.tsx
    inkwell-docs/            (docs site — Astro Starlight + React islands)
      astro.config.mjs       Starlight config (includes /llms.md → /llms.txt redirect)
      public/
        llms.txt             LLM context file
      src/
        pages/index.astro    Landing page (custom, React demo as Astro island)
        content/docs/docs/   Docs: quickstart, editor, editor-plugins, renderer, collaboration, styling
        content.config.ts    Content collection config
        components/
          demo.tsx             Interactive editor demo with Edit/Render/Collab tabs
          install-command.tsx  Install command with npm/pnpm/yarn/bun tabs
          page-sidebar.astro   Starlight sidebar override (hides sidebar on landing page)
          empty.astro          Empty component for Starlight slot overrides
        styles/globals.css   Inkwell editor/renderer CSS
    inkwell-demo-collab-server/  (y-websocket collab server for demo)
      server.js              Custom server (5-min doc clearing)
      package.json           y-websocket + ws deps
      Dockerfile             Node 22, runs server.js
```

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm
- **Monorepo**: Turborepo
- **Linter/Formatter**: Biome (kebab-case file naming)
- **Framework**: React 19
- **Editor**: Slate.js (`slate` + `slate-react` + `slate-history` + `@slate-yjs/core`)
- **Collaboration**: Yjs (`yjs` + `@slate-yjs/core` + `y-protocols`)
- **Markdown Pipeline**: unified ecosystem (remark-parse, remark-gfm, remark-rehype, rehype-highlight, etc.)
- **Docs Site**: Astro Starlight (default theme, structural overrides only) + React islands
- **Collab Server**: custom `server.js` using `y-websocket` (Dockerfile for Railway, clears every 5 min)
- **Testing**: Vitest + @testing-library/react + jsdom

## Commands (from root)

- `pnpm test` — Run all tests via turbo
- `pnpm dev` — Start docs dev server (Astro)
- `pnpm build` — Build all packages via turbo
- `pnpm typecheck` — TypeScript type checking via turbo
- `pnpm lint` / `pnpm lint:fix` — Biome
- `pnpm changeset` — Add a changelog entry (commit the generated file with your PR)
- `pnpm changeset version` — Apply pending changesets: bump `@railway/inkwell` version and write `packages/inkwell/CHANGELOG.md`

## Releasing

Changesets drives versioning and `CHANGELOG.md`. Publish is still tag-triggered via `.github/workflows/publish.yml` (fires on `v*` tags).

Per-PR: run `pnpm changeset`, pick the bump type, write a user-facing summary, commit the generated `.changeset/*.md` alongside your code.

To cut a release from `main`:

1. `pnpm changeset version` — bumps `packages/inkwell/package.json` and updates `packages/inkwell/CHANGELOG.md`, consuming the pending changesets.
2. Commit the result (`release: vX.Y.Z`).
3. `git tag vX.Y.Z && git push --follow-tags` — the publish workflow picks it up.

Only `@railway/inkwell` is published; `inkwell-docs` and `inkwell-demo-collab-server` are `private: true` so changesets ignores them. `CHANGELOG.md` is auto-included in the published tarball by npm (not in the `files` allowlist, but npm always includes it).

## Architecture

### API — Two Components

The library exports two components directly (no wrapper/router):

- `<InkwellEditor />` — WYSIWYG editor (`InkwellEditorProps`)
- `<InkwellRenderer />` — Read-only markdown renderer (`InkwellRendererProps`). Has built-in copy button on code blocks (opt-out via `copyButton={false}`).

### Public Exports (`index.ts`)

- **Components**: `InkwellEditor`, `InkwellRenderer`
- **Plugin creators**: `createBubbleMenuPlugin`, `createSnippetsPlugin`
- **Plugin utilities**: `defaultBubbleMenuItems`, `pluginClass`
- **Serialization**: `serializeToMarkdown`, `parseMarkdown`, `deserialize`
- **Types**: `InkwellEditorProps`, `InkwellRendererProps`, `InkwellPlugin`, `BubbleMenuItem`, `BubbleMenuItemProps`, `CollaborationConfig`, `InkwellComponents`, `InkwellDecorations`, `PluginKeyDownContext`, `PluginRenderProps`, `PluginTrigger`, `RehypePluginConfig`, `Snippet`

### Editor Rendering Model (Slate.js)

Decoration-based: text content IS the markdown. Visual formatting computed at render time.

**Block elements** (configurable via `decorations` prop, all enabled by default):

- `paragraph`, `heading`, `code-fence`, `code-line`, `blockquote`, `list-item`
- All have typing triggers (e.g., `## ` → heading, `> ` → blockquote, `- ` → list-item, ` ``` ` → code-fence)

**Decoration marks**: bold, italic, strikethrough, inlineCode, hljs, remoteCursor, remoteCursorCaret. Also marker spans for syntax dimming: boldMarker, italicMarker, strikeMarker, codeMarker.

**Built-in plugins**: Bubble menu (enabled by default via `bubbleMenu` prop, customizable via `BubbleMenuItem[]`). Pass `bubbleMenu={false}` to disable. Default items: bold/italic/strike. Each item is a React component receiving `{ wrapSelection }`. User plugins merged after built-ins.

**wrapSelection toggle**: Wrapping already-formatted text removes the formatting instead of double-wrapping. Detects markers in the selection or surrounding the selection.

### Collaboration (Yjs)

Two modes: standalone (`withHistory`) vs collab (`withYjs` + `withCursors` + `withYHistory`). Consumer provides `CollaborationConfig` with `sharedType`, `awareness`, `user`.

### Key Design Decisions

- **`decorations` prop** (was `elements`) — all decorations enabled by default. Users only pass it to disable something.
- **Bubble menu is built-in and customizable** — `createBubbleMenuPlugin({ items })` accepts custom `BubbleMenuItem[]` where each item is a React component. `defaultBubbleMenuItems` exported for extending. Items receive `{ wrapSelection }` as props.
- **`editorElRef`** — stable React ref for the Slate DOM node, kept current via useEffect after mount. Fixes stale ref issues with plugin event handlers.
- **Plugins are co-located** — live in `packages/inkwell/src/plugins/`, each in its own directory with co-located tests. Not a separate package.
- **Docs site: vanilla Starlight** — no custom theming. Previous attempts at custom purple themes were rejected as "horrid". Keep it default. Has minor structural overrides (PageSidebar, custom CSS for inkwell component styling) but no theme changes.
- **Landing page is separate** — custom Astro page with React demo island, NOT Starlight-themed.

## Design System Colors

All colors are on the hsl(270) hue. Use these values (and tweaks of them) for all UI work:

| Token    | Value              | Usage                           |
| -------- | ------------------ | ------------------------------- |
| pink-50  | hsl(270, 38%, 12%) | Darkest background              |
| pink-100 | hsl(270, 40%, 16%) | Elevated surfaces               |
| pink-200 | hsl(270, 45%, 24%) | Borders, subtle grid lines      |
| pink-300 | hsl(270, 50%, 32%) | Muted accents, hover borders    |
| pink-400 | hsl(270, 55%, 43%) | Secondary interactive           |
| pink-500 | hsl(270, 60%, 52%) | Primary accent (buttons, links) |
| pink-600 | hsl(270, 70%, 65%) | Highlights, glows               |
| pink-700 | hsl(270, 70%, 75%) | Light accents                   |
| pink-800 | hsl(270, 70%, 85%) | Light text on dark              |
| pink-900 | hsl(270, 70%, 95%) | Primary text on dark            |
| pink-950 | hsl(270, 70%, 98%) | Brightest text                  |

## Code Conventions

- TypeScript strict mode, kebab-case file names (Biome enforced)
- Editor CSS classes prefixed with `inkwell-editor-` via `editorClass()` helper in `lib/class-names.ts`
- Plugin CSS classes use `inkwell-plugin-{plugin-name}-{component}` format via `pluginClass()` helper in `lib/class-names.ts`
- Plugin code lives in `packages/inkwell/src/plugins/`, each plugin in its own directory with co-located tests
- `InkwellEditor` and `InkwellRenderer` are the primary exports (no wrapper component)
- Exports go through `packages/inkwell/src/index.ts`
- Package scope: `@railway/inkwell`
- Every implementation file must have a corresponding `.test.ts`/`.test.tsx` file. Every new function, behavior, or code path must have corresponding tests.
- After any code change that affects public API, types, CSS classes, props, exports, or behavior, update all documentation surfaces to match: this file, the docs pages (`packages/inkwell-docs/src/content/docs/docs/`), and `packages/inkwell-docs/public/llms.txt`. The code is always the source of truth.

## Known Issues / Pitfalls

- `parseHljsRanges` must handle hex/decimal HTML entities (`&#x3C;`) — highlight.js uses these for JSX angle brackets
- `parseHljsRanges` uses a class stack for nested hljs spans
- `computeInlineDecorations` assumes single text node per element
- `yjs` and `@slate-yjs/core` are direct deps — consumers who don't use collaboration still bundle them
