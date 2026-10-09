/**
 * Renders docs/BENCHMARK.md from a benchmark result. Every number in the
 * report comes from the result object, and every sentence that compares
 * numbers is chosen from the numbers, so the prose cannot drift from the data.
 * The output has no dates or machine details, so the same config always
 * renders the same file (src/lib/bench/benchmark.test.ts checks the committed
 * copy).
 */
import { formatP, formatPct, formatPP, wilson } from "@/lib/stats";
import { THRESHOLDS } from "@/lib/validity";
import {
  and,
  noCause,
  pool,
  poolCoverage,
  poolDetected,
  poolUnpairedDesign,
  poolVerdicts,
  SENSITIVITY,
  withCause,
  type BenchResult,
  type CellFilter,
  type CellResult,
  type Tally,
} from "./benchmark";
import type { Analysis, Example } from "./examples";
import {
  METHOD_IDS,
  METHOD_LABEL,
  METHOD_RULE,
  UNPAIRED_DESIGN_LABEL,
  UNPAIRED_DESIGN_RULE,
  type MethodId,
  type Outcome,
} from "./methods";
import { cellKey, GRID, NUISANCE, type Cell } from "./scenario";

const ATTRIBUTING: MethodId[] = ["diablo", "unpaired", "uncorrected", "largest"];
const SHORT: Record<MethodId, string> = {
  diablo: "Diablo",
  overall: "A. Overall",
  unpaired: "B. Unpaired test",
  uncorrected: "C. Uncorrected",
  largest: "D. Largest drop",
};

/** A column of the pooled result tables: a method on the paired data, or B′ (its own design). */
interface Column {
  short: string;
  tally: (result: BenchResult, keep: CellFilter) => Tally;
}
const COLUMNS: Column[] = [
  { short: SHORT.diablo, tally: (r, k) => pool(r, "diablo", k) },
  { short: SHORT.unpaired, tally: (r, k) => pool(r, "unpaired", k) },
  { short: "B′. Unpaired design", tally: poolUnpairedDesign },
  { short: SHORT.uncorrected, tally: (r, k) => pool(r, "uncorrected", k) },
  { short: SHORT.largest, tally: (r, k) => pool(r, "largest", k) },
];

const int = (x: number) => x.toLocaleString("en-US");
const pct = (k: number, n: number) => (n ? formatPct(k / n) : "–");
const pctCI = (k: number, n: number) => {
  const [lo, hi] = wilson(k, n);
  return `${formatPct(k / n)} (${(lo * 100).toFixed(1)} to ${(hi * 100).toFixed(1)})`;
};
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
const header = (cells: string[], align?: string[]) =>
  [row(cells), row(align ?? cells.map((_, i) => (i === 0 ? "---" : "---:")))].join("\n");

const byCell =
  (want: Partial<Cell>): CellFilter =>
  (c) =>
    (want.K === undefined || c.K === want.K) &&
    (want.effectPP === undefined || c.effectPP === want.effectPP) &&
    (want.n === undefined || c.n === want.n);

/** Scenarios where the method named something, and the share of those where it named exactly the true cause. */
export function namedRight(t: Tally): { named: number; right: number } {
  return { named: t.correct + t.wrong + t.falseAlarm, right: t.correct };
}

export interface Split {
  cause: Tally;
  none: Tally;
  all: Tally;
}

export interface Headline {
  scenarios: number;
  withCause: number;
  noCause: number;
  method: Record<MethodId, Split>;
  /** B′, the unpaired design, on the same scenarios run with fresh items. */
  unpairedDesign: Split;
  overallDetected: { detected: number; scenarios: number };
  overallFalseAlarm: { detected: number; scenarios: number };
}

const split = (tally: (keep: CellFilter) => Tally): Split => ({
  cause: tally(withCause),
  none: tally(noCause),
  all: tally(() => true),
});

export function headline(result: BenchResult): Headline {
  const method = Object.fromEntries(METHOD_IDS.map((m) => [m, split((keep) => pool(result, m, keep))])) as Headline["method"];
  return {
    scenarios: method.diablo.all.scenarios,
    withCause: method.diablo.cause.scenarios,
    noCause: method.diablo.none.scenarios,
    method,
    unpairedDesign: split((keep) => poolUnpairedDesign(result, keep)),
    overallDetected: poolDetected(result, withCause),
    overallFalseAlarm: poolDetected(result, noCause),
  };
}

/**
 * How many times `a` is `b` (both k of n), with the range the two 95% Wilson
 * intervals allow (low a / high b to high a / low b), so a ratio that rests
 * on a few hundred events is not quoted more precisely than it is known.
 */
export function ratioRange(a: { k: number; n: number }, b: { k: number; n: number }): { point: number; lo: number; hi: number } {
  const [aLo, aHi] = wilson(a.k, a.n);
  const [bLo, bHi] = wilson(b.k, b.n);
  return { point: a.k / a.n / (b.k / b.n), lo: aLo / bHi, hi: aHi / bLo };
}

/* ── Sections ──────────────────────────────────────────────────── */

function headlineRow(label: string, t: Split): string {
  const nr = namedRight(t.all);
  return row([
    label,
    pctCI(t.cause.correct, t.cause.scenarios),
    pctCI(t.cause.wrong, t.cause.scenarios),
    pctCI(t.cause.missed, t.cause.scenarios),
    pctCI(t.none.falseAlarm, t.none.scenarios),
    `${pct(nr.right, nr.named)} of ${int(nr.named)}`,
  ]);
}

