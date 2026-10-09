# Stage pitch (3 minutes)

Spoken text is in plain paragraphs; stage directions are in *italics*. About 420 words, which is roughly 2 minutes 50 seconds at a calm pace.

Before going on stage: open https://diablo.pnoia.dev in a fresh browser window and click **Enter demo workspace**. Keep that tab ready on **Home**. Have a second tab open at `/investigations/long-context-degradation?tab=overview` as a fallback.

## 0:00 Hook (20 s)

Last week your AI assistant got worse. Your team shipped two changes: a new system prompt, and a new temperature. Which one broke it?

Every company that ships AI asks this question, from a telecom running a support bot to a frontier lab comparing model versions. Today almost nobody can answer it with proof.

## 0:20 Problem (30 s)

Dashboards tell you *that* a score moved. They do not tell you *why*, and they do not tell you whether the move is real or noise. So teams guess. They revert the wrong change, or ship a real regression because it "looked like noise".

**Diablo AI lets companies understand what is actually happening inside their AI systems.**

## 0:50 Live demo (80 s)

*Click into the composer on Home.* You ask a question in plain language: "Why did accuracy drop on long documents?"

*Open **Long-context degradation** from Recent investigations. The Overview tab opens.* Diablo turned that question into competing hypotheses. The obvious one: "accuracy falls past 128k tokens". The competing one: "the position of the answer in the document matters more".

*Point at the verdicts.* The obvious hypothesis is **rejected**: minus 1.9 points, and the confidence interval crosses zero. The competing one is **supported**: minus 10 points, interval minus 14 to minus 6. A team that capped context length would have fixed nothing.

*Click the **Graph** tab.* Question, hypotheses, experiments, evidence, conclusion: the whole chain of reasoning.

*Click experiment **E2**; the panel opens.* The design, the config diff, the exact test, and nine validity checks. Is there a control? Was the sample big enough? Is the judge independent of the model it grades? Was the result replicated?

*Click the **Evidence** tab.* Every number traces down to the raw model output.

## 2:10 Proof (25 s)

The rule: **the AI reasons, the system measures.** The model proposes hypotheses and experiments. It can never write a number. Every interval and p-value comes from a statistics engine checked against SciPy: 260 unit tests and 48 end-to-end tests, all public in the repo.

What is real today: the full workflow and the statistics. What is next: plugging in the reasoning model and a connector to your own AI system.

## 2:35 Why now and ask (25 s)

Every company is now changing its AI every week, and nobody is measuring why it changes. We estimate one investigation costs about 34 cents of model time.

We are looking for design partners: one team that ships AI and has a regression it cannot explain. Give us the question; we will give you the answer, with the evidence.

Diablo. Understand your AI.

---

## The 8 hardest jury questions

**1. "Is the AI real, or is this a mock-up?"**
The statistics, the validity rubric and the whole workflow are real code, tested and live. The reasoning agent in this demo is a rule-based stand-in covering 7 topics, and the app says "Demo data" on screen. A Python engine with a real model provider is in progress on a branch. We built the measurement half first on purpose: it is the part an LLM must never be trusted to do.

**2. "Why not just use an eval platform or an observability tool?"**
Use them; Diablo sits on top. They tell you a metric moved and show you traces. Diablo answers which change caused it: one controlled experiment per hypothesis, a paired test on the same prompts, a confidence interval, and a grade for how much to trust the result.

**3. "LLMs hallucinate. Why trust an AI to investigate AI?"**
Because it never touches the numbers. The model proposes; the system runs, counts and computes. If a judge model is used, the rubric fails it when it comes from the same family as the target and requires agreement with human labels.

**4. "What do I need to give you?"**
API access to your AI system, the config of each version, about 30 or more prompts per arm (from logs or an existing eval set), and a scorer: a rule, or a judge we check against human labels. No training data and no fine-tuning.

**5. "What does it cost to run?"**
An estimate, not a measured figure: about $0.34 of reasoning per investigation on GLM-5.3, or $0.04 on the flash model, plus about $0.06 to judge 320 outputs. Your own model calls come on top. The arithmetic is in `docs/SUBMISSION.md`.

**6. "Who are your customers?"**
None yet; we are pre-launch. The target is every company that integrates AI, from telecoms such as Azercell to labs such as Anthropic and OpenAI. These are segments, not customers. The next step is design partners.

**7. "Isn't 80 prompts too few?"**
Sometimes. That is exactly what Diablo reports. In our worked example, the prompt change is clearly harmful (interval −26.3 to −3.8 points). The temperature change is "no clear effect", not "harmless", because its interval still allows a drop of up to 8.8 points. Sample-size planning is next on the roadmap.

**8. "What stops someone from copying this?"**
The workflow is easy to copy; the accumulated knowledge is not. Every investigation is meant to leave behind failure modes, causes, and fixes that worked or failed for that customer's systems. That memory is on the roadmap, not built yet. The other defence is rigor: a rubric and statistics a team can audit, rather than a chatbot's opinion.
