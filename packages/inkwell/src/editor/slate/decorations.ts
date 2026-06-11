import { Element, Node, type NodeEntry, type Range } from "slate";
import { renderMarkdownToHtml } from "../../lib/render-html";
import type { RehypePluginConfig } from "../../types";
import type { InkwellElement, InkwellText } from "./types";

/**
 * Compute decoration ranges for a Slate node entry.
 *
 * Two decoration modes:
 * 1. Inline markdown marks (paragraph, heading):
 *    Scans for **bold**, *italic*, _italic_, ~~strike~~, `code`, links.
 * 2. Code syntax highlighting (code-block):
 *    Runs highlight.js over the block's entire text leaf in a single
 *    pass; offsets map directly to the flat text since the block holds
 *    one multi-line text leaf (no per-line splitting needed).
 */
export function computeDecorations(
  entry: NodeEntry,
  _editor: unknown,
  rehypePlugins?: RehypePluginConfig[],
): Range[] {
  const [node, _path] = entry;

  if (!Element.isElement(node)) return [];

  const element = node as InkwellElement;

  if (element.type === "code-block") {
    return computeCodeBlockDecorations(entry, rehypePlugins);
  }

  if (element.type === "paragraph" || element.type === "heading") {
    return computeInlineDecorations(entry);
  }

  // Blockquote holds block children under the nestable schema — its
  // direct `Node.string` walks all descendants, but the decoration
  // ranges are computed against text-leaf offsets inside the *inner*
  // paragraphs (Slate calls `decorate` for each descendant separately).
  // Returning `[]` here avoids producing invalid ranges that target
  // path positions where no text node exists.
  return [];
}

/**
 * Inline markdown decorations: scan text for formatting patterns
 * and return ranges with mark properties.
 */
