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
  it("renders heading as the matching hN tag with editor classes", () => {
    const { container } = renderElement("heading", { level: 2 });
    const h2 = container.querySelector("h2");
    expect(h2).toBeInTheDocument();
    expect(h2).toHaveClass("inkwell-editor-heading");
    expect(h2).toHaveClass("inkwell-editor-heading-2");
  });

  it("renders heading level 1 by default when level is undefined", () => {
    const { container } = renderElement("heading");
    const h1 = container.querySelector("h1");
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveClass("inkwell-editor-heading-1");
  });

  it("renders heading level 6", () => {
    const { container } = renderElement("heading", { level: 6 });
    const h6 = container.querySelector("h6");
    expect(h6).toBeInTheDocument();
    expect(h6).toHaveClass("inkwell-editor-heading-6");
  });
});

describe("RenderElement — lists", () => {
  it("renders an unordered list as a <ul>", () => {
    const { container } = renderElement("list", {});
    expect(container.querySelector("ul")).toBeInTheDocument();
    expect(container.querySelector("ol")).not.toBeInTheDocument();
  });

  it("renders an ordered list as an <ol>", () => {
    const { container } = renderElement("list", { ordered: true });
    expect(container.querySelector("ol")).toBeInTheDocument();
  });

  it("forwards a non-1 start as the `start` attribute on <ol>", () => {
    const { container } = renderElement("list", {
      ordered: true,
      start: 3,
    });
    expect(container.querySelector("ol")?.getAttribute("start")).toBe("3");
  });

  it("renders list-item as <li>", () => {
    const { container } = renderElement("list-item", {});
    expect(container.querySelector("li")).toBeInTheDocument();
  });
});

describe("RenderElement — code blocks", () => {
  it("renders code-block as a <pre> with the editor class", () => {
    const { container } = renderElement("code-block");
    const pre = container.querySelector(".inkwell-editor-code-block");
    expect(pre).toBeInTheDocument();
    expect(pre?.tagName.toLowerCase()).toBe("pre");
  });

  it("surfaces the language tag as data-lang", () => {
    const { container } = renderElement("code-block", { lang: "ts" });
    const pre = container.querySelector(".inkwell-editor-code-block");
    expect(pre).toHaveAttribute("data-lang", "ts");
  });

  it("nests the code text inside a <code> element", () => {
    const { container } = renderElement("code-block");
    expect(
      container.querySelector(".inkwell-editor-code-block > code"),
    ).toBeInTheDocument();
  });
});

describe("RenderElement — blockquote", () => {
  it("renders blockquote as a <blockquote> with editor class", () => {
    const { container } = renderElement("blockquote");
    const blockquote = container.querySelector("blockquote");
    expect(blockquote).toBeInTheDocument();
    expect(blockquote).toHaveClass("inkwell-editor-blockquote");
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
