/**
 * Concrete scenarios for the report: the first replicate in a cell where the
 * methods disagree in a given way. Each is fully reproducible from its cell
 * and replicate number (`npm run bench -- --scenario K=4,d=10,n=80,r=17`).
 */
import {
  diablo,
  largest,
  METHOD_IDS,
  overall,
  score,
  uncorrected,
  unpaired,
  type DiabloResult,
  type MethodId,
  type Outcome,
  type OverallResult,
} from "./methods";
import { scenarioFor, type Cell, type SimulatedData } from "./scenario";

export interface Analysis {
  rep: number;
  data: SimulatedData;
  diablo: DiabloResult;
  overall: OverallResult;
  unpaired: ReturnType<typeof unpaired>;
  uncorrected: ReturnType<typeof uncorrected>;
  largest: ReturnType<typeof largest>;
  outcome: Record<MethodId, Outcome>;
}

/** Every method on one replicate of a cell. */
export function analyze(cell: Cell, rep: number): Analysis {
  const data = scenarioFor(cell, rep);
  const r = {
    diablo: diablo(data),
    overall: overall(data),
    unpaired: unpaired(data),
    uncorrected: uncorrected(data),
    largest: largest(data),
  };
  const cause = data.scenario.cause;
  const outcome = Object.fromEntries(METHOD_IDS.map((m) => [m, score(r[m].blamed, cause)])) as Record<
    MethodId,
    Outcome
  >;
  return { rep, data, ...r, outcome };
}

export interface ExampleSpec {
  id: string;
  title: string;
  /** What the example shows, in one or two sentences (rendered under the title). */
  lesson: string;
  /** Cells searched in order; the first matching replicate wins. */
  cells: Cell[];
  match: (a: Analysis) => boolean;
}

export const EXAMPLE_SPECS: ExampleSpec[] = [
  {
    id: "wrong-revert",
    title: "Blaming the largest drop and uncorrected tests both pick a factor that changed nothing",
    lesson:
      "One factor really cost 10 pp, but by chance an innocent factor shows the largest drop, and its uncorrected p-value is below 0.05. A team following either baseline reverts the wrong change and keeps the real cause. Diablo does not have the evidence to name anything, and says so: no attributable cause, collect more items.",
    cells: [{ K: 4, effectPP: 10, n: 80 }],
    match: (a) =>
      a.outcome.diablo === "missed" &&
      a.outcome.largest === "wrong" &&
      a.outcome.uncorrected === "wrong" &&
      // Both baselines blame the same innocent factor and leave the true cause out.
      a.uncorrected.blamed.length === 1 &&
      a.uncorrected.blamed[0] === a.largest.blamed[0],
  },
  {
    id: "uncorrected-extra",
    title: "Skipping the correction blames an innocent factor; Diablo names only the true cause",
    lesson:
      "Without a multiple-comparison correction, an innocent factor's p-value below 0.05 is enough to be blamed. After Holm across the four experiments, only the true cause remains.",
    cells: [{ K: 4, effectPP: 10, n: 80 }],
    match: (a) => a.outcome.uncorrected === "wrong" && a.outcome.diablo === "correct",
  },
  {
    id: "no-cause",
    title: "Nothing caused the drop, and two baselines blame something anyway",
    lesson:
      "No factor changed accuracy, but v2 happened to score lower than v1. Picking the largest drop and testing without correction both name a culprit; Diablo reports no attributable cause.",
    cells: [{ K: 4, effectPP: 0, n: 80 }],
    match: (a) =>
      a.data.overall.kTreatment < a.data.overall.kControl &&
      a.outcome.largest === "false-alarm" &&
      a.outcome.uncorrected === "false-alarm" &&
      a.outcome.diablo === "quiet",
  },
  {
    id: "unpaired-miss",
    title: "Ignoring the pairing misses a real cause",
    lesson:
      "The same counts, analysed as if the arms were independent samples, throw away the item-level pairing: no unpaired test survives Holm, and the cause goes unnamed. The paired test on the same counts finds it.",
    cells: [{ K: 3, effectPP: 10, n: 80 }],
    match: (a) => a.outcome.unpaired === "missed" && a.outcome.diablo === "correct",
  },
  {
    id: "diablo-miss",
    title: "Diablo misses a real 10 pp cause at 40 items (the price of caution)",
    lesson:
      "The true cause cost 10 pp, but 40 items are too few for its test to reach a Holm-adjusted p below 0.05, so Diablo says \"no attributable cause\". Picking the largest drop happens to be right here. Diablo's answer is a request for more items, not a wrong claim, but a team with no time for more items gets no answer from it.",
    cells: [{ K: 3, effectPP: 10, n: 40 }],
    match: (a) => a.outcome.diablo === "missed" && a.outcome.largest === "correct",
  },
  {
    id: "diablo-wrong",
    title: "Diablo blames a factor that changed nothing",
    lesson:
      "This does happen. Chance alone produced a drop for a factor with no effect, and its paired test survived Holm. The protocol bounds how often this happens (see the innocent-factor table); it cannot prevent it.",
    cells: [
      { K: 4, effectPP: 5, n: 160 },
      { K: 4, effectPP: 10, n: 160 },
      { K: 4, effectPP: 5, n: 80 },
    ],
    match: (a) => a.outcome.diablo === "wrong",
  },
  {
    id: "diablo-false-alarm",
    title: "Diablo names a cause when nothing caused the drop",
    lesson:
      "Also rare, and bounded by Holm's 5% familywise error rate: with no real effect anywhere, a paired test survived the correction by chance.",
    cells: [
      { K: 4, effectPP: 0, n: 160 },
      { K: 4, effectPP: 0, n: 80 },
    ],
    match: (a) => a.data.overall.kTreatment < a.data.overall.kControl && a.outcome.diablo === "false-alarm",
  },
];

export interface Example {
  spec: ExampleSpec;
  cell: Cell;
  analysis: Analysis;
}

/** The first replicate (below `reps`) that matches the spec, or null. */
export function findExample(spec: ExampleSpec, reps: number): Example | null {
  for (const cell of spec.cells) {
    for (let rep = 0; rep < reps; rep++) {
      const a = analyze(cell, rep);
      if (spec.match(a)) return { spec, cell, analysis: a };
    }
  }
  return null;
}
