import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInkwell } from "./use-inkwell";

const HookEditor = ({
  onChange,
  onStateChange,
}: {
  onChange?: (content: string) => void;
  onStateChange?: Parameters<typeof useInkwell>[0]["onStateChange"];
}) => {
  const { state, EditorInstance, editor } = useInkwell({
    content: "hello",
    onChange,
    onStateChange,
    characterLimit: 10,
  });

  return (
    <>
      <div data-testid="content-state">{state.content}</div>
      <div data-testid="count-state">{state.characterCount}</div>
      <button type="button" onClick={() => editor.setContent("updated")}>
        Replace
      </button>
      <button type="button" onClick={() => editor.clear()}>
        Clear
      </button>
      <EditorInstance />
    </>
  );
};

describe("useInkwell", () => {
  it("returns state, a grouped editor controller, and a render component", () => {
    render(<HookEditor />);

    expect(screen.getByTestId("content-state")).toHaveTextContent("hello");
    expect(screen.getByTestId("count-state")).toHaveTextContent("5");
    expect(screen.getByRole("textbox")).toHaveTextContent("hello");
  });

  it("updates content through the grouped editor controller", async () => {
    const onChange = vi.fn();
    render(<HookEditor onChange={onChange} />);
    // Flush slate-react's post-mount effects so the click below is the
    // only source of state changes inside the act block.
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByText("Replace"));
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("content-state")).toHaveTextContent("updated");
    expect(screen.getByRole("textbox")).toHaveTextContent("updated");
  });

  it("passes state changes to the user callback", () => {
    const onStateChange = vi.fn();
    render(<HookEditor onStateChange={onStateChange} />);

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "hello",
        characterCount: 5,
        characterLimit: 10,
      }),
    );
  });
});
