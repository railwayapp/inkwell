# @railway/inkwell

## 1.0.0

### Major Changes

- [#3](https://github.com/railwayapp/inkwell/pull/3) [`5a90060`](https://github.com/railwayapp/inkwell/commit/5a90060ac127a316f226c82ed89d71669b9a96e2) Thanks [@half0wl](https://github.com/half0wl)! - Remove collaboration support from the editor API and runtime.

  Breaking changes:

  - Removes the `collaboration` prop from `<InkwellEditor />`.
  - Removes the `CollaborationConfig` public type export.
  - Removes Yjs document seeding, awareness cursor handling, remote cursor
    rendering, and collaborative history integration.
  - Removes direct dependencies on `@slate-yjs/core`, `y-protocols`, and `yjs`.

  Consumers using collaborative editing must manage that integration outside of
  Inkwell or stay on a previous release that includes Yjs support.

- [#5](https://github.com/railwayapp/inkwell/pull/5) [`e39f394`](https://github.com/railwayapp/inkwell/commit/e39f394d65fb4bd2e23d1b889bc14ddf4e0e2d33) Thanks [@half0wl](https://github.com/half0wl)! - Remove the `copyButton` prop from `<InkwellRenderer />`.

  Fenced Markdown code blocks now always render with the built-in copy button unless callers replace the `pre` renderer through `components.pre`.

### Minor Changes

- [#12](https://github.com/railwayapp/inkwell/pull/12) [`4237ed0`](https://github.com/railwayapp/inkwell/commit/4237ed017140379dd25aca449bfc5a23ab1a97b2) Thanks [@half0wl](https://github.com/half0wl)! - `createAttachmentsPlugin` now supports arbitrary (non-image) files via a new optional `onAttachmentAdd(attachment)` callback. Image files (`image/*`) still insert inline as image blocks; non-image files upload through `onUpload` and surface to your code as an `Attachment` (`{ url, filename, mime, size }` plus any extra fields you return from `onUpload`). The new `Attachment` type is exported from the package root.

  Non-image files with no `onAttachmentAdd` are passed through to the editor's default paste/drop handling rather than being silently uploaded and dropped. Existing setups using `accept: "image/*"` see no behavior change.

- [#8](https://github.com/railwayapp/inkwell/pull/8) [`30fc802`](https://github.com/railwayapp/inkwell/commit/30fc8020a7ef34c0bc3d529fb9efffe66d52f97e) Thanks [@half0wl](https://github.com/half0wl)! - Refines the core editor API around `<InkwellEditor />` as the primary
  surface.

  Breaking changes:

  - Renames editor `decorations` / `InkwellDecorations` to `features` /
    `InkwellFeatures`; heading options are now grouped under
    `features.headings`.
  - Replaces plugin `trigger?: { key }` with
    `activation: { type: "always" | "trigger" | "manual" }`. Keydown
    contexts now include `ctx.activate()` and `ctx.dismiss()`.
  - Renames `serializeToMarkdown(html)` to `htmlToMarkdown(html)` and changes
    Markdown parsing to `parseMarkdown(content, options)`.
  - Removes internal root exports including `deserialize`, `pluginClass`,
    `InkwellDecorations`, and `PluginTrigger`. Use the public editor,
    renderer, plugin, and utility APIs instead.

  Additions and behavior updates:

  - Adds an imperative `InkwellEditorHandle` with `getState()`, `focus()`,
    `clear()`, `setContent()`, and `insertContent()`.
  - `setContent()` and `clear()` do not call `onChange`; `insertContent()`
    behaves like a normal edit.
  - Adds slot-based `classNames` and `styles` props; `className` remains an
    alias for `classNames.root`.
  - Adds `characterLimit`, `enforceCharacterLimit`, and `onCharacterCount`
    editor props.
  - Adds `createCharacterLimitPlugin()` for the built-in character-limit toast.
  - Adds `createCompletionsPlugin()` for generic placeholder completions and
    exports `CompletionsPluginOptions`.
  - Adds `InkwellPluginPlaceholder` and plugin `getPlaceholder()` handling.
  - Adds a narrow `InkwellPluginEditor` controller to plugin render props and
    callback contexts.
  - Adds grouped heading feature configuration via
    `features={{ headings: { h1, h2, h3, h4, h5, h6 } }}`.
  - Exports `BubbleMenuOptions` for reusable bubble menu configuration.
  - Uses a singular `arg?: SlashCommandArg` for slash commands, matching the
    one-argument command flow.
  - Allows attachment uploads to return either a URL string or
    `{ url, alt? }`.
  - Allows custom emoji item generics when callers provide `emojis` or `search`.
  - Allows rehype plugin tuples with rest options via `[plugin, ...options]`.
  - Keeps Markdown source markers in the editor content model; character counts
    and empty-state checks derive from serialized source content.
  - Seeds an empty collaborative Yjs document from the optional `content` prop.

- [#6](https://github.com/railwayapp/inkwell/pull/6) [`a92c684`](https://github.com/railwayapp/inkwell/commit/a92c6841a86681b23ac473f9fedb8ecdf811850b) Thanks [@half0wl](https://github.com/half0wl)! - Keep ordered and unordered list markers as plain text in the editor instead of rendering them as list items. Pressing Tab on an unordered list marker increases its indentation, while ordered list markers stay unchanged.

### Patch Changes

- [#9](https://github.com/railwayapp/inkwell/pull/9) [`7f09030`](https://github.com/railwayapp/inkwell/commit/7f09030a8c0f22ee70a39c76a1c60f307f2648f1) Thanks [@half0wl](https://github.com/half0wl)! - Copy/cut now writes a clean Markdown serialization to the clipboard's `text/plain` payload instead of the browser's `innerText` of the rendered HTML. Empty paragraphs no longer produce a phantom extra newline, so the gap a user sees in the editor (one blank line) matches what they paste into plain-text consumers like Discord (one blank line, not two). The HTML and slate-fragment payloads remain unchanged so paste-back into Slate or other rich-text editors still works.

- [#10](https://github.com/railwayapp/inkwell/pull/10) [`08ec135`](https://github.com/railwayapp/inkwell/commit/08ec135214998c074d9ad7a754ecd55ab5db9f23) Thanks [@half0wl](https://github.com/half0wl)! - Pressing Enter inside a heading now splits the line at the caret instead of leaving the text intact and inserting an empty paragraph below. Each half is re-classified against the markdown syntax it now contains:

  - `## Try| it out` → h2 `## Try` + paragraph ` it out`
  - `#|# Try it out` → paragraph `#` + h1 `# Try it out`
  - `|## Title` → empty paragraph above, heading unchanged below

  End-of-line, empty heading, and marker-only behaviors are unchanged.

- [#8](https://github.com/railwayapp/inkwell/pull/8) [`30fc802`](https://github.com/railwayapp/inkwell/commit/30fc8020a7ef34c0bc3d529fb9efffe66d52f97e) Thanks [@half0wl](https://github.com/half0wl)! - Pressing Enter inside an unordered-list paragraph now respects the caret position. Mid-content presses split the line at the caret and carry the tail onto a new list item below. Enter at the very start of content (just past the marker) pushes an empty list item above and keeps the original content and caret in place. Selection ranges are deleted first, then the split logic applies to the collapsed point.

- [#10](https://github.com/railwayapp/inkwell/pull/10) [`08ec135`](https://github.com/railwayapp/inkwell/commit/08ec135214998c074d9ad7a754ecd55ab5db9f23) Thanks [@half0wl](https://github.com/half0wl)! - Block element types now stay in sync with the markdown source on every edit. A new Slate `normalizeNode` hook reruns the deserializer's per-line block classification (heading at any enabled level, blockquote, paragraph) after every operation, so paths the old typing-trigger logic missed — backspace, paste-inside-block, programmatic `setContent` — produce the right element type. Backspacing the trailing space of `## ` now demotes the heading back to a paragraph, backspacing one of the markers in `### Foo` re-promotes it as h2 (or drops to paragraph if h2 is disabled), and text like `## Features` rendering as unstyled paragraph source is no longer possible. Feature flags are honored at reclassification, and code-fence, code-line, and image nodes are skipped since they aren't 1:1 with a markdown line.

- [#13](https://github.com/railwayapp/inkwell/pull/13) [`c7fbab7`](https://github.com/railwayapp/inkwell/commit/c7fbab7d642d0ec672cd57b2d3f82b174d170b77) Thanks [@half0wl](https://github.com/half0wl)! - Fixed an undo regression where `Cmd+A` + `Delete` on content ending in a non-paragraph block (e.g. a fenced code block) would leave the editor flashing between the stranded block and an empty paragraph instead of restoring content. The placeholder effect that canonicalizes an empty editor back to a single empty paragraph now runs inside `HistoryEditor.withoutSaving`, so it no longer occupies an undo slot and the first `Cmd+Z` pops the user's delete as expected.
