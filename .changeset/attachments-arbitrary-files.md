---
"@railway/inkwell": minor
---

`createAttachmentsPlugin` now supports arbitrary (non-image) files via a new optional `onAttachmentAdd(attachment)` callback. Image files (`image/*`) still insert inline as image blocks; non-image files upload through `onUpload` and surface to your code as an `Attachment` (`{ url, filename, mime, size }` plus any extra fields you return from `onUpload`). The new `Attachment` type is exported from the package root.

Non-image files with no `onAttachmentAdd` are passed through to the editor's default paste/drop handling rather than being silently uploaded and dropped. Existing setups using `accept: "image/*"` see no behavior change.
