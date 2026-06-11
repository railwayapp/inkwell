/**
 * Identifies which surface a shared block component is rendering on.
 *
 * Both surfaces share markup so the editor stays WYSIWYG with the renderer,
 * but they differ in the CSS classes they emit:
 *
 * - `"editor"` decorates with `.inkwell-editor-*` classes so Slate-specific
 *   chrome and editor-only spacing rules still apply.
 * - `"renderer"` emits no extra class — `.inkwell-renderer <tag>` descendant
 *   selectors handle styling.
 */
export type InkwellSurface = "editor" | "renderer";
