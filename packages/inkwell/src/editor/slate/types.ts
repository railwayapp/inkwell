import type { BaseEditor, BaseElement, BaseText } from "slate";
import type { HistoryEditor } from "slate-history";
import type { ReactEditor } from "slate-react";

/**
 * Element types in the Inkwell editor
 */
export type ElementType =
  | "paragraph"
  | "code-fence"
  | "code-line"
  | "blockquote"
  | "list-item"
  | "heading"
  | "image";

/**
 * A block-level element in the editor
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
  children: InkwellText[];
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
  hljs?: string;
}

/**
 * The composed Inkwell editor type
 */
export type InkwellEditor = BaseEditor & ReactEditor & HistoryEditor;

// Module augmentation so Slate's generic types use our custom types
declare module "slate" {
  interface CustomTypes {
    Editor: InkwellEditor;
    Element: InkwellElement;
    Text: InkwellText;
  }
}
