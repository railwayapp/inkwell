import { describe, expect, it } from "vitest";
import { deserializeWithRanges } from "./deserialize";
import { serialize } from "./serialize";
import {
  createSourceCache,
  invalidateCacheEntry,
  populateSourceCacheFromParse,
} from "./source-cache";

function roundTrip(content: string): string {
  const cache = createSourceCache();
  const { nodes, ranges } = deserializeWithRanges(content);
  populateSourceCacheFromParse(cache, content, nodes, ranges);
  return serialize(nodes, { cache });
}

describe("source-cache — byte-perfect round-trip for untouched blocks", () => {
  it("preserves `> a\\n> b` (would otherwise normalize to `> a\\n>\\n> b`)", () => {
    const source = "> a\n> b";
    expect(roundTrip(source)).toBe(source);
  });

  it("preserves `* item` and `+ item` bullet chars", () => {
    expect(roundTrip("* one\n* two")).toBe("* one\n* two");
    expect(roundTrip("+ one\n+ two")).toBe("+ one\n+ two");
  });

  it("preserves blockquote with no separator between paragraphs", () => {
    const source = "> first paragraph\n> still first";
    expect(roundTrip(source)).toBe(source);
  });

  it("preserves source verbatim across mixed blocks", () => {
    const source = "# title\n\n> a\n> b\n\n* item\n* item";
    expect(roundTrip(source)).toBe(source);
  });
});

describe("source-cache — invalidation falls back to canonical form", () => {
  it("re-emits canonical form after a block is edited", () => {
    // Edit a blockquote: byte-perfect when untouched, canonical
    // (`> a\n>\n> b`) when invalidated.
    const source = "> a\n> b";
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);

    expect(serialize(nodes, { cache })).toBe(source);

    invalidateCacheEntry(cache, nodes[0].id);
    expect(serialize(nodes, { cache })).toBe("> a\n>\n> b");
  });

  it("preserves untouched siblings even when one block is invalidated", () => {
    const source = "first\n\n> a\n> b";
    const cache = createSourceCache();
    const { nodes, ranges } = deserializeWithRanges(source);
    populateSourceCacheFromParse(cache, source, nodes, ranges);

    const blockquote = nodes.find(n => n.type === "blockquote");
    if (!blockquote) throw new Error("expected blockquote");
    invalidateCacheEntry(cache, blockquote.id);

    expect(serialize(nodes, { cache })).toBe("first\n\n> a\n>\n> b");
  });
});

describe("source-cache — no cache argument", () => {
  it("serialize without a cache always emits canonical form", () => {
    const source = "> a\n> b";
    const { nodes } = deserializeWithRanges(source);
    expect(serialize(nodes)).toBe("> a\n>\n> b");
  });
});
