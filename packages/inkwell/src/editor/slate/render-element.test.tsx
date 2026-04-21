import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RenderElement } from "./render-element";

function renderElement(type: string, props?: Record<string, unknown>) {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  const attributes = { "data-slate-node": "element", ref: null } as any;
  const element = { type, children: [{ text: "" }], ...props };

  return render(
    <RenderElement attributes={attributes} element={element as never}>
      <span>content</span>
    </RenderElement>,
  );
}

describe("RenderElement — heading", () => {
  it("renders heading with inkwell-editor-heading class", () => {
    const { container } = renderElement("heading", { level: 2 });
    const p = container.querySelector("p");
    expect(p).toHaveClass("inkwell-editor-heading");
    expect(p).toHaveClass("inkwell-editor-heading-2");
  });

  it("renders heading level 1 by default when level is undefined", () => {
    const { container } = renderElement("heading");
    const p = container.querySelector("p");
    expect(p).toHaveClass("inkwell-editor-heading-1");
  });

  it("renders heading level 6", () => {
    const { container } = renderElement("heading", { level: 6 });
    const p = container.querySelector("p");
    expect(p).toHaveClass("inkwell-editor-heading-6");
  });
});

describe("RenderElement — list-item", () => {
  it("renders list-item with data-list attribute and class", () => {
    const { container } = renderElement("list-item");
    const p = container.querySelector("p");
    expect(p).toHaveAttribute("data-list");
    expect(p).toHaveClass("inkwell-editor-list-item");
  });
});

describe("RenderElement — code blocks", () => {
  it("renders code-fence with inkwell-editor-code-fence class", () => {
    const { container } = renderElement("code-fence");
    expect(
      container.querySelector(".inkwell-editor-code-fence"),
    ).toBeInTheDocument();
  });

  it("renders code-line with inkwell-editor-code-line class", () => {
    const { container } = renderElement("code-line");
    expect(
      container.querySelector(".inkwell-editor-code-line"),
    ).toBeInTheDocument();
  });
});

describe("RenderElement — blockquote", () => {
  it("renders blockquote with inkwell-editor-blockquote class", () => {
    const { container } = renderElement("blockquote");
    expect(
      container.querySelector(".inkwell-editor-blockquote"),
    ).toBeInTheDocument();
  });
});

describe("RenderElement — paragraph (default)", () => {
  it("renders paragraph as plain p element", () => {
    const { container } = renderElement("paragraph");
    const p = container.querySelector("p");
    expect(p).toBeInTheDocument();
    expect(p?.className).toBe("");
  });

  it("renders unknown type as paragraph (fallback)", () => {
    const { container } = renderElement("unknown-type");
    const p = container.querySelector("p");
    expect(p).toBeInTheDocument();
  });
});
