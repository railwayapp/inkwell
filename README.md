# ✒️ Inkwell

[![inkwell.build](https://img.shields.io/badge/inkwell.build-7B3FA0)](https://inkwell.build)
[![llms.txt](https://img.shields.io/badge/llms.txt-7B3FA0)](https://inkwell.build/llms.txt)
[![ci](https://img.shields.io/github/actions/workflow/status/railwayapp/inkwell/ci.yml?branch=main&label=ci&color=7B3FA0)](https://github.com/railwayapp/inkwell/actions)
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

See [inkwell.build/docs/quickstart](https://inkwell.build/docs/quickstart) for
more details.

## Development

```
pnpm dev
```

## Releases

Releases are automated. Every PR carries exactly one label that determines the next version bump:

| Label | Effect |
|---|---|
| `release/patch` | Bumps the patch version (e.g. `1.1.0` → `1.1.1`) |
| `release/minor` | Bumps the minor version (e.g. `1.1.0` → `1.2.0`) |
| `release/major` | Bumps the major version (e.g. `1.1.0` → `2.0.0`) |
| `release/skip`  | No version bump (use for docs-only or chore PRs) |

When a labeled PR merges to `main`, the `auto-release` workflow batches with any other recently-merged PRs, picks the highest bump across them, tags `vX.Y.Z`, and pushes. The tag push triggers the `publish` workflow, which generates release notes from PR titles since the previous tag, drafts a GitHub Release, publishes to npm, and un-drafts.

Release notes live on the [GitHub Releases page](https://github.com/railwayapp/inkwell/releases). There is no in-repo `CHANGELOG.md`.

## License

[MIT © 2026 Railway Corporation](LICENSE)
