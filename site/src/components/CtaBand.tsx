import { Mark } from "@/components/Mark";
import { Reveal } from "@/components/Reveal";
import { TryButton } from "@/components/TryButton";

/** The closing band on every page: one sentence, one action. */
export function CtaBand({
  title = "Investigate your AI.",
  line = "Ask Diablo a question about your AI. Sign in with Google and watch it investigate.",
}: {
  title?: string;
  line?: string;
}) {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <Reveal className="relative mx-auto max-w-6xl overflow-clip rounded-[2rem] bg-burgundy px-6 py-16 text-cream sm:px-14 sm:py-20">
        <Mark size={440} className="pointer-events-none absolute -bottom-28 -right-6 text-cream/[0.06]" />
        <div className="relative max-w-xl">
          <h2 className="t-title text-balance">{title}</h2>
          <p className="t-lead mt-5 text-cream/80">{line}</p>
          <div className="mt-9">
            <TryButton size="lg" tone="cream" />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
