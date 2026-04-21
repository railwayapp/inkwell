import type { Paragraph, Root, Table, TableRow, Text } from "mdast";

function rowToText(row: TableRow): string {
  return (
    "| " +
    row.children
      .map(cell =>
        cell.children
          .map(child => ("value" in child ? child.value : ""))
          .join(""),
      )
      .join(" | ") +
    " |"
  );
}

/**
 * Remark plugin that converts table nodes to plain text paragraphs.
 * Used alongside remark-gfm to keep strikethrough, autolinks, etc.
 * while disabling table rendering.
 */
export default function remarkNoTables() {
  return (tree: Root) => {
    tree.children = tree.children.map(node => {
      if (node.type !== "table") return node;

      const table = node as Table;
      const lines = table.children.map(rowToText);
      // Insert separator row after header
      if (lines.length > 0) {
        const colCount = table.children[0].children.length;
        const sep =
          "| " +
          Array.from({ length: colCount }, () => "---").join(" | ") +
          " |";
        lines.splice(1, 0, sep);
      }

      const paragraph: Paragraph = {
        type: "paragraph",
        children: [{ type: "text", value: lines.join("\n") } as Text],
      };
      return paragraph;
    });
  };
}
