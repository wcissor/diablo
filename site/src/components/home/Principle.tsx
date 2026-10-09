"use client";

import { useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Reveal, SectionHead } from "@/components/Reveal";
import { INSTANT, SHEET, UI, nearest, project, soft, tick, usePan } from "@/lib/motion";

/** Real numbers: the worked example's two experiments, computed by Diablo's statistics code. */
const FACTS = {
  F1: { value: "−15.0 pp", source: "E1 · prompt · 69/80 → 57/80 correct" },
  F2: { value: "p = 0.012", source: "E1 · exact McNemar, paired" },
  F3: { value: "−26.3 to −3.8 pp", source: "E1 · 95% confidence interval" },
  F4: { value: "−1.3 pp, p > 0.99", source: "E2 · temperature · 69/80 → 68/80" },
} as const;
type FactId = keyof typeof FACTS;
type Part = string | { fact: FactId } | { sneak: string };

const SENTENCE: Part[] = [
  "Shortening the system prompt cut accuracy by ",
  { fact: "F1" },
  " (",
  { fact: "F2" },
  "; 95% CI ",
  { fact: "F3" },
  "). Raising the temperature changed nothing measurable (",
  { fact: "F4" },
  ").",
];
const SNEAKY: Part[] = [
  "Shortening the system prompt cut accuracy by ",
  { fact: "F1" },
  " (",
  { fact: "F2" },
  "), making it ",
  { sneak: "40% worse" },
  " overall. Raising the temperature changed nothing measurable (",
  { fact: "F4" },
  ").",
];

const REASONS = ["Proposes hypotheses", "Designs experiments", "Explains what the results mean"];
const MEASURES = ["Runs the experiments", "Scores every answer", "Computes the statistics", "Grades how far each result can be trusted"];

