import type { Nodes as HastNodes } from "hast";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { parseMarkdownToMdast } from "../mdast/parse";
import type { RehypePluginConfig } from "../types";

/** Cache the default processor; custom plugin arrays get fresh processors. */
// biome-ignore lint/suspicious/noExplicitAny: unified processor chain types are incompatible across plugins
const processorCache = new Map<string, any>();

/**
 * Build the mdast → hast → HTML-string processor. Front-end mdast
 * parsing lives in `parseMarkdownToMdast` so both the editor surface
 * and this HTML utility see the same tree — keeping the bare-`>`
 * escape, GFM, table/thematic-break filtering, and soft-break shaping
 * in exactly one place.
 */
function createProcessor(rehypePlugins?: RehypePluginConfig[]) {
  const processor = unified().use(remarkRehype);

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
 * Parse markdown to an HTML string. The mdast tree comes from the
 * shared `parseMarkdownToMdast`; rehype plugins + sanitize + stringify
 * run here.
 */
export function renderMarkdownToHtml(
  markdown: string,
  rehypePlugins?: RehypePluginConfig[],
): string {
  const mdast = parseMarkdownToMdast(markdown);
  const processor = getProcessor(rehypePlugins);
  const hast = processor.runSync(mdast) as HastNodes;
  return String(processor.stringify(hast));
}
