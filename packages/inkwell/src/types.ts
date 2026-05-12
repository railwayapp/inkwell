import type {
  ComponentType,
  CSSProperties,
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import type { Plugin } from "unified";
import type { Awareness } from "y-protocols/awareness";
import type { XmlText as YXmlText } from "yjs";
import type { InkwellEditor } from "./editor/slate/types";

// biome-ignore lint/suspicious/noExplicitAny: unified Plugin type
type RehypePlugin = Plugin<any[], any>;

export type RehypePluginConfig =
  | RehypePlugin
  | [RehypePlugin, Record<string, unknown>];

/**
 * Props for the InkwellEditor component.
 */
export interface InkwellEditorState {
  /** Current serialized markdown content. */
  markdown: string;
  /** Current Slate plain text content. */
  text: string;
  /** True when the editor has no non-whitespace text content. */
  isEmpty: boolean;
  /** True when the Slate editable is focused. */
  isFocused: boolean;
  /** True when user edits are enabled. */
  isEditable: boolean;
  /** Current plain text character count. */
  characterCount: number;
  /** Configured character limit, if any. */
  characterLimit?: number;
  /** True when characterCount exceeds characterLimit. */
  overLimit: boolean;
}

export interface InkwellEditorFocusOptions {
  /** Where to place the caret after focusing. Defaults to preserving selection. */
  at?: "start" | "end";
}

export interface InkwellSetMarkdownOptions {
  /** Whether to call `onChange` after replacing content. Defaults to true. */
  emitChange?: boolean;
  /** Where to place the caret after replacing content. Defaults to "start". */
  select?: "start" | "end" | "preserve";
}

export interface InkwellPluginPlaceholder {
  /** Placeholder text shown by Slate while the editor is empty. */
  text: string;
  /** Optional hint prepended to the placeholder text. */
  hint?: string;
}

export interface InkwellEditorHandle {
  /** Return the current serialized markdown content. */
  getMarkdown: () => string;
  /** Return the current Slate plain text content. */
  getText: () => string;
  /** Return a snapshot of current editor state. */
  getState: () => InkwellEditorState;
  /** Focus the editor and optionally move the caret. */
  focus: (options?: InkwellEditorFocusOptions) => void;
  /** Replace the document with an empty markdown document. */
  clear: (options?: InkwellSetMarkdownOptions) => void;
  /** Replace the current document from markdown. */
  setMarkdown: (markdown: string, options?: InkwellSetMarkdownOptions) => void;
  /** Insert markdown at the current selection. */
  insertMarkdown: (markdown: string) => void;
}

export type InkwellEditorController = InkwellEditorHandle;

export interface InkwellEditorProps {
  /**
   * Markdown content string
   */
  content: string;
  /**
   * Called with serialized markdown on every document change
   */
  onChange?: (content: string) => void;
  /**
   * Called with a full editor state snapshot whenever content, focus, or editability changes.
   */
  onStateChange?: (state: InkwellEditorState) => void;
  /**
   * Additional CSS class for the wrapper element
   */
  className?: string;
  /**
   * Inline styles applied to the editable surface.
   */
  style?: CSSProperties;
  /**
   * Placeholder text shown when editor is empty
   */
  placeholder?: string;
  /**
   * Whether users can edit the document. Defaults to true.
   */
  editable?: boolean;
  /**
   * Editor plugins (bubble toolbar, snippets, custom)
   */
  plugins?: InkwellPlugin[];
  /**
   * Custom rehype plugins for the syntax highlighting pipeline
   */
  rehypePlugins?: RehypePluginConfig[];
  /**
   * Configure which block-level decorations the editor recognizes. All enabled by default.
   */
  decorations?: InkwellDecorations;
  /**
   * Enable real-time collaborative editing via Yjs
   */
  collaboration?: CollaborationConfig;
  /**
   * Include the built-in bubble menu plugin (default: true). Pass `false` to
   * disable the built-in toolbar; consumers can still add their own via `plugins`.
   */
  bubbleMenu?: boolean;
  /**
   * Maximum number of characters the editor should track. When set, the
   * wrapper receives `.inkwell-editor-over-limit` whenever the document
   * length exceeds the limit.
   */
  characterLimit?: number;
  /**
   * When true and a `characterLimit` is set, the editor blocks text input
   * past the limit (default: false — the library only reports counts).
   */
  enforceCharacterLimit?: boolean;
  /**
   * Called on every document change with the current character count and
   * the configured limit (if any).
   */
  onCharacterCount?: (count: number, limit?: number) => void;
  /**
   * Show the built-in toast at the top-right of the editor when
   * `characterCount > characterLimit`. When `enforceCharacterLimit` is true,
   * the toast also shows at exactly the limit because further typing is
   * blocked. Has no effect unless `characterLimit` is set. Default: `true`.
   *
   * Set to `false` to render your own indicator instead (e.g. via
   * `onCharacterCount`). The toast is styled by `.inkwell-editor-limit-toast`.
   */
  limitToast?: boolean;
  /**
   * When true, Enter submits the editor instead of inserting a newline.
   * Shift+Enter still inserts a newline. Default: false.
   */
  submitOnEnter?: boolean;
  /**
   * Called when submitOnEnter handles Enter.
   */
  onSubmit?: (markdown: string) => void;
}

export type UseInkwellOptions = InkwellEditorProps;

export interface UseInkwellResult {
  /** Current editor state snapshot. */
  state: InkwellEditorState;
  /** Grouped editor controller for focus, content replacement, insertion, and inspection. */
  editor: InkwellEditorController;
  /** Stable component that renders the configured editor. Render once per hook call. */
  EditorInstance: ComponentType;
}

/**
 * Props for the InkwellRenderer component.
 */
export interface InkwellRendererProps {
  /**
   * Markdown content string
   */
  content: string;
  /**
   * Additional CSS class for the wrapper element
   */
  className?: string;
  /**
   * Custom component overrides for rendered markdown elements
   */
  components?: InkwellComponents;
  /**
   * Custom rehype plugins for the markdown pipeline
   */
  rehypePlugins?: RehypePluginConfig[];
  /**
   * Show a copy button on fenced code blocks (default: true)
   */
  copyButton?: boolean;
  /**
   * Mention patterns to expand in rendered text. Each entry splits text nodes
   * on the pattern and replaces each match with the result of `resolve`.
   */
  mentions?: MentionRenderer[];
}

/**
 * Text-level mention replacement used by InkwellRenderer.
 */
export interface MentionRenderer {
  /** Regular expression applied to text-node content. */
  pattern: RegExp;
  /** Map a match to a React node (rendered in place of the match text). */
  resolve: (match: RegExpExecArray) => ReactNode;
}

/**
 * Map of HTML element names to custom React components
 */
export type InkwellComponents = Partial<{
  [K in keyof JSX.IntrinsicElements]: (
    props: JSX.IntrinsicElements[K] & { children?: ReactNode },
  ) => ReactNode;
}>;

/**
 * Keyboard trigger for a plugin.
 *
 * Uses tinykeys-style key strings:
 * - `"Control+/"` — modifier combo, prevents default
 * - `"@"` — single character, typed into editor (e.g. for mentions)
 */
export interface PluginTrigger {
  /**
   * Key combo (tinykeys format)
   */
  key: string;
}

/**
 * Editor-scoped key-forwarding hook. Plugins subscribe to receive
 * keystrokes that the editor forwarded while the plugin was active (used
 * by picker UIs that don't own DOM focus while the Slate editable does).
 *
 * Returns an unsubscribe function. Listeners are scoped to the current
 * editor instance — multiple editors on the same page do not cross-talk.
 */
export type SubscribeForwardedKey = (
  listener: (key: string) => void,
) => () => void;

/**
 * Props passed to every plugin's render function on every render
 */
export interface PluginRenderProps {
  /**
   * Whether this plugin is active. Always-on plugins receive `true` every render.
   */
  active: boolean;
  /**
   * Text typed after the trigger fired
   */
  query: string;
  /**
   * Insert text into the editor at the current cursor position
   */
  onSelect: (text: string) => void;
  /**
   * Deactivate this plugin (resets `active` to false)
   */
  onDismiss: () => void;
  /**
   * Cursor position when the trigger fired
   */
  position: { top: number; left: number };
  /**
   * Ref to the editor's contenteditable element
   */
  editorRef: RefObject<HTMLDivElement | null>;
  /**
   * Wrap the current selection with markdown markers
   */
  wrapSelection: (before: string, after: string) => void;
  /**
   * Subscribe to editor-forwarded keystrokes for this plugin. Returns an
   * unsubscribe function. Forwarded keys include navigation keys
   * (ArrowUp/Down, Enter, Backspace) and typed query characters that the
   * editor delivered while this plugin was active.
   */
  subscribeForwardedKey: SubscribeForwardedKey;
}

/**
 * Context passed to a plugin's `onKeyDown` handler.
 */
export interface PluginKeyDownContext {
  /**
   * Wrap the current selection with markdown markers
   */
  wrapSelection: (before: string, after: string) => void;
  /**
   * Claim editor focus for this plugin. Use when a plugin needs to behave
   * as the "active" plugin without relying on a single-character trigger
   * (e.g. slash commands). Forwarded editor keystrokes, escape handling,
   * and trigger-suppression all key off the active plugin.
   *
   * Pass the plugin's own name and an empty initial query to activate.
   * Pass `null` to deactivate.
   */
  setActivePlugin: (plugin: { name: string; query?: string } | null) => void;
}

/**
 * An Inkwell editor plugin.
 *
 * Always-on plugins are rendered every frame with `active: true`. Plugins with
 * a `trigger`, or plugins that set `activatable: true`, render with
 * `active: true` only while they are the editor's active plugin.
 */
export interface InkwellPlugin {
  /**
   * Unique plugin name
   */
  name: string;
  /**
   * Optional keyboard trigger
   */
  trigger?: PluginTrigger;
  /**
   * When true, the plugin is only rendered (`props.active === true`) while
   * it is the editor's active plugin. Plugins with a `trigger` are
   * activatable by default; non-trigger plugins that claim activation via
   * `ctx.setActivePlugin` (e.g. slash commands) must opt in explicitly.
   *
   * Always-on plugins (bubble menu, attachments, completions) leave this
   * undefined so they continue to render every frame.
   */
  activatable?: boolean;
  /**
   * Render the plugin UI. Return `null` when inactive.
   */
  render: (props: PluginRenderProps) => ReactNode;
  /**
   * Optional dynamic placeholder. The first plugin that returns a value
   * overrides the editor placeholder.
   */
  getPlaceholder?: (
    editor: InkwellEditor,
  ) => string | InkwellPluginPlaceholder | null;
  /**
   * Optional guard for character triggers. Return false to let the key type
   * normally without activating the plugin.
   */
  shouldTrigger?: (event: ReactKeyboardEvent, editor: InkwellEditor) => boolean;
  /**
   * Optional document-change hook. Runs after Slate document changes are
   * serialized and editor state is updated.
   */
  onEditorChange?: (editor: InkwellEditor) => void;
  /**
   * Optional keydown handler. Runs for events on the editor before trigger
   * matching, and is skipped while another plugin is active. Call
   * `event.preventDefault()` to stop further dispatch for this event.
   */
  onKeyDown?: (
    event: ReactKeyboardEvent,
    ctx: PluginKeyDownContext,
    editor: InkwellEditor,
  ) => void;
  /**
   * Optional keydown handler while this plugin is active. Return `false` to
   * dismiss the plugin and let the key continue into the editor normally.
   */
  onActiveKeyDown?: (
    event: ReactKeyboardEvent,
    ctx: PluginKeyDownContext & { dismiss: () => void },
    editor: InkwellEditor,
  ) => false | void;
  /**
   * Optional one-time editor setup. Runs once after the editor is created
   * so plugins can override editor methods (e.g. `insertData`) or register
   * DOM listeners. The returned function, if any, runs when the editor
   * unmounts or the plugin list changes.
   */
  setup?: (editor: InkwellEditor) => void | (() => void);
}

/**
 * Props passed to each bubble menu item component.
 */
export interface BubbleMenuItemProps {
  /**
   * Wrap or unwrap the current selection with markdown markers. Toggles if already wrapped.
   */
  wrapSelection: (before: string, after: string) => void;
}

/**
 * An item in the bubble menu.
 */
export interface BubbleMenuItem {
  /**
   * Unique key for React reconciliation
   */
  key: string;
  /**
   * Optional keyboard shortcut (single key, used with Cmd/Ctrl).
   */
  shortcut?: string;
  /**
   * Action to run when the shortcut fires. Receives wrapSelection.
   */
  onShortcut?: (wrapSelection: (before: string, after: string) => void) => void;
  /**
   * React component to render in the menu. Receives `wrapSelection`.
   */
  render: (props: BubbleMenuItemProps) => ReactNode;
}

/**
 * Snippet item for the snippets plugin
 */
export interface Snippet {
  /**
   * Display title (searchable)
   */
  title: string;
  /**
   * Markdown content to insert
   */
  content: string;
}

/**
 * Controls which markdown block elements the editor recognizes.
 * All decorations are enabled by default. Pass `false` to disable.
 */
export interface InkwellDecorations {
  /**
   * Recognize `# ` as h1 (default: true)
   */
  heading1?: boolean;
  /**
   * Recognize `## ` as h2 (default: true)
   */
  heading2?: boolean;
  /**
   * Recognize `### ` as h3 (default: true)
   */
  heading3?: boolean;
  /**
   * Recognize `#### ` as h4 (default: true)
   */
  heading4?: boolean;
  /**
   * Recognize `##### ` as h5 (default: true)
   */
  heading5?: boolean;
  /**
   * Recognize `###### ` as h6 (default: true)
   */
  heading6?: boolean;
  /**
   * Recognize unordered, ordered, and indented list items (default: true)
   */
  lists?: boolean;
  /**
   * Recognize `> ` as blockquotes (default: true)
   */
  blockquotes?: boolean;
  /**
   * Recognize ``` fences as code blocks (default: true)
   */
  codeBlocks?: boolean;
  /**
   * Recognize `![alt](url)` on its own line as a block image (default: true)
   */
  images?: boolean;
}

/**
 * Configuration for real-time collaborative editing via Yjs.
 *
 * The consumer owns the Yjs document and provider (WebSocket,
 * WebRTC, Hocuspocus, etc.). Inkwell only needs the shared type
 * and awareness instance.
 */
export interface CollaborationConfig {
  /**
   * Yjs shared type for the document. Create via `doc.get("content", Y.XmlText)`.
   */
  sharedType: YXmlText;
  /**
   * Awareness instance for remote cursor/presence sharing.
   */
  awareness: Awareness;
  /**
   * Local user metadata, displayed on remote cursors.
   */
  user: { name: string; color: string };
}
