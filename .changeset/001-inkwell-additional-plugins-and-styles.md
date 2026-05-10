---
"@railway/inkwell": minor
---

Add the `useInkwell` hook API, exposing `{ state, EditorInstance, editor }` plus imperative editor controls for focus, clearing, replacing Markdown, inserting Markdown, and state inspection.

Ship default editor, plugin, and renderer styles via `@railway/inkwell/styles.css`.

Add built-in mentions and attachments plugins. Mentions provide a trigger-based searchable picker with persisted marker insertion, and attachments support pasted/dropped image uploads plus copied HTML image URLs.

Add renderer mention hydration support, image block parsing/rendering/serialization, character limit state/enforcement, editable/read-only mode, editor state callbacks, and plugin setup lifecycle hooks.
