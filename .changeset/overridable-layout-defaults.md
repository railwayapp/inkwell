---
"@railway/inkwell": minor
---

Make editor layout defaults zero-cost to override.

The bundled stylesheet no longer ships a `min-height` (or any container-size)
opinion on `.inkwell-editor`. Container sizing is a consumer decision — set
the height you want on `styles.editor`, `classNames.editor`, or your own CSS.
Existing apps that relied on the implicit 200px floor should pass
`styles={{ editor: { minHeight: 200 } }}` (or equivalent) explicitly.

Visual-chrome defaults on `.inkwell-editor` (padding, border, border-radius,
background, font-size, line-height, transition) and on `.inkwell-renderer`
(font-size, line-height) are now wrapped in `:where()` so any single-class
consumer rule wins by specificity tie-break — no `!important`, no descendant
scoping. The `.inkwell-editor:focus-within` border-color and the
character-limit padding follow the same pattern.

Practical effect for downstream consumers like chat composers:

```tsx
// Now Just Works — Tailwind utilities win on a single class.
<InkwellEditor classNames={{ editor: "border-0 bg-transparent px-3 py-2" }} />
```
