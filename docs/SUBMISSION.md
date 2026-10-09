# Diablo AI

**Diablo AI tells companies what is actually happening inside their AI systems: not just *that* a score moved, but *which change* moved it, and how sure they can be.**

- Live product: https://app.diablo.pnoia.dev (Continue with Google, any Google account)
- Code: https://github.com/BreusCEO/diablo-codebase
- Every statistic below is reproduced by `npm test` (`src/lib/submission-claims.test.ts`, `src/lib/bench/benchmark.test.ts`); cost estimates are labelled as such.

## Summary

**Problem.** Teams that ship AI change prompts, models, temperature and tools every week, often several at once. When quality drops, an eval dashboard shows *that* a score moved, not which change caused it or whether the drop is real. **Who has it.** Every company that integrates AI: a telecom running a support assistant, a startup shipping an agent, a lab comparing model versions (target segments; none is a customer). **What Diablo does.** You ask a question. The investigator model (Claude Opus 5.5) designs a study for it: setups of the model under test, test cases each with a rule code applies to the reply, competing hypotheses and paired experiments. Code runs every case on every setup (Claude Haiku 4.5), checks every reply and computes the effect size, 95% confidence interval, exact McNemar test, Holm correction and an evidence grade. The model writes the answer but can never write a number. **Proof.** On production, Diablo found a planted cause: a shortened prompt took accuracy from 40/40 to 0/40 (p < 0.001), while a temperature change showed no clear effect ([run record](runs/2026-10-09-production-run.md)). A seeded benchmark of 45,000 simulated regressions shows that when Diablo names a cause it is right 97.3% of the time, against 71.7% for blaming the largest drop. **Next.** Connect a customer's own AI system and pilot on one real regression.

## 1. Value for the user

**The specific problem.** Accuracy drops after a release that changed two things. Which one do you revert, with proof that survives review?

