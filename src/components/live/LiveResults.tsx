"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUpRight, CircleAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ForestPlot } from "@/components/charts/Charts";
import { Mono, VerdictTag } from "@/components/research/common";
import { ScrollRegion, SectionTitle } from "@/components/ui/primitives";
import { StudyDesign } from "./StudyDesign";
import { cn } from "@/lib/cn";
import { provider } from "@/lib/data";
import { analyzeExperiment, holmAdjusted, verdictFor } from "@/lib/data/derive";
import { strengthLine } from "@/lib/data/interpret";
import type { Experiment } from "@/lib/data/types";
import { count, duration } from "@/lib/format";
import { liveSystems } from "@/lib/live/analyze";
import { formatUsd, runCostUsd } from "@/lib/live/pricing";
import type { LiveResult } from "@/lib/live/types";
import { formatCIpp, formatP, formatPct, formatPP } from "@/lib/stats";
import { toast } from "@/lib/ui";
import { assess, CHECK_LABELS } from "@/lib/validity";

const PREDICTS = { increase: "a higher pass rate in the treatment arm", decrease: "a lower pass rate in the treatment arm", "no-difference": "no difference between arms" } as const;

const TABS = ["Results", "Study design", "Replies", "Run record"] as const;
type Tab = (typeof TABS)[number];

