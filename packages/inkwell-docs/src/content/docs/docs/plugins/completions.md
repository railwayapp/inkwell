---
title: "Completions"
---

A generic completion plugin for suggested text flows. You provide the current Markdown completion, and Inkwell shows it through the editor placeholder while the document is empty. By default the placeholder is prefixed with `[tab ↹]`. Users press `Tab` to accept. `Escape` or normal typing calls `onDismiss`; clear your completion state there so `getCompletion()` returns `null`.

```tsx
import { createCompletionsPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("");
  const [completion, setCompletion] = useState<string | null>(
    "Welcome to Inkwell — Markdown stays readable and portable.",
  );
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[
        createCompletionsPlugin({
          getCompletion: () => completion,
          isLoading: () => false,
          loadingText: "Drafting a suggestion…",
          onAccept: () => setCompletion(null),
          onDismiss: () => setCompletion(null),
          onRestore: restored => setCompletion(restored),
        }),
      ]}
    />
  );
}
```

`getCompletion` should return `null` when no completion should be visible. The plugin does not fetch suggestions itself; connect it to your own completion source, cache, or streaming state.

## Options

```tsx
interface CompletionsPluginOptions {
  name?: string;
  getCompletion: () => string | null;
  isLoading?: () => boolean;
  loadingText?: string;
  acceptHint?: string;
  onAccept?: (completion: string) => void;
  onDismiss?: (completion: string) => void;
  onRestore?: (completion: string) => void;
  restoreOnUndo?: boolean;
}
```

When `restoreOnUndo` is true (the default), undoing an accepted completion back to an empty document calls `onRestore(completion)`. Use that callback to put the completion back into your host state.

Completion placeholder text is source content text. `acceptHint` controls the prefix prepended to the placeholder text and defaults to `[tab ↹]`.
