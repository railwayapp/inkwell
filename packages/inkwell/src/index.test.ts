/**
 * Smoke tests for the public entry. Keeps the export surface honest so a
 * renamed or removed export breaks CI rather than silently shipping.
 */
import { describe, expect, it } from "vitest";
import * as Inkwell from "./index";

describe("@railway/inkwell public exports", () => {
  it("re-exports the primary component API", () => {
    expect(Inkwell.InkwellEditor).toBeTypeOf("object");
    expect(Inkwell.InkwellRenderer).toBeTypeOf("function");
  });

  it("re-exports the public serialization helpers", () => {
    expect(Inkwell.parseMarkdown).toBeTypeOf("function");
    expect(Inkwell.htmlToMarkdown).toBeTypeOf("function");
  });

  it("re-exports the built-in plugin creators", () => {
    expect(Inkwell.createAttachmentsPlugin).toBeTypeOf("function");
    expect(Inkwell.createBubbleMenuPlugin).toBeTypeOf("function");
    expect(Inkwell.createCompletionsPlugin).toBeTypeOf("function");
    expect(Inkwell.createEmojiPlugin).toBeTypeOf("function");
    expect(Inkwell.defaultEmojis).toBeInstanceOf(Array);
    expect(Inkwell.createMentionsPlugin).toBeTypeOf("function");
    expect(Inkwell.createSnippetsPlugin).toBeTypeOf("function");
    expect(Inkwell.createSlashCommandsPlugin).toBeTypeOf("function");
  });

  it("re-exports stable bubble menu defaults", () => {
    expect(Inkwell.defaultBubbleMenuItems).toBeInstanceOf(Array);
  });
});
