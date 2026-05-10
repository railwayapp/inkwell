import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PluginRenderProps } from "../../types";
import { createMentionsPlugin, type MentionItem } from ".";

const USERS: MentionItem[] = [
  { id: "1", title: "Alice" },
  { id: "2", title: "Bob" },
  { id: "3", title: "Carol" },
];

const defaultRenderProps: PluginRenderProps = {
  active: true,
  query: "",
  onSelect: vi.fn(),
  onDismiss: vi.fn(),
  position: { top: 10, left: 20 },
  editorRef: { current: null },
  wrapSelection: vi.fn(),
};

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
    expect(plugin.trigger?.key).toBe("@");
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

    render(<div>{plugin.render({ ...defaultRenderProps, onSelect })}</div>);

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
        {plugin.render({ ...defaultRenderProps, onSelect: parentOnSelect })}
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

    render(<div>{plugin.render(defaultRenderProps)}</div>);

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());

    const input = document.querySelector("input");
    if (!input) throw new Error("search input missing");

    await act(async () => {
      fireEvent.change(input, { target: { value: "ca" } });
    });

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

    render(<div>{plugin.render({ ...defaultRenderProps, onSelect })}</div>);

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());

    const input = document.querySelector("input");
    if (!input) throw new Error("search input missing");

    await act(async () => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });
    });

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

    render(<div>{plugin.render({ ...defaultRenderProps, onSelect })}</div>);

    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(
        new CustomEvent("inkwell-plugin-keydown:users", {
          detail: { key: "ArrowDown" },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("inkwell-plugin-keydown:users", {
          detail: { key: "Enter" },
        }),
      );
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

    render(<div>{plugin.render(defaultRenderProps)}</div>);

    await waitFor(() =>
      expect(screen.getByText("No users found")).toBeInTheDocument(),
    );
  });
});
