/**
 * Interpretation text generated from the numbers. It knows the direction of
 * an effect ("raises" / "lowers"), says when an interval includes zero, and
 * never claims more than the counts support.
 */
import { formatCIpp, formatP, formatPct, formatPP } from "@/lib/stats";
import {
  analyzeExperiment,
  finishedExperiments,
  holmAdjusted,
  verdictFor,
  type RunResult,
  type Verdict,
} from "./derive";
import type { Experiment, Investigation } from "./types";
import { STRENGTH_LABEL, type Assessment } from "@/lib/validity";

export function effectSizeLabel(h: number): string {
  const a = Math.abs(h);
  if (a < 0.2) return "very small";
  if (a < 0.5) return "small";
  if (a < 0.8) return "medium";
  return "large";
}

/** One mono line: "agreement rate 41.3% → 49.8% · Δ +8.5 pp [95% CI 1.6, 15.3] · p = 0.016" */
export function resultLine(exp: Experiment, r: RunResult): string {
  return `${exp.design.metric.name.toLowerCase()} ${formatPct(r.control.rate)} → ${formatPct(r.treatment.rate)} · Δ ${formatPP(
    r.diff,
  )} [95% CI ${formatCIpp(r.diffCI).replace(" to ", ", ")}] · ${formatP(r.p)}`;
}

export function experimentInterpretation(exp: Experiment): string {
  if (exp.status === "proposed") return "Not run yet.";
  if (exp.status === "running") return "In progress, no result yet.";
  if (exp.status === "failed") return "The run failed; there is no result.";
  const r = analyzeExperiment(exp);
  if (!r) return "No result recorded.";
  const m = exp.design.metric.name.toLowerCase();
  const { control: c, treatment: t } = exp.design;
  const numbers = `Δ ${formatPP(r.diff)}, 95% CI ${formatCIpp(r.diffCI)} pp, ${formatP(r.p)}`;
  if (r.effectFound) {
    const verb = r.diff > 0 ? "raises" : "lowers";
    return `${t.label} ${verb} the ${m} from ${formatPct(r.control.rate)} to ${formatPct(r.treatment.rate)} compared with ${c.label} (${numbers}). The interval excludes zero; the effect is ${effectSizeLabel(r.cohensH)} (Cohen's h = ${r.cohensH.toFixed(2).replace("-", "−")}).`;
  }
  return `The ${m} was ${formatPct(r.control.rate)} with ${c.label} and ${formatPct(r.treatment.rate)} with ${t.label} (${numbers}). The interval includes zero, so this sample cannot tell the difference apart from no effect.`;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  supported: "Supported",
  "partly-supported": "Partly supported",
  rejected: "Rejected",
  untested: "Untested",
};

/** The overview's conclusion paragraph, one sentence per hypothesis. */
export function investigationInterpretation(inv: Investigation): string {
  const done = finishedExperiments(inv);
  if (!done.length) {
    const proposed = inv.experiments.filter((e) => e.status === "proposed").length;
    const running = inv.experiments.filter((e) => e.status === "running").length;
    const parts = [
      running ? `${running} experiment${running > 1 ? "s" : ""} running` : null,
      proposed ? `${proposed} experiment${proposed > 1 ? "s" : ""} proposed` : null,
    ].filter(Boolean);
    const list = parts.join(", ");
    return `Not enough evidence yet.${list ? ` ${list.charAt(0).toUpperCase()}${list.slice(1)}.` : ""}`;
  }
  const adjusted = holmAdjusted(inv);
  const sentences = inv.hypotheses.map((h) => {
    const { verdict, experiments, failsHolm } = verdictFor(inv, h);
    const finished = experiments.filter((e) => analyzeExperiment(e));
    if (verdict === "untested") {
      const pending = experiments.find((e) => e.status === "running" || e.status === "proposed");
      return `${h.id} is untested${pending ? ` (${pending.id} ${pending.status})` : ""}.`;
    }
    const e = verdict === "rejected" && failsHolm.length ? failsHolm[0] : finished[0];
    const r = analyzeExperiment(e)!;
    const nums = `${e.id}: Δ ${formatPP(r.diff)}, 95% CI ${formatCIpp(r.diffCI)} pp`;
    if (verdict === "supported") return `${h.id} is supported (${nums}${finished.length > 1 ? `, and ${finished.length - 1} more` : ""}).`;
    if (verdict === "rejected" && failsHolm.length) {
      return `${h.id} is not supported: the interval excludes zero (${nums}), but the effect does not survive the Holm correction across ${adjusted.size} primary tests (adjusted ${formatP(adjusted.get(e.id)!)}).`;
    }
    if (verdict === "rejected") return `${h.id} is not supported (${nums}).`;
    return `${h.id} is partly supported: results differ across ${finished.map((x) => x.id).join(", ")}.`;
  });
  return sentences.join(" ");
}

/** "Moderate · effect found" */
export function strengthLine(a: Assessment): string {
  if (a.strength === "not-enough") return STRENGTH_LABEL["not-enough"];
  return `${STRENGTH_LABEL[a.strength]} · ${a.result === "effect-found" ? "effect found" : "no clear effect"}`;
}

/* ── The demo assistant: answers only what this investigation's data supports ── */

export interface Answer {
  text: string;
  refs: string[];
}

