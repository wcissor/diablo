/**
 * The study: what one live investigation tests, designed by the reasoning
 * model from the researcher's own question and validated here.
 *
 * - Arms are configurations of the AI under test: a system prompt and a
 *   temperature. Experiments compare two arms on the same cases (paired).
 * - Cases are prompts with a check that code applies to the reply. The model
 *   writes the check; it never decides whether a reply passed.
 */
import { hashString } from "@/lib/data/derive";
import type { LLMRequest } from "./llm/types";
import { finalNumber } from "./scorer";

export interface Arm {
  id: string;
  label: string;
  system: string;
  temperature: number;
}

export type Check =
  | { kind: "contains_any"; values: string[] }
  | { kind: "contains_all"; values: string[] }
  | { kind: "contains_none"; values: string[] }
  | { kind: "number"; value: number; tolerance: number }
  | { kind: "max_words"; value: number };

export interface Case {
  id: string;
  prompt: string;
  check: Check;
  /** What a passing reply looks like, in words, for display. */
  expected: string;
}

export interface Study {
  /** The researcher's question, as asked. */
  question: string;
  title: string;
  /** One sentence: which behaviour of the AI under test is being measured. */
  subject: string;
  /** The metric, in words: "Share of replies that …". */
  metric: string;
  arms: Arm[];
  cases: Case[];
}

/** Output room for one target reply. */
export const TARGET_MAX_TOKENS = 1024;

export const armById = (study: Study, id: string): Arm => study.arms.find((a) => a.id === id) ?? study.arms[0];

/** The request one case sends to the target in one arm. Only the arm's prompt and temperature change between arms. */
export function studyRequest(arm: Arm, c: Case): LLMRequest {
  return {
    system: arm.system.trim(),
    messages: [{ role: "user", content: c.prompt }],
    temperature: arm.temperature,
    maxTokens: TARGET_MAX_TOKENS,
  };
}

export interface Scored {
  score: 0 | 1;
  parsed: string | null;
  rationale: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*_`"“”'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const short = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

/** Code decides pass or fail; the reply is never read by a model. */
export function scoreCase(text: string, check: Check): Scored {
  const t = norm(text);
  const has = (v: string) => t.includes(norm(v));
  switch (check.kind) {
    case "contains_any": {
      const hit = check.values.find(has);
      return hit ? { score: 1, parsed: hit, rationale: `Mentions “${short(hit)}”.` } : { score: 0, parsed: null, rationale: `Mentions none of: ${check.values.map(short).join(", ")}.` };
    }
    case "contains_all": {
      const missing = check.values.filter((v) => !has(v));
      return missing.length === 0
        ? { score: 1, parsed: null, rationale: "Mentions every required term." }
        : { score: 0, parsed: null, rationale: `Missing: ${missing.map(short).join(", ")}.` };
    }
    case "contains_none": {
      const hit = check.values.find(has);
      return hit ? { score: 0, parsed: hit, rationale: `Says “${short(hit)}”, which it should not.` } : { score: 1, parsed: null, rationale: "Avoids every listed phrase." };
    }
    case "number": {
      const n = finalNumber(text);
      if (n === null) return { score: 0, parsed: null, rationale: `No number found; expected ${check.value}.` };
      const ok = Math.abs(n - check.value) <= check.tolerance;
      return { score: ok ? 1 : 0, parsed: String(n), rationale: ok ? `Final number ${n} matches ${check.value}.` : `Final number ${n}; expected ${check.value}.` };
    }
    case "max_words": {
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      return { score: words <= check.value ? 1 : 0, parsed: String(words), rationale: `${words} words; the limit is ${check.value}.` };
    }
  }
}

export function describeCheck(check: Check): string {
  switch (check.kind) {
    case "contains_any":
      return `mentions any of: ${check.values.join(" · ")}`;
    case "contains_all":
      return `mentions all of: ${check.values.join(" · ")}`;
    case "contains_none":
      return `avoids: ${check.values.join(" · ")}`;
    case "number":
      return check.tolerance ? `final number ${check.value} ± ${check.tolerance}` : `final number ${check.value}`;
    case "max_words":
      return `at most ${check.value} words`;
  }
}

/** A content hash of the cases, recorded on every run. */
export function casesHash(cases: Case[]): string {
  return `fnv1a:${hashString(JSON.stringify(cases.map((c) => [c.id, c.prompt, c.check]))).toString(16).padStart(8, "0")}`;
}
