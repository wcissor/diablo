# Diablo AI

**Diablo AI lets companies understand what is actually happening inside their AI systems: not just *that* a score moved, but *which change* moved it, and how sure they can be.**

- Live demo: https://diablo.pnoia.dev (click "Enter demo workspace"; no account needed)
- Code: https://github.com/wcissor/diablo
- Every statistic below is reproduced by `npm test` (`src/lib/submission-claims.test.ts`); cost figures are labelled estimates.

## Summary

**Problem.** Teams that ship AI change prompts, models, tools and retrieval every week. When quality drops, an eval dashboard says *that* a score moved, not which change caused it or whether the drop is real. **Who has it.** Every company that integrates AI: a telecom such as Azercell running a support assistant, a startup shipping an agent, a frontier lab such as Anthropic or OpenAI comparing model versions. (Target segments only; none is a customer or partner.) **What Diablo does.** It turns a question ("why did it get worse?") into competing hypotheses and controlled experiments. Each hypothesis gets a verdict with an effect size, a 95% confidence interval, an exact test and a validity grade, traceable to raw outputs. The rule: **the AI reasons, the system measures**; the model can never write a number. **Proof.** The live prototype runs the full loop on demo data. Its statistics engine is real and checked against SciPy reference values: 260 unit tests and 48 end-to-end tests (sign-in setup included) pass (9 Oct 2026). A seeded planted-cause benchmark (45,000 simulated updates; it measures the protocol, not an LLM) shows that when Diablo's attribution rule, which its verdicts follow, names a cause, it is the right one 97.3% of the time, against 71.7% for blaming the largest observed drop. The same benchmark caught a gap in the app's verdicts, now fixed (section 3). **Next.** Put a real reasoning model (GLM-5.3) and a real target-system connector behind the existing provider interface, then run the first investigation on a live system.

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

**The core scenario works end to end in the browser:** ask a question; Diablo drafts hypotheses and experiments, runs them (simulated), analyses the evidence and concludes; replicate, flag a score, open the raw trace, print the report.

| Works today (live, tested) | Next (not built yet) |
|---|---|
| Investigation workspace (Overview, Graph, Evidence, Report, Session) and an experiment panel (design, config diff, effect, test, reproducibility) | Real reasoning model in the loop (GLM-5.3 planned) |
| Statistics engine: Wilson, Newcombe, two-proportion z, Fisher exact, exact McNemar, seeded paired bootstrap, Cohen's h, Holm | Connector that runs a customer's AI system (API endpoint plus config) |
| Validity rubric C1–C9 and an evidence-strength grade; "Not recorded" is never a pass | Persistent knowledge across investigations |
| Verdicts and statuses derived from counts, never typed in | Sample-size planning before a run |
| Rule-based demo agent (7 topics) and a seeded run simulator | Autonomous monitoring ("something changed; investigate") |
| Report export (print/PDF, JSON), chart export (CSV, SVG) | |
| **In progress, not merged:** Python engine whose Gemini provider turns a question into an experiment plan (`feat/gemini-provider`); Google sign-in (`feat/auth`) | |

**What the AI contributes.** The reasoning model does an experienced evaluator's work:

- turn a vague question into testable hypotheses, including a competing explanation;
- choose the experiment that separates them (an ablation, a sweep, a paired comparison);
- read the results and propose the next experiment;
- write the report.

The system does everything numeric: it runs the target, counts outcomes and computes every rate, interval, p-value and verdict from those counts. The code enforces this: fixtures store counts only, `derive.ts` computes the rest at render time, and interpretation is set in a different typeface under an "Interpretation" label. In today's demo a rule-based agent plays the reasoning role; the app says "Demo data" on screen.

## 3. Quality testing

