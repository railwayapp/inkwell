import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InkwellEditor } from "./editor/inkwell-editor";
import { InkwellRenderer } from "./renderer/inkwell-renderer";

/**
 * DOM-parity guard. For each markdown source, render through both
 * `InkwellRenderer` and a read-only `InkwellEditor` and compare the
 * sequence of block-level tags emitted by each.
 *
 * Things we deliberately ignore:
 * - `data-slate-*` wrapper spans the editor emits inside each block
 *   (they live below the block boundary and don't affect block markup).
 * - Wrapper `<div>` chrome around the renderer / editor.
 *
 * Things deliberately NOT in scope:
 * - Links: still text + decoration in the editor (D1=visible). The
 *   renderer wraps them in `<a>`. Parity test ignores `<a>`.
 */

const BLOCK_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "p",
  "pre",
  "ul",
  "ol",
  "li",
  "img",
]);

/**
 * Tags treated as leaves for parity comparison:
 * - `<li>`: editor schema always wraps a list-item's content in a `<p>`
 *   (Slate's text-bearing block); the renderer pipeline drops the `<p>`
 *   for tight lists. Stopping the walk at `<li>` papers over that
 *   structural diff without losing list-presence checks.
 *
 * Additionally, a `<p>` whose only meaningful descendant is an `<img>`
 * is collapsed to just `img` — the renderer pipeline always wraps
 * standalone images in `<p>` (mdast: `paragraph > image`), while the
 * editor surface uses a top-level block image with its own selection
 * chrome. The image is visually equivalent on both surfaces; only the
 * wrapper differs.
 */
function blockSkeleton(scope: Element | null): string[] {
  if (!scope) return [];
  const tags: string[] = [];
  function isImageOnlyParagraph(node: Element): boolean {
    if (node.tagName.toLowerCase() !== "p") return false;
    if ((node.textContent ?? "").trim() !== "") return false;
    return node.querySelector("img") !== null;
  }
  function walk(node: Element) {
    if (isImageOnlyParagraph(node)) {
      // Skip the `<p>` wrapper; the `<img>` inside will be picked up
      // when we descend into the children.
      for (const child of Array.from(node.children)) walk(child);
      return;
    }
    const tag = node.tagName.toLowerCase();
    if (BLOCK_TAGS.has(tag)) tags.push(tag);
    if (tag === "li") return;
    for (const child of Array.from(node.children)) walk(child);
  }
  walk(scope);
  return tags;
}

function editorBlocks(editorContainer: Element): string[] {
  const editor = editorContainer.querySelector(".inkwell-editor");
  if (!editor) return [];
  // A paragraph that contains an inline element (like `<img>`) is NOT
  // an empty separator — it just has no text. Detect "empty" by both
  // textContent and the absence of any block-tag descendants so a
  // transient empty editor paragraph from a partial edit doesn't get
  // counted as a block when the renderer side has nothing matching.
  const tags: string[] = [];
  function walk(node: Element) {
    const tag = node.tagName.toLowerCase();
    if (BLOCK_TAGS.has(tag)) {
      const hasBlockDescendant = Array.from(node.querySelectorAll("*")).some(
        el => BLOCK_TAGS.has(el.tagName.toLowerCase()),
      );
      const isEmptyParagraph =
        tag === "p" &&
        !hasBlockDescendant &&
        (node.textContent ?? "").trim() === "";
      if (!isEmptyParagraph) tags.push(tag);
    }
    if (tag === "li") return;
    for (const child of Array.from(node.children)) walk(child);
  }
  walk(editor);
  return tags;
}

function rendererBlocks(container: Element): string[] {
  const renderer = container.querySelector(".inkwell-renderer");
  return blockSkeleton(renderer);
}

const SOURCES: Array<{ name: string; source: string }> = [
  { name: "single paragraph", source: "hello world" },
  {
    name: "heading levels 1-6",
    source: "# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6",
  },
  { name: "heading + paragraph", source: "# title\nsome body text" },
  { name: "blockquote with one paragraph", source: "> quoted text" },
  { name: "blockquote with two paragraphs", source: "> first\n>\n> second" },
  { name: "nested blockquote", source: "> > nested" },
  { name: "code block alone", source: "```\ncode\n```" },
  { name: "code block with language", source: "```ts\nconst x = 1;\n```" },
  {
    name: "code block between paragraphs",
    source: "intro\n\n```ts\nconst x = 1;\n```\n\noutro",
  },
  { name: "unordered list", source: "- one\n- two\n- three" },
  { name: "ordered list", source: "1. one\n2. two" },
  { name: "ordered list with custom start", source: "5. five\n6. six" },
  {
    name: "image on its own line",
    source: "![alt](https://img/cat.png)",
  },
  {
    name: "image between paragraphs",
    source: "before\n\n![alt](https://img/cat.png)\n\nafter",
  },
  { name: "mixed blocks", source: "# title\nintro paragraph\n> a quote" },
];

afterEach(() => {
  cleanup();
});

describe("DOM parity: editor vs renderer", () => {
  it.each(SOURCES)("$name — block-level tags match", ({ source }) => {
    const renderer = render(<InkwellRenderer content={source} />);
    const editor = render(<InkwellEditor content={source} editable={false} />);

    const rTags = rendererBlocks(renderer.container);
    const eTags = editorBlocks(editor.container);
    expect(eTags).toEqual(rTags);
  });
});
