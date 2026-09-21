import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import { ReactEditor } from "slate-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InkwellEditor } from "../../editor/inkwell-editor";
import type { InkwellEditorHandle } from "../../types";
import { createEmojiPlugin } from ".";

beforeEach(() => {
  vi.spyOn(ReactEditor, "hasEditableTarget").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
});

describe("emoji plugin — integration with InkwellEditor", () => {
  it("opens the picker when `:` is typed at the start of an empty editor", async () => {
    const ref = createRef<InkwellEditorHandle>();
    const emoji = createEmojiPlugin();
    const { container } = render(
      <InkwellEditor
        ref={ref}
        content=""
        onChange={vi.fn()}
        plugins={[emoji]}
      />,
    );
    act(() => {
      ref.current?.focus({ at: "end" });
    });
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    act(() => {
      fireEvent.keyDown(editor, { key: ":" });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText(/search emoji/i)).toBeInTheDocument();
    });
  });

  it("opens the picker after a space (token boundary)", async () => {
    const ref = createRef<InkwellEditorHandle>();
    const emoji = createEmojiPlugin();
    const { container } = render(
      <InkwellEditor
        ref={ref}
        content="hello "
        onChange={vi.fn()}
        plugins={[emoji]}
      />,
    );
    act(() => {
      ref.current?.focus({ at: "end" });
    });
    const editor = container.querySelector(".inkwell-editor") as HTMLElement;
    act(() => {
      fireEvent.keyDown(editor, { key: ":" });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText(/search emoji/i)).toBeInTheDocument();
    });
  });
});
