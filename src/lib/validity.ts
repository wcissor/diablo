/**
 * Validity checks: what a researcher needs to trust a result.
 *
 * Rubric v0, draft. The thresholds below are open decisions (see
 * CHANGELOG-REDESIGN.md). "Not recorded" is a state of its own: a check never
 * passes because a field is missing.
 */
import { formatCIpp, formatP, formatPP } from "@/lib/stats";
import {
  ALPHA,
  analyzeExperiment,
  analyzeRun,
  finishedExperiments,
  holmAdjusted,
  replicationRuns,
  survivesHolm,
  verdictFor,
} from "@/lib/data/derive";
import type { Experiment, Investigation } from "@/lib/data/types";

export const RUBRIC_LABEL = "Rubric v0, draft";

export const THRESHOLDS = {
  /** Below this many items per arm a sample is "very small". */
  minPerArm: 30,
  /** Draft threshold for judge–human agreement. */
  humanAgreement: 0.8,
  /** Significance level used after the Holm correction (a hypothesis verdict needs it too: derive.ts). */
  alpha: ALPHA,
} as const;

export type CheckId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9";
/** pass ✓ · warn ! · fail ! · unknown – (not recorded / not yet) · na – (does not apply) · info (C6, the result itself) */
export type CheckState = "pass" | "warn" | "fail" | "unknown" | "na" | "info";

export interface Check {
  id: CheckId;
  label: string;
  state: CheckState;
  reason: string;
}

export const CHECK_LABELS: Record<CheckId, string> = {
  C1: "Control arm present",
  C2: "Planned sample size reached",
  C3: "Assignment randomised or seed recorded",
  C4: "Scorer independent of the target",
  C5: "Scorer checked against human labels",
  C6: "Result",
  C7: "Multiple comparisons handled",
  C8: "Replicated in the same direction",
  C9: "A competing hypothesis tested",
};

export type FamilyOf = (systemId: string) => string | null;

const check = (id: CheckId, state: CheckState, reason: string): Check => ({ id, label: CHECK_LABELS[id], state, reason });

/** C1–C8 for one experiment. Returns null when the experiment has no finished run. */
export function experimentChecks(inv: Investigation, exp: Experiment, familyOf: FamilyOf): Check[] | null {
  const r = analyzeExperiment(exp);
  if (!r || exp.status !== "complete") return null;
  const d = exp.design;
  const out: Check[] = [];

  // C1
  out.push(
    r.control.n > 0
      ? check("C1", "pass", `Control arm: ${d.control.label}, n = ${r.control.n}`)
      : check("C1", "fail", "No control observations"),
  );

  // C2
  const minN = Math.min(r.control.n, r.treatment.n);
  if (minN < THRESHOLDS.minPerArm) {
    out.push(check("C2", "fail", `Very small: n = ${minN} per arm (planned ${d.nPerArm})`));
  } else if (minN < d.nPerArm) {
    out.push(check("C2", "warn", `Reached ${minN} of ${d.nPerArm} planned per arm`));
  } else {
    out.push(check("C2", "pass", `${minN} per arm, as planned`));
  }

  // C3
  if (d.randomized === true) {
    out.push(check("C3", "pass", d.seed !== null ? `Randomised, seed ${d.seed}` : "Randomised (seed not recorded)"));
  } else if (d.seed !== null) {
    out.push(check("C3", "pass", `Seed ${d.seed} recorded`));
  } else if (d.randomized === false) {
    out.push(check("C3", "fail", "Not randomised and no seed recorded"));
  } else {
    out.push(check("C3", "unknown", "Not recorded"));
  }

  // C4
  const s = d.scorer;
  if (s.kind === "rule") out.push(check("C4", "pass", `Rule-based scorer: ${s.name}`));
  else if (s.kind === "human") out.push(check("C4", "pass", `Human raters: ${s.name}`));
  else {
    const fams = [familyOf(d.control.systemId), familyOf(d.treatment.systemId)];
    if (s.family === null || fams.some((f) => f === null)) {
      out.push(check("C4", "unknown", `${s.name}: model family not recorded`));
    } else if (fams.includes(s.family)) {
      out.push(check("C4", "fail", `${s.name} is in the same family as the target (${s.family})`));
    } else {
      out.push(check("C4", "pass", `${s.name} (${s.family}) is from a different family than the target (${fams[1]})`));
    }
  }

  // C5
  const flagged = exp.runs.flatMap((run) => run.samples).filter((x) => x.flagged).length;
  if (s.kind === "rule") {
    out.push(
      flagged
        ? check("C5", "warn", `${flagged} score${flagged > 1 ? "s" : ""} flagged for review`)
        : check("C5", "na", "Deterministic rule; a human check does not apply"),
    );
  } else if (flagged) {
    out.push(check("C5", "warn", `${flagged} score${flagged > 1 ? "s" : ""} flagged for review`));
  } else if (s.humanAgreement === null) {
    out.push(check("C5", "unknown", "Not recorded"));
  } else if (s.humanAgreement >= THRESHOLDS.humanAgreement) {
    out.push(
      check(
        "C5",
        "pass",
        `Agreement with human labels ${s.humanAgreement.toFixed(2)}${s.humanAgreementN ? ` on ${s.humanAgreementN} items` : ""}`,
      ),
    );
  } else {
    out.push(
      check(
        "C5",
        "fail",
        `Agreement ${s.humanAgreement.toFixed(2)} is below the ${THRESHOLDS.humanAgreement.toFixed(2)} draft threshold`,
      ),
    );
  }

  // C6: the result, never a pass or a fail.
  out.push(
    check(
      "C6",
      "info",
      `${r.effectFound ? "Effect found" : "No clear effect"}: Δ ${formatPP(r.diff)}, 95% CI ${formatCIpp(r.diffCI)} pp`,
    ),
  );

  // C7
  const adj = holmAdjusted(inv);
  if (!d.primary) out.push(check("C7", "na", "Secondary analysis, outside the correction"));
  else if (adj.size <= 1) out.push(check("C7", "pass", "Single primary test"));
  else {
    const a = adj.get(exp.id)!;
    out.push(
      r.effectFound && !survivesHolm(adj, exp)
        ? check("C7", "warn", `Does not survive Holm correction: adjusted ${formatP(a)} across ${adj.size} tests, so it supports no hypothesis`)
        : check("C7", "pass", `Holm-adjusted ${formatP(a)} across ${adj.size} primary tests`),
    );
  }

  // C8
  const reps = replicationRuns(exp)
    .map((run) => analyzeRun(run, d.pairing))
    .filter((x) => x !== null);
  if (!reps.length) out.push(check("C8", "unknown", "Not replicated yet"));
  else {
    const same = reps.every((x) => Math.sign(x.diff) === Math.sign(r.diff) && x.diff !== 0);
    const last = reps[reps.length - 1];
    out.push(
      same
        ? check("C8", "pass", `Replication: Δ ${formatPP(last.diff)}, same direction`)
        : check("C8", "fail", `Replication went the other way: Δ ${formatPP(last.diff)}`),
    );
  }

  return out;
}

