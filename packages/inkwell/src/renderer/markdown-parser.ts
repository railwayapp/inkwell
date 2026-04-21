import { createElement, Fragment, type ReactNode } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import rehypeHighlight from "rehype-highlight";
import rehypeReact from "rehype-react";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import type { Plugin } from "unified";
import { unified } from "unified";
import remarkFlattenBlockquotes from "../lib/remark-flatten-blockquotes";
import remarkNoTables from "../lib/remark-no-tables";
import type { InkwellComponents } from "../types";

// biome-ignore lint/suspicious/noExplicitAny: unified Plugin type
type RehypePlugin = Plugin<any[], any>;
type RehypePluginConfig =
  | RehypePlugin
  | [RehypePlugin, Record<string, unknown>];

interface ProcessorOptions {
  components?: InkwellComponents;
  rehypePlugins?: RehypePluginConfig[];
}

function createProcessor(options: ProcessorOptions = {}) {
  const proc = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkNoTables)
    .use(remarkFlattenBlockquotes)
    .use(remarkRehype);

  const plugins = options.rehypePlugins ?? [
    [rehypeHighlight, { detect: true }],
  ];
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      proc.use(plugin[0], plugin[1]);
    } else {
      proc.use(plugin);
    }
  }

  proc.use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), "span"],
    attributes: {
      ...defaultSchema.attributes,
      code: ["className"],
      span: ["className"],
    },
  });

  proc.use(rehypeReact, {
    createElement,
    Fragment,
    jsx,
    jsxs,
    components: options.components ?? {},
  });

  return proc;
}

/**
 * Escape ">" at start of line when not followed by a space.
 */
function escapeBareBq(markdown: string): string {
  return markdown.replace(/^>(?=\S)/gm, "\\>");
}

/**
 * Parse a markdown string into React elements synchronously
 */
export function parseMarkdown(
  markdown: string,
  components?: InkwellComponents,
  rehypePlugins?: RehypePluginConfig[],
): ReactNode {
  const processor = createProcessor({ components, rehypePlugins });
  const file = processor.processSync(escapeBareBq(markdown));
  return file.result;
}
