---
title: "Attachments"
---

The attachments plugin intercepts pasted or dropped files, uploads each file
with your `onUpload` callback, and either:

- **Image files** (MIME `image/*`) are inserted inline as an image block in
  the Markdown.
- **Non-image files** (PDFs, archives, anything else) are surfaced through
  the optional `onAttachmentAdd` callback so you can track them in your own
  state — typically rendered as a list of chips alongside the editor and
  submitted as message-level metadata.

The plugin also handles copied HTML `<img>` elements by inserting a block
image for each safe `src` directly; those HTML URLs are not uploaded through
`onUpload`. Safe URLs are `http:`, `https:`, protocol-relative, relative
paths, `blob:`, or raster `data:image/png|jpeg|jpg|gif|webp`. Missing or
unsafe values such as `javascript:`, `file:`, `data:text/html`, or
`data:image/svg+xml` are ignored.

## Image-only setup

If you only need pasted images, set `accept: "image/*"` and skip
`onAttachmentAdd`. Non-image files pass through to the editor's default
paste/drop handling.

```tsx
import { createAttachmentsPlugin, InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

const attachments = createAttachmentsPlugin({
  accept: "image/*",
  onUpload: async file => {
    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/uploads", {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("Upload failed");

    const { url } = (await res.json()) as { url: string };
    return url;
  },
  onError: (error, file) => {
    console.error("Failed to upload", file.name, error);
  },
});

function App() {
  const [content, setContent] = useState("");
  return (
    <InkwellEditor
      content={content}
      onChange={setContent}
      plugins={[attachments]}
    />
  );
}
```

While the upload is pending, Inkwell inserts an image placeholder with the
default alt text `Uploading…`. When the promise resolves, the returned URL
is validated against the safe image URL allowlist before it is stored. Safe
URLs update the placeholder and use either the returned `alt`, when
provided, or the original file name. If upload fails or returns an unsafe
URL, the placeholder is removed and `onError` is called.

## Arbitrary file attachments

To accept non-image files, drop the `image/*` filter and pass an
`onAttachmentAdd` callback. The plugin uploads each non-image file and then
hands the resulting `Attachment` to your callback. Inkwell does not persist
attachments in the Markdown — your code owns the list and includes it
alongside the content at submit time.

```tsx
import {
  type Attachment,
  createAttachmentsPlugin,
  InkwellEditor,
} from "@railway/inkwell";
import { useMemo, useState } from "react";

function Composer() {
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const plugin = useMemo(
    () =>
      createAttachmentsPlugin({
        onUpload: async file => {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/uploads", {
            method: "POST",
            body: form,
          });
          if (!res.ok) throw new Error("Upload failed");
          return (await res.json()) as { url: string; id: string };
        },
        onAttachmentAdd: attachment => {
          setAttachments(prev => [...prev, attachment]);
        },
        onError: (error, file) =>
          console.error("Upload failed", file.name, error),
      }),
    [],
  );

  return (
    <>
      <InkwellEditor
        content={content}
        onChange={setContent}
        plugins={[plugin]}
      />
      <ul>
        {attachments.map((a, i) => (
          <li key={i}>
            {a.filename}
            <button
              type="button"
              onClick={() =>
                setAttachments(prev => prev.filter((_, idx) => idx !== i))
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
```

Any extra fields returned from `onUpload` (here, `id`) are forwarded onto
the `Attachment` object so you can pass through service-side identifiers
without modeling them in your component state.

### Why attachments aren't in the Markdown

Inkwell's content model is a Markdown source string. Markdown has no
standard syntax for arbitrary file attachments — only images (`![alt](url)`)
and links. Rather than invent a non-portable convention, the plugin keeps
non-image attachments as message-level state that you manage and submit
alongside the editor's content.

If you only need images, the Markdown already encodes them and you don't
need `onAttachmentAdd`.

## Options

```tsx
type AttachmentUploadResult =
  | string
  | {
      url: string;
      alt?: string;
      [key: string]: unknown;
    };

interface Attachment {
  url: string;
  filename: string;
  mime: string;
  size: number;
  [key: string]: unknown;
}

interface AttachmentsPluginOptions {
  onUpload: (file: File) => Promise<AttachmentUploadResult>;
  accept?: string;
  uploadingPlaceholder?: (file: File) => string;
  onAttachmentAdd?: (attachment: Attachment) => void;
  onError?: (error: unknown, file: File) => void;
}
```

`accept` allows exact MIME types such as `image/png` and wildcards such as
`image/*`. Files that do not match are passed through to the editor's
normal paste/drop handling.

`onAttachmentAdd` is called only for non-image files. Images are inserted
inline and the Markdown source already records them. If `onAttachmentAdd`
is omitted and a non-image file is pasted, the file is passed through to
default paste/drop handling instead of being silently uploaded and dropped.