const CANT = "I can't answer that in demo mode. I can report effects, intervals, p-values, sample sizes, hypothesis verdicts, validity checks and next steps for this investigation.";

export function answerQuestion(inv: Investigation, question: string, assessment: Assessment): Answer {
  const q = question.toLowerCase();
  const done = finishedExperiments(inv);
  const ids = Array.from(new Set((question.match(/\b[EH]\d+\b/gi) ?? []).map((s) => s.toUpperCase())));
  const refs: string[] = [];

  // A specific object: E3, H2
  if (ids.length) {
    const lines = ids.map((id) => {
      const exp = inv.experiments.find((e) => e.id === id);
      if (exp) {
        refs.push(exp.id);
        return `${exp.id} (${exp.title}): ${experimentInterpretation(exp)}`;
      }
      const h = inv.hypotheses.find((x) => x.id === id);
      if (h) {
        refs.push(h.id);
        const v = verdictFor(inv, h);
        v.experiments.forEach((e) => refs.push(e.id));
        return `${h.id}: “${h.text}” Verdict: ${VERDICT_LABEL[v.verdict].toLowerCase()}${v.experiments.length ? `, from ${v.experiments.map((e) => e.id).join(", ")}` : ""}.`;
      }
      return `There is no ${id} in this investigation.`;
    });
    return { text: lines.join(" "), refs };
  }

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("significan", "p-value", "p value", "holm", "multiple comparison")) {
    if (!done.length) return { text: "No experiment has finished, so there are no p-values yet.", refs };
    const adj = holmAdjusted(inv);
    const lines = done.map((e) => {
      const r = analyzeExperiment(e)!;
      refs.push(e.id);
      const a = adj.get(e.id);
      return `${e.id}: ${r.test}, ${formatP(r.p)}${a !== undefined && adj.size > 1 ? ` (Holm-adjusted ${formatP(a).replace("p ", "")})` : ""}.`;
    });
    return { text: lines.join(" "), refs };
  }

  if (has("sample", "how many", " n ", "n=", "size")) {
    if (!done.length) {
      const planned = inv.experiments.map((e) => `${e.id}: ${e.design.nPerArm} per arm planned`).join("; ");
      return { text: `Nothing has been scored yet. ${planned}.`, refs: inv.experiments.map((e) => e.id) };
    }
    const lines = done.map((e) => {
      const r = analyzeExperiment(e)!;
      refs.push(e.id);
      return `${e.id}: n = ${r.control.n} control, ${r.treatment.n} treatment (${e.design.pairing}).`;
    });
    return { text: lines.join(" "), refs };
  }

  if (has("trust", "confiden", "strength", "reliab", "valid", "robust", "believe")) {
    const weak = assessment.perExperiment
      .filter((p) => p.checks)
      .flatMap((p) =>
        p.checks!
          .filter((c) => c.state === "fail" || c.state === "unknown" || c.state === "warn")
          .filter((c) => ["C1", "C2", "C3", "C4", "C5", "C7", "C8"].includes(c.id))
          .map((c) => `${p.exp.id} ${c.id} (${c.label.toLowerCase()}): ${c.reason}`),
      );
    assessment.perExperiment.forEach((p) => p.checks && refs.push(p.exp.id));
    return {
      text: `Evidence strength: ${strengthLine(assessment)}.${weak.length ? ` What keeps it from being stronger: ${weak.slice(0, 4).join("; ")}.` : " Every core check passes."}`,
      refs,
    };
  }

  if (has("hypothes", "verdict", "support")) {
    const lines = inv.hypotheses.map((h) => {
      refs.push(h.id);
      return `${h.id}: ${VERDICT_LABEL[verdictFor(inv, h).verdict].toLowerCase()}.`;
    });
    return { text: lines.join(" "), refs };
  }

  if (has("next", "should", "follow", "replicat", "what now")) {
    const proposed = inv.experiments.filter((e) => e.status === "proposed");
    const unreplicated = done.filter((e) => !e.runs.some((r) => r.role === "replication"));
    const parts: string[] = [];
    if (proposed.length) {
      proposed.forEach((e) => refs.push(e.id));
      parts.push(`Run the proposed experiment${proposed.length > 1 ? "s" : ""}: ${proposed.map((e) => e.id).join(", ")}.`);
    }
    if (unreplicated.length) {
      unreplicated.forEach((e) => refs.push(e.id));
      parts.push(`Replicate ${unreplicated.map((e) => e.id).join(", ")} with a new seed.`);
    }
    if (assessment.competing.state !== "pass") parts.push("State and test a competing explanation (check C9).");
    return { text: parts.length ? parts.join(" ") : "Every experiment has finished and been replicated.", refs };
  }

  if (has("effect", "result", "differ", "how big", "delta", "Δ", "find", "found", "show", "conclu", "summar", "what did")) {
    if (!done.length) return { text: investigationInterpretation(inv), refs: inv.experiments.map((e) => e.id) };
    const lines = done.map((e) => {
      refs.push(e.id);
      return `${e.id}: ${resultLine(e, analyzeExperiment(e)!)}.`;
    });
    return { text: `${lines.join(" ")} ${strengthLine(assessment)}.`, refs };
  }

  return { text: CANT, refs };
}
