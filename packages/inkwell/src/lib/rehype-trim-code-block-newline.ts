import type { Element, Root, Text } from "hast";
import { visit } from "unist-util-visit";

/**
 * Strip the structural trailing newline that CommonMark requires before a
 * closing fence. Without this, `<pre><code>hello\n</code></pre>` paints an
 * empty visual line under the last source line of every code block.
 *
 * Walks the rightmost descendant of `<pre><code>` so it handles the case
 * where rehype-highlight has wrapped the content in nested `<span>`s.
 * Removes exactly one trailing "\n" — author-written trailing blanks stay.
 */
export default function rehypeTrimCodeBlockTrailingNewline() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, _index, parent) => {
      if (node.tagName !== "code") return;
      if (
        !parent ||
        parent.type !== "element" ||
        (parent as Element).tagName !== "pre"
      ) {
        return;
      }

      // Walk down the rightmost spine to find the last text node.
      const spine: Element[] = [node];
      let cursor: Element | Text = node;
      while (cursor.type === "element") {
        const children = cursor.children;
        if (!children.length) return;
        const last = children[children.length - 1];
        if (last.type !== "element" && last.type !== "text") return;
        cursor = last as Element | Text;
        if (cursor.type === "element") spine.push(cursor);
      }

      if (!cursor.value.endsWith("\n")) return;
      cursor.value = cursor.value.slice(0, -1);

      // If the strip emptied the text node, drop it so we don't leave a
      // dangling empty child.
      if (cursor.value === "") {
        const owner = spine[spine.length - 1];
        owner.children.pop();
      }
    });
  };
}
