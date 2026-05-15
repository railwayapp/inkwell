---
"@railway/inkwell": minor
---

Fold the character-limit feature natively into `InkwellEditor` as a soft
budget with a built-in count readout.

When `characterLimit` is set, the editor renders a small `count / limit`
display in the bottom-right of the wrapper. The readout is muted gray
below the limit and red when over; the wrapper picks up
`.inkwell-editor-has-character-limit` so the bundled stylesheet can reserve
space for the count. When the count is over budget, the wrapper also gets
`.inkwell-editor-over-limit`, and the bundled stylesheet paints a red border
on the editor surface. `InkwellEditorState.overLimit` reflects the same
condition.

Typing past the limit is allowed — the editor does not block input,
truncate content, or override Slate write paths. Consumers that need a
true hard cap should enforce it at the form/submit layer where they can
make decisions about partial submission, error states, etc.

Breaking changes:

- Removes `createCharacterLimitPlugin` and `CharacterLimitPluginOptions`
  exports. The plugin's toast UI was incoherent with what "limit" means
  and has been replaced with the inline count readout.
- Removes the `enforceCharacterLimit` prop. The previous "hard clamp"
  mode could not be made airtight against slate-react's native typing
  fast-path or `Transforms.insertNodes` bypasses, and the soft-limit
  + visual signal is the better trade.
- Removes the `isEnforcingCharacterLimit` field from `InkwellEditorState`.
- Removes the `.inkwell-editor-limit-toast` / `inkwell-editor-limit-toast-icon`
  CSS hooks. Style the new `.inkwell-editor-character-count` and
  `.inkwell-editor-character-count-over` classes instead. Use
  `.inkwell-editor-has-character-limit` for wrapper-level spacing overrides.
