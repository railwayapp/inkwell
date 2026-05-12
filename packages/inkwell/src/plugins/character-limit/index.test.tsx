import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { InkwellPluginEditor, PluginRenderProps } from "../../types";
import { createCharacterLimitPlugin } from ".";

function createPluginEditor({
  count,
  limit,
  overLimit,
  isEnforcingCharacterLimit = false,
}: {
  count: number;
  limit?: number;
  overLimit: boolean;
  isEnforcingCharacterLimit?: boolean;
}): InkwellPluginEditor {
  return {
    getState: () => ({
      content: "x".repeat(count),
      isEmpty: count === 0,
      isFocused: false,
      isEditable: true,
      characterCount: count,
      characterLimit: limit,
      overLimit,
      isEnforcingCharacterLimit,
    }),
    isEmpty: () => count === 0,
    focus: () => {},
    clear: () => {},
    setContent: () => {},
    insertContent: () => {},
    getContentBeforeCursor: () => "",
    getCurrentBlockContent: () => "",
    getCurrentBlockContentBeforeCursor: () => "",
    replaceCurrentBlockContent: () => {},
    clearCurrentBlock: () => {},
    wrapSelection: () => {},
    insertImage: () => "image-id",
    updateImage: () => {},
    removeImage: () => {},
  };
}

function createRenderProps(editor: InkwellPluginEditor): PluginRenderProps {
  return {
    active: true,
    query: "",
    onSelect: () => {},
    onDismiss: () => {},
    position: { top: 0, left: 0 },
    editorRef: { current: null },
    editor,
    wrapSelection: () => {},
    subscribeForwardedKey: () => () => {},
  };
}

function renderPlugin(editor: InkwellPluginEditor) {
  const plugin = createCharacterLimitPlugin();
  const node = plugin.render?.(createRenderProps(editor));
  return render(<>{node}</>);
}

describe("createCharacterLimitPlugin", () => {
  it("returns the default plugin name", () => {
    expect(createCharacterLimitPlugin().name).toBe("character-limit");
  });

  it("allows a custom plugin name", () => {
    expect(createCharacterLimitPlugin({ name: "composer-limit" }).name).toBe(
      "composer-limit",
    );
  });

  it("does not render without a character limit", () => {
    const editor = createPluginEditor({ count: 12, overLimit: false });
    const { container } = renderPlugin(editor);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not render while under the limit", () => {
    const editor = createPluginEditor({
      count: 9,
      limit: 10,
      overLimit: false,
    });
    const { container } = renderPlugin(editor);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not render exactly at the limit when enforcement is disabled", () => {
    const editor = createPluginEditor({
      count: 10,
      limit: 10,
      overLimit: false,
    });
    const { container } = renderPlugin(editor);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders an accessible over-limit status", () => {
    const editor = createPluginEditor({
      count: 14,
      limit: 10,
      overLimit: true,
    });
    renderPlugin(editor);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Over limit by 4");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("inkwell-editor-limit-toast");
  });

  it("renders at the limit when enforcement is enabled", () => {
    const editor = createPluginEditor({
      count: 10,
      limit: 10,
      overLimit: false,
      isEnforcingCharacterLimit: true,
    });
    renderPlugin(editor);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Character limit reached");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});
