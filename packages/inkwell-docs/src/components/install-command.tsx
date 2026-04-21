import { useState } from "react";

const commands: Record<string, string> = {
  npm: "npm install @railway/inkwell",
  pnpm: "pnpm add @railway/inkwell",
  yarn: "yarn add @railway/inkwell",
  bun: "bun add @railway/inkwell",
};

const pms = ["npm", "pnpm", "yarn", "bun"] as const;

export function InstallCommand() {
  const [active, setActive] = useState<string>("npm");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(commands[active]);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ display: "flex", gap: 0, marginBottom: "-1px" }}>
        {pms.map(pm => (
          <button
            key={pm}
            onClick={() => {
              setActive(pm);
              setCopied(false);
            }}
            style={{
              padding: "0.3rem 0.65rem",
              fontSize: "0.75rem",
              fontWeight: 500,
              cursor: "pointer",
              border: "1px solid transparent",
              borderRadius: "0.375rem 0.375rem 0 0",
              background: active === pm ? "hsl(270, 70%, 95%)" : "transparent",
              color:
                active === pm ? "hsl(270, 38%, 12%)" : "hsl(270, 40%, 55%)",
              borderColor: active === pm ? "hsl(270, 70%, 95%)" : "transparent",
              marginRight: "-1px",
              position: "relative",
              zIndex: active === pm ? 1 : 0,
              transition: "all 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {pm}
          </button>
        ))}
      </div>
      <button
        onClick={handleCopy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.5rem 0.75rem",
          fontSize: "0.875rem",
          borderRadius: "0 0.5rem 0.5rem 0.5rem",
          background: "hsl(270, 70%, 95%)",
          cursor: "pointer",
          width: "100%",
          border: "none",
          transition: "box-shadow 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
          boxShadow: copied ? "0 0 24px hsla(270, 60%, 52%, 0.5)" : "none",
        }}
      >
        <span
          style={{
            color: "hsl(270, 30%, 45%)",
            userSelect: "none",
            fontFamily:
              '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
            fontSize: "0.8rem",
          }}
          aria-hidden="true"
        >
          $
        </span>
        <code
          style={{
            fontFamily:
              '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
            color: "hsl(270, 38%, 12%)",
            fontSize: "0.8rem",
          }}
        >
          {commands[active]}
        </code>
        <span
          style={{
            fontSize: "0.7rem",
            color: copied ? "hsl(270, 60%, 52%)" : "hsl(270, 40%, 30%)",
            marginLeft: "auto",
            fontWeight: 500,
            transition: "color 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </span>
      </button>
    </div>
  );
}
