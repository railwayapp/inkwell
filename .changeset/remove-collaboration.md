---
"@railway/inkwell": major
---

Remove collaboration support from the editor API and runtime.

Breaking changes:

- Removes the `collaboration` prop from `<InkwellEditor />`.
- Removes the `CollaborationConfig` public type export.
- Removes Yjs document seeding, awareness cursor handling, remote cursor
  rendering, and collaborative history integration.
- Removes direct dependencies on `@slate-yjs/core`, `y-protocols`, and `yjs`.

Consumers using collaborative editing must manage that integration outside of
Inkwell or stay on a previous release that includes Yjs support.
