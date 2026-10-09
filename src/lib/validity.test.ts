import { describe, expect, it } from "vitest";
import { analyzeExperiment, holmAdjusted, investigationStatus, verdictFor } from "./data/derive";
import { investigationInterpretation } from "./data/interpret";
import { seedInvestigations } from "./data/mock/fixtures";
import { SYSTEMS } from "./data/mock/catalog";
import { simulateRun } from "./data/mock/simulate";
import { designInvestigation } from "./data/mock/agent";
import { assess, experimentChecks, strengthOf } from "./validity";
import type { Investigation } from "./data/types";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const familyOf = (id: string) => SYSTEMS.find((s) => s.id === id)?.family ?? null;
const seeds = seedInvestigations(NOW);
const byId = (id: string) => seeds.find((i) => i.id === id)!;

describe("seeded statistics come from counts", () => {
  it("sycophancy E1 gives the reference values, not the old typed-in ones", () => {
    const r = analyzeExperiment(byId("sycophancy-model-x").experiments[0])!;
    expect(r.test).toBe("Two-proportion z-test");
    expect(r.p).toBeCloseTo(0.0158, 3);
    expect(r.diffCI[0]).toBeCloseTo(0.016, 3);
    expect(r.diffCI[1]).toBeCloseTo(0.1529, 3);
    expect(r.effectFound).toBe(true);
  });
  it("every finished experiment's CI contains its Δ", () => {
    for (const inv of seeds)
      for (const e of inv.experiments) {
        const r = analyzeExperiment(e);
        if (!r) continue;
        expect(r.diffCI[0]).toBeLessThanOrEqual(r.diff);
        expect(r.diffCI[1]).toBeGreaterThanOrEqual(r.diff);
      }
  });
  it("grid arms are the sums of their cells", () => {
    const e2 = byId("long-context-degradation").experiments[1];
    const run = e2.runs[0];
    const sum = (rows: string[]) => run.grid!.filter((c) => rows.includes(c.row)).reduce((a, c) => a + c.k, 0);
    expect(run.counts!.control.k).toBe(sum(["0%", "100%"]));
    expect(run.counts!.treatment.k).toBe(sum(["40%", "60%"]));
  });
  it("a running experiment has no result", () => {
    expect(analyzeExperiment(byId("sycophancy-model-x").experiments[2])).toBeNull();
  });
});

describe("verdicts and status are derived", () => {
  it("long-context: H1 rejected (no clear effect), H2 supported", () => {
    const inv = byId("long-context-degradation");
    expect(verdictFor(inv, inv.hypotheses[0]).verdict).toBe("rejected");
    expect(verdictFor(inv, inv.hypotheses[1]).verdict).toBe("supported");
  });
  it("a verdict needs the effect to survive the Holm correction (C7), not just an interval that excludes zero", () => {
    // Long-context has two primary tests. Make H2's effect borderline: 312/320 vs 301/320 is p ≈ 0.03 on its own.
    const inv = structuredClone(byId("long-context-degradation")) as Investigation;
    const run = inv.experiments[1].runs[0];
    inv.experiments[1].runs[0] = { ...run, counts: { control: { k: 312, n: 320 }, treatment: { k: 301, n: 320 } } };
    const r = analyzeExperiment(inv.experiments[1])!;
    expect(r.effectFound).toBe(true);
    expect(r.diff).toBeLessThan(0);
    expect(holmAdjusted(inv).get("E2")!).toBeGreaterThanOrEqual(0.05);
    const v = verdictFor(inv, inv.hypotheses[1]);
    expect(v.verdict).toBe("rejected");
    expect(v.failsHolm.map((e) => e.id)).toEqual(["E2"]);
    expect(experimentChecks(inv, inv.experiments[1], familyOf)!.find((c) => c.id === "C7")!.state).toBe("warn");
    expect(investigationInterpretation(inv)).toContain("H2 is not supported: the interval excludes zero");
    expect(investigationInterpretation(inv)).toContain("does not survive the Holm correction across 2 primary tests");

    // The same result predicted as "no difference" is not supported either: its interval excludes zero.
    inv.hypotheses[1] = { ...inv.hypotheses[1], prediction: "no-difference" };
    expect(verdictFor(inv, inv.hypotheses[1]).verdict).toBe("rejected");

    // As the only primary test there is nothing to correct for, and the interval decides.
    inv.hypotheses[1] = { ...inv.hypotheses[1], prediction: "decrease" };
    inv.experiments[0].design.primary = false;
    expect(holmAdjusted(inv).size).toBe(1);
    expect(verdictFor(inv, inv.hypotheses[1])).toMatchObject({ verdict: "supported", failsHolm: [] });
  });
  it("seeded verdicts are unchanged by the Holm requirement: every supported effect survives it", () => {
    for (const inv of seeds)
      for (const h of inv.hypotheses) expect(verdictFor(inv, h).failsHolm).toEqual([]);
  });
  it("statuses", () => {
    expect(investigationStatus(byId("sycophancy-model-x"))).toBe("running");
    expect(investigationStatus(byId("tool-use-reliability"))).toBe("replicated");
    expect(investigationStatus(byId("instruction-following"))).toBe("draft");
  });
});

