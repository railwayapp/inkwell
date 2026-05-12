"use client";

import { type Editor, Node, Element as SlateElement, Transforms } from "slate";
import type { InkwellElement } from "../../editor/slate/types";
import { generateId } from "../../editor/slate/with-node-id";
import { sanitizeImageUrl } from "../../lib/safe-url";
import type { InkwellPlugin } from "../../types";

export interface AttachmentsPluginOptions {
  /**
   * Upload a single file and resolve to the public URL the renderer should
   * point at. Rejection triggers `onError`.
   */
  onUpload: (file: File) => Promise<string>;
  /**
   * MIME-type filter. Supports exact matches (`image/png`) and wildcards
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

/**
 * Handle a MIME pattern like `image/*` or `image/png`.
 */
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

/**
 * Build a synthetic `DataTransfer` carrying only the supplied files (no
 * text/html or text/plain payload). Used to forward non-matching files
 * back into the editor's base `insertData` so they aren't silently
 * dropped. We avoid `new DataTransfer()` because it isn't constructable
 * in jsdom (and is only partially constructable in real browsers).
 */
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
    // Drop tags with a missing or unsafe src — we don't want to write
    // `javascript:`, `data:text/html`, or `data:image/svg+xml` (script
    // execution surface) into the document.
    if (!url) continue;
    images.push({ url, alt: img.getAttribute("alt") ?? "" });
  }
  return images;
}

function removeImageById(editor: Editor, id: string): void {
  for (const [node, path] of Node.nodes(editor)) {
    if (
      SlateElement.isElement(node) &&
      node.id === id &&
      node.type === "image"
    ) {
      Transforms.removeNodes(editor, { at: path });
      break;
    }
  }
}

function setUploadedImageUrl(
  editor: Editor,
  id: string,
  url: string,
  alt: string,
): void {
  for (const [node, path] of Node.nodes(editor)) {
    if (
      SlateElement.isElement(node) &&
      node.id === id &&
      node.type === "image"
    ) {
      Transforms.setNodes(editor, { url, alt }, { at: path });
      break;
    }
  }
}

function insertImage(
  editor: Editor,
  image: { url: string; alt: string },
): void {
  const imageEl: InkwellElement = {
    type: "image",
    id: generateId(),
    url: image.url,
    alt: image.alt,
    children: [{ text: "" }],
  };
  Transforms.insertNodes(editor, imageEl);
}

/**
 * Intercepts file paste/drop, uploads via `onUpload`, and inserts an image
 * element. The image is inserted immediately with placeholder alt text and
 * its URL is patched in once the upload resolves.
 */
export function createAttachmentsPlugin(
  options: AttachmentsPluginOptions,
): InkwellPlugin {
  const { onUpload, accept, onError, uploadingPlaceholder } = options;

  return {
    name: "attachments",
    render: () => null,
    setup(editor) {
      const { insertData } = editor;
      let disposed = false;
      editor.insertData = (data: DataTransfer) => {
        const files = extractFiles(data);
        const matching = accept
          ? files.filter(f => mimeMatches(f.type, accept))
          : files;
        if (matching.length === 0) {
          const htmlImages = extractHtmlImages(data);
          if (htmlImages.length === 0) return insertData(data);

          for (const image of htmlImages) {
            insertImage(editor, image);
          }
          return;
        }

        // Pass non-matching files through to the editor's base
        // `insertData` so they aren't silently dropped — the docstring
        // for `accept` promises files that don't match flow through
        // untouched. We strip text/html and text/plain so any pasted
        // markup describing the same files isn't double-handled.
        const unmatched = files.filter(f => !matching.includes(f));
        if (unmatched.length > 0) {
          insertData(filesOnlyDataTransfer(unmatched));
        }

        for (const file of matching) {
          const id = generateId();
          const placeholder = uploadingPlaceholder?.(file) ?? "Uploading…";
          const imageEl: InkwellElement = {
            type: "image",
            id,
            url: "",
            alt: placeholder,
            children: [{ text: "" }],
          };
          Transforms.insertNodes(editor, imageEl);

          Promise.resolve()
            .then(() => onUpload(file))
            .then(url => {
              if (disposed) return;
              const safeUrl = sanitizeImageUrl(url);
              if (!safeUrl) {
                removeImageById(editor, id);
                onError?.(new Error("Unsafe upload URL"), file);
                return;
              }
              setUploadedImageUrl(editor, id, safeUrl, file.name);
            })
            .catch(err => {
              if (disposed) return;
              removeImageById(editor, id);
              onError?.(err, file);
            });
        }
      };
      return () => {
        disposed = true;
        editor.insertData = insertData;
      };
    },
  };
}
