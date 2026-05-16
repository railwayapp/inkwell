import type {
  CSSProperties,
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import type { Plugin } from "unified";

// biome-ignore lint/suspicious/noExplicitAny: unified Plugin type
type RehypePlugin = Plugin<any[], any>;

export type RehypePluginConfig = RehypePlugin | [RehypePlugin, ...unknown[]];

export interface InkwellEditorState {
  /** Current source content. Markdown syntax is part of the content. */
  content: string;
  /** True when the editor has no non-whitespace content. */
  isEmpty: boolean;
  /** True when the Slate editable is focused. */
  isFocused: boolean;
  /** True when user edits are enabled. */
  isEditable: boolean;
  /** Current source content character count. */
  characterCount: number;
  /** Configured character limit, if any. */
  characterLimit?: number;
  /** True when `characterCount` exceeds `characterLimit`. */
  overLimit: boolean;
}

export interface InkwellEditorFocusOptions {
  /** Where to place the caret after focusing. Defaults to preserving selection. */
  at?: "start" | "end";
}

export interface InkwellPluginPlaceholder {
  /** Placeholder text shown by Slate while the editor is empty. */
  text: string;
  /** Optional hint prepended to the placeholder text. */
  hint?: string;
}

type InkwellContentSelectionOptions = {
  select?: "start" | "end" | "preserve";
};

export interface InkwellEditorHandle {
  /** Return a snapshot of current editor state. */
  getState: () => InkwellEditorState;
  /** Focus the editor and optionally move the caret. */
  focus: (options?: InkwellEditorFocusOptions) => void;
  /** Replace the document with empty content without calling onChange. */
  clear: (options?: InkwellContentSelectionOptions) => void;
  /** Replace the current document content without calling onChange. */
  setContent: (
    content: string,
    options?: InkwellContentSelectionOptions,
  ) => void;
  /** Insert content at the current selection. */
  insertContent: (content: string) => void;
}

export interface InkwellEditorClassNames {
  /** Class added to the root wrapper. */
  root?: string;
  /** Class added to the editable surface. */
  editor?: string;
}

export interface InkwellEditorStyles {
  /** Inline styles applied to the root wrapper. */
  root?: CSSProperties;
  /** Inline styles applied to the editable surface. */
  editor?: CSSProperties;
}

export interface InkwellHeadingFeatures {
  h1?: boolean;
  h2?: boolean;
  h3?: boolean;
  h4?: boolean;
  h5?: boolean;
  h6?: boolean;
}

/** Controls which Markdown features the editor recognizes. */
export interface InkwellFeatures {
  /** Recognize heading markers. Pass per-level overrides for granular control. */
  headings?: boolean | InkwellHeadingFeatures;
  /** Recognize `> ` as blockquotes. */
  blockquotes?: boolean;
  /** Recognize fenced code blocks. */
  codeBlocks?: boolean;
  /** Recognize standalone image syntax as block images. */
  images?: boolean;
}

export interface ResolvedInkwellFeatures {
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  heading4: boolean;
  heading5: boolean;
  heading6: boolean;
  blockquotes: boolean;
  codeBlocks: boolean;
  images: boolean;
}

export interface InkwellEditorProps {
  /** Source content string. Markdown syntax is part of the content. */
  content?: string;
  /** Called with source content on every document change. */
  onChange?: (content: string) => void;
  /** Called with a full editor state snapshot whenever content, focus, or editability changes. */
  onStateChange?: (state: InkwellEditorState) => void;
  /** Additional CSS class for the root wrapper. Alias for `classNames.root`. */
  className?: string;
  /** Additional CSS classes for editor slots. */
  classNames?: InkwellEditorClassNames;
  /** Inline styles for editor slots. */
  styles?: InkwellEditorStyles;
  /** Placeholder text shown when editor is empty. */
  placeholder?: string;
  /** Whether users can edit the document. Defaults to true. */
  editable?: boolean;
  /** Editor plugins. */
  plugins?: InkwellPlugin[];
  /** Custom rehype plugins for the syntax highlighting pipeline. */
  rehypePlugins?: RehypePluginConfig[];
  /** Configure which Markdown features the editor recognizes. */
  features?: InkwellFeatures;
  /** Include the built-in bubble menu plugin. Defaults to true. */
  bubbleMenu?: boolean;
  /** Soft character budget. Typing, paste, and inserts past the limit are allowed. */
  characterLimit?: number;
  /** Called on every document change with the current character count and configured limit. */
  onCharacterCount?: (count: number, limit?: number) => void;
  /** When true, Enter submits the editor instead of inserting a newline. */
  submitOnEnter?: boolean;
  /** Called when submitOnEnter handles Enter. */
  onSubmit?: (content: string) => void;
}

/**
 * How `InkwellRenderer` handles single-newline soft breaks in source markdown.
 * - `"paragraph"` (default): split the enclosing paragraph at the soft break,
 *   producing two `<p>` elements with normal paragraph margins.
 * - `"br"`: emit a `<br />`. Matches GFM-style behavior (and Showdown with
 *   `simpleLineBreaks: true`).
 * - `"preserve"`: keep as a literal `\n` text node. The browser collapses it
 *   to whitespace per CSS. Matches strict CommonMark.
 */
export type InkwellSoftBreakBehavior = "preserve" | "br" | "paragraph";

export interface InkwellRendererProps {
  /** Markdown source content string. */
  content: string;
  /** Additional CSS class for the wrapper element. */
  className?: string;
  /** Custom component overrides for rendered markdown elements. */
  components?: InkwellComponents;
  /** Custom rehype plugins for the markdown pipeline. */
  rehypePlugins?: RehypePluginConfig[];
  /** Mention patterns to expand in rendered text. */
  mentions?: MentionRenderer[];
  /** How to render single-newline soft breaks. Defaults to `"paragraph"`. */
  softBreak?: InkwellSoftBreakBehavior;
}

export interface ParseMarkdownOptions {
  components?: InkwellComponents;
  rehypePlugins?: RehypePluginConfig[];
  mentions?: MentionRenderer[];
  /** How to render single-newline soft breaks. Defaults to `"paragraph"`. */
  softBreak?: InkwellSoftBreakBehavior;
}

export interface MentionRenderer {
  /** Regular expression applied to text-node content. */
  pattern: RegExp;
  /** Map a match to a React node (rendered in place of the match text). */
  resolve: (match: RegExpExecArray) => ReactNode;
}

export type InkwellComponents = Partial<{
  [K in keyof JSX.IntrinsicElements]: (
    props: JSX.IntrinsicElements[K] & { children?: ReactNode },
  ) => ReactNode;
}>;

export type InkwellPluginActivation =
  | { type: "always" }
  | { type: "trigger"; key: string }
  | { type: "manual" };

export type SubscribeForwardedKey = (
  listener: (key: string) => void,
) => () => void;

export interface InkwellPluginEditor {
  getState: () => InkwellEditorState;
  isEmpty: () => boolean;
  focus: (options?: InkwellEditorFocusOptions) => void;
  clear: (options?: InkwellContentSelectionOptions) => void;
  setContent: (
    content: string,
    options?: InkwellContentSelectionOptions,
  ) => void;
  insertContent: (content: string) => void;
  getContentBeforeCursor: () => string | null;
  getCurrentBlockContent: () => string | null;
  getCurrentBlockContentBeforeCursor: () => string | null;
  replaceCurrentBlockContent: (content: string) => void;
  clearCurrentBlock: () => void;
  wrapSelection: (before: string, after: string) => void;
  insertImage: (image: { id?: string; url: string; alt: string }) => string;
  updateImage: (id: string, image: { url?: string; alt?: string }) => void;
  removeImage: (id: string) => void;
}

export interface PluginRenderProps {
  /** Whether this plugin is active. Always-on plugins receive true every render. */
  active: boolean;
  /** Content typed after the trigger fired. */
  query: string;
  /** Insert content into the editor at the current cursor position. */
  onSelect: (content: string) => void;
  /** Deactivate this plugin. */
  onDismiss: () => void;
  /** Cursor position when the trigger fired. Wrapper-relative; sits just
   *  below the caret so a popup with `top: position.top` renders below it. */
  position: { top: number; left: number };
  /** Wrapper-relative caret bounding rect when the trigger fired. Lets pickers
   *  flip above the caret when there isn't room below. Optional for backwards
   *  compatibility with consumers that pass synthesized props. */
  cursorRect?: { top: number; bottom: number; left: number };
  /** Ref to the editable DOM element. */
  editorRef: RefObject<HTMLDivElement | null>;
  /** Narrow editor controller for plugin actions. */
  editor: InkwellPluginEditor;
  /** Wrap the current selection with markdown markers. */
  wrapSelection: (before: string, after: string) => void;
  /** Subscribe to editor-forwarded keystrokes while this plugin is active. */
  subscribeForwardedKey: SubscribeForwardedKey;
}

export interface PluginInsertDataContext {
  /** Narrow editor controller for plugin actions. */
  editor: InkwellPluginEditor;
  /** Continue with the editor's default paste/drop handling. */
  insertData: (data: DataTransfer) => void;
}

export interface PluginKeyDownContext {
  /** Narrow editor controller for plugin actions. */
  editor: InkwellPluginEditor;
  /** Wrap the current selection with markdown markers. */
  wrapSelection: (before: string, after: string) => void;
  /** Activate the current plugin. */
  activate: (options?: { query?: string }) => void;
  /** Dismiss the active plugin. */
  dismiss: () => void;
}

export interface InkwellPlugin {
  /** Unique plugin name. */
  name: string;
  /** Activation behavior. Defaults to `{ type: "always" }`. */
  activation?: InkwellPluginActivation;
  /** Render the plugin UI. Omit for headless plugins. */
  render?: (props: PluginRenderProps) => ReactNode;
  /** Optional dynamic placeholder. */
  getPlaceholder?: (
    editor: InkwellPluginEditor,
  ) => string | InkwellPluginPlaceholder | null;
  /** Optional guard for trigger activation. */
  shouldTrigger?: (
    event: ReactKeyboardEvent,
    ctx: PluginKeyDownContext,
  ) => boolean;
  /** Optional document-change hook. */
  onEditorChange?: (editor: InkwellPluginEditor) => void;
  /** Optional keydown handler. */
  onKeyDown?: (event: ReactKeyboardEvent, ctx: PluginKeyDownContext) => void;
  /** Optional keydown handler while this plugin is active. */
  onActiveKeyDown?: (
    event: ReactKeyboardEvent,
    ctx: PluginKeyDownContext,
  ) => false | void;
  /** Optional paste/drop hook. Return true when the data was handled. */
  onInsertData?: (
    data: DataTransfer,
    ctx: PluginInsertDataContext,
  ) => boolean | void;
  /** Optional one-time setup. */
  setup?: (editor: InkwellPluginEditor) => void | (() => void);
}

export interface BubbleMenuItemProps {
  /** Wrap or unwrap the current selection with markdown markers. */
  wrapSelection: (before: string, after: string) => void;
}

export interface BubbleMenuItem {
  key: string;
  shortcut?: string;
  onShortcut?: (wrapSelection: (before: string, after: string) => void) => void;
  render: (props: BubbleMenuItemProps) => ReactNode;
}

export interface Snippet {
  title: string;
  content: string;
}
