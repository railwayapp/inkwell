import { render, screen } from "@testing-library/react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createEditor, Editor } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it, vi } from "vitest";
import { withMarkdown } from "../../editor/slate/with-markdown";
import { withNodeId } from "../../editor/slate/with-node-id";
import type {
  InkwellPluginEditor,
  PluginKeyDownContext,
  PluginRenderProps,
  SubscribeForwardedKey,
} from "../../types";
import {
  createEmojiPlugin,
  defaultEmojis,
  type EmojiItem,
  type EmojiPluginOptions,
} from ".";

/** Build a Slate editor configured the same way the real editor wraps it. */
function makeEditor(): Editor {
  const decorationsRef = {
    current: {
      heading1: true,
      heading2: true,
      heading3: true,
      heading4: true,
      heading5: true,
      heading6: true,
      lists: true,
      blockquotes: true,
      codeBlocks: true,
      images: true,
    },
  };
  return withMarkdown(
    withHistory(withNodeId(withReact(createEditor()))),
    decorationsRef,
  );
}

/** Build a controllable forwarded-key channel for plugin render tests. */

function createPluginEditor(): InkwellPluginEditor {
  return {
    getState: () => ({
      content: "",
      isEmpty: true,
      isFocused: false,
      isEditable: true,
      characterCount: 0,
      overLimit: false,
      isEnforcingCharacterLimit: false,
    }),
    isEmpty: () => true,
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

function createForwardedKeyChannel(): {
  subscribe: SubscribeForwardedKey;
  emit: (key: string) => void;
} {
  const listeners = new Set<(key: string) => void>();
  return {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: key => {
      for (const listener of listeners) listener(key);
    },
  };
}

const makeRenderProps = (
  overrides: Partial<PluginRenderProps> = {},
): PluginRenderProps => ({
  active: true,
  query: "",
  onSelect: vi.fn(),
  onDismiss: vi.fn(),
  position: { top: 0, left: 0 },
  editorRef: { current: null },
  wrapSelection: vi.fn(),
  subscribeForwardedKey: () => () => {},
  ...overrides,
  editor: overrides.editor ?? createPluginEditor(),
});

const makeKeyboardEvent = (
  key: string,
  init: KeyboardEventInit = {},
): ReactKeyboardEvent<Element> =>
  new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  }) as unknown as ReactKeyboardEvent<Element>;

const makeCtx = (editor: Editor): PluginKeyDownContext => ({
  editor: {
    getState: () => ({
      content: "",
      isEmpty: true,
      isFocused: false,
      isEditable: true,
      characterCount: 0,
      overLimit: false,
      isEnforcingCharacterLimit: false,
    }),
    isEmpty: () => false,
    focus: () => {},
    clear: () => {},
    setContent: () => {},
    insertContent: () => {},
    getContentBeforeCursor: () => {
      const { selection } = editor;
      if (!selection) return null;
      return Editor.string(editor, {
        anchor: { path: selection.anchor.path, offset: 0 },
        focus: selection.anchor,
      });
    },
    getCurrentBlockContent: () => null,
    getCurrentBlockContentBeforeCursor: () => null,
    replaceCurrentBlockContent: () => {},
    clearCurrentBlock: () => {},
    wrapSelection: () => {},
    insertImage: () => "image-id",
    updateImage: () => {},
    removeImage: () => {},
  },
  wrapSelection: vi.fn(),
  activate: vi.fn(),
  dismiss: vi.fn(),
});

