/**
 * Runs the planted-cause benchmark over the scenario grid and tallies how
 * each method's attribution compares with the planted truth. Deterministic:
 * the same config gives the same numbers on every run.
 */
import { analyzeExperiment } from "@/lib/data/derive";
import { appVerdictBlames, intervalOnlyBlames, toInvestigation } from "./bridge";
import { EXAMPLE_SPECS, findExample, type Example } from "./examples";
import { METHOD_IDS, METHODS, overall, score, unpaired, type MethodId, type Outcome } from "./methods";
import { freshItemsFor, GRID, scenarioFor, trueDeltas, type Cell } from "./scenario";

export interface BenchConfig {
  /** Replicates per grid cell for the attribution metrics. */
  reps: number;
  /** Replicates per cell (the first ones) whose per-experiment 95% CIs are checked for coverage. */
  coverageReps: number;
}

/** The configuration docs/BENCHMARK.md is generated with. */
export const BENCH_CONFIG: BenchConfig = { reps: 1000, coverageReps: 50 };

export interface Tally {
  scenarios: number;
  correct: number;
  wrong: number;
  missed: number;
  quiet: number;
  falseAlarm: number;
  /** No-cause scenarios where v2 happened to score below v1 overall (a drop a team would investigate). */
  dropSeen: number;
  /** False alarms among those. */
  falseAlarmAfterDrop: number;
}

export interface Coverage {
  /** Experiments whose factor is the true cause. */
  cause: { intervals: number; covered: number; widthSum: number };
  /** Experiments whose factor changed nothing (true Δ = 0). */
  inert: { intervals: number; covered: number; widthSum: number };
}

/**
 * The app's own verdicts on the coverage replicates (where every experiment's
 * bootstrap CI is computed anyway): the investigation the app would hold is
 * built from the counts and each hypothesis gets `verdictFor`'s verdict.
 */
export interface VerdictCheck {
  /** The protocol (the "Diablo protocol" row), on the same scenarios. */
  protocol: Tally;
  /** The factors whose hypothesis the app marks "supported". */
  app: Tally;
  /** The app's verdict rule before 9 Oct 2026: the CI alone, Holm only a warning. */
  intervalOnly: Tally;
  /** Baseline C on the same scenarios, for comparison. */
  uncorrected: Tally;
  /** Scenarios where the app's verdicts blamed exactly the factors the protocol blamed. */
  appMatchesProtocol: number;
}

export interface CellResult {
  cell: Cell;
  methods: Record<MethodId, Tally>;
  /** B′: the same scenarios run as an unpaired design (fresh items per arm); null in sensitivity runs. */
  unpairedDesign: Tally | null;
  /** Baseline A: the overall v1 → v2 drop was significant. */
  overallDetected: number;
  coverage: Coverage;
  verdicts: VerdictCheck;
}

/** Sensitivity run: one cell, the latent item correlation fixed at each level. */
export const SENSITIVITY = { cell: { K: 3, effectPP: 10, n: 80 }, rho: [0, 0.5, 0.8, 0.95] } as const;

export interface BenchResult {
  config: BenchConfig;
  cells: CellResult[];
  sensitivity: CellResult[];
  /** One per entry of EXAMPLE_SPECS, null when no replicate matched. */
  examples: (Example | null)[];
}

export const emptyTally = (): Tally => ({
  scenarios: 0,
  correct: 0,
  wrong: 0,
  missed: 0,
  quiet: 0,
  falseAlarm: 0,
  dropSeen: 0,
  falseAlarmAfterDrop: 0,
});

const emptyCoverage = (): Coverage => ({
  cause: { intervals: 0, covered: 0, widthSum: 0 },
  inert: { intervals: 0, covered: 0, widthSum: 0 },
});

const emptyVerdicts = (): VerdictCheck => ({
  protocol: emptyTally(),
  app: emptyTally(),
  intervalOnly: emptyTally(),
  uncorrected: emptyTally(),
  appMatchesProtocol: 0,
});

const OUTCOME_FIELD: Record<Outcome, keyof Tally> = {
  correct: "correct",
  wrong: "wrong",
  missed: "missed",
  quiet: "quiet",
  "false-alarm": "falseAlarm",
};

export function cells(): Cell[] {
  const out: Cell[] = [];
  for (const K of GRID.K) for (const effectPP of GRID.effectPP) for (const n of GRID.n) out.push({ K, effectPP, n });
  return out;
}

/** Count one scenario's attribution in a tally. */
function record(t: Tally, blamed: number[], cause: number | null, dropSeen: boolean): void {
  const outcome = score(blamed, cause);
  t.scenarios++;
  t[OUTCOME_FIELD[outcome]]++;
  if (dropSeen) {
    t.dropSeen++;
    if (outcome === "false-alarm") t.falseAlarmAfterDrop++;
  }
}

const sameFactors = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Benchmark one cell: every method on `reps` replicates (B′ on the same
 * scenarios run with fresh items, unless `freshItems` is false), and on the
 * first `coverageReps` the CI coverage and the app's own verdicts.
 */
