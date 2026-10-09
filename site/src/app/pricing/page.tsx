import type { Metadata } from "next";
import { CtaBand } from "@/components/CtaBand";
import { PageHero } from "@/components/PageHero";
import { Faq } from "@/components/pricing/Faq";
import { Plans } from "@/components/pricing/Plans";
import { SectionHead } from "@/components/Reveal";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "Pricing",
  description: "Diablo AI is free during early access. The plans we intend to offer afterwards, and answers to common questions.",
});

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Pricing" title="Free during early access.">
        Today Diablo investigates your questions on a real model, and it costs you nothing. These are the plans we intend to
        offer once you can connect your own AI.
      </PageHero>

      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <Plans />
        </div>
      </section>

      <section id="faq" className="scroll-mt-16 border-t">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead eyebrow="Questions" title="What people ask." />
          <Faq />
        </div>
      </section>

      <CtaBand />
    </>
  );
}
