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
import "@railway/inkwell/styles.css";
import { useInkwell } from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("# Hello **world**");
  const { EditorInstance } = useInkwell({ content, onChange: setContent });

  return <EditorInstance />;
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

Versioning and `CHANGELOG.md` are managed by [Changesets](https://github.com/changesets/changesets). Publishing to npm runs via GitHub Actions on a `v*` tag push.

When you open a PR that should show up in the changelog:

```bash
pnpm changeset   # pick bump type, write a user-facing summary
```

Commit the generated `.changeset/*.md` file alongside your code.

To cut a release from `main`:

```bash
pnpm changeset version   # bumps packages/inkwell/package.json + writes CHANGELOG.md
git commit -am "🚀 release: v$(node -p "require('./packages/inkwell/package.json').version")"
git tag "v$(node -p "require('./packages/inkwell/package.json').version")"
git push --follow-tags
```

Pushing the `v*` tag triggers the publish workflow.

## License

[MIT © 2026 Railway Corporation](LICENSE)
