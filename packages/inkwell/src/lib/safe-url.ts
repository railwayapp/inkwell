/**
 * Allowlist-based URL sanitizer for `<img src>` values that originate
 * from untrusted input — pasted HTML, dropped files, deserialized
 * markdown. Returns `null` for anything that doesn't match the allowed
 * set so callers can choose to drop the image or render a blank.
 *
 * Allowed:
 *  - `http:` / `https:` URLs
 *  - Protocol-relative URLs (`//host/path`)
 *  - Same-origin relative URLs (start with `/`, `./`, `../`, or no scheme)
 *  - `data:image/<png|jpeg|gif|webp>` (raster formats only — `svg+xml`
 *    is excluded because it can execute scripts in some browsers)
 *  - `blob:` URLs (used by `URL.createObjectURL` for local previews)
 *
 * Blocked: `javascript:`, `vbscript:`, `file:`, `data:` for any
 * non-raster MIME, and anything else.
 */
export function isSafeImageUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== "string") return false;
  const url = rawUrl.trim();
  if (url.length === 0) return false;

  // Same-origin / relative — no scheme.
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
    return true;
  }

  // Bare relative path with no scheme delimiter (e.g. "img/cat.png").
  // We treat anything without a leading scheme as relative.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return true;
  }

  const lower = url.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return true;
  }
  if (lower.startsWith("blob:")) {
    return true;
  }
  if (/^data:image\/(png|jpeg|jpg|gif|webp);/.test(lower)) {
    return true;
  }
  // `data:image/svg+xml` is intentionally excluded — SVG can carry
  // inline scripts (`<svg onload="...">`) that execute in some
  // browser/CSP combinations.
  return false;
}

/**
 * Same allowlist as `isSafeImageUrl` but returns the original string
 * when safe and `undefined` otherwise. Convenient for `<img src>`:
 * passing `undefined` omits the attribute entirely (which React prefers
 * over an empty string, since `src=""` re-fetches the current page in
 * many browsers).
 */
export function sanitizeImageUrl(
  rawUrl: string | undefined | null,
): string | undefined {
  if (!rawUrl) return undefined;
  return isSafeImageUrl(rawUrl) ? rawUrl : undefined;
}
