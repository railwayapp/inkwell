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
}: InkwellRendererProps): ReactNode {
  const mergedComponents = useMemo(() => {
    if (!copyButton) return components;
    return { pre: CopyCodeBlock, ...components };
  }, [copyButton, components]);

  const rendered = useMemo(
    () => parseMarkdown(content, mergedComponents, rehypePlugins),
    [content, mergedComponents, rehypePlugins],
  );

  return (
    <div className={`inkwell-renderer ${className ?? ""}`}>{rendered}</div>
  );
}