function computeInlineDecorations(entry: NodeEntry): Range[] {
  const [node, path] = entry;
  const text = Node.string(node);
  if (!text) return [];

  const ranges: Range[] = [];

  // Protect inline code first — content inside backticks must not be
  // processed for bold/italic/strikethrough
  const codeRanges: Array<{ start: number; end: number }> = [];
  const codeRegex = /`([^`]+)`/g;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    codeRanges.push({ start, end });

    // Opening backtick
    ranges.push({
      anchor: { path: [...path, 0], offset: start },
      focus: { path: [...path, 0], offset: start + 1 },
      codeMarker: true,
    } as Range & InkwellText);
    // Code content
    ranges.push({
      anchor: { path: [...path, 0], offset: start + 1 },
      focus: { path: [...path, 0], offset: end - 1 },
      inlineCode: true,
    } as Range & InkwellText);
    // Closing backtick
    ranges.push({
      anchor: { path: [...path, 0], offset: end - 1 },
      focus: { path: [...path, 0], offset: end },
      codeMarker: true,
    } as Range & InkwellText);
  }

  const isInCode = (offset: number) =>
    codeRanges.some(r => offset >= r.start && offset < r.end);

  // Bold: **text**
  // Use placeholder approach: match ** first to avoid conflict with *italic*
  const boldRegex = /\*\*(.+?)\*\*/g;
  while ((match = boldRegex.exec(text)) !== null) {
    if (isInCode(match.index)) continue;
    const start = match.index;
    const end = start + match[0].length;
    // Opening **
    ranges.push({
      anchor: { path: [...path, 0], offset: start },
      focus: { path: [...path, 0], offset: start + 2 },
      boldMarker: true,
    } as Range & InkwellText);
    // Bold content
    ranges.push({
      anchor: { path: [...path, 0], offset: start + 2 },
      focus: { path: [...path, 0], offset: end - 2 },
      bold: true,
    } as Range & InkwellText);
    // Closing **
    ranges.push({
      anchor: { path: [...path, 0], offset: end - 2 },
      focus: { path: [...path, 0], offset: end },
      boldMarker: true,
    } as Range & InkwellText);
  }

  // Italic: _text_ or *text* (but not inside **)
  const italicPatterns = [/_(.+?)_/g, /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g];
  for (const regex of italicPatterns) {
    while ((match = regex.exec(text)) !== null) {
      if (isInCode(match.index)) continue;
      const start = match.index;
      const end = start + match[0].length;
      // Opening marker
      ranges.push({
        anchor: { path: [...path, 0], offset: start },
        focus: { path: [...path, 0], offset: start + 1 },
        italicMarker: true,
      } as Range & InkwellText);
      // Italic content
      ranges.push({
        anchor: { path: [...path, 0], offset: start + 1 },
        focus: { path: [...path, 0], offset: end - 1 },
        italic: true,
      } as Range & InkwellText);
      // Closing marker
      ranges.push({
        anchor: { path: [...path, 0], offset: end - 1 },
        focus: { path: [...path, 0], offset: end },
        italicMarker: true,
      } as Range & InkwellText);
    }
  }

  // Strikethrough: ~~text~~
  const strikeRegex = /~~(.+?)~~/g;
  while ((match = strikeRegex.exec(text)) !== null) {
    if (isInCode(match.index)) continue;
    const start = match.index;
    const end = start + match[0].length;
    ranges.push({
      anchor: { path: [...path, 0], offset: start },
      focus: { path: [...path, 0], offset: start + 2 },
      strikeMarker: true,
    } as Range & InkwellText);
    ranges.push({
      anchor: { path: [...path, 0], offset: start + 2 },
      focus: { path: [...path, 0], offset: end - 2 },
      strikethrough: true,
    } as Range & InkwellText);
    ranges.push({
      anchor: { path: [...path, 0], offset: end - 2 },
      focus: { path: [...path, 0], offset: end },
      strikeMarker: true,
    } as Range & InkwellText);
  }

  // Markdown links: [text](url). The negative lookbehind on `!` excludes
  // image syntax `![alt](url)` — images are handled by the deserializer as
  // their own block element and never reach this code path, but the
  // lookbehind is the cheapest defense against a single-line image edge case.
  const linkRanges: Array<{ start: number; end: number }> = [];
  const linkRegex = /(?<!!)\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  while ((match = linkRegex.exec(text)) !== null) {
    if (isInCode(match.index)) continue;
    const start = match.index;
    const end = start + match[0].length;
    const labelLen = match[1].length;
    const urlLen = match[2].length;
    // Layout: [ label ] ( url )
    //         start  ...  end
    const openBracket = start;
    const labelStart = start + 1;
    const labelEnd = labelStart + labelLen;
    const closeBracket = labelEnd;
    const openParen = closeBracket + 1;
    const urlStart = openParen + 1;
    const urlEnd = urlStart + urlLen;
    const closeParen = urlEnd;

    linkRanges.push({ start, end });

    // [
    ranges.push({
      anchor: { path: [...path, 0], offset: openBracket },
      focus: { path: [...path, 0], offset: openBracket + 1 },
      linkMarker: true,
    } as Range & InkwellText);
    // label
    ranges.push({
      anchor: { path: [...path, 0], offset: labelStart },
      focus: { path: [...path, 0], offset: labelEnd },
      link: true,
    } as Range & InkwellText);
    // ]
    ranges.push({
      anchor: { path: [...path, 0], offset: closeBracket },
      focus: { path: [...path, 0], offset: closeBracket + 1 },
      linkMarker: true,
    } as Range & InkwellText);
    // (
    ranges.push({
      anchor: { path: [...path, 0], offset: openParen },
      focus: { path: [...path, 0], offset: openParen + 1 },
      linkMarker: true,
    } as Range & InkwellText);
    // url
    ranges.push({
      anchor: { path: [...path, 0], offset: urlStart },
      focus: { path: [...path, 0], offset: urlEnd },
      linkUrl: true,
    } as Range & InkwellText);
    // )
    ranges.push({
      anchor: { path: [...path, 0], offset: closeParen },
      focus: { path: [...path, 0], offset: closeParen + 1 },
      linkMarker: true,
    } as Range & InkwellText);
  }

  const isInLink = (offset: number) =>
    linkRanges.some(r => offset >= r.start && offset < r.end);

  // Bare URL autolinks: `https?://...` and `www....`. Stops at whitespace
  // and any of `<>()[]` so it never collides with a markdown link's URL
  // (which lives inside `( )` already covered by the pass above).
  // Trailing punctuation (`.,;:!?`) is trimmed — matches GFM behavior so
  // "see https://example.com." doesn't pull the period into the link.
  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>()[\]]+/g;
  while ((match = urlRegex.exec(text)) !== null) {
    if (isInCode(match.index)) continue;
    if (isInLink(match.index)) continue;
    let matched = match[0];
    const start = match.index;
    let end = start + matched.length;
    while (matched.length > 0 && /[.,;:!?]/.test(matched[matched.length - 1])) {
      matched = matched.slice(0, -1);
      end--;
    }
    if (matched.length === 0) continue;
    ranges.push({
      anchor: { path: [...path, 0], offset: start },
      focus: { path: [...path, 0], offset: end },
      link: true,
    } as Range & InkwellText);
  }

  return ranges;
}

