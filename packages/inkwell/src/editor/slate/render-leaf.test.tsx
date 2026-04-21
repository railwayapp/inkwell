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

describe("RenderLeaf — remote cursor highlight", () => {
  it("renders cursor highlight with correct background color", () => {
    const { container } = renderLeaf({ remoteCursor: "#ff0000" });

    const cursorSpan = container.querySelector(".inkwell-editor-remote-cursor");
    expect(cursorSpan).toBeInTheDocument();
    expect(cursorSpan).toHaveStyle({ backgroundColor: "#ff000030" });
  });

  it("renders without cursor class when remoteCursor is absent", () => {
    const { container } = renderLeaf({});

    const cursorSpan = container.querySelector(".inkwell-editor-remote-cursor");
    expect(cursorSpan).not.toBeInTheDocument();
  });
});

describe("RenderLeaf — remote cursor caret", () => {
  it("renders caret with correct border color", () => {
    const { container } = renderLeaf({
      remoteCursor: "#0000ff",
      remoteCursorCaret: true,
    });

    const caretSpan = container.querySelector(".inkwell-editor-remote-caret");
    expect(caretSpan).toBeInTheDocument();
    expect(caretSpan).toHaveStyle({ borderColor: "#0000ff" });
    expect(caretSpan).toHaveAttribute("contenteditable", "false");
  });

  it("does not render caret when remoteCursorCaret is absent", () => {
    const { container } = renderLeaf({ remoteCursor: "#ff0000" });

    const caretSpan = container.querySelector(".inkwell-editor-remote-caret");
    expect(caretSpan).not.toBeInTheDocument();
  });

  it("renders both highlight and caret together", () => {
    const { container } = renderLeaf({
      remoteCursor: "#00ff00",
      remoteCursorCaret: true,
    });

    expect(
      container.querySelector(".inkwell-editor-remote-cursor"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".inkwell-editor-remote-caret"),
    ).toBeInTheDocument();
  });
});

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

describe("RenderLeaf — cursor + formatting stacking", () => {
  it("renders cursor highlight with bold content", () => {
    const { container } = renderLeaf({
      bold: true,
      remoteCursor: "#ff0000",
    });

    expect(container.querySelector("strong")).toBeInTheDocument();
    expect(
      container.querySelector(".inkwell-editor-remote-cursor"),
    ).toBeInTheDocument();
  });

  it("renders cursor highlight with hljs syntax class", () => {
    const { container } = renderLeaf({
      hljs: "hljs-keyword",
      remoteCursor: "#ff0000",
    });

    expect(container.querySelector(".hljs-keyword")).toBeInTheDocument();
    expect(
      container.querySelector(".inkwell-editor-remote-cursor"),
    ).toBeInTheDocument();
  });

  it("renders marker spans without cursor when no remoteCursor", () => {
    const { container } = renderLeaf({ boldMarker: true });

    expect(
      container.querySelector(".inkwell-editor-marker"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".inkwell-editor-remote-cursor"),
    ).not.toBeInTheDocument();
  });
});
