import { describe, expect, it } from "vitest";
import { DEFAULT_CAPS } from "./budget";
import { DEFAULT_QUESTION, draftPlan, validatePlan } from "./draft";
import { LiveError } from "./errors";
import { FakeLLM } from "./llm/fake";
import { GOOD_PLAN } from "./test-fixtures";

type Loose = Record<string, unknown> & { arms: Record<string, unknown>[]; cases: Record<string, unknown>[]; hypotheses: Record<string, unknown>[]; experiments: Record<string, unknown>[] };
const clone = () => structuredClone(GOOD_PLAN) as unknown as Loose;
const Q = "Which change moved accuracy?";
const problemsOf = (v: unknown) => {
  const r = validatePlan(v, DEFAULT_CAPS, Q);
  return r.ok ? [] : r.problems;
};

describe("plan validation: a study built from the researcher's question", () => {
  it("accepts a valid plan, numbers its cases and experiments, and keeps the question", () => {
    const r = validatePlan(GOOD_PLAN, DEFAULT_CAPS, Q);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.study.question).toBe(Q);
    expect(r.plan.study.cases[0].id).toBe("C01");
    expect(r.plan.experiments.map((e) => [e.id, e.hypothesisId, e.control, e.treatment, e.n])).toEqual([
      ["E1", "H1", "A", "B", 24],
      ["E2", "H2", "A", "C", 24],
    ]);
    expect(r.plan.experiments[0].rationale).toBe("Isolates the prompt.");
    expect(r.plan.experiments[1].rationale).toBeNull();
  });

  it("only allows the closed check kinds", () => {
    const p = clone();
    p.cases[0].check = { kind: "llm_judge", rubric: "is it good" };
    expect(problemsOf(p).join()).toMatch(/cases\.0\.check/);
  });

  it("experiments must compare two different arms of the study", () => {
    const p = clone();
    p.experiments[0].treatment = "Z";
    expect(problemsOf(p).join()).toMatch(/No arm Z/);
    const q = clone();
    q.experiments[0].treatment = "A";
    expect(problemsOf(q).join()).toMatch(/different arms/);
  });

  it("enforces the budget on cases, arms and temperature", () => {
    const p = clone();
    p.cases = p.cases.slice(0, 3);
    expect(problemsOf(p).join()).toMatch(/at least/);
    const q = clone();
    q.cases = [...q.cases, ...q.cases.map((c, i) => ({ ...c, prompt: `${c.prompt} (${i})` }))];
    expect(problemsOf(q).join()).toMatch(/at most/);
    const r = clone();
    r.arms[1].temperature = 1.7;
    expect(problemsOf(r).join()).toMatch(/arms\.1\.temperature/);
  });

  it("needs at least two hypotheses, one of them competing, each tested", () => {
    const p = clone();
    p.hypotheses = p.hypotheses.map((h) => ({ ...h, competing: false }));
    expect(problemsOf(p).join()).toMatch(/competing/);
    const q = clone();
    q.experiments = [q.experiments[0], { ...q.experiments[1], hypothesis: "H1" }];
    expect(problemsOf(q).join()).toMatch(/H2 is not tested/);
  });

  it("rejects numeric effect sizes in hypotheses and duplicate cases", () => {
    const p = clone();
    p.hypotheses[0].text = "The short prompt lowers accuracy by 30%.";
    expect(problemsOf(p).join()).toMatch(/hypotheses\.0\.text/);
    const q = clone();
    q.cases[1].prompt = q.cases[0].prompt;
    expect(problemsOf(q).join()).toMatch(/Duplicate case/);
  });
});

describe("draft loop: validate and repair, never invent", () => {
  it("returns the first valid plan and sends the researcher's question as quoted data", async () => {
    const llm = new FakeLLM("reasoner", [JSON.stringify(GOOD_PLAN)]);
    const attempts: boolean[] = [];
    const { plan, attempts: n } = await draftPlan({ llm, caps: DEFAULT_CAPS, target: "fake-target", objective: "Why do plastics decompose slowly?", onAttempt: (_, ok) => attempts.push(ok) });
    expect(n).toBe(1);
    expect(plan.hypotheses).toHaveLength(2);
    expect(plan.study.question).toBe("Why do plastics decompose slowly?");
    expect(attempts).toEqual([true]);
    expect(llm.calls[0].json).toBe(true);
    expect(llm.calls[0].system).toContain("fake-target");
    expect(llm.calls[0].messages[0].content).toContain('"""Why do plastics decompose slowly?"""');
  });

  it("uses the default question when none is given", async () => {
    const llm = new FakeLLM("reasoner", [JSON.stringify(GOOD_PLAN)]);
    const { plan } = await draftPlan({ llm, caps: DEFAULT_CAPS, target: "t" });
    expect(plan.study.question).toBe(DEFAULT_QUESTION);
  });

  it("feeds the validator's problems back and accepts the repaired plan", async () => {
    const bad = clone();
    bad.experiments[0].treatment = "Z";
    const llm = new FakeLLM("reasoner", ["not json at all", JSON.stringify(bad), "```json\n" + JSON.stringify(GOOD_PLAN) + "\n```"]);
    const seen: [number, boolean][] = [];
    const { attempts } = await draftPlan({ llm, caps: DEFAULT_CAPS, target: "t", onAttempt: (a, ok) => seen.push([a, ok]) });
    expect(attempts).toBe(3);
    expect(seen).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    const second = llm.calls[1].messages;
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second[1].content).toBe("not json at all");
    expect(second[2].content).toMatch(/did not contain a JSON object/);
    expect(llm.calls[2].messages.at(-1)!.content).toMatch(/No arm Z/);
  });

  it("fails clearly after two repairs, without inventing a plan", async () => {
    const llm = new FakeLLM("reasoner", ["{}", "{}", "{}", JSON.stringify(GOOD_PLAN)]);
    const err = await draftPlan({ llm, caps: DEFAULT_CAPS, target: "t" }).catch((e) => e);
    expect(err).toBeInstanceOf(LiveError);
    expect(err.code).toBe("draft-invalid");
    expect(llm.calls).toHaveLength(3);
  });
});