function headlineSection(result: BenchResult, h: Headline): string {
  const d = h.method.diablo;
  const D = h.method.largest;
  const C = h.method.uncorrected;
  const dn = namedRight(d.all);
  const Dn = namedRight(D.all);
  const lines = [
    "## Headline",
    "",
    `${int(h.scenarios)} simulated updates (${int(h.withCause)} with one true cause, ${int(h.noCause)} where no factor changed accuracy), every method on identical data. Rates are shares of scenarios; brackets are 95% Wilson intervals for the Monte Carlo error.`,
    "",
    header(
      [
        "Method",
        "Right cause named (a cause exists)",
        "Innocent factor blamed (a cause exists)",
        "Nothing named (a cause exists)",
        "Cause named when none exists",
        "When it named a cause, it was exactly the right one",
      ],
      ["---", "---:", "---:", "---:", "---:", "---:"],
    ),
    ...METHOD_IDS.flatMap((m) => {
      if (m === "overall") return [row([METHOD_LABEL[m], "cannot attribute", "0%", "100%", "0%", "never names one"])];
      const out = [headlineRow(METHOD_LABEL[m], h.method[m])];
      if (m === "unpaired") out.push(headlineRow(UNPAIRED_DESIGN_LABEL, h.unpairedDesign));
      return out;
    }),
    "",
    `The last column pools all ${int(h.scenarios)} scenarios (${pct(h.noCause, h.scenarios)} of them with no cause): of the scenarios where the method named something, the share where it named exactly the true cause. B′ is the one row on different data: the same scenarios run with fresh items in every arm (see Methods).`,
    "",
    "What this says:",
    "",
    `- **Diablo's claims hold up.** When the protocol named a cause, it was exactly the true cause in ${pct(dn.right, dn.named)} of cases. When no factor had any effect, it named a cause in ${pct(d.none.falseAlarm, d.none.scenarios)} of scenarios. Untested judgment (D: blame the largest observed drop) named a cause in ${pct(D.none.falseAlarm, D.none.scenarios)} of those scenarios, and its named causes were right ${pct(Dn.right, Dn.named)} of the time.`,
    verdictBullet(result),
    `- **The price is power.** Diablo named the true cause in ${pct(d.cause.correct, d.cause.scenarios)} of scenarios that had one; D named it in ${pct(D.cause.correct, D.cause.scenarios)}, because D names a factor whenever any factor's accuracy fell. When the evidence is thin, Diablo says "no attributable cause" instead of guessing (${pct(d.cause.missed, d.cause.scenarios)} of scenarios with a cause), which is a request for more items rather than a wrong answer. The tables below show where that happens: small effects with few items.`,
    pairingBullet(result, h),
    `- **The correction buys trust.** Paired tests without Holm (C) find more (${pct(C.cause.correct, C.cause.scenarios)}), but blame an innocent factor ${ratio({ k: C.cause.wrong, n: C.cause.scenarios }, { k: d.cause.wrong, n: d.cause.scenarios })} as often as Diablo (${pct(C.cause.wrong, C.cause.scenarios)} against ${pct(d.cause.wrong, d.cause.scenarios)}) and raise ${ratio({ k: C.none.falseAlarm, n: C.none.scenarios }, { k: d.none.falseAlarm, n: d.none.scenarios })} as many false alarms when nothing changed (${pct(C.none.falseAlarm, C.none.scenarios)} against ${pct(d.none.falseAlarm, d.none.scenarios)}). The ranges come from the two rates' 95% Monte Carlo intervals: these seeds give one draw, and the false-alarm rates rest on a few hundred events.`,
    `- **A before/after comparison (A) cannot attribute at all.** It flagged the overall drop in ${pct(h.overallDetected.detected, h.overallDetected.scenarios)} of scenarios with a cause, and never says which change to revert.`,
  ];
  return lines.join("\n");
}

function pairingBullet(result: BenchResult, h: Headline): string {
  const d = h.method.diablo;
  const B = h.method.unpaired;
  const P = h.unpairedDesign;
  const rate = (t: Tally, k: "correct" | "wrong" | "falseAlarm") => t[k] / t.scenarios;
  const misread = `B analyses Diablo's paired counts as if the arms were independent, which overstates the noise: it named the true cause in ${pct(B.cause.correct, B.cause.scenarios)} of scenarios with a cause${
    rate(B.cause, "wrong") < rate(d.cause, "wrong") && rate(B.none, "falseAlarm") < rate(d.none, "falseAlarm")
      ? `, and its lower error rates (${pct(B.cause.wrong, B.cause.scenarios)} innocent factors blamed, ${pct(B.none.falseAlarm, B.none.scenarios)} false alarms) are the same over-caution`
      : ""
  }.`;
  // Where a proper unpaired design does better than the paired one.
  const rows = causeRows().filter((c) => {
    const keep = byCell(c);
    return rate(poolUnpairedDesign(result, keep), "correct") > rate(pool(result, "diablo", keep), "correct");
  });
  const maxDiablo = Math.max(...rows.map((c) => rate(pool(result, "diablo", byCell(c)), "correct")));
  const where = rows.length
    ? ` B′ does find more than Diablo in ${rows.length} of the ${causeRows().length} drop-and-n rows of the power table (${rows.map((c) => `${c.effectPP} pp at n = ${c.n}`).join(", ")}), where Diablo names the cause in at most ${formatPct(maxDiablo)}: with that little evidence, the exact McNemar test's caution costs more than pairing gains (the sensitivity table shows the same at ρ = 0).`
    : " B′ finds less than Diablo in every drop-and-n row of the power table.";
  const fair = `The fair comparison is a design that never pairs (B′: fresh items in every arm, the same tests). It named the true cause in ${pct(P.cause.correct, P.cause.scenarios)} against Diablo's ${pct(d.cause.correct, d.cause.scenarios)}, blamed an innocent factor in ${pct(P.cause.wrong, P.cause.scenarios)} against ${pct(d.cause.wrong, d.cause.scenarios)}, and raised ${pct(P.none.falseAlarm, P.none.scenarios)} false alarms against ${pct(d.none.falseAlarm, d.none.scenarios)}.${where}`;
  const label = rate(P.cause, "correct") < rate(d.cause, "correct") ? "Pairing buys power." : "Pairing did not buy power here.";
  return `- **${label}** ${fair} ${misread}`;
}

