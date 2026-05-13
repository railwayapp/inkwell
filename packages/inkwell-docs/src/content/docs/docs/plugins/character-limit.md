---
title: "Character Limit"
---

The optional built-in toast UI for the editor's character-limit feature. The editor itself owns counting and enforcement via the [`characterLimit`](/docs/editor#characterlimit), [`enforceCharacterLimit`](/docs/editor#enforcecharacterlimit), and [`onCharacterCount`](/docs/editor#oncharactercount) props — add this plugin only when you want the toast.

```tsx
import { createCharacterLimitPlugin, InkwellEditor } from "@railway/inkwell";

<InkwellEditor
  content={content}
  onChange={setContent}
  characterLimit={280}
  plugins={[createCharacterLimitPlugin()]}
/>;
```

The toast appears when the document is over the limit, or exactly at the limit when `enforceCharacterLimit` blocks more typing.

## Styling

| Selector | Element |
|----------|---------|
| `.inkwell-editor-limit-toast` | The toast container |
| `.inkwell-editor-limit-toast-icon` | The leading icon inside the toast |

The wrapper class `.inkwell-editor-wrapper.inkwell-editor-over-limit` is also applied (regardless of whether this plugin is mounted) and can be used to flag the surface (e.g., red outline).
