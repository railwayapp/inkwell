/**
 * Smoke tests for the public entry. Keeps the export surface honest so a
 * renamed or removed export breaks CI rather than silently shipping.
 */
import { describe, expect, it } from "vitest";
import * as Inkwell from "./index";

describe("@railway/inkwell public exports", () => {
  it("re-exports the component + hook API", () => {
    expect(Inkwell.InkwellEditor).toBeTypeOf("object");
    expect(Inkwell.InkwellRenderer).toBeTypeOf("function");
    expect(Inkwell.useInkwell).toBeTypeOf("function");
  });

  it("re-exports the serialization helpers", () => {
    expect(Inkwell.deserialize).toBeTypeOf("function");
    expect(Inkwell.parseMarkdown).toBeTypeOf("function");
    expect(Inkwell.serializeToMarkdown).toBeTypeOf("function");
  });

  it("re-exports the built-in plugin creators", () => {
    expect(Inkwell.createAttachmentsPlugin).toBeTypeOf("function");
    expect(Inkwell.createBubbleMenuPlugin).toBeTypeOf("function");
    expect(Inkwell.createMentionsPlugin).toBeTypeOf("function");
    expect(Inkwell.createSnippetsPlugin).toBeTypeOf("function");
    expect(Inkwell.createSlashCommandsPlugin).toBeTypeOf("function");
  });

  it("re-exports plugin utilities + shared picker primitive", () => {
    expect(Inkwell.defaultBubbleMenuItems).toBeInstanceOf(Array);
    expect(Inkwell.pluginClass).toBeTypeOf("function");
    expect(Inkwell.PluginMenuPrimitive).toBeTypeOf("function");
    expect(Inkwell.pluginPickerClass).toMatchObject({
      popup: "inkwell-plugin-picker-popup",
      picker: "inkwell-plugin-picker",
      search: "inkwell-plugin-picker-search",
      item: "inkwell-plugin-picker-item",
      itemActive: "inkwell-plugin-picker-item-active",
      empty: "inkwell-plugin-picker-empty",
      title: "inkwell-plugin-picker-title",
      subtitle: "inkwell-plugin-picker-subtitle",
      preview: "inkwell-plugin-picker-preview",
    });
  });
});
