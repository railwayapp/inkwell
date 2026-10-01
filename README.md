# ✒️ Inkwell

> [!WARNING]
> **Unmaintained:** This repository is no longer maintained. No further updates
> or npm releases are planned. Automated CI and release workflows are disabled.

[![npm](https://img.shields.io/npm/v/@railway/inkwell?color=7B3FA0)](https://www.npmjs.com/package/@railway/inkwell)

Inkwell is a Markdown editor and renderer for React with an extensible plugin
system.

## Usage

### Installation

```
pnpm add @railway/inkwell
```

### Editor

```tsx
import "@railway/inkwell/styles.css";
import { InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("# Hello **world**");

  return <InkwellEditor content={content} onChange={setContent} />;
}
```

### Renderer

```tsx
import { InkwellRenderer } from "@railway/inkwell";

function App() {
  return <InkwellRenderer content="# Hello **world**" />;
}
```

See the [quickstart](packages/inkwell-docs/src/content/docs/docs/quickstart.mdx)
for more details.

## Development

```
pnpm dev
```

## License

[MIT © 2026 Railway Corporation](LICENSE)
