<p align="center">
  <img src="public/icon.svg" width="88" alt="Diablo AI" />
</p>

<h1 align="center">Diablo AI</h1>

<p align="center"><b>AI that evolves AI.</b><br/>The research engine that tells you <i>why</i> your AI got better or worse, and proves it.</p>

<p align="center">
  <a href="https://app.diablo.pnoia.dev"><b>Live product</b></a> ·
  <a href="https://diablo.pnoia.dev">Website</a> ·
  <a href="docs/runs/2026-10-09-production-run.md">A real run, recorded</a> ·
  <a href="docs/BENCHMARK.md">Benchmark</a>
</p>

---

## Every company now ships AI. Nobody can explain it.

Prompts, models, tools and retrieval change every week. When quality drops, today's tools say **that** a number moved. They cannot say **which change** moved it, or whether the drop is even real. So teams guess, roll back everything, or ship the regression. Each wrong guess costs engineering weeks and customer trust.

**Diablo answers the question nobody else can: "which change caused this, and how sure are we?"**

## How it works

Ask a question in plain language. Diablo turns it into **competing hypotheses**, designs **one controlled experiment per hypothesis**, runs your AI on the same items in both arms, and returns a **verdict per cause**: effect size, 95% confidence interval, exact test, multiple-comparison correction and an evidence grade, each traceable to the raw outputs.

> **The AI reasons. The system measures.**
> The model (Claude Opus 5.5) plans the investigation and explains the result. Code runs the experiments and computes every number. A grounding checker rejects any number the model tries to write itself. Diablo cannot hallucinate a result.

## Proof, not promises

**It works on a real model, live in production.** On 9 Oct 2026, Claude Opus 5.5 planned an investigation into a system with two changes shipped at once. Claude Haiku 4.5 was the system under test, and code ran 120 paired calls. Diablo found the planted cause: the prompt change took accuracy from **40/40 to 0/40** (exact McNemar p < 0.001). It cleared the innocent temperature change (40/40 to 39/40, no clear effect). On the first draft, the checker caught the model writing a number by hand and forced a rewrite. [Full event log →](docs/runs/2026-10-09-production-run.md)

**It doesn't cry wolf.** Across a seeded benchmark of **45,000** simulated regressions with a known planted cause, Diablo's protocol:
- named the right cause **97.3%** of the time when it named one;
- raised a false alarm on only **1.1%** of no-cause scenarios, against **81%** for the common "blame the biggest drop" approach.

[Method and every number →](docs/BENCHMARK.md)

**It investigates your question, not a script.** Ask anything about how an AI behaves. The investigator designs the study for that question: the setups to compare, 10 to 24 test cases each with a rule code applies to the reply, and competing hypotheses. Asked *"Why do some biodegradable plastics take years to decompose in landfills?"*, it built a 12-case study with three setups and found that a plain-language prompt cut technical precision from 100% to 66.7%, while an expert persona made no difference.

**It's engineered like infrastructure.** The statistics engine matches SciPy and statsmodels to within 5×10⁻⁵. There are 293 unit tests, plus an end-to-end browser suite with accessibility checks. Google sign-in uses signature-verified tokens, and there is no path by which a model-written number reaches a published result.

## The economics

| | |
|---|---|
| Model cost of that real investigation (123 calls) | **≈ $0.20** |
| Planned price (free during early access) | Pro **$49**/month · Team **$199**/workspace/month · Enterprise custom |
| What it replaces | Days of an ML engineer's time per regression, and the cost of shipping the wrong fix |

No training data, no fine-tuning, no data warehouse. Diablo needs API access to the system under test and a set of prompts. Statistics run locally, at zero marginal cost.

## Why now

- **AI is moving from demos to operations.** The hard problem is no longer building a model but knowing what a change did to it.
- **Models update monthly, and agents add tools weekly.** Every update is an uncontrolled experiment unless something measures it.
- **Buyers and regulators are starting to ask for evidence, not anecdotes.** Diablo produces it by construction.

## Where it goes: AI that evolves AI

