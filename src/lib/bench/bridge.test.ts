/**
 * The benchmark's Diablo protocol must be the app's own analysis, not a
 * re-implementation: build the investigation Diablo would hold for a scenario
 * and check that derive.ts reaches the same numbers and the same attribution.
 */
import { describe, expect, it } from "vitest";
import { analyzeExperiment, analyzeRun, holmAdjusted, verdictFor } from "@/lib/data/derive";
import { investigationInterpretation } from "@/lib/data/interpret";
import { THRESHOLDS } from "@/lib/validity";
import { appVerdictBlames, experimentRunId, intervalOnlyBlames, toInvestigation, toRun } from "./bridge";
import { diablo } from "./methods";
import { scenarioFor, type Cell } from "./scenario";

const CASES: [Cell, number][] = [
  [{ K: 2, effectPP: 20, n: 80 }, 0],
  [{ K: 3, effectPP: 10, n: 80 }, 4],
  [{ K: 4, effectPP: 10, n: 80 }, 17],
  [{ K: 4, effectPP: 10, n: 80 }, 53],
  [{ K: 4, effectPP: 0, n: 80 }, 3],
  [{ K: 4, effectPP: 5, n: 160 }, 9],
  [{ K: 3, effectPP: 15, n: 40 }, 11],
];

describe("the benchmark's Diablo protocol is the app's analysis", () => {
  it.each(CASES)("agrees with derive.ts on %o, replicate %i", (cell, rep) => {
    const data = scenarioFor(cell, rep);
    const inv = toInvestigation(data, rep);
    const ours = diablo(data);
    const adjusted = holmAdjusted(inv);

    expect(adjusted.size).toBe(cell.K);
    inv.experiments.forEach((exp, j) => {
      const r = analyzeExperiment(exp)!;
      expect(r.test).toBe("Exact McNemar test");
      expect(r.p).toBe(ours.p[j]);
      expect(adjusted.get(exp.id)).toBe(ours.adjusted[j]);
      expect(r.diff).toBeCloseTo((data.experiments[j].kTreatment - data.experiments[j].kControl) / cell.n, 12);
    });

    // The attribution rule, applied to the app's own results.
    const fromApp = inv.experiments.flatMap((exp, j) =>
      adjusted.get(exp.id)! < THRESHOLDS.alpha && analyzeExperiment(exp)!.diff < 0 ? [j] : [],
    );
    expect(fromApp).toEqual(ours.blamed);
    // And the verdicts the app shows name the same factors.
    expect(appVerdictBlames(inv)).toEqual(ours.blamed);
  });

  it("the app no longer supports an effect that fails Holm; the old interval-only rule did (report example 2)", () => {
    const cell: Cell = { K: 4, effectPP: 10, n: 80 };
    const data = scenarioFor(cell, 17);
    const inv = toInvestigation(data, 17);
    // The system prompt (factor 0) changed nothing; its raw p is 0.021, Holm-adjusted 0.064.
    expect(data.scenario.cause).toBe(2);
    expect(analyzeExperiment(inv.experiments[0])!.effectFound).toBe(true);
    expect(holmAdjusted(inv).get("E1")!).toBeGreaterThan(THRESHOLDS.alpha);
    expect(intervalOnlyBlames(inv)).toEqual([0, 2]);
    expect(appVerdictBlames(inv)).toEqual([2]);
    expect(diablo(data).blamed).toEqual([2]);
    const h1 = verdictFor(inv, inv.hypotheses[0]);
    expect(h1.verdict).toBe("rejected");
    expect(h1.failsHolm.map((e) => e.id)).toEqual(["E1"]);
    expect(investigationInterpretation(inv)).toMatch(/^H1 is not supported: the interval excludes zero .* does not survive the Holm correction across 4 primary tests/);
  });

  it("checks coverage with the interval the app shows for that run", () => {
    const [cell, rep] = CASES[1];
    const data = scenarioFor(cell, rep);
    const inv = toInvestigation(data, rep);
    data.experiments.forEach((e, j) => {
      const standalone = analyzeRun(toRun(experimentRunId(data, rep, j), e), "paired")!;
      expect(standalone.diffCIMethod).toBe("Paired bootstrap (2,000 resamples, seeded)");
      expect(standalone.diffCI).toEqual(analyzeExperiment(inv.experiments[j])!.diffCI);
    });
  });
});
