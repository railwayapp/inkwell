import type { InkwellFeatures, ResolvedInkwellFeatures } from "../../types";

export const DEFAULT_FEATURES: ResolvedInkwellFeatures = {
  heading1: true,
  heading2: true,
  heading3: true,
  heading4: true,
  heading5: true,
  heading6: true,
  lists: true,
  blockquotes: true,
  codeBlocks: true,
  images: true,
};

export const resolveFeatures = (
  features?: InkwellFeatures | Partial<ResolvedInkwellFeatures>,
): ResolvedInkwellFeatures => {
  if (!features) return DEFAULT_FEATURES;

  const maybeResolved = features as Partial<ResolvedInkwellFeatures>;
  const headings = (features as InkwellFeatures).headings;
  const headingOverrides =
    typeof headings === "object" && headings !== null ? headings : null;
  const allHeadings = typeof headings === "boolean" ? headings : true;

  return {
    heading1: maybeResolved.heading1 ?? headingOverrides?.h1 ?? allHeadings,
    heading2: maybeResolved.heading2 ?? headingOverrides?.h2 ?? allHeadings,
    heading3: maybeResolved.heading3 ?? headingOverrides?.h3 ?? allHeadings,
    heading4: maybeResolved.heading4 ?? headingOverrides?.h4 ?? allHeadings,
    heading5: maybeResolved.heading5 ?? headingOverrides?.h5 ?? allHeadings,
    heading6: maybeResolved.heading6 ?? headingOverrides?.h6 ?? allHeadings,
    lists: features.lists ?? true,
    blockquotes: features.blockquotes ?? true,
    codeBlocks: features.codeBlocks ?? true,
    images: features.images ?? true,
  };
};
