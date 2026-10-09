import type { Metadata } from "next";
import { Flywheel } from "@/components/about/Flywheel";
import { CtaBand } from "@/components/CtaBand";
import { PageHero } from "@/components/PageHero";
import { Reveal, SectionHead } from "@/components/Reveal";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: "About",
  description: "Why Diablo exists, the rules it is built on, and where it is going: from investigating AI to improving it.",
});

const CAPABILITIES = ["Evaluation", "Observability", "Research dashboards", "Coding agents"];

const PRINCIPLES = [
  { title: "The AI reasons. The system measures.", body: "The model proposes and explains. Code runs the experiments and computes every statistic." },
  { title: "Turn uncertainty into knowledge.", body: "Start from what is known and what isn’t, not from a fix." },
  { title: "Every investigation leaves a record.", body: "Hypotheses, experiments, verdicts, and the raw outputs behind them." },
  { title: "Every change must be undoable.", body: "Any change Diablo makes will be explicit, tested, reversible and audited." },
];

const ROADMAP = [
  {
    when: "Now",
    title: "A working loop, on sample systems",
    body: "Live on a real model: a study designed for your question, paired experiments, real statistics and a checked answer.",
  },
  { when: "Next", title: "Your own AI system", body: "A live reasoning model, and a connector that runs experiments on the AI you ship." },
  {
    when: "Then",
    title: "Autonomous discovery",
    body: "Diablo notices that something changed or looks unusual, investigates on its own and remembers what it found.",
  },
  {
    when: "Later",
    title: "Self-improvement",
    body: "Diablo applies the same loop to itself: its reasoning, planning, memory and choice of experiments.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About" title="We’re building an intelligence that understands intelligence.">
        Diablo’s job is to understand AI systems, and to make them better in ways you can check.
      </PageHero>

      <section className="border-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <SectionHead eyebrow="Why" title="AI changes every week. Understanding doesn’t keep up." />
          <Reveal delay={0.08} className="t-lead space-y-5 self-end text-ink-2">
            <p>New models, new prompts, new tools. When an AI system starts behaving differently, most teams guess, patch and hope.</p>
            <p>
              Diablo replaces the guess with an investigation: the possible causes, an experiment that tells them apart, and a
              conclusion only as strong as its evidence.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-t bg-subtle">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <SectionHead eyebrow="What Diablo is" title="Not another tool. A new category: AI evolution.">
            Evaluation, observability, dashboards and coding agents are ingredients. The product is the loop that turns them
            into understanding, and understanding into improvement.
          </SectionHead>
          <Reveal delay={0.08} className="mt-12 flex flex-wrap items-center gap-3">
            {CAPABILITIES.map((c) => (
              <span key={c} className="t-callout rounded-full border bg-surface px-4 py-2 text-ink-2">
                {c}
              </span>
            ))}
            <svg viewBox="0 0 40 16" className="mx-1 h-4 w-10 text-ink-3" aria-hidden>
              <path d="M2 8h34m-6-5 6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="t-callout rounded-full bg-burgundy px-5 py-2 font-semibold text-cream">AI evolution</span>
          </Reveal>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <SectionHead eyebrow="Principles" title="Four rules we don’t bend." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={0.05 * i} className="rounded-[1.75rem] border bg-surface p-7">
                <p className="t-caption font-mono text-accent-text">0{i + 1}</p>
                <h3 className="t-headline mt-5 text-balance">{p.title}</h3>
                <p className="t-body mt-3 text-ink-2">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow="Where it’s going" title="From answering questions to improving itself." />
            <ol className="mt-12">
              {ROADMAP.map((r, i) => (
                <Reveal key={r.when} as="li" delay={0.06 * i} className="relative grid grid-cols-[4.5rem_1fr] gap-4 pb-9 last:pb-0">
                  {i < ROADMAP.length - 1 && <span aria-hidden className="absolute left-[0.3rem] top-6 h-full w-px bg-line" />}
                  <span className="t-callout flex items-center gap-3 font-semibold">
                    <span className={`size-[0.7rem] rounded-full ${i === 0 ? "bg-accent" : "border-[1.5px] border-line-strong bg-bg"}`} />
                    {r.when}
                  </span>
                  <div>
                    <h3 className="t-headline">{r.title}</h3>
                    <p className="t-body mt-2 text-ink-2">{r.body}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal delay={0.08}>
            <Flywheel />
            <p className="t-caption mt-6 text-center text-ink-3">Spin it. The better Diablo investigates, the better it gets at investigating.</p>
          </Reveal>
        </div>
      </section>

      <CtaBand title="See the loop for yourself." />
    </>
  );
}
