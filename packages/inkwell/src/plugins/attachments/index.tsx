"use client";

import type { RefObject } from "react";
import { isSafeImageUrl, sanitizeImageUrl } from "../../lib/safe-url";
import type { InkwellPlugin, InkwellPluginEditor } from "../../types";

export type AttachmentUploadResult =
  | string
  | {
      url: string;
      alt?: string;
      [key: string]: unknown;
    };

export interface Attachment {
  url: string;
  filename: string;
  mime: string;
  size: number;
  /**
   * Any extra fields returned from `onUpload` (e.g. a service-side
   * record ID) are forwarded onto the attachment.
   */
  [key: string]: unknown;
}

export interface AttachmentsHandle {
  upload: (files: File[]) => void;
}

export interface AttachmentsPluginOptions {
  /**
   * Upload a single file and resolve to the public URL, or an object
   * containing the URL plus optional metadata. Rejection triggers
   * `onError`.
   */
  onUpload: (file: File) => Promise<AttachmentUploadResult>;
  /**
   * MIME-type filter. Accepts exact matches (`image/png`) and wildcards
   * (`image/*`). Files that don't match pass through untouched.
   */
  accept?: string;
  /** Populated on editor mount, nulled on unmount. */
  ref?: RefObject<AttachmentsHandle | null>;
  /**
   * Placeholder alt text shown on the inserted image element while an
   * image upload is in flight. Defaults to `"Uploading…"`.
   */
  uploadingPlaceholder?: (file: File) => string;
  /**
   * Fired after a non-image file finishes uploading. Use this to track
   * attachments in your own state for message submission, chip UI, etc.
   *
   * Image files (MIME `image/*`) are inserted inline as `<img>` and do
   * NOT fire this callback. If omitted, non-image files are passed
   * through to the editor's default paste/drop handling instead of
   * being silently uploaded and discarded.
   */
  onAttachmentAdd?: (attachment: Attachment) => void;
  /**
   * Called when `onUpload` rejects, or when the returned URL fails the
   * URL safety allowlist. For image uploads, the placeholder element is
   * removed before this fires.
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

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
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

const insertUploadedAttachment = (
  file: File,
  options: AttachmentsPluginOptions,
): void => {
  const onAttachmentAdd = options.onAttachmentAdd;
  if (!onAttachmentAdd) return;

  Promise.resolve()
    .then(() => options.onUpload(file))
    .then(result => {
      const url = typeof result === "string" ? result : result.url;
      // Reuse the image URL allowlist for non-image attachments too: the
      // consumer is likely to render this URL into an `<a href>` and a
      // `javascript:` or unsafe `data:` URL slipping through onUpload
      // would be just as exploitable there.
      if (!isSafeImageUrl(url)) {
        options.onError?.(new Error("Unsafe upload URL"), file);
        return;
      }
      const extra =
        typeof result === "string"
          ? {}
          : Object.fromEntries(
              Object.entries(result).filter(
                ([k]) => k !== "url" && k !== "alt",
              ),
            );
      onAttachmentAdd({
        ...extra,
        url: url.trim(),
        filename: file.name || "attachment",
        mime: file.type,
        size: file.size,
      });
    })
    .catch(err => {
      options.onError?.(err, file);
    });
};

function routeFiles(
  editor: InkwellPluginEditor,
  files: File[],
  options: AttachmentsPluginOptions,
): { handled: File[]; skipped: File[] } {
  const { accept } = options;
  const matching = accept
    ? files.filter(f => mimeMatches(f.type, accept))
    : files;

  const handled = matching.filter(
    f => isImageFile(f) || options.onAttachmentAdd !== undefined,
  );

  for (const file of handled) {
    if (isImageFile(file)) {
      insertUploadedImage(editor, file, options);
    } else {
      insertUploadedAttachment(file, options);
    }
  }

  const skipped = files.filter(f => !handled.includes(f));
  return { handled, skipped };
}

/**
 * Intercepts file paste/drop, uploads via `onUpload`, and either
 * inserts an inline image element (for `image/*` files) or fires
 * `onAttachmentAdd` (for non-image files). Non-image files with no
 * `onAttachmentAdd` callback pass through to the editor's default
 * paste/drop handling.
 */
export function createAttachmentsPlugin(
  options: AttachmentsPluginOptions,
): InkwellPlugin {
  return {
    name: "attachments",
    setup(editor) {
      if (!options.ref) return;
      // RefObject's `current` is typed readonly by React even though
      // the underlying object is writable at runtime — the cast is
      // the standard pattern for populating a ref handed in by a
      // consumer.
      const writableRef = options.ref as { current: AttachmentsHandle | null };
      writableRef.current = {
        upload: files => {
          if (files.length === 0) return;
          routeFiles(editor, files, options);
        },
      };
      return () => {
        writableRef.current = null;
      };
    },
    onInsertData(data, { editor, insertData }) {
      const files = extractFiles(data);
      const { handled, skipped } = routeFiles(editor, files, options);

      if (handled.length === 0) {
        const htmlImages = extractHtmlImages(data);
        if (htmlImages.length === 0) return false;

        for (const image of htmlImages) {
          editor.insertImage(image);
        }
        return true;
      }

      if (skipped.length > 0) {
        insertData(filesOnlyDataTransfer(skipped));
      }

      return true;
    },
  };
}
