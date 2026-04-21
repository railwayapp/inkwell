# ✒️ Inkwell

[![inkwell.build](https://img.shields.io/badge/inkwell.build-7B3FA0)](https://inkwell.build)
[![llms.txt](https://img.shields.io/badge/llms.txt-7B3FA0)](https://inkwell.build/llms.txt)
[![ci](https://img.shields.io/github/actions/workflow/status/railwayapp/inkwell/ci.yml?branch=main&label=ci&color=7B3FA0)](https://github.com/railwayapp/inkwell/actions)
[![npm](https://img.shields.io/npm/v/@railway/inkwell?color=7B3FA0)](https://www.npmjs.com/package/@railway/inkwell)

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

## Releases

Releases are published to npm via GitHub Actions.

```bash
cd packages/inkwell
npm version patch --no-git-tag-version  # or minor / major
cd ../..
git add packages/inkwell/package.json
git commit -m "🚀 release: v$(node -p "require('./packages/inkwell/package.json').version")"
git tag "v$(node -p "require('./packages/inkwell/package.json').version")"
git push && git push --tags
```

Pushing a `v*` tag triggers the publish workflow.

## License

[MIT © 2026 Railway Corporation](LICENSE)
