/** Terms and Privacy. Inventory and open items: `docs/legal/data-inventory.md`. */
export const LEGAL_LAST_UPDATED = "3 November 2026";

/**
 * "Draft, pending legal review." Shown outside production builds, or in a
 * production build with `NEXT_PUBLIC_LEGAL_DRAFT_BANNER=1` (e.g. a preview deploy).
 */
export const SHOW_LEGAL_DRAFT_BANNER =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_LEGAL_DRAFT_BANNER === "1";

/**
 * Bracketed values still open on the legal pages (also listed in the inventory).
 * Filled already: legal name, address, privacy@, age 18, notice 30 days.
 */
export const LEGAL_PLACEHOLDERS = {
  legalName: "Alex Maragakis, trading as Consciously",
  postalAddress: "Weave Coworking, Cotton Works, Wigan WN3 5EX",
  contactEmail: "privacy@consciously.live",
  minimumAge: "18",
  refundTerms: "[REFUND TERMS]",
  icoNumber: "[ICO REGISTRATION NUMBER]",
  noticePeriod: "30 days",
  algoliaRegion: "[ALGOLIA REGION]",
} as const;
