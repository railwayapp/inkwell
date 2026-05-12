import { createEditor, Node, Element as SlateElement, Transforms } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it, vi } from "vitest";
import { deserialize } from "../../editor/slate/deserialize";
import type { InkwellElement } from "../../editor/slate/types";
import { withMarkdown } from "../../editor/slate/with-markdown";
import { generateId, withNodeId } from "../../editor/slate/with-node-id";
import type { InkwellPluginEditor } from "../../types";
import { createAttachmentsPlugin } from ".";

function createTestEditor() {
  const featuresRef = {
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
    featuresRef,
  );
}

function mockDataTransfer(files: File[]): DataTransfer {
  return {
    files: files as unknown as FileList,
    items: files.map(f => ({
      kind: "file" as const,
      type: f.type,
      getAsFile: () => f,
    })) as unknown as DataTransferItemList,
    getData: () => "",
  } as unknown as DataTransfer;
}

function mockHtmlDataTransfer(html: string): DataTransfer {
  return {
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    getData: (type: string) => (type === "text/html" ? html : ""),
  } as unknown as DataTransfer;
}

function createPluginEditor(
  editor: ReturnType<typeof createTestEditor>,
): InkwellPluginEditor {
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
    isEmpty: () => Node.string(editor).trim().length === 0,
    focus: () => {},
    clear: () => {},
    setContent: () => {},
    insertContent: () => {},
    getContentBeforeCursor: () => null,
    getCurrentBlockContent: () => null,
    getCurrentBlockContentBeforeCursor: () => null,
    replaceCurrentBlockContent: () => {},
    clearCurrentBlock: () => {},
    wrapSelection: () => {},
    insertImage: image => {
      const id = image.id ?? generateId();
      Transforms.insertNodes(editor, {
        type: "image",
        id,
        url: image.url,
        alt: image.alt,
        children: [{ text: "" }],
      } satisfies InkwellElement);
      return id;
    },
    updateImage: (id, image) => {
      for (const [node, path] of Node.nodes(editor)) {
        if (
          SlateElement.isElement(node) &&
          node.type === "image" &&
          node.id === id
        ) {
          Transforms.setNodes(editor, image, { at: path });
          return;
        }
      }
    },
    removeImage: id => {
      for (const [node, path] of Node.nodes(editor)) {
        if (
          SlateElement.isElement(node) &&
          node.type === "image" &&
          node.id === id
        ) {
          Transforms.removeNodes(editor, { at: path });
          return;
        }
      }
    },
  };
}

function insertData(
  plugin: ReturnType<typeof createAttachmentsPlugin>,
  editor: ReturnType<typeof createTestEditor>,
  data: DataTransfer,
  baseInsertData: (data: DataTransfer) => void = () => {},
): void {
  const handled = plugin.onInsertData?.(data, {
    editor: createPluginEditor(editor),
    insertData: baseInsertData,
  });
  if (!handled) baseInsertData(data);
}

const images = (editor: ReturnType<typeof createTestEditor>) =>
  (editor.children as InkwellElement[]).filter(el => el.type === "image");

