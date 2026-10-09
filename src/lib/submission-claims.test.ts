/**
 * Pins every number that docs/SUBMISSION.md quotes, so a
 * reader can check them with `npm test` instead of taking them on trust.
 *
 * Part 1 is an illustrative worked example (not customer data): one AI system,
 * 80 prompts, two candidate changes, paired outcomes.
 * Part 2 is what the validity rubric catches in the demo's seeded data and in
 * deliberately broken copies of it.
 */
import { describe, expect, it } from "vitest";
import { analyzeExperiment, verdictFor } from "./data/derive";
import { seedInvestigations } from "./data/mock/fixtures";
import { SYSTEMS } from "./data/mock/catalog";
import { assess, experimentChecks } from "./validity";
import {
  bootstrapDiffCI,
  formatCIpp,
  formatP,
  formatPP,
  holm,
  mcnemarExact,
  pairsFromTable,
} from "./stats";
import type { Investigation } from "./data/types";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const familyOf = (id: string) => SYSTEMS.find((s) => s.id === id)?.family ?? null;
const seeds = seedInvestigations(NOW);
const byId = (id: string) => structuredClone(seeds.find((i) => i.id === id)!) as Investigation;

/** A paired comparison on the same prompts: k correct out of n, b/c discordant pairs. */
function paired(kControl: number, kTreatment: number, n: number, b: number, c: number) {
  const a = kControl - b;
  const d = n - a - b - c;
  const { control, treatment } = pairsFromTable(a, b, c, d);
  const diff = (kTreatment - kControl) / n;
  const ci = bootstrapDiffCI(control, treatment, { paired: true, seed: 1 });
  return { diff, ci, p: mcnemarExact(b, c), consistent: c - b === kTreatment - kControl };
}

describe("worked example: which of two changes broke the assistant?", () => {
  // Baseline: 69 of 80 prompts answered correctly.
  const e1 = paired(69, 57, 80, 16, 4); // E1: new system prompt
  const e2 = paired(69, 68, 80, 5, 4); // E2: temperature 0.2 → 0.7

  it("E1 (system prompt) is a real regression", () => {
    expect(e1.consistent).toBe(true);
    expect(formatPP(e1.diff)).toBe("−15.0 pp");
    expect(formatCIpp(e1.ci)).toBe("−26.3 to −3.8");
    expect(formatP(e1.p)).toBe("p = 0.012");
  });

  it("E2 (temperature) shows no clear effect", () => {
    expect(e2.consistent).toBe(true);
    expect(formatPP(e2.diff)).toBe("−1.3 pp");
    expect(formatCIpp(e2.ci)).toBe("−8.8 to 6.3");
    expect(formatP(e2.p)).toBe("p > 0.99");
  });

  it("E1 survives the Holm correction across both tests", () => {
    const [adjE1, adjE2] = holm([e1.p, e2.p]);
    expect(formatP(adjE1)).toBe("p = 0.024");
    expect(adjE2).toBe(1);
  });
});

describe("what the rubric catches", () => {
  it("the obvious explanation is rejected and the competing one is supported (long context)", () => {
    const inv = byId("long-context-degradation");
    expect(verdictFor(inv, inv.hypotheses[0]).verdict).toBe("rejected"); // "falls past 128k tokens"
    expect(verdictFor(inv, inv.hypotheses[1]).verdict).toBe("supported"); // "needle position matters more"
    const length = analyzeExperiment(inv.experiments[0])!;
    const position = analyzeExperiment(inv.experiments[1])!;
    expect(`${formatPP(length.diff)} [${formatCIpp(length.diffCI)}]`).toBe("−1.9 pp [−5.1 to 1.3]");
    expect(`${formatPP(position.diff)} [${formatCIpp(position.diffCI)}]`).toBe("−10.0 pp [−14.3 to −6.0]");
  });

  it("a significant result with no competing hypothesis tested is flagged (sycophancy, C9)", () => {
    const inv = byId("sycophancy-model-x");
    const r = analyzeExperiment(inv.experiments[0])!;
    expect(`${formatPP(r.diff)} [${formatCIpp(r.diffCI)}] ${formatP(r.p)}`).toBe("+8.5 pp [1.6 to 15.3] p = 0.016");
    expect(assess(inv, familyOf).competing.state).toBe("fail");
    expect(assess(inv, familyOf).strength).toBe("moderate");
  });

  it("an effect that does not survive multiple-comparison correction is warned about (C7)", () => {
    const inv = byId("long-context-degradation");
    // Make the position effect borderline: 312/320 vs 301/320 is p ≈ 0.03 on its own.
    const run = inv.experiments[1].runs[0];
    inv.experiments[1].runs[0] = { ...run, counts: { control: { k: 312, n: 320 }, treatment: { k: 301, n: 320 } } };
    const checks = experimentChecks(inv, inv.experiments[1], familyOf)!;
    expect(analyzeExperiment(inv.experiments[1])!.effectFound).toBe(true);
    expect(checks.find((c) => c.id === "C7")!.state).toBe("warn");
  });

  it("a replication that goes the other way fails C8 and downgrades the evidence", () => {
    const inv = byId("tool-use-reliability");
    expect(assess(inv, familyOf).strength).toBe("strong");
    // Runs are immutable (results are cached per run object), so replace the replication run.
    const runs = inv.experiments[0].runs;
    const i = runs.findIndex((r) => r.role === "replication");
    runs[i] = { ...runs[i], counts: { control: { k: 44, n: 600 }, treatment: { k: 13, n: 600 } } };
    const c8 = experimentChecks(inv, inv.experiments[0], familyOf)!.find((c) => c.id === "C8")!;
    expect(c8.state).toBe("fail");
    expect(assess(inv, familyOf).strength).toBe("moderate");
  });

  it("a judge from the target's own model family fails C4 and the evidence becomes weak", () => {
    const inv = byId("sycophancy-model-x");
    inv.experiments[0].design.scorer.family = "Model X";
    const c4 = experimentChecks(inv, inv.experiments[0], familyOf)!.find((c) => c.id === "C4")!;
    expect(c4.state).toBe("fail");
    expect(assess(inv, familyOf).strength).toBe("weak");
  });
});
