# Self-assessment against the judging card

This is how a strict GPT or Claude judge would score Diablo AI. "Before" is the repository as it stood at `94a3427`: a README that described "a research environment" and no submission text. "After" is this branch. Every point rests on something a judge can open or rerun.

| Criterion | Max | Before | After | What the "after" score rests on |
|---|---|---|---|---|
| Value for the user | 25 | 13 | 20 | A specific problem: two changes ship together, and accuracy drops. A worked example with a clear outcome: revert the prompt (−15.0 pp, CI −26.3 to −3.8), keep the temperature. Named target segments, labelled as segments. |
| Prototype and use of AI | 30 | 15 | 19 | A live, working core scenario (https://diablo.pnoia.dev); a real statistics engine and rubric; an explicit "Works today / Next" table; the AI's role defined, along with what it may not do. |
| Quality testing | 20 | 11 | 18 | 260 unit tests (43 before) and 48 e2e tests, all run on 9 Oct 2026; statistics checked against SciPy references; five failure examples pinned in tests; the prototype's own failures listed; a comparison table against current approaches. A measured comparison too: a seeded planted-cause benchmark (`docs/BENCHMARK.md`, 45,000 simulated updates, six methods) in which Diablo's attribution rule, which its verdicts follow, named the right cause 97.3% of the time it named one, against 71.7% for blaming the largest drop, with 1.1% false alarms against 81.0%, at the cost of power (41.0% against 84.5% of causes named); seven failure seeds, Diablo's own misses included. The benchmark also caught a real gap: the app's verdicts ignored Holm (8.2% false alarms on 2,250 checked scenarios, worse than uncorrected tests); they now require it. Simulated: it measures the protocol, not an LLM's reasoning. |
| Feasibility | 15 | 6 | 11 | Concrete data requirements; a cost estimate with its arithmetic shown; a named next step behind an interface that already exists (`DataProvider`). |
| Originality | 10 | 6 | 8 | Investigation (why) rather than evaluation (what); "the AI reasons, the system measures" enforced in code; graded evidence. |
| **Total** | **100** | **51** | **76** | |

Why 18 on testing and not more: it was 17 before the benchmark, and the benchmark is worth +1 on a strict card, not +2. It measures the statistical protocol on simulated data only, the app's own verdicts are checked on a 2,250-scenario subset, and the two open testing gaps below (no time-to-answer comparison, sample-size planning only partly done) are untouched by it.

## Gaps that cost points, and their fixes

| Gap | Cost | Fixed here? | Fix |
|---|---|---|---|
| No submission text; the value proposition was generic ("a research environment") | Value −6, Originality −2 | **Yes** | `docs/SUBMISSION.md` opens with the one-line positioning and follows the card's order. `BRAND.description` (the site's meta description) and the README intro now say the same thing. |
| No concrete user problem or outcome | Value −4 | **Yes** | The worked example: which of two changes broke the assistant, with the decision it leads to. |
| Numbers a judge cannot verify | Testing −3, Prototype −2 | **Yes** | `src/lib/submission-claims.test.ts` pins every statistic the documents quote. |
| No failure examples | Testing −4 | **Yes** | Five rubric catches (wrong cause, untested alternative, Holm, failed replication, same-family judge) plus the prototype's own failure modes. |
| No comparison with the current approach | Testing −2 | **Yes** | A table comparing spreadsheets, eval dashboards and observability tools with Diablo. |
| The comparison and the failure examples were qualitative, not measured | Testing −1 | **Yes** | `docs/BENCHMARK.md` (`npm run bench`): planted causes in 45,000 seeded scenarios; Diablo's protocol against an overall before/after test, the largest observed drop, uncorrected paired tests, paired data analysed as unpaired, and a proper unpaired design; rates with Monte Carlo intervals, CI coverage, a sensitivity table, a check of the app's own verdicts, and seeds for every failure pattern. `src/lib/bench/benchmark.test.ts` pins every quoted number and fails if the report is stale. It is a simulation: it validates the measuring protocol, not the reasoning model. |
| No data requirements, cost or next step | Feasibility −7 | **Yes** | Section 4 of the submission; the cost is labelled as an estimate, with its arithmetic shown. |
| Mock-ups presented without being labelled | Prototype −2 if a judge finds it | **Yes** | "Works today / Next" in both the README and the submission; the in-progress branches are named and marked unmerged. |
| **The reasoning agent is rule-based, not an LLM** | Prototype −8 | No (product work) | Implement an engine-backed `DataProvider`. GLM-5.3 (or the Gemini provider on `feat/gemini-provider`) returns hypotheses and designs as JSON, validated by the existing zod schemas. Show one real investigation in the demo. |
| **Runs are simulated; nothing touches a real AI system** | Prototype −3, Feasibility −2 | No (product work) | A connector that calls an OpenAI-compatible endpoint for both arms. Run the worked example on a real open-weights model and publish that report. |
| No evidence from a real user | Value −4, Feasibility −2 | No | One design partner with one real regression question. Quote the outcome only with their written permission. |
| No time-to-answer comparison with the manual approach | Testing −3 | No | Time a manual root-cause analysis against Diablo on the same seeded regression, and report both figures. |
| Persistent knowledge, autonomous discovery and self-improvement are vision only | Originality −2 | No | Store each conclusion as a typed "finding" linked to its evidence, and show it reused in a second investigation. |
| No sample-size planning | Testing −1 | Partly | The benchmark's "Items needed" table gives the evidence (80% attribution needs n = 80 per arm for a 20 pp drop and n = 160 for 15 pp). Still to do: a power calculation in the app before a run ("you need about N prompts to detect 5 pp"). |

## The order in which to close the remaining gaps

1. **A real model in the loop** (+6 to +8 on Prototype). This is the single biggest lever, and ties are broken on the prototype score.
2. **One real run against a real model**, published as a report (+3 on Prototype, +2 on Feasibility).
3. **A timed comparison with manual analysis** (+2 on Testing; testing is the second tiebreaker).
4. **A design partner's real question** (+4 on Value).
