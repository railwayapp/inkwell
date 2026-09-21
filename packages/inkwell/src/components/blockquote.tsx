import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { editorClass } from "../lib/class-names";
import type { InkwellSurface } from "./types";

interface BlockquoteProps
  extends Omit<ComponentPropsWithoutRef<"blockquote">, "children"> {
  /** Which surface is rendering — controls editor-only CSS classes. */
  surface: InkwellSurface;
  children?: ReactNode;
}

/** Block-level blockquote shared by the editor and renderer surfaces. */
export function Blockquote({
  surface,
  className,
  children,
  ...rest
}: BlockquoteProps) {
  const classes: string[] = [];
  if (surface === "editor") classes.push(editorClass("blockquote"));
  if (className) classes.push(className);
  const merged = classes.length > 0 ? classes.join(" ") : undefined;
  return (
    <blockquote {...rest} className={merged}>
      {children}
    </blockquote>
  );
}
