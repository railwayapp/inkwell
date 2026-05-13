---
title: "Slash Commands"
---

A reusable chat-style command palette. The menu opens when `/` is typed on an
empty or whitespace-only line, then filters as the user types without a separate
search input. Selecting or executing a command removes only the introduced
command text, such as `/label Idea`, so unrelated prose stays intact. The plugin
includes one optional argument with choices, async choice loading, disabled
commands/choices, readiness reporting for Enter-to-submit, and structured
`onExecute` payloads.

```tsx
import {
  createSlashCommandsPlugin,
  InkwellEditor,
  type SlashCommandExecution,
} from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("");
  const handleCommand = (command: SlashCommandExecution) => {
    console.log("Execute command", command);
  };

  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[
        createSlashCommandsPlugin({
          commands: [
            {
              name: "label",
              description: "Apply a document label",
              arg: {
                name: "label",
                description: "Label to apply",
                  choices: [
                  { value: "idea", label: "Idea" },
                  { value: "bug", label: "Bug" },
                ],
              },
            },
          ],
          onExecute: handleCommand,
        }),
      ]}
    />
  );
}
```

When ready, Enter calls `onExecute` with a string-only structured payload and
then clears only the active command line; the rest of the document is preserved.
For `/label Idea`, the payload is:

```ts
{
  name: "label",
  args: { label: "idea" },
  raw: "/label Idea",
}
```

The execution `args` object uses the singular `arg` name from the command
definition and the selected choice value. `submitOnEnter` / `onSubmit` remain
generic editor APIs for non-slash command submission; slash command execution
should use `onExecute`. Use `onReadyChange` only when the host UI needs to know
whether the mounted slash menu is staged for execution.
