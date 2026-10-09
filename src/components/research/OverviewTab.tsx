"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Play, Repeat } from "lucide-react";
import { Curve, ForestPlot, Heatmap } from "@/components/charts/Charts";
import { Button } from "@/components/ui/Button";
import { StatusLabel } from "@/components/ui/Status";
import { Interpretation, SectionTitle, Time, ScrollRegion } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { provider, useNow } from "@/lib/data";
import { analyzeExperiment, finishedExperiments, holmAdjusted, verdictFor } from "@/lib/data/derive";
import { investigationInterpretation, strengthLine } from "@/lib/data/interpret";
import type { Experiment, Investigation } from "@/lib/data/types";
import { formatCIpp, formatP, formatPct, formatPP, num, signed } from "@/lib/stats";
import { CHECK_LABELS, RUBRIC_LABEL, STRENGTH_LABEL, THRESHOLDS, type Assessment } from "@/lib/validity";
import { CheckSymbol, Mono, RefText, VerdictTag } from "./common";
import { useWS } from "./context";

export function OverviewTab() {
  const { inv, assessment, openRef } = useWS();
  const done = finishedExperiments(inv);
  const proposed = inv.experiments.filter((e) => e.status === "proposed");
  const grid = inv.experiments.find((e) => e.design.grid && analyzeExperiment(e));

  return (
    <div className="space-y-10">
      <section aria-labelledby="question-h" className="rise">
        <SectionTitle id="question-h" className="text-ink-3">
          Question
        </SectionTitle>
        <p className="mt-1.5 max-w-[760px] text-[19px] leading-[28px] tracking-[-0.01em] text-ink">{inv.question}</p>
      </section>

      <section aria-labelledby="conclusion-h" className="rise" style={{ "--d": "60ms" } as React.CSSProperties}>
        <SectionTitle id="conclusion-h">Conclusion</SectionTitle>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[16px] font-medium text-ink">{strengthLine(assessment)}</span>
          <span className="text-[12px] text-ink-3">Evidence strength · {RUBRIC_LABEL}</span>
        </div>
        <Why assessment={assessment} />
        <Interpretation className="mt-4 max-w-[720px]">
          <RefText text={investigationInterpretation(inv)} onRef={openRef} />
        </Interpretation>
        {!done.length && proposed.length > 0 && (
          <Button className="mt-4" variant="primary" icon={<Play strokeWidth={1.5} />} onClick={() => provider.runProposed(inv.id)}>
            Run proposed
          </Button>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="results-h" className="space-y-4">
          <SectionTitle id="results-h">Results</SectionTitle>
          <ForestPlot inv={inv} experiments={done} />
          <Curve inv={inv} />
          {grid && <Heatmap exp={grid} />}
        </section>
      )}

      <section aria-labelledby="hyp-h">
        <SectionTitle id="hyp-h">Hypotheses</SectionTitle>
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {inv.hypotheses.map((h) => {
            const v = verdictFor(inv, h);
            const first = v.experiments.map((e) => ({ e, r: analyzeExperiment(e) })).find((x) => x.r);
            return (
              <li key={h.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
                <Mono className="w-8 shrink-0 pt-px text-ink-3">{h.id}</Mono>
                <div className="min-w-0 flex-1">
                  <p className="text-ink">
                    {h.text}
                    {h.competing && <span className="text-ink-3"> · competing explanation</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
                    {v.experiments.length ? (
                      <span>
                        Tested by{" "}
                        {v.experiments.map((e, i) => (
                          <span key={e.id}>
                            {i > 0 && ", "}
                            <button type="button" onClick={() => openRef(e.id)} className="font-mono text-accent-text underline underline-offset-2">
                              {e.id}
                            </button>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span>No experiment yet</span>
                    )}
                    {first?.r && (
                      <Mono className="text-ink-2">
                        Δ {formatPP(first.r.diff)} [{formatCIpp(first.r.diffCI)}]
                      </Mono>
                    )}
                    {v.failsHolm.length > 0 && <span>Does not survive the Holm correction (C7)</span>}
                  </div>
                </div>
                <VerdictTag verdict={v.verdict} />
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="exp-h">
        <SectionTitle id="exp-h">Experiments</SectionTitle>
        <ExperimentsTable experiments={inv.experiments} inv={inv} onOpen={(e) => openRef(e.id)} />
      </section>

      <section aria-labelledby="validity-h">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <SectionTitle id="validity-h">Validity checks</SectionTitle>
          <span className="text-[12px] text-ink-3">{RUBRIC_LABEL}</span>
        </div>
        <ValidityChecks assessment={assessment} />
      </section>

      <section aria-labelledby="next-h">
        <SectionTitle id="next-h">Next steps</SectionTitle>
        <NextSteps inv={inv} assessment={assessment} />
      </section>
    </div>
  );
}

function Why({ assessment }: { assessment: Assessment }) {
  if (assessment.strength === "not-enough") return null;
  return (
    <details className="mt-2 text-[13px]">
      <summary className="cursor-pointer text-ink-2 hover:text-ink">Why</summary>
      <div className="mt-2 max-w-[720px] space-y-1 text-ink-2">
        <p>
          Strength uses checks C1 to C5, C7 and C8. Weak: any of C1 to C5 fails or is not recorded. Moderate: C1 to C5 pass. Strong:
          also C7 and C8. The investigation takes its weakest finished primary experiment.
        </p>
        <ul className="mt-2 space-y-1">
          {assessment.perExperiment
            .filter((p) => p.checks)
            .map((p) => (
              <li key={p.exp.id}>
                <Mono>{p.exp.id}</Mono> {STRENGTH_LABEL[p.strength]}
                {p.checks!
                  .filter((c) => ["C1", "C2", "C3", "C4", "C5", "C7", "C8"].includes(c.id) && !["pass", "na"].includes(c.state))
                  .map((c) => (
                    <span key={c.id} className="text-ink-3">
                      {" "}
                      · {c.id} {c.reason.toLowerCase()}
                    </span>
                  ))}
              </li>
            ))}
        </ul>
      </div>
    </details>
  );
}

type SortKey = "id" | "title" | "status" | "diff" | "p" | "updated";

export function ExperimentsTable({
  experiments,
  inv,
  onOpen,
  showInvestigation,
  invOf,
}: {
  experiments: Experiment[];
  inv?: Investigation;
  onOpen: (e: Experiment) => void;
  showInvestigation?: boolean;
  invOf?: (e: Experiment) => Investigation | undefined;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "id", dir: 1 });
  const now = useNow(60_000);
  const rows = experiments.map((e) => ({ e, r: analyzeExperiment(e), i: invOf?.(e) ?? inv }));
  const val = (x: (typeof rows)[number]): number | string => {
    switch (sort.key) {
      case "id":
        return (x.i?.title ?? "") + x.e.id.padStart(4, "0");
      case "title":
        return x.e.title;
      case "status":
        return x.e.status;
      case "diff":
        return x.r ? x.r.diff : -Infinity;
      case "p":
        return x.r ? x.r.p : Infinity;
      case "updated":
        return Date.parse(x.e.updatedAt);
    }
  };
  rows.sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
  });

  const head = (key: SortKey | null, label: string, className?: string) => {
    const on = key && sort.key === key;
    return (
      <th scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={cn("whitespace-nowrap px-2 py-2 font-normal", className)}>
        {key ? (
          <button
            type="button"
            onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            {label}
            {on && (sort.dir === 1 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
          </button>
        ) : (
          label
        )}
      </th>
    );
  };

  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, ex: Experiment) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(ex);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sib = e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      (sib as HTMLElement | null)?.focus();
    }
  };

  return (
    <ScrollRegion label="Experiments table" className="mt-2 rounded-[10px] border border-line bg-surface">
      <table className="w-full min-w-[920px] text-[13px]">
        <caption className="sr-only">Experiments. Select a row to open its details.</caption>
        <thead className="border-b border-line text-left text-ink-3">
          <tr>
            {head("id", "#", "pl-3")}
            {showInvestigation && head(null, "Investigation")}
            {head("title", "Experiment")}
            {head(null, "H")}
            {head("status", "Status")}
            {head(null, "n per arm", "text-right")}
            {head(null, "Control → treatment", "text-right")}
            {head("diff", "Δ pp", "text-right")}
            {head(null, "95% CI (pp)", "text-right")}
            {head("p", "p", "text-right")}
            {head(null, "h", "text-right")}
            {head("updated", "Updated", "pr-3 text-right")}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ e, r, i }) => {
            const adj = i ? holmAdjusted(i).get(e.id) : undefined;
            return (
              <tr
                key={`${i?.id}-${e.id}`}
                tabIndex={0}
                onClick={() => onOpen(e)}
                onKeyDown={(k) => onKey(k, e)}
                aria-label={`${e.id} ${e.title}, ${e.status}. Open details`}
                className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken/60 focus-visible:bg-sunken/60 focus-visible:outline-offset-[-2px]"
              >
                <td className="py-2 pl-3 pr-2 font-mono text-ink-2">{e.id}</td>
                {showInvestigation && <td className="max-w-[200px] truncate px-2 py-2 text-ink-2">{i?.title}</td>}
                <td className="max-w-[260px] truncate px-2 py-2 text-ink">{e.title}</td>
                <td className="px-2 py-2 font-mono text-ink-2">{e.hypothesisId}</td>
                <td className="whitespace-nowrap px-2 py-2">
                  <StatusLabel status={e.status} />
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular text-ink-2">{r ? `${r.control.n} / ${r.treatment.n}` : e.design.nPerArm}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular text-ink-2">
                  {r ? `${formatPct(r.control.rate)} → ${formatPct(r.treatment.rate)}` : "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular text-ink">{r ? num(r.diff * 100) : "—"}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular text-ink-2">{r ? formatCIpp(r.diffCI) : "—"}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular text-ink-2" title={adj !== undefined ? `Holm-adjusted ${formatP(adj)}` : undefined}>
                  {r ? formatP(r.p).replace("p = ", "").replace("p ", "") : "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular text-ink-2">{r ? signed(r.cohensH) : "—"}</td>
                <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right text-ink-3">
                  <Time iso={e.updatedAt} now={now} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export function ValidityChecks({ assessment }: { assessment: Assessment }) {
  const withChecks = assessment.perExperiment.filter((p) => p.checks);
  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-start gap-2 text-[13px]">
        <CheckSymbol state={assessment.competing.state} />
        <span>
          <span className="text-ink">
            C9 {CHECK_LABELS.C9} <span className="text-ink-3">(investigation)</span>
          </span>
          <span className="block text-ink-2">{assessment.competing.reason}</span>
        </span>
      </div>
      {withChecks.length === 0 && <p className="text-ink-2">Checks run when an experiment finishes.</p>}
      {withChecks.map((p, i) => (
        <details key={p.exp.id} open={i === 0} className="rounded-[10px] border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] [&::-webkit-details-marker]:hidden">
            <Mono className="text-ink-2">{p.exp.id}</Mono>
            <span className="min-w-0 flex-1 truncate text-ink">{p.exp.title}</span>
            <span className="shrink-0 text-ink-2">{STRENGTH_LABEL[p.strength]}</span>
          </summary>
          <ul className="space-y-1.5 border-t border-line px-3 py-3">
            {p.checks!.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-[13px]">
                <CheckSymbol state={c.state} />
                <span className="min-w-0">
                  <span className="text-ink">
                    {c.id} {c.label}
                  </span>
                  <span className="block text-ink-2">{c.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}
      <p className="text-[12px] text-ink-3">
        Draft thresholds: at least {THRESHOLDS.minPerArm} per arm; judge–human agreement at least {THRESHOLDS.humanAgreement.toFixed(2)}; α ={" "}
        {THRESHOLDS.alpha} after Holm correction. ✓ pass · ! fails or needs attention · – not recorded, not yet, or does not apply.
      </p>
    </div>
  );
}

function NextSteps({ inv, assessment }: { inv: Investigation; assessment: Assessment }) {
  const proposed = inv.experiments.filter((e) => e.status === "proposed");
  const unreplicated = finishedExperiments(inv).filter((e) => !e.runs.some((r) => r.role === "replication"));
  const items: React.ReactNode[] = [];
  proposed.forEach((e) =>
    items.push(
      <li key={`run-${e.id}`} className="flex items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="text-ink">
            <Mono className="text-ink-3">{e.id}</Mono> {e.title}
          </span>
          <span className="block text-[13px] text-ink-3">
            Proposed · {e.design.control.label} vs {e.design.treatment.label}, {e.design.nPerArm} per arm
          </span>
        </span>
        <Button size="sm" icon={<Play strokeWidth={1.5} />} onClick={() => provider.runExperiment(inv.id, e.id)}>
          Run
        </Button>
      </li>,
    ),
  );
  unreplicated.forEach((e) =>
    items.push(
      <li key={`rep-${e.id}`} className="flex items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="text-ink">Replicate {e.id} with a new seed</span>
          <span className="block text-[13px] text-ink-3">C8 passes when a replication goes the same direction.</span>
        </span>
        <Button size="sm" icon={<Repeat strokeWidth={1.5} />} onClick={() => provider.replicateExperiment(inv.id, e.id)}>
          Replicate
        </Button>
      </li>,
    ),
  );
  if (assessment.competing.state !== "pass")
    items.push(
      <li key="c9" className="py-2.5">
        <span className="text-ink">State and test a competing explanation</span>
        <span className="block text-[13px] text-ink-3">C9: {assessment.competing.reason}.</span>
      </li>,
    );
  if (!items.length) return <p className="mt-2 text-ink-2">Every experiment has run and been replicated.</p>;
  return <ul className="mt-2 divide-y divide-line border-y border-line">{items}</ul>;
}
