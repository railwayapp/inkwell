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
      components/              Shared block components (Heading, Blockquote, …)
                               consumed by both editor and renderer surfaces
      mdast/                   Markdown ↔ mdast helpers (parse, stringify)
      editor/inkwell-editor.tsx
      editor/slate/            Slate model, serialize/deserialize, features
      renderer/                Read-only renderer + renderer utilities
      plugins/                 Built-in plugins and tests
  inkwell-docs/                Astro Starlight docs + React demo island
```

### Shared block components

`src/components/` holds the React components both surfaces render:
`Heading`, `Blockquote`, `CodeBlock`, `List`, `ListItem`, `Image`.
Each accepts `surface: "editor" | "renderer"` so the editor-only
`inkwell-editor-*` classes are added on the editor surface and omitted
on the renderer surface (the renderer relies on
`.inkwell-renderer <tag>` descendant selectors).

The renderer registers these via rehype-react's `components` map in
`src/components/renderer-bindings.tsx`. The editor's
`render-element.tsx` invokes them directly with Slate's `attributes`
spread. The DOM-parity test (`src/dom-parity.test.tsx`) guards that
the block markup shape stays aligned across both surfaces.

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

## Unified mdast pipeline

Both surfaces parse the same way. `src/mdast/parse.ts` exposes
`parseMarkdownToMdast(content)`, which runs `remark-parse` +
`remarkGfmNoTables` (a GFM subset: autolink literals, footnotes,
strikethrough, task lists — **no table syntax**, on either the parse or
stringify side) with `remarkNoThematicBreak`, then a soft-break shaper,
and returns a single mdast `Root` with position info on every block.

Tables are disabled at the SYNTAX level, not flattened after parsing:
the old `remark-no-tables` plugin reconstructed rows from a lossy table
tree (bold/link cell content stringified to `""`, the delimiter row was
rewritten) and its reconstructed text desynced from the source slice,
so the cache skipped the block and every serialize emitted the mangled
form. With the extension absent, pipe rows are ordinary paragraph text
with real positions at any nesting depth — bytes survive verbatim. The
stringify side must stay table-free too, or `|` joins toMarkdown's
unsafe list and every pipe in plain text serializes as `\|`.
(`html-serializer.ts` deliberately keeps FULL gfm — it converts foreign
HTML to markdown text, where `<table>` → pipe rows with all cells is
the best representation.)

GFM task lists ARE modeled: `mdastToSlate` reconstructs the `[x] `/
`[ ] ` marker as visible text at the start of the item's first
paragraph (D1=visible), and `slateToMdast` detects the prefix and moves
it back onto `listItem.checked` so the stringifier emits `- [x] …`.
Dropping the marker on either side silently deletes checkbox state from
the source. Two guards: the to-slate prepend checks the source between
the item start and the paragraph start — when the content begins with
an inline element (`- [x] **b**`) micromark does NOT advance the
paragraph past the checkbox, the slice already contains it, and a blind
prepend doubled the marker; and from-slate only moves the marker onto
`checked` when content FOLLOWS it — an empty scaffold (`- [ ] `) keeps
the marker as literal text, because the stripped-empty paragraph gets
dropped and the GFM stringifier would emit a bare `-`.

`parseMarkdownToMdast` also escapes bare `>` line markers (`>foo`
without a trailing space) to `\>` before parsing, so CommonMark doesn't
treat them as blockquotes — Inkwell only models the space-prefixed `> `
form as structural. The escape is **fence-aware**: a line scanner skips
lines inside fenced code blocks (``` ` ``` and `~`, including unclosed
fences), because code content is verbatim — a blind escape baked a
literal `\` into `code.value` on both surfaces (`>>> doctest` →
`\>>> doctest`). The escape inserts a byte, which shifts every
downstream mdast `position.offset`, so the tree is remapped back to
original-source offsets after parsing. **Never slice the original
source with raw post-parse offsets** — they index the escaped string,
and that desync silently dropped a leading char from every block after
a bare-`>` line (`bar` → `ar`). The remap tracks visited `Point`
objects by identity because plugins (the soft-break paragraph splitter)
may alias one Point into several nodes' positions — remapping an
aliased Point twice double-subtracts. Documents with no bare-`>` line
skip the remap entirely, so the common path is untouched.

The soft-break shaper runs AFTER the offset remap, as a plain function
over the remapped tree with the **original** source as its `source`
option — not inside the unified pipeline against the escaped source.
Split-part positions are derived by comparing each text node's decoded
value to its source slice, and decoded escapes (mdast turns the
pre-parse `\>` insertion back into `>`) only byte-match the ORIGINAL
string. Running the shaper pre-remap left every bare-`>` paragraph
positionless: the editor displayed literal `\>` fallback text and the
cache skipped those blocks. **Split paragraphs must stay positioned.**
When a text node's source slice still doesn't byte-match its value
(entity decoding, container `> `/indent prefixes), the splitter leaves
parts positionless and the cache skips those blocks — canonical
fallback, never a guessed slice.

Setext headings (`Title\n====`) normalize to the ATX form in the MODEL
(`# Title` single-line leaf) at `convertHeading` — a multi-line heading
leaf is a shape nothing downstream handles (the first keystroke used to
corrupt it into escaped paragraphs). The source cache still round-trips
the untouched setext source byte-for-byte.

