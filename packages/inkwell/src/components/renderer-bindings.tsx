import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { InkwellComponents } from "../types";
import { Blockquote } from "./blockquote";
import { CodeBlock } from "./code-block";
import { Heading, type HeadingLevel } from "./heading";
import { Image } from "./image";
import { List } from "./list";
import { ListItem } from "./list-item";

function bindHeading(level: HeadingLevel) {
  return function HeadingBinding(
    props: ComponentPropsWithoutRef<"h1"> & { children?: ReactNode },
  ) {
    return <Heading {...props} level={level} surface="renderer" />;
  };
}

function BlockquoteBinding(
  props: ComponentPropsWithoutRef<"blockquote"> & { children?: ReactNode },
) {
  return <Blockquote {...props} surface="renderer" />;
}

function PreBinding(
  props: ComponentPropsWithoutRef<"pre"> & { children?: ReactNode },
) {
  return <CodeBlock {...props} surface="renderer" />;
}

function UlBinding(
  props: ComponentPropsWithoutRef<"ul"> & { children?: ReactNode },
) {
  return <List {...props} surface="renderer" />;
}

function OlBinding(
  props: ComponentPropsWithoutRef<"ol"> & { children?: ReactNode },
) {
  return <List {...props} ordered surface="renderer" />;
}

function LiBinding(
  props: ComponentPropsWithoutRef<"li"> & { children?: ReactNode },
) {
  return <ListItem {...props} surface="renderer" />;
}

function ImgBinding(props: ComponentPropsWithoutRef<"img">) {
  // rehype-react guarantees `src` is a string on `<img>` from mdast.
  const src = typeof props.src === "string" ? props.src : "";
  return <Image {...props} surface="renderer" src={src} />;
}

/**
 * Default rehype-react component bindings shared with the editor surface
 * (via `components/` exports). Consumers can override any of these via
 * `<InkwellRenderer components={...} />`.
 */
export const rendererComponents: InkwellComponents = {
  h1: bindHeading(1),
  h2: bindHeading(2),
  h3: bindHeading(3),
  h4: bindHeading(4),
  h5: bindHeading(5),
  h6: bindHeading(6),
  blockquote: BlockquoteBinding,
  pre: PreBinding,
  ul: UlBinding,
  ol: OlBinding,
  li: LiBinding,
  img: ImgBinding,
};
