import {
  createAttachmentsPlugin,
  createCompletionsPlugin,
  createEmojiPlugin,
  createMentionsPlugin,
  createSlashCommandsPlugin,
  createSnippetsPlugin,
  InkwellEditor,
  type InkwellPlugin,
  InkwellRenderer,
  type MentionItem,
  type MentionRenderer,
} from "@railway/inkwell";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const DEFAULT_CHARACTER_LIMIT = 2000;
const CHARACTER_LIMIT_MIN = 50;
const CHARACTER_LIMIT_MAX = 20000;

const DEMO_USERS: MentionItem[] = [
  { id: "alice", title: "Alice Anderson" },
  { id: "bob", title: "Bob Brown" },
  { id: "carol", title: "Carol Chen" },
  { id: "dave", title: "Dave Davies" },
  { id: "eve", title: "Eve Edwards" },
];

const MENTION_RENDERERS: MentionRenderer[] = [
  {
    pattern: /@user\[([a-z]+)\]/g,
    resolve: match => {
      const id = match[1];
      const user = DEMO_USERS.find(u => u.id === id);
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 0.45rem",
            background: "hsla(270, 60%, 52%, 0.18)",
            color: "hsl(270, 70%, 92%)",
            border: "1px solid hsla(270, 60%, 52%, 0.4)",
            borderRadius: "9999px",
            fontWeight: 500,
            fontSize: "0.92em",
            lineHeight: 1.6,
          }}
        >
          @{user?.title ?? id}
        </span>
      );
    },
  },
];

const DEMO_COMPLETION = `Welcome to Inkwell — a Markdown editor that keeps your content portable.

Try accepting this completion, then edit the Markdown directly:

- Formatting stays readable
- The stored value is the Markdown source
- Plugins can add focused writing workflows`;

const DEMO_SNIPPETS = [
  {
    title: "Bug Report",
    content:
      "## Bug Report\n\n**Description:**\n\n**Steps to reproduce:**\n1. \n2. \n3. \n\n**Expected behavior:**\n\n**Actual behavior:**\n",
  },
  {
    title: "Feature Request",
    content:
      "## Feature Request\n\n**Problem:**\n\n**Proposed solution:**\n\n**Alternatives considered:**\n",
  },
  {
    title: "Meeting Notes",
    content:
      "## Meeting Notes\n\n**Date:** \n**Attendees:** \n\n### Agenda\n\n1. \n\n### Action Items\n\n- [ ] \n",
  },
];

interface PluginDef {
  id: string;
  label: string;
  summary: string;
  usage: ReactNode;
  /** Omitted for built-in plugins that are toggled via a dedicated editor prop. */
  create?: (ctx: {
    getCompletion: () => string | null;
    dismissCompletion: () => void;
    restoreCompletion: (completion: string) => void;
  }) => InkwellPlugin;
}

const BUBBLE_MENU_ID = "bubble-menu";

