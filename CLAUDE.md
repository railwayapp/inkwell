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

The editor handle stays plugin-agnostic. Plugins that need an imperative
surface (e.g. click-to-attach for attachments) expose their own ref via
plugin options — see `AttachmentsHandle` and the `ref` option on
`createAttachmentsPlugin`.

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

The bundled stylesheet ships **no container-size opinion** (`min-height`,
`max-height`, `height`) on `.inkwell-editor`. Container sizing is a
consumer decision — fights between the library default and a chat
composer / panel embed / custom layout were not worth shipping. Demos and
docs set their own size via `styles.editor`.

Every visual-chrome default the stylesheet ships — colors, backgrounds,
borders, padding, typography — is wrapped in `:where()` so it carries
0,0,0 specificity. That covers `.inkwell-editor` and its inline marks
(`strong`, `em`, `del`, `code`), the heading/blockquote block classes,
every `.inkwell-renderer <tag>` rule (links, headings, lists, code, `hr`,
images), the bubble menu chrome, and the shared plugin picker chrome.
The CSS-custom-property token definitions (both the light defaults and
the `@media (prefers-color-scheme: dark)` block) are wrapped the same
way, so class-driven theming (e.g. `:root.dark .inkwell-renderer { ... }`)
works at single-class specificity without doubled-class hacks. Any
single-class consumer rule overrides them without `!important` or
descendant scoping. Don't move these rules back out of `:where()` —
`packages/inkwell/src/styles.test.ts` will fail at CI.

Typography and spacing are tokenized and shared across both surfaces so
the editor stays WYSIWYG with the renderer. Tokens live alongside the
color tokens in the 5-selector `:where()` block: `--inkwell-font-size`,
`--inkwell-line-height`, `--inkwell-heading-weight`,
`--inkwell-heading-line-height`, `--inkwell-h1-size`…`--inkwell-h6-size`,
`--inkwell-code-font-size`, `--inkwell-space-paragraph`,
`--inkwell-space-heading`, `--inkwell-space-blockquote`,
`--inkwell-space-list`, `--inkwell-space-list-item`,
`--inkwell-list-indent`, `--inkwell-space-code-block`,
`--inkwell-space-image`, `--inkwell-space-hr`. Editor rules
(`.inkwell-editor`, `.inkwell-editor-blockquote`,
`.inkwell-editor-heading-*`, `.inkwell-editor-image`,
`.inkwell-editor code`) and renderer rules (`.inkwell-renderer`,
`.inkwell-renderer h1`-`h6`, `.inkwell-renderer p`,
`.inkwell-renderer blockquote`, `.inkwell-renderer ul/ol/li`,
`.inkwell-renderer code/pre`, `.inkwell-renderer hr`,
`.inkwell-renderer img`) consume the tokens — the
`styles.test.ts > references … in both editor and renderer` cases
enforce that the shared tokens stay referenced on both surfaces. When
adding a new typography or spacing rule, route it through a token
rather than a literal so both surfaces stay aligned.

Editor paragraphs are the deliberate exception: `.inkwell-editor p`
keeps `margin: 0` and does not consume `--inkwell-space-paragraph`. The
editor's content model emits one `<p>` per source line and represents
blank lines as empty `<p>` nodes (cursor targets needed for source
round-trip fidelity). A non-zero paragraph margin in the editor would
compound with those empty paragraphs and visually multiply the gap
between blocks — the opposite of WYSIWYG. Don't reintroduce a non-zero
default until the empty-paragraph encoding is reworked; the test in
`styles.test.ts` deliberately excludes `--inkwell-space-paragraph`
from the shared-token list.

What stays at normal specificity — and MUST stay there — is layout-critical
geometry: `.inkwell-editor-wrapper` (position relative anchors plugins),
`.inkwell-plugin-bubble-menu-container` and `.inkwell-plugin-picker-popup`
(positioning + z-index), `.inkwell-plugin-picker-list` (`max-height`
prevents viewport blowout), `.inkwell-editor-character-count` (top-right
overlay positioning — chrome is split into a sibling `:where()` rule),
`.inkwell-renderer-code-block` and `.inkwell-renderer-copy-btn`
(positioning), and `.inkwell-editor p` (`position: relative` only — its
margin is wrapped). The same rule of thumb when adding new styles: if
overriding a property with a consumer class would silently break
positioning or geometry, leave it unwrapped; otherwise wrap.

## Built-in Plugins

Built-in plugin factories:

- `createAttachmentsPlugin` — uploads can resolve to a URL string or
  `{ url, alt? }`. Image files insert inline; non-image files surface
  through optional `onAttachmentAdd(attachment)` so consumers can track
  them as message-level state (the markdown source has no syntax for
  arbitrary file attachments). Non-image files with no `onAttachmentAdd`
  pass through to default paste/drop. Accepts `ref?: RefObject<AttachmentsHandle | null>`
  populated on mount with `{ upload(files) }` for click-to-attach
  buttons — files filtered out by `accept` are silently skipped by
  `upload()` (paste/drop forwards them to default handling instead).
  The shared internal `routeFiles()` helper backs both paste and the
  imperative `upload()` so behavior stays identical.
- `createBubbleMenuPlugin` — `BubbleMenuOptions` is public for reusable
  menu configuration.
- `createCompletionsPlugin` — options type is `CompletionsPluginOptions`.
- `createEmojiPlugin` — custom item generics work when callers provide
  `emojis` or `search`.
- `createMentionsPlugin`
- `createSlashCommandsPlugin` — commands use one optional `arg`, not an
  `args` array.
- `createSnippetsPlugin`

`characterLimit` is a soft budget — typing past it is allowed. The editor
renders a built-in `count / limit` readout overlaying the top-right of the
wrapper (`.inkwell-editor-character-count`), but only once the count
reaches 80% of the limit (inclusive — at limit 50, the readout appears
at 40, not 39). Under the threshold the readout stays hidden so it
doesn't add visual noise to a near-empty editor. The readout sits on a
solid `var(--inkwell-bg)` background and is absolutely positioned, so it
visually layers above any text that wraps under it without shifting
content. It flips to red over the limit
(`.inkwell-editor-character-count-over`), the wrapper picks up
`.inkwell-editor-has-character-limit` whenever a limit is configured,
and gains `.inkwell-editor-over-limit` while
`characterCount > characterLimit` (bundled stylesheet paints a soft
red halo via `--inkwell-danger-soft` — intentionally muted, not a hard
ring). `InkwellEditorState.overLimit` mirrors the same condition.
`onCharacterCount` fires on every recount.

We previously tried hard-clamping (`with-character-limit`) but ran into
unfixable bypass paths in slate-react's native fast-path for ASCII typing
and various `Transforms.insertNodes` callers. The soft-limit + visual
signal is the chosen design — don't reintroduce a clamp without a
concrete reason.


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

`PluginRenderProps` exposes both `position` (wrapper-relative caret coords with
a 4px gap below the caret — the default popup anchor) and `cursorRect`
(`{ top, bottom, left }`, wrapper-relative). Built-in pickers use a shared
internal `usePluginPopupPlacement` hook (in `plugins/plugin-picker.tsx`) to
flip above the caret when the popup would clip the editor wrapper's bottom or
the viewport bottom (whichever is more restrictive), and shift left when it
would overflow the right edge. The wrapper-bottom check catches short editors
(chat composers, compact embeds) where the popup would spill past the editor's
visible box even when the viewport has room. Flipped popups get the
`inkwell-plugin-picker-popup-flipped` class. The hook reads `popupEl.offsetParent`
to get the wrapper viewport position, so the picker must remain absolutely
positioned inside the editor wrapper.

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
