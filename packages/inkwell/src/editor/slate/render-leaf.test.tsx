import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RenderLeaf } from "./render-leaf";

function renderLeaf(leafProps: Record<string, unknown>) {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  const attributes = { "data-slate-leaf": true } as any;
  const leaf = { text: "test", ...leafProps };

  return render(
    <RenderLeaf attributes={attributes} leaf={leaf} text={leaf as never}>
      <span>test content</span>
    </RenderLeaf>,
  );
}

describe("RenderLeaf — marker branches", () => {
  it("renders italicMarker with inkwell-editor-marker class", () => {
    const { container } = renderLeaf({ italicMarker: true });
    expect(
      container.querySelector(".inkwell-editor-marker"),
    ).toBeInTheDocument();
  });

  it("renders strikeMarker with inkwell-editor-marker class", () => {
    const { container } = renderLeaf({ strikeMarker: true });
    expect(
      container.querySelector(".inkwell-editor-marker"),
    ).toBeInTheDocument();
  });

  it("renders codeMarker with inkwell-backtick class", () => {
    const { container } = renderLeaf({ codeMarker: true });
    expect(
      container.querySelector(".inkwell-editor-backtick"),
    ).toBeInTheDocument();
  });
});

describe("RenderLeaf — stacked content marks", () => {
  it("renders bold and italic stacked", () => {
    const { container } = renderLeaf({ bold: true, italic: true });
    expect(container.querySelector("strong")).toBeInTheDocument();
    expect(container.querySelector("em")).toBeInTheDocument();
  });

  it("renders italic and strikethrough stacked", () => {
    const { container } = renderLeaf({ italic: true, strikethrough: true });
    expect(container.querySelector("em")).toBeInTheDocument();
    expect(container.querySelector("del")).toBeInTheDocument();
  });

  it("renders bold, italic, and inlineCode stacked", () => {
    const { container } = renderLeaf({
      bold: true,
      italic: true,
      inlineCode: true,
    });
    expect(container.querySelector("strong")).toBeInTheDocument();
    expect(container.querySelector("em")).toBeInTheDocument();
    expect(container.querySelector("code")).toBeInTheDocument();
  });
});
