---
"@railway/inkwell": patch
---

Pressing Enter inside a heading now splits the line at the caret instead of leaving the text intact and inserting an empty paragraph below. Each half is re-classified against the markdown syntax it now contains:

- `## Try| it out` → h2 `## Try` + paragraph ` it out`
- `#|# Try it out` → paragraph `#` + h1 `# Try it out`
- `|## Title` → empty paragraph above, heading unchanged below

End-of-line, empty heading, and marker-only behaviors are unchanged.
