import { createEditor, Editor, Transforms } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it } from "vitest";
import { deserialize } from "./deserialize";
import type { InkwellElement } from "./types";
import { withCharacterLimit } from "./with-character-limit";
import { withNodeId } from "./with-node-id";

function createTestEditor(limit: number | undefined, enforce: boolean) {
  const ref = { current: { limit, enforce } };
  return withCharacterLimit(
    withHistory(withNodeId(withReact(createEditor()))),
    ref,
  );
}

function getContent(editor: Editor): string {
  return (editor.children as InkwellElement[])
    .map(n => n.children.map(c => ("text" in c ? c.text : "")).join(""))
    .join("");
}

describe("withCharacterLimit", () => {
  it("inserts text freely when no limit is set", () => {
    const editor = createTestEditor(undefined, false);
    editor.children = deserialize("");
    editor.onChange();
    Transforms.select(editor, Editor.start(editor, []));

    editor.insertText("hello world");

    expect(getContent(editor)).toBe("hello world");
  });

  it("does not enforce when enforce=false, even with a limit", () => {
    const editor = createTestEditor(5, false);
    editor.children = deserialize("");
    editor.onChange();
    Transforms.select(editor, Editor.start(editor, []));

    editor.insertText("hello world");

    expect(getContent(editor)).toBe("hello world");
  });

  it("truncates insertText to fit the remaining budget", () => {
    const editor = createTestEditor(5, true);
    editor.children = deserialize("abc");
    editor.onChange();
    Transforms.select(editor, Editor.end(editor, []));

    editor.insertText("defg");

    expect(getContent(editor)).toBe("abcde");
  });

  it("rejects insertText when already at the limit", () => {
    const editor = createTestEditor(3, true);
    editor.children = deserialize("abc");
    editor.onChange();
    Transforms.select(editor, Editor.end(editor, []));

    editor.insertText("x");

    expect(getContent(editor)).toBe("abc");
  });

  it("allows insertText that exactly fills the limit", () => {
    const editor = createTestEditor(5, true);
    editor.children = deserialize("abc");
    editor.onChange();
    Transforms.select(editor, Editor.end(editor, []));

    editor.insertText("de");

    expect(getContent(editor)).toBe("abcde");
  });

  it("truncates pasted data when it would exceed the limit", () => {
    const editor = createTestEditor(5, true);
    editor.children = deserialize("");
    editor.onChange();
    Transforms.select(editor, Editor.start(editor, []));

    // jsdom lacks DataTransfer; use a minimal stub that matches the subset
    // withCharacterLimit uses (`getData("text/plain")`).
    const data = {
      types: ["text/plain"],
      getData: (type: string) => (type === "text/plain" ? "hello world" : ""),
    } as unknown as DataTransfer;
    editor.insertData(data);

    expect(getContent(editor)).toBe("hello");
  });

  it(
    "allows replacing a selection at the limit because the replacement " +
      "first deletes the selected text",
    () => {
      const editor = createTestEditor(5, true);
      editor.children = deserialize("abcde");
      editor.onChange();

      // Select "cde" — the trailing 3 chars.
      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 2 },
        focus: { path: [0, 0], offset: 5 },
      });

      // Typing a single char should replace the selection: effective
      // pre-insert length is 5 - 3 = 2, so 2 + 1 = 3 fits within limit 5.
      editor.insertText("X");

      expect(getContent(editor)).toBe("abX");
    },
  );

  it(
    "does not overcount when pasting into a non-collapsed selection " +
      "that overlaps the limit",
    () => {
      const editor = createTestEditor(5, true);
      editor.children = deserialize("abcde");
      editor.onChange();

      // Select all 5 chars and paste "xyz" — should be accepted in full
      // (3 ≤ limit 5) rather than rejected because raw length was 5.
      Transforms.select(editor, {
        anchor: { path: [0, 0], offset: 0 },
        focus: { path: [0, 0], offset: 5 },
      });
      const data = {
        types: ["text/plain"],
        getData: (type: string) => (type === "text/plain" ? "xyz" : ""),
      } as unknown as DataTransfer;
      editor.insertData(data);

      expect(getContent(editor)).toBe("xyz");
    },
  );

  it(
    "keeps a clipped paste flowing through the downstream insertData so " +
      "markdown-paste handling still parses headings/etc.",
    () => {
      // Spy on the base `insertData` to confirm it sees a DataTransfer whose
      // text/plain payload was clipped — not a flat `insertText` call.
      const base = withHistory(withNodeId(withReact(createEditor())));
      const seen: string[] = [];
      const originalInsertData = base.insertData;
      base.insertData = data => {
        seen.push(data.getData("text/plain"));
        originalInsertData(data);
      };
      const ref = { current: { limit: 10, enforce: true } };
      const editor = withCharacterLimit(base, ref);
      editor.children = deserialize("");
      editor.onChange();
      Transforms.select(editor, Editor.start(editor, []));

      const data = {
        types: ["text/plain"],
        getData: (type: string) =>
          type === "text/plain" ? "## Heading clipped" : "",
      } as unknown as DataTransfer;
      editor.insertData(data);

      expect(seen).toEqual(["## Heading"]);
    },
  );
});
