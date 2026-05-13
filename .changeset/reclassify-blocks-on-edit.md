---
"@railway/inkwell": patch
---

Block element types now stay in sync with the markdown source on every edit. A new Slate `normalizeNode` hook reruns the deserializer's per-line block classification (heading at any enabled level, blockquote, paragraph) after every operation, so paths the old typing-trigger logic missed — backspace, paste-inside-block, programmatic `setContent` — produce the right element type. Backspacing the trailing space of `## ` now demotes the heading back to a paragraph, backspacing one of the markers in `### Foo` re-promotes it as h2 (or drops to paragraph if h2 is disabled), and text like `## Features` rendering as unstyled paragraph source is no longer possible. Feature flags are honored at reclassification, and code-fence, code-line, and image nodes are skipped since they aren't 1:1 with a markdown line.
