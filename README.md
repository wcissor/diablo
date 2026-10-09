# Diablo AI

**Diablo AI lets companies understand what is actually happening inside their AI systems: not just *that* a score moved, but *which change* moved it, and how sure they can be.**

Live demo: **https://diablo.pnoia.dev** (click "Enter demo workspace"; no account needed) · Submission: [`docs/SUBMISSION.md`](docs/SUBMISSION.md) · Stage pitch: [`docs/PITCH.md`](docs/PITCH.md) · Self-assessment: [`docs/SCORECARD.md`](docs/SCORECARD.md) · Benchmark: [`docs/BENCHMARK.md`](docs/BENCHMARK.md) · Disclosure: [`docs/DISCLOSURE.md`](docs/DISCLOSURE.md) · Video (72 s): https://diabloai.pnoia.dev/demo.mp4

A question such as "why did it get worse?" becomes competing hypotheses, controlled experiments, evidence and a verdict, with an effect size, a 95% confidence interval, an exact test and a validity grade, traceable to raw outputs. **The AI reasons. The system measures.** The reasoning agent proposes (a rule-based stand-in in the demo workspace; a real model on the [Live investigation](#live-investigations) page once a key is set); every number is computed from stored counts by `src/lib/stats.ts`.

Proof you can rerun (`npm test`, pinned in `src/lib/submission-claims.test.ts`), on an illustrative example rather than customer data: of two changes shipped together, a new system prompt cost **−15.0 pp** (95% CI −26.3 to −3.8, exact McNemar p = 0.012), while a temperature change showed no clear effect (−1.3 pp, CI −8.8 to +6.3). Revert the prompt and keep the temperature change.

| Works today | Next |
| --- | --- |
| Full investigation loop in the browser on demo data; real statistics engine (Wilson, Newcombe, z, Fisher, exact McNemar, paired bootstrap, Holm); validity rubric C1–C9; a live investigation (`/live`) where a real model plans and explains while code runs the target and computes every number, as soon as `GEMINI_API_KEY` (or `ZAI_API_KEY`) is set; Google sign-in; 260 unit tests and 48 Playwright tests (sign-in setup included) pass on 9 Oct 2026 | A connector to a customer's AI system behind the existing `DataProvider` interface; live runs stored server-side instead of in the browser tab |

For every company that integrates AI, from telecoms to startups to frontier labs. These are target segments, not customers.

### About this repository

This repository is the clickable demo. Outside the Live investigation page, all data is illustrative and lives in your browser; those runs are simulated by a seeded mock provider. On `/live`, with a model key configured, the runs are real calls to a real model (see [Live investigations](#live-investigations)). Either way, every number on screen is derived from stored counts.

## Run it

```bash
npm install
cp .env.example .env.local   # optional in development; see "Sign-in" below
npm run dev -- -p 3123       # http://localhost:3123
```

Checks (all cross-platform, no bash needed):

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # unit tests (Vitest): statistics, validity rubric, slugs, time, storage recovery
npm run build        # production build
npm run test:e2e     # end-to-end + accessibility (Playwright, Chromium) against the production build
npm run check        # typecheck + lint + unit tests + build
npm run check:release  # fails while legal/contact placeholders remain in src/lib/brand.ts
```

First time on a machine: `npx playwright install chromium`. Run `npm run build` before `npm run test:e2e`. The e2e server gets a throwaway `AUTH_SECRET`; a setup project signs in once through the demo route and every spec reuses that session.

Deploying: production is deployed with the Vercel CLI from a local folder, which uploads the working tree and ignores `.gitignore`. The committed `.vercelignore` keeps local env files, QA and test output, `site/` and `engine/` (separate projects) and `learn/` out of the upload. Keep `e2e/` in it: `playwright.config.ts` imports `e2e/helpers`, and `next build` type-checks both. `tsconfig.json` and the ESLint config also skip `learn/`, so a local course folder never breaks the app's checks. Run `npx next build` locally before deploying.

## Sign-in

Every workspace route (`/home`, `/investigations`, `/live`, `/systems`, `/experiments`, `/evidence`, `/reports`, `/datasets`, `/settings`, `/design`) needs a session. There is no database: the session is a signed JWT (HS256, `jose`) in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production) that lasts 7 days.

- **Continue with Google**: OAuth 2.0 Authorization Code flow with PKCE (S256), a `state` and an OpenID Connect `nonce`, done with plain `fetch`. The verifier, state, nonce and return path travel in a 10-minute signed cookie scoped to `/api/auth/google`. The callback checks state, exchanges the code with the verifier, then verifies the ID token: its RS256 signature against Google's published keys (`https://www.googleapis.com/oauth2/v3/certs`, fetched with `jose` and cached), issuer, audience and `azp`, expiry, the nonce from the cookie, and a verified email. If `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are not set, the button is shown disabled with the reason.
- **Enter demo workspace**: a real server session flagged `demo` ("Demo researcher"), so the demo works without a Google account.
- **Email and password** are not offered: they need a user store (hashes, verification, resets), and this app deliberately has no database. Add one before adding them.

How it fits together:

| Path | Role |
| --- | --- |
| `src/proxy.ts` | Verifies the cookie for every workspace route and app API route; redirects to `/` with `?next=`; sends signed-in visitors on `/` on to `?next=` or `/home`; deletes a cookie that fails verification; refuses state-changing app API requests (not GET/HEAD/OPTIONS) from any other origin |
| `src/app/(app)/layout.tsx` | Starts the server-side session read (`getSession()`), hands the promise to `SessionProvider`, and redirects again if it is missing (defence in depth) |
| `src/lib/auth/` | `env` (the only env reads), `session` (sign/verify), `google` (PKCE flow), `dal` (`getSession()`), `http` (cookies, same-origin check), `next-path` (open-redirect guard) |
| `src/app/api/auth/*` | `GET google`, `GET google/callback`, `POST demo`, `POST signout` (POSTs require a same-origin `Origin`) |
| `src/components/auth/SessionProvider.tsx` | `useSession()` and `signOut()` for client components |

Environment variables (see `.env.example`): `AUTH_SECRET` (required in production, 32+ characters: `openssl rand -base64 32`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optionally `APP_ORIGIN` (the public origin used for the redirect URI; defaults to the request's). The sign-in page renders per request (so that without JavaScript the demo form still carries `?next=` and errors still show) and reads the Google variables when it renders; on Vercel a change to them takes effect on the next deploy.

Google Cloud Console: create an OAuth client of type **Web application** with the authorized redirect URIs `https://diablo.pnoia.dev/api/auth/google/callback` and `http://localhost:3123/api/auth/google/callback`. Scopes: `openid`, `email`, `profile`.

## Where things are

| Path | What it is |
| --- | --- |
| `src/app/page.tsx` | Sign-in: burgundy, the mark reveals itself (full once per browser, short after), then a glass card with Continue with Google and Enter demo workspace |
| `src/app/(app)/home` | Home: "What do you want to find out?", the composer, starters, recent investigations |
| `src/app/(app)/investigations/[id]` | Workspace: Session, Overview, Graph, Evidence and Report tabs, and the experiment panel |
| `src/app/(app)/{systems,experiments,datasets,evidence,reports,settings}` | Library pages and settings |
| `src/app/legal/*` | Terms, Privacy and Usage drafts (pending legal review) |
| `src/proxy.ts` | Route protection (see "Sign-in") and real 404s for investigation URLs that cannot exist |
| `src/lib/brand.ts` | Product name, legal entity and contact details (open decisions, one place) |
| `src/lib/stats.ts` | Wilson, Newcombe, z-test, Fisher, McNemar, Cohen's h, bootstrap, Holm, formatting |
| `src/lib/validity.ts` | Validity checks C1–C9 and evidence strength (rubric v0, draft) |
| `src/lib/data/` | Types, derived results, interpretation text, the `DataProvider` interface and hooks |
| `src/lib/data/mock/` | The mock provider: fixtures (counts only), the rule-based agent, the seeded simulator |
| `src/lib/live/` | The live engine: LLM port and adapters, target registry, dataset, scorer, paired runner, grounding, abuse guard (see [Live investigations](#live-investigations)) |
| `src/app/(app)/live`, `src/app/api/live/run` | The Live investigation page and its streaming API |
| `src/components/shell/*` | Sidebar, account menu, mobile drawer, command palette, toasts |
| `src/components/research/*` | Workspace tabs, graph, evidence browser, trace viewer, report |
| `src/components/charts/*` | Forest plot, paired rates, curve, heatmap, with table view, CSV and SVG export |
| `src/app/globals.css` | Design tokens (light and dark), focus, reduced motion, print |
| `e2e/`, `qa/` | Playwright tests; screenshot and contrast scripts; `qa/baseline` and `qa/after` screenshots |

## Live investigations

`/live` runs one investigation end to end on a real model, the moment a model key is configured. **The AI reasons. The system measures.** The model proposes hypotheses and experiments and explains the result; code calls the system under test, scores every answer, computes every statistic and checks every number. The model can never put a number into a published result.

**The planted change.** "Helper" is an arithmetic assistant. Helper v2 shipped two changes at once: a shortened system prompt ("reply with the result only") and a higher temperature (0.2 → 1.0). Which change moved accuracy, if either, is not known in advance: the run measures it.

| Stage | Who | What happens |
| --- | --- | --- |
| Draft | model | The reasoning model returns JSON: at least two competing hypotheses and the experiments that test them. Zod validates it against closed vocabularies built from the registry (`src/lib/live/registry.ts`): only the registry's two factors, only their values, items per arm within the budget, every hypothesis tested. A rejected plan goes back with the validator's reasons, at most twice. If no valid plan arrives the run fails; a plan is never invented. |
| Run | code | A paired runner (`runner.ts`) sends the same seeded items to both arms (`dataset.ts`: multi-step integer arithmetic, exact answers computed by code), with a concurrency pool, per-call timeouts and a run deadline. An arm two experiments share is called once per item. The scorer (`scorer.ts`) is code: the integer on the reply's last "Answer:" line (or else its last integer) must equal the exact answer. An empty reply cut off by the output limit leaves its pair out. A failed call leaves its pair out; it is never scored as wrong. |
| Analyze | code | The outcomes become the app's own `Investigation` type, and the existing code does the statistics: exact McNemar and a seeded paired bootstrap per experiment, Holm across experiments, verdicts, checks C1–C9 (`src/lib/data/derive.ts`, `src/lib/stats.ts`, `src/lib/validity.ts`). No new statistics code. |
| Interpret | model | Code builds a fact table (every rate, interval, p-value and verdict). The model writes the conclusion with `{{F1}}`-style placeholders only; a checker (`grounding.ts`) rejects any digit, percent sign or quantity word outside a placeholder and any placeholder not in the table. Code then substitutes the values. If the text fails twice, the page shows a summary built by code and labels it as such. |

The page shows the scenario, the most calls a run can make before you press Run, live stage progress with counts and tokens, then hypotheses with verdicts, each experiment's counts, Δ, 95% CI, exact McNemar p and Holm-adjusted p, the conclusion with a "Numbers checked" badge (or the "Code-built summary" label), the fact table, the run record and every reply. "Open in workspace" adds the run to the browser's investigations, where the graph, evidence browser and report render it like any other; live experiments are never re-run with simulated data.

### Setup

1. Create a Gemini API key in Google AI Studio: https://aistudio.google.com/apikey (the free tier needs no card).
2. Add it as `GEMINI_API_KEY`: locally in `.env.local`; on Vercel under Project → Settings → Environment Variables, then redeploy. `ZAI_API_KEY` (Z.ai GLM, OpenAI-compatible) works too; with both set, `DIABLO_LLM=gemini|zai` chooses.
3. Optional: `DIABLO_REASONING_MODEL` (default `gemini-3.8-flash`) and `DIABLO_TARGET_MODEL` (default `gemini-3.5-flash-lite`); for Z.ai the defaults are `glm-5.3` and `glm-4.7-flash`. The Gemini defaults were checked against Google's model list and pricing page on 9 Oct 2026; both have a free tier. Gemini 3 models think by default and that thinking counts as output tokens.

Without a key, `/live` says so plainly and `POST /api/live/run` answers 503; nothing is simulated in its place.

### Budget, cost and limits

| Setting | Default | Hard limits |
| --- | --- | --- |
| `LIVE_MAX_EXPERIMENTS` × 2 arms × `LIVE_MAX_ITEMS_PER_ARM` | 2 × 2 × 40 | 2–3 experiments, 10–100 items per arm |
| Model calls per run, at most | 165 (3 to plan, 160 target, 2 to interpret) | the product of the above |
| `LIVE_CONCURRENCY` | 4 target calls in flight | 1–8 |
| `LIVE_TARGET_TIMEOUT_SECONDS`, `LIVE_REASONING_TIMEOUT_SECONDS` | 30, 90 | 5–120, 10–180 |
| `LIVE_RUN_DEADLINE_SECONDS` | 180: no new target calls after this; the finished pairs are analysed | 30–270 (the route allows 300 s in total) |
| `LIVE_DAILY_CALL_CAP` | 500 model calls per UTC day | — |
| `LIVE_COOLDOWN_SECONDS` | 60 between runs of one session | 0–3600 |
| `LIVE_MAX_CONCURRENT_RUNS` | 2 | 1–4 |

A typical plan (two single-factor ablations against Helper v1) makes about 120 target calls plus 2 to 5 reasoning calls. On the free tier that costs nothing; the per-minute rate limit is what decides speed: a rate limit that outlasts the adapter's own retries pauses the whole pool and puts the call back in the queue, so a slow key gives fewer finished pairs before the deadline, and check C2 then flags the small sample. Retries happen only on 429 and 5xx, with capped backoff. Errors are typed (auth, model not found, rate limit, quota, server, network, timeout, bad response); a bad key, an unknown model or an exhausted daily quota stops the run at once. Keys are read only in `src/lib/live/env.ts`, sent only as a request header, and redacted from every error message.

The run API (`POST /api/live/run`, Node runtime) streams NDJSON events: `start`, `stage`, `draft-attempt`, `plan`, `progress`, `interpret-attempt`, then `result` or `error`. It needs a signed-in session (the proxy checks the cookie, the route checks again through `getSession()`) and a same-origin request. The abuse controls (one run at a time per session, a cooldown, a cap on concurrent runs and a daily call cap) live in memory per server instance (`src/lib/live/guard.ts`): best effort, not a distributed limiter. A cold start resets them, and the provider's own quota remains the final backstop. Leaving the page cancels the run.

### What is real and what is not

- Real, once a key is set: the planning and interpretation calls to the reasoning model, every call to the target model, every reply, every score and every statistic on `/live`.
- Not real anywhere else: the demo workspace's own investigations (seeded, simulated, labelled as such).
- Tested without a key: the whole pipeline runs in unit tests against a scripted fake model and a fake target (`src/lib/live/*.test.ts`), and both adapters are tested against mocked `fetch` (request shape, error classification, retries, timeouts, no key leakage). No key was available while this was built, so the live path has not yet been run against the real Gemini or Z.ai API; the Z.ai adapter in particular is kept small and only covered by mocked tests.
- Results are kept in the browser tab only (the API stores nothing). One target model and one seeded item set: a result holds for that setup.

## Principles

- Burgundy `#57001A` and cream `#FCF8EF` come from the mark. Burgundy is an accent inside the app (primary buttons, Send, the active row and tab, the selected graph node, the running dot and running edges, links in prose, the focus ring) and the surface of the entrance only.
- Measured vs interpreted: numbers, tables and charts are Geist and Geist Mono on the page. Text the agent writes is Newsreader, after a quiet "Interpretation" label.
- No invented numbers: fixtures store counts; every rate, interval, p-value and effect size is computed by `stats.ts`. "Not recorded" is a state, never a pass.
- Motion explains a state change. Two continuous animations, both meaning "data is arriving": the running dot and the dashes on a running experiment's edges. The entrance reveal is the one expressive moment; the mark's eyes follow the pointer and blink only while you are active. `prefers-reduced-motion`, or Settings → Motion → Reduce, turns all of it off.
- Sentence case, units on every number, nothing under 12px, contrast 4.5:1 for text.

## Shortcuts

`Ctrl K` / `⌘K` command palette · `Ctrl \` / `⌘\` collapse the sidebar · `?` keyboard shortcuts · `Enter` send · `Shift Enter` new line · arrows move between tabs and graph nodes · `+` `−` `0` zoom and fit the graph · `Esc` closes dialogs, menus and the panel.
