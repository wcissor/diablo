import { describe, expect, it } from "vitest";
import { DEFAULT_CAPS, type LiveCaps } from "./budget";
import { makeItems } from "./dataset";
import { LiveError } from "./errors";
import { fakeTarget, FakeLLM } from "./llm/fake";
import { LLMError, type LLMRequest } from "./llm/types";
import { assertWithinCaps, runPaired, scheduleCalls } from "./runner";
import { TEST_STUDY, toCases } from "./test-fixtures";
import type { PlannedExperiment } from "./types";

const raw = makeItems(40);
const items = toCases(raw);
const answers = new Map(raw.map((i) => [i.prompt, i.answer]));
const caps: LiveCaps = { ...DEFAULT_CAPS, concurrency: 3 };

const E1: PlannedExperiment = {
  id: "E1",
  hypothesisId: "H1",
  title: "Prompt ablation",
  rationale: null,
  control: "A",
  treatment: "B",
  n: 40,
};
const E2: PlannedExperiment = {
  id: "E2",
  hypothesisId: "H2",
  title: "Temperature ablation",
  rationale: null,
  control: "A",
  treatment: "C",
  n: 30,
};

/** Accuracy by configuration: the full prompt is good, the short one is not; temperature barely matters. */
const accuracy = (r: LLMRequest) => (r.system.startsWith("You are Helper. Be brief") ? 0.4 : 0.95) - (r.temperature === 1 ? 0.03 : 0);

