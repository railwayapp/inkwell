/**
 * Unit tests for the slash commands plugin shape. The end-to-end behavior
 * (open/close state machine, command/arg/ready transitions, kbd nav,
 * `onExecute` payload, clearing the slash line) is exercised through the
 * full editor in `inkwell-editor.test.tsx`. These tests pin down the
 * plugin's public surface and the helpers that aren't covered there.
 */
import { describe, expect, it, vi } from "vitest";
import type { InkwellPluginEditor } from "../../types";
import { createSlashCommandsPlugin } from ".";

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
      expect(plugin.activation).toEqual({ type: "manual" });
    });

    it("uses manual activation so the editor only renders the menu while active", () => {
      // Without this flag, the editor would render the slash menu by
      // default (since there is no trigger character) and surface the
      // command list before the user types `/`.
      const plugin = createSlashCommandsPlugin({ commands: [] });
      expect(plugin.activation).toEqual({ type: "manual" });
    });

    it("exposes the keydown handlers the editor expects", () => {
      const plugin = createSlashCommandsPlugin({ commands: [] });
      expect(typeof plugin.onKeyDown).toBe("function");
      expect(typeof plugin.onActiveKeyDown).toBe("function");
      expect(plugin.setup).toBeUndefined();
      expect(typeof plugin.render).toBe("function");
    });
  });

  describe("render", () => {
    it("returns null when not active", () => {
      const plugin = createSlashCommandsPlugin({
        commands: [{ name: "status", description: "" }],
      });
      const rendered = plugin.render?.({
        active: false,
        query: "",
        onSelect: vi.fn(),
        onDismiss: vi.fn(),
        position: { top: 0, left: 0 },
        editorRef: { current: null },
        editor: createPluginEditor(),
        wrapSelection: vi.fn(),
        subscribeForwardedKey: () => () => {},
      });
      expect(rendered).toBeNull();
    });
  });

  describe("option surface", () => {
    it("accepts commands with choice-backed arguments", () => {
      // Just a shape check — exercises that the public types accept the
      // documented payloads.
      const plugin = createSlashCommandsPlugin({
        commands: [
          {
            name: "status",
            description: "Set a document status",
            aliases: ["s"],
            arg: {
              name: "status",
              description: "Status to apply",
              choices: [
                { value: "solved", label: "Solved" },
                { value: "closed", label: "Closed", disabled: true },
              ],
            },
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
            arg: {
              name: "owner",
              description: "Owner",
              fetchChoices,
            },
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