Two adapters consume that tree:

- `src/mdast/to-slate.ts` (`mdastToSlate(tree, content)`) — used by the
  editor's `deserialize`. Container blocks (blockquote, list, list-item)
  convert structurally. Leaf-bearing blocks (paragraph, heading) pull
  the verbatim source slice via mdast `position.offset` so D1=visible
  markers (`**bold**`, `[label](url)`, `# `) stay as text in the slate
  node. Standalone images (`![alt](url)` on their own line) promote to
  top-level void image elements — Slate's arrow-key navigation needs a
  block-level void to land on.
- `src/renderer/...` (rehype-react via `parseMarkdown`) — used by
  `<InkwellRenderer>`. Same mdast tree, projected through
  `mdast-util-to-hast` to HTML.

The reverse direction is `src/mdast/from-slate.ts`
(`slateToMdast(nodes)`). The PRIMARY inline path is **verbatim
emission**: a paragraph/heading leaf whose text passes the
verbatim-safety check becomes a single `inkwellRaw` node whose value
`stringifyMdast` emits byte-for-byte, no defensive escaping. The check
(`verbatimSafe`) re-parses the text through `parseMarkdownToMdast`
(same bare-`>` escaping, no tables) and accepts only when it yields
exactly ONE block of the same type/depth, with no leading whitespace
and no `\r`. This is what keeps typed bytes intact — `snake_case`,
`2 * 3`, bare URLs, `@user[alice]`, `[label](url)` all serialize
exactly as typed; the old always-escape path injected `\_`/`\*`,
rewrote bare URLs to `<autolink>` form, and made stored markdown
diverge from what the user typed (visible backslashes after reload).
Text that would re-parse as a DIFFERENT block shape (`1. ` scaffolds,
`---` lookalikes, leading indent) falls back to `parseInline` +
toMarkdown's escaping, which is semantically required there. The
fallback `parseInline` keeps the WHOLE text as one literal leaf when it
re-parses to multiple blocks — returning only the first block's
children silently deleted the rest from the output. Container
empty-paragraph handling: list items drop all empty paragraphs
(`"none"` policy); blockquotes keep leading and trailing empty
paragraphs but drop **internal** empties (`"edges"` policy) so the
natural mdast paragraph separator isn't doubled.

`stringifyMdast` post-processes the toMarkdown output to strip the few
defensive escapes the FALLBACK path emits that Inkwell doesn't need:

- Escaped thematic-break lines (`\---` and the per-character forms
  `\*\*\*` / `\_\_\_` / `\* \* \*` — unneeded under
  `remarkNoThematicBreak`; only lines consisting entirely of marker
  characters are unescaped)
- Trailing `&#x20;` (trailing-whitespace protection)

Two strips that used to live here are deliberately GONE — do not bring
them back: the `\[`/`\]` unescape destroyed links/images whose
label/alt legitimately contains brackets (`[a\[b](url)` un-escaped to a
non-link), and the `\>`-after-prefix unescape upgraded a user's literal
`>`-text inside a quote into a real nested blockquote.

It also collapses runs of consecutive bare-`>` lines to a single `>`.

The whole post-process is **code-aware**: a line walker tracks fenced
code (including blockquote-prefixed fences) and leaves fence content
untouched. toMarkdown emits code verbatim, so any backslash, entity, or
`>` line inside code is the user's actual content — a blind strip
corrupted edited code blocks (`>`-only code lines were collapsed).
Likewise `serialize()` trims newlines only at block-piece *edges*
before joining — a document-wide `\n{3,}` collapse used to eat
blank-line runs inside fenced code even for untouched cached blocks.