describe("paired runner", () => {
  it("runs the same items in both arms and calls a shared arm once per item", async () => {
    const target = fakeTarget(answers, accuracy);
    const out = await runPaired({ study: TEST_STUDY, target, plan: [E1, E2], items, caps });
    // E1 and E2 share Helper v1 as control: 40 (v1) + 40 (short) + 30 (temperature 1.0).
    expect(target.calls).toHaveLength(110);
    expect(out.calls).toEqual({ done: 110, total: 110, scored: 110, failed: 0, cancelled: 0 });
    for (const e of out.experiments) {
      for (const p of e.pairs) {
        expect(p.control.item).toBe(p.treatment.item);
        expect(p.control.settings).not.toEqual(p.treatment.settings);
      }
    }
    const [e1, e2] = out.experiments;
    expect([e1.pairs.length, e2.pairs.length]).toEqual([40, 30]);
    // E2's control answers are E1's control answers on the same items.
    expect(e2.pairs.map((p) => p.control)).toEqual(e1.pairs.slice(0, 30).map((p) => p.control));
  });

  it("counts k, n and the discordant pairs from the scored pairs", async () => {
    const out = await runPaired({ study: TEST_STUDY, target: fakeTarget(answers, accuracy), plan: [E1, E2], items, caps });
    for (const e of out.experiments) {
      const kc = e.pairs.filter((p) => p.control.score === 1).length;
      const kt = e.pairs.filter((p) => p.treatment.score === 1).length;
      expect(e.counts).toEqual({ control: { k: kc, n: e.pairs.length }, treatment: { k: kt, n: e.pairs.length } });
      // McNemar's identity: the difference in successes is c − b.
      expect(kt - kc).toBe(e.discordant.c - e.discordant.b);
    }
    expect(out.experiments[0].counts.control.k).toBeGreaterThan(out.experiments[0].counts.treatment.k);
  });

  it("queues calls item by item, so partial runs stay balanced", () => {
    const tasks = scheduleCalls([E1, E2], items);
    expect(tasks.slice(0, 3).map((t) => t.item.id)).toEqual(["A001", "A001", "A001"]);
    expect(tasks.slice(3, 6).map((t) => t.item.id)).toEqual(["A002", "A002", "A002"]);
  });

  it("never has more calls in flight than the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const target = new FakeLLM("t", async (req) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return `Answer: ${answers.get(req.messages[0].content)}`;
    });
    await runPaired({ study: TEST_STUDY, target, plan: [E1], items, caps: { ...caps, concurrency: 4 } });
    expect(peak).toBe(4);
  });

  it("refuses a plan outside the caps, whoever wrote it", async () => {
    expect(() => assertWithinCaps([E1, E2, { ...E2, id: "E3" }], items, caps)).toThrow(LiveError);
    expect(() => assertWithinCaps([{ ...E1, n: caps.maxItemsPerArm + 1 }], toCases(makeItems(100)), caps)).toThrow(/limit/);
    expect(() => assertWithinCaps([{ ...E1, n: 5 }], items, caps)).toThrow(/limit/);
    const target = fakeTarget(answers, accuracy);
    await expect(runPaired({ study: TEST_STUDY, target, plan: [{ ...E1, n: 41 }], items: toCases(makeItems(41)), caps: { ...caps, maxItemsPerArm: 40 } })).rejects.toMatchObject({
      code: "budget",
    });
    expect(target.calls).toHaveLength(0);
  });

  it("leaves a pair out when one of its calls failed; a failure is never scored as wrong", async () => {
    const target = fakeTarget(answers, () => 1, {
      failWhen: (req) => (req.messages[0].content === items[3].prompt && req.system.startsWith("You are Helper. Be brief") ? new LLMError("timeout", "slow", { provider: "fake" }) : null),
    });
    const out = await runPaired({ study: TEST_STUDY, target, plan: [E1], items, caps });
    expect(out.calls.failed).toBe(1);
    expect(out.experiments[0].pairs).toHaveLength(39);
    expect(out.experiments[0].excludedPairs).toBe(1);
    expect(out.experiments[0].counts).toEqual({ control: { k: 39, n: 39 }, treatment: { k: 39, n: 39 } });
  });

  it("counts the tokens a failed call was billed for (a reply cut off at max_tokens), and still leaves its pair out", async () => {
    const cut = new LLMError("bad-response", "The reply hit the output limit (max_tokens 2048) before it finished.", {
      provider: "anthropic",
      usage: { inputTokens: 70, outputTokens: 2048 },
    });
    const target = fakeTarget(answers, () => 1, { failWhen: (req) => (req.messages[0].content === items[0].prompt && req.temperature === 0.2 && req.system.startsWith("You are Helper. Be brief") ? cut : null) });
    const out = await runPaired({ study: TEST_STUDY, target, plan: [{ ...E1, n: 10 }], items, caps });
    expect(out.calls.failed).toBe(1);
    expect(out.experiments[0].excludedPairs).toBe(1);
    // 19 scored calls at 60 in / 30 out each (the fake), plus the billed failure.
    expect(out.usage).toEqual({ inputTokens: 19 * 60 + 70, outputTokens: 19 * 30 + 2048 });
  });

  it("a rate limit pauses the pool and re-queues the call instead of failing it", async () => {
    let limited = 0;
    const target = fakeTarget(answers, () => 1, {
      failWhen: (req) => {
        // The first three calls on item A002 are rate-limited, then it goes through.
        if (req.messages[0].content === items[1].prompt && limited < 3) {
          limited++;
          return new LLMError("rate-limit", "slow down", { provider: "fake", retryAfterMs: 5 });
        }
        return null;
      },
    });
    const out = await runPaired({ study: TEST_STUDY, target, plan: [E1], items, caps });
    expect(limited).toBe(3);
    expect(out.calls).toMatchObject({ done: 80, total: 80, scored: 80, failed: 0 });
    expect(out.experiments[0].pairs).toHaveLength(40);
  });

  it("a call still rate-limited after its re-queues fails, and only its pair is left out", async () => {
    const target = fakeTarget(answers, () => 1, {
      failWhen: (req) =>
        req.messages[0].content === items[0].prompt && req.system.startsWith("You are Helper. Be brief")
          ? new LLMError("rate-limit", "slow down", { provider: "fake", retryAfterMs: 1 })
          : null,
    });
    const out = await runPaired({ study: TEST_STUDY, target, plan: [E1], items, caps });
    expect(out.calls.failed).toBe(1);
    expect(out.experiments[0].pairs).toHaveLength(39);
    // One first try plus MAX_REQUEUES more.
    expect(target.calls.filter((r) => r.messages[0].content === items[0].prompt && r.system.startsWith("You are Helper. Be brief"))).toHaveLength(4);
  });

  it("stops at once on a fatal provider error (bad key)", async () => {
    const target = fakeTarget(answers, () => 1, { failWhen: (_, i) => (i === 5 ? new LLMError("auth", "bad key", { provider: "fake" }) : null) });
    const err = await runPaired({ study: TEST_STUDY, target, plan: [E1, E2], items, caps }).catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.kind).toBe("auth");
    expect(target.calls.length).toBeLessThan(15);
  });

  it("stops when too many calls fail", async () => {
    const target = fakeTarget(answers, () => 1, { failWhen: () => new LLMError("network", "down", { provider: "fake" }) });
    const err = await runPaired({ study: TEST_STUDY, target, plan: [E1], items, caps }).catch((e) => e);
    expect(err).toBeInstanceOf(LiveError);
    expect(err.code).toBe("too-many-failures");
    expect(target.calls.length).toBeLessThan(80);
  });

  it("at the deadline, cancels what is left and keeps the finished pairs", async () => {
    const target = fakeTarget(answers, () => 1, { delayMs: 15 });
    const out = await runPaired({ study: TEST_STUDY, target, plan: [E1], items, caps: { ...caps, concurrency: 2, runDeadlineMs: 100 } });
    expect(out.deadlineHit).toBe(true);
    expect(out.calls.cancelled).toBeGreaterThan(0);
    const pairs = out.experiments[0].pairs.length;
    expect(pairs).toBeGreaterThan(0);
    expect(pairs).toBeLessThan(40);
    expect(out.experiments[0].counts.control.n).toBe(pairs);
  });

  it("a cancelled request stops the run", async () => {
    const ctrl = new AbortController();
    const target = fakeTarget(answers, () => 1, { delayMs: 5 });
    setTimeout(() => ctrl.abort(), 20);
    await expect(runPaired({ study: TEST_STUDY, target, plan: [E1], items, caps, signal: ctrl.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(target.calls.length).toBeLessThan(80);
  });
});
