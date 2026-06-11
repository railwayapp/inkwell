import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { editorClass } from "../lib/class-names";
import type { InkwellSurface } from "./types";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type HtmlHeadingTag = `h${HeadingLevel}`;

interface HeadingProps
  extends Omit<ComponentPropsWithoutRef<HtmlHeadingTag>, "children"> {
  /** Heading level (1-6). */
  level: HeadingLevel;
  /** Which surface is rendering — controls editor-only CSS classes. */
  surface: InkwellSurface;
  children?: ReactNode;
}

/**
 * Block-level heading shared by the editor render-element and the
 * renderer's rehype-react binding. Both surfaces render `<h1>`-`<h6>` so
 * markup parity holds; the editor adds `.inkwell-editor-heading*` classes
 * so editor-only CSS rules still apply.
 */
export function Heading({
  level,
  surface,
  className,
  children,
  ...rest
}: HeadingProps) {
  const Tag = `h${level}` as HtmlHeadingTag;
  const classes: string[] = [];
  if (surface === "editor") {
    classes.push(editorClass("heading"), editorClass(`heading-${level}`));
  }
  if (className) classes.push(className);
  const merged = classes.length > 0 ? classes.join(" ") : undefined;
  return (
    <Tag {...rest} className={merged}>
      {children}
    </Tag>
  );
}
