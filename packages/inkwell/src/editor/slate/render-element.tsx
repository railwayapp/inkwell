import type { ReactNode } from "react";
import { type RenderElementProps, useSelected } from "slate-react";
import { Blockquote } from "../../components/blockquote";
import { Heading, type HeadingLevel } from "../../components/heading";
import { List } from "../../components/list";
import { ListItem } from "../../components/list-item";
import { editorClass } from "../../lib/class-names";
import { sanitizeImageUrl } from "../../lib/safe-url";
import type { InkwellElement } from "./types";

function clampHeadingLevel(level: number | undefined): HeadingLevel {
  if (level == null) return 1;
  if (level < 1) return 1;
  if (level > 6) return 6;
  return level as HeadingLevel;
}

/**
 * Render a block-level Slate element. Block types that mirror the
 * renderer surface (heading, blockquote, code-block) use the shared
 * `components/` so the editor and renderer emit identical DOM and
 * stay WYSIWYG-aligned. The `image` block owns its editor-specific
 * void wrapper.
 */
export function RenderElement({
  attributes,
  children,
  element,
}: RenderElementProps) {
  const el = element as InkwellElement;

  switch (el.type) {
    case "heading":
      return (
        <Heading
          {...attributes}
          surface="editor"
          level={clampHeadingLevel(el.level)}
        >
          {children}
        </Heading>
      );
    case "code-block":
      return (
        <CodeBlockElement attributes={attributes} element={el}>
          {children}
        </CodeBlockElement>
      );
    case "blockquote":
      return (
        <Blockquote {...attributes} surface="editor">
          {children}
        </Blockquote>
      );
    case "list":
      // Slate forwards `attributes` (ref + data-slate-node), not arbitrary
      // HTML props. The shared List component routes those through.
      return el.ordered ? (
        <List
          {...(attributes as unknown as Record<string, unknown>)}
          surface="editor"
          ordered
          start={
            typeof el.start === "number" && el.start !== 1
              ? el.start
              : undefined
          }
        >
          {children}
        </List>
      ) : (
        <List
          {...(attributes as unknown as Record<string, unknown>)}
          surface="editor"
        >
          {children}
        </List>
      );
    case "list-item":
      return (
        <ListItem
          {...(attributes as unknown as Record<string, unknown>)}
          surface="editor"
        >
          {children}
        </ListItem>
      );
    case "image":
      return (
        <InlineImageElement attributes={attributes} element={el}>
          {children}
        </InlineImageElement>
      );
    default:
      return <p {...attributes}>{children}</p>;
  }
}

function CodeBlockElement({
  attributes,
  element,
  children,
}: {
  attributes: RenderElementProps["attributes"];
  element: InkwellElement;
  children: ReactNode;
}) {
  // The editor's code-block is a single text leaf with literal `\n`
  // characters between lines. Browser `<pre>` with `white-space: pre-wrap`
  // (set in styles.css) renders those breaks visually. The optional
  // `lang` attribute is surfaced as `data-lang` for consumer styling.
  return (
    <pre
      {...attributes}
      className={editorClass("code-block")}
      data-lang={element.lang || undefined}
    >
      <code>{children}</code>
    </pre>
  );
}

function InlineImageElement({
  attributes,
  element,
  children,
}: {
  attributes: RenderElementProps["attributes"];
  element: InkwellElement;
  children: ReactNode;
}) {
  const selected = useSelected();
  const src = sanitizeImageUrl(element.url);
  // Top-level void block. Block-level (not inline) so Slate's Up/Down
  // arrow-key navigation has a stop here — an inline-void wrapped in
  // an otherwise-empty paragraph would have no text leaf for the
  // cursor to land on and Slate would skip past it.
  return (
    <div
      {...attributes}
      className={editorClass("image")}
      data-selected={selected || undefined}
    >
      <img
        src={src}
        alt={element.alt ?? ""}
        contentEditable={false}
        draggable={false}
      />
      {children}
    </div>
  );
}