/** "2.7 times (2.3 to 3.2)": the ratio of two rates and the range their 95% Monte Carlo intervals allow. */
function ratio(a: { k: number; n: number }, b: { k: number; n: number }): string {
  if (!(b.k > 0)) return "far more often";
  const r = ratioRange(a, b);
  return `${r.point.toFixed(1)} times (${r.lo.toFixed(1)} to ${r.hi.toFixed(1)})`;
}

/** The app's own verdicts, pooled over the coverage replicates: all, with a cause, without one. */
function verdictSplits(result: BenchResult) {
  const all = poolVerdicts(result, () => true);
  const cause = poolVerdicts(result, withCause);
  const none = poolVerdicts(result, noCause);
  const of = (k: "protocol" | "app" | "intervalOnly" | "uncorrected"): Split => ({ cause: cause[k], none: none[k], all: all[k] });
  return {
    scenarios: all.app.scenarios,
    matches: all.appMatchesProtocol,
    protocol: of("protocol"),
    app: of("app"),
    intervalOnly: of("intervalOnly"),
    uncorrected: of("uncorrected"),
  };
}

const more = (a: number, b: number) => (a > b ? "more than" : a < b ? "fewer than" : "as many as");

/** The app's own verdicts against the protocol, and the rule they replaced. */
function verdictBullet(result: BenchResult): string {
  const v = verdictSplits(result);
  const old = v.intervalOnly;
  const C = v.uncorrected;
  const fa = (t: Split) => t.none.falseAlarm / t.none.scenarios;
  const wrong = (t: Split) => t.cause.wrong / t.cause.scenarios;
  return `- **The benchmark caught a gap in the app, now fixed.** The app's hypothesis verdicts used to say "supported" whenever the confidence interval excluded zero, and showed a failed Holm check (C7) only as a warning. On the ${int(v.scenarios)} scenarios where the benchmark also computes every interval, that rule blamed an innocent factor in ${pct(old.cause.wrong, old.cause.scenarios)} of scenarios with a cause and raised false alarms in ${pct(old.none.falseAlarm, old.none.scenarios)} of those without one: ${more(fa(old), fa(C))} paired tests with no correction at all (C: ${pct(C.cause.wrong, C.cause.scenarios)} and ${pct(C.none.falseAlarm, C.none.scenarios)}${wrong(old) > wrong(C) ? "" : ", though C blamed innocent factors at least as often"}). A verdict now also needs the effect to survive Holm, and the app's verdicts blamed exactly the protocol's factors in ${int(v.matches)} of those ${int(v.scenarios)} scenarios (see "The app's verdicts").`;
}

function reproduceSection(result: BenchResult): string {
  return [
    "## Reproduce",
    "",
    "```bash",
    "npm install",
    "npm run bench                                    # regenerates this file",
    "npm run bench -- --check                         # exits 1 if this file is stale",
    "npm run bench -- --scenario K=4,d=10,n=80,r=0    # prints one scenario: counts, p-values, every method's verdict",
    "npm test                                         # src/lib/bench/*.test.ts: generator, methods, and the pinned numbers",
    "```",
    "",
    `Configuration: ${int(result.config.reps)} replicates per grid cell for attribution; per-experiment confidence intervals checked on the first ${int(result.config.coverageReps)} replicates of each cell (the paired bootstrap is the slow part). No model calls and no network: the whole run is arithmetic on seeded random numbers.`,
  ].join("\n");
}

function worldSection(result: BenchResult): string {
  const cellsN = GRID.K.length * GRID.effectPP.length * GRID.n.length;
  return [
    "## The simulated world",
    "",
    "Each scenario is an update of an AI system from v1 to v2 that changed K candidate factors at once (a system prompt, the temperature, retrieval top-k, the model snapshot). Exactly one factor caused a drop in accuracy, or none did. The investigator can run v1 with any single factor changed, on the same evaluation items.",
    "",
    header(["Grid dimension", "Levels"], ["---", "---"]),
    row(["Factors changed (K)", GRID.K.join(", ")]),
    row(["True drop caused by the one causal factor", `${GRID.effectPP.join(", ")} pp (0: no factor has any effect)`]),
    row(["Items per arm (n)", GRID.n.join(", ")]),
    row(["Replicates per cell", int(result.config.reps)]),
    "",
    `${cellsN} cells × ${int(result.config.reps)} replicates = ${int(cellsN * result.config.reps)} scenarios. Within each scenario:`,
    "",
    `- **v1 accuracy** is drawn uniformly from ${formatPct(NUISANCE.base[0], 0)} to ${formatPct(NUISANCE.base[1], 0)}.`,
    `- **The true cause** is one of the K factors, chosen uniformly (when the drop is above 0). Changing it lowers accuracy by exactly the drop; changing any other factor changes nothing.`,
    `- **Items differ in difficulty.** Item i has a difficulty z_i ~ N(0, 1), shared by every run on that item. A run answers it correctly when Φ(√ρ·z_i + √(1−ρ)·e) < p, where e ~ N(0, 1) is that run's own noise and p is the arm's accuracy. The left side is uniform, so each arm's expected accuracy is exactly p (the planted effect is realised on average), while hard items stay hard across runs, so paired outcomes are positively correlated.`,
    `- **The item correlation** ρ is drawn uniformly from ${NUISANCE.rho[0]} to ${NUISANCE.rho[1]}, which gives a phi correlation of about 0.2 to 0.65 between paired outcomes. That is moderate: higher correlation favours paired designs, so this range does not flatter Diablo.`,
    `- **Runs.** v1 and v2 once each (for the overall comparison), then, for each factor, a control run of v1 and a treatment run of v1 with only that factor changed. Every run draws fresh noise on the same items. Each experiment therefore has its own control, as in the app.`,
    "- **Seeds.** Replicate r of a cell uses the mulberry32 seed `hashString(\"diablo-bench/v1/K{K}/d{drop}/n{n}/r{r}\")` (the app's own FNV-1a `hashString` and `mulberry32`), so any single scenario can be regenerated on its own.",
  ].join("\n");
}

