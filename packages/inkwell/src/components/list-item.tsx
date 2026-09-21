import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { InkwellSurface } from "./types";

interface ListItemProps
  extends Omit<ComponentPropsWithoutRef<"li">, "children"> {
  surface: InkwellSurface;
  children?: ReactNode;
}

/** List item shared by both surfaces. */
export function ListItem({
  surface: _surface,
  children,
  ...rest
}: ListItemProps) {
  return <li {...rest}>{children}</li>;
}
