import {
  type CollaborationConfig,
  createAttachmentsPlugin,
  createMentionsPlugin,
  createSnippetsPlugin,
  deserialize,
  type InkwellPlugin,
  InkwellRenderer,
  type MentionItem,
  type MentionRenderer,
  useInkwell,
} from "@railway/inkwell";
import { slateNodesToInsertDelta } from "@slate-yjs/core";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

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
  create?: () => InkwellPlugin;
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

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        padding: 2,
        borderRadius: 8,
        border: `1px solid ${SURFACE.border}`,
        background: SURFACE.bgSoft,
      }}
    >
      {options.map(opt => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "0.25rem 0.7rem",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "0.7rem",
              fontWeight: 600,
              color: selected ? SURFACE.textHi : SURFACE.textDim,
              background: selected ? SURFACE.accentSoft : "transparent",
              boxShadow: selected
                ? `inset 0 0 0 1px ${SURFACE.borderStrong}`
                : "none",
              transition: "all 0.15s ease",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => {
        const next = Number(e.target.value);
        if (Number.isFinite(next)) {
          onChange(Math.min(max, Math.max(min, Math.round(next))));
        }
      }}
      style={{
        width: 88,
        padding: "0.3rem 0.5rem",
        borderRadius: 6,
        border: `1px solid ${SURFACE.border}`,
        background: SURFACE.bgSoft,
        color: SURFACE.textHi,
        fontSize: "0.78rem",
        fontFamily:
          '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
        outline: "none",
      }}
    />
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
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

  const plugins = useMemo(
    () =>
      AVAILABLE_PLUGINS.filter(p => p.create && enabled.has(p.id)).map(p =>
        p.create!(),
      ),
    [enabled],
  );

  const bubbleMenuEnabled = enabled.has(BUBBLE_MENU_ID);

  return { plugins, enabled, toggle, bubbleMenuEnabled };
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

Inkwell is a Markdown editor and renderer for React with an extensible plugin system and real-time collaboration support.

## Features

- Standard configurable _WYSIWYG_ features
  - **Bold**, _italic_, ~~strike~~, \`code\`, links
- Extensible **plugin system** with batteries included
- **Real-time** collaboration via [Yjs](https://yjs.dev/)
- Block images, ordered + nested lists, mentions, attachments

## Try it out

1. Type \`-\` or \`1.\` followed by space to start a list
2. Indent with two leading spaces for nested items
3. Press \`[\` for snippets, \`@\` to mention @user[alice]
4. Drop or paste an image — the Attachments plugin will insert it

![A keyboard at golden hour](https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&h=300&fit=crop)

## Example

\`\`\`typescript
import { useInkwell } from "@railway/inkwell";
import { useState } from "react";

function App() {
  const [content, setContent] = useState("# Hello");
  const { EditorInstance } = useInkwell({
    content,
    onChange: setContent,
  });

  return <EditorInstance />;
}
\`\`\``;

const COLLAB_INITIAL_CONTENT = `# Welcome to Inkwell

This is a **live collaborative editor**. Anyone with this link can edit in real-time.

Try it out:
- **Bold** with \`**word**\`
- _Italic_ with \`_word_\`
- ~~Strikethrough~~ with \`~~word~~\`

> Blockquotes start with \`>\`

\`\`\`typescript
function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

This document resets every 5 minutes.`;

const COLLAB_SERVER = "wss://demo-collab-server.inkwell.build";

const COLORS = [
  "#e06c75",
  "#61afef",
  "#98c379",
  "#d19a66",
  "#c678dd",
  "#56b6c2",
];

function randomName() {
  const names = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank"];
  return names[Math.floor(Math.random() * names.length)];
}

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function useCollab(name: string, color: string) {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "disconnected"
  >("idle");
  const [peerCount, setPeerCount] = useState(0);
  const [collaboration, setCollaboration] =
    useState<CollaborationConfig | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const initialized = useRef(false);

  function connect() {
    if (initialized.current) return;
    initialized.current = true;

    const doc = new Y.Doc();
    const sharedType = doc.get("content", Y.XmlText) as Y.XmlText;
    const provider = new WebsocketProvider(COLLAB_SERVER, "inkwell-demo", doc, {
      connect: false,
      maxBackoffTime: 5000,
    });

    docRef.current = doc;
    providerRef.current = provider;

    provider.on("status", ({ status: s }: { status: string }) => {
      setStatus(s as "connecting" | "connected" | "disconnected");
    });

    provider.on("sync", (synced: boolean) => {
      if (synced && sharedType.length === 0) {
        const nodes = deserialize(COLLAB_INITIAL_CONTENT);
        const delta = slateNodesToInsertDelta(nodes);
        sharedType.applyDelta(delta);
      }
    });

    // Track connected peers via awareness
    const updatePeerCount = () => {
      setPeerCount(provider.awareness.getStates().size);
    };
    provider.awareness.on("change", updatePeerCount);

    setCollaboration({
      sharedType,
      awareness: provider.awareness,
      user: { name, color },
    });

    provider.connect();
    setStatus("connecting");
  }

  useEffect(() => {
    return () => {
      providerRef.current?.disconnect();
      providerRef.current?.destroy();
      docRef.current?.destroy();
      initialized.current = false;
    };
  }, []);

  return { collaboration, status, peerCount, connect };
}

function CollabEditor({
  collaboration,
  status,
  peerCount,
  onConnect,
  name,
  color,
  bubbleMenu,
}: {
  collaboration: CollaborationConfig | null;
  status: string;
  peerCount: number;
  onConnect: () => void;
  name: string;
  color: string;
  bubbleMenu: boolean;
}) {
  useEffect(() => {
    if (!collaboration) onConnect();
  }, []);

  if (!collaboration) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#71717a" }}>
        Connecting...
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1.5rem 0",
          fontSize: "0.75rem",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background:
              status === "connected"
                ? "#4ade80"
                : status === "connecting"
                  ? "#facc15"
                  : "#ef4444",
            transition: "background 0.3s ease",
          }}
        />
        <span style={{ color: "#71717a" }}>
          {status === "connected"
            ? "Connected as "
            : status === "connecting"
              ? "Connecting..."
              : "Disconnected"}
        </span>
        {status === "connected" && (
          <span style={{ color, fontWeight: 600 }}>{name}</span>
        )}
        {status === "connected" && (
          <span style={{ color: "#52525b", marginLeft: "auto" }}>
            {peerCount} {peerCount === 1 ? "user" : "users"} connected · resets
            every 5 min
          </span>
        )}
      </div>
      <ConnectedCollabEditor
        collaboration={collaboration}
        bubbleMenu={bubbleMenu}
      />
    </div>
  );
}

