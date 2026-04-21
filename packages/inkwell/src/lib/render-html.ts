import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import type { Plugin } from "unified";
import { unified } from "unified";
import remarkFlattenBlockquotes from "./remark-flatten-blockquotes";
import remarkNoTables from "./remark-no-tables";

// biome-ignore lint/suspicious/noExplicitAny: unified Plugin type
type RehypePlugin = Plugin<any[], any>;
type RehypePluginConfig =
  | RehypePlugin
  | [RehypePlugin, Record<string, unknown>];

/**
 * Cache processors by serialized plugin config to avoid recreating.
 */
// biome-ignore lint/suspicious/noExplicitAny: unified processor chain types are incompatible across plugins
const processorCache = new Map<string, any>();

function getProcessor(rehypePlugins?: RehypePluginConfig[]) {
  const key = rehypePlugins
    ? JSON.stringify(
        rehypePlugins.map(p => (Array.isArray(p) ? p[1] : "default")),
      )
    : "default";

  const cached = processorCache.get(key);
  if (cached) return cached;

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkNoTables)
    .use(remarkFlattenBlockquotes)
    .use(remarkRehype);

  const plugins = rehypePlugins ?? [[rehypeHighlight, { detect: true }]];
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      processor.use(plugin[0], plugin[1]);
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
  processorCache.set(key, processor);
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