function methodsSection(): string {
  return [
    "## Methods compared",
    "",
    "Five run on the same simulated data (A on the v1 and v2 runs, the others on the per-factor experiments); B′ runs on the same scenarios with fresh items in every arm. Every statistic is computed by the app's own `src/lib/stats.ts`; the significance level is the validity rubric's (`THRESHOLDS.alpha = " +
      THRESHOLDS.alpha +
      "`). A factor is only ever blamed if its accuracy fell, because the question is what caused a drop.",
    "",
    header(["Method", "Rule"], ["---", "---"]),
    ...METHOD_IDS.flatMap((m) => {
      const out = [row([`**${METHOD_LABEL[m]}**`, METHOD_RULE[m]])];
      if (m === "unpaired") out.push(row([`**${UNPAIRED_DESIGN_LABEL}**`, UNPAIRED_DESIGN_RULE]));
      return out;
    }),
    "",
    "Scoring, per scenario: **right** means the method blamed exactly the true cause; **innocent factor blamed** means it blamed at least one factor that changed nothing (with or without the true cause); **nothing named** means it reported no attributable cause although one existed. When no factor had any effect, naming anything is a **false alarm**; with no true cause, every attribution is false, so this rate is also the false discovery rate.",
    "",
    "The Diablo protocol here is the measuring half of an investigation: it assumes the reasoning half proposed the right candidate factors and designed one clean experiment per factor. `src/lib/bench/bridge.test.ts` checks that it agrees with the app's own `holmAdjusted` and `analyzeRun` on an investigation built from the same counts. In the app, a hypothesis that predicts a drop is \"supported\" when its paired-bootstrap interval lies entirely below zero and the result survives the Holm correction (check C7); \"The app's verdicts\" below checks that this names the same factors as the protocol.",
  ].join("\n");
}

const rateOf = (t: Tally, k: keyof Tally) => t[k] / t.scenarios;
const causeRows = () => GRID.effectPP.filter((d) => d > 0).flatMap((effectPP) => GRID.n.map((n) => ({ effectPP, n })));

/** One sentence on the innocent-factor table, chosen from its numbers. */
function wrongSummary(result: BenchResult): string {
  const rows = causeRows().map((c) => ({
    ...c,
    diablo: rateOf(pool(result, "diablo", byCell(c)), "wrong"),
    largest: rateOf(pool(result, "largest", byCell(c)), "wrong"),
  }));
  const maxDiablo = Math.max(...rows.map((r) => r.diablo));
  const worst = rows.reduce((a, b) => (b.largest > a.largest ? b : a));
  const weakest = worst.effectPP === Math.min(...rows.map((r) => r.effectPP)) && worst.n === GRID.n[0];
  return `Diablo blames an innocent factor in at most ${formatPct(maxDiablo)} of scenarios in any row. D's rate peaks at ${formatPct(worst.largest)} (a ${worst.effectPP} pp drop, n = ${worst.n})${weakest ? ", exactly where the evidence is weakest" : ""}.`;
}

/** One paragraph on the no-cause table, chosen from its numbers. */
function nullSummary(result: BenchResult): string {
  const at = (m: MethodId, K?: number) => rateOf(pool(result, m, and(noCause, byCell(K === undefined ? {} : { K }))), "falseAlarm");
  const perRow = (m: MethodId) => GRID.K.flatMap((K) => GRID.n.map((n) => rateOf(pool(result, m, byCell({ K, effectPP: 0, n })), "falseAlarm")));
  const cByK = GRID.K.map((K) => at("uncorrected", K));
  const grows = cByK.every((x, i) => i === 0 || x > cByK[i - 1]);
  const holmMax = Math.max(...perRow("diablo"), ...perRow("unpaired"));
  const designRows = GRID.K.flatMap((K) => GRID.n.map((n) => rateOf(poolUnpairedDesign(result, byCell({ K, effectPP: 0, n })), "falseAlarm")));
  const designMax = Math.max(...designRows);
  const d = perRow("largest");
  const parts = [
    grows
      ? `Without a correction, false alarms grow with the number of factors tested (C: ${cByK.map((x, i) => `${formatPct(x)} at K = ${GRID.K[i]}`).join(", ")}).`
      : `Without a correction (C), false alarms run at ${cByK.map((x, i) => `${formatPct(x)} at K = ${GRID.K[i]}`).join(", ")}.`,
    `With Holm they stay at or below ${formatPct(holmMax)} in every row for Diablo and B${holmMax < THRESHOLDS.alpha / 2 ? ", well inside" : holmMax < THRESHOLDS.alpha ? ", inside" : ", but not always inside"} the 5% familywise bound; B′, with Holm on a design that really is unpaired, reaches ${formatPct(designMax)}${designMax < THRESHOLDS.alpha ? "" : ", above that bound"}.`,
    `D names a culprit in ${formatPct(Math.min(...d))} to ${formatPct(Math.max(...d))} of these scenarios: whenever any factor's accuracy happened to fall.`,
  ];
  return parts.join(" ");
}

