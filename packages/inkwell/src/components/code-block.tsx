import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import type { InkwellSurface } from "./types";

interface CodeBlockProps
  extends Omit<ComponentPropsWithoutRef<"pre">, "children"> {
  surface: InkwellSurface;
  children?: ReactNode;
}

/**
 * Fenced code block shared by both surfaces. The renderer wraps the
 * `<pre>` in a container with a copy button; the editor surface is a
 * plain pass-through (the editor's own render-element wraps the
 * `code-block` element directly with selection chrome).
 *
 * Hooked into the renderer pipeline as the `pre` component on
 * rehype-react's components map — when a consumer overrides
 * `components.pre`, the renderer falls back to that override and skips
 * this entirely.
 */
export function CodeBlock({ surface, children, ...rest }: CodeBlockProps) {
  if (surface === "editor") {
    return <pre {...rest}>{children}</pre>;
  }
  return <CodeBlockWithCopy {...rest}>{children}</CodeBlockWithCopy>;
}

function CodeBlockWithCopy({
  children,
  ...rest
}: ComponentPropsWithoutRef<"pre"> & { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = preRef.current?.textContent ?? "";
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="inkwell-renderer-code-block">
      <button
        type="button"
        className="inkwell-renderer-copy-btn"
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        )}
      </button>
      <pre ref={preRef} {...rest}>
        {children}
      </pre>
    </div>
  );
}
