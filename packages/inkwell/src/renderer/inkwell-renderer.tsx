import { type ReactNode, useMemo } from "react";
import type { InkwellRendererProps } from "../types";
import { CopyCodeBlock } from "./copy-code-block";
import { parseMarkdown } from "./markdown-parser";

export function InkwellRenderer({
  content,
  className,
  components,
  rehypePlugins,
  copyButton = true,
  mentions,
}: InkwellRendererProps): ReactNode {
  const mergedComponents = useMemo(() => {
    if (!copyButton) return components;
    return { pre: CopyCodeBlock, ...components };
  }, [copyButton, components]);

  const rendered = useMemo(
    () =>
      parseMarkdown(content, {
        components: mergedComponents,
        rehypePlugins,
        mentions,
      }),
    [content, mergedComponents, rehypePlugins, mentions],
  );

  return (
    <div className={`inkwell-renderer ${className ?? ""}`}>{rendered}</div>
  );
}