function smallWidth(result: BenchResult): string {
  const c = poolCoverage(result, byCell({ n: GRID.n[0] }));
  const w = (c.cause.widthSum + c.inert.widthSum) / (c.cause.intervals + c.inert.intervals);
  return (100 * w).toFixed(1);
}

function powerSection(result: BenchResult): string {
  const lines = [
    "## Results",
    "",
    "### Right cause named (power), by size of the drop and items per arm",
    "",
    `Pooled over K = ${GRID.K.join(", ")} (${int(GRID.K.length * result.config.reps)} scenarios per row). The last column is the overall before/after test (A): how often it even detects that accuracy fell.`,
    "",
    header(["Drop", "n", ...COLUMNS.map((c) => c.short), "A. Overall detects the drop"]),
  ];
  for (const effectPP of GRID.effectPP.filter((d) => d > 0)) {
    for (const n of GRID.n) {
      const f = byCell({ effectPP, n });
      const det = poolDetected(result, f);
      lines.push(
        row([
          `${effectPP} pp`,
          n,
          ...COLUMNS.map((c) => {
            const t = c.tally(result, f);
            return pct(t.correct, t.scenarios);
          }),
          pct(det.detected, det.scenarios),
        ]),
      );
    }
  }
  lines.push(
    "",
    "### Innocent factor blamed, by size of the drop and items per arm",
    "",
    `Same scenarios. ${wrongSummary(result)}`,
    "",
    header(["Drop", "n", ...COLUMNS.map((c) => c.short)]),
  );
  for (const effectPP of GRID.effectPP.filter((d) => d > 0)) {
    for (const n of GRID.n) {
      const f = byCell({ effectPP, n });
      lines.push(
        row([
          `${effectPP} pp`,
          n,
          ...COLUMNS.map((c) => {
            const t = c.tally(result, f);
            return pct(t.wrong, t.scenarios);
          }),
        ]),
      );
    }
  }
  return lines.join("\n");
}

function nullSection(result: BenchResult): string {
  const lines = [
    "### When nothing caused the drop",
    "",
    `Scenarios with no causal factor (${int(result.config.reps)} per row). Any cause named is a false alarm. The last column is how often the overall test (A) reports a significant drop that no factor caused.`,
    "",
    header(["K", "n", ...COLUMNS.map((c) => c.short), "A. Overall flags a drop"]),
  ];
  for (const K of GRID.K) {
    for (const n of GRID.n) {
      const f = byCell({ K, effectPP: 0, n });
      const det = poolDetected(result, f);
      lines.push(
        row([
          K,
          n,
          ...COLUMNS.map((c) => {
            const t = c.tally(result, f);
            return pct(t.falseAlarm, t.scenarios);
          }),
          pct(det.detected, det.scenarios),
        ]),
      );
    }
  }
  lines.push(
    "",
    nullSummary(result),
  );
  return lines.join("\n");
}

function kSection(result: BenchResult): string {
  const lines = [
    "### By number of factors changed",
    "",
    `Scenarios with a cause, pooled over drop sizes and n (${int((GRID.effectPP.length - 1) * GRID.n.length * result.config.reps)} per row): right cause named / innocent factor blamed.`,
    "",
    header(["K", ...COLUMNS.map((c) => c.short)]),
  ];
  for (const K of GRID.K) {
    const f = and(withCause, byCell({ K }));
    lines.push(
      row([
        K,
        ...COLUMNS.map((c) => {
          const t = c.tally(result, f);
          return `${pct(t.correct, t.scenarios)} / ${pct(t.wrong, t.scenarios)}`;
        }),
      ]),
    );
  }
  return lines.join("\n");
}

function sampleSizeSection(result: BenchResult): string {
  const lines = [
    "### Items needed",
    "",
    "The smallest n in the grid at which Diablo names the right cause in at least 80% of scenarios, by size of the drop (pooled over K).",
    "",
    header(["Drop", "Smallest n reaching 80%", "Diablo at n = 160"]),
  ];
  for (const effectPP of GRID.effectPP.filter((d) => d > 0)) {
    const at = (n: number) => pool(result, "diablo", byCell({ effectPP, n }));
    const first = GRID.n.find((n) => {
      const t = at(n);
      return t.correct / t.scenarios >= 0.8;
    });
    const top = at(GRID.n[GRID.n.length - 1]);
    lines.push(
      row([
        `${effectPP} pp`,
        first === undefined ? `not reached by n = ${GRID.n[GRID.n.length - 1]}` : `n = ${first}`,
        pct(top.correct, top.scenarios),
      ]),
    );
  }
  const smallest = GRID.effectPP.find((d) => d > 0)!;
  const top = pool(result, "diablo", byCell({ effectPP: smallest, n: GRID.n[GRID.n.length - 1] }));
  lines.push(
    "",
    `This is the sample-size planning a team needs before running: with ${GRID.n[GRID.n.length - 1]} items per arm, a ${smallest} pp drop is attributed in only ${pct(top.correct, top.scenarios)} of scenarios, so small regressions need far more items than that.`,
  );
  return lines.join("\n");
}

type Bucket = { intervals: number; covered: number; widthSum: number };

/** "94.7% (92.6 to 96.2)" and where it sits relative to the nominal 95%. */
function coverageCell(b: Bucket): { text: string; verdict: "consistent" | "above" | "below" } {
  const [lo, hi] = wilson(b.covered, b.intervals);
  const verdict = lo > 0.95 ? "above" : hi < 0.95 ? "below" : "consistent";
  return { text: `${pctCI(b.covered, b.intervals)}, ${int(b.intervals)} CIs`, verdict };
}