const seedCursorAt = (editor: Editor, text: string, offset: number) => {
  editor.children = [
    {
      type: "paragraph",
      id: "p1",
      children: [{ text }],
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal Slate stub
  ] as any;
  editor.selection = {
    anchor: { path: [0, 0], offset },
    focus: { path: [0, 0], offset },
  };
};

describe("createEmojiPlugin", () => {
  describe("plugin shape", () => {
    it("returns a plugin with name and `:` trigger by default", () => {
      const plugin = createEmojiPlugin();
      expect(plugin.name).toBe("emoji");
      expect(
        plugin.activation?.type === "trigger"
          ? plugin.activation.key
          : undefined,
      ).toBe(":");
    });

    it("accepts a custom name and trigger character", () => {
      const plugin = createEmojiPlugin({ name: "moods", trigger: "+" });
      expect(plugin.name).toBe("moods");
      expect(
        plugin.activation?.type === "trigger"
          ? plugin.activation.key
          : undefined,
      ).toBe("+");
    });

    it("exposes shouldTrigger, onActiveKeyDown, and render", () => {
      const plugin = createEmojiPlugin();
      expect(typeof plugin.shouldTrigger).toBe("function");
      expect(typeof plugin.onActiveKeyDown).toBe("function");
      expect(typeof plugin.render).toBe("function");
    });
  });

  describe("defaultEmojis", () => {
    it("ships a non-empty curated emoji set", () => {
      expect(defaultEmojis.length).toBeGreaterThan(0);
    });

    it("every entry has glyph and lowercase searchable name", () => {
      for (const entry of defaultEmojis) {
        expect(entry.emoji.length).toBeGreaterThan(0);
        expect(entry.name).toBe(entry.name.toLowerCase());
      }
    });
  });

  describe("shouldTrigger — emoticon avoidance", () => {
    const plugin = createEmojiPlugin();
    const guard = plugin.shouldTrigger;
    if (!guard) throw new Error("emoji plugin must expose shouldTrigger");

    it("opens at the start of an empty document", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "", 0);
      expect(guard(makeKeyboardEvent(":"), makeCtx(editor))).toBe(true);
    });

    it("opens after a leading space", () => {
      const editor = makeEditor();
      seedCursorAt(editor, " ", 1);
      expect(guard(makeKeyboardEvent(":"), makeCtx(editor))).toBe(true);
    });

    it("opens after an opening parenthesis (e.g. `(:` smiley shortcut)", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "(", 1);
      expect(guard(makeKeyboardEvent(":"), makeCtx(editor))).toBe(true);
    });

    it("does NOT open inside `:)` style emoticons (prev char is a glyph)", () => {
      const editor = makeEditor();
      // The user is typing the second `:` of `::` or the `:` in `):`.
      seedCursorAt(editor, ")", 1);
      expect(guard(makeKeyboardEvent(":"), makeCtx(editor))).toBe(false);
    });

    it("does NOT open in the middle of a word (`foo:bar`)", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "foo", 3);
      expect(guard(makeKeyboardEvent(":"), makeCtx(editor))).toBe(false);
    });

    it("does NOT open when modifier keys are held", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "", 0);
      expect(
        guard(makeKeyboardEvent(":", { metaKey: true }), makeCtx(editor)),
      ).toBe(false);
      expect(
        guard(makeKeyboardEvent(":", { ctrlKey: true }), makeCtx(editor)),
      ).toBe(false);
      expect(
        guard(makeKeyboardEvent(":", { altKey: true }), makeCtx(editor)),
      ).toBe(false);
    });

    it("does NOT open for keys other than the configured trigger", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "", 0);
      expect(guard(makeKeyboardEvent("a"), makeCtx(editor))).toBe(false);
    });
  });

  describe("onActiveKeyDown — dismissal on non-word characters", () => {
    const plugin = createEmojiPlugin();
    const onActiveKeyDown = plugin.onActiveKeyDown;
    if (!onActiveKeyDown)
      throw new Error("emoji plugin must expose onActiveKeyDown");

    it("does not dismiss on letters", () => {
      const result = onActiveKeyDown(
        makeKeyboardEvent("a"),
        makeCtx(makeEditor()),
      );
      expect(result).not.toBe(false);
    });

    it("does not dismiss on digits", () => {
      const result = onActiveKeyDown(
        makeKeyboardEvent("3"),
        makeCtx(makeEditor()),
      );
      expect(result).not.toBe(false);
    });

    it("does not dismiss on `_`, `+`, `-` (valid emoji-name chars)", () => {
      for (const key of ["_", "+", "-"]) {
        const result = onActiveKeyDown(
          makeKeyboardEvent(key),
          makeCtx(makeEditor()),
        );
        expect(result).not.toBe(false);
      }
    });

    it("dismisses on whitespace", () => {
      const result = onActiveKeyDown(
        makeKeyboardEvent(" "),
        makeCtx(makeEditor()),
      );
      expect(result).toBe(false);
    });

    it("dismisses on punctuation (period, comma, slash)", () => {
      for (const key of [".", ",", "/"]) {
        const result = onActiveKeyDown(
          makeKeyboardEvent(key),
          makeCtx(makeEditor()),
        );
        expect(result).toBe(false);
      }
    });

    it("ignores multi-character keys (navigation, escape, etc.)", () => {
      for (const key of ["ArrowDown", "Enter", "Escape", "Tab"]) {
        const result = onActiveKeyDown(
          makeKeyboardEvent(key),
          makeCtx(makeEditor()),
        );
        expect(result).not.toBe(false);
      }
    });
  });

  describe("render — item rendering", () => {
    it("renders the default emoji set when active", async () => {
      const plugin = createEmojiPlugin();
      const channel = createForwardedKeyChannel();
      render(
        <div>
          {plugin.render?.(
            makeRenderProps({ subscribeForwardedKey: channel.subscribe }),
          )}
        </div>,
      );
      // The picker resolves the default emoji set through the async
      // search path on mount.
      expect(await screen.findByText(":grinning:")).toBeInTheDocument();
    });

    it("returns null when not active", () => {
      const plugin = createEmojiPlugin();
      const rendered = plugin.render?.(makeRenderProps({ active: false }));
      expect(rendered).toBeNull();
    });

    it("uses a custom emoji set when provided", async () => {
      const emojis: EmojiItem[] = [
        { emoji: "🪐", name: "saturn", shortcodes: ["ringed"] },
      ];
      const plugin = createEmojiPlugin({ emojis });
      render(<div>{plugin.render?.(makeRenderProps())}</div>);
      expect(await screen.findByText(":saturn:")).toBeInTheDocument();
    });

    it("uses a custom search callback when provided", async () => {
      const search = vi.fn(async () => [
        { emoji: "🦊", name: "fox" } as EmojiItem,
      ]);
      const options: EmojiPluginOptions = { search };
      const plugin = createEmojiPlugin(options);
      render(<div>{plugin.render?.(makeRenderProps())}</div>);
      expect(await screen.findByText(":fox:")).toBeInTheDocument();
    });

    it("renders a custom row via `renderItem`", async () => {
      const plugin = createEmojiPlugin({
        emojis: [{ emoji: "🪐", name: "saturn" }],
        renderItem: item => (
          <span data-testid="custom-row">custom:{item.name}</span>
        ),
      });
      render(<div>{plugin.render?.(makeRenderProps())}</div>);
      expect(await screen.findByTestId("custom-row")).toHaveTextContent(
        "custom:saturn",
      );
    });
  });
});