**Commands run on 9 Oct 2026** (main plus the benchmark follow-up): `npm test` gave 260 passed (53 of them the planted-cause benchmark's, below); `npx playwright test` (production build) gave 48 passed (sign-in setup included); `npm run typecheck`, `npm run lint` and `npx next build` are clean. Counts grow as features land; rerun the commands rather than trusting these.

- **Statistics against references.** The Wilson, Newcombe, z-test, Fisher, McNemar and Holm results match SciPy/statsmodels values to within 5×10⁻⁵ (`src/lib/stats.test.ts`).
- **Rubric and derivations.** Missing fields never pass; every CI contains its Δ; the simulator is deterministic.
- **End to end.** Ask, run, replicate, flag, keyboard use, real 404s, corrupt-storage recovery, multi-page print; axe: 0 serious or critical issues on 18 routes, light and dark, 375 and 1440 px.

**Failure examples: what goes wrong without Diablo, and what it catches.** All are pinned in `submission-claims.test.ts`.

1. **Fixing the wrong cause.** Long-context demo: the obvious hypothesis ("accuracy falls past 128k tokens") is *rejected*: −1.9 pp, CI −5.1 to +1.3. The competing one ("needle position matters") is *supported*: −10.0 pp, CI −14.3 to −6.0. A team that capped context length would have fixed nothing.
2. **A significant result with no alternative tested.** Sycophancy demo: +8.5 pp, CI 1.6 to 15.3, p = 0.016, but no competing hypothesis was tested. C9 fails, and the evidence stays "Moderate".
3. **A lucky p-value.** A borderline effect (p ≈ 0.03) among two primary tests gets a C7 warning, because it does not survive Holm, and its hypothesis is not marked supported.
4. **A result that does not replicate.** A reversed replication fails C8, and "Strong" drops to "Moderate".
5. **A judge grading its own family.** C4 fails, and the evidence becomes "Weak".

**Known failures of the prototype itself.** The demo agent recognises 7 topics by keyword; anything else becomes a labelled "Template draft". The Session tab declines questions its data cannot answer. Runs are simulated; tokens and cost show "Not recorded".

**Compared with the current approach** (what each gives by default):

| | Spreadsheet of eval runs | Eval dashboard | Observability / tracing | Diablo |
|---|---|---|---|---|
| Shows that a metric moved | yes | yes | yes | yes |
| Says which change caused it | manual | no | no | yes: one experiment per hypothesis |
| CI and exact test on every comparison | rarely | rarely | no | always |
| Paired design on the same prompts | manual | rarely | no | yes (McNemar, paired bootstrap) |
| Grades whether the result can be trusted | no | no | no | C1–C9 rubric |
| Claim → evidence → raw trace | no | partial | traces only | yes |

**Measured against the common shortcuts: a planted-cause benchmark** ([`docs/BENCHMARK.md`](BENCHMARK.md), reproduce with `npm run bench`). This is a seeded simulation, not a model run: no LLM is called and nothing touches the network. It validates the *measuring* half (Diablo's statistical protocol, given one clean experiment per candidate factor), not the reasoning half. In 45,000 simulated updates, 2 to 4 factors changed at once, with one planted cause (a 5 to 20 pp drop) or none, 40 to 160 items per arm, and items of varying difficulty. Every approach ran on the same simulated scenarios:

| Approach | Right cause named (a cause exists) | Innocent factor blamed (a cause exists) | Cause named when none exists | When it named a cause, it was the right one |
|---|---|---|---|---|
| Overall before/after (a dashboard) | cannot attribute; flags the drop in 51.7% | 0% | 0% | never names one |
| Untested judgment: blame the largest observed drop | 84.5% | 13.1% | 81.0% | 71.7% |
| Paired tests, no multiple-comparison correction | 49.7% | 2.4% | 4.1% | 93.5% |
| Paired data analysed as if unpaired (z-test), with Holm | 31.7% | 0.3% | 0.4% | 98.6% |
| An unpaired design (fresh items in each arm), z-test with Holm | 33.1% | 1.9% | 2.2% | 93.2% |
| **Diablo: paired exact McNemar per factor, Holm across factors (the rule its verdicts follow)** | **41.0%** | **0.9%** | **1.1%** | **97.3%** |

- **The trade-off, stated plainly.** Diablo's claims hold up, and it pays for that in power: when the evidence is thin it answers "no attributable cause" instead of guessing. It names the right cause in 80% of scenarios only from n = 80 for a 20 pp drop (83.1%) and n = 160 for a 15 pp drop (89.2%); at n = 160 it finds a 5 pp drop 13.6% of the time. Pairing helps overall, but not everywhere: a design with fresh items in each arm finds more causes than Diablo in the three settings with the least evidence (a 5 pp drop at n = 40 and 80, a 10 pp drop at n = 40).
- **What the benchmark caught in Diablo itself.** The app's verdicts used to mark a hypothesis supported whenever its interval excluded zero, and showed a failed Holm check (C7) only as a warning. Checked on 2,250 of the scenarios, that rule raised false alarms in 8.2% of those with no cause, more than uncorrected paired tests (4.7%). Verdicts now also require the Holm correction, and they named exactly the protocol's factors in all 2,250 (`docs/BENCHMARK.md`, "The app's verdicts").
- **Intervals.** Its 95% CIs (the app's own paired bootstrap) covered the true effect 95.5% of the time for the real cause and 96.1% for factors with no effect.
- **Concrete seeds,** including Diablo's own failures: one where both shortcuts revert retrieval top-k while the real cause was the temperature (Diablo: no attributable cause), one where Diablo misses a real 10 pp cause at 40 items, and one where it blames a factor that changed nothing.
- Every number above is pinned in `src/lib/bench/benchmark.test.ts`, which also fails if `docs/BENCHMARK.md` is stale.

## 4. Feasibility

**Data requirements.** No training data and no fine-tuning. A customer provides:

1. API access to the AI system and each version's config (model, prompt, temperature, tools);
2. prompts from production logs or an existing eval set, at least 30 per arm (the demo uses 80 to 600);
3. a scorer: a rule (exact match, JSON schema) or an LLM judge from another model family, checked against human labels (draft threshold: agreement ≥ 0.80).

**Running cost** (estimate; assumptions stated, GLM-5.3 list prices per 1M tokens: $1.40 input, $0.26 cached input, $4.40 output). Assume one investigation takes 12 reasoning steps, each with 10k new input tokens, 20k cached context and 2k output tokens:

- GLM-5.3: 0.12M × $1.40 + 0.24M × $0.26 + 0.024M × $4.40 = $0.168 + $0.062 + $0.106 ≈ **$0.34 per investigation**.
- glm-5.3-flash ($0.15 / $0.03 / $0.50): $0.018 + $0.007 + $0.012 ≈ **$0.04**.
- LLM judging of the worked example on flash: 320 outputs × (1k input + 100 output tokens) = 0.32M × $0.15 + 0.032M × $0.50 ≈ **$0.06**.

The customer's own model calls are extra. Statistics run locally at no cost.

**Stack.** Next.js 16 on Vercel (live). All data access goes through one typed `DataProvider` interface (`src/lib/data/provider.ts`), so the in-browser mock can be swapped for a real backend.

**Next step (plan).** Implement an engine-backed `DataProvider`. GLM-5.3 returns hypotheses and experiment designs as JSON, which is validated with the existing zod schemas. Runs call the target system, and `stats.ts` remains the only source of numbers. Then run the first investigation on a real open-weights model and publish the report.

## 5. Originality

- **A new job, not a new dashboard.** Eval tools score and observability tools trace. Diablo *investigates*: question → competing hypotheses → controlled experiments → verdicts. It answers "why", not just "what".
- **"The AI reasons. The system measures."** Enforced in code and on screen, so an LLM's fluency cannot leak into the numbers.
- **Evidence has a grade.** Every conclusion carries a strength from an explicit nine-check rubric (control, sample size, randomisation, judge independence, human agreement, multiplicity, replication, competing hypotheses).
- **Where it goes (vision, not built).** Every investigation leaves knowledge behind: failure modes, causes, fixes that worked or failed. Later Diablo notices regressions by itself and applies the same loop to its own research strategy, with every change explicit, testable, reversible and auditable.
