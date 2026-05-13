---
"@railway/inkwell": patch
---

Copy/cut now writes a clean Markdown serialization to the clipboard's `text/plain` payload instead of the browser's `innerText` of the rendered HTML. Empty paragraphs no longer produce a phantom extra newline, so the gap a user sees in the editor (one blank line) matches what they paste into plain-text consumers like Discord (one blank line, not two). The HTML and slate-fragment payloads remain unchanged so paste-back into Slate or other rich-text editors still works.
