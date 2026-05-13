---
"@railway/inkwell": patch
---

Pressing Enter inside an unordered-list paragraph now respects the caret position. Mid-content presses split the line at the caret and carry the tail onto a new list item below. Enter at the very start of content (just past the marker) pushes an empty list item above and keeps the original content and caret in place. Selection ranges are deleted first, then the split logic applies to the collapsed point.
