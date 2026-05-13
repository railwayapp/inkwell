---
"@railway/inkwell": patch
---

Block elements now stay in sync with the markdown source they carry, regardless of how that source was edited.

- **Enter inside a heading** splits at the caret instead of leaving the text intact and inserting an empty paragraph below. Each half is re-classified against the markdown syntax it now contains — pressing Enter between the two `#`s of `## Try it out` produces a paragraph `#` on the first line and an h1 heading `# Try it out` on the second; pressing Enter mid-body keeps the head as a heading and drops the tail to a paragraph; pressing Enter at the very start inserts an empty paragraph above. The empty-heading clear-to-paragraph behavior is unchanged.
- **A new `normalizeNode` hook re-classifies block elements on every operation**, so backspacing the trailing space of `## ` demotes the heading back to a paragraph, backspacing one of the markers in `### Foo` re-promotes it as the appropriate level (or drops to paragraph if disabled), and the same logic applies to blockquotes. The deserializer's per-line block detection used to run only on initial load and paste; it now also drives in-editor edits.
