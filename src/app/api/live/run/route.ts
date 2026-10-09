import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/dal";
import { isSameOrigin } from "@/lib/auth/http";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { maxCalls } from "@/lib/live/budget";
import { emptyUsage, investigate } from "@/lib/live/investigate";
import { createModels } from "@/lib/live/llm";
import { liveGuard, sessionKey } from "@/lib/live/server";
import { currentConfig } from "@/lib/live/team";
import type { LiveEvent } from "@/lib/live/types";
import { shortId } from "@/lib/slug";

/**
 * POST /api/live/run: starts a live investigation and streams its progress
 * as NDJSON (one LiveEvent per line), ending with a "result" or an "error".
 *
 * - Signed-in sessions only (the proxy checks the cookie; this checks again
 *   through the data access layer) and same-origin requests only.
 * - 503 with a JSON message when no model provider is configured.
 * - 429 when the session already has a run, is cooling down, the instance is
 *   busy or today's call cap is spent (see src/lib/live/guard.ts).
 * - If the client goes away, the run is cancelled: no further model calls.
 */
export const maxDuration = 300;

const noStore = { "Cache-Control": "no-store" };

function problem(status: number, error: string, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error, message }, { status, headers: { ...noStore, ...headers } });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return problem(403, "forbidden", "Cross-site requests are refused.");
  const session = await getSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to run a live investigation.");

  // Body: { objective?: string }. The reasoner is the system-wide setting from /admin.
  let body: { objective?: unknown } = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object") body = parsed as typeof body;
  } catch {
    // An empty or invalid body means the defaults.
  }
  const objective = typeof body.objective === "string" ? body.objective : undefined;
  const config = await currentConfig();
  const models = createModels(config);
  if (!config.provider || !models) {
    return problem(503, "not_configured", config.problem ?? "Live runs need a model key: set ANTHROPIC_API_KEY (or GEMINI_API_KEY) on the server.");
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? `${session.provider}:${session.user.id}`;
  const lease = liveGuard().acquire(await sessionKey(token), maxCalls(config.caps).total);
  if (!lease.ok) return problem(429, lease.code, lease.message, { "Retry-After": String(lease.retryAfterSeconds) });

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const usage = emptyUsage();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: LiveEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client went away; the abort below stops the run.
        }
      };
      try {
        await investigate({
          reasoning: models.reasoning,
          target: models.target,
          models: { provider: config.provider!, reasoning: config.reasoningModel, target: config.targetModel },
          caps: config.caps,
          id: `live-helper-${shortId()}`,
          emit: send,
          signal: abort.signal,
          usage,
          objective,
        });
      } catch (e) {
        // The error event has been sent. Log only what is safe: adapter messages never contain the key.
        if (!abort.signal.aborted) console.error("[live] run ended with an error:", e instanceof Error ? `${e.name}: ${e.message}` : "unknown");
      } finally {
        lease.release(usage.calls);
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled client.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
