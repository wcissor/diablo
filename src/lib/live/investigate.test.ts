import { describe, expect, it } from "vitest";
import { analyzeExperiment, holmAdjusted, isLiveInvestigation, verdictFor } from "@/lib/data/derive";
import { seedInvestigations } from "@/lib/data/mock/fixtures";
import { investigationSchema } from "@/lib/data/schema";
import { CREATED_ID } from "@/lib/slug";
import { mcnemarExact } from "@/lib/stats";
import { DEFAULT_CAPS } from "./budget";
import { makeItems } from "./dataset";
import { templateConclusion } from "./grounding";
import { analyze } from "./analyze";
import { investigate } from "./investigate";
import { FakeLLM, fakeTarget, type FakeReply } from "./llm/fake";
import { LLMError, type LLMRequest } from "./llm/types";
import { GOOD_PLAN } from "./test-fixtures";
import type { LiveEvent, Models } from "./types";

const items = makeItems(40);
const answers = new Map(items.map((i) => [i.prompt, i.answer]));
const accuracy = (r: LLMRequest) => (r.system.startsWith("You are Helper. Be brief") ? 0.4 : 0.95) - (r.temperature === 1 ? 0.03 : 0);
const models: Models = { provider: "fake", reasoning: "fake-reasoner", target: "fake-target" };
const caps = { ...DEFAULT_CAPS, concurrency: 4 };
const ID = "live-helper-abc123";

/** Finds a fact id in the fact table the interpret prompt carries, by its label. */
function factId(req: LLMRequest, label: string): string {
  const line = req.messages[0].content.split("\n").find((l) => l.includes(` ${label}`));
  const m = line && /^\{\{(F\d+)\}\}/.exec(line);
  if (!m) throw new Error(`no fact labelled ${label}`);
  return m[1];
}

const isDraft = (req: LLMRequest) => req.system.includes("research planner");

/** A reasoning model that plans well and then writes the given conclusions in turn. */
function reasoner(conclusions: ((req: LLMRequest) => FakeReply)[]) {
  let i = 0;
  return new FakeLLM("fake-reasoner", (req) => (isDraft(req) ? JSON.stringify(GOOD_PLAN) : conclusions[i++](req)));
}

const groundedConclusion = (req: LLMRequest) =>
  JSON.stringify({
    conclusion: `In {{E1}}, accuracy went from {{${factId(req, "E1 control accuracy")}}} to {{${factId(req, "E1 treatment accuracy")}}} (${"{{"}${factId(
      req,
      "E1 difference",
    )}}}, {{${factId(req, "E1 Holm-adjusted")}}} after the Holm correction), so {{H1}} is {{${factId(req, "H1 verdict")}}}. {{E2}} found {{${factId(
      req,
      "E2 outcome",
    )}}}. Revert the prompt first.`,
  });

async function run(reasoning: FakeLLM, target = fakeTarget(answers, accuracy)) {
  const events: LiveEvent[] = [];
  const result = await investigate({ reasoning, target, models, caps, id: ID, emit: (e) => events.push(e) });
  return { result, events, target };
}

