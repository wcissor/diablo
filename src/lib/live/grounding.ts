/**
 * Grounding: the model may write words, never numbers.
 *
 * Code builds a fact table (every number the conclusion could need, computed
 * from the counts). The model writes the conclusion with {{F1}}-style
 * placeholders that point into that table, and {{E1}} / {{H1}} for
 * experiments and hypotheses. The checker rejects any digit, percent sign or
 * number word outside a placeholder, and any placeholder that is not in the
 * table. Only then does code substitute the values.
 */
import type { Analysis } from "./analyze";
import { VERDICT_LABEL, investigationInterpretation, strengthLine } from "@/lib/data/interpret";
import type { Investigation } from "@/lib/data/types";
import { count } from "@/lib/format";
import { formatCIpp, formatP, formatPct, formatPP } from "@/lib/stats";
import type { Fact } from "./types";

export function buildFacts(inv: Investigation, analysis: Analysis): Fact[] {
  const facts: Fact[] = [];
  const add = (label: string, value: string) => facts.push({ id: `F${facts.length + 1}`, label, value });
  for (const e of inv.experiments) {
    const r = analysis.results.get(e.id);
    if (!r) {
      add(`${e.id} result`, "no result (no pair was scored in both arms)");
      continue;
    }
    add(`${e.id} pairs scored in both arms`, count(r.control.n));
    add(`${e.id} control accuracy (${e.design.control.label})`, formatPct(r.control.rate));
    add(`${e.id} treatment accuracy (${e.design.treatment.label})`, formatPct(r.treatment.rate));
    add(`${e.id} difference, treatment minus control`, formatPP(r.diff));
    add(`${e.id} confidence interval of the difference`, `95% CI ${formatCIpp(r.diffCI)} pp`);
    add(`${e.id} exact McNemar test`, formatP(r.p));
    const adj = analysis.holm.get(e.id);
    if (adj !== undefined && analysis.holm.size > 1) add(`${e.id} Holm-adjusted across ${analysis.holm.size} tests`, formatP(adj));
    add(`${e.id} outcome`, r.effectFound ? "effect found (the interval excludes zero)" : "no clear effect (the interval includes zero)");
  }
  for (const h of inv.hypotheses) add(`${h.id} verdict`, VERDICT_LABEL[analysis.verdicts.get(h.id) ?? "untested"].toLowerCase());
  add("Evidence strength", strengthLine(analysis.assessment));
  return facts;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z]+[0-9]+)\s*\}\}/g;

/** Words that carry a quantity. Small counting words ("two changes") are allowed. */
const NUMBER_WORDS =
  /\b(zero|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|percent|per cent|percentage|pp|half|halved|halves|twice|doubled|doubling|tripled|triple|thrice|quarter|dozens?)\b/i;

export const MAX_CONCLUSION = 1500;

export type GroundCheck = { ok: true; text: string; cited: string[] } | { ok: false; problems: string[] };

function snippet(text: string, index: number) {
  const s = text.slice(Math.max(0, index - 25), index + 25).replace(/\s+/g, " ").trim();
  return `“…${s}…”`;
}

/** Check the model's text and, when it passes, substitute the facts. */
export function checkGrounded(text: string, facts: Fact[], refs: string[]): GroundCheck {
  const problems: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, problems: ["The conclusion is empty."] };
  if (trimmed.length > MAX_CONCLUSION) problems.push(`The conclusion is longer than ${MAX_CONCLUSION} characters.`);

  const byId = new Map(facts.map((f) => [f.id, f]));
  const known = new Set(refs);
  const cited: string[] = [];
  for (const m of trimmed.matchAll(PLACEHOLDER)) {
    const id = m[1].toUpperCase();
    if (/^F\d+$/.test(id)) {
      if (!byId.has(id)) problems.push(`{{${id}}} is not in the fact table.`);
      else cited.push(id);
    } else if (/^[EH]\d+$/.test(id)) {
      if (!known.has(id)) problems.push(`{{${id}}} is not an experiment or hypothesis of this investigation.`);
    } else {
      problems.push(`{{${m[1]}}} is not a known placeholder.`);
    }
  }

  const outside = trimmed.replace(PLACEHOLDER, " ");
  if (/[{}]/.test(outside)) problems.push("Placeholders must be written exactly as {{F1}}; stray braces were found.");
  const digit = /\p{Nd}/u.exec(outside);
  if (digit) problems.push(`A number was written outside a placeholder: ${snippet(outside, digit.index)}. Cite it from the fact table instead.`);
  const pct = /[%‰]/.exec(outside);
  if (pct) problems.push(`A percent sign was written outside a placeholder: ${snippet(outside, pct.index)}.`);
  const word = NUMBER_WORDS.exec(outside);
  if (word) problems.push(`A quantity word (“${word[0]}”) was written; cite the number from the fact table instead.`);
  if (!cited.length) problems.push("The conclusion cites no fact; cite the measured results with {{F…}} placeholders.");

  if (problems.length) return { ok: false, problems };
  const rendered = trimmed.replace(PLACEHOLDER, (_, raw: string) => {
    const id = raw.toUpperCase();
    return byId.get(id)?.value ?? id;
  });
  return { ok: true, text: rendered, cited: Array.from(new Set(cited)) };
}

/** The deterministic summary used when the model's text does not pass: built by code from the counts. */
export function templateConclusion(inv: Investigation, analysis: Analysis): string {
  return `${investigationInterpretation(inv)} Evidence strength: ${strengthLine(analysis.assessment)}.`;
}
