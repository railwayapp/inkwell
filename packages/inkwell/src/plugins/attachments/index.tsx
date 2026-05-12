"use client";

import { sanitizeImageUrl } from "../../lib/safe-url";
import type { InkwellPlugin, InkwellPluginEditor } from "../../types";

export type AttachmentUploadResult =
  | string
  | {
      url: string;
      alt?: string;
    };

export interface AttachmentsPluginOptions {
  /**
   * Upload a single file and resolve to the public image URL, or an object
   * containing the URL and replacement alt text. Rejection triggers `onError`.
   */
  onUpload: (file: File) => Promise<AttachmentUploadResult>;
  /**
   * MIME-type filter. Accepts exact matches (`image/png`) and wildcards
   * (`image/*`). Files that don't match pass through untouched.
   */
  accept?: string;
  /**
   * Placeholder alt text shown on the inserted image element while the
   * upload is in flight. Receives the file so callers can customize per
   * upload. Defaults to `"Uploading…"`.
   */
  uploadingPlaceholder?: (file: File) => string;
  /**
   * Called when `onUpload` rejects. The plugin removes the placeholder
   * element before calling this.
   */
  onError?: (error: unknown, file: File) => void;
}

function mimeMatches(mime: string, accept: string): boolean {
  if (!mime) return false;
  const patterns = accept
    .split(",")
    .map(p => p.trim())
    .filter(Boolean);
  return patterns.some(pattern => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return mime.startsWith(prefix);
    }
    return mime === pattern;
  });
}

function extractFiles(data: DataTransfer): File[] {
  if (data.files && data.files.length > 0) return Array.from(data.files);
  if (!data.items) return [];
  const files: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

function filesOnlyDataTransfer(files: File[]): DataTransfer {
  return {
    types: files.length > 0 ? ["Files"] : [],
    files: files as unknown as FileList,
    items: undefined as unknown as DataTransferItemList,
    getData: () => "",
    setData: () => {},
    clearData: () => {},
    setDragImage: () => {},
    dropEffect: "none",
    effectAllowed: "all",
  } as DataTransfer;
}

function extractHtmlImages(
  data: DataTransfer,
): Array<{ url: string; alt: string }> {
  const html = data.getData("text/html");
  if (!html) return [];

  const template = document.createElement("template");
  template.innerHTML = html;

  const images: Array<{ url: string; alt: string }> = [];
  for (const img of Array.from(template.content.querySelectorAll("img"))) {
    const url = sanitizeImageUrl(img.getAttribute("src"));
    if (!url) continue;
    images.push({ url, alt: img.getAttribute("alt") ?? "" });
  }
  return images;
}

const insertUploadedImage = (
  editor: InkwellPluginEditor,
  file: File,
  options: AttachmentsPluginOptions,
): void => {
  const placeholder = options.uploadingPlaceholder?.(file) ?? "Uploading…";
  const id = editor.insertImage({ url: "", alt: placeholder });

  Promise.resolve()
    .then(() => options.onUpload(file))
    .then(result => {
      const url = typeof result === "string" ? result : result.url;
      const safeUrl = sanitizeImageUrl(url);
      if (!safeUrl) {
        editor.removeImage(id);
        options.onError?.(new Error("Unsafe upload URL"), file);
        return;
      }
      const alt =
        typeof result === "string" ? file.name : (result.alt ?? file.name);
      editor.updateImage(id, { url: safeUrl, alt });
    })
    .catch(err => {
      editor.removeImage(id);
      options.onError?.(err, file);
    });
};

/**
 * Intercepts file paste/drop, uploads via `onUpload`, and inserts an image
 * element. The image is inserted immediately with placeholder alt text and
 * its URL is patched in once the upload resolves.
 */
export function createAttachmentsPlugin(
  options: AttachmentsPluginOptions,
): InkwellPlugin {
  const { accept } = options;

  return {
    name: "attachments",
    onInsertData(data, { editor, insertData }) {
      const files = extractFiles(data);
      const matching = accept
        ? files.filter(f => mimeMatches(f.type, accept))
        : files;

      if (matching.length === 0) {
        const htmlImages = extractHtmlImages(data);
        if (htmlImages.length === 0) return false;

        for (const image of htmlImages) {
          editor.insertImage(image);
        }
        return true;
      }

      const unmatched = files.filter(f => !matching.includes(f));
      if (unmatched.length > 0) {
        insertData(filesOnlyDataTransfer(unmatched));
      }

      for (const file of matching) {
        insertUploadedImage(editor, file, options);
      }

      return true;
    },
  };
}
