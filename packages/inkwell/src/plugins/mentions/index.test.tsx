import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  InkwellPluginEditor,
  PluginRenderProps,
  SubscribeForwardedKey,
} from "../../types";
import { createMentionsPlugin, type MentionItem } from ".";

const USERS: MentionItem[] = [
  { id: "1", title: "Alice" },
  { id: "2", title: "Bob" },
  { id: "3", title: "Carol" },
];

/**
 * Build a controllable forwarded-key channel for tests. The picker
 * subscribes through props — tests drive keys by calling `emit`.
 */

function createPluginEditor(): InkwellPluginEditor {
  return {
    getState: () => ({
      content: "",
      isEmpty: true,
      isFocused: false,
      isEditable: true,
      characterCount: 0,
      overLimit: false,
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

const makeDefaultRenderProps = (
  overrides: Partial<PluginRenderProps> = {},
): PluginRenderProps => ({
  active: true,
  query: "",
  onSelect: vi.fn(),
  onDismiss: vi.fn(),
  position: { top: 10, left: 20 },
  editorRef: { current: null },
  wrapSelection: vi.fn(),
  subscribeForwardedKey: () => () => {},
  ...overrides,
  editor: overrides.editor ?? createPluginEditor(),
});

const defaultRenderProps = makeDefaultRenderProps();

describe("createMentionsPlugin", () => {
  it("returns a plugin with the configured name and trigger", () => {
    const plugin = createMentionsPlugin({
      name: "users",
      trigger: "@",
      marker: "user",
      search: () => USERS,
      renderItem: item => <span>{item.title}</span>,
    });
    expect(plugin.name).toBe("users");
    expect(
      plugin.activation?.type === "trigger" ? plugin.activation.key : undefined,
    ).toBe("@");
  });

  it("inserts default marker form when no onSelect is provided", async () => {
    const onSelect = vi.fn();
    const plugin = createMentionsPlugin({
      name: "users",
      trigger: "@",
      marker: "user",
      search: () => USERS,
      renderItem: item => <span>{item.title}</span>,
    });

    render(<div>{plugin.render?.({ ...defaultRenderProps, onSelect })}</div>);

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Alice"));

    expect(onSelect).toHaveBeenCalledWith("@user[1]");
  });

  it("inserts the custom text when onSelect is provided", async () => {
    const parentOnSelect = vi.fn();
    const plugin = createMentionsPlugin<MentionItem>({
      name: "users",
      trigger: "@",
      marker: "user",
      search: () => USERS,
      renderItem: item => <span>{item.title}</span>,
      onSelect: item => `**${item.title}**`,
    });

    render(
      <div>
        {plugin.render?.({ ...defaultRenderProps, onSelect: parentOnSelect })}
      </div>,
    );

    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Bob"));

    expect(parentOnSelect).toHaveBeenCalledWith("**Bob**");
  });

  it("filters via the provided async search callback", async () => {
    const search = vi.fn(async (query: string) =>
      USERS.filter(u => u.title.toLowerCase().includes(query.toLowerCase())),
    );
    const plugin = createMentionsPlugin({
      name: "users",
      trigger: "@",
      marker: "user",
      search,
      renderItem: item => <span>{item.title}</span>,
    });
    const channel = createForwardedKeyChannel();

    render(
      <div>
        {plugin.render?.(
          makeDefaultRenderProps({ subscribeForwardedKey: channel.subscribe }),
        )}
      </div>,
    );

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());

    act(() => {
      channel.emit("c");
      channel.emit("a");
    });
    await act(async () => {});

    await waitFor(() => {
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      expect(screen.getByText("Carol")).toBeInTheDocument();
    });
  });

  it("selects the navigated item when ArrowDown and Enter happen before rerender", async () => {
    const onSelect = vi.fn();
    const plugin = createMentionsPlugin({
      name: "users",
      trigger: "@",
      marker: "user",
      search: () => USERS,
      renderItem: (item, active) => (
        <span data-active={active ? "true" : "false"}>{item.title}</span>
      ),
    });
    const channel = createForwardedKeyChannel();

    render(
      <div>
        {plugin.render?.(
          makeDefaultRenderProps({
            onSelect,
            subscribeForwardedKey: channel.subscribe,
          }),
        )}
      </div>,
    );

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());

    act(() => {
      channel.emit("ArrowDown");
      channel.emit("Enter");
    });
    await act(async () => {});

    expect(onSelect).toHaveBeenCalledWith("@user[2]");
  });

  it("handles forwarded editor keys for navigation and selection", async () => {
    const onSelect = vi.fn();
    const plugin = createMentionsPlugin({
      name: "users",
      trigger: "@",
      marker: "user",
      search: () => USERS,
      renderItem: item => <span>{item.title}</span>,
    });
    const channel = createForwardedKeyChannel();

    render(
      <div>
        {plugin.render?.(
          makeDefaultRenderProps({
            onSelect,
            subscribeForwardedKey: channel.subscribe,
          }),
        )}
      </div>,
    );

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());

    act(() => {
      channel.emit("ArrowDown");
      channel.emit("Enter");
    });

    expect(onSelect).toHaveBeenCalledWith("@user[2]");
  });

  it("shows the empty message when no results match", async () => {
    const plugin = createMentionsPlugin<MentionItem>({
      name: "users",
      trigger: "@",
      marker: "user",
      search: () => [],
      renderItem: item => <span>{item.title}</span>,
      emptyMessage: "No users found",
    });

    render(<div>{plugin.render?.(defaultRenderProps)}</div>);

    await waitFor(() =>
      expect(screen.getByText("No users found")).toBeInTheDocument(),
    );
  });
});
