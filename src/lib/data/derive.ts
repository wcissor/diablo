/**
 * Everything computed from stored counts: rates, intervals, tests, effect
 * sizes, verdicts and statuses. Nothing here is stored; call these at render.
 */
import {
  bootstrapDiffCI,
  cohensH,
  fisherExact,
  holm,
  mcnemarExact,
  newcombe,
  pairsFromTable,
  twoProportionZ,
  wilson,
  type Interval,
} from "@/lib/stats";
import type { Counts, Experiment, Hypothesis, Investigation, InvestigationStatus, Run } from "./types";

/** FNV-1a 32-bit hash: a stable seed from a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface ArmResult {
  k: number;
  n: number;
  rate: number;
  ci: Interval;
}

export type TestName = "Two-proportion z-test" | "Fisher's exact test" | "Exact McNemar test";

export interface RunResult {
  run: Run;
  control: ArmResult;
  treatment: ArmResult;
  /** treatment − control */
  diff: number;
  diffCI: Interval;
  diffCIMethod: "Newcombe hybrid score" | "Paired bootstrap (2,000 resamples, seeded)";
  test: TestName;
  /** e.g. "z = 2.41" or "b = 30, c = 64" */
  statistic: string;
  p: number;
  cohensH: number;
  /** The 95% CI of Δ excludes zero. */
  effectFound: boolean;
}

const arm = ({ k, n }: Counts): ArmResult => ({ k, n, rate: n ? k / n : NaN, ci: wilson(k, n) });

// Runs are immutable in the store (an update replaces the object), so caching per object is safe.
const cache = new WeakMap<Run, { pairing: string; result: RunResult | null }>();

/** Analyse one finished run. Returns null while it has no counts. */
export function analyzeRun(run: Run, pairing: "paired" | "independent"): RunResult | null {
  const hit = cache.get(run);
  if (hit && hit.pairing === pairing) return hit.result;
  const result = computeRun(run, pairing);
  cache.set(run, { pairing, result });
  return result;
}

function computeRun(run: Run, pairing: "paired" | "independent"): RunResult | null {
  if (!run.counts || run.finishedAt === null) return null;
  const c = arm(run.counts.control);
  const t = arm(run.counts.treatment);
  const diff = t.rate - c.rate;
  const h = cohensH(c.rate, t.rate);

  if (pairing === "paired" && run.discordant && c.n === t.n) {
    const { b, c: cc } = run.discordant;
    const a = c.k - b;
    const d = c.n - a - b - cc;
    const pairs = pairsFromTable(a, b, cc, d);
    const ci = bootstrapDiffCI(pairs.control, pairs.treatment, { paired: true, seed: hashString(run.id) });
    const p = mcnemarExact(b, cc);
    return {
      run,
      control: c,
      treatment: t,
      diff,
      diffCI: ci,
      diffCIMethod: "Paired bootstrap (2,000 resamples, seeded)",
      test: "Exact McNemar test",
      statistic: `b = ${b}, c = ${cc}`,
      p,
      cohensH: h,
      effectFound: ci[0] > 0 || ci[1] < 0,
    };
  }

  const ci = newcombe(c.k, c.n, t.k, t.n);
  // Fisher's exact test when any expected cell count is below 5.
  const total = c.n + t.n;
  const pos = c.k + t.k;
  const neg = total - pos;
  const minExpected = Math.min((c.n * pos) / total, (c.n * neg) / total, (t.n * pos) / total, (t.n * neg) / total);
  if (minExpected < 5) {
    const p = fisherExact([
      [t.k, t.n - t.k],
      [c.k, c.n - c.k],
    ]);
    return {
      run,
      control: c,
      treatment: t,
      diff,
      diffCI: ci,
      diffCIMethod: "Newcombe hybrid score",
      test: "Fisher's exact test",
      statistic: `table [[${t.k}, ${t.n - t.k}], [${c.k}, ${c.n - c.k}]]`,
      p,
      cohensH: h,
      effectFound: ci[0] > 0 || ci[1] < 0,
    };
  }
  const { z, p } = twoProportionZ(c.k, c.n, t.k, t.n);
  return {
    run,
    control: c,
    treatment: t,
    diff,
    diffCI: ci,
    diffCIMethod: "Newcombe hybrid score",
    test: "Two-proportion z-test",
    statistic: `z = ${z.toFixed(2).replace("-", "−")}`,
    p,
    cohensH: h,
    effectFound: ci[0] > 0 || ci[1] < 0,
  };
}

export const primaryRun = (e: Experiment) => e.runs.find((r) => r.role === "primary") ?? null;
export const replicationRuns = (e: Experiment) => e.runs.filter((r) => r.role === "replication");

