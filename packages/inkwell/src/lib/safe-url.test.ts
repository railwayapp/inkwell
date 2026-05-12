import { describe, expect, it } from "vitest";
import { isSafeImageUrl, sanitizeImageUrl } from "./safe-url";

describe("isSafeImageUrl", () => {
  describe("allows", () => {
    it("https URLs", () => {
      expect(isSafeImageUrl("https://example.com/cat.png")).toBe(true);
    });

    it("http URLs", () => {
      expect(isSafeImageUrl("http://example.com/cat.png")).toBe(true);
    });

    it("protocol-relative URLs", () => {
      expect(isSafeImageUrl("//cdn.example.com/cat.png")).toBe(true);
    });

    it("same-origin paths", () => {
      expect(isSafeImageUrl("/img/cat.png")).toBe(true);
      expect(isSafeImageUrl("./cat.png")).toBe(true);
      expect(isSafeImageUrl("../cat.png")).toBe(true);
      expect(isSafeImageUrl("img/cat.png")).toBe(true);
      expect(isSafeImageUrl("cat.png")).toBe(true);
    });

    it("blob URLs from URL.createObjectURL", () => {
      expect(
        isSafeImageUrl(
          "blob:https://app.example.com/123e4567-e89b-12d3-a456-426614174000",
        ),
      ).toBe(true);
    });

    it("data URLs for raster image formats", () => {
      expect(isSafeImageUrl("data:image/png;base64,iVBORw0K")).toBe(true);
      expect(isSafeImageUrl("data:image/jpeg;base64,/9j/4")).toBe(true);
      expect(isSafeImageUrl("data:image/jpg;base64,/9j/4")).toBe(true);
      expect(isSafeImageUrl("data:image/gif;base64,R0lGOD")).toBe(true);
      expect(isSafeImageUrl("data:image/webp;base64,UklGR")).toBe(true);
    });

    it("data URLs are case-insensitive on scheme", () => {
      expect(isSafeImageUrl("DATA:image/png;base64,xxx")).toBe(true);
    });
  });

  describe("blocks", () => {
    it("javascript: URLs", () => {
      expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
      // Whitespace-padded variant.
      expect(isSafeImageUrl("  javascript:alert(1)")).toBe(false);
      // Mixed case.
      expect(isSafeImageUrl("JavaScript:alert(1)")).toBe(false);
    });

    it("control-character obfuscated URLs", () => {
      expect(isSafeImageUrl("java\nscript:alert(1)")).toBe(false);
      expect(isSafeImageUrl("java\tscript:alert(1)")).toBe(false);
      expect(isSafeImageUrl("data\n:image/svg+xml,<svg onload=alert(1)>")).toBe(
        false,
      );
    });

    it("vbscript: URLs", () => {
      expect(isSafeImageUrl("vbscript:msgbox(1)")).toBe(false);
    });

    it("file: URLs", () => {
      expect(isSafeImageUrl("file:///etc/passwd")).toBe(false);
    });

    it("data:image/svg+xml (SVG can carry inline scripts)", () => {
      expect(
        isSafeImageUrl("data:image/svg+xml;utf8,<svg onload=alert(1)/>"),
      ).toBe(false);
      expect(isSafeImageUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    });

    it("data: URLs for non-image MIMEs", () => {
      expect(isSafeImageUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
      expect(isSafeImageUrl("data:application/javascript,alert(1)")).toBe(
        false,
      );
    });

    it("malformed data: URLs without a MIME", () => {
      expect(isSafeImageUrl("data:,hello")).toBe(false);
    });

    it("empty / whitespace / nullish strings", () => {
      expect(isSafeImageUrl("")).toBe(false);
      expect(isSafeImageUrl("   ")).toBe(false);
      // @ts-expect-error — runtime check covers non-string inputs.
      expect(isSafeImageUrl(null)).toBe(false);
      // @ts-expect-error — runtime check covers non-string inputs.
      expect(isSafeImageUrl(undefined)).toBe(false);
    });
  });
});

describe("sanitizeImageUrl", () => {
  it("returns the normalized URL when safe", () => {
    expect(sanitizeImageUrl(" https://example.com/cat.png ")).toBe(
      "https://example.com/cat.png",
    );
  });

  it("returns undefined when unsafe (so React omits the attribute)", () => {
    expect(sanitizeImageUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("returns undefined for nullish or empty input", () => {
    expect(sanitizeImageUrl(undefined)).toBeUndefined();
    expect(sanitizeImageUrl(null)).toBeUndefined();
    expect(sanitizeImageUrl("")).toBeUndefined();
  });
});
