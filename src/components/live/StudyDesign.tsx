import { Mono } from "@/components/research/common";
import { describeCheck, type Study } from "@/lib/live/study";

/** The setups and cases the investigator designed, exactly as they ran. */
export function StudyDesign({ study }: { study: Study }) {
  return (
    <div className="mt-2 space-y-4">
      <div className="grid gap-2 md:grid-cols-2">
        {study.arms.map((a) => (
          <div key={a.id} className="min-w-0 rounded-[10px] border border-line p-3">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-ink">
                <Mono className="text-ink-3">{a.id}</Mono> {a.label}
              </span>
              <span className="text-ink-3">
                temperature <Mono className="text-ink-2">{a.temperature}</Mono>
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words rounded-[6px] bg-subtle px-2.5 py-2 font-mono text-[12px] leading-[18px] text-ink-2">
              {a.system || "(no system prompt)"}
            </p>
          </div>
        ))}
      </div>
      <ol className="divide-y divide-line rounded-[10px] border border-line">
        {study.cases.map((c) => (
          <li key={c.id} className="px-3 py-2 text-[13px]">
            <div className="flex gap-2">
              <Mono className="shrink-0 text-ink-3">{c.id}</Mono>
              <span className="text-ink">{c.prompt}</span>
            </div>
            <div className="mt-0.5 pl-9 text-[12px] text-ink-3">
              Expects {c.expected} · check: {describeCheck(c.check)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
