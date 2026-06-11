import type { BaseEditor, BaseElement, BaseText } from "slate";
import type { HistoryEditor } from "slate-history";
import type { ReactEditor } from "slate-react";

/**
 * Element types in the Inkwell editor
 */
export type ElementType =
  | "paragraph"
  | "code-block"
  | "blockquote"
  | "list"
  | "list-item"
  | "heading"
  | "image";

/**
 * A block-level element in the editor.
 *
 * Most element types carry text leaves directly; `blockquote` is the
 * exception — it holds nested blocks (paragraphs, other blockquotes) so
 * the editor's structure matches the mdast tree. The `> ` source marker
 * is structural and is not stored on any inner text leaf.
 *
 * The single-interface shape keeps consumer ergonomics simple — every
 * Slate node entry has `.type`, `.id`, `.children`, and the optional
 * level/url/alt metadata — while loosening `children` to `InkwellChild[]`
 * so a blockquote can hold inner blocks alongside text-bearing nodes.
 * The descendant union for `InkwellElement.children`. Text leaves cover
 * leaf-bearing elements (paragraph, heading, code-block, etc.);
 * nested elements support blockquote / list / list-item children.
 */
export interface InkwellElement extends BaseElement {
  type: ElementType;
  /**
   * Unique element identifier. Session-scoped, not persisted in markdown.
   */
  id: string;
  /**
   * Heading level (1-6). Only present on `heading` elements.
   */
  level?: number;
  /**
   * Image URL. Only present on `image` elements.
   */
  url?: string;
  /**
   * Image alt text. Only present on `image` elements.
   */
  alt?: string;
  /**
   * Code-block language tag (e.g. `"ts"`, `"py"`). Only present on
   * `code-block` elements; serialized into the opening fence at
   * round-trip time.
   */
  lang?: string;
  /**
   * Whether the list is ordered (numbered). Only present on `list`
   * elements; unordered lists omit this property.
   */
  ordered?: boolean;
  /**
   * Starting number for an ordered list. Defaults to `1`. Only meaningful
   * on `list` elements with `ordered: true`.
   */
  start?: number;
  children: InkwellChild[];
}

export type InkwellChild = InkwellText | InkwellElement;

/** Type guard: is this descendant a text leaf? */
export function isInkwellText(node: InkwellChild): node is InkwellText {
  return "text" in node;
}

/**
 * A text leaf node
 */
export interface InkwellText extends BaseText {
  text: string;

  // Decoration marks
  bold?: true;
  italic?: true;
  strikethrough?: true;
  inlineCode?: true;
  boldMarker?: true;
  italicMarker?: true;
  strikeMarker?: true;
  codeMarker?: true;
  /** Visible link text — styled as an anchor. */
  link?: true;
  /** URL inside `(...)` or a bare URL autolink target — dimmed. */
  linkUrl?: true;
  /** `[`, `]`, `(`, `)` brackets in `[text](url)` — dimmed. */
  linkMarker?: true;
  hljs?: string;
}

/**
 * The composed Inkwell editor type
 */
export type InkwellEditor = BaseEditor &
  ReactEditor &
  HistoryEditor & {
    /**
     * Per-editor source cache (internal — wired at editor creation by
     * `<InkwellEditor />`). Lets the copy/cut serialization in
     * `withMarkdown` thread the same cache as getState/onChange/onSubmit;
     * without it the clipboard would carry normalized markdown for
     * blocks the user never touched, diverging from every other
     * serialize path.
     */
    sourceCache?: import("./source-cache").SourceCache;
  };

// Module augmentation so Slate's generic types use our custom types
declare module "slate" {
  interface CustomTypes {
    Editor: InkwellEditor;
    Element: InkwellElement;
    Text: InkwellText;
  }
}
