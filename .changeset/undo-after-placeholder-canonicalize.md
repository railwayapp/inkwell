---
"@railway/inkwell": patch
---

Fixed an undo regression where `Cmd+A` + `Delete` on content ending in a non-paragraph block (e.g. a fenced code block) would leave the editor flashing between the stranded block and an empty paragraph instead of restoring content. The placeholder effect that canonicalizes an empty editor back to a single empty paragraph now runs inside `HistoryEditor.withoutSaving`, so it no longer occupies an undo slot and the first `Cmd+Z` pops the user's delete as expected.
