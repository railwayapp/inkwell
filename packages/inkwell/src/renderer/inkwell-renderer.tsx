import { type ReactNode, useMemo } from "react";
import { rendererComponents } from "../components/renderer-bindings";
import type { InkwellRendererProps } from "../types";
import { parseMarkdown } from "./markdown-parser";

export function InkwellRenderer({
  content,
  className,
  components,
  rehypePlugins,
  mentions,
  softBreak,
}: InkwellRendererProps): ReactNode {
  const mergedComponents = useMemo(
    () => ({ ...rendererComponents, ...components }),
    [components],
  );

  const rendered = useMemo(
    () =>
      parseMarkdown(content, {
        components: mergedComponents,
        rehypePlugins,
        mentions,
        softBreak,
      }),
    [content, mergedComponents, rehypePlugins, mentions, softBreak],
  );

  return (
    <div className={`inkwell-renderer ${className ?? ""}`}>{rendered}</div>
  );
}