describe("createAttachmentsPlugin", () => {
  it("returns a headless plugin with an insert-data hook", () => {
    const plugin = createAttachmentsPlugin({
      onUpload: async () => "https://cdn/x.png",
    });
    expect(plugin.name).toBe("attachments");
    expect(plugin.onInsertData).toBeTypeOf("function");
    expect(plugin.render).toBeUndefined();
  });

  it("inserts a placeholder image element when a file is pasted", async () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    let resolve: ((url: string) => void) | undefined;
    const plugin = createAttachmentsPlugin({
      onUpload: () =>
        new Promise<string>(r => {
          resolve = r;
        }),
    });

    const file = new File(["data"], "cat.png", { type: "image/png" });
    insertData(plugin, editor, mockDataTransfer([file]));

    expect(images(editor)).toHaveLength(1);
    expect(images(editor)[0].alt).toBe("Uploading…");
    expect(images(editor)[0].url).toBe("");

    for (let i = 0; i < 3; i++) await Promise.resolve();
    resolve?.("https://cdn/cat.png");
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(images(editor)).toHaveLength(1);
    expect(images(editor)[0].url).toBe("https://cdn/cat.png");
    expect(images(editor)[0].alt).toBe("cat.png");
  });

  it("uses returned upload alt text when provided", async () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const plugin = createAttachmentsPlugin({
      onUpload: async () => ({
        url: "https://cdn/cat.png",
        alt: "A custom cat description",
      }),
    });

    const file = new File(["data"], "cat.png", { type: "image/png" });
    insertData(plugin, editor, mockDataTransfer([file]));
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(images(editor)).toHaveLength(1);
    expect(images(editor)[0].url).toBe("https://cdn/cat.png");
    expect(images(editor)[0].alt).toBe("A custom cat description");
  });

  it("removes the placeholder and calls onError if upload rejects", async () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const onError = vi.fn();
    const plugin = createAttachmentsPlugin({
      onUpload: async () => {
        throw new Error("boom");
      },
      onError,
    });

    const file = new File(["data"], "x.png", { type: "image/png" });
    insertData(plugin, editor, mockDataTransfer([file]));

    expect(images(editor)).toHaveLength(1);
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(images(editor)).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe("boom");
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
  ])("removes placeholders for unsafe upload URLs %s", async url => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const onError = vi.fn();
    const plugin = createAttachmentsPlugin({
      onUpload: async () => url,
      onError,
    });

    const file = new File(["data"], "x.png", { type: "image/png" });
    insertData(plugin, editor, mockDataTransfer([file]));
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(images(editor)).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBe(file);
  });

  it("filters files by accept pattern", async () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const onUpload = vi.fn(async () => "https://cdn/x.png");
    const plugin = createAttachmentsPlugin({ onUpload, accept: "image/*" });

    const textFile = new File(["hello"], "notes.txt", {
      type: "text/plain",
    });
    insertData(plugin, editor, mockDataTransfer([textFile]));
    expect(images(editor)).toHaveLength(0);

    const image = new File(["data"], "a.png", { type: "image/png" });
    insertData(plugin, editor, mockDataTransfer([image]));
    expect(images(editor)).toHaveLength(1);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it("forwards non-matching files in a mixed payload", async () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const baseInsertData = vi.fn();
    const onUpload = vi.fn(async () => "https://cdn/a.png");
    const plugin = createAttachmentsPlugin({ onUpload, accept: "image/*" });

    const image = new File(["data"], "a.png", { type: "image/png" });
    const pdf = new File(["data"], "report.pdf", {
      type: "application/pdf",
    });
    insertData(plugin, editor, mockDataTransfer([image, pdf]), baseInsertData);

    expect(images(editor)).toHaveLength(1);
    for (let i = 0; i < 3; i++) await Promise.resolve();
    expect(onUpload).toHaveBeenCalledWith(image);
    expect(baseInsertData).toHaveBeenCalledTimes(1);
    const forwarded = baseInsertData.mock.calls[0][0] as DataTransfer;
    expect(Array.from(forwarded.files ?? [])[0]).toBe(pdf);
  });

  it("inserts copied HTML images by decoded safe URL", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const onUpload = vi.fn(async () => "https://cdn/unused.png");
    const plugin = createAttachmentsPlugin({ onUpload, accept: "image/*" });
    insertData(
      plugin,
      editor,
      mockHtmlDataTransfer(
        '<div><img src="https://example.com/cat.png" alt="cat &amp; dog"></div>',
      ),
    );

    expect(images(editor)).toHaveLength(1);
    expect(images(editor)[0].url).toBe("https://example.com/cat.png");
    expect(images(editor)[0].alt).toBe("cat & dog");
    expect(onUpload).not.toHaveBeenCalled();
  });

  it.each([
    "java&#x73;cript:alert(1)",
    "data&#x3a;text/html,<script>alert(1)</script>",
  ])("drops copied HTML images with unsafe encoded src %s", src => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const baseInsertData = vi.fn();
    const plugin = createAttachmentsPlugin({
      onUpload: async () => "https://cdn/unused.png",
      accept: "image/*",
    });
    insertData(
      plugin,
      editor,
      mockHtmlDataTransfer(`<img src="${src}" alt="bad">`),
      baseInsertData,
    );

    expect(images(editor)).toHaveLength(0);
    expect(baseInsertData).toHaveBeenCalledTimes(1);
  });
});
