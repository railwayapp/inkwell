import type { ComponentPropsWithoutRef } from "react";
import { sanitizeImageUrl } from "../lib/safe-url";
import type { InkwellSurface } from "./types";

interface ImageProps
  extends Omit<ComponentPropsWithoutRef<"img">, "src" | "alt"> {
  surface: InkwellSurface;
  src: string;
  alt?: string;
}

/**
 * Inline/block image shared by both surfaces. Source URLs always pass
 * through the `sanitizeImageUrl` allowlist so the editor and renderer
 * agree on what's safe to render.
 *
 * The editor wraps this component in a void `<div class="inkwell-editor-image">`
 * with selection chrome — see the editor render-element.
 */
export function Image({ surface: _surface, src, alt, ...rest }: ImageProps) {
  const safe = sanitizeImageUrl(src);
  if (!safe) return null;
  return <img {...rest} src={safe} alt={alt ?? ""} />;
}
