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

const DEFAULT_ENABLED = new Set([BUBBLE_MENU_ID]);

function PluginChip({
  plugin,
  isOn,
  onToggle,
}: {
  plugin: PluginDef;
  isOn: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onToggle}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-pressed={isOn}
        aria-describedby={`plugin-${plugin.id}-tooltip`}
        style={{
          padding: "0.3rem 0.7rem",
          fontSize: "0.72rem",
          fontWeight: 500,
          cursor: "pointer",
          borderRadius: "9999px",
          border: `1px solid ${
            isOn ? "hsl(270, 60%, 52%)" : "hsl(270, 45%, 24%)"
          }`,
          background: isOn
            ? "hsla(270, 60%, 52%, 0.22)"
            : "hsla(270, 40%, 16%, 0.5)",
          color: isOn ? "hsl(270, 70%, 95%)" : "hsl(270, 40%, 65%)",
          boxShadow: isOn ? "0 0 14px hsla(270, 60%, 52%, 0.4)" : "none",
          transition: "all 0.2s ease",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          backdropFilter: "blur(8px)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isOn ? "hsl(270, 70%, 80%)" : "hsl(270, 45%, 32%)",
            boxShadow: isOn ? "0 0 6px hsl(270, 70%, 75%)" : "none",
            transition: "all 0.2s ease",
          }}
        />
        {plugin.label}
      </button>
      <div
        id={`plugin-${plugin.id}-tooltip`}
        role="tooltip"
        style={{
          position: "absolute",
          bottom: "calc(100% + 10px)",
          left: "50%",
          width: 260,
          padding: "0.7rem 0.85rem",
          fontSize: "0.72rem",
          lineHeight: 1.55,
          color: "hsl(270, 70%, 92%)",
          background: "hsla(270, 40%, 10%, 0.95)",
          border: "1px solid hsl(270, 45%, 28%)",
          borderRadius: 10,
          backdropFilter: "blur(14px)",
          boxShadow:
            "0 12px 32px -6px rgba(0, 0, 0, 0.55), 0 0 0 1px hsla(270, 60%, 52%, 0.12)",
          pointerEvents: hovered ? "auto" : "none",
          opacity: hovered ? 1 : 0,
          transform: `translateX(-50%) translateY(${hovered ? 0 : 4}px)`,
          transition: "opacity 0.18s ease-out, transform 0.18s ease-out",
          zIndex: 20,
        }}
      >
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "hsl(270, 80%, 96%)",
            marginBottom: "0.35rem",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: isOn ? "hsl(270, 70%, 80%)" : "hsl(270, 45%, 40%)",
              boxShadow: isOn ? "0 0 6px hsl(270, 70%, 75%)" : "none",
            }}
          />
          {plugin.label}
          <span
            style={{
              marginLeft: "auto",
              fontSize: "0.62rem",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: isOn ? "hsl(270, 70%, 85%)" : "hsl(270, 35%, 55%)",
            }}
          >
            {isOn ? "On" : "Off"}
          </span>
        </div>
        <div style={{ marginBottom: "0.55rem", color: "hsl(270, 65%, 88%)" }}>
          {plugin.summary}
        </div>
        <div
          style={{
            fontSize: "0.62rem",
            color: "hsl(270, 40%, 62%)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
            marginBottom: "0.3rem",
          }}
        >
          How to use
        </div>
        <div style={{ color: "hsl(270, 60%, 86%)" }}>{plugin.usage}</div>
        {/* Invisible bridge covering the gap between tooltip and button */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            height: 16,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "6px solid hsl(270, 45%, 28%)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "calc(100% - 1px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid hsla(270, 40%, 10%, 0.95)",
          }}
        />
      </div>
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
  const overLimit = characterCount > CHARACTER_LIMIT;
  const [bottomTab, setBottomTab] = useState<"plugins" | "settings">("plugins");
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
        <div
          style={{ display: "flex", gap: "0.25rem", marginBottom: "0.75rem" }}
        >
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                padding: "0.4rem 0",
                fontSize: "0.8rem",
                fontWeight: activeTab === key ? 600 : 400,
                cursor: "pointer",
                border: "none",
                borderBottom:
                  activeTab === key
                    ? "2px solid hsl(270, 60%, 52%)"
                    : "2px solid transparent",
                background: "transparent",
                color:
                  activeTab === key
                    ? "hsl(270, 70%, 95%)"
                    : "hsl(270, 30%, 50%)",
                marginRight: "1rem",
                transition: "all 0.2s ease",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="demo-tab-content"
          style={{
            borderRadius: "10px",
            background: "hsl(270, 38%, 10%)",
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

        <div style={{ marginTop: "0.85rem" }}>
          <div
            role="tablist"
            aria-label="Editor configuration"
            style={{
              display: "flex",
              borderBottom: "1px solid hsl(270, 45%, 22%)",
              marginBottom: "0.7rem",
            }}
          >
            {(
              [
                { id: "plugins", label: "Plugins" },
                { id: "settings", label: "Settings" },
              ] as const
            ).map(({ id, label }) => {
              const selected = bottomTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`bottom-tab-${id}`}
                  onClick={() => setBottomTab(id)}
                  style={{
                    padding: "0.4rem 0",
                    marginRight: "1.25rem",
                    marginBottom: "-1px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: selected
                      ? "hsl(270, 70%, 92%)"
                      : "hsl(270, 28%, 48%)",
                    borderBottom: selected
                      ? "2px solid hsl(270, 60%, 52%)"
                      : "2px solid transparent",
                    transition: "color 0.15s ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {bottomTab === "plugins" && (
            <div
              id="bottom-tab-plugins"
              role="tabpanel"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              {AVAILABLE_PLUGINS.map(plugin => (
                <PluginChip
                  key={plugin.id}
                  plugin={plugin}
                  isOn={enabledPluginIds.has(plugin.id)}
                  onToggle={() => togglePlugin(plugin.id)}
                />
              ))}
            </div>
          )}

          {bottomTab === "settings" && (
            <div id="bottom-tab-settings" role="tabpanel">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "1rem",
                  marginBottom: "0.65rem",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "hsl(270, 70%, 92%)",
                      fontWeight: 500,
                      marginBottom: "0.2rem",
                    }}
                  >
                    Character limit
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      lineHeight: 1.5,
                      color: "hsl(270, 30%, 60%)",
                      maxWidth: 480,
                    }}
                  >
                    Tracks document length and reports it via{" "}
                    <code
                      style={{
                        fontFamily:
                          '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
                        fontSize: "0.78em",
                        background: "hsla(270, 50%, 32%, 0.4)",
                        padding: "0 0.3rem",
                        borderRadius: 3,
                        color: "hsl(270, 70%, 88%)",
                      }}
                    >
                      onCharacterCount
                    </code>
                    . Toggle <strong>Enforce</strong> to clamp typing and pasted
                    input at the limit.
                  </div>
                </div>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enforceCharacterLimit}
                    onChange={e => setEnforceCharacterLimit(e.target.checked)}
                    style={{
                      accentColor: "hsl(270, 60%, 52%)",
                      width: 14,
                      height: 14,
                      cursor: "pointer",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: enforceCharacterLimit
                        ? "hsl(270, 70%, 88%)"
                        : "hsl(270, 30%, 55%)",
                    }}
                  >
                    Enforce
                  </span>
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.7rem",
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
                      top: 0,
                      left: 0,
                      bottom: 0,
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
                    color: overLimit
                      ? "hsl(0, 75%, 72%)"
                      : "hsl(270, 40%, 65%)",
                    minWidth: "6.5rem",
                    textAlign: "right",
                  }}
                >
                  {characterCount} / {CHARACTER_LIMIT}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