function coverageSection(result: BenchResult): string {
  const lines = [
    "### Confidence intervals (Diablo)",
    "",
    `Every experiment's 95% CI for Δ, computed by the app's own \`analyzeRun\` (paired bootstrap, 2,000 resamples, seeded by the run id), checked against the true Δ on the first ${int(result.config.coverageReps)} replicates of every cell. Nominal coverage is 95%; brackets are 95% Wilson intervals for the Monte Carlo error.`,
    "",
    header(["n", "True cause: coverage", "Mean width", "Factor with no effect: coverage", "Mean width"]),
  ];
  const off: string[] = [];
  let maxGap = 0;
  let checked = 0;
  const pooled: string[] = [];
  const rows: [string, CellFilter][] = [...GRID.n.map((n): [string, CellFilter] => [String(n), byCell({ n })]), ["all", () => true]];
  for (const [label, f] of rows) {
    const c = poolCoverage(result, f);
    const cause = coverageCell(c.cause);
    const inert = coverageCell(c.inert);
    if (label !== "all") {
      for (const [name, b, cell] of [
        ["true-cause", c.cause, cause],
        ["no-effect", c.inert, inert],
      ] as const) {
        checked++;
        maxGap = Math.max(maxGap, Math.abs(b.covered / b.intervals - 0.95));
        if (cell.verdict !== "consistent") off.push(`${name} intervals at n = ${label} (${formatPct(b.covered / b.intervals)})`);
      }
    } else {
      for (const [name, b, cell] of [
        ["true-cause", c.cause, cause],
        ["no-effect", c.inert, inert],
      ] as const) {
        if (cell.verdict === "consistent") continue;
        pooled.push(
          `the ${name} intervals cover ${pctCI(b.covered, b.intervals)}, ${cell.verdict} 95%: ${cell.verdict === "above" ? "a little wider than they need to be (conservative)" : "a little too narrow"}`,
        );
      }
    }
    lines.push(
      row([
        label,
        cause.text,
        `${(100 * (c.cause.widthSum / c.cause.intervals)).toFixed(1)} pp`,
        inert.text,
        `${(100 * (c.inert.widthSum / c.inert.intervals)).toFixed(1)} pp`,
      ]),
    );
  }
  const chance = 1 - 0.95 ** checked;
  const outside = off.length
    ? ` ${off.length === 1 ? `One row, ${off[0]}, is` : `${off.length} rows (${off.join(", ")}) are`} outside ${off.length === 1 ? "its" : "their"} own 95% Monte Carlo interval. With ${checked} rows checked, at least one falls outside by chance about ${Math.round(chance * 100)}% of the time, and these ${int(result.config.coverageReps)} replicates per cell are a single draw, so read ${off.length === 1 ? "it" : "them"} as a hint rather than a finding.`
    : " Every row is inside its own 95% Monte Carlo interval.";
  const pooledNote = pooled.length
    ? ` Pooled over n, ${pooled.join("; ")}.`
    : " Pooled over n, both kinds are within Monte Carlo error of 95%.";
  lines.push(
    "",
    `Read candidly: every row is within ${(100 * maxGap).toFixed(1)} pp of the nominal 95%.${outside}${pooledNote}`,
    "",
    `Coverage does not change any attribution, which rests on the exact McNemar test and Holm, but it is what makes the reported interval honest. Note the width: at n = ${GRID.n[0]} the average interval spans ${smallWidth(result)} pp, which is why small samples rarely support a claim.`,
  );
  return lines.join("\n");
}

function verdictSection(result: BenchResult): string {
  const v = verdictSplits(result);
  const rowFor = (label: string, t: Split) => {
    const nr = namedRight(t.all);
    return row([
      label,
      pctCI(t.cause.correct, t.cause.scenarios),
      pctCI(t.cause.wrong, t.cause.scenarios),
      pctCI(t.none.falseAlarm, t.none.scenarios),
      `${pct(nr.right, nr.named)} of ${int(nr.named)}`,
    ]);
  };
  const old = v.intervalOnly;
  const C = v.uncorrected;
  const differ = v.scenarios - v.matches;
  return [
    "### The app's verdicts",
    "",
    `The protocol is a rule on counts; the app shows a verdict on each hypothesis (\`verdictFor\` in \`src/lib/data/derive.ts\`). On the first ${int(result.config.coverageReps)} replicates of every cell (${int(v.scenarios)} scenarios, ${int(v.app.none.scenarios)} of them with no cause), where every experiment's interval is computed anyway, the benchmark builds the investigation the app would hold (one hypothesis per factor, "changing it lowered accuracy", each tested by one paired experiment) and counts a factor as blamed when the app marks its hypothesis "supported".`,
    "",
    header(
      ["Rule, on these scenarios", "Right cause named", "Innocent factor blamed", "Cause named when none exists", "When it named a cause, it was the right one"],
      ["---", "---:", "---:", "---:", "---:"],
    ),
    rowFor("**App verdicts**: interval excludes zero and the result survives Holm", v.app),
    rowFor("Diablo protocol", v.protocol),
    rowFor("App verdicts before 9 Oct 2026: interval alone, a failed Holm check only warned", old),
    rowFor("C. Paired, no correction", C),
    "",
    `The app's verdicts blamed exactly the factors the protocol blamed in ${int(v.matches)} of the ${int(v.scenarios)} scenarios${
      differ ? `; in the other ${int(differ)}, the protocol blamed a factor whose interval still included zero, which the app does not mark supported` : ""
    }.`,
    "",
    `Until 9 Oct 2026 the verdict ignored the correction: "supported" whenever the interval excluded zero, with a failed Holm check (C7) shown only as a warning that lowered the evidence strength. That is an uncorrected test with the bootstrap interval in place of the exact test, and it behaved like one: ${pct(old.none.falseAlarm, old.none.scenarios)} false alarms and ${pct(old.cause.wrong, old.cause.scenarios)} innocent factors blamed, ${
      old.none.falseAlarm / old.none.scenarios > C.none.falseAlarm / C.none.scenarios && old.cause.wrong / old.cause.scenarios > C.cause.wrong / C.cause.scenarios
        ? "more than"
        : "against"
    } C's ${pct(C.none.falseAlarm, C.none.scenarios)} and ${pct(C.cause.wrong, C.cause.scenarios)}. This benchmark is how that was found; the verdict now requires the correction.`,
  ].join("\n");
}