1. **Now: investigations on demand.** Ask why something changed and get a verdict with proof. *(Live.)*
2. **Next: connect any AI system.** Point Diablo at your own model, agent or app endpoint, so findings persist into a knowledge base of causes, failure modes and fixes that compounds with every investigation.
3. **Then: autonomous discovery.** Diablo notices that behaviour changed, investigates on its own, and verifies a fix before anyone files a ticket.
4. **Ultimately: a self-improving investigator.** Every verified investigation becomes training data, so Diablo learns to investigate better. Any new version is promoted only if it beats the current one on a held-out benchmark. Every change stays explicit, testable and reversible.

**Who it's for:** every company that ships AI. That includes telecoms running support assistants, startups shipping agents, and labs comparing model versions. *(Target segments, not current customers.)*

## Team

**Ilham Orujov** and **wcissor**, founding team. Built for the OMNI AI Summit hackathon.

## Honest status

| Works today | Next |
|---|---|
| Live investigations of any question on a real model (Claude Opus 5.5 investigates, Claude Haiku 4.5 is under test; Gemini is a system-wide alternative in `/admin`); the workspace for every saved investigation (overview, research graph, evidence, report); the statistics engine and validity rubric; Google sign-in | Connectors to customers' own AI systems; server-side storage of runs and knowledge; the improve-then-verify loop; more experiment types. See [Not yet implemented](#not-yet-implemented). |

Submission material: [`docs/SUBMISSION.md`](docs/SUBMISSION.md) · [`docs/DISCLOSURE.md`](docs/DISCLOSURE.md) · [`docs/BENCHMARK.md`](docs/BENCHMARK.md)

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

First time on a machine: `npx playwright install chromium`. The e2e server builds with a throwaway `AUTH_SECRET` and a test-only sign-in (`NEXT_PUBLIC_DEMO_MODE=1`, never set in production) so specs can sign in without Google.

Deploying: production is deployed with the Vercel CLI from a local folder, which uploads the working tree and ignores `.gitignore`. The committed `.vercelignore` keeps local env files, QA and test output, `site/` and `engine/` (separate projects) and `learn/` out of the upload. Keep `e2e/` in it: `playwright.config.ts` imports `e2e/helpers`, and `next build` type-checks both. `tsconfig.json` and the ESLint config also skip `learn/`, so a local course folder never breaks the app's checks. Run `npx next build` locally before deploying.

## Sign-in

Every workspace route (`/home`, `/investigations`, `/live`, `/systems`, `/experiments`, `/evidence`, `/reports`, `/datasets`, `/settings`, `/design`) needs a session. There is no database: the session is a signed JWT (HS256, `jose`) in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production) that lasts 7 days.

- **Continue with Google**: OAuth 2.0 Authorization Code flow with PKCE (S256), a `state` and an OpenID Connect `nonce`, done with plain `fetch`. The verifier, state, nonce and return path travel in a 10-minute signed cookie scoped to `/api/auth/google`. The callback checks state, exchanges the code with the verifier, then verifies the ID token: its RS256 signature against Google's published keys (`https://www.googleapis.com/oauth2/v3/certs`, fetched with `jose` and cached), issuer, audience and `azp`, expiry, the nonce from the cookie, and a verified email. If `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are not set, the button is shown disabled with the reason.
- **Email and password** are not offered: they need a user store (hashes, verification, resets), and this app deliberately has no database. Add one before adding them.

How it fits together:

| Path | Role |
| --- | --- |
| `src/proxy.ts` | Verifies the cookie for every workspace route and app API route; redirects to `/` with `?next=`; sends signed-in visitors on `/` on to `?next=` or `/home`; deletes a cookie that fails verification; refuses state-changing app API requests (not GET/HEAD/OPTIONS) from any other origin |
| `src/app/(app)/layout.tsx` | Starts the server-side session read (`getSession()`), hands the promise to `SessionProvider`, and redirects again if it is missing (defence in depth) |
| `src/lib/auth/` | `env` (the only env reads), `session` (sign/verify), `google` (PKCE flow), `dal` (`getSession()`), `http` (cookies, same-origin check), `next-path` (open-redirect guard) |
| `src/app/api/auth/*` | `GET google`, `GET google/callback`, `POST signout` (POSTs require a same-origin `Origin`) |
| `src/components/auth/SessionProvider.tsx` | `useSession()` and `signOut()` for client components |

