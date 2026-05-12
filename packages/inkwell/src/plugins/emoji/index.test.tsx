import { render, screen } from "@testing-library/react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createEditor, type Editor } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it, vi } from "vitest";
import { withMarkdown } from "../../editor/slate/with-markdown";
import { withNodeId } from "../../editor/slate/with-node-id";
import type {
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

const baseCtx: PluginKeyDownContext = {
  wrapSelection: vi.fn(),
  setActivePlugin: vi.fn(),
};

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
      expect(plugin.trigger?.key).toBe(":");
    });

    it("accepts a custom name and trigger character", () => {
      const plugin = createEmojiPlugin({ name: "moods", trigger: "+" });
      expect(plugin.name).toBe("moods");
      expect(plugin.trigger?.key).toBe("+");
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
      expect(guard(makeKeyboardEvent(":"), editor)).toBe(true);
    });

    it("opens after a leading space", () => {
      const editor = makeEditor();
      seedCursorAt(editor, " ", 1);
      expect(guard(makeKeyboardEvent(":"), editor)).toBe(true);
    });

    it("opens after an opening parenthesis (e.g. `(:` smiley shortcut)", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "(", 1);
      expect(guard(makeKeyboardEvent(":"), editor)).toBe(true);
    });

    it("does NOT open inside `:)` style emoticons (prev char is a glyph)", () => {
      const editor = makeEditor();
      // The user is typing the second `:` of `::` or the `:` in `):`.
      seedCursorAt(editor, ")", 1);
      expect(guard(makeKeyboardEvent(":"), editor)).toBe(false);
    });

    it("does NOT open in the middle of a word (`foo:bar`)", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "foo", 3);
      expect(guard(makeKeyboardEvent(":"), editor)).toBe(false);
    });

    it("does NOT open when modifier keys are held", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "", 0);
      expect(guard(makeKeyboardEvent(":", { metaKey: true }), editor)).toBe(
        false,
      );
      expect(guard(makeKeyboardEvent(":", { ctrlKey: true }), editor)).toBe(
        false,
      );
      expect(guard(makeKeyboardEvent(":", { altKey: true }), editor)).toBe(
        false,
      );
    });

    it("does NOT open for keys other than the configured trigger", () => {
      const editor = makeEditor();
      seedCursorAt(editor, "", 0);
      expect(guard(makeKeyboardEvent("a"), editor)).toBe(false);
    });
  });

  describe("onActiveKeyDown — dismissal on non-word characters", () => {
    const plugin = createEmojiPlugin();
    const onActiveKeyDown = plugin.onActiveKeyDown;
    if (!onActiveKeyDown)
      throw new Error("emoji plugin must expose onActiveKeyDown");

    it("does not dismiss on letters", () => {
      const editor = makeEditor();
      const result = onActiveKeyDown(
        makeKeyboardEvent("a"),
        { ...baseCtx, dismiss: vi.fn() },
        editor,
      );
      expect(result).not.toBe(false);
    });

    it("does not dismiss on digits", () => {
      const editor = makeEditor();
      const result = onActiveKeyDown(
        makeKeyboardEvent("3"),
        { ...baseCtx, dismiss: vi.fn() },
        editor,
      );
      expect(result).not.toBe(false);
    });

    it("does not dismiss on `_`, `+`, `-` (valid emoji-name chars)", () => {
      const editor = makeEditor();
      for (const key of ["_", "+", "-"]) {
        const result = onActiveKeyDown(
          makeKeyboardEvent(key),
          { ...baseCtx, dismiss: vi.fn() },
          editor,
        );
        expect(result).not.toBe(false);
      }
    });

    it("dismisses on whitespace", () => {
      const editor = makeEditor();
      const result = onActiveKeyDown(
        makeKeyboardEvent(" "),
        { ...baseCtx, dismiss: vi.fn() },
        editor,
      );
      expect(result).toBe(false);
    });

    it("dismisses on punctuation (period, comma, slash)", () => {
      const editor = makeEditor();
      for (const key of [".", ",", "/"]) {
        const result = onActiveKeyDown(
          makeKeyboardEvent(key),
          { ...baseCtx, dismiss: vi.fn() },
          editor,
        );
        expect(result).toBe(false);
      }
    });

    it("ignores multi-character keys (navigation, escape, etc.)", () => {
      const editor = makeEditor();
      for (const key of ["ArrowDown", "Enter", "Escape", "Tab"]) {
        const result = onActiveKeyDown(
          makeKeyboardEvent(key),
          { ...baseCtx, dismiss: vi.fn() },
          editor,
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
          {plugin.render(
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
      const rendered = plugin.render(makeRenderProps({ active: false }));
      expect(rendered).toBeNull();
    });

    it("uses a custom emoji set when provided", async () => {
      const emojis: EmojiItem[] = [
        { emoji: "🪐", name: "saturn", shortcodes: ["ringed"] },
      ];
      const plugin = createEmojiPlugin({ emojis });
      render(<div>{plugin.render(makeRenderProps())}</div>);
      expect(await screen.findByText(":saturn:")).toBeInTheDocument();
    });

    it("uses a custom search callback when provided", async () => {
      const search = vi.fn(async () => [
        { emoji: "🦊", name: "fox" } as EmojiItem,
      ]);
      const options: EmojiPluginOptions = { search };
      const plugin = createEmojiPlugin(options);
      render(<div>{plugin.render(makeRenderProps())}</div>);
      expect(await screen.findByText(":fox:")).toBeInTheDocument();
    });

    it("renders a custom row via `renderItem`", async () => {
      const plugin = createEmojiPlugin({
        emojis: [{ emoji: "🪐", name: "saturn" }],
        renderItem: item => (
          <span data-testid="custom-row">custom:{item.name}</span>
        ),
      });
      render(<div>{plugin.render(makeRenderProps())}</div>);
      expect(await screen.findByTestId("custom-row")).toHaveTextContent(
        "custom:saturn",
      );
    });
  });
});
