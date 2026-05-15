/**
 * Runtime cascade check for the class-driven theming use case.
 *
 * A consumer loads Inkwell's stylesheet and then sets a single `.cs-theme`
 * class on `<InkwellRenderer />` to remap `--inkwell-text`. We inject the
 * consumer rule BEFORE Inkwell's stylesheet so that, without the
 * `:where()` wrapping on the token-definition block, the two rules would
 * tie at 0,0,1,0 and Inkwell's later-loaded rule would win by cascade
 * order. With the `:where()` wrapping, Inkwell's rule drops to 0,0,0 and
 * the consumer's `.cs-theme` (0,0,1,0) wins regardless of cascade order —
 * exactly what class-driven theming needs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InkwellRenderer } from "./renderer/inkwell-renderer";

const STYLES_CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "styles.css"),
  "utf8",
);

describe("token consumer override (runtime cascade)", () => {
  afterEach(cleanup);

  it("lets a single-class rule override --inkwell-text on the renderer", () => {
    const consumerStyle = document.createElement("style");
    consumerStyle.setAttribute("data-test", "consumer");
    consumerStyle.textContent =
      ".cs-theme { --inkwell-text: rgb(255, 0, 128); }";
    document.head.appendChild(consumerStyle);

    const inkwellStyle = document.createElement("style");
    inkwellStyle.setAttribute("data-test", "inkwell");
    inkwellStyle.textContent = STYLES_CSS;
    document.head.appendChild(inkwellStyle);

    try {
      const { container } = render(
        <InkwellRenderer content="hi" className="cs-theme" />,
      );
      const renderer =
        container.querySelector<HTMLElement>(".inkwell-renderer");
      expect(renderer).not.toBeNull();
      const value = getComputedStyle(renderer as HTMLElement)
        .getPropertyValue("--inkwell-text")
        .trim();
      expect(value).toBe("rgb(255, 0, 128)");
    } finally {
      consumerStyle.remove();
      inkwellStyle.remove();
    }
  });
});
