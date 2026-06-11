import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { InkwellSurface } from "./types";

type ListProps =
  | (Omit<ComponentPropsWithoutRef<"ul">, "children" | "type"> & {
      ordered?: false;
      surface: InkwellSurface;
      children?: ReactNode;
    })
  | (Omit<ComponentPropsWithoutRef<"ol">, "children" | "type"> & {
      ordered: true;
      surface: InkwellSurface;
      children?: ReactNode;
    });

/**
 * Block-level list shared by both surfaces. `ordered: true` renders an
 * `<ol>` (preserving any `start` attribute the renderer pipeline passes
 * through from mdast); otherwise renders a `<ul>`.
 */
export function List({ ordered, surface: _surface, ...rest }: ListProps) {
  if (ordered) {
    return <ol {...(rest as ComponentPropsWithoutRef<"ol">)} />;
  }
  return <ul {...(rest as ComponentPropsWithoutRef<"ul">)} />;
}
