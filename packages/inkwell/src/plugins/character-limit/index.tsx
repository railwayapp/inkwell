"use client";

import type { InkwellPlugin } from "../../types";

export interface CharacterLimitPluginOptions {
  /** Plugin name. Defaults to `character-limit`. */
  name?: string;
}

function CharacterLimitToast({
  count,
  limit,
}: {
  count: number;
  limit: number;
}) {
  const over = count > limit;
  return (
    <div
      className="inkwell-editor-limit-toast"
      role="status"
      aria-live="polite"
    >
      <svg
        className="inkwell-editor-limit-toast-icon"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <span>
        {over ? `Over limit by ${count - limit}` : "Character limit reached"}
      </span>
    </div>
  );
}

export function createCharacterLimitPlugin({
  name = "character-limit",
}: CharacterLimitPluginOptions = {}): InkwellPlugin {
  return {
    name,
    render: ({ editor }) => {
      const state = editor.getState();
      if (state.characterLimit === undefined) return null;
      const atEnforcedLimit =
        state.isEnforcingCharacterLimit &&
        state.characterCount >= state.characterLimit;
      if (!state.overLimit && !atEnforcedLimit) return null;
      return (
        <CharacterLimitToast
          count={state.characterCount}
          limit={state.characterLimit}
        />
      );
    },
  };
}