export function Principle() {
  return (
    <section className="theme-dark bg-bg">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHead eyebrow="The principle" title="The AI reasons. The system measures.">
          The model proposes and explains. It never writes a number: every number you read is computed by code from the
          recorded results.
        </SectionHead>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <Column title="The AI reasons" items={REASONS} />
          <Column title="The system measures" items={MEASURES} delay={0.06} />
        </div>

        <Reveal delay={0.08} className="mt-4">
          <Grounding />
          <p className="t-caption mt-4 text-ink-3">
            An illustration of the rule. In the live product the investigator writes placeholders such as {"{{F3}}"},
            a checker rejects any number it types itself, and code fills in every value.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Column({ title, items, delay = 0 }: { title: string; items: string[]; delay?: number }) {
  return (
    <Reveal delay={delay} className="rounded-[1.75rem] border bg-surface p-7">
      <p className="t-overline text-accent-text">{title}</p>
      <ul className="mt-5 space-y-2.5">
        {items.map((r) => (
          <li key={r} className="text-[1.25rem] font-semibold leading-snug tracking-[-0.018em]">
            {r}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/**
 * The same conclusion twice, stacked: what the model writes (placeholders)
 * and what the system publishes (measured values). Drag the handle to wipe
 * between them. It tracks 1:1, resists past either end, and a flick
 * carries it to the side it was thrown towards.
 */
function Grounding() {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const p = useMotionValue(0); // 0 = the model's draft, 1 = published
  const pct = useTransform(p, (v) => v * 100);
  const clip = useMotionTemplate`inset(0 calc(100% - ${pct}%) 0 0)`;
  const left = useMotionTemplate`${pct}%`;
  const [sneak, setSneak] = useState(false);
  const [side, setSide] = useState<0 | 1>(0);
  const start = useRef(0);
  const parts = sneak ? SNEAKY : SENTENCE;

  const width = () => track.current?.getBoundingClientRect().width || 1;
  const settle = (to: 0 | 1, velocity = 0) => {
    setSide(to);
    animate(p, to, reduce ? INSTANT : { ...SHEET, velocity });
  };

  const onPointerDown = usePan({
    axis: "x",
    threshold: 4,
    onDown: () => {
      p.stop();
      start.current = p.get();
    },
    onMove: ({ dx }) => {
      const w = width();
      p.set(soft(start.current + dx / w, 0, 1, 0.6));
    },
    onEnd: ({ vx }) => {
      const w = width();
      const v = vx / w;
      const to = nearest([0, 1], p.get() + project(v)) as 0 | 1;
      if (to !== side) tick();
      settle(to, v);
    },
    onTap: () => settle(side === 0 ? 1 : 0),
  });

  return (
    <div className="overflow-clip rounded-[1.75rem] bg-surface text-ink">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-7">
        <p className="t-callout font-semibold">Who writes the numbers? Drag the handle.</p>
        <button
          type="button"
          onClick={() => setSneak((s) => !s)}
          aria-pressed={sneak}
          className={`press t-callout rounded-full border px-3.5 py-1.5 font-semibold transition-colors ${
            sneak ? "border-transparent bg-accent text-accent-ink" : "border-line-strong hover:bg-accent-tint"
          }`}
        >
          {sneak ? "Undo" : "Let the model sneak in a number"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr]">
        <div className="p-5 sm:p-7">
          <div className="t-overline flex justify-between text-ink-3">
            <button type="button" className="press rounded-md text-left" onClick={() => settle(0)} aria-pressed={side === 0}>
              The model writes
            </button>
            <button type="button" className="press rounded-md text-right" onClick={() => settle(1)} aria-pressed={side === 1}>
              The system publishes
            </button>
          </div>

          <div
            ref={track}
            onPointerDown={onPointerDown}
            onKeyDown={(e) => {
              const to = ({ ArrowRight: 1, ArrowUp: 1, End: 1, ArrowLeft: 0, ArrowDown: 0, Home: 0 } as const)[e.key];
              if (to === undefined) return;
              e.preventDefault();
              if (to !== side) tick();
              settle(to);
            }}
            role="slider"
            tabIndex={0}
            aria-label="Compare the model's draft with the published conclusion"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={side}
            aria-valuetext={side ? "Published, with measured values" : "Model's draft, with placeholders"}
            style={{ touchAction: "pan-y" }}
            className="relative mt-4 cursor-ew-resize select-none"
          >
            <Sentence parts={parts} layer="draft" />
            <motion.div aria-hidden className="absolute inset-0" style={{ clipPath: clip, WebkitClipPath: clip }}>
              <Sentence parts={parts} layer="published" />
            </motion.div>
            <motion.div aria-hidden className="pointer-events-none absolute -bottom-3 -top-3 w-0" style={{ left }}>
              <span className="absolute inset-y-0 -left-px w-0.5 rounded-full bg-accent-text" />
              <span className="absolute left-0 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-accent-ink shadow-3">
                <svg viewBox="0 0 16 16" className="size-4">
                  <path d="M6 4 2 8l4 4M10 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </motion.div>
          </div>

          <AnimatePresence initial={false}>
            {sneak && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={reduce ? { duration: 0.15 } : UI}
                className="overflow-clip"
                role="status"
              >
                <p className="t-callout mt-6 flex gap-2 rounded-xl bg-accent-tint px-3.5 py-3 text-bad">
                  <span aria-hidden>✕</span>
                  Not allowed. “40%” isn’t in the fact table, and a conclusion may only cite measured facts, so this sentence
                  never reaches you.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t bg-subtle p-5 sm:p-7 lg:border-l lg:border-t-0">
          <p className="t-overline text-ink-3">Fact table · measured</p>
          <ul className="mt-3 divide-y">
            {(Object.keys(FACTS) as FactId[]).map((id) => (
              <li key={id} className="flex items-baseline gap-3 py-2.5">
                <span className="t-caption font-mono text-accent-text">{id}</span>
                <span className="min-w-0 flex-1">
                  <span className="t-callout block font-mono font-semibold">{FACTS[id].value}</span>
                  <span className="t-caption block text-ink-3">{FACTS[id].source}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Each slot holds both texts in one grid cell, so the draft and the published
 * layers lay out identically and the wipe lines up exactly.
 */
function Sentence({ parts, layer }: { parts: Part[]; layer: "draft" | "published" }) {
  const pub = layer === "published";
  return (
    <p className={`py-1 text-[1.1875rem] leading-[2] tracking-[-0.01em] sm:text-[1.3125rem] ${pub ? "bg-surface" : ""}`}>
      {parts.map((part, i) => {
        if (typeof part === "string") return <span key={i}>{part}</span>;
        if ("fact" in part) {
          const draft = `{{${part.fact}}}`;
          const value = FACTS[part.fact].value;
          return (
            <span key={i} className="mx-0.5 inline-grid align-baseline font-mono text-[0.84em]">
              <span className={`col-start-1 row-start-1 rounded-md px-1.5 text-center ${pub ? "invisible" : "border border-dashed border-accent-text/50 text-accent-text"}`}>
                {draft}
              </span>
              <span className={`col-start-1 row-start-1 rounded-md px-1.5 text-center ${pub ? "bg-accent-tint-2 font-semibold" : "invisible"}`}>{value}</span>
            </span>
          );
        }
        return (
          <span key={i} className={`mx-0.5 rounded-md px-1 ${pub ? "bg-accent-tint text-bad line-through decoration-2" : ""}`}>
            {part.sneak}
          </span>
        );
      })}
    </p>
  );
}