describe("live investigation, end to end with fakes", () => {
  it("drafts, runs, analyses and interprets, emitting each stage in order", async () => {
    const { result, events } = await run(reasoner([groundedConclusion]));
    const stages = events.filter((e) => e.type === "stage").map((e) => `${e.stage}:${e.state}`);
    expect(stages).toEqual(["draft:started", "draft:done", "run:started", "run:done", "analyze:started", "analyze:done", "interpret:started", "interpret:done"]);
    expect(events[0].type).toBe("start");
    expect(events.at(-1)!.type).toBe("result");
    const plan = events.find((e) => e.type === "plan");
    // E1 and E2 share arm A as their control: 3 arms × 24 cases.
    expect(plan && plan.type === "plan" && plan.plannedCalls).toBe(72);
    const progress = events.filter((e) => e.type === "progress");
    expect(progress).toHaveLength(72);
    expect(progress.at(-1)).toMatchObject({ progress: { done: 72, total: 72, scored: 72 } });

    expect(result.usage.byStage).toEqual({
      draft: { calls: 1, inputTokens: 100, outputTokens: 20 },
      run: { calls: 72, inputTokens: 72 * 60, outputTokens: 72 * 30 },
      interpret: { calls: 1, inputTokens: 100, outputTokens: 20 },
    });
    expect(result.usage.calls).toBe(74);
  });

  it("produces an Investigation the app's own schema and statistics accept", async () => {
    const { result } = await run(reasoner([groundedConclusion]));
    const inv = result.investigation;
    expect(investigationSchema.safeParse(inv).success).toBe(true);
    expect(inv.id).toMatch(CREATED_ID);
    expect(inv.experiments.map((e) => e.status)).toEqual(["complete", "complete"]);
    for (const e of inv.experiments) {
      const run = e.runs[0];
      expect(run.samples).toHaveLength(2 * run.counts!.control.n);
      expect(run.samples.every((s) => !s.simulated)).toBe(true);
      // The p-value is the exact McNemar test on the counted discordant pairs.
      expect(analyzeExperiment(e)!.p).toBe(mcnemarExact(run.discordant!.b, run.discordant!.c));
    }
    expect(holmAdjusted(inv).size).toBe(2);
    // The prompt change is a large drop; the temperature change is not distinguishable from zero.
    const [e1, e2] = inv.experiments.map((e) => analyzeExperiment(e)!);
    expect(e1.effectFound).toBe(true);
    expect(e1.diff).toBeLessThan(0);
    expect(e2.effectFound).toBe(false);
    expect(verdictFor(inv, inv.hypotheses[0]).verdict).toBe("supported");
    expect(verdictFor(inv, inv.hypotheses[1]).verdict).toBe("rejected");
  });

  it("is recognised as live (never simulated); the demo's seeded investigations are not", async () => {
    const { result } = await run(reasoner([groundedConclusion]));
    expect(isLiveInvestigation(result.investigation)).toBe(true);
    expect(result.investigation.experiments.every((e) => e.simulation === null)).toBe(true);
    for (const inv of seedInvestigations(Date.parse("2026-10-07T12:00:00Z"))) expect(isLiveInvestigation(inv)).toBe(false);
  });

  it("publishes the model's conclusion only with numbers from the fact table", async () => {
    const { result } = await run(reasoner([groundedConclusion]));
    const c = result.conclusion;
    expect(c.source).toBe("model");
    expect(c.attempts).toBe(1);
    expect(c.raw).toContain("{{F");
    expect(c.text).not.toMatch(/\{\{|\}\}/);
    // Every number in the published text is a value code computed.
    const values = c.facts.map((f) => f.value).join(" | ");
    for (const n of c.text.match(/\d+(?:\.\d+)?/g) ?? []) expect(values).toContain(n);
    expect(result.investigation.events.at(-1)).toMatchObject({ kind: "conclusion", text: c.text });
  });

  it("retries once, then falls back to the code-built summary when the model writes numbers", async () => {
    const digits = () => JSON.stringify({ conclusion: "{{E1}} lost about 50 points ({{F4}})." });
    const reasoning = reasoner([digits, digits]);
    const { result, events } = await run(reasoning);
    expect(reasoning.calls.filter((r) => !isDraft(r))).toHaveLength(2);
    expect(reasoning.calls.at(-1)!.messages.at(-1)!.content).toMatch(/number was written outside a placeholder/);
    expect(events.filter((e) => e.type === "interpret-attempt").map((e) => e.type === "interpret-attempt" && e.ok)).toEqual([false, false]);
    const c = result.conclusion;
    expect(c.source).toBe("template");
    expect(c.raw).toBeNull();
    expect(c.rejections).toHaveLength(2);
    expect(c.text).toBe(templateConclusion(result.investigation, analyze(result.investigation, models)));
  });

  it("accepts the retry when it passes", async () => {
    const { result } = await run(reasoner([() => JSON.stringify({ conclusion: "Accuracy fell by half." }), groundedConclusion]));
    expect(result.conclusion).toMatchObject({ source: "model", attempts: 2 });
    expect(result.conclusion.rejections).toHaveLength(1);
  });

  it("falls back to the summary when the interpret call itself fails", async () => {
    const { result } = await run(reasoner([() => new LLMError("server", "down", { provider: "fake" })]));
    expect(result.conclusion.source).toBe("template");
    expect(result.conclusion.rejections[0][0]).toMatch(/model call failed/);
  });

  it("meters the tokens of a reasoning call that failed after it was billed", async () => {
    const cut = new LLMError("bad-response", "The reply hit the output limit (max_tokens 4096) before it finished.", {
      provider: "anthropic",
      usage: { inputTokens: 1500, outputTokens: 4096 },
    });
    const { result } = await run(reasoner([() => cut]));
    expect(result.conclusion.source).toBe("template");
    expect(result.usage.byStage.interpret).toEqual({ calls: 1, inputTokens: 1500, outputTokens: 4096 });
  });

  it("fails clearly, with no run, when no valid plan arrives", async () => {
    const reasoning = new FakeLLM("fake-reasoner", () => '{"hypotheses": []}');
    const target = fakeTarget(answers, accuracy);
    const events: LiveEvent[] = [];
    await expect(investigate({ reasoning, target, models, caps, id: ID, emit: (e) => events.push(e) })).rejects.toMatchObject({ code: "draft-invalid" });
    expect(target.calls).toHaveLength(0);
    expect(reasoning.calls).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: "error", stage: "draft", code: "draft-invalid" });
    expect(events.some((e) => e.type === "plan" || e.type === "result")).toBe(false);
  });

  it("keeps inside the route's time budget: slow planning shortens the run, which analyses what finished", async () => {
    const base = Date.now();
    let offset = 0;
    const reasoning = new FakeLLM("fake-reasoner", (req) => {
      if (isDraft(req)) {
        offset = 260_000; // planning "took" 260 s of the 285 s budget
        return JSON.stringify(GOOD_PLAN);
      }
      return groundedConclusion(req);
    });
    const target = fakeTarget(answers, accuracy, { delayMs: 80 });
    const result = await investigate({ reasoning, target, models, caps, id: ID, now: () => base + offset + (Date.now() - base) });
    expect(result.run.deadlineHit).toBe(true);
    expect(result.run.cancelled).toBeGreaterThan(0);
    expect(result.run.perExperiment.every((e) => e.completedPairs < e.plannedPairs)).toBe(true);
    // The interpretation still ran, with a shortened timeout.
    expect(reasoning.calls.at(-1)!.timeoutMs).toBeLessThanOrEqual(12_500);
    expect(result.conclusion.source).toBe("model");
  });

  it("reports a fatal provider error from the run stage", async () => {
    const target = fakeTarget(answers, accuracy, { failWhen: () => new LLMError("quota", "Daily quota used up", { provider: "fake" }) });
    const events: LiveEvent[] = [];
    await expect(investigate({ reasoning: reasoner([groundedConclusion]), target, models, caps, id: ID, emit: (e) => events.push(e) })).rejects.toBeInstanceOf(LLMError);
    expect(events.at(-1)).toMatchObject({ type: "error", stage: "run", code: "provider", kind: "quota", message: "Daily quota used up" });
  });
});
