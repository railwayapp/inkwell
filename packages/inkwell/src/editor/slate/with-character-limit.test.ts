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

function getText(editor: Editor): string {
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

    expect(getText(editor)).toBe("hello world");
  });

  it("does not enforce when enforce=false, even with a limit", () => {
    const editor = createTestEditor(5, false);
    editor.children = deserialize("");
    editor.onChange();
    Transforms.select(editor, Editor.start(editor, []));

    editor.insertText("hello world");

    expect(getText(editor)).toBe("hello world");
  });

  it("truncates insertText to fit the remaining budget", () => {
    const editor = createTestEditor(5, true);
    editor.children = deserialize("abc");
    editor.onChange();
    Transforms.select(editor, Editor.end(editor, []));

    editor.insertText("defg");

    expect(getText(editor)).toBe("abcde");
  });

  it("rejects insertText when already at the limit", () => {
    const editor = createTestEditor(3, true);
    editor.children = deserialize("abc");
    editor.onChange();
    Transforms.select(editor, Editor.end(editor, []));

    editor.insertText("x");

    expect(getText(editor)).toBe("abc");
  });

  it("allows insertText that exactly fills the limit", () => {
    const editor = createTestEditor(5, true);
    editor.children = deserialize("abc");
    editor.onChange();
    Transforms.select(editor, Editor.end(editor, []));

    editor.insertText("de");

    expect(getText(editor)).toBe("abcde");
  });

  it("truncates pasted data when it would exceed the limit", () => {
    const editor = createTestEditor(5, true);
    editor.children = deserialize("");
    editor.onChange();
    Transforms.select(editor, Editor.start(editor, []));

    // jsdom lacks DataTransfer; use a minimal stub that matches the subset
    // withCharacterLimit uses (`getData("text/plain")`).
    const data = {
      getData: (type: string) => (type === "text/plain" ? "hello world" : ""),
    } as unknown as DataTransfer;
    editor.insertData(data);

    expect(getText(editor)).toBe("hello");
  });
});
