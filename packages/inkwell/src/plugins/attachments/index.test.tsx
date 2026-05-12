import { createEditor } from "slate";
import { withHistory } from "slate-history";
import { withReact } from "slate-react";
import { describe, expect, it, vi } from "vitest";
import { deserialize } from "../../editor/slate/deserialize";
import type { InkwellElement } from "../../editor/slate/types";
import { withMarkdown } from "../../editor/slate/with-markdown";
import { withNodeId } from "../../editor/slate/with-node-id";
import { createAttachmentsPlugin } from ".";

function createTestEditor() {
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

describe("createAttachmentsPlugin", () => {
  it("returns a plugin with a setup hook", () => {
    const plugin = createAttachmentsPlugin({
      onUpload: async () => "https://cdn/x.png",
    });
    expect(plugin.name).toBe("attachments");
    expect(plugin.setup).toBeTypeOf("function");
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
    plugin.setup?.(editor);

    const file = new File(["data"], "cat.png", { type: "image/png" });
    editor.insertData(mockDataTransfer([file]));

    // Placeholder image inserted before upload resolves.
    const images = (editor.children as InkwellElement[]).filter(
      el => el.type === "image",
    );
    expect(images).toHaveLength(1);
    expect(images[0].alt).toBe("Uploading…");
    expect(images[0].url).toBe("");

    // `onUpload` is invoked on the next microtask (we defer with
    // `Promise.resolve()`). Wait for the pending constructor callback to
    // capture `resolve`, then fire it and flush the .then chain.
    for (let i = 0; i < 3; i++) await Promise.resolve();
    resolve?.("https://cdn/cat.png");
    for (let i = 0; i < 5; i++) await Promise.resolve();

    const updated = (editor.children as InkwellElement[]).filter(
      el => el.type === "image",
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].url).toBe("https://cdn/cat.png");
    expect(updated[0].alt).toBe("cat.png");
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
    plugin.setup?.(editor);

    const file = new File(["data"], "x.png", { type: "image/png" });
    editor.insertData(mockDataTransfer([file]));

    expect(
      (editor.children as InkwellElement[]).some(el => el.type === "image"),
    ).toBe(true);

    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));

    expect(
      (editor.children as InkwellElement[]).some(el => el.type === "image"),
    ).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe("boom");
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
  ])("removes the placeholder and calls onError when upload returns unsafe URL %s", async url => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const onError = vi.fn();
    const plugin = createAttachmentsPlugin({
      onUpload: async () => url,
      onError,
    });
    plugin.setup?.(editor);

    const file = new File(["data"], "x.png", { type: "image/png" });
    editor.insertData(mockDataTransfer([file]));

    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(
      (editor.children as InkwellElement[]).some(el => el.type === "image"),
    ).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBe(file);
  });

  it("does not mutate the editor when upload resolves after cleanup", async () => {
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
    const cleanup = plugin.setup?.(editor);

    const file = new File(["data"], "cat.png", { type: "image/png" });
    editor.insertData(mockDataTransfer([file]));
    const imagesBeforeCleanup = (editor.children as InkwellElement[]).filter(
      el => el.type === "image",
    );
    expect(imagesBeforeCleanup).toHaveLength(1);

    for (let i = 0; i < 3; i++) await Promise.resolve();
    cleanup?.();
    resolve?.("https://cdn/cat.png");
    for (let i = 0; i < 5; i++) await Promise.resolve();

    const imagesAfterCleanup = (editor.children as InkwellElement[]).filter(
      el => el.type === "image",
    );
    expect(imagesAfterCleanup).toHaveLength(1);
    expect(imagesAfterCleanup[0].url).toBe("");
    expect(imagesAfterCleanup[0].alt).toBe("Uploading…");
  });

  it("does not mutate the editor or call onError when upload rejects after cleanup", async () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    let reject: ((error: Error) => void) | undefined;
    const onError = vi.fn();
    const plugin = createAttachmentsPlugin({
      onUpload: () =>
        new Promise<string>((_, r) => {
          reject = r;
        }),
      onError,
    });
    const cleanup = plugin.setup?.(editor);

    const file = new File(["data"], "cat.png", { type: "image/png" });
    editor.insertData(mockDataTransfer([file]));
    for (let i = 0; i < 3; i++) await Promise.resolve();
    cleanup?.();
    reject?.(new Error("late"));
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(
      (editor.children as InkwellElement[]).some(el => el.type === "image"),
    ).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("filters files by accept pattern", async () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const onUpload = vi.fn(async () => "https://cdn/x.png");
    const plugin = createAttachmentsPlugin({
      onUpload,
      accept: "image/*",
    });
    plugin.setup?.(editor);

    const textFile = new File(["hello"], "notes.txt", {
      type: "text/plain",
    });
    editor.insertData(mockDataTransfer([textFile]));

    // Non-matching file: placeholder never inserted, onUpload never queued.
    expect(
      (editor.children as InkwellElement[]).some(el => el.type === "image"),
    ).toBe(false);

    const image = new File(["data"], "a.png", { type: "image/png" });
    editor.insertData(mockDataTransfer([image]));

    // Placeholder inserts synchronously; onUpload fires on the next microtask.
    expect(
      (editor.children as InkwellElement[]).some(el => el.type === "image"),
    ).toBe(true);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it(
    "forwards non-matching files in a mixed payload through the base " +
      "insertData instead of silently dropping them",
    async () => {
      const editor = createTestEditor();
      editor.children = deserialize("");
      editor.onChange();

      // Wrap the base insertData so we can observe what flows through it.
      const baseInsertData = vi.fn();
      editor.insertData = baseInsertData;

      const onUpload = vi.fn(async () => "https://cdn/a.png");
      const plugin = createAttachmentsPlugin({
        onUpload,
        accept: "image/*",
      });
      plugin.setup?.(editor);

      const image = new File(["data"], "a.png", { type: "image/png" });
      const pdf = new File(["data"], "report.pdf", {
        type: "application/pdf",
      });
      editor.insertData(mockDataTransfer([image, pdf]));

      // Matching image: placeholder inserted, onUpload queued.
      expect(
        (editor.children as InkwellElement[]).some(el => el.type === "image"),
      ).toBe(true);
      for (let i = 0; i < 3; i++) await Promise.resolve();
      expect(onUpload).toHaveBeenCalledTimes(1);
      expect(onUpload).toHaveBeenCalledWith(image);

      // Non-matching pdf passed through to the base insertData.
      expect(baseInsertData).toHaveBeenCalledTimes(1);
      const forwarded = baseInsertData.mock.calls[0][0] as DataTransfer;
      const forwardedFiles = Array.from(forwarded.files ?? []);
      expect(forwardedFiles).toHaveLength(1);
      expect(forwardedFiles[0]).toBe(pdf);
    },
  );

  it(
    "does not forward to base insertData when every file matched the " +
      "accept filter",
    () => {
      const editor = createTestEditor();
      editor.children = deserialize("");
      editor.onChange();

      const baseInsertData = vi.fn();
      editor.insertData = baseInsertData;

      const plugin = createAttachmentsPlugin({
        onUpload: async () => "https://cdn/a.png",
        accept: "image/*",
      });
      plugin.setup?.(editor);

      const image = new File(["data"], "a.png", { type: "image/png" });
      editor.insertData(mockDataTransfer([image]));

      // Every file was handled — base should not be re-invoked (it would
      // see the same file again and could double-process accompanying
      // HTML payloads).
      expect(baseInsertData).not.toHaveBeenCalled();
    },
  );

  it("inserts copied HTML images by decoded safe URL", () => {
    const editor = createTestEditor();
    editor.children = deserialize("");
    editor.onChange();

    const onUpload = vi.fn(async () => "https://cdn/unused.png");
    const plugin = createAttachmentsPlugin({
      onUpload,
      accept: "image/*",
    });
    plugin.setup?.(editor);

    editor.insertData(
      mockHtmlDataTransfer(
        '<div><img src="https://example.com/cat.png" alt="cat &amp; dog"></div>',
      ),
    );

    const images = (editor.children as InkwellElement[]).filter(
      el => el.type === "image",
    );
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe("https://example.com/cat.png");
    expect(images[0].alt).toBe("cat & dog");
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
    editor.insertData = baseInsertData;
    const plugin = createAttachmentsPlugin({
      onUpload: async () => "https://cdn/unused.png",
      accept: "image/*",
    });
    plugin.setup?.(editor);

    editor.insertData(mockHtmlDataTransfer(`<img src="${src}" alt="bad">`));

    expect(
      (editor.children as InkwellElement[]).some(el => el.type === "image"),
    ).toBe(false);
    expect(baseInsertData).toHaveBeenCalledTimes(1);
  });

  it("setup returns a cleanup that restores insertData", () => {
    const editor = createTestEditor();
    const originalInsertData = editor.insertData;

    const plugin = createAttachmentsPlugin({
      onUpload: async () => "https://cdn/x.png",
    });
    const cleanup = plugin.setup?.(editor);
    expect(editor.insertData).not.toBe(originalInsertData);

    if (typeof cleanup === "function") cleanup();
    expect(editor.insertData).toBe(originalInsertData);
  });
});
