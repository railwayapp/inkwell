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
  it("renders legacy list-item elements as plain paragraphs", () => {
    const { container } = renderElement("list-item", {
      children: [{ text: "- item" }],
    });
    const p = container.querySelector("p");
    expect(p).not.toHaveAttribute("data-list");
    expect(p).not.toHaveClass("inkwell-editor-list-item");
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

describe("RenderElement — image", () => {
  it("renders an https URL through to the <img src>", () => {
    const { container } = renderElement("image", {
      url: "https://example.com/cat.png",
      alt: "cat",
    });
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/cat.png");
    expect(img).toHaveAttribute("alt", "cat");
  });

  it("renders relative URLs", () => {
    const { container } = renderElement("image", {
      url: "/img/cat.png",
      alt: "",
    });
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/img/cat.png",
    );
  });

  it("omits the src attribute for javascript: URLs", () => {
    const { container } = renderElement("image", {
      url: "javascript:alert(1)",
      alt: "x",
    });
    const img = container.querySelector("img");
    // sanitizeImageUrl returns undefined for unsafe URLs and React
    // skips the attribute entirely — the dangerous URL never reaches
    // the DOM, and the browser doesn't re-fetch the page on empty src.
    expect(img?.hasAttribute("src")).toBe(false);
    // Alt is preserved so users still see the broken image hint.
    expect(img).toHaveAttribute("alt", "x");
  });

  it("omits the src attribute for data:image/svg+xml URLs (SVG can run inline scripts)", () => {
    const { container } = renderElement("image", {
      url: "data:image/svg+xml;utf8,<svg onload=alert(1)/>",
      alt: "",
    });
    expect(container.querySelector("img")?.hasAttribute("src")).toBe(false);
  });

  it("keeps data:image/png URLs", () => {
    const { container } = renderElement("image", {
      url: "data:image/png;base64,iVBORw0K",
      alt: "",
    });
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "data:image/png;base64,iVBORw0K",
    );
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
