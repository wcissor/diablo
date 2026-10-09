"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { UI } from "@/lib/motion";

const QA = [
  {
    q: "Can the AI make up results?",
    a: "No. The model proposes and explains; it never writes a number. Experiments are run, and every statistic is computed, by code from the recorded results.",
  },
  {
    q: "How do I sign in?",
    a: "Only a Google account: continue with Google and ask your first question. There is no separate sign-up.",
  },
  {
    q: "What can I connect?",
    a: "Not yet. Today Diablo designs and runs each study on a model we host. Connecting your own model, agent or AI app over its API comes next.",
  },
  {
    q: "Who pays for the model calls?",
    a: "We do, during early access. Once you connect your own system, experiments will call it with your keys, and your provider will bill those calls.",
  },
  {
    q: "What counts as an investigation?",
    a: "One question, with its hypotheses, experiments and conclusion. Re-running an experiment inside the same investigation doesn’t count again.",
  },
  {
    q: "Does Diablo change my AI system?",
    a: "No. It reports what the evidence supports, and you decide what to change.",
  },
];

/** Any number of answers can be open; each one opens and closes on a spring, and can be reversed mid-way. */
export function Faq() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <ul className="divide-y border-y">
      {QA.map((item, i) => {
        const on = open.has(i);
        return (
          <li key={item.q}>
            <h3>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={on}
                aria-controls={`faq-a-${i}`}
                onClick={() => toggle(i)}
                className="flex w-full items-center justify-between gap-6 py-6 text-left text-[1.25rem] font-semibold tracking-[-0.018em] active:opacity-70"
              >
                {item.q}
                <motion.svg
                  viewBox="0 0 16 16"
                  className="size-4 shrink-0 text-ink-3"
                  aria-hidden
                  animate={{ rotate: on ? 180 : 0 }}
                  transition={reduce ? { duration: 0 } : UI}
                >
                  <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduce ? { duration: 0.15 } : UI}
                  className="overflow-clip"
                >
                  <p className="t-body max-w-3xl pb-7 text-ink-2">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
