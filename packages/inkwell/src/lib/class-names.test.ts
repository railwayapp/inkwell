import { describe, expect, it } from "vitest";
import { editorClass, pluginClass } from "./class-names";

describe("editorClass", () => {
  it("returns inkwell-editor-{component}", () => {
    expect(editorClass("heading")).toBe("inkwell-editor-heading");
  });

  it("handles hyphenated component names", () => {
    expect(editorClass("code-fence")).toBe("inkwell-editor-code-fence");
  });
});

describe("pluginClass", () => {
  it("returns a function that generates inkwell-plugin-{name}-{component}", () => {
    const cls = pluginClass("bubble-menu");
    expect(cls("container")).toBe("inkwell-plugin-bubble-menu-container");
    expect(cls("item-bold")).toBe("inkwell-plugin-bubble-menu-item-bold");
  });

  it("works with different plugin names", () => {
    const cls = pluginClass("snippets");
    expect(cls("popup")).toBe("inkwell-plugin-snippets-popup");
  });
});