const AVAILABLE_PLUGINS: PluginDef[] = [
  {
    id: BUBBLE_MENU_ID,
    label: "Bubble Menu",
    summary:
      "Floating formatting toolbar that appears when you select text in the editor.",
    usage: (
      <>
        Select text to reveal the toolbar, then click a button to wrap the
        selection. Shortcuts: <Kbd>⌘B</Kbd> bold, <Kbd>⌘I</Kbd> italic,{" "}
        <Kbd>⌘D</Kbd> strikethrough.
      </>
    ),
  },
  {
    id: "snippets",
    label: "Snippets",
    summary:
      "Searchable palette of reusable Markdown blocks — bug reports, meeting notes, and more.",
    usage: (
      <>
        Press <Kbd>[</Kbd> while editing to open the picker. Type to filter,{" "}
        <Kbd>↑</Kbd>/<Kbd>↓</Kbd> to navigate, <Kbd>Enter</Kbd> to insert,{" "}
        <Kbd>Esc</Kbd> to close.
      </>
    ),
    create: () => createSnippetsPlugin({ snippets: DEMO_SNIPPETS }),
  },
  {
    id: "emoji",
    label: "Emoji",
    summary: "Searchable emoji picker triggered by colon shortcodes.",
    usage: (
      <>
        Press <Kbd>:</Kbd> and type a shortcode like <code>rocket</code>, then
        use <Kbd>↑</Kbd>/<Kbd>↓</Kbd> and <Kbd>Enter</Kbd> to insert.
      </>
    ),
    create: () => createEmojiPlugin(),
  },
  {
    id: "completions",
    label: "Completions",
    summary: "Placeholder completions for suggested text flows.",
    usage: (
      <>
        Clear the editor to reveal a placeholder suggestion. Press{" "}
        <Kbd>Tab</Kbd>
        to accept it, type anything or press <Kbd>Esc</Kbd> to dismiss it, then
        undo back to empty to restore it.
      </>
    ),
    create: ({ getCompletion, dismissCompletion, restoreCompletion }) =>
      createCompletionsPlugin({
        getCompletion,
        loadingText: "Drafting a suggested reply…",
        onAccept: dismissCompletion,
        onDismiss: dismissCompletion,
        onRestore: restoreCompletion,
      }),
  },
  {
    id: "slash-commands",
    label: "Slash Commands",
    summary:
      "Chat-style command palette with choice-backed arguments and ready-to-submit state.",
    usage: (
      <>
        Type <Kbd>/</Kbd> to open commands, choose <code>/label</code>, then
        pick a label. When the command is complete, <Kbd>Enter</Kbd> executes
        via the slash plugin's structured <code>onExecute</code> callback.
      </>
    ),
    create: () =>
      createSlashCommandsPlugin({
        commands: [
          {
            name: "label",
            description: "Apply a document label",
            aliases: ["l"],
            arg: {
              name: "label",
              description: "Label to apply",
              choices: [
                { value: "idea", label: "Idea" },
                { value: "bug", label: "Bug" },
                { value: "question", label: "Question" },
                { value: "archived", label: "Archived", disabled: true },
              ],
            },
          },
          {
            name: "outline",
            description: "Insert an outline starter",
            aliases: ["o"],
          },
          {
            name: "summary",
            description: "Prepare a short summary",
          },
        ],
        onExecute: () => {},
      }),
  },
  {
    id: "mentions",
    label: "Mentions",
    summary:
      "Searchable user picker. Inserts a `@user[<id>]` marker that renders as a chip in the rendered output.",
    usage: (
      <>
        Press <Kbd>@</Kbd> to open the picker. Type to filter, <Kbd>↑</Kbd>/
        <Kbd>↓</Kbd> to navigate, <Kbd>Enter</Kbd> to insert. Switch to{" "}
        <strong>Render</strong> to see the marker hydrate into a styled chip.
      </>
    ),
    create: () =>
      createMentionsPlugin<MentionItem>({
        name: "mentions",
        trigger: "@",
        marker: "user",
        search: query =>
          DEMO_USERS.filter(u =>
            u.title.toLowerCase().includes(query.toLowerCase()),
          ),
        renderItem: (item, active) => (
          <div
            style={{
              padding: "0.4rem 0.6rem",
              fontSize: "0.78rem",
              color: active ? "hsl(270, 70%, 95%)" : "hsl(270, 50%, 75%)",
            }}
          >
            <strong>{item.title}</strong>{" "}
            <span style={{ color: "hsl(270, 30%, 60%)" }}>@{item.id}</span>
          </div>
        ),
        emptyMessage: "No matching users",
      }),
  },
  {
    id: "attachments",
    label: "Attachments",
    summary:
      "Paste or drop image files into the editor. The plugin uploads each file via your `onUpload` and inserts a block image.",
    usage: (
      <>
        Drop or paste an image. The demo uses a temporary blob URL — wire up{" "}
        <code>onUpload</code> to your storage in production.
      </>
    ),
    create: () =>
      createAttachmentsPlugin({
        accept: "image/*",
        onUpload: async file => URL.createObjectURL(file),
        onError: (_err, _file) => {},
      }),
  },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      style={{
        display: "inline-block",
        padding: "0.1rem 0.4rem",
        fontSize: "0.75rem",
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
        fontWeight: 500,
        color: "hsl(220, 12%, 94%)",
        background: "hsl(220, 10%, 22%)",
        border: "1px solid hsl(220, 10%, 32%)",
        borderRadius: "4px",
        boxShadow: "inset 0 -1px 0 hsla(0, 0%, 0%, 0.35)",
        lineHeight: 1.3,
      }}
    >
      {children}
    </kbd>
  );
}

/** Enable every plugin by default so the demo shows full functionality. */
const DEFAULT_ENABLED = new Set(AVAILABLE_PLUGINS.map(p => p.id));

