import type { Blockquote, Paragraph, Root, Text } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";

/**
 * Remark plugin that flattens nested blockquotes.
 * Inner blockquotes are converted to text with "> " prefix
 * so `> > nested` renders as a blockquote containing "> nested".
 */
export default function remarkFlattenBlockquotes() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const newChildren: Blockquote["children"] = [];
      for (const child of node.children) {
        if (child.type === "blockquote") {
          // Convert nested blockquote to a paragraph with "> " prefix
          const text = mdastToString(child);
          const paragraph: Paragraph = {
            type: "paragraph",
            children: [{ type: "text", value: "> " + text } as Text],
          };
          newChildren.push(paragraph);
        } else {
          newChildren.push(child);
        }
      }
      node.children = newChildren;
    });
  };
}
