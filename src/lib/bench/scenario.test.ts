import { describe, expect, it } from "vitest";
import { hashString } from "@/lib/data/derive";
import {
  cellKey,
  FACTOR_NAMES,
  freshItemsFor,
  GRID,
  makeScenario,
  NUISANCE,
  scenarioFor,
  seedFor,
  simulate,
  trueDeltas,
  type Cell,
  type PairedCounts,
  type SimulatedData,
} from "./scenario";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const diff = (e: PairedCounts) => (e.kTreatment - e.kControl) / e.n;

/**
 * Mean phi correlation between the control and treatment outcomes of no-effect
 * experiments, each measured against its scenario's true accuracy (so the
 * spread of accuracies across scenarios does not leak into it).
 */
function meanPhi(data: SimulatedData[]): number {
  const phis = data.map((d) => {
    const e = d.experiments[0];
    const p = d.scenario.base;
    return ((e.kControl - e.b) / e.n - p * p) / (p * (1 - p));
  });
  return mean(phis);
}

describe("scenario generator", () => {
  const cell: Cell = { K: 3, effectPP: 10, n: 80 };

  it("is deterministic: the same cell and seed give the same scenario and counts", () => {
    expect(simulate(cell, 12345)).toEqual(simulate(cell, 12345));
    expect(scenarioFor(cell, 7)).toEqual(scenarioFor(cell, 7));
    expect(scenarioFor(cell, 7)).not.toEqual(scenarioFor(cell, 8));
  });

  it("seeds each replicate from a readable key with the app's own hash", () => {
    expect(cellKey(cell, 7)).toBe("diablo-bench/v1/K3/d10/n80/r7");
    expect(seedFor(cell, 7)).toBe(hashString("diablo-bench/v1/K3/d10/n80/r7"));
    expect(cellKey({ ...cell, rho: 0.8 }, 2)).toBe("diablo-bench/v1/K3/d10/n80/rho0.8/r2");
  });

  it("pins one scenario, so a change to the generator cannot pass silently", () => {
    const d = scenarioFor({ K: 4, effectPP: 10, n: 80 }, 53);
    expect(d.scenario.seed).toBe(0xdf731d77);
    expect(d.scenario.cause).toBe(1);
    expect(d.experiments.map((e) => [e.kControl, e.kTreatment, e.b, e.c])).toEqual([
      [63, 65, 7, 9],
      [59, 52, 17, 10],
      [69, 57, 17, 5],
      [61, 60, 15, 14],
    ]);
    expect(d.overall).toEqual({ n: 80, kControl: 59, kTreatment: 50, b: 19, c: 10 });
  });

  it("keeps counts consistent: discordant pairs explain the difference", () => {
    for (const rep of range(200)) {
      const d = scenarioFor({ K: 4, effectPP: 15, n: 40 }, rep);
      for (const e of [d.overall, ...d.experiments]) {
        expect(e.kTreatment - e.kControl).toBe(e.c - e.b);
        expect(e.b).toBeLessThanOrEqual(e.kControl);
        expect(e.c).toBeLessThanOrEqual(e.n - e.kControl);
        expect(e.n).toBe(40);
      }
    }
  });

  it("draws nuisance parameters inside their ranges and names the first K factors", () => {
    for (const rep of range(500)) {
      const s = scenarioFor({ K: 2, effectPP: 5, n: 40 }, rep).scenario;
      expect(s.base).toBeGreaterThanOrEqual(NUISANCE.base[0]);
      expect(s.base).toBeLessThan(NUISANCE.base[1]);
      expect(s.rho).toBeGreaterThanOrEqual(NUISANCE.rho[0]);
      expect(s.rho).toBeLessThan(NUISANCE.rho[1]);
      expect(s.factors).toEqual(FACTOR_NAMES.slice(0, 2));
    }
  });

  it("has a true cause exactly when the drop is above zero, and puts it in each position equally often", () => {
    const positions = [0, 0, 0];
    for (const rep of range(3000)) {
      const s = makeScenario({ K: 3, effectPP: 15, n: 40 }, seedFor({ K: 3, effectPP: 15, n: 40 }, rep));
      positions[s.cause!]++;
      expect(trueDeltas(s).filter((x) => x !== 0)).toEqual([-0.15]);
    }
    for (const p of positions) expect(Math.abs(p / 3000 - 1 / 3)).toBeLessThan(0.03);
    const none = makeScenario({ K: 3, effectPP: 0, n: 40 }, 1);
    expect(none.cause).toBeNull();
    expect(trueDeltas(none)).toEqual([0, 0, 0]);
  });

  it("realises the planted drop on average, and leaves the other factors at zero", () => {
    const c: Cell = { K: 2, effectPP: 10, n: 160 };
    const cause: number[] = [];
    const inert: number[] = [];
    const overall: number[] = [];
    const control: number[] = [];
    const base: number[] = [];
    for (const rep of range(2000)) {
      const d = scenarioFor(c, rep);
      d.experiments.forEach((e, j) => (j === d.scenario.cause ? cause : inert).push(diff(e)));
      overall.push(diff(d.overall));
      control.push(d.experiments[0].kControl / d.experiments[0].n);
      base.push(d.scenario.base);
    }
    // Standard error of each mean is under 0.001; allow four of them and change.
    expect(Math.abs(mean(cause) + 0.1)).toBeLessThan(0.004);
    expect(Math.abs(mean(overall) + 0.1)).toBeLessThan(0.004);
    expect(Math.abs(mean(inert))).toBeLessThan(0.004);
    expect(Math.abs(mean(control) - mean(base))).toBeLessThan(0.004);
  });

  it("realises every drop size in the grid", () => {
    for (const effectPP of GRID.effectPP.filter((d) => d > 0)) {
      const diffs = range(1500).map((rep) => {
        const d = scenarioFor({ K: 2, effectPP, n: 80 }, rep);
        return diff(d.experiments[d.scenario.cause!]);
      });
      expect(Math.abs(mean(diffs) + effectPP / 100)).toBeLessThan(0.006);
    }
  });

  it("correlates paired outcomes through item difficulty, as the report states (phi about 0.2 to 0.65)", () => {
    const at = (rho: number) => meanPhi(range(600).map((rep) => scenarioFor({ K: 1, effectPP: 0, n: 160, rho }, rep)));
    expect(Math.abs(at(0))).toBeLessThan(0.02);
    const low = at(NUISANCE.rho[0]);
    const high = at(NUISANCE.rho[1]);
    expect(low).toBeGreaterThan(0.15);
    expect(low).toBeLessThan(0.3);
    expect(high).toBeGreaterThan(0.55);
    expect(high).toBeLessThan(0.72);
  });

  it("runs the same scenario as an unpaired design: same v1 accuracy and cause, independent arms", () => {
    const c: Cell = { K: 3, effectPP: 10, n: 160 };
    for (const rep of range(50)) {
      const paired = scenarioFor(c, rep).scenario;
      const fresh = freshItemsFor(c, rep).scenario;
      expect(fresh.seed).toBe(paired.seed);
      expect(fresh.base).toBe(paired.base);
      expect(fresh.cause).toBe(paired.cause);
      expect(fresh.rho).toBe(0);
    }
    const phi = meanPhi(range(600).map((rep) => freshItemsFor({ K: 1, effectPP: 0, n: 160 }, rep)));
    expect(Math.abs(phi)).toBeLessThan(0.02);
    const diffs = range(1500).map((rep) => {
      const d = freshItemsFor({ K: 2, effectPP: 10, n: 80 }, rep);
      return diff(d.experiments[d.scenario.cause!]);
    });
    expect(Math.abs(mean(diffs) + 0.1)).toBeLessThan(0.006);
  });

  it("rejects cells it cannot simulate", () => {
    expect(() => simulate({ K: 0, effectPP: 5, n: 40 }, 1)).toThrow();
    expect(() => simulate({ K: 5, effectPP: 5, n: 40 }, 1)).toThrow();
    expect(() => simulate({ K: 2, effectPP: 5, n: 0 }, 1)).toThrow();
    expect(() => simulate({ K: 2, effectPP: 70, n: 40 }, 1)).toThrow();
    expect(() => simulate({ K: 2, effectPP: 5, n: 40, rho: 1 }, 1)).toThrow();
  });
});