/* ------------------------------------------------------------------ */
/* Shared UI primitives — used by both Plugins and Settings so the     */
/* configuration card reads as a single coherent system.               */
/* ------------------------------------------------------------------ */

// Neutral dark/gray palette for the configuration modal. Kept separate
// from the editor's purple theme so the modal reads as a calm
// system-style surface rather than competing with the page.
const SURFACE = {
  border: "hsl(220, 8%, 22%)",
  borderStrong: "hsl(220, 8%, 36%)",
  bg: "hsl(220, 10%, 10%)",
  bgSoft: "hsla(220, 10%, 16%, 0.7)",
  bgHint: "hsla(220, 10%, 18%, 0.6)",
  textHi: "hsl(220, 12%, 96%)",
  text: "hsl(220, 10%, 88%)",
  textDim: "hsl(220, 8%, 72%)",
  textVeryDim: "hsl(220, 6%, 56%)",
  accentSoft: "hsla(220, 10%, 26%, 0.6)",
};

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        position: "relative",
        width: 30,
        height: 17,
        flexShrink: 0,
        borderRadius: 9999,
        border: `1px solid ${on ? SURFACE.borderStrong : SURFACE.border}`,
        background: on ? "hsl(220, 10%, 38%)" : SURFACE.bgSoft,
        cursor: "pointer",
        padding: 0,
        transition: "background 0.18s ease, border-color 0.18s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 1,
          left: on ? 14 : 1,
          width: 13,
          height: 13,
          borderRadius: "50%",
          background: on ? "hsl(220, 12%, 96%)" : "hsl(220, 8%, 50%)",
          boxShadow: "none",
          transition: "left 0.18s ease, background 0.18s ease",
        }}
      />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  ariaLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const setBy = (delta: number) => onChange(clamp(value + delta));

  const stepBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 30,
    border: "none",
    background: "transparent",
    color: SURFACE.textDim,
    fontSize: "0.95rem",
    fontWeight: 500,
    cursor: "pointer",
    userSelect: "none",
    transition: "color 0.12s ease, background 0.12s ease",
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        height: 30,
        borderRadius: 8,
        border: `1px solid ${focused ? SURFACE.borderStrong : SURFACE.border}`,
        background: SURFACE.bgSoft,
        overflow: "hidden",
        boxShadow: focused ? `0 0 0 3px ${SURFACE.accentSoft}` : "none",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseDownCapture={() => {
        // Prevent the dialog from registering an unintended close when
        // the user mousedowns on the spacing inside the control.
      }}
    >
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel.toLowerCase()}`}
        onClick={() => setBy(-step)}
        disabled={value <= min}
        style={{
          ...stepBtn,
          borderRight: `1px solid ${SURFACE.border}`,
          opacity: value <= min ? 0.35 : 1,
          cursor: value <= min ? "not-allowed" : "pointer",
        }}
      >
        −
      </button>
      <input
        type="number"
        aria-label={ariaLabel}
        value={value}
        min={min}
        max={max}
        step={step}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={e => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(clamp(next));
        }}
        className="demo-number-input"
        style={{
          width: 76,
          padding: "0 0.4rem",
          border: "none",
          background: "transparent",
          color: SURFACE.textHi,
          fontSize: "0.82rem",
          fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
          fontVariantNumeric: "tabular-nums",
          fontWeight: 500,
          textAlign: "right",
          outline: "none",
          appearance: "textfield",
          MozAppearance: "textfield",
        }}
      />
      {suffix && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            paddingRight: "0.55rem",
            fontSize: "0.7rem",
            color: SURFACE.textVeryDim,
            fontFamily:
              '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
            letterSpacing: "0.04em",
            textTransform: "lowercase",
          }}
        >
          {suffix}
        </span>
      )}
      <button
        type="button"
        aria-label={`Increase ${ariaLabel.toLowerCase()}`}
        onClick={() => setBy(step)}
        disabled={value >= max}
        style={{
          ...stepBtn,
          borderLeft: `1px solid ${SURFACE.border}`,
          opacity: value >= max ? 0.35 : 1,
          cursor: value >= max ? "not-allowed" : "pointer",
        }}
      >
        +
      </button>
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.04a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.04a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Capture focus when the dialog opens; restore it to the previously
  // focused element when it closes.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    // Focus the first focusable child if any, otherwise the dialog
    // itself (we add tabIndex={-1} so it can receive focus).
    const firstFocusable = dialog?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (firstFocusable ?? dialog)?.focus();
    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  // Trap Tab inside the dialog while open.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(el => !el.hasAttribute("aria-hidden"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "hsla(220, 12%, 5%, 0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        animation: "inkwell-demo-modal-fade 0.16s ease-out",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="demo-modal-dialog"
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: "min(760px, 90vh)",
          overflowY: "auto",
          borderRadius: 12,
          border: `1px solid ${SURFACE.border}`,
          background: SURFACE.bg,
          boxShadow:
            "0 24px 60px -12px hsla(0, 0%, 0%, 0.6), 0 0 0 1px hsla(220, 10%, 60%, 0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${SURFACE.border}`,
          }}
        >
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: SURFACE.textHi,
              letterSpacing: "-0.005em",
            }}
          >
            {title}
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: 6,
              border: `1px solid ${SURFACE.border}`,
              background: "transparent",
              color: SURFACE.textDim,
              cursor: "pointer",
            }}
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.72rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: SURFACE.textDim,
        padding: "1.1rem 1.25rem 0.5rem",
      }}
    >
      {children}
    </div>
  );
}

