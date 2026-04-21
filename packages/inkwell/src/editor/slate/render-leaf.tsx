import type { RenderLeafProps } from "slate-react";
import { editorClass } from "../../lib/class-names";
import type { InkwellText } from "./types";

/**
 * Render a text leaf with decoration marks applied by decorate().
 */
export function RenderLeaf({ attributes, children, leaf }: RenderLeafProps) {
  const l = leaf as InkwellText;

  // Markdown marker spans (dimmed)
  if (l.boldMarker || l.italicMarker || l.strikeMarker) {
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

  // Content marks (applied to text between markers)
  let content = children;
  if (l.bold) content = <strong>{content}</strong>;
  if (l.italic) content = <em>{content}</em>;
  if (l.strikethrough) content = <del>{content}</del>;
  if (l.inlineCode) content = <code>{content}</code>;

  // Syntax highlighting (hljs classes on code lines)
  if (l.hljs) {
    content = <span className={l.hljs}>{content}</span>;
  }

  // Remote cursor highlight (collaboration mode)
  if (l.remoteCursor) {
    content = (
      <span
        className={editorClass("remote-cursor")}
        style={{ backgroundColor: `${l.remoteCursor}30` }}
      >
        {content}
      </span>
    );
  }

  // Remote cursor caret (collaboration mode)
  if (l.remoteCursorCaret) {
    content = (
      <>
        <span
          className={editorClass("remote-caret")}
          style={{ borderColor: l.remoteCursor }}
          contentEditable={false}
        />
        {content}
      </>
    );
  }

  return <span {...attributes}>{content}</span>;
}
