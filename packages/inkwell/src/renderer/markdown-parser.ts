import type { Nodes as HastNodes } from "hast";
import { createElement, Fragment, type ReactNode } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import rehypeHighlight from "rehype-highlight";
import rehypeReact from "rehype-react";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkRehype from "remark-rehype";
import type { Plugin } from "unified";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import rehypeTrimCodeBlockTrailingNewline from "../lib/rehype-trim-code-block-newline";
import { parseMarkdownToMdast } from "../mdast/parse";
import type {
  InkwellComponents,
  MentionRenderer,
  ParseMarkdownOptions,
  RehypePluginConfig,
} from "../types";

// biome-ignore lint/suspicious/noExplicitAny: unified Plugin type
type RehypePlugin = Plugin<any[], any>;

interface ProcessorOptions {
  components?: InkwellComponents;
  rehypePlugins?: RehypePluginConfig[];
  mentions?: MentionRenderer[];
}

/**
 * Element tag used to carry a mention-match placeholder through the
 * rehype → rehype-react boundary. A unique index keys it back to the
 * per-mention resolver registered in `components`.
 */
const MENTION_TAG_PREFIX = "inkwell-mention-";

/**
 * Rehype plugin that splits text nodes on the configured mention patterns
 * and replaces each match with a placeholder element. The placeholder is
 * hydrated to a React node by rehype-react via a `components` override.
 *
 * Runs AFTER rehype-sanitize so the custom tag isn't stripped; the split
 * preserves surrounding text as sibling text nodes.
 */
function rehypeMentions(mentions: MentionRenderer[]): RehypePlugin {
  // biome-ignore lint/suspicious/noExplicitAny: hast types
  return () => (tree: any) => {
    if (mentions.length === 0) return;

    // biome-ignore lint/suspicious/noExplicitAny: hast types
    visit(tree as any, "text", (node: any, index, parent: any) => {
      if (typeof node.value !== "string" || !parent || index == null) return;
      const text: string = node.value;

      // Find the earliest match across all patterns.
      type Hit = {
        start: number;
        end: number;
        mentionIdx: number;
        matchText: string;
      };
      const hits: Hit[] = [];
      for (let i = 0; i < mentions.length; i++) {
        const re = new RegExp(
          mentions[i].pattern.source,
          mentions[i].pattern.flags.includes("g")
            ? mentions[i].pattern.flags
            : `${mentions[i].pattern.flags}g`,
        );
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          hits.push({
            start: m.index,
            end: m.index + m[0].length,
            mentionIdx: i,
            matchText: m[0],
          });
          if (m[0].length === 0) re.lastIndex++;
        }
      }
      if (hits.length === 0) return;

      // Sort + drop overlapping matches (keep earliest; first-registered wins
      // for ties).
      hits.sort((a, b) => a.start - b.start || a.mentionIdx - b.mentionIdx);
      const nonOverlapping: Hit[] = [];
      let cursor = 0;
      for (const hit of hits) {
        if (hit.start < cursor) continue;
        nonOverlapping.push(hit);
        cursor = hit.end;
      }

      // Build replacement node list.
      const replacements: unknown[] = [];
      let offset = 0;
      for (const hit of nonOverlapping) {
        if (hit.start > offset) {
          replacements.push({
            type: "text",
            value: text.slice(offset, hit.start),
          });
        }
        replacements.push({
          type: "element",
          tagName: `${MENTION_TAG_PREFIX}${hit.mentionIdx}`,
          properties: { "data-match": hit.matchText },
          children: [],
        });
        offset = hit.end;
      }
      if (offset < text.length) {
        replacements.push({
          type: "text",
          value: text.slice(offset),
        });
      }

      parent.children.splice(index, 1, ...replacements);
      return [SKIP, index + replacements.length];
    });
  };
}

/**
 * Build the mdast → hast → React processor. Starts at `remarkRehype`
 * because the front of the pipeline (remark-parse + GFM + the
 * project-specific shaping plugins + bare-blockquote escape) lives in
 * `mdast/parse.ts` so both surfaces share it. Anything that mutates
 * mdast belongs upstream; anything that mutates hast or compiles the
 * tree to React belongs here.
 */
function createProcessor(options: ProcessorOptions = {}) {
  const proc = unified().use(remarkRehype);

  const plugins = options.rehypePlugins ?? [
    [rehypeHighlight, { detect: true }],
  ];
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      const [rehypePlugin, ...options] = plugin;
      proc.use(rehypePlugin, ...options);
    } else {
      proc.use(plugin);
    }
  }

  // Strip the structural trailing "\n" remark-parse keeps inside
  // <pre><code>; runs after highlight so the spine walk lands on the last
  // highlighted text node, before sanitize so output stays tidy.
  proc.use(rehypeTrimCodeBlockTrailingNewline);

  proc.use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), "span"],
    attributes: {
      ...defaultSchema.attributes,
      code: ["className"],
      span: ["className"],
    },
  });

  // Mentions must run AFTER sanitize so the placeholder tag isn't stripped.
  const mentionConfigs = options.mentions ?? [];
  if (mentionConfigs.length > 0) {
    proc.use(rehypeMentions(mentionConfigs));
  }

  // Register per-mention React components so the placeholder tags hydrate
  // to the resolved nodes.
  const mentionComponents: InkwellComponents = {};
  mentionConfigs.forEach((cfg, i) => {
    const tag = `${MENTION_TAG_PREFIX}${i}` as keyof InkwellComponents;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic component map
    (mentionComponents as any)[tag] = (props: { "data-match"?: string }) => {
      const matchText = props["data-match"] ?? "";
      const exec = new RegExp(cfg.pattern.source, cfg.pattern.flags).exec(
        matchText,
      );
      if (!exec) return matchText;
      return cfg.resolve(exec);
    };
  });

  proc.use(rehypeReact, {
    createElement,
    Fragment,
    jsx,
    jsxs,
    components: { ...mentionComponents, ...(options.components ?? {}) },
  });

  return proc;
}

/**
 * Parse a markdown string into React elements synchronously.
 *
 * Front-end mdast parsing (remark-parse + GFM + project plugins +
 * bare-blockquote escape) goes through `parseMarkdownToMdast` — the
 * same function the editor uses — then the resulting tree flows
 * through the rehype/React processor.
 */
export function parseMarkdown(
  content: string,
  options: ParseMarkdownOptions = {},
): ReactNode {
  const mdast = parseMarkdownToMdast(content, { softBreak: options.softBreak });
  const processor = createProcessor(options);
  const hast = processor.runSync(mdast) as HastNodes;
  return processor.stringify(hast) as ReactNode;
}
