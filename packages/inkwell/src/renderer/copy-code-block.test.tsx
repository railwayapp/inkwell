import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InkwellRenderer } from "./inkwell-renderer";

const CODE_BLOCK_MD = "```js\nconsole.log('hello');\n```";
const MULTI_BLOCK_MD =
  "```js\nfirst();\n```\n\nSome text.\n\n```py\nsecond()\n```";

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CopyCodeBlock", () => {
  it("renders a copy button inside each code block", () => {
    render(<InkwellRenderer content={CODE_BLOCK_MD} />);
    const buttons = screen.getAllByRole("button", { name: "Copy code" });
    expect(buttons).toHaveLength(1);
  });

  it("renders a copy button per code block", () => {
    render(<InkwellRenderer content={MULTI_BLOCK_MD} />);
    const buttons = screen.getAllByRole("button", { name: "Copy code" });
    expect(buttons).toHaveLength(2);
  });

  it("copies text content to clipboard on click", () => {
    render(<InkwellRenderer content={CODE_BLOCK_MD} />);
    const button = screen.getByRole("button", { name: "Copy code" });
    fireEvent.click(button);
    expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    const arg = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(arg).toContain("console.log");
  });

  it("shows checkmark icon after copying", () => {
    render(<InkwellRenderer content={CODE_BLOCK_MD} />);
    const button = screen.getByRole("button", { name: "Copy code" });
    const svgBefore = button.querySelector("svg");
    expect(svgBefore?.querySelector("rect")).toBeTruthy();

    fireEvent.click(button);

    const svgAfter = button.querySelector("svg");
    expect(svgAfter?.querySelector("polyline")).toBeTruthy();
    expect(svgAfter?.querySelector("rect")).toBeFalsy();
  });

  it("reverts to copy icon after timeout", () => {
    vi.useFakeTimers();
    render(<InkwellRenderer content={CODE_BLOCK_MD} />);
    const button = screen.getByRole("button", { name: "Copy code" });
    fireEvent.click(button);

    expect(button.querySelector("svg polyline")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(button.querySelector("svg rect")).toBeTruthy();
    expect(button.querySelector("svg polyline")).toBeFalsy();
    vi.useRealTimers();
  });

  it("does not render copy button when copyButton is false", () => {
    render(<InkwellRenderer content={CODE_BLOCK_MD} copyButton={false} />);
    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
  });

  it("wraps code block in container div", () => {
    const { container } = render(<InkwellRenderer content={CODE_BLOCK_MD} />);
    const wrapper = container.querySelector(".inkwell-renderer-code-block");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.querySelector("pre")).toBeTruthy();
    expect(wrapper?.querySelector(".inkwell-renderer-copy-btn")).toBeTruthy();
  });

  it("does not wrap code block when copyButton is false", () => {
    const { container } = render(
      <InkwellRenderer content={CODE_BLOCK_MD} copyButton={false} />,
    );
    expect(container.querySelector(".inkwell-renderer-code-block")).toBeNull();
    expect(container.querySelector("pre")).toBeTruthy();
  });

  it("passes through additional props to pre element", () => {
    const { container } = render(<InkwellRenderer content={CODE_BLOCK_MD} />);
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
  });

  it("user components.pre override takes precedence", () => {
    render(
      <InkwellRenderer
        content={CODE_BLOCK_MD}
        components={{
          pre: ({ children }) => <pre data-testid="custom-pre">{children}</pre>,
        }}
      />,
    );
    expect(screen.getByTestId("custom-pre")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
  });
});