Environment variables (see `.env.example`): `AUTH_SECRET` (required in production, 32+ characters: `openssl rand -base64 32`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and optionally `APP_ORIGIN` (the public origin used for the redirect URI; defaults to the request's). The sign-in page renders per request (so errors and `?next=` work without JavaScript) and reads the Google variables when it renders; on Vercel a change to them takes effect on the next deploy.

Google Cloud Console: create an OAuth client of type **Web application** with the authorized redirect URIs `https://app.diablo.pnoia.dev/api/auth/google/callback` and `http://localhost:3123/api/auth/google/callback`. Scopes: `openid`, `email`, `profile`.

## Where things are

| Path | What it is |
| --- | --- |
| `src/app/page.tsx` | Sign-in: burgundy, the mark reveals itself (full once per browser, short after), then Continue with Google |
| `src/app/(app)/home` | Home: "What do you want to find out?" and the composer; a question opens a live investigation |
| `src/app/(app)/investigations/[id]` | Workspace: Session, Overview, Graph, Evidence and Report tabs, and the experiment panel |
| `src/app/(app)/{systems,experiments,datasets,evidence,reports,settings}` | Library pages and settings |
| `src/app/legal/*` | Terms, Privacy and Usage drafts (pending legal review) |
| `src/proxy.ts` | Route protection (see "Sign-in") and real 404s for investigation URLs that cannot exist |
| `src/lib/brand.ts` | Product name, legal entity and contact details (open decisions, one place) |
| `src/lib/stats.ts` | Wilson, Newcombe, z-test, Fisher, McNemar, Cohen's h, bootstrap, Holm, formatting |
| `src/lib/validity.ts` | Validity checks C1–C9 and evidence strength (rubric v0, draft) |
| `src/lib/data/` | Types, derived results, interpretation text, the `DataProvider` interface and hooks |
| `src/lib/data/mock/` | The in-browser store for saved investigations (and the test fixtures) |
| `src/lib/live/` | The live engine: LLM port and adapters, study design and checks, paired runner, grounding, abuse guard (see [Live investigations](#live-investigations)) |
| `src/app/(app)/live`, `src/app/api/live/run` | The investigation page and its streaming API |
| `src/components/shell/*` | Sidebar, account menu, mobile drawer, command palette, toasts |
| `src/components/research/*` | Workspace tabs, graph, evidence browser, trace viewer, report |
| `src/components/charts/*` | Forest plot, paired rates, curve, heatmap, with table view, CSV and SVG export |
| `src/app/globals.css` | Design tokens (light and dark), focus, reduced motion, print |
| `e2e/`, `qa/` | Playwright tests; screenshot and contrast scripts; `qa/baseline` and `qa/after` screenshots |

## Live investigations

`/live` investigates the question you ask, end to end, on a real model. **The AI reasons. The system measures.** The investigator model designs the study and explains the result; code calls the model under test, checks every reply, computes every statistic and checks every number. The model can never put a number into a published result.

| Stage | Who | What happens |
| --- | --- | --- |
| Design | model | The investigator returns one JSON study for the question (`src/lib/live/draft.ts`): 2 to 4 setups of the model under test (a system prompt and a temperature each), 10 to 24 test cases, each with a check of a closed kind (`contains_any`, `contains_all`, `contains_none`, `number` with a tolerance, `max_words`), at least two competing hypotheses, and paired experiments that compare two setups. Zod validates it; a rejected plan goes back with the validator's reasons, at most twice. If no valid plan arrives the run fails; a plan is never invented. |
| Run | code | A paired runner (`runner.ts`) sends every case to both setups of each experiment, with a concurrency pool, per-call timeouts and a run deadline. A setup two experiments share is called once per case. The check is applied by code (`study.ts`), never by a model. A failed call leaves its pair out; it is never scored as wrong. |
| Analyse | code | The outcomes become the app's own `Investigation` type and the existing code does the statistics: exact McNemar and a seeded paired bootstrap per experiment, Holm across experiments, verdicts, checks C1–C9 (`src/lib/data/derive.ts`, `src/lib/stats.ts`, `src/lib/validity.ts`). |
| Interpret | model | Code builds a fact table (every rate, interval, p-value and verdict). The model writes the answer with `{{F1}}`-style placeholders only; a checker (`grounding.ts`) rejects any digit, percent sign or quantity word outside a placeholder. Code then substitutes the values. If the text fails twice, the page shows a summary built by code and labels it as such. |

The page puts the question first, shows what the investigator is doing step by step (design, replies run, statistics, answer), then an answer card with each experiment's before → after rate and a verdict per hypothesis. Details sit in tabs: results (table, forest plot, validity notes), study design (setups and cases), every reply with its check, and the run record. Each finished investigation is saved to the sidebar and opens in the workspace. With no question, a run uses a default scenario (an assistant that shortened its prompt and raised its temperature at once).

### Setup

The team's setup is Claude: **Claude Opus 5.5** investigates (designs the study, writes the answer) and **Claude Haiku 4.5** is the model under test. An admin can switch the whole system to Gemini (Gemini 3.8 Flash investigates, Gemini 3.5 Flash-Lite is under test) in `/admin`.

1. Create a Claude API key in the Claude Console under Settings → API keys: https://platform.claude.com/settings/keys. Claude API usage is billed to the key's account (there is no free tier beyond a new account's small trial credit).
2. Add it as `ANTHROPIC_API_KEY`: locally in `.env.local`; on Vercel under Project → Settings → Environment Variables, then redeploy. If the key is not scoped to a single workspace, also set `ANTHROPIC_WORKSPACE_ID` (the `wrkspc_…` id from Settings → Workspaces); the API refuses such a key without it.
3. Optional: `DIABLO_REASONING_MODEL` (default `claude-opus-5-5`) and `DIABLO_TARGET_MODEL` (default `claude-haiku-4-5`). Model ids were checked against the Claude models overview and deprecations pages on 9 Oct 2026.

**Why the target is Claude Haiku 4.5.** Studies set the temperature per setup, so the model under test must accept temperatures other than 1. The Claude API refuses them on Claude Opus 4.7 and every later model, Claude Haiku 5.5 included; Claude Haiku 4.5 takes 0 to 1. A target that rejects temperature switches live runs off with that reason instead of failing mid-run.

**Alternative.** `GEMINI_API_KEY` (defaults `gemini-3.8-flash` and `gemini-3.5-flash-lite`). With both keys set, Claude is used unless an admin switches to Gemini.

**How the engine calls Claude** (`src/lib/live/llm/anthropic.ts`, plain `fetch`, written against the Claude API docs as read on 9 Oct 2026):

- `POST https://api.anthropic.com/v1/messages` with `x-api-key`, `anthropic-version: 2023-06-01` and, when set, `anthropic-workspace-id`. The key is only ever a request header.
- Body: `model`, `max_tokens` (12,000 to design, 4,096 for the answer, 1,024 per target reply), `system` as a top-level string, `messages`, and `temperature` only on target calls. No `thinking` field: Claude Opus 5.5 always thinks (adaptive, default effort `medium`), and that thinking counts toward `max_tokens` and is billed as output; Claude Haiku 4.5 does not think unless asked.
- JSON: the Claude API has no schema-free JSON mode and current models refuse an assistant prefill, so the prompt asks for one JSON object and the existing zod validate-and-repair loop checks it. Structured outputs (`output_config.format`) are supported on Claude Opus 5.5 but not used yet: the plan's schema should first be tried against the real API.
- The answer is the text blocks joined; `thinking` and `redacted_thinking` blocks are dropped. A reply stopped by `max_tokens` (or a full context window) is a typed bad response that still counts its billed tokens; a `refusal` comes back as an answer with its category.
- Errors: 401 `authentication_error` and 403 `permission_error` → auth; 402 `billing_error` and spend limits (a 429 with `error_code: enforced_spend_limit_reached`, or a 400 for a limit you set) → quota; 404 → model not found (a wrong workspace id → auth); 429 `rate_limit_error` → rate limit; 500 `api_error`, 504 `timeout_error`, 529 `overloaded_error` → server; 400 `invalid_request_error`, 413 `request_too_large` → bad request. Only rate limits and server errors are retried, at most 3 times, waiting `retry-after` when given (never more than 20 s per wait), else 1 s, 2 s, 4 s. Messages name the status, error type and `request-id`, with the key redacted.

Without a key, `/live` says so plainly and `POST /api/live/run` answers 503; nothing is simulated in its place.

### Budget, cost and limits

A study has at most 4 setups × 24 cases, so at most 96 target calls, plus up to 3 calls to design and 2 to write the answer. The run stops starting calls after 180 s and analyses the pairs it finished; the route allows 300 s in total. Other limits (environment variables, clamped): 4 target calls in flight, 30 s per target call, 90 s per reasoning call, 500 model calls per UTC day per server instance, a 30 s cooldown between one session's runs, 2 runs at once.

**Measured cost.** The first production run (Claude Opus 5.5 + Claude Haiku 4.5, 123 model calls) cost about **$0.20** at list price ([run record](docs/runs/2026-10-09-production-run.md)). Each finished run's record shows its own measured tokens priced at the list prices in `src/lib/live/pricing.ts`. Errors are typed (auth, model not found, rate limit, quota, server, network, timeout, bad response); a bad key, an unknown model or an exhausted quota stops the run at once. Keys are read only in `src/lib/live/env.ts`, sent only as a request header, and redacted from every error message.

The run API (`POST /api/live/run`, Node runtime) streams NDJSON events: `start`, `stage`, `draft-attempt`, `plan`, `progress`, `interpret-attempt`, then `result` or `error`. It needs a signed-in session (the proxy checks the cookie, the route checks again through `getSession()`) and a same-origin request. The abuse controls (one run at a time per session, a cooldown, a cap on concurrent runs and a daily call cap) live in memory per server instance (`src/lib/live/guard.ts`): best effort, not a distributed limiter. A cold start resets them, and the provider's own quota remains the final backstop. Leaving the page cancels the run.

### What is real and what is not

- Real: every call to the investigator and the model under test, every reply, every check and every statistic on `/live`. Without a key, `/live` says so and nothing is simulated in its place.
- Tested without a key too: the whole pipeline runs in unit tests against a scripted fake model and a fake target (`src/lib/live/*.test.ts`), and both adapters are tested against mocked `fetch`.
- Saved investigations live in the browser (the API stores nothing). One model under test and the cases the investigator wrote: a result holds for that setup.

## Not yet implemented

- **Persistence:** no server database. Investigations, evidence and knowledge stay in the browser; no crash-resume.
- **Targets:** the model under test is one configured model, varied by system prompt and temperature. Connectors to a customer's own HTTP agent, app or Hugging Face model are not built.
- **Experiment types:** paired A/B comparisons between setups. Sweeps, perturbation, consistency and counterexample search are not built.
- **Improve → verify loop, knowledge base, autonomous monitoring:** not built.
- **LLM judges:** not used; every check is a rule applied by code.

## Principles

- Burgundy `#57001A` and cream `#FCF8EF` come from the mark. Burgundy is an accent inside the app (primary buttons, Send, the active row and tab, the selected graph node, the running dot and running edges, links in prose, the focus ring) and the surface of the entrance only.
- Measured vs interpreted: numbers, tables and charts are Geist and Geist Mono on the page. Text the agent writes is Newsreader, after a quiet "Interpretation" label.
- No invented numbers: fixtures store counts; every rate, interval, p-value and effect size is computed by `stats.ts`. "Not recorded" is a state, never a pass.
- Motion explains a state change. Two continuous animations, both meaning "data is arriving": the running dot and the dashes on a running experiment's edges. The entrance reveal is the one expressive moment; the mark's eyes follow the pointer and blink only while you are active. `prefers-reduced-motion`, or Settings → Motion → Reduce, turns all of it off.
- Sentence case, units on every number, nothing under 12px, contrast 4.5:1 for text.

## Shortcuts

`Ctrl K` / `⌘K` command palette · `Ctrl \` / `⌘\` collapse the sidebar · `?` keyboard shortcuts · `Enter` send · `Shift Enter` new line · arrows move between tabs and graph nodes · `+` `−` `0` zoom and fit the graph · `Esc` closes dialogs, menus and the panel.