`deserialize` for single-line plain-text input bypasses the slice path
and keeps `content` verbatim as paragraph text. Paste paths feed text
like `" there"` through `deserialize` and need the leading whitespace
preserved (mdast normally strips it from paragraph source slices).

The line-based regex deserialize/serialize is gone. Don't reintroduce
a per-line scanner — when fixing a corner case, fix it inside the
adapters or in `stringifyMdast`'s post-process.

### Source cache

Untouched blocks round-trip byte-for-byte through a per-block source
cache keyed by Slate node id. `deserializeWithRanges` returns
`(BlockLineRange | null)[]` derived from mdast position info — `null`
for blocks with no position (synthetic plugin nodes), which
`populateSourceCacheFromParse` **skips** rather than guessing a slice
(a fabricated `{0,0}` range once cached the document's first line as
every positionless block's source, and the self-derived canonical
always matched — soft-wrapped docs serialized as line 0 repeated).
Documents containing `\r` skip caching entirely: lone CRs desync the
`\n`-based line slicing, and CRLF slices would splice mixed line
endings into output — both degrade to the canonical (LF-normalized)
form instead. On serialize, `slateToMdast` runs first, but a
top-level block whose canonical re-stringification matches its cached
canonical form short-circuits and re-emits the original slice
verbatim. Style normalizations (`*` → `-`, `> a\n> b` → `> a\n>\n>
b`, tight nested lists) only fire for blocks the user has actually
edited.

Soft-wrapped paragraphs (`a\nb`) split into sibling blocks — that IS
the editor model. AT REST the original gap survives anyway: each cache
entry records the verbatim separator to the NEXT block
(`gapToNext: { nextId, gap }`), and `serialize` re-emits it when both
neighbors emit from cache and the recorded `nextId` still matches. So
`a\nb`, `- a\n* b\n+ c` (marker-alternating sibling lists), and 3+
newline runs all stay byte-exact until one of the neighbors is edited,
inserted, deleted, or reordered — then the join falls back to the
normalized blank line. At top level, inline markers survive the split
via verbatim slices (positioned parts). Inside containers (blockquote /
list-item), the text-node value never byte-matches its source slice
(the slice carries `> `/indent prefixes), so split parts stay
positionless there — `mdastToSlate` falls back to re-stringifying the
inline children (`inlineFallback` in to-slate.ts; single plain-text
children short-circuit to their decoded value), which preserves
`**`/link structure at the cost of canonical escape normalization.
Don't swap that fallback back to `mdast-util-to-string` — the flat
text dropped markers and link URLs from the model entirely.

`verbatimSafe`'s paragraph expectation also accepts `definition`,
`footnoteDefinition`, and `html` re-parse shapes — the editor models
all three as verbatim-text paragraphs (to-slate's default case), and
the escaped fallback would break them (`\[ref]: url` is no longer a
definition, so every reference link pointing at it dies). Two hard
safety rules inside `verbatimSafe`: (1) the check parses the text with
a SENTINEL paragraph appended after a blank line and requires exactly
`[expected block, sentinel]` — an unclosed `<pre>`/`<script>`/`<!--`
html block or fence-opening line would otherwise absorb every later
sibling once blocks are joined; (2) in container context (blockquote /
list item) any line-leading `>` is rejected — the top-level parse
escapes it, but after the container's `> ` prefix is prepended on emit
it re-reads as a NESTED quote marker.

The same termination rule guards the source cache:
`populateSourceCacheFromParse` refuses to cache a slice that fails the
sentinel check (`sliceTerminates`) — a cached UNCLOSED fence would
swallow whichever block the user creates after it (the code-block exit
gesture made that reachable by keyboard). The canonical fallback closes
fences and is always join-safe.

## Editor Rendering Model

Formatting is feature-based. The public prop is `features`.
All features are enabled by default:

- `headings` with optional `h1`–`h6` overrides
- `blockquotes` (nestable — `blockquote` elements hold block children;
  the `> ` marker is structural and is not stored on any inner text
  leaf, the editor re-emits it on serialize)
- `codeBlocks` — each fenced block becomes a single `code-block` element
  with a multi-line text leaf and an optional `lang` property. The
  fences themselves are structural; serialize wraps the text back in
  ` ```lang ` / ` ``` `. Editor renders as `<pre data-lang="…"><code>…</code></pre>`;
  `white-space: pre-wrap` on `.inkwell-editor-code-block` keeps caret
  placement aligned with the visual line breaks. Exit gestures (a code
  block must never be a keyboard trap): a second CONSECUTIVE Enter at
  the block end exits to a new paragraph after the block — the exit is
  armed only by an Enter that itself added the trailing newline
  (`pendingCodeExit`), so code that legitimately ends with a blank line
  is never truncated by a single Enter; Enter after typing ` ``` ` as
  the last line removes that line and exits; Backspace in an EMPTY code
  block converts it back to a paragraph. The paste-verbatim branch
  applies only when the selection sits entirely inside ONE code block —
  a selection merely reaching into a fence from outside takes the
  normal markdown paste path.
  Paste inside a code block inserts the clipboard text verbatim — the
  markdown-deserialize paste path used to keep only the first line as
  code and leak the rest out of the fence as parsed blocks.
- `images`

Feature gates apply at ALL nesting depths for headings and standalone
images (`> # title` with `headings:false` degrades to text inside the
quote, same as at top level). Code blocks are gated at the top level
only — a nested code node's source slice spans container continuation
prefixes, and splicing those into paragraph text corrupts the round
trip.

