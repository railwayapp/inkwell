---
title: "Collaboration"
---

Inkwell supports real-time collaborative editing via
[Yjs](https://yjs.dev/). Multiple users can edit the same document
simultaneously with automatic conflict resolution and live cursors.

## What you get

- **Live sync** — changes appear instantly for all connected users
- **Remote cursors** — each user's cursor and selection is visible to
  others, color-coded by user
- **Scoped undo** — `⌘Z` only undoes your own changes, never edits from
  other users
- **Provider agnostic** — works with any Yjs network provider

## Setup

You own the Yjs document and network provider. Inkwell needs three things
from you: the shared type, the awareness instance, and the local user's
info.

### 1. Install Yjs and a provider

```bash
npm install yjs y-websocket
```

### 2. Create the document and provider

```tsx
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const doc = new Y.Doc();
const sharedType = doc.get("content", Y.XmlText);
const provider = new WebsocketProvider("wss://your-server.com", "room-id", doc);
```

### 3. Pass the collaboration config

```tsx
import { useInkwell } from "@railway/inkwell";

function CollabEditor() {
  const { EditorInstance } = useInkwell({
    content: "",
    collaboration: {
      sharedType,
      awareness: provider.awareness,
      user: { name: "Alice", color: "#e06c75" },
    },
  });

  return <EditorInstance />;
}
```

When `collaboration` is provided, the Yjs document becomes the source of
truth. The `content` option is only used to seed an empty document on first
load.

### 4. Autosave (optional)

`onChange` still fires on local edits with the serialized Markdown. Use it
for persistence:

```tsx
const { EditorInstance } = useInkwell({
  content: "",
  collaboration: config,
  onChange: (md) => saveToDatabase(md),
});

return <EditorInstance />;
```

## Providers

Yjs supports many network providers. Inkwell works with all of them — you
choose how documents sync.

| Provider                                                              | Protocol  | Use case                       |
| --------------------------------------------------------------------- | --------- | ------------------------------ |
| [y-websocket](https://github.com/yjs/y-websocket)                     | WebSocket | Self-hosted sync server        |
| [y-webrtc](https://github.com/yjs/y-webrtc)                           | WebRTC    | Peer-to-peer, no server needed |
| [Liveblocks](https://liveblocks.io/docs/api-reference/liveblocks-yjs) | Managed   | Hosted infrastructure          |

## Collaboration config

| Field        | Type        | Description                                                                    |
| ------------ | ----------- | ------------------------------------------------------------------------------ |
| `sharedType` | `Y.XmlText` | Yjs shared type for the document. Create with `doc.get("content", Y.XmlText)`. |
| `awareness`  | `Awareness` | Awareness instance from your provider. Handles cursor sharing.                 |
| `user.name`  | `string`    | Display name shown on remote cursors.                                          |
| `user.color` | `string`    | Cursor and selection highlight color. Any CSS color value.                     |
