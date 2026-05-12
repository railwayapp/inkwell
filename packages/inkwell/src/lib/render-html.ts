import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { RehypePluginConfig } from "../types";
import remarkFlattenBlockquotes from "./remark-flatten-blockquotes";
import remarkNoTables from "./remark-no-tables";

/** Cache the default processor; custom plugin arrays get fresh processors. */
// biome-ignore lint/suspicious/noExplicitAny: unified processor chain types are incompatible across plugins
const processorCache = new Map<string, any>();

function createProcessor(rehypePlugins?: RehypePluginConfig[]) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkNoTables)
    .use(remarkFlattenBlockquotes)
    .use(remarkRehype);

  const plugins = rehypePlugins ?? [[rehypeHighlight, { detect: true }]];
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      const [rehypePlugin, ...options] = plugin;
      processor.use(rehypePlugin, ...options);
    } else {
      processor.use(plugin);
    }
  }

  processor.use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), "span"],
    attributes: {
      ...defaultSchema.attributes,
      code: ["className"],
      span: ["className"],
    },
  });

  processor.use(rehypeStringify);
  return processor;
}

function getProcessor(rehypePlugins?: RehypePluginConfig[]) {
  if (rehypePlugins) return createProcessor(rehypePlugins);

  const cached = processorCache.get("default");
  if (cached) return cached;

  const processor = createProcessor();
  processorCache.set("default", processor);
  return processor;
}

/**
 * Escape ">" at start of line when not followed by a space.
 * Prevents ">text" from being parsed as a blockquote — only "> text" is valid.
 */
function escapeBareBq(markdown: string): string {
  return markdown.replace(/^>(?=\S)/gm, "\\>");
}

/**
 * Parse markdown to an HTML string.
 */
export function renderMarkdownToHtml(
  markdown: string,
  rehypePlugins?: RehypePluginConfig[],
): string {
  const processor = getProcessor(rehypePlugins);
  return String(processor.processSync(escapeBareBq(markdown)));
}
