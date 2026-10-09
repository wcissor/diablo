/**
 * The attribution methods the benchmark compares, all applied to the same
 * simulated counts. Each returns the set of factors it blames for the drop
 * (empty: "no attributable cause"). Statistics come from src/lib/stats.ts and
 * the significance level from the validity rubric; nothing is reimplemented.
 */
import { holm, mcnemarExact, twoProportionZ } from "@/lib/stats";
import { THRESHOLDS } from "@/lib/validity";
import type { PairedCounts, SimulatedData } from "./scenario";

export type MethodId = "diablo" | "overall" | "unpaired" | "uncorrected" | "largest";

export const METHOD_IDS: MethodId[] = ["diablo", "overall", "unpaired", "uncorrected", "largest"];

export const METHOD_LABEL: Record<MethodId, string> = {
  diablo: "Diablo protocol",
  overall: "A. Overall before/after",
  unpaired: "B. Paired data, unpaired tests + Holm",
  uncorrected: "C. Paired, no correction",
  largest: "D. Largest observed drop",
};

/**
 * B′ is not a rule on the same counts but a different design: the same
 * scenario run with fresh items in every arm (see `freshItemsFor`), analysed
 * with B's unpaired tests and Holm. It is what a team that never pairs would do.
 */
export const UNPAIRED_DESIGN_LABEL = "B′. Unpaired design + Holm";
export const UNPAIRED_DESIGN_RULE =
  "A different design for the same scenario: every arm runs on fresh items, so the arms really are independent. Then B's rule: pooled two-proportion z-test per factor, Holm across the K tests, same blame rule.";

export const METHOD_RULE: Record<MethodId, string> = {
  diablo:
    "One experiment per factor on the same items; exact McNemar on each; Holm across the K experiments; blame a factor only if its Holm-adjusted p < 0.05 and its accuracy fell. Otherwise: no attributable cause.",
  overall:
    "Compare v1 with v2 only (exact McNemar on the same items, its best case). It can say that accuracy fell, never which factor caused it, so it attributes nothing.",
  unpaired:
    "The same paired per-factor experiments, analysed as if the arms were independent: pooled two-proportion z-test per factor, Holm across the K tests, same blame rule. This misreads the design (B′ below is the proper unpaired design).",
  uncorrected:
    "The same paired exact McNemar tests, but each judged at p < 0.05 on its own (no multiple-comparison correction); every factor that passes and fell is blamed.",
  largest:
    "Untested judgment: blame the factor whose experiment shows the largest observed drop, if any factor dropped at all; no test. Ties go to the factor listed first (the true cause's position is random).",
};

export interface Attribution {
  /** Indices of the factors blamed, ascending. */
  blamed: number[];
}

export interface OverallResult extends Attribution {
  /** The overall v1 → v2 drop is significant (exact McNemar p < 0.05, accuracy fell). */
  detected: boolean;
  p: number;
}

export interface DiabloResult extends Attribution {
  /** Exact McNemar p per experiment. */
  p: number[];
  /** Holm-adjusted p per experiment. */
  adjusted: number[];
}

const ALPHA = THRESHOLDS.alpha;
const fell = (e: PairedCounts) => e.kTreatment < e.kControl;
const indicesWhere = (xs: PairedCounts[], keep: (e: PairedCounts, j: number) => boolean) =>
  xs.flatMap((e, j) => (keep(e, j) ? [j] : []));

/** Diablo's measuring protocol. */
export function diablo(data: SimulatedData): DiabloResult {
  const p = data.experiments.map((e) => mcnemarExact(e.b, e.c));
  const adjusted = holm(p);
  return { blamed: indicesWhere(data.experiments, (e, j) => adjusted[j] < ALPHA && fell(e)), p, adjusted };
}

/** Baseline A: overall before/after only. */
export function overall(data: SimulatedData): OverallResult {
  const o = data.overall;
  const p = mcnemarExact(o.b, o.c);
  return { blamed: [], detected: p < ALPHA && fell(o), p };
}

/** Baseline B: per-factor tests that ignore the pairing, with Holm. */
export function unpaired(data: SimulatedData): Attribution & { adjusted: number[] } {
  const p = data.experiments.map((e) => twoProportionZ(e.kControl, e.n, e.kTreatment, e.n).p);
  const adjusted = holm(p);
  return { blamed: indicesWhere(data.experiments, (e, j) => adjusted[j] < ALPHA && fell(e)), adjusted };
}

/** Baseline C: paired tests, no multiple-comparison correction. */
export function uncorrected(data: SimulatedData): Attribution & { p: number[] } {
  const p = data.experiments.map((e) => mcnemarExact(e.b, e.c));
  return { blamed: indicesWhere(data.experiments, (e, j) => p[j] < ALPHA && fell(e)), p };
}

/** Baseline D: the largest observed drop, untested. */
export function largest(data: SimulatedData): Attribution {
  let best = -1;
  let bestDrop = 0;
  data.experiments.forEach((e, j) => {
    const drop = e.kControl - e.kTreatment;
    if (drop > bestDrop) {
      best = j;
      bestDrop = drop;
    }
  });
  return { blamed: best >= 0 ? [best] : [] };
}

export const METHODS: Record<MethodId, (data: SimulatedData) => Attribution> = {
  diablo,
  overall,
  unpaired,
  uncorrected,
  largest,
};

/** How an attribution compares with the planted truth. */
export type Outcome =
  /** Exactly the true cause, nothing else. */
  | "correct"
  /** At least one factor that did not cause the drop (with or without the true cause). */
  | "wrong"
  /** Nothing blamed although a cause exists. */
  | "missed"
  /** Nothing blamed, and nothing caused a drop. */
  | "quiet"
  /** Something blamed, but nothing caused a drop. */
  | "false-alarm";

export function score(blamed: number[], cause: number | null): Outcome {
  if (cause === null) return blamed.length ? "false-alarm" : "quiet";
  if (!blamed.length) return "missed";
  return blamed.length === 1 && blamed[0] === cause ? "correct" : "wrong";
}
