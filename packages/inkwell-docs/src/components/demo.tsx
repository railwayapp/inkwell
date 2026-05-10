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

const CHARACTER_LIMIT = 2000;

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
        padding: "0.05rem 0.35rem",
        fontSize: "0.68rem",
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
        fontWeight: 500,
        color: "hsl(270, 70%, 92%)",
        background: "hsla(270, 50%, 32%, 0.6)",
        border: "1px solid hsl(270, 45%, 32%)",
        borderRadius: "4px",
        boxShadow: "inset 0 -1px 0 hsla(0, 0%, 0%, 0.3)",
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

const SURFACE = {
  border: "hsl(270, 45%, 22%)",
  borderStrong: "hsl(270, 60%, 52%)",
  bg: "hsl(270, 38%, 10%)",
  bgSoft: "hsla(270, 40%, 14%, 0.6)",
  textHi: "hsl(270, 70%, 95%)",
  text: "hsl(270, 60%, 82%)",
  textDim: "hsl(270, 30%, 58%)",
  textVeryDim: "hsl(270, 28%, 45%)",
  accentSoft: "hsla(270, 60%, 52%, 0.18)",
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
        background: on ? "hsla(270, 60%, 52%, 0.35)" : SURFACE.bgSoft,
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
          background: on ? "hsl(270, 70%, 88%)" : "hsl(270, 30%, 55%)",
          boxShadow: on ? "0 0 6px hsla(270, 70%, 75%, 0.7)" : "none",
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
                ? "inset 0 0 0 1px hsla(270, 60%, 52%, 0.45)"
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

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.62rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: SURFACE.textVeryDim,
        padding: "0.85rem 1rem 0.45rem",
      }}
    >
      {children}
    </div>
  );
}

function Row({
  title,
  description,
  control,
}: {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "1rem",
        alignItems: "center",
        padding: "0.7rem 1rem",
        borderTop: `1px solid ${SURFACE.border}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.82rem",
            fontWeight: 500,
            color: SURFACE.textHi,
            marginBottom: description ? "0.18rem" : 0,
          }}
        >
          {title}
        </div>
        {description && (
          <div
            style={{
              fontSize: "0.72rem",
              lineHeight: 1.5,
              color: SURFACE.textDim,
            }}
          >
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
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

export function Demo() {
  const [editorContent, setEditorContent] = useState(INITIAL_MARKDOWN);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "editor";
    const hash = window.location.hash.slice(1);
    if (hash === "render" || hash === "collab")
      return hash === "render" ? "preview" : "collab";
    return "editor";
  });

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    const hash =
      tab === "editor" ? "" : tab === "preview" ? "#render" : "#collab";
    window.history.replaceState(
      null,
      "",
      hash || window.location.pathname + window.location.search,
    );
  };
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
  const [demoStyle, setDemoStyle] = useState<"custom" | "default">("custom");
  const overLimit = characterCount > CHARACTER_LIMIT;
  const { EditorInstance } = useInkwell({
    content: editorContent,
    onChange: setEditorContent,
    placeholder: "Start writing Markdown...",
    plugins: selectedPlugins,
    bubbleMenu: bubbleMenuEnabled,
    characterLimit: CHARACTER_LIMIT,
    enforceCharacterLimit,
    onCharacterCount: setCharacterCount,
  });

  return (
    <ErrorBoundary>
      <div>
        {/* Mode tabs */}
        <div
          role="tablist"
          aria-label="Demo mode"
          style={{
            display: "flex",
            gap: "0.25rem",
            marginBottom: "0.75rem",
          }}
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

        {/* Configuration card — matches the editor surface so plugins and
            settings read as part of the same UI system. */}
        <div
          aria-label="Editor configuration"
          style={{
            marginTop: "0.85rem",
            borderRadius: 10,
            border: `1px solid ${SURFACE.border}`,
            background: SURFACE.bg,
            overflow: "hidden",
          }}
        >
          <SectionHeader>Plugins</SectionHeader>
          {AVAILABLE_PLUGINS.map(plugin => {
            const isOn = enabledPluginIds.has(plugin.id);
            return (
              <Row
                key={plugin.id}
                title={plugin.label}
                description={
                  <>
                    <span>{plugin.summary}</span>
                    <span
                      style={{
                        display: "block",
                        marginTop: "0.3rem",
                        color: SURFACE.textVeryDim,
                      }}
                    >
                      {plugin.usage}
                    </span>
                  </>
                }
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
                    background: "hsla(270, 50%, 32%, 0.4)",
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
                Tracks document length via{" "}
                <code
                  style={{
                    fontFamily:
                      '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
                    fontSize: "0.78em",
                    background: "hsla(270, 50%, 32%, 0.4)",
                    padding: "0 0.3rem",
                    borderRadius: 3,
                    color: SURFACE.textHi,
                  }}
                >
                  onCharacterCount
                </code>
                . When enforced, the editor clamps typing and pasted input at
                the limit.
              </>
            }
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
                background: "hsl(270, 38%, 18%)",
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
                    (characterCount / CHARACTER_LIMIT) * 100,
                  )}%`,
                  background: overLimit
                    ? "hsl(0, 75%, 60%)"
                    : "linear-gradient(90deg, hsl(270, 60%, 52%), hsl(270, 70%, 70%))",
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
              {characterCount} / {CHARACTER_LIMIT}
            </span>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
