import type { ReactNode } from "react";
import { type RenderElementProps, useSelected } from "slate-react";
import { editorClass } from "../../lib/class-names";
import { sanitizeImageUrl } from "../../lib/safe-url";
import type { InkwellElement } from "./types";

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
        src={sanitizeImageUrl(element.url)}
        alt={element.alt ?? ""}
        contentEditable={false}
        draggable={false}
      />
      {children}
    </div>
  );
}
