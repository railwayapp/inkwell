# ✒️ Inkwell

[![inkwell.build](https://img.shields.io/badge/inkwell.build-8b5cf6)](https://inkwell.build)
[![llms.txt](https://img.shields.io/badge/llms.txt-8b5cf6)](https://inkwell.build/llms.txt)
[![ci](https://img.shields.io/github/actions/workflow/status/railwayapp/inkwell/ci.yml?branch=main)](https://github.com/railwayapp/inkwell/actions)
[![npm](https://img.shields.io/npm/v/@railway/inkwell)](https://www.npmjs.com/package/@railway/inkwell)

Inkwell is a Markdown editor and renderer for React with an extensible plugin
system and real-time collaboration support.

## Usage

### Installation

```
pnpm add @railway/inkwell
```

### Editor

```tsx
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

See [inkwell.build/docs/quickstart](https://inkwell.build/docs/quickstart) for
more details.

## Development

```
pnpm dev
```

## License

[MIT © 2026 Railway Corporation](LICENSE)
