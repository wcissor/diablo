"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BillingSwitch } from "@/components/pricing/BillingSwitch";
import { Reveal } from "@/components/Reveal";
import { TryButton } from "@/components/TryButton";
import { UI } from "@/lib/motion";

type Plan = {
  name: string;
  for: string;
  monthly: number;
  yearly: number;
  unit?: string;
  features: string[];
  featured?: boolean;
  cta: string;
};

const PLANS: Plan[] = [
  {
    name: "Explore",
    for: "Try Diablo on sample AI systems.",
    monthly: 0,
    yearly: 0,
    features: ["Live investigations on a hosted model", "10 investigations a month", "Full statistics and evidence", "Community support"],
    cta: "Try yourself",
  },
  {
    name: "Pro",
    for: "For people improving their own AI.",
    monthly: 49,
    yearly: 39,
    unit: "per month",
    features: [
      "Connect your own models, agents and apps",
      "Unlimited investigations",
      "Knowledge that persists between investigations",
      "Report export",
      "Bring your own model key",
    ],
    featured: true,
    cta: "Start free",
  },
  {
    name: "Team",
    for: "For teams shipping AI to production.",
    monthly: 199,
    yearly: 159,
    unit: "per workspace, per month",
    features: ["Everything in Pro", "Shared knowledge across the team", "Autonomous discovery (early access)", "Roles and a full audit log", "Priority support"],
    cta: "Start free",
  },
];

export function Plans() {
  const [yearly, setYearly] = useState(false);

  return (
    <div>
      <Reveal className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => setYearly(false)} className={`press t-callout rounded-md font-semibold ${yearly ? "text-ink-3" : "text-ink"}`}>
          Monthly
        </button>
        <BillingSwitch on={yearly} onChange={setYearly} />
        <button type="button" onClick={() => setYearly(true)} className={`press t-callout rounded-md font-semibold ${yearly ? "text-ink" : "text-ink-3"}`}>
          Yearly <span className="t-caption ml-1 rounded-full bg-accent-tint-2 px-1.5 py-0.5 font-semibold text-accent-text">−20%</span>
        </button>
      </Reveal>

      {/* Phones: a carousel with native momentum and snapping. Wider screens: a grid. */}
      <div className="-mx-4 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
        {PLANS.map((p, i) => (
          <Reveal key={p.name} delay={0.06 * i} className="w-[84%] shrink-0 snap-center sm:w-[60%] lg:w-auto">
            <PlanCard plan={p} yearly={yearly} />
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border bg-subtle px-7 py-6">
        <div>
          <p className="t-headline">Enterprise</p>
          <p className="t-callout mt-1 text-ink-2">Private deployment, single sign-on and custom data retention. Priced with you.</p>
        </div>
        <Link href="/team" className="press t-callout inline-flex h-11 items-center rounded-full border border-line-strong px-5 font-semibold hover:bg-accent-tint">
          Meet the team
        </Link>
      </Reveal>
    </div>
  );
}

function PlanCard({ plan: p, yearly }: { plan: Plan; yearly: boolean }) {
  const reduce = useReducedMotion();
  const price = yearly ? p.yearly : p.monthly;
  const dark = p.featured;
  return (
    <div className={`relative flex h-full flex-col rounded-[1.75rem] p-7 ${dark ? "theme-dark bg-surface shadow-3 ring-1 ring-accent-text/25" : "border bg-surface"}`}>
      {dark && <span className="t-caption absolute right-6 top-6 rounded-full bg-accent px-2.5 py-1 font-semibold text-accent-ink">Recommended</span>}
      <p className="t-headline">{p.name}</p>
      <p className="t-callout mt-2 text-ink-2">{p.for}</p>

      <div className="mt-8 flex items-end">
        <span className="mb-[0.55rem] mr-0.5 text-[1.75rem] font-semibold tracking-[-0.03em]">$</span>
        <span className="relative inline-flex h-[3.5rem] overflow-clip">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={price}
              initial={reduce ? { opacity: 0 } : { y: yearly ? "100%" : "-100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { y: yearly ? "-100%" : "100%", opacity: 0 }}
              transition={reduce ? { duration: 0.15 } : UI}
              className="block text-[3.5rem] font-semibold leading-none tracking-[-0.04em] tabular-nums"
            >
              {price}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="t-callout mb-1.5 ml-2 text-ink-3">{price === 0 ? "forever" : p.unit}</span>
      </div>
      <p className="t-caption mt-2 h-4 text-ink-3">{yearly && price ? `Billed yearly at $${price * 12}` : ""}</p>

      <ul className="mt-7 flex-1 space-y-3">
        {p.features.map((f) => (
          <li key={f} className="t-body flex items-start gap-3">
            <svg viewBox="0 0 16 16" className="mt-[0.3rem] size-3.5 shrink-0 text-accent-text" aria-hidden>
              <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-9">
        <TryButton tone={dark ? "cream" : "accent"} className="w-full justify-center">
          {p.cta}
        </TryButton>
      </div>
    </div>
  );
}