function sensitivitySection(result: BenchResult): string {
  const { K, effectPP, n } = SENSITIVITY.cell;
  const rate = (r: CellResult, m: MethodId) => r.methods[m].correct / r.methods[m].scenarios;
  const show = (r: CellResult, m: MethodId) => pct(r.methods[m].correct, r.methods[m].scenarios);
  const rows = result.sensitivity;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const notes: string[] = [];
  if (first.cell.rho === 0) {
    notes.push(
      rate(first, "unpaired") > rate(first, "diablo")
        ? `With independent items (ρ = 0) there is no pairing to exploit, and the unpaired z-test finds more than the exact McNemar test (${show(first, "unpaired")} against ${show(first, "diablo")}): the exact McNemar test is conservative, and with nothing to gain from pairing, that costs it some power.`
        : `With independent items (ρ = 0) there is no pairing to exploit; the paired test still finds ${show(first, "diablo")} against ${show(first, "unpaired")} unpaired.`,
    );
  }
  const cross = rows.find((r) => rate(r, "diablo") > rate(r, "unpaired"));
  const gaps = rows.map((r) => rate(r, "diablo") - rate(r, "unpaired"));
  const widening = gaps.every((g, i) => i === 0 || g > gaps[i - 1]);
  if (cross) {
    notes.push(
      `From ρ = ${cross.cell.rho} up, the paired test finds more${widening ? ", and the gap widens as ρ rises" : ""}: at ρ = ${last.cell.rho}, ${show(last, "diablo")} against ${show(last, "unpaired")} on identical counts.`,
    );
  }
  const unpairedFalls = rows.every((r, i) => i === 0 || rate(r, "unpaired") < rate(rows[i - 1], "unpaired"));
  if (unpairedFalls) {
    notes.push(
      "The unpaired test even finds less as ρ rises: its standard error ignores the pairing, so it cannot use the extra precision that correlated items give the difference.",
    );
  }
  return [
    "### Sensitivity: how correlated the items are",
    "",
    `One cell (K = ${K}, a ${effectPP} pp drop, n = ${n}) with the item correlation ρ fixed instead of drawn, ${int(result.config.reps)} replicates each: right cause named / innocent factor blamed.`,
    "",
    header(["ρ", ...ATTRIBUTING.map((m) => SHORT[m])]),
    ...rows.map((r) =>
      row([
        String(r.cell.rho),
        ...ATTRIBUTING.map((m) => {
          const t = r.methods[m];
          return `${pct(t.correct, t.scenarios)} / ${pct(t.wrong, t.scenarios)}`;
        }),
      ]),
    ),
    "",
    notes.join(" "),
  ].join("\n");
}

const OUTCOME_TEXT: Record<Outcome, string> = {
  correct: "right",
  wrong: "wrong: blames a factor that changed nothing",
  missed: "misses the true cause",
  quiet: "right: nothing to find",
  "false-alarm": "false alarm",
};

/** The counts, tests and every method's verdict for one scenario. */
export function renderAnalysis(a: Analysis): string {
  const { scenario, overall: o, experiments } = a.data;
  const names = (blamed: number[]) =>
    blamed.length ? blamed.map((j) => scenario.factors[j]).join(" and ") : "no attributable cause";
  const lines = [
    `Scenario \`${cellKey(scenario.cell, a.rep)}\` (seed 0x${scenario.seed.toString(16).padStart(8, "0")}): K = ${scenario.K}, n = ${scenario.n} items per arm, v1 accuracy ${formatPct(scenario.base)}, item correlation ρ = ${scenario.rho.toFixed(2)}. True cause: ${scenario.cause === null ? "none (no factor has any effect)" : `**${scenario.factors[scenario.cause]}**, −${scenario.effectPP} pp`}.`,
    "",
    header(
      ["Factor changed alone", "v1", "v1 + this change", "Δ", "Discordant b / c", "Exact McNemar p", "Holm p (Diablo)", "Unpaired Holm p (B)"],
      ["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:"],
    ),
    ...experiments.map((e, j) =>
      row([
        j === scenario.cause ? `**${scenario.factors[j]}** (true cause)` : scenario.factors[j],
        `${e.kControl}/${e.n}`,
        `${e.kTreatment}/${e.n}`,
        formatPP((e.kTreatment - e.kControl) / e.n),
        `${e.b} / ${e.c}`,
        formatP(a.diablo.p[j]),
        formatP(a.diablo.adjusted[j]),
        formatP(a.unpaired.adjusted[j]),
      ]),
    ),
    "",
    `Overall, v1 against v2: ${o.kControl}/${o.n} → ${o.kTreatment}/${o.n} (${formatPP((o.kTreatment - o.kControl) / o.n)}), exact McNemar ${formatP(a.overall.p)}.`,
    "",
    ...METHOD_IDS.map((m) => {
      if (m === "overall")
        return `- ${METHOD_LABEL[m]}: ${a.overall.detected ? "flags a significant drop" : "no significant drop"}; names no cause.`;
      return `- ${METHOD_LABEL[m]}: ${names(a[m].blamed)} (${OUTCOME_TEXT[a.outcome[m]]}).`;
    }),
  ];
  return lines.join("\n");
}

