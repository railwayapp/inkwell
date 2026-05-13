---
title: "Mentions"
---

A searchable picker for inserting persisted mention markers, such as users,
teams, projects, or any other entity in your app. Type the trigger key to open
the picker, search, then press `Enter` to insert the active item.

```tsx
import { createMentionsPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

type UserMention = {
  id: string;
  title: string;
  username: string;
};

const users: UserMention[] = [
  { id: "usr_1", title: "Ada Lovelace", username: "ada" },
  { id: "usr_2", title: "Grace Hopper", username: "grace" },
];

const mentions = createMentionsPlugin<UserMention>({
  name: "users",
  trigger: "@",
  marker: "user",
  search: query =>
    users.filter(user =>
      user.title.toLowerCase().includes(query.toLowerCase()),
    ),
  renderItem: (user, active) => (
    <div className={active ? "mention-active" : undefined}>
      <strong>{user.title}</strong> @{user.username}
    </div>
  ),
  emptyMessage: "No users found",
});

function App() {
  const [content, setContent] = useState("");
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[mentions]}
    />
  );
}
```

By default, selecting an item inserts a marker in this form:

```md
@user[usr_1]
```

Use `onSelect` when you want to insert a different string:

```tsx
const mentions = createMentionsPlugin<UserMention>({
  name: "users",
  trigger: "@",
  marker: "user",
  search,
  renderItem,
  onSelect: user => `@${user.username}`,
});
```

Once the picker is open:

- Type to filter items using your `search` callback
- `↑` / `↓` to navigate the list
- `Enter` to insert the selected item
- `Esc` to close without inserting

## Rendering mention markers

`InkwellRenderer` can hydrate persisted mention markers (e.g.
`@user[<id>]`) into custom React components via the `mentions` prop.
It accepts an array of `MentionRenderer` entries; each entry pairs a
regex with a `resolve` callback that maps a `RegExpExecArray` match to
a React node:

```tsx
import { InkwellRenderer, type MentionRenderer } from "@railway/inkwell";

const mentionRenderers: MentionRenderer[] = [
  {
    pattern: /@user\[([a-z0-9-]+)\]/g,
    resolve: match => {
      const id = match[1];
      return <a href={`/users/${id}`}>@{id}</a>;
    },
  },
];

function Preview({ content }: { content: string }) {
  return <InkwellRenderer content={content} mentions={mentionRenderers} />;
}
```
