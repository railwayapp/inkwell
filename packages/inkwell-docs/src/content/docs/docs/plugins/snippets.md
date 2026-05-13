---
title: "Snippets"
---

A searchable picker for inserting predefined Markdown templates. Type a
trigger key to open the picker, then search by title.

```tsx
import { createSnippetsPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

const snippets = createSnippetsPlugin({
  snippets: [
    {
      title: "Bug Report",
      content:
        "## Bug Report\n\n**Description:**\n\n**Steps to reproduce:**\n1. \n2. \n3. \n",
    },
    {
      title: "Meeting Notes",
      content:
        "## Meeting Notes\n\n**Date:**\n**Attendees:**\n\n### Action Items\n\n- [ ] \n",
    },
  ],
});

function App() {
  const [content, setContent] = useState("");
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[snippets]}
    />
  );
}
```

The default trigger key is `[`. To change it:

```tsx
const snippets = createSnippetsPlugin({
  snippets: [...],
  trigger: "/",
});
```

Once the picker is open:

- Type in the editor to filter snippets by title; there is no separate search input
- `↑` / `↓` to navigate the list
- `Enter` to insert the selected snippet
- `Esc` to close without inserting