export function analyzeExperiment(e: Experiment): RunResult | null {
  const run = primaryRun(e);
  return run ? analyzeRun(run, e.design.pairing) : null;
}

export const isFinished = (e: Experiment) => e.status === "complete" && analyzeExperiment(e) !== null;
export const finishedExperiments = (inv: Investigation) => inv.experiments.filter(isFinished);

/** Holm-adjusted p for every finished primary experiment, keyed by experiment id. */
export function holmAdjusted(inv: Investigation): Map<string, number> {
  const rows = finishedExperiments(inv)
    .filter((e) => e.design.primary)
    .map((e) => ({ id: e.id, p: analyzeExperiment(e)!.p }));
  const adj = holm(rows.map((r) => r.p));
  return new Map(rows.map((r, i) => [r.id, adj[i]]));
}

/** Significance level after the Holm correction (the validity rubric's check C7). */
export const ALPHA = 0.05;

/**
 * Does this experiment survive the Holm correction across the investigation's
 * primary tests (check C7)? A secondary analysis or a single primary test is
 * outside the correction, so it always does. `adjusted` is `holmAdjusted(inv)`.
 */
export function survivesHolm(adjusted: Map<string, number>, e: Experiment): boolean {
  const a = adjusted.get(e.id);
  return a === undefined || adjusted.size <= 1 || a < ALPHA;
}

export type Verdict = "supported" | "partly-supported" | "rejected" | "untested";

/**
 * Does one result agree with what the hypothesis predicted? A predicted
 * increase or decrease needs an effect: the 95% CI excludes zero in the
 * predicted direction and, among several primary tests, the result survives
 * the Holm correction. An effect that does not survive it supports neither a
 * direction nor "no difference".
 */
function agrees(h: Hypothesis, r: RunResult, corrected: boolean): boolean {
  if (h.prediction === "no-difference") return !r.effectFound;
  if (!r.effectFound || !corrected) return false;
  return h.prediction === "increase" ? r.diff > 0 : r.diff < 0;
}

export interface VerdictResult {
  verdict: Verdict;
  experiments: Experiment[];
  /** Linked experiments whose CI excludes zero but which do not survive the Holm correction (C7 warns). */
  failsHolm: Experiment[];
}

/** Verdict from the hypothesis's finished experiments, never assigned by hand. */
export function verdictFor(inv: Investigation, h: Hypothesis): VerdictResult {
  const linked = inv.experiments.filter((e) => e.hypothesisId === h.id);
  const results = linked.flatMap((e) => {
    const r = analyzeExperiment(e);
    return r ? [{ e, r }] : [];
  });
  if (!results.length) return { verdict: "untested", experiments: linked, failsHolm: [] };
  const adjusted = holmAdjusted(inv);
  const checked = results.map(({ e, r }) => ({ e, r, corrected: survivesHolm(adjusted, e) }));
  const ok = checked.filter(({ r, corrected }) => agrees(h, r, corrected)).length;
  const verdict: Verdict = ok === results.length ? "supported" : ok === 0 ? "rejected" : "partly-supported";
  const failsHolm = checked.filter(({ r, corrected }) => r.effectFound && !corrected).map(({ e }) => e);
  return { verdict, experiments: linked, failsHolm };
}

/** Status is derived from the experiments, so it can never go stale. */
export function investigationStatus(inv: Investigation): InvestigationStatus {
  if (inv.failed || inv.experiments.some((e) => e.status === "failed")) return "failed";
  if (inv.experiments.some((e) => e.status === "running")) return "running";
  const done = finishedExperiments(inv);
  if (!done.length) return "draft";
  const flagged = done.some((e) => e.runs.some((r) => r.samples.some((s) => s.flagged)));
  if (flagged) return "needs-review";
  const primaries = done.filter((e) => e.design.primary);
  const allReplicated =
    primaries.length > 0 && primaries.every((e) => replicationRuns(e).some((r) => r.finishedAt !== null));
  return allReplicated ? "replicated" : "complete";
}

/** Progress of a running run, derived from the clock (never mutated by a ticker). */
export function runProgress(run: Run, now: number): number {
  if (run.finishedAt) return 1;
  const start = Date.parse(run.startedAt);
  return Math.max(0, Math.min(0.99, (now - start) / run.expectedDurationMs));
}

export const totalSamples = (inv: Investigation) =>
  finishedExperiments(inv).reduce((n, e) => {
    const r = analyzeExperiment(e)!;
    return n + r.control.n + r.treatment.n;
  }, 0);

/** Recorded from a live run on a real model (src/lib/live), not simulated by the demo provider. */
export const isLiveInvestigation = (inv: Investigation) =>
  inv.experiments.length > 0 && inv.experiments.every((e) => e.simulation === null && e.runs.every((r) => r.samples.every((s) => !s.simulated)));
