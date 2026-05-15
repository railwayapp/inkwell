---
"@railway/inkwell": minor
---

Plugin pickers (slash commands, snippets, emoji, mentions) now flip above the
caret when there isn't room below, and shift left when they would overflow the
viewport right edge. Flipped popups receive the new
`.inkwell-plugin-picker-popup-flipped` class for any flip-specific styling.
`PluginRenderProps` gains an optional `cursorRect` field so custom plugins can
use the same placement strategy in their own popups.