Lists are not a feature-flag (they're always recognized). A run of
`<marker> content` lines (unordered `-`/`*`/`+` or ordered `<n>.`)
deserializes to a `list` element with `list-item` children. Each item
holds a paragraph + an optional nested list. The marker is structural —
serialize re-emits it. Editor renders as `<ul>`/`<ol>` + `<li>`. `Tab`
inside a list-item nests it under its previous sibling (creating or
reusing a nested list); `Shift+Tab` un-nests one level. Ordered lists
remember a non-default starting number on the list element's `start`
property and emit `<ol start="…">` accordingly. Task-list items keep
their `[x] `/`[ ] ` marker as visible text at the start of the item
(see the pipeline section); the renderer shows real checkboxes.

Typing over a selection that spans multiple top-level blocks routes the
deletion through `editor.deleteFragment` first, so the replacement text
lands in a paragraph (or the start block's type) — Slate's built-in
expanded-range insert kept the LAST block's container, trapping
replacement text inside a trailing code block.

Images are top-level void blocks. A standalone `![alt](url)` line
deserializes to a top-level `image` element (rather than the mdast-
native `paragraph > image` shape) so Slate's arrow-key navigation has
a block-level stop to land on. The editor renders the image inside a
`<div class="inkwell-editor-image"><img/></div>` for selection chrome.
`insertImage` / `updateImage` / `removeImage` on the plugin editor
walk the tree to find images by id.

## Source cache

The editor maintains a per-instance `SourceCache` (see
`src/editor/slate/source-cache.ts`) so untouched top-level blocks
round-trip byte-for-byte through deserialize → serialize. Without it,
`> a\n> b` would normalize to `> a\n>\n> b`; `***` would normalize to
`\*\*\*`; `* one\n* two` would normalize to `- one\n- two` — all valid
mdast canonical forms but stylistically jarring to a user who didn't
touch the block.

The cache is keyed by Slate node id and stores
`{ source, canonical }` per top-level block. Populated at parse time
(deserialize tracks line ranges; the orchestrator slices the original
`content` accordingly). On serialize, each top-level block recomputes
its canonical form and compares; matches emit the cached source slice,
misses fall back to canonical.

**Every** serialize path threads the cache — `getState`, the character
count, `onSubmit`, the `onChange` emission in `handleChange`, and the
copy/cut `text/plain` payload (`setFragmentData` reads the cache via
the internal `editor.sourceCache` field wired at editor creation). They
must stay aligned: if `onChange` serialized without the cache it would
emit normalized untouched siblings (`*` → `-`, expanded blockquotes)
while `getState` kept them verbatim, silently diverging a controlled
`onChange={setContent}` consumer's stored string from the editor. The
cache-faithful `onChange` is also what lets the `handleChange` echo
guard suppress the `onChange` that imperative `setContent`/`clear`
would otherwise leak (the prior dead `suppressImperativeOnChange` ref
never gated anything).

There is NO per-op invalidation. `getCachedSource` re-validates every
hit by recomputing the block's canonical form and comparing (plus a
plain-text guard), so a retained entry can never emit stale bytes — and
retention is what lets edit → undo restore the block's original source
style (`> a\n> b` comes back as `> a\n> b`, not `> a\n>\n> b`). The old
apply-interceptor deleted entries on every op, which made that loss
permanent. Entries are rebuilt wholesale on `setContent`/`clear`, which
bounds growth. The cache lives outside Slate state, so undo/redo
doesn't have to thread through it.

`canonicalize` is memoized by node identity (WeakMap): Slate rebuilds
the object for any block an op touches, so an unchanged reference has
an unchanged canonical form. Serialize runs over every top-level block
on every keystroke — the memo makes that O(edited blocks) instead of a
full-document remark re-parse per keystroke (which cost 50–180ms on
200–500-block documents). `handleChange` also serializes ONCE per
change and feeds the same string to the character count and the
`onChange` emission.

Thematic breaks (`---` / `***` / `___` / `* * *` / `- - -`) are not
modeled. `remarkNoThematicBreak` rewrites every `thematicBreak` node
back to a paragraph in the parse pipeline — at **every** nesting depth
(a `> ---` inside a quote degrades the same way; the top-level-only
version leaked real `<hr>`s into the renderer inside containers) — so
these markers stay as plain paragraph text in both surfaces (no `<hr>`
rendering, no decoration). A standard mdast `thematicBreak` carries no
value, so the plugin slices the **verbatim** marker from the parsed
source by `position.offset` (it takes the source string as a `source`
option) — otherwise the renderer would collapse every marker to `---`
while the editor's source slice kept the typed one, breaking WYSIWYG
parity. The `\---` / `\***` / `\___` defensive escapes
mdast-util-to-markdown would emit are stripped by `stringifyMdast`'s
post-process.

List markers (`-`, `*`, `+`, `1.`) are structural (see the Lists
paragraph above — the editor re-emits them on serialize) and are not
part of configurable editor features.

Inline Markdown styling is still implemented internally with Slate decoration
ranges. Public docs should call the configurable behavior “features.”

Inline marks include `bold`, `italic`, `strikethrough`, `inlineCode`, and
their `*Marker` counterparts, plus link marks: `link` (visible link text
— covers both the `[text]` label of `[text](url)` and the entire text of
bare URL autolinks), `linkUrl` (URL token inside `(url)`), and
`linkMarker` (`[`, `]`, `(`, `)` brackets). Links are always on; the
content model stays the markdown source — no link nodes, no separate
rich-text model. `[text](url)` and bare URLs (`https://...`, `www....`)
are matched after the inline-code pass and skip ranges already covered
by backticks or another link. Trailing punctuation (`.,;:!?`) is
trimmed off bare-URL matches so "see https://x.com." doesn't pull the
period into the link.

Paste-over-selection: when the clipboard payload trims to a single URL
and the editor selection is non-empty, `withMarkdown`'s `insertData`
override replaces the selection with `[selected](url)` instead of
dropping the bare URL. Paste with a collapsed selection (or empty
editor) follows the normal markdown-deserialize path — the URL ends up
as plain text and the autolink decoration picks it up. There is no
bubble-menu "insert link" button (the symmetric `wrapSelection`
primitive doesn't fit `[text](url)`); editing the markdown source IS
the link editing UX.

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
`--inkwell-space-image`. Editor rules (`.inkwell-editor`,
`.inkwell-editor-blockquote`, `.inkwell-editor-heading-*`,
`.inkwell-editor-image`, `.inkwell-editor code`) and renderer rules
(`.inkwell-renderer`, `.inkwell-renderer h1`-`h6`, `.inkwell-renderer p`,
`.inkwell-renderer blockquote`, `.inkwell-renderer ul/ol/li`,
`.inkwell-renderer code/pre`, `.inkwell-renderer img`) consume the
tokens — the `styles.test.ts > references … in both editor and renderer`
cases enforce that the shared tokens stay referenced on both surfaces.
When adding a new typography or spacing rule, route it through a token
rather than a literal so both surfaces stay aligned.

Blank source lines do not produce empty-paragraph nodes. They flush
the current paragraph run; paragraph margins
(`--inkwell-space-paragraph`, shared with the renderer) handle the
visual gap between sibling blocks. Source round-trip fidelity comes
from the source cache; blank runs (3+ newlines between blocks) stay
byte-exact AT REST via the inter-block gap map and normalize to one
blank line once either neighboring block is edited.

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
- `computeDecorations` assumes a single text node per element
