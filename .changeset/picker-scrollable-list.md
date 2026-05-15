---
"@railway/inkwell": minor
---

Plugin pickers (slash commands, snippets, mentions, emoji) now cap their item
list at a fixed 240px height and become scrollable when there are more results.
The new `.inkwell-plugin-picker-list` class targets the list container, and the
bundled stylesheet ships a themed thin scrollbar that uses the existing Inkwell
border tokens. Keyboard navigation still auto-scrolls the active item into view.
