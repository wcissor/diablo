"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Check, ChevronDown, FlaskConical, KeyRound, Square, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/primitives";
import { Mono } from "@/components/research/common";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/data";
import { count } from "@/lib/format";
import { ERROR_HINT } from "@/lib/live/llm/types";
import { INITIAL_VIEW, liveReducer, readEvents, type LiveView, type StageState } from "@/lib/live/progress";
import type { LivePublicConfig, LiveStage, Plan } from "@/lib/live/types";
import { LiveResults } from "./LiveResults";
import { StudyDesign } from "./StudyDesign";

/** A model id as people say it. */
export function modelName(id: string | null | undefined): string {
  if (!id) return "the investigator";
  const m = /^(claude|gemini)-(.+)$/i.exec(id);
  if (!m) return id;
  const rest = m[2].replace(/-(\d+)-(\d+)(?=$|-)/, " $1.$2").replace(/-/g, " ");
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${rest.replace(/\b[a-z]/g, (c) => c.toUpperCase())}`;
}

const EXAMPLES = [
  "Does asking for a one-word answer make the assistant worse at multi-step arithmetic?",
  "Does a strict “cite your sources” system prompt reduce made-up facts about world capitals?",
  "Is the assistant more likely to fall for common science myths at a higher temperature?",
];

export function LiveInvestigation({ config }: { config: LivePublicConfig }) {
  const router = useRouter();
  const [view, dispatch] = useReducer(liveReducer, INITIAL_VIEW);
  const asked = useSearchParams().get("q")?.trim().slice(0, 400) || null;
  const [question, setQuestion] = useState<string | null>(asked);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the page cancels a run in progress: no model calls nobody will see.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Arriving with a question (?q=...) starts the investigation straight away.
  // The cleanup cancels it, so a remount (Strict Mode) starts one fresh run.
  useEffect(() => {
    if (!config.configured || !asked) return;
    void start(asked);
    return () => abortRef.current?.abort();
    // Only the question the page was opened with starts by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.configured]);

  async function start(objective: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ type: "request", at: Date.now() });
    try {
      const res = await fetch("/api/live/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        const message =
          res.status === 401 ? "Your session has ended. Reload the page to sign in again." : (body?.message ?? `The server answered with status ${res.status}.`);
        dispatch({ type: "http-error", status: res.status, message });
        return;
      }
      await readEvents(res.body, dispatch);
      dispatch({ type: "stream-ended" });
    } catch {
      // A run replaced by a newer one says nothing; one the user stopped says so.
      if (abortRef.current !== ctrl) return;
      if (ctrl.signal.aborted) dispatch({ type: "cancelled" });
      else dispatch({ type: "http-error", status: 0, message: "The server could not be reached. Check your connection and try again." });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }

  const ask = (q: string) => {
    const text = q.trim().slice(0, 400);
    if (!text) return;
    setQuestion(text);
    router.replace(`/live?q=${encodeURIComponent(text)}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
    void start(text);
  };

  if (!config.configured) return <NotConfigured config={config} />;

  const busy = view.status === "starting" || view.status === "running";
  const investigator = modelName(view.models?.reasoning ?? config.reasoningModel);
  const target = view.models?.target ?? config.targetModel;

  if (!question) {
    return (
      <div className="mx-auto max-w-[760px] pt-[12vh]">
        <h1 className="text-center text-[28px] font-medium tracking-[-0.02em] text-ink">What should Diablo investigate?</h1>
        <p className="mt-2 text-center text-ink-2">
          Ask about how an AI behaves. {investigator} designs the study, code runs it on {modelName(target)} and computes every number.
        </p>
        <Composer onSubmit={ask} autoFocus className="mt-8" placeholder="Ask a research question about AI behaviour…" />
        <ul className="mt-4 flex flex-col gap-2">
          {EXAMPLES.map((e) => (
            <li key={e}>
              <button
                type="button"
                onClick={() => ask(e)}
                className="w-full rounded-[10px] border border-line px-4 py-2.5 text-left text-[14px] text-ink-2 transition-colors hover:border-line-strong hover:bg-subtle hover:text-ink"
              >
                {e}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[920px] pb-32">
      <header className="rise">
        <div className="flex items-center gap-2 text-[13px] text-ink-3">
          <FlaskConical className="size-4" strokeWidth={1.5} aria-hidden />
          Investigation
        </div>
        <h1 className="mt-2 text-[26px] font-medium leading-[34px] tracking-[-0.02em] text-ink sm:text-[30px] sm:leading-[38px]">{question}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3">
          <span>
            Investigator <span className="text-ink-2">{investigator}</span>
          </span>
          <span>
            AI under test <Mono className="text-ink-2">{target}</Mono>
          </span>
          {busy && <Elapsed since={view.startedAt} />}
          {busy && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-ink-2 hover:border-line-strong hover:text-ink"
            >
              <Square className="size-3" strokeWidth={2} aria-hidden /> Stop
            </button>
          )}
        </div>
      </header>

      <Activity view={view} target={target} investigator={investigator} />
      {view.error && <ErrorNote view={view} onRetry={() => ask(question)} />}
      {view.result && <LiveResults result={view.result} />}
      <Announcer view={view} />

      {!busy && (
        <div className="sticky bottom-0 z-20 -mb-32 mt-10 bg-gradient-to-t from-canvas via-canvas/95 to-transparent pb-5 pt-8">
          <Composer onSubmit={ask} placeholder="Ask another question…" />
        </div>
      )}
    </div>
  );
}

/* ── Composer ─────────────────────────────────────────────────── */

function Composer({ onSubmit, placeholder, autoFocus, className }: { onSubmit: (q: string) => void; placeholder: string; autoFocus?: boolean; className?: string }) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    onSubmit(text);
    setText("");
  };
  return (
    <form
      className={cn("flex items-end gap-2 rounded-[16px] border border-line-strong bg-surface p-2 pl-4 shadow-sm focus-within:border-ink-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor="live-q" className="sr-only">
        Research question
      </label>
      <textarea
        id="live-q"
        rows={1}
        autoFocus={autoFocus}
        value={text}
        maxLength={400}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label="Investigate"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-canvas transition-opacity disabled:opacity-30"
      >
        <ArrowUp className="size-4" strokeWidth={2} aria-hidden />
      </button>
    </form>
  );
}

/* ── Activity: what the investigator is doing, step by step ───── */

function Activity({ view, target, investigator }: { view: LiveView; target: string | null; investigator: string }) {
  const s = view.stages;
  const plan = view.plan;
  const p = view.progress;
  const done = view.status === "done";
  const [open, setOpen] = useState(true);
  // Fold the activity once the answer is in; it stays one click away.
  const [prevDone, setPrevDone] = useState(done);
  if (done !== prevDone) {
    setPrevDone(done);
    if (done) setOpen(false);
  }

  const lastDraft = view.draftAttempts[view.draftAttempts.length - 1];
  const lastInterp = view.interpretAttempts[view.interpretAttempts.length - 1];
  const steps: { stage: LiveStage; title: string; detail: ReactNode }[] = [
    {
      stage: "draft",
      title: plan ? `Designed the study: ${plan.study.title}` : "Designing a study for your question",
      detail: plan ? (
        <StudySummary plan={plan} />
      ) : (
        <span>
          {investigator} is turning the question into test cases, setups to compare and competing hypotheses.
          {lastDraft && !lastDraft.ok && ` Attempt ${lastDraft.attempt} was rejected by the validator; revising.`}
        </span>
      ),
    },
    {
      stage: "run",
      title: p ? `Ran ${count(p.done)} of ${count(p.total)} replies on ${target}` : `Running the study on ${target ?? "the AI under test"}`,
      detail: p ? (
        <div className="max-w-[520px]">
          <Progress value={p.total ? p.done / p.total : 0} label="Replies finished" />
          <p className="mt-1.5 text-[12px] text-ink-3">
            {count(p.scored)} scored by code{p.failed ? ` · ${count(p.failed)} failed` : ""}
            {p.cancelled ? ` · ${count(p.cancelled)} not run` : ""}. Every setup answers the same cases, so each comparison is paired.
          </p>
        </div>
      ) : (
        <span>Code sends every case to every setup and checks each reply.</span>
      ),
    },
    { stage: "analyze", title: "Computed the statistics", detail: <span>Exact McNemar test, paired bootstrap interval and Holm correction, all in code.</span> },
    {
      stage: "interpret",
      title: s.interpret === "done" ? "Wrote the answer · every number checked" : "Writing the answer",
      detail: (
        <span>
          {investigator} explains the result citing only numbers computed by code.
          {lastInterp && !lastInterp.ok && ` Attempt ${lastInterp.attempt} was rejected by the number checker.`}
        </span>
      ),
    },
  ];
  const visible = steps.filter((st) => s[st.stage] !== "pending" || (st.stage === "draft" && view.status === "starting"));

  return (
    <section aria-label="Activity" className="mt-8 rounded-[14px] border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
          {done ? <Check className="size-4 text-ok" strokeWidth={2} aria-hidden /> : view.status === "running" || view.status === "starting" ? <Spinner /> : null}
          {done ? "Investigation complete" : view.status === "failed" ? "Investigation stopped" : view.status === "cancelled" ? "Stopped" : "Investigating"}
          {done && view.usage && <span className="font-normal text-ink-3">· {count(view.usage.calls)} model calls</span>}
        </span>
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} strokeWidth={1.5} aria-hidden />
      </button>
      {open && (
        <ol className="border-t border-line px-4 py-2">
          {visible.map((st, i) => (
            <li key={st.stage} className="relative flex gap-3 py-2.5">
              {i < visible.length - 1 && <span aria-hidden className="absolute left-[9px] top-8 h-[calc(100%-20px)] w-px bg-line" />}
              <span className="grid size-5 shrink-0 place-items-center pt-0.5">
                <StepIcon state={s[st.stage] === "pending" ? "active" : s[st.stage]} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[14px]", s[st.stage] === "active" || s[st.stage] === "pending" ? "text-ink" : "text-ink-2")}>{st.title}</div>
                <div className="mt-1 text-[13px] text-ink-2">{st.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StudySummary({ plan }: { plan: Plan }) {
  const { study } = plan;
  return (
    <div className="space-y-2">
      <p>{study.subject}</p>
      <div className="flex flex-wrap gap-1.5">
        {study.arms.map((a) => (
          <span key={a.id} className="rounded-full bg-subtle px-2.5 py-0.5 text-[12px] text-ink-2">
            <Mono className="text-ink-3">{a.id}</Mono> {a.label}
          </span>
        ))}
        <span className="rounded-full bg-subtle px-2.5 py-0.5 text-[12px] text-ink-2">{study.cases.length} test cases</span>
      </div>
      <ul className="space-y-1">
        {plan.hypotheses.map((h) => (
          <li key={h.id}>
            <Mono className="text-ink-3">{h.id}</Mono> {h.text}
          </li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer text-[12px] text-ink-3 hover:text-ink-2">See the setups and cases</summary>
        <StudyDesign study={study} />
      </details>
    </div>
  );
}

function Spinner() {
  return <span aria-hidden className="block size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent-text" />;
}

function StepIcon({ state }: { state: StageState }) {
  if (state === "done") return <Check className="size-4 text-ok" strokeWidth={2} aria-hidden />;
  if (state === "failed") return <X className="size-4 text-bad" strokeWidth={2} aria-hidden />;
  return <Spinner />;
}

function Elapsed({ since }: { since: number | null }) {
  const now = useNow(1000, true);
  if (!since || !now) return null;
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="font-mono tabular" aria-label={`Elapsed ${s} seconds`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function ErrorNote({ view, onRetry }: { view: LiveView; onRetry: () => void }) {
  const e = view.error!;
  const hint = e.kind ? ERROR_HINT[e.kind] : null;
  const title = e.code === "aborted" ? "You stopped the investigation" : e.code === "draft-invalid" ? "The investigator could not design a valid study" : "The investigation stopped";
  return (
    <div role="alert" className="mt-4 rounded-[14px] border border-line-strong bg-subtle px-4 py-3 text-[14px]">
      <div className="font-medium text-ink">{title}</div>
      {e.code !== "aborted" && <p className="mt-0.5 text-ink-2">{e.message}</p>}
      {hint && hint !== e.message && <p className="mt-1 text-[13px] text-ink-3">{hint}</p>}
      <div className="mt-3">
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

/** Says stage changes and the outcome to screen readers, not every counter tick. */
function Announcer({ view }: { view: LiveView }) {
  const text =
    view.status === "done"
      ? "Investigation finished. The answer is below."
      : view.status === "failed"
        ? "Investigation stopped."
        : view.status === "cancelled"
          ? "Investigation cancelled."
          : view.stages.run === "active"
            ? "Running the study."
            : view.stages.interpret === "active"
              ? "Writing the answer."
              : view.status === "starting" || view.stages.draft === "active"
                ? "Designing the study."
                : "";
  return (
    <p className="sr-only" aria-live="polite">
      {text}
    </p>
  );
}

/* ── No key: say so ───────────────────────────────────────────── */

function NotConfigured({ config }: { config: LivePublicConfig }) {
  return (
    <div className="mx-auto mt-[10vh] max-w-[620px] rounded-[14px] border border-line bg-surface p-5" role="region" aria-labelledby="nokey-h">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-accent-tint text-accent-text">
          <KeyRound className="size-4" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="nokey-h" className="text-[15px] font-medium text-ink">
            Live investigations are switched off on this server
          </h2>
          <p className="mt-1 text-ink-2">
            {config.problem ?? "No model key is configured. Set ANTHROPIC_API_KEY (or GEMINI_API_KEY) in the server environment and redeploy."}
          </p>
        </div>
      </div>
    </div>
  );
}
