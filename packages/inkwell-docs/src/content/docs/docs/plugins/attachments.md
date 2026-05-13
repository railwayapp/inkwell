---
title: "Attachments"
---

The attachments plugin intercepts pasted or dropped files, uploads each file
with your `onUpload` callback, and inserts an image block into the Markdown.
It also handles copied HTML `<img>` elements by inserting a block image for
each safe `src` directly; those HTML URLs are not uploaded through `onUpload`.
Safe image URLs are `http:`, `https:`, protocol-relative, relative paths,
`blob:`, or raster `data:image/png|jpeg|jpg|gif|webp`. Missing or unsafe
values such as `javascript:`, `file:`, `data:text/html`, or
`data:image/svg+xml` are ignored.

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

While upload is pending, Inkwell inserts an image placeholder with the default
alt text `Uploading…`. When the promise resolves, the returned URL is validated
against the same safe image URL allowlist before it is stored. Safe URLs update
the placeholder and use either the returned `alt`, when provided, or the
original file name as alt text. If upload fails or returns an unsafe URL, the
placeholder is removed and `onError` is called.

## Options

```tsx
type AttachmentUploadResult =
  | string
  | {
      url: string;
      alt?: string;
    };

interface AttachmentsPluginOptions {
  onUpload: (file: File) => Promise<AttachmentUploadResult>;
  accept?: string;
  uploadingPlaceholder?: (file: File) => string;
  onError?: (error: unknown, file: File) => void;
}
```

`accept` allows exact MIME types such as `image/png` and wildcards such as
`image/*`. Files that do not match are passed through to the editor's normal
paste/drop handling.