describe("validity rubric v0", () => {
  it("never shows a fake pass for missing fields", () => {
    const inv = structuredClone(byId("sycophancy-model-x")) as Investigation;
    const e = inv.experiments[0];
    e.design.seed = null;
    e.design.randomized = null;
    e.design.scorer = { ...e.design.scorer, humanAgreement: null, family: null };
    const checks = experimentChecks(inv, e, familyOf)!;
    const get = (id: string) => checks.find((c) => c.id === id)!;
    expect(get("C3").state).toBe("unknown");
    expect(get("C3").reason).toBe("Not recorded");
    expect(get("C4").state).toBe("unknown");
    expect(get("C5").state).toBe("unknown");
    expect(strengthOf(checks)).toBe("weak");
  });
  it("C6 is the result, never a failed check", () => {
    const inv = byId("long-context-degradation");
    const checks = experimentChecks(inv, inv.experiments[0], familyOf)!;
    const c6 = checks.find((c) => c.id === "C6")!;
    expect(c6.state).toBe("info");
    expect(c6.reason).toMatch(/^No clear effect/);
  });
  it("a judge from the target's family fails C4", () => {
    const inv = structuredClone(byId("sycophancy-model-x")) as Investigation;
    inv.experiments[0].design.scorer.family = "Model X";
    const c4 = experimentChecks(inv, inv.experiments[0], familyOf)!.find((c) => c.id === "C4")!;
    expect(c4.state).toBe("fail");
  });
  it("strength per investigation", () => {
    expect(assess(byId("sycophancy-model-x"), familyOf).strength).toBe("moderate");
    expect(assess(byId("tool-use-reliability"), familyOf).strength).toBe("strong");
    expect(assess(byId("long-context-degradation"), familyOf).strength).toBe("moderate");
    const draft = assess(byId("instruction-following"), familyOf);
    expect(draft.strength).toBe("not-enough");
    expect(draft.result).toBeNull();
  });
  it("C9: a competing hypothesis must be stated and tested", () => {
    expect(assess(byId("long-context-degradation"), familyOf).competing.state).toBe("pass");
    expect(assess(byId("sycophancy-model-x"), familyOf).competing.state).toBe("fail");
  });
});

describe("mock agent and simulator", () => {
  const sys = SYSTEMS[0];
  it("picks a template by topic and never reuses another topic", () => {
    const d = designInvestigation("Does Agent Y make malformed tool calls with many tools?", sys, new Date(NOW).toISOString());
    expect(d.topic).toBe("tool use");
    expect(JSON.stringify(d)).not.toMatch(/false claim|sycophan/i);
  });
  it("falls back to a template draft that quotes the user", () => {
    const q = "Does the assistant get rude when users are rude?";
    const d = designInvestigation(q, sys, new Date(NOW).toISOString());
    expect(d.templateDraft).toBe(true);
    expect(d.hypotheses[0].text).toContain(q);
  });
  it("simulates deterministically from the run id", () => {
    const d = designInvestigation("Is the model calibrated on medical questions?", sys, new Date(NOW).toISOString());
    const exp = d.experiments[0];
    const a = simulateRun(exp, { id: "x/E1/primary-1", role: "primary" });
    const b = simulateRun(exp, { id: "x/E1/primary-1", role: "primary" });
    expect(a.counts).toEqual(b.counts);
    expect(new Set(a.samples.map((s) => s.id)).size).toBe(a.samples.length);
  });
  it("paired sweeps produce consistent discordant pairs", () => {
    const inv = byId("instruction-following");
    const exp = inv.experiments[0];
    const sim = simulateRun(exp, { id: "instruction-following/E1/primary-1", role: "primary" });
    const { control, treatment } = sim.counts;
    expect(treatment.k - control.k).toBe(sim.discordant!.c - sim.discordant!.b);
    expect(sim.sweep).toHaveLength(8);
  });
});
