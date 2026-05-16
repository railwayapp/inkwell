import { type ReactNode, useMemo } from "react";
import type { InkwellRendererProps } from "../types";
import { CopyCodeBlock } from "./copy-code-block";
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
    () => ({ pre: CopyCodeBlock, ...components }),
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