**Worked example** (illustrative, not customer data; computed by the repo's own `stats.ts`). The same 80 prompts, scored correct or incorrect, are compared pairwise against the baseline (69 of 80 correct):

| Change | Correct | Δ vs baseline | 95% CI | Exact McNemar | Verdict |
|---|---|---|---|---|---|
| E1: new system prompt | 57/80 | −15.0 pp | −26.3 to −3.8 pp | p = 0.012 (Holm-adjusted 0.024) | **Cause of the regression** |
| E2: temperature raised | 68/80 | −1.3 pp | −8.8 to +6.3 pp | p > 0.99 | No clear effect |

The CI is a paired bootstrap: 2,000 resamples, seed 1. Discordant pairs: E1 b = 16, c = 4; E2 b = 5, c = 4.

**Outcome.** Revert the system prompt and keep the temperature change. Diablo also states what it cannot claim: E2's interval still allows a drop of up to 8.8 pp, so the verdict is "no clear effect", never "harmless". A dashboard shows only 86.3% → 71.3% and 86.3% → 85.0%, with no interval: the team argues, reverts both, or calls it noise.

## 2. Prototype and use of AI

**The core scenario works end to end on a real model:** sign in with Google, ask a question, and watch Diablo design the study, run it, compute the statistics and write a checked answer, usually in one to two minutes. The investigation is saved, and the workspace shows its research graph, evidence (every reply with its check) and a printable report.

| Works today (live, tested) | Next (not built yet) |
|---|---|
| Live investigation of any question: study design, paired runs on a real model, statistics, number-checked answer | Connector that runs a customer's own AI system (API endpoint plus config) |
| Workspace for saved investigations: Overview, Graph, Evidence, Report, Session | Server-side storage and a knowledge base across investigations |
| Statistics engine: Wilson, Newcombe, two-proportion z, Fisher exact, exact McNemar, seeded paired bootstrap, Cohen's h, Holm | Sample-size planning before a run |
| Validity rubric C1–C9 and an evidence grade; verdicts derived from counts, never typed in | Autonomous monitoring ("something changed; investigate") |
| Google sign-in; an `/admin` panel where the team switches the investigator between Claude and Gemini | |

**What the AI contributes.** The investigator does an experienced evaluator's work:

- turns a vague question into testable, competing hypotheses;
- designs the setups to compare and writes test cases with checkable answers;
- explains the measured result in plain language and says what to do next.

**What the AI is not allowed to do.** It never scores a reply and never writes a number. Code applies each case's check, computes every rate, interval, p-value and verdict, and a grounding checker rejects any digit, percent sign or quantity word the model writes outside a `{{F1}}`-style placeholder; code fills those in from the fact table. On the first production run the checker caught the model writing "zero" and forced a rewrite.

## 3. Quality testing

**Automated (9 Oct 2026):** 293 unit tests pass (`npm test`), including statistics checked against SciPy/statsmodels values to within 5×10⁻⁵, plan validation, the paired runner, the code checks and the grounding checker; an end-to-end browser suite with axe accessibility checks; `npm run typecheck` and `npm run lint` are clean.

**Real runs on production models.**

1. **The first run was at ceiling.** Claude Opus 5.5 investigating Claude Haiku 4.5 on easy arithmetic: every setup scored 100%. Diablo reported "no measurable effect" and did not invent a cause. We made the items harder.
2. **The rerun found the planted cause.** Shortened prompt: 40/40 → 0/40 (exact McNemar p < 0.001, supported). Temperature 0.2 → 1.0: 40/40 → 39/40, no clear effect (95% CI −7.5 to 0.0 pp). 123 model calls, 63 s, ≈ $0.20 ([run record](runs/2026-10-09-production-run.md)).
3. **A user's own question.** "Why do some biodegradable plastics take years to decompose in landfills?" (Gemini 3.8 Flash investigating Gemini 3.5 Flash-Lite): a 12-case study with three setups. A plain-language prompt cut technical precision from 100% to 66.7%; an expert persona made no difference. An earlier run of the same question scored 100% in every setup, so we now instruct the investigator to write cases hard enough to separate the hypotheses.

**Failure examples: what goes wrong without Diablo, and what it catches.** All are pinned in `submission-claims.test.ts`.

1. **Fixing the wrong cause.** Long-context test fixture: the obvious hypothesis ("accuracy falls past 128k tokens") is *rejected*: −1.9 pp, CI −5.1 to +1.3. The competing one ("needle position matters") is *supported*: −10.0 pp, CI −14.3 to −6.0. A team that capped context length would have fixed nothing.
2. **A significant result with no alternative tested.** Sycophancy test fixture: +8.5 pp, CI 1.6 to 15.3, p = 0.016, but no competing hypothesis was tested. C9 fails, and the evidence stays "Moderate".
3. **A lucky p-value.** A borderline effect (p ≈ 0.03) among two primary tests gets a C7 warning, because it does not survive Holm.
4. **A result that does not replicate.** A reversed replication fails C8, and "Strong" drops to "Moderate".
5. **A judge grading its own family.** C4 fails, and the evidence becomes "Weak".

**Known failures of the prototype itself.** The investigator sometimes writes cases too easy to tell the hypotheses apart (a ceiling, reported honestly as "no clear effect"). Checks are rules, so a correct but unusually phrased reply can fail; every reply is shown with its check so a reviewer can see it. The model under test is one configured model; there is no connector to a customer's system yet. Saved investigations live in the browser.

**Compared with the current approach** (what each gives by default):

| | Spreadsheet of eval runs | Eval dashboard | Observability / tracing | Diablo |
|---|---|---|---|---|
| Shows that a metric moved | yes | yes | yes | yes |
| Says which change caused it | manual | no | no | yes: one experiment per hypothesis |
| CI and exact test on every comparison | rarely | rarely | no | always |
| Paired design on the same prompts | manual | rarely | no | yes (McNemar, paired bootstrap) |
| Grades whether the result can be trusted | no | no | no | C1–C9 rubric |
| Claim → evidence → raw trace | no | partial | traces only | yes |

**Measured against the common shortcuts: a planted-cause benchmark** ([`docs/BENCHMARK.md`](BENCHMARK.md), reproduce with `npm run bench`). This is a seeded simulation, not a model run: no LLM is called and nothing touches the network. It validates the *measuring* half (Diablo's statistical protocol, given one clean experiment per candidate factor), not the reasoning half. In 45,000 simulated updates, 2 to 4 factors changed at once, with one planted cause (a 5 to 20 pp drop) or none, 40 to 160 items per arm, and items of varying difficulty. Every approach ran on the same simulated data:

| Approach | Right cause named (a cause exists) | Innocent factor blamed (a cause exists) | Cause named when none exists | When it named a cause, it was the right one |
|---|---|---|---|---|
| Overall before/after (a dashboard) | cannot attribute; flags the drop in 51.7% | 0% | 0% | never names one |
| Blame the largest observed drop (an untested eyeball or LLM judgment) | 84.5% | 13.1% | 81.0% | 71.7% |
| Paired tests, no multiple-comparison correction | 49.7% | 2.4% | 4.1% | 93.5% |
| Unpaired tests with Holm | 31.7% | 0.3% | 0.4% | 98.6% |
| **Diablo: paired exact McNemar per factor, Holm across factors** | **41.0%** | **0.9%** | **1.1%** | **97.3%** |

- **The trade-off, stated plainly.** Diablo's claims hold up, and it pays for that in power: when the evidence is thin it answers "no attributable cause" instead of guessing. It names the right cause in 80% of scenarios only from n = 80 for a 20 pp drop (83.1%) and n = 160 for a 15 pp drop (89.2%); at n = 160 it finds a 5 pp drop 13.6% of the time.
- **Intervals.** Its 95% CIs (the app's own paired bootstrap) covered the true effect 95.5% of the time for the real cause and 96.1% for factors with no effect.
- **Concrete seeds,** including Diablo's own failures: one where both shortcuts revert retrieval top-k while the real cause was the temperature (Diablo: no attributable cause), one where Diablo misses a real 10 pp cause at 40 items, and one where it blames a factor that changed nothing.
- Every number above is pinned in `src/lib/bench/benchmark.test.ts`, which also fails if `docs/BENCHMARK.md` is stale.

## 4. Feasibility

**Data requirements.** No training data and no fine-tuning. Today Diablo writes its own test cases per question. For a customer it needs:

1. API access to the AI system and each version's config (model, prompt, temperature, tools);
2. prompts from production logs or an eval set, ideally 30 or more per setup;
3. a check per case: a rule (contains, exact number, word limit, JSON schema) or, later, a judge from another model family checked against human labels.

**Running cost.** Measured: the first full production investigation made 123 model calls and cost about **$0.20** at list price. Estimate for a long investigation (12 reasoning steps of 10k new input, 20k cached and 2k output tokens on Claude Opus 5.5 at $4 / $0.20 / $20 per 1M tokens): 0.12M × $4 + 0.24M × $0.20 + 0.024M × $20 ≈ **$1.01**. The customer's own model calls are extra; statistics run locally at no cost.

**Stack.** Next.js 16 on Vercel, Google OAuth, Vercel Blob for the system setting. All data access goes through one typed `DataProvider` interface (`src/lib/data/provider.ts`), so the in-browser store can be swapped for a server backend.

**Next step.** A connector for one customer's AI system, then a pilot on one real regression, measured against how that team decides today.

## 5. Originality

- **A new job, not a new dashboard.** Eval tools score and observability tools trace. Diablo *investigates*: question → competing hypotheses → controlled experiments → verdicts. It answers "why", not just "what".
- **"The AI reasons. The system measures."** Enforced in code and on screen, so an LLM's fluency cannot leak into the numbers.
- **Evidence has a grade.** Every conclusion carries a strength from an explicit nine-check rubric (control, sample size, randomisation, judge independence, human agreement, multiplicity, replication, competing hypotheses).
- **Where it goes (vision, not built).** Every investigation leaves knowledge behind: failure modes, causes, fixes that worked or failed. Later Diablo notices regressions by itself and applies the same loop to its own research strategy, with every change explicit, testable, reversible and auditable.