export function runCell(cell: Cell, { reps, coverageReps }: BenchConfig, { freshItems = true } = {}): CellResult {
  const methods = Object.fromEntries(METHOD_IDS.map((m) => [m, emptyTally()])) as Record<MethodId, Tally>;
  const unpairedDesign = freshItems ? emptyTally() : null;
  const coverage = emptyCoverage();
  const verdicts = emptyVerdicts();
  let overallDetected = 0;
  for (let rep = 0; rep < reps; rep++) {
    const data = scenarioFor(cell, rep);
    const cause = data.scenario.cause;
    const dropSeen = cause === null && data.overall.kTreatment < data.overall.kControl;
    const blamed = Object.fromEntries(METHOD_IDS.map((m) => [m, METHODS[m](data).blamed])) as Record<MethodId, number[]>;
    for (const m of METHOD_IDS) record(methods[m], blamed[m], cause, dropSeen);
    if (overall(data).detected) overallDetected++;
    if (unpairedDesign) {
      const fresh = freshItemsFor(cell, rep);
      record(unpairedDesign, unpaired(fresh).blamed, fresh.scenario.cause, cause === null && fresh.overall.kTreatment < fresh.overall.kControl);
    }
    if (rep < coverageReps) {
      // The investigation the app would hold: its runs are seeded by their ids, as in the app.
      const inv = toInvestigation(data, rep);
      const truth = trueDeltas(data.scenario);
      inv.experiments.forEach((exp, j) => {
        // Diablo's own analysis of a paired run: the seeded paired bootstrap (2,000 resamples).
        const [lo, hi] = analyzeExperiment(exp)!.diffCI;
        const bucket = j === cause ? coverage.cause : coverage.inert;
        bucket.intervals++;
        if (lo <= truth[j] && truth[j] <= hi) bucket.covered++;
        bucket.widthSum += hi - lo;
      });
      const app = appVerdictBlames(inv);
      record(verdicts.protocol, blamed.diablo, cause, dropSeen);
      record(verdicts.app, app, cause, dropSeen);
      record(verdicts.intervalOnly, intervalOnlyBlames(inv), cause, dropSeen);
      record(verdicts.uncorrected, blamed.uncorrected, cause, dropSeen);
      if (sameFactors(app, blamed.diablo)) verdicts.appMatchesProtocol++;
    }
  }
  return { cell, methods, unpairedDesign, overallDetected, coverage, verdicts };
}

export function runBenchmark(config: BenchConfig = BENCH_CONFIG): BenchResult {
  return {
    config,
    cells: cells().map((cell) => runCell(cell, config)),
    sensitivity: SENSITIVITY.rho.map((rho) =>
      runCell({ ...SENSITIVITY.cell, rho }, { ...config, coverageReps: 0 }, { freshItems: false }),
    ),
    examples: EXAMPLE_SPECS.map((spec) => findExample(spec, config.reps)),
  };
}

/* ── Pooling ───────────────────────────────────────────────────── */

export type CellFilter = (c: Cell) => boolean;

/** Sum a tally over the grid cells that pass `keep`; `get` picks the tally from a cell (null: skip). */
export function poolTally(result: BenchResult, get: (r: CellResult) => Tally | null, keep: CellFilter): Tally {
  const out = emptyTally();
  for (const r of result.cells) {
    if (!keep(r.cell)) continue;
    const t = get(r);
    if (!t) continue;
    for (const k of Object.keys(out) as (keyof Tally)[]) out[k] += t[k];
  }
  return out;
}

export function pool(result: BenchResult, method: MethodId, keep: CellFilter): Tally {
  return poolTally(result, (r) => r.methods[method], keep);
}

/** B′, the unpaired design. */
export function poolUnpairedDesign(result: BenchResult, keep: CellFilter): Tally {
  return poolTally(result, (r) => r.unpairedDesign, keep);
}

/** The verdict check on the coverage replicates. */
export function poolVerdicts(result: BenchResult, keep: CellFilter): VerdictCheck {
  const tally = (k: Exclude<keyof VerdictCheck, "appMatchesProtocol">) => poolTally(result, (r) => r.verdicts[k], keep);
  return {
    protocol: tally("protocol"),
    app: tally("app"),
    intervalOnly: tally("intervalOnly"),
    uncorrected: tally("uncorrected"),
    appMatchesProtocol: result.cells.filter((r) => keep(r.cell)).reduce((n, r) => n + r.verdicts.appMatchesProtocol, 0),
  };
}

export function poolDetected(result: BenchResult, keep: CellFilter): { detected: number; scenarios: number } {
  let detected = 0;
  let scenarios = 0;
  for (const r of result.cells) {
    if (!keep(r.cell)) continue;
    detected += r.overallDetected;
    scenarios += r.methods.overall.scenarios;
  }
  return { detected, scenarios };
}

export function poolCoverage(result: BenchResult, keep: CellFilter): Coverage {
  const out = emptyCoverage();
  for (const r of result.cells) {
    if (!keep(r.cell)) continue;
    for (const k of ["cause", "inert"] as const) {
      out[k].intervals += r.coverage[k].intervals;
      out[k].covered += r.coverage[k].covered;
      out[k].widthSum += r.coverage[k].widthSum;
    }
  }
  return out;
}

export const withCause: CellFilter = (c) => c.effectPP > 0;
export const noCause: CellFilter = (c) => c.effectPP === 0;
export const and =
  (...fs: CellFilter[]): CellFilter =>
  (c) =>
    fs.every((f) => f(c));
