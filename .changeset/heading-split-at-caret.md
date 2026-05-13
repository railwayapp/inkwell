---
"@railway/inkwell": patch
---

Pressing Enter inside a heading now splits the line at the caret instead of leaving the text intact and inserting an empty paragraph below. Each half is re-classified against the markdown syntax it now contains: pressing Enter between the two `#`s of `## Try it out` produces a paragraph `#` on the first line and an h1 heading `# Try it out` on the second; pressing Enter mid-body in `## Try it out` keeps the head as a heading and drops the tail to a paragraph; pressing Enter at the start inserts an empty paragraph above and leaves the heading in place. The empty-heading clear-to-paragraph behavior is unchanged.
