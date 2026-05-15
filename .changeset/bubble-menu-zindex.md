---
"@railway/inkwell": patch
---

Raise the bubble menu's `z-index` from `1100` to `9999` so it floats above
high-stacking host UI (modals, sticky headers, drawers) without consumers
having to override the bundled stylesheet.
