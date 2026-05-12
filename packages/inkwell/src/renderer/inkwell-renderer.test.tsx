import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InkwellRenderer } from "./inkwell-renderer";

describe("InkwellRenderer", () => {
  it("renders markdown content as HTML", () => {
    render(<InkwellRenderer content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders a heading", () => {
    render(<InkwellRenderer content="# Title" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Title",
    );
  });

  it("renders bold text", () => {
    render(<InkwellRenderer content="**bold text**" />);
    const strong = screen.getByText("bold text");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders italic text", () => {
    render(<InkwellRenderer content="_italic text_" />);
    const em = screen.getByText("italic text");
    expect(em.tagName).toBe("EM");
  });

  it("renders strikethrough text", () => {
    render(<InkwellRenderer content="~~deleted~~" />);
    const del = screen.getByText("deleted");
    expect(del.tagName).toBe("DEL");
  });

  it("renders links", () => {
    render(<InkwellRenderer content="[link](https://example.com)" />);
    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders inline code", () => {
    render(<InkwellRenderer content="use `code` here" />);
    const code = screen.getByText("code");
    expect(code.tagName).toBe("CODE");
  });

  it("renders code blocks", () => {
    const md = "```\nconst x = 1;\n```";
    const { container } = render(<InkwellRenderer content={md} />);
    expect(container.querySelector("pre")).toBeInTheDocument();
    expect(container.querySelector("code")).toBeInTheDocument();
  });

  it("renders unordered lists", () => {
    const md = "- apple\n- banana";
    const { container } = render(<InkwellRenderer content={md} />);
    expect(container.querySelector("ul")).toBeInTheDocument();
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("apple");
  });

  it("renders ordered lists", () => {
    const md = "1. first\n2. second";
    const { container } = render(<InkwellRenderer content={md} />);
    expect(container.querySelector("ol")).toBeInTheDocument();
  });

  it("renders blockquotes", () => {
    const { container } = render(<InkwellRenderer content="> quoted text" />);
    expect(container.querySelector("blockquote")).toBeInTheDocument();
  });

  it("renders horizontal rules", () => {
    const { container } = render(<InkwellRenderer content="---" />);
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("does not render GFM tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const { container } = render(<InkwellRenderer content={md} />);
    expect(container.querySelector("table")).not.toBeInTheDocument();
  });

  it("applies the inkwell-renderer class", () => {
    const { container } = render(<InkwellRenderer content="test" />);
    expect(container.firstChild).toHaveClass("inkwell-renderer");
  });

  it("applies a custom className", () => {
    const { container } = render(
      <InkwellRenderer content="test" className="my-class" />,
    );
    expect(container.firstChild).toHaveClass("inkwell-renderer");
    expect(container.firstChild).toHaveClass("my-class");
  });

  it("renders empty content without crashing", () => {
    const { container } = render(<InkwellRenderer content="" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders complex nested content", () => {
    const md =
      "# Title\n\nA **bold** and _italic_ paragraph.\n\n> A quote\n\n- list item";
    render(<InkwellRenderer content={md} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("italic")).toBeInTheDocument();
  });

  it("applies custom component overrides", () => {
    const CustomH1 = (props: { children?: React.ReactNode }) => (
      <h1 data-testid="custom-h1">{props.children}</h1>
    );
    render(<InkwellRenderer content="# Test" components={{ h1: CustomH1 }} />);
    expect(screen.getByTestId("custom-h1")).toHaveTextContent("Test");
  });
});
