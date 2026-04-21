import type { RenderElementProps } from "slate-react";
import { editorClass } from "../../lib/class-names";
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
    case "list-item":
      return (
        <p {...attributes} className={editorClass("list-item")} data-list>
          {children}
        </p>
      );
    default:
      return <p {...attributes}>{children}</p>;
  }
}
