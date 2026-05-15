---
"@railway/inkwell": patch
---

Plugin picker placement now flips above the caret when the popup would overflow
the editor wrapper's bottom edge, not just the viewport bottom. This catches
short editors (chat composers, compact embeds) where the popup would spill past
the editor's visible box even when the viewport has room below.
