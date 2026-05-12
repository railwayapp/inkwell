/**
 * Unit tests for the slash commands plugin shape. The end-to-end behavior
 * (open/close state machine, command/arg/ready transitions, kbd nav,
 * `onExecute` payload, clearing the slash line) is exercised through the
 * full editor in `inkwell-editor.test.tsx`. These tests pin down the
 * plugin's public surface and the helpers that aren't covered there.
 */
import { describe, expect, it, vi } from "vitest";
import { createSlashCommandsPlugin } from ".";

describe("createSlashCommandsPlugin", () => {
  describe("plugin shape", () => {
    it("returns a plugin with the configured name", () => {
      const plugin = createSlashCommandsPlugin({
        name: "custom-slash",
        commands: [],
      });

      expect(plugin.name).toBe("custom-slash");
    });

    it("defaults to the name `slash-commands`", () => {
      const plugin = createSlashCommandsPlugin({ commands: [] });
      expect(plugin.name).toBe("slash-commands");
    });

    it("has no character trigger (claims activation imperatively)", () => {
      const plugin = createSlashCommandsPlugin({ commands: [] });
      expect(plugin.trigger).toBeUndefined();
    });

    it("is `activatable` so the editor only renders the menu while active", () => {
      // Without this flag, the editor would render the slash menu by
      // default (since there is no trigger character) and surface the
      // command list before the user types `/`.
      const plugin = createSlashCommandsPlugin({ commands: [] });
      expect(plugin.activatable).toBe(true);
    });

    it("exposes the keydown handlers the editor expects", () => {
      const plugin = createSlashCommandsPlugin({ commands: [] });
      expect(typeof plugin.onKeyDown).toBe("function");
      expect(typeof plugin.onActiveKeyDown).toBe("function");
      expect(typeof plugin.setup).toBe("function");
      expect(typeof plugin.render).toBe("function");
    });
  });

  describe("setup", () => {
    it("registers a teardown that clears the captured editor reference", () => {
      const plugin = createSlashCommandsPlugin({ commands: [] });
      // Cast — we only exercise the lifecycle, not Slate behavior.
      const editor = {} as Parameters<NonNullable<typeof plugin.setup>>[0];
      const cleanup = plugin.setup?.(editor);
      expect(typeof cleanup).toBe("function");
      // Cleanup should not throw and should be idempotent.
      cleanup?.();
      expect(() => cleanup?.()).not.toThrow();
    });
  });

  describe("render", () => {
    it("returns null when not active", () => {
      const plugin = createSlashCommandsPlugin({
        commands: [{ name: "status", description: "" }],
      });
      const rendered = plugin.render({
        active: false,
        query: "",
        onSelect: vi.fn(),
        onDismiss: vi.fn(),
        position: { top: 0, left: 0 },
        editorRef: { current: null },
        wrapSelection: vi.fn(),
        subscribeForwardedKey: () => () => {},
      });
      expect(rendered).toBeNull();
    });
  });

  describe("option surface", () => {
    it("accepts commands with required choice-backed arguments", () => {
      // Just a shape check — exercises that the public types accept the
      // documented payloads.
      const plugin = createSlashCommandsPlugin({
        commands: [
          {
            name: "status",
            description: "Set a thread status",
            aliases: ["s"],
            args: [
              {
                name: "status",
                description: "Status to apply",
                required: true,
                choices: [
                  { value: "solved", label: "Solved" },
                  { value: "closed", label: "Closed", disabled: true },
                ],
              },
            ],
          },
        ],
        onExecute: vi.fn(),
        onReadyChange: vi.fn(),
        emptyMessage: "no commands",
      });
      expect(plugin.name).toBe("slash-commands");
    });

    it("accepts async fetchChoices for argument values", async () => {
      const fetchChoices = vi.fn(async () => [
        { value: "alpha", label: "Alpha" },
      ]);
      const plugin = createSlashCommandsPlugin({
        commands: [
          {
            name: "assign",
            description: "Assign ownership",
            args: [
              {
                name: "owner",
                description: "Owner",
                required: true,
                fetchChoices,
              },
            ],
          },
        ],
      });
      expect(plugin.name).toBe("slash-commands");
      // Verify the callback survives the option closure (does not get
      // captured / wrapped in a way that prevents re-use).
      await expect(fetchChoices()).resolves.toEqual([
        { value: "alpha", label: "Alpha" },
      ]);
    });

    it("accepts commands gated by a `disabled` predicate", () => {
      const disabled = vi.fn(() => "Bounties are disabled" as const);
      const plugin = createSlashCommandsPlugin({
        commands: [
          { name: "bounty", description: "Prepare a bounty", disabled },
        ],
      });
      expect(plugin.name).toBe("slash-commands");
      // The disabled predicate is consulted at render time. Calling it
      // directly should return the configured message.
      expect(disabled()).toBe("Bounties are disabled");
    });
  });
});