/** Everything below is derived in the browser from the counts the run recorded, with the app's own statistics. */
export function LiveResults({ result }: { result: LiveResult }) {
  const inv = result.investigation;
  const systems = liveSystems(result.models);
  const familyOf = (id: string) => systems.find((s) => s.id === id)?.family ?? null;
  const assessment = assess(inv, familyOf);
  const holm = holmAdjusted(inv);
  const done = inv.experiments.filter((e) => analyzeExperiment(e));
  const [tab, setTab] = useState<Tab>("Results");

  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="answer-h" className="rise rounded-[16px] border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="answer-h" className="text-[13px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Answer
          </h2>
          <span className="text-[12px] text-ink-3">
            Evidence: <span className="text-ink-2">{strengthLine(assessment)}</span>
          </span>
        </div>
        <Conclusion result={result} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {inv.experiments.map((e) => (
            <EffectTile key={e.id} e={e} />
          ))}
        </div>
        <ul className="mt-5 space-y-2">
          {inv.hypotheses.map((h) => {
            const v = verdictFor(inv, h);
            return (
              <li key={h.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <p className="text-[14px] text-ink-2">
                  <Mono className="text-ink-3">{h.id}</Mono> {h.text}
                  <span className="text-ink-3"> · predicts {PREDICTS[h.prediction]}</span>
                </p>
                <VerdictTag verdict={v.verdict} />
              </li>
            );
          })}
        </ul>
        <OpenInWorkspace result={result} />
      </section>

      <section aria-label="Details">
        <div role="tablist" aria-label="Details" className="flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[14px] transition-colors",
                tab === t ? "border-accent-text text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-label={tab} className="pt-5">
          {tab === "Results" && (
            <div className="space-y-4">
              <ScrollRegion label="Experiment results" className="rounded-[10px] border border-line bg-surface">
                <table className="w-full min-w-[760px] text-left text-[13px]">
                  <caption className="sr-only">Pass rate by arm, difference, interval and tests for each experiment</caption>
                  <thead className="border-b border-line text-ink-3">
                    <tr>
                      {["Experiment", "Control → treatment", "Pairs", "Control", "Treatment", "Δ", "95% CI (pp)", "Exact McNemar", "Holm-adjusted", "b / c"].map((h) => (
                        <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {inv.experiments.map((e) => (
                      <ExperimentRow key={e.id} e={e} holm={holm.get(e.id)} tests={holm.size} />
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
              <p className="text-[13px] text-ink-3">
                Paired design: b counts cases only the control passed, c cases only the treatment passed. The interval is a seeded paired bootstrap (2,000
                resamples); p is the exact McNemar test; Holm corrects for running {holm.size} primary tests. Verdicts follow the intervals; the model never assigns them.
              </p>
              {done.length > 0 && <ForestPlot inv={inv} experiments={done} />}
              <Validity result={result} assessment={assessment} />
            </div>
          )}
          {tab === "Study design" && (
            <div>
              <p className="text-[13px] text-ink-2">
                {result.plan.study.subject} Metric: {result.plan.study.metric}.
              </p>
              <StudyDesign study={result.plan.study} />
            </div>
          )}
          {tab === "Replies" && <Answers result={result} />}
          {tab === "Run record" && <RunRecord result={result} />}
        </div>
      </section>
    </div>
  );
}

function EffectTile({ e }: { e: Experiment }) {
  const r = analyzeExperiment(e);
  return (
    <div className="min-w-0 rounded-[12px] bg-subtle px-4 py-3">
      <div className="truncate text-[12px] text-ink-3">
        <Mono>{e.id}</Mono> {e.title}
      </div>
      {r ? (
        <>
          <div className="mt-1.5 flex items-baseline gap-2 font-mono tabular">
            <span className="text-[15px] text-ink-2">{formatPct(r.control.rate)}</span>
            <span className="text-ink-3">→</span>
            <span className="text-[20px] font-medium text-ink">{formatPct(r.treatment.rate)}</span>
            <span className={cn("ml-auto whitespace-nowrap text-[13px]", r.effectFound ? (r.diff < 0 ? "text-bad" : "text-ok") : "text-ink-3")}>{formatPP(r.diff)}</span>
          </div>
          <div className="mt-1 truncate text-[12px] text-ink-3">
            {e.design.control.label} → {e.design.treatment.label} · {formatP(r.p)} · {r.effectFound ? "effect found" : "no clear effect"}
          </div>
        </>
      ) : (
        <div className="mt-1.5 text-[13px] text-ink-3">No pair was scored in both arms.</div>
      )}
    </div>
  );
}

function ExperimentRow({ e, holm, tests }: { e: Experiment; holm: number | undefined; tests: number }) {
  const r = analyzeExperiment(e);
  const run = e.runs[0];
  return (
    <tr className="align-top">
      <th scope="row" className="px-3 py-2.5 font-normal">
        <Mono className="text-ink-3">{e.id}</Mono> <span className="text-ink">{e.title}</span>
      </th>
      <td className="px-3 py-2.5 text-ink-2">
        {e.design.control.label} → {e.design.treatment.label}
      </td>
      {r ? (
        <>
          <td className="px-3 py-2.5 font-mono tabular text-ink-2">
            {count(r.control.n)}
            {r.control.n < e.design.nPerArm && <span className="text-warn"> of {e.design.nPerArm}</span>}
          </td>
          <td className="px-3 py-2.5 font-mono tabular text-ink">{formatPct(r.control.rate)}</td>
          <td className="px-3 py-2.5 font-mono tabular text-ink">{formatPct(r.treatment.rate)}</td>
          <td className={cn("whitespace-nowrap px-3 py-2.5 font-mono tabular", r.effectFound ? "font-medium text-ink" : "text-ink-2")}>{formatPP(r.diff)}</td>
          <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular text-ink-2">{formatCIpp(r.diffCI)}</td>
          <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular text-ink-2">{formatP(r.p)}</td>
          <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular text-ink-2">{holm !== undefined && tests > 1 ? formatP(holm) : "–"}</td>
          <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular text-ink-2">
            {run.discordant!.b} / {run.discordant!.c}
          </td>
        </>
      ) : (
        <td colSpan={8} className="px-3 py-2.5 text-ink-3">
          No pair was scored in both arms, so there is no result.
        </td>
      )}
    </tr>
  );
}

function Conclusion({ result }: { result: LiveResult }) {
  const c = result.conclusion;
  const checked = c.source === "model";
  return (
    <div className="mt-3">
      <p className="font-serif text-[18px] leading-[29px] text-ink">{c.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {checked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ok">
            <ShieldCheck className="size-3.5" strokeWidth={2} aria-hidden />
            Numbers checked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-warn">
            <CircleAlert className="size-3.5" strokeWidth={2} aria-hidden />
            Code-built summary
          </span>
        )}
        <span className="text-[12px] text-ink-3">
          {checked
            ? `Written by ${result.models.reasoning}; every number was cited from the fact table and filled in by code.`
            : "The model’s text did not pass the number check, so this summary was built by code from the counts."}
        </span>
      </div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">How this was checked</summary>
        <div className="mt-2 space-y-3 text-ink-2">
          {c.raw && (
            <div>
              <div className="text-ink-3">What the model wrote, before code filled in the numbers</div>
              <p className="mt-1 rounded-[6px] bg-subtle px-3 py-2 font-mono text-[12px] leading-[18px] text-ink-2">{c.raw}</p>
            </div>
          )}
          {c.rejections.length > 0 && (
            <div>
              <div className="text-ink-3">Rejected attempts</div>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {c.rejections.map((r, i) => (
                  <li key={i}>
                    Attempt {i + 1}: {r.join(" ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="text-ink-3">Fact table (computed by code)</div>
            <ScrollRegion label="Fact table" className="mt-1">
              <table className="w-full min-w-[420px] text-left text-[12px]">
                <tbody className="divide-y divide-line">
                  {c.facts.map((f) => (
                    <tr key={f.id}>
                      <th scope="row" className="w-14 py-1 pr-3 font-mono font-normal text-ink-3">
                        {f.id}
                      </th>
                      <td className="py-1 pr-3 text-ink-2">{f.label}</td>
                      <td className="py-1 font-mono text-ink">{f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
        </div>
      </details>
    </div>
  );
}

function Validity({ result, assessment }: { result: LiveResult; assessment: ReturnType<typeof assess> }) {
  const notes = assessment.perExperiment
    .filter((p) => p.checks)
    .flatMap((p) =>
      p.checks!
        .filter((c) => !["pass", "na", "info"].includes(c.state))
        .map((c) => ({ key: `${p.exp.id}-${c.id}`, text: `${p.exp.id} ${c.id} ${CHECK_LABELS[c.id].toLowerCase()}: ${c.reason}` })),
    );
  return (
    <section aria-labelledby="live-validity-h">
      <SectionTitle id="live-validity-h">What limits the evidence</SectionTitle>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-ink-2 marker:text-ink-3">
        {notes.map((n) => (
          <li key={n.key}>{n.text}</li>
        ))}
        {assessment.competing.state !== "pass" && <li>C9: {assessment.competing.reason}</li>}
        <li>
          One target model ({result.targetReported ?? result.models.target}) and {result.plan.study.cases.length} cases written by the investigator: the result holds for this setup, not for every model or task. Each check is a rule, so a correct reply phrased unusually can fail it; read the replies.
        </li>
      </ul>
    </section>
  );
}

/** The measured tokens priced at the Claude list prices in pricing.ts; no row for a model without a known price. */
function costRow(result: LiveResult): [string, string][] {
  const c = runCostUsd(result.models, result.usage.byStage);
  if (!c) return [];
  return [["Cost at list price", `${formatUsd(c.total)} (reasoning ${formatUsd(c.reasoning)}, target ${formatUsd(c.target)})`]];
}

function RunRecord({ result }: { result: LiveResult }) {
  const u = result.usage;
  const r = result.run;
  const rows: [string, string][] = [
    ["Reasoning model", result.models.reasoning],
    ["Target model", result.targetReported && result.targetReported !== result.models.target ? `${result.models.target} (answered as ${result.targetReported})` : result.models.target],
    ["Plan", `${result.draftAttempts === 1 ? "valid on the first attempt" : `valid on attempt ${result.draftAttempts}`}`],
    ["Target calls", `${count(r.scored)} scored of ${count(r.plannedCalls)} planned${r.failed ? `, ${count(r.failed)} failed` : ""}${r.cancelled ? `, ${count(r.cancelled)} not run` : ""}`],
    ["Pairs analysed", r.perExperiment.map((e) => `${e.id} ${e.completedPairs} of ${e.plannedPairs}`).join(" · ")],
    ["Model calls in total", `${count(u.calls)} (plan ${u.byStage.draft.calls}, run ${count(u.byStage.run.calls)}, conclusion ${u.byStage.interpret.calls})`],
    ["Tokens", `${count(u.inputTokens)} in, ${count(u.outputTokens)} out`],
    ...costRow(result),
    ["Run time", `${duration(Date.parse(result.finishedAt) - Date.parse(result.startedAt))}${r.deadlineHit ? " (the run deadline stopped new calls)" : ""}`],
  ];
  return (
    <section aria-labelledby="live-record-h">
      <SectionTitle id="live-record-h" className="sr-only">Run record</SectionTitle>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-[180px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="min-w-0 break-words font-mono text-[12px] leading-[20px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Answers({ result }: { result: LiveResult }) {
  return (
    <section aria-labelledby="live-answers-h">
      <SectionTitle id="live-answers-h" className="sr-only">Replies</SectionTitle>
      <p className="mt-0.5 text-[13px] text-ink-3">The AI under test’s real replies, checked by code. Pairs left out (a failed call in either arm) are not shown.</p>
      <div className="mt-2 space-y-2">
        {result.investigation.experiments.map((e) => {
          const samples = e.runs[0]?.samples ?? [];
          const items = Array.from(new Set(samples.map((s) => s.itemId)));
          return (
            <details key={e.id} className="rounded-[10px] border border-line bg-surface">
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-ink">
                <Mono className="text-ink-3">{e.id}</Mono> {e.title} · {count(items.length)} pairs
              </summary>
              <ul className="divide-y divide-line border-t border-line">
                {items.map((itemId) => {
                  const pair = samples.filter((s) => s.itemId === itemId);
                  return (
                    <li key={itemId} className="px-4 py-3">
                      <div className="font-mono text-[12px] text-ink-2">
                        {itemId} · {pair[0]?.prompt}
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {pair.map((s) => (
                          <div key={s.id} className="min-w-0 rounded-[6px] bg-subtle px-3 py-2">
                            <div className="flex items-center justify-between gap-2 text-[12px]">
                              <span className="text-ink-3">{s.arm === "control" ? e.design.control.label : e.design.treatment.label}</span>
                              <span className={s.score ? "text-ok" : "text-bad"}>{s.score ? "Pass" : "Fail"}</span>
                            </div>
                            <p className="mt-1 line-clamp-6 whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px] text-ink">{s.response || "(empty reply)"}</p>
                            {s.rationale && <p className="mt-1 text-[12px] text-ink-3">{s.rationale}</p>}
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}

/** Hands the recorded investigation to the workspace, where the graph, evidence browser and report render it. */
function OpenInWorkspace({ result }: { result: LiveResult }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A finished run is saved to the investigations list at once, so it shows in the sidebar.
  const saved = useRef<string | null>(null);
  useEffect(() => {
    if (saved.current === result.investigation.id) return;
    saved.current = result.investigation.id;
    provider.importInvestigation(result.investigation);
  }, [result.investigation]);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
      <Button
        icon={<ArrowUpRight strokeWidth={1.5} />}
        loading={pending}
        onClick={() => {
          const id = provider.importInvestigation(result.investigation);
          if (!id) {
            toast({ title: "This run could not be added to the workspace" });
            return;
          }
          startTransition(() => router.push(`/investigations/${id}`));
        }}
      >
        Open in workspace
      </Button>
      <span className="text-[13px] text-ink-3">Saved to your investigations: graph, evidence and report.</span>
    </div>
  );
}
