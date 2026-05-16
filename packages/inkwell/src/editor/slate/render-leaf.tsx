import type { RenderLeafProps } from "slate-react";
import { editorClass } from "../../lib/class-names";
import type { InkwellText } from "./types";

/**
 * Render a text leaf with decoration marks applied by decorate().
 */
export function RenderLeaf({ attributes, children, leaf }: RenderLeafProps) {
  const l = leaf as InkwellText;

  // Markdown marker spans (dimmed)
  if (l.boldMarker || l.italicMarker || l.strikeMarker || l.linkMarker) {
    return (
      <span {...attributes} className={editorClass("marker")}>
        {children}
      </span>
    );
  }
  if (l.codeMarker) {
    return (
      <span {...attributes} className={editorClass("backtick")}>
        {children}
      </span>
    );
  }
  // Link URL inside [text](url) — dimmed like a marker, exposed under its
  // own class so consumers can restyle independently.
  if (l.linkUrl) {
    return (
      <span
        {...attributes}
        className={`${editorClass("marker")} ${editorClass("link-url")}`}
      >
        {children}
      </span>
    );
  }

  // Content marks (applied to text between markers)
  let content = children;
  if (l.bold) content = <strong>{content}</strong>;
  if (l.italic) content = <em>{content}</em>;
  if (l.strikethrough) content = <del>{content}</del>;
  if (l.inlineCode) content = <code>{content}</code>;
  // Link styling stays on a span (not an `<a>`) so the editor caret can
  // sit inside the link without slate-react fighting an anchor element.
  if (l.link) {
    content = <span className={editorClass("link")}>{content}</span>;
  }

  // Syntax highlighting (hljs classes on code lines)
  if (l.hljs) {
    content = <span className={l.hljs}>{content}</span>;
  }

  return <span {...attributes}>{content}</span>;
}
