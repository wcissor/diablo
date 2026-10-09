import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { LiveInvestigation } from "@/components/live/LiveInvestigation";
import { Page } from "@/components/pages/Library";
import { publicConfig } from "@/lib/live/env";
import { currentConfig } from "@/lib/live/team";

export const metadata: Metadata = { title: "Investigation" };

export default function LivePage() {
  return (
    <Page>
      <Suspense fallback={<LiveSkeleton />}>
        <Configured />
      </Suspense>
    </Page>
  );
}

/** The model setup is read per request, so adding a key takes effect without a rebuild. No key ever reaches the page. */
async function Configured() {
  await connection();
  return <LiveInvestigation config={publicConfig(await currentConfig())} />;
}

function LiveSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3">
      <div className="h-7 w-2/3 rounded-[6px] bg-sunken" />
      <div className="h-40 rounded-[10px] bg-sunken" />
      <div className="h-24 rounded-[10px] bg-sunken" />
    </div>
  );
}
