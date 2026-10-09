/**
 * Product name, legal identity and contact details.
 *
 * None of these are decided yet.
 * Keep every user-facing occurrence of the name and every legal detail here, so
 * the final choice is a one-line change. `npm run check:release` fails while any
 * value is still the placeholder.
 */
export const PLACEHOLDER = "[to be completed]";

export const BRAND = {
  /** Working name used in the code. The project document calls it "Amaranth"; the final name is open. */
  name: "Diablo AI",
  shortName: "Diablo",
  tagline: "Investigate intelligence.",
  description:
    "Diablo AI lets companies understand what is actually happening inside their AI systems: which change moved a score, and how sure they can be.",

  /** Legal and contact details: placeholders until the owner decides. */
  legalEntity: PLACEHOLDER,
  address: PLACEHOLDER,
  contactEmail: PLACEHOLDER,
  governingLaw: PLACEHOLDER,
  /** Ownership of outputs and the operating licence (Terms, "Intellectual property"). */
  ipTerms: PLACEHOLDER,

  /** Shown as "Last updated" on the legal pages. */
  legalLastUpdated: "2026-10-07",
  version: "0.2.0",
} as const;

export const isPlaceholder = (value: string) => value === PLACEHOLDER;