/** C9, at the investigation level. */
export function competingCheck(inv: Investigation): Check {
  const competing = inv.hypotheses.filter((h) => h.competing);
  if (!competing.length) return check("C9", "fail", "No competing hypothesis stated");
  const tested = competing.filter((h) => verdictFor(inv, h).verdict !== "untested");
  if (tested.length) return check("C9", "pass", `${tested.map((h) => h.id).join(", ")} tested`);
  return check("C9", "unknown", `${competing.map((h) => h.id).join(", ")} not tested yet`);
}

export type Strength = "not-enough" | "weak" | "moderate" | "strong";

export const STRENGTH_LABEL: Record<Strength, string> = {
  "not-enough": "Not enough evidence",
  weak: "Weak",
  moderate: "Moderate",
  strong: "Strong",
};

const passes = (c: Check | undefined) => !!c && (c.state === "pass" || c.state === "na");

/** Strength of one experiment from C1–C5, C7 and C8 only. */
export function strengthOf(checks: Check[] | null): Strength {
  if (!checks) return "not-enough";
  const by = (id: CheckId) => checks.find((c) => c.id === id);
  const core = (["C1", "C2", "C3", "C4", "C5"] as const).every((id) => passes(by(id)));
  if (!core) return "weak";
  return passes(by("C7")) && passes(by("C8")) ? "strong" : "moderate";
}

const ORDER: Strength[] = ["not-enough", "weak", "moderate", "strong"];

export interface Assessment {
  strength: Strength;
  /** null when nothing is finished. */
  result: "effect-found" | "no-clear-effect" | null;
  perExperiment: { exp: Experiment; checks: Check[] | null; strength: Strength }[];
  competing: Check;
}

/**
 * The investigation's evidence strength is its weakest finished primary
 * experiment (conservative by design: one weak link weakens the claim).
 */
export function assess(inv: Investigation, familyOf: FamilyOf): Assessment {
  const perExperiment = inv.experiments.map((exp) => {
    const checks = experimentChecks(inv, exp, familyOf);
    return { exp, checks, strength: strengthOf(checks) };
  });
  const finished = finishedExperiments(inv);
  const competing = competingCheck(inv);
  if (!finished.length) return { strength: "not-enough", result: null, perExperiment, competing };
  const pool = perExperiment.filter((p) => p.checks && p.exp.design.primary);
  const used = pool.length ? pool : perExperiment.filter((p) => p.checks);
  const strength = used.reduce<Strength>(
    (min, p) => (ORDER.indexOf(p.strength) < ORDER.indexOf(min) ? p.strength : min),
    "strong",
  );
  const effect = used.some((p) => analyzeExperiment(p.exp)!.effectFound);
  return { strength, result: effect ? "effect-found" : "no-clear-effect", perExperiment, competing };
}