function Row({
  title,
  description,
  hint,
  control,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Optional extra usage hint shown indented under the description. */
  hint?: ReactNode | null;
  control: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "1.25rem",
        alignItems: "start",
        padding: "0.95rem 1.25rem",
        borderTop: `1px solid ${SURFACE.border}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.95rem",
            fontWeight: 600,
            color: SURFACE.textHi,
            marginBottom: description ? "0.3rem" : 0,
            lineHeight: 1.4,
          }}
        >
          {title}
        </div>
        {description && (
          <div
            style={{
              fontSize: "0.85rem",
              lineHeight: 1.6,
              color: SURFACE.text,
            }}
          >
            {description}
          </div>
        )}
        {hint && (
          <div
            style={{
              marginTop: "0.55rem",
              padding: "0.5rem 0.7rem",
              fontSize: "0.8rem",
              lineHeight: 1.6,
              color: SURFACE.textDim,
              background: SURFACE.bgHint,
              borderRadius: 6,
              borderLeft: `2px solid ${SURFACE.border}`,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, paddingTop: "0.15rem" }}>{control}</div>
    </div>
  );
}

function usePluginSelector() {
  const [enabled, setEnabled] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return DEFAULT_ENABLED;
    const raw = new URLSearchParams(window.location.search).get("plugins");
    if (raw === null) return DEFAULT_ENABLED;
    return new Set(raw.split(",").filter(Boolean));
  });

  const toggle = (id: string) => {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      const params = new URLSearchParams(window.location.search);
      params.set("plugins", Array.from(next).join(","));
      const search = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname +
          (search ? `?${search}` : "") +
          window.location.hash,
      );
      return next;
    });
  };

  const bubbleMenuEnabled = enabled.has(BUBBLE_MENU_ID);

  return { enabled, toggle, bubbleMenuEnabled };
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            color: "#ef4444",
            padding: "1rem",
            fontSize: "0.8rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {this.state.error.message}
          {"\n"}
          {this.state.error.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}

const INITIAL_MARKDOWN = `# Welcome to Inkwell

Inkwell is a Markdown editor and renderer for React with an extensible plugin system.

## Features

- Standard configurable _WYSIWYG_ features
  - **Bold**, _italic_, ~~strike~~, \`code\`, links
- Extensible **plugin system** with batteries included
- Block images, ordered + nested lists, mentions, attachments

## Try it out

1. Type \`-\` or \`1.\` followed by space to start a list
2. Indent with two leading spaces for nested items
3. Press \`[\` for snippets, \`@\` to mention @user[alice], or \`:\` for emoji
4. Clear the editor to reveal a placeholder completion, then press Tab to accept it
5. Type \`/label\` to try slash commands
6. Drop or paste an image — the Attachments plugin will insert it

![A keyboard at golden hour](https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=300&fit=crop)

## Example

\`\`\`typescript
import { InkwellEditor } from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("# Hello");
  return <InkwellEditor content={content} onChange={setContent} />;
}
\`\`\``;

type Tab = "editor" | "preview";

const TABS: { key: Tab; label: string }[] = [
  { key: "editor", label: "Edit" },
  { key: "preview", label: "Render" },
];

const SETTINGS_HASH = "demo-settings";

/** Parses `window.location.hash` into the active tab and whether the settings
 *  modal should be open. `#demo-settings` always takes precedence over the
 *  tab hash (`#render`) while the modal is open. */
function parseHash(hash: string): { tab: Tab; settingsOpen: boolean } {
  const value = hash.replace(/^#/, "");
  if (value === SETTINGS_HASH) return { tab: "editor", settingsOpen: true };
  if (value === "render") return { tab: "preview", settingsOpen: false };
  return { tab: "editor", settingsOpen: false };
}

function hashFor(tab: Tab, settingsOpen: boolean): string {
  if (settingsOpen) return `#${SETTINGS_HASH}`;
  if (tab === "preview") return "#render";
  return "";
}

export function Demo() {
  const [editorContent, setEditorContent] = useState(INITIAL_MARKDOWN);
  const initialHash =
    typeof window === "undefined"
      ? { tab: "editor" as Tab, settingsOpen: false }
      : parseHash(window.location.hash);
  const [activeTab, setActiveTab] = useState<Tab>(initialHash.tab);
  const [settingsOpen, setSettingsOpen] = useState(initialHash.settingsOpen);

  const writeHash = (tab: Tab, open: boolean) => {
    const hash = hashFor(tab, open);
    window.history.replaceState(
      null,
      "",
      hash || window.location.pathname + window.location.search,
    );
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    // Switching tabs implicitly closes the settings modal so users land on
    // the editor surface they just selected.
    setSettingsOpen(false);
    writeHash(tab, false);
  };

  const openSettings = () => {
    setSettingsOpen(true);
    writeHash(activeTab, true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    writeHash(activeTab, false);
  };

  // Keep the modal + tab in sync with browser back/forward navigation so a
  // direct visit to `#demo-settings` (or popstate to it) opens the modal.
  useEffect(() => {
    const onHashChange = () => {
      const next = parseHash(window.location.hash);
      setActiveTab(next.tab);
      setSettingsOpen(next.settingsOpen);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Close the modal on Escape, while it is open.
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);
  const {
    enabled: enabledPluginIds,
    toggle: togglePlugin,
    bubbleMenuEnabled,
  } = usePluginSelector();

  const [characterCount, setCharacterCount] = useState(
    () => INITIAL_MARKDOWN.length,
  );
  const [enforceCharacterLimit, setEnforceCharacterLimit] = useState(false);
  const [characterLimit, setCharacterLimit] = useState(DEFAULT_CHARACTER_LIMIT);
  const [completion, setCompletion] = useState<string | null>(DEMO_COMPLETION);
  const editorContentRef = useRef(editorContent);
  const completionRef = useRef(completion);
  editorContentRef.current = editorContent;
  completionRef.current = completion;
  const overLimit = characterCount > characterLimit;
  const selectedPlugins = useMemo(
    () =>
      AVAILABLE_PLUGINS.filter(p => p.create && enabledPluginIds.has(p.id)).map(
        p => {
          // The filter above guarantees `create` is defined; capture it in
          // a local so we don't need the non-null assertion.
          const create = p.create;
          if (!create) throw new Error("plugin missing create");
          return create({
            getCompletion: () =>
              editorContentRef.current.trim().length === 0
                ? completionRef.current
                : null,
            dismissCompletion: () => setCompletion(null),
            restoreCompletion: nextCompletion => setCompletion(nextCompletion),
          });
        },
      ),
    [enabledPluginIds],
  );
  const editor = (
    <InkwellEditor
      content={editorContent}
      onChange={setEditorContent}
      placeholder="Start writing Markdown..."
      plugins={selectedPlugins}
      bubbleMenu={bubbleMenuEnabled}
      characterLimit={characterLimit}
      enforceCharacterLimit={enforceCharacterLimit}
      onCharacterCount={setCharacterCount}
      styles={{ editor: { maxHeight: 760, overflowY: "auto" } }}
    />
  );

  return (
    <ErrorBoundary>
      <div>
        {/* Top bar: mode tabs on the left, settings gear on the right.
            The gear lives outside the editor surface so opening settings
            never visually interferes with the content area. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <div
            role="tablist"
            aria-label="Demo mode"
            style={{ display: "flex" }}
          >
            {TABS.map(({ key, label }) => {
              const selected = activeTab === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => switchTab(key)}
                  style={{
                    padding: "0.4rem 0",
                    fontSize: "0.8rem",
                    fontWeight: selected ? 600 : 400,
                    cursor: "pointer",
                    border: "none",
                    borderBottom: selected
                      ? `2px solid ${SURFACE.borderStrong}`
                      : "2px solid transparent",
                    background: "transparent",
                    color: selected ? SURFACE.textHi : SURFACE.textDim,
                    marginRight: "1rem",
                    transition: "all 0.2s ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Open demo settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={openSettings}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.35rem 0.65rem",
              borderRadius: 6,
              border: `1px solid ${
                settingsOpen ? SURFACE.borderStrong : SURFACE.border
              }`,
              background: settingsOpen ? SURFACE.accentSoft : "transparent",
              color: settingsOpen ? SURFACE.textHi : SURFACE.textDim,
              cursor: "pointer",
              fontSize: "0.72rem",
              fontWeight: 500,
              transition: "all 0.15s ease",
            }}
          >
            <GearIcon />
            <span>Settings</span>
          </button>
        </div>

        {activeTab === "editor" && editor}
        {activeTab === "preview" && (
          <div
            className="inkwell-editor"
            style={{ maxHeight: 760, overflowY: "auto" }}
          >
            <InkwellRenderer
              content={editorContent}
              copyButton
              mentions={MENTION_RENDERERS}
            />
          </div>
        )}

        {/* Settings live behind the gear button + modal. Hash `#demo-settings`
            opens it; closing restores the active tab's hash. */}
        <Modal
          open={settingsOpen}
          onClose={closeSettings}
          title="Demo settings"
        >
          <SectionHeader>Plugins</SectionHeader>
          {AVAILABLE_PLUGINS.map(plugin => {
            const isOn = enabledPluginIds.has(plugin.id);
            return (
              <Row
                key={plugin.id}
                title={plugin.label}
                description={plugin.summary}
                // Only show the verbose usage hint when the plugin is on,
                // so the modal stays scannable when scrolling through it.
                hint={isOn ? plugin.usage : null}
                control={
                  <Switch
                    on={isOn}
                    onChange={() => togglePlugin(plugin.id)}
                    label={`${plugin.label} plugin`}
                  />
                }
              />
            );
          })}

          <SectionHeader>Settings</SectionHeader>

          <Row
            title="Character limit"
            description={
              <>
                Maximum document length reported via{" "}
                <code
                  style={{
                    fontFamily:
                      '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
                    fontSize: "0.78em",
                    background: "hsl(220, 10%, 22%)",
                    padding: "0 0.3rem",
                    borderRadius: 3,
                    color: SURFACE.textHi,
                  }}
                >
                  onCharacterCount
                </code>
                .
              </>
            }
            control={
              <NumberInput
                ariaLabel="Character limit"
                value={characterLimit}
                onChange={setCharacterLimit}
                min={CHARACTER_LIMIT_MIN}
                max={CHARACTER_LIMIT_MAX}
                step={50}
                suffix="chars"
              />
            }
          />

          <Row
            title="Enforce character limit"
            description="When on, the editor clamps typing and pasted input at the character limit."
            control={
              <Switch
                on={enforceCharacterLimit}
                onChange={setEnforceCharacterLimit}
                label="Enforce character limit"
              />
            }
          />

          {/* Inline progress bar lives flush against the bottom of the card
              so the count stays visible regardless of which section is open. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.65rem 1rem",
              borderTop: `1px solid ${SURFACE.border}`,
              background: SURFACE.bgSoft,
            }}
          >
            <div
              style={{
                flex: 1,
                position: "relative",
                height: 4,
                borderRadius: 9999,
                background: "hsl(220, 10%, 22%)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  right: "auto",
                  width: `${Math.min(
                    100,
                    (characterCount / characterLimit) * 100,
                  )}%`,
                  background: overLimit
                    ? "hsl(0, 75%, 60%)"
                    : "linear-gradient(90deg, hsl(220, 10%, 55%), hsl(220, 12%, 75%))",
                  transition: "width 0.18s ease, background 0.2s ease",
                }}
              />
            </div>
            <span
              aria-live="polite"
              style={{
                fontFamily:
                  '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
                fontSize: "0.72rem",
                fontVariantNumeric: "tabular-nums",
                color: overLimit ? "hsl(0, 75%, 72%)" : SURFACE.textDim,
                minWidth: "6.5rem",
                textAlign: "right",
              }}
            >
              {characterCount} / {characterLimit}
            </span>
          </div>
        </Modal>
      </div>
    </ErrorBoundary>
  );
}