function examplesSection(result: BenchResult): string {
  const lines = [
    "## Failure examples",
    "",
    "The first replicate, in the order searched, where the methods disagree in each way. Diablo's own failures are included.",
  ];
  result.examples.forEach((ex: Example | null, i) => {
    lines.push("");
    if (!ex) {
      lines.push(`### ${i + 1}. No replicate matched`, "", "None of the searched replicates showed this pattern.");
      return;
    }
    lines.push(`### ${i + 1}. ${ex.spec.title}`, "", ex.spec.lesson, "", renderAnalysis(ex.analysis));
  });
  return lines.join("\n");
}

function limitationsSection(result: BenchResult): string {
  const h = headline(result);
  const fa = (m: MethodId) => h.method[m].none;
  const conditioned = (m: MethodId) =>
    `${pct(fa(m).falseAlarm, fa(m).scenarios)} to ${pct(fa(m).falseAlarmAfterDrop, fa(m).dropSeen)}`;
  return [
    "## Limitations",
    "",
    "- **Simulated targets.** No AI system is run. Outcomes come from the item model above, so the results hold for systems whose per-item behaviour resembles it. Real evals can have stronger or weaker item correlation (see the sensitivity table), clustered items, or scorer noise.",
    "- **This validates measurement, not reasoning.** The benchmark hands every method one clean experiment per candidate factor. Whether an LLM proposes the right candidates, notices a factor that was not in the change log, or designs a clean experiment is not tested here; that needs real investigations with a real model.",
    "- **One cause or none, no interactions.** Real regressions can have two causes, or come from two factors only in combination. A one-factor-at-a-time design cannot see an interaction; a factorial design can, and is not benchmarked here.",
    `- **Every scenario is analysed, drop or not.** A team investigates only when v2 visibly scored lower. Restricting the no-cause scenarios to the ${int(fa("diablo").dropSeen)} where v2 happened to score below v1 changes the false-alarm rate from ${conditioned("diablo")} for Diablo, ${conditioned("uncorrected")} for C and ${conditioned("largest")} for D: the per-factor experiments are fresh runs, so a chance overall drop says little about them.`,
    "- **Fixed effect per scenario.** The causal factor lowers every item's chance by the same amount on the latent scale; effects concentrated in a slice of items are not simulated.",
    "- **Baselines are simplified.** D is a simple heuristic (blame the biggest observed drop); it is not a measurement of how a person or an LLM judges, and real judgment may use other cues, for better or worse. B misreads paired data; B′ is the proper unpaired design. B, B′ and C are the obvious shortcuts, not the worst possible practice.",
    `- **The app's verdicts are checked on a subset.** The app's verdict needs every experiment's bootstrap interval, so it is computed on the first ${int(result.config.coverageReps)} replicates of each cell (see "The app's verdicts"), not on all ${int(result.config.reps)}. The full-size rows are the protocol's.`,
    "- **Monte Carlo error.** " +
      `With ${int(result.config.reps)} replicates per cell, a single cell's rate is within about ±${(196 * Math.sqrt(0.25 / result.config.reps)).toFixed(1)} pp (95%, worst case); pooled rates are tighter (the headline brackets). Seeds are fixed, so the numbers are exactly reproducible, not re-randomised.`,
    "- **Pseudo-random numbers.** mulberry32 has 32 bits of state, so streams from different seeds can overlap in places; with every scenario seeded separately this does not bias the rates, but it is not a cryptographic-quality generator.",
  ].join("\n");
}

function checksSection(): string {
  return [
    "## How the numbers are checked",
    "",
    "- `src/lib/bench/benchmark.test.ts` reruns the full benchmark, compares the result with this file byte for byte, and pins every headline number quoted in `docs/SUBMISSION.md` and `docs/SCORECARD.md`.",
    "- `src/lib/bench/scenario.test.ts` checks the generator: the same seed gives the same counts, the planted drop is realised on average, items are correlated, and the true cause sits in each position equally often.",
    "- `src/lib/bench/methods.test.ts` checks each method on hand-built counts, including ties and the direction rule.",
    "- `src/lib/bench/bridge.test.ts` checks that the protocol's Holm-adjusted p-values equal the app's `holmAdjusted` on an investigation built from the same counts, that the app's `verdictFor` names the protocol's factors on those investigations, and that the coverage check uses the app's own `analyzeRun` interval.",
  ].join("\n");
}

export function renderReport(result: BenchResult): string {
  const h = headline(result);
  return [
    "# Planted-cause benchmark",
    "",
    "> Generated by `npm run bench` from `src/lib/bench/`. Do not edit by hand: `npm test` regenerates it and fails if this file differs.",
    "",
    "**What it measures.** When an update changes several things at once and accuracy drops, how often does each method blame the right change, how often an innocent one, and how often something when nothing caused the drop? The causes are planted in simulated data, so the right answer is known.",
    "",
    "**What it does not measure.** It is a simulation: no model is called and nothing touches the network. It validates the *measuring* half of \"the AI reasons, the system measures\" (Diablo's statistical protocol, given one clean experiment per candidate factor), not the reasoning half (whether an LLM proposes the right factors and experiments).",
    "",
    headlineSection(result, h),
    "",
    reproduceSection(result),
    "",
    worldSection(result),
    "",
    methodsSection(),
    "",
    powerSection(result),
    "",
    nullSection(result),
    "",
    kSection(result),
    "",
    sampleSizeSection(result),
    "",
    coverageSection(result),
    "",
    verdictSection(result),
    "",
    sensitivitySection(result),
    "",
    examplesSection(result),
    "",
    limitationsSection(result),
    "",
    checksSection(),
    "",
  ].join("\n");
}