/**
 * Run highlight.js over the entire code-block text in one pass and map
 * the resulting `<span class="hljs-*">` ranges onto Slate decoration
 * ranges. The block carries a single multi-line text leaf, so offsets
 * align directly with `Node.string(block)` — no per-line splitting or
 * span re-opening across line boundaries is needed.
 */
function computeCodeBlockDecorations(
  entry: NodeEntry,
  rehypePlugins?: RehypePluginConfig[],
): Range[] {
  const [node, path] = entry;
  const code = Node.string(node);
  if (!code.trim()) return [];

  const element = node as InkwellElement;
  const lang = element.lang ?? "";

  const md = "```" + lang + "\n" + code + "\n```";
  const html = renderMarkdownToHtml(md, rehypePlugins);
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  const raw = match?.[1]?.replace(/^\n|\n$/g, "") || "";
  if (!raw) return [];

  return parseHljsRanges(raw, path);
}

/**
 * Walk a highlighted HTML string (containing `<span class="hljs-*">`
 * elements over plain text) and emit Slate decoration ranges keyed to
 * the corresponding offsets inside the code-block's text leaf.
 *
 * Supports nested spans via a class stack — when ranges nest, the
 * innermost class wins (matches how the decoration mark is rendered).
 */
function parseHljsRanges(html: string, elementPath: number[]): Range[] {
  const ranges: Range[] = [];
  let textOffset = 0;
  const classStack: string[] = [];
  let i = 0;

  while (i < html.length) {
    if (html[i] === "<") {
      const closeIdx = html.indexOf(">", i);
      if (closeIdx === -1) break;
      const tag = html.slice(i, closeIdx + 1);
      if (tag.startsWith("<span")) {
        const classMatch = tag.match(/class="([^"]+)"/);
        classStack.push(classMatch?.[1] || "");
      } else if (tag === "</span>") {
        classStack.pop();
      }
      i = closeIdx + 1;
    } else if (html[i] === "&") {
      // HTML entity
      const semiIdx = html.indexOf(";", i);
      if (semiIdx !== -1) {
        const entity = html.slice(i, semiIdx + 1);
        let decoded: string;
        if (entity === "&amp;") decoded = "&";
        else if (entity === "&lt;") decoded = "<";
        else if (entity === "&gt;") decoded = ">";
        else if (entity === "&quot;") decoded = '"';
        else if (entity.startsWith("&#x"))
          decoded = String.fromCodePoint(parseInt(entity.slice(3, -1), 16));
        else if (entity.startsWith("&#"))
          decoded = String.fromCodePoint(parseInt(entity.slice(2, -1), 10));
        else decoded = entity;
        if (classStack.length > 0 && classStack[classStack.length - 1]) {
          ranges.push({
            anchor: { path: [...elementPath, 0], offset: textOffset },
            focus: {
              path: [...elementPath, 0],
              offset: textOffset + decoded.length,
            },
            hljs: classStack[classStack.length - 1],
          } as Range & InkwellText);
        }
        textOffset += decoded.length;
        i = semiIdx + 1;
      } else {
        textOffset++;
        i++;
      }
    } else {
      // Plain text character
      const nextTag = html.indexOf("<", i);
      const nextEntity = html.indexOf("&", i);
      let end = html.length;
      if (nextTag !== -1) end = Math.min(end, nextTag);
      if (nextEntity !== -1) end = Math.min(end, nextEntity);
      const chunk = html.slice(i, end);

      if (
        classStack.length > 0 &&
        classStack[classStack.length - 1] &&
        chunk.length > 0
      ) {
        ranges.push({
          anchor: { path: [...elementPath, 0], offset: textOffset },
          focus: {
            path: [...elementPath, 0],
            offset: textOffset + chunk.length,
          },
          hljs: classStack[classStack.length - 1],
        } as Range & InkwellText);
      }
      textOffset += chunk.length;
      i = end;
    }
  }

  return ranges;
}