function ConnectedCollabEditor({
  collaboration,
  bubbleMenu,
}: {
  collaboration: CollaborationConfig;
  bubbleMenu: boolean;
}) {
  const { EditorInstance } = useInkwell({
    content: INITIAL_MARKDOWN,
    collaboration,
    placeholder: "Start collaborating...",
    bubbleMenu,
  });

  return <EditorInstance />;
}

type Tab = "editor" | "preview" | "collab";

const TABS: { key: Tab; label: string }[] = [
  { key: "editor", label: "Edit" },
  { key: "preview", label: "Render" },
  { key: "collab", label: "Collab" },
];

const SETTINGS_HASH = "demo-settings";

/** Parses `window.location.hash` into the active tab and whether the settings
 *  modal should be open. `#demo-settings` always takes precedence over the
 *  tab hashes (`#render`, `#collab`) while the modal is open. */
function parseHash(hash: string): { tab: Tab; settingsOpen: boolean } {
  const value = hash.replace(/^#/, "");
  if (value === SETTINGS_HASH) return { tab: "editor", settingsOpen: true };
  if (value === "render") return { tab: "preview", settingsOpen: false };
  if (value === "collab") return { tab: "collab", settingsOpen: false };
  return { tab: "editor", settingsOpen: false };
}

function hashFor(tab: Tab, settingsOpen: boolean): string {
  if (settingsOpen) return `#${SETTINGS_HASH}`;
  if (tab === "preview") return "#render";
  if (tab === "collab") return "#collab";
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
  const [collabUser] = useState(() => ({
    name: randomName(),
    color: randomColor(),
  }));

  const collab = useCollab(collabUser.name, collabUser.color);
  const {
    plugins: selectedPlugins,
    enabled: enabledPluginIds,
    toggle: togglePlugin,
    bubbleMenuEnabled,
  } = usePluginSelector();

  const [characterCount, setCharacterCount] = useState(
    () => INITIAL_MARKDOWN.length,
  );
  const [enforceCharacterLimit, setEnforceCharacterLimit] = useState(false);
  const [characterLimit, setCharacterLimit] = useState(
    DEFAULT_CHARACTER_LIMIT,
  );
  const [demoStyle, setDemoStyle] = useState<"custom" | "default">("custom");
  const overLimit = characterCount > characterLimit;
  const { EditorInstance } = useInkwell({
    content: editorContent,
    onChange: setEditorContent,
    placeholder: "Start writing Markdown...",
    plugins: selectedPlugins,
    bubbleMenu: bubbleMenuEnabled,
    characterLimit,
    enforceCharacterLimit,
    onCharacterCount: setCharacterCount,
  });

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
          <div role="tablist" aria-label="Demo mode" style={{ display: "flex" }}>
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

        {/* Editor / preview / collab surface */}
        <div
          data-demo-style={demoStyle}
          className="demo-tab-content"
          style={{
            borderRadius: "10px",
            background: SURFACE.bg,
            height: "760px",
            overflowY: "auto",
          }}
        >
          {activeTab === "editor" && <EditorInstance />}
          {activeTab === "preview" && (
            <div style={{ padding: "1.5rem" }}>
              <InkwellRenderer
                content={editorContent}
                copyButton
                mentions={MENTION_RENDERERS}
              />
            </div>
          )}
          {activeTab === "collab" && (
            <CollabEditor
              collaboration={collab.collaboration}
              status={collab.status}
              peerCount={collab.peerCount}
              onConnect={collab.connect}
              name={collabUser.name}
              color={collabUser.color}
              bubbleMenu={bubbleMenuEnabled}
            />
          )}
        </div>

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
            title="Editor styles"
            description={
              <>
                Switch between the demo's purple theme and the unstyled
                defaults shipped with{" "}
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
                  @railway/inkwell/styles.css
                </code>
                .
              </>
            }
            control={
              <Segmented<"custom" | "default">
                ariaLabel="Editor styles"
                value={demoStyle}
                onChange={setDemoStyle}
                options={[
                  { value: "custom", label: "Demo" },
                  { value: "default", label: "Defaults" },
                ]}
              />
            }
          />

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
              />
            }
          />

          <Row
            title="Enforce limit"
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
