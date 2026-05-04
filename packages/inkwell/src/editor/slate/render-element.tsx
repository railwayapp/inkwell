import type { ReactNode } from "react";
import { Node } from "slate";
import { type RenderElementProps, useSelected } from "slate-react";
import { editorClass } from "../../lib/class-names";
import type { InkwellElement } from "./types";

const LIST_MARKER_RE = /^(\s*)(\d+\.|[-*+]) /;

/**
 * Render a block-level element. All types render as <p> with CSS classes.
 */
export function RenderElement({
  attributes,
  children,
  element,
}: RenderElementProps) {
  const el = element as InkwellElement;

  switch (el.type) {
    case "heading":
      return (
        <p
          {...attributes}
          className={`${editorClass("heading")} ${editorClass(`heading-${el.level ?? 1}`)}`}
        >
          {children}
        </p>
      );
    case "code-fence":
      return (
        <p {...attributes} className={editorClass("code-fence")}>
          {children}
        </p>
      );
    case "code-line":
      return (
        <p {...attributes} className={editorClass("code-line")}>
          {children}
        </p>
      );
    case "blockquote":
      return (
        <p {...attributes} className={editorClass("blockquote")}>
          {children}
        </p>
      );
    case "image":
      return (
        <ImageElement attributes={attributes} element={el}>
          {children}
        </ImageElement>
      );
    case "list-item": {
      const text = Node.string(el);
      const match = LIST_MARKER_RE.exec(text);
      const indent = match ? Math.floor(match[1].length / 2) : 0;
      const ordered = match ? /^\d+\.$/.test(match[2]) : false;
      return (
        <p
          {...attributes}
          className={editorClass("list-item")}
          data-list
          data-ordered={ordered || undefined}
          data-indent={indent > 0 ? indent : undefined}
        >
          {children}
        </p>
      );
    }
    default:
      return <p {...attributes}>{children}</p>;
  }
}

function ImageElement({
  attributes,
  element,
  children,
}: {
  attributes: RenderElementProps["attributes"];
  element: InkwellElement;
  children: ReactNode;
}) {
  const selected = useSelected();
  return (
    <div
      {...attributes}
      className={editorClass("image")}
      data-selected={selected || undefined}
    >
      <img
        src={element.url ?? ""}
        alt={element.alt ?? ""}
        contentEditable={false}
        draggable={false}
      />
      {children}
    </div>
  );
}
