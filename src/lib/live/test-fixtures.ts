/** Fixtures shared by the live engine's unit tests (not used by the app). */
import { makeItems, type Item } from "./dataset";
import { SYSTEM_PROMPTS } from "./registry";
import type { Case, Study } from "./study";

/** Seeded arithmetic items as study cases, checked by their exact answer. */
export const toCases = (items: Item[]): Case[] =>
  items.map((i) => ({ id: i.id, prompt: i.prompt, check: { kind: "number", value: i.answer, tolerance: 0 }, expected: String(i.answer) }));

/** A: the full prompt at 0.2 (baseline). B: the short prompt. C: temperature 1.0. */
export const TEST_ARMS = [
  { id: "A", label: "Full prompt, temperature 0.2", system_prompt: SYSTEM_PROMPTS.full, temperature: 0.2 },
  { id: "B", label: "Short prompt, temperature 0.2", system_prompt: SYSTEM_PROMPTS.short, temperature: 0.2 },
  { id: "C", label: "Full prompt, temperature 1.0", system_prompt: SYSTEM_PROMPTS.full, temperature: 1.0 },
];

export const TEST_STUDY: Study = {
  question: "Which v2 change moved accuracy?",
  title: "Which change moved accuracy",
  subject: "Accuracy on multi-step arithmetic under each setup.",
  metric: "Share of replies whose final number is exact",
  arms: TEST_ARMS.map((a) => ({ id: a.id, label: a.label, system: a.system_prompt, temperature: a.temperature })),
  cases: toCases(makeItems(24)),
};

export const GOOD_PLAN = {
  title: TEST_STUDY.title,
  subject: TEST_STUDY.subject,
  metric: TEST_STUDY.metric,
  arms: TEST_ARMS,
  cases: makeItems(24).map((i) => ({ prompt: i.prompt, check: { kind: "number", value: i.answer, tolerance: 0 }, expected: String(i.answer) })),
  hypotheses: [
    { id: "H1", text: "The shortened system prompt lowers accuracy.", prediction: "decrease", competing: false },
    { id: "H2", text: "The higher temperature, not the prompt, lowers accuracy.", prediction: "decrease", competing: true },
  ],
  experiments: [
    { hypothesis: "H1", title: "Prompt ablation", control: "A", treatment: "B", rationale: "Isolates the prompt." },
    { hypothesis: "H2", title: "Temperature ablation", control: "A", treatment: "C" },
  ],
};
