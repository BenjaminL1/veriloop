# Overnight debate: should veriloop generate domain-expert personas?

**Date:** 2026-07-28 · **Method:** 21 agents, 5 phases, 43 min, 2.2M tokens — evidence deepening → 6 advocates across 3 positions → cross-examination → **4 fact-checkers auditing the debaters' own citations** → 3 judges on the corrected record.

**Positions.** **A** — generate a domain-specific persona body per repo (the original ask). **B** — one derived domain/thesis line only, no generated paragraph. **C** — build nothing; four archetypes plus the shipped cited beat is correct.

---

## Verdict: all three judges landed on C, by different routes

- **Evidence judge:** *"Do not build A… Do not build B yet."* B's stated justification (truthfulness) is discharged by deletions; what remains is a quality claim B itself disclaimed.
- **Decision judge:** *"Do the cheap thing and stop on personas — then spend the freed hours on the two structural levers that are broken."*
- **Premise judge:** *"The A/B/C choice does not matter, and the debate was a misallocation as a decision process… the debate's byproduct is worth more than its ballot."*

---

## The new evidence that decided it

Two studies, both post-dating everything cited earlier in this project, isolate **domain match** from **persona presence** with properly crossed designs. Both are worse for the feature than anything reported before.

**Hu, Rostami & Thomason — "Expert Personas Improve LLM Alignment but Damage Accuracy"** ([arXiv 2603.18507](https://arxiv.org/abs/2603.18507), Mar 2026; OpenAlex 0 / Semantic Scholar 5 cites)
6 LLMs × MT-Bench/MMLU/3 safety benchmarks; 12 personas × 3 length granularities; **fully crossed 8 personas × 8 categories**, diagonal = matched.
- **Every persona variant damages MMLU accuracy, matched included:** 68.0% and 66.3% vs **71.6% baseline**.
- *"Most expert personas fall below zero, showing that an expert persona generally damages overall performance for instruction-tuned models."*
- A **matched** expert buys essentially nothing (72.2 vs 71.8 overall) and on Mistral-7B actively hurts (71.4 vs 79.9; MT-Bench 7.16 vs 8.74).
- **Longer personas damage more.** And models *more* optimised for system-prompt steering take **larger** hits — the harm grows with model quality.

**Kim, Yang & Jung — "Persona is a Double-Edged Sword"** ([Findings IJCNLP-AACL 2025](https://aclanthology.org/2025.findings-ijcnlp.51/), 1 cite)
12 reasoning datasets × 3 models × 3 runs. Conditions: no persona / **dataset-level matched persona** / instance-aligned / hybrid.
- The dataset-level matched persona **loses on 7 of 12 datasets** on Llama-3-8B.
- Churn is enormous: on AQuA it **breaks 13.78%** of correct answers while fixing 15.75%; on Coin Flip it **breaks 18%, fixes 4%** — net −14 points.
- **The failing granularity is dataset-level — which is exactly veriloop's "one persona per repo."** Instance-aligned personas consistently beat it.
- It also replicates Kong's win and **confines it to symbolic/algorithmic puzzles** (Last Letter 19.8→92.6). On arithmetic: GPT-4 +0.84, Llama-3-8B **+0.00**.

**Mechanism** — [arXiv 2510.24677](https://arxiv.org/abs/2510.24677) (neuron ablation, 3 medical QA datasets): role prompts *"primarily affect surface-level linguistic features, with no evidence of distinct reasoning pathways."* That refutation lands **in medicine — the one domain where role injection won** in the 2026 advisory study.

---

## Corrections to what I told you

**I said mismatch is the harm condition, citing Salewski. That was wrong.** Reading Salewski et al. ([NeurIPS 2023](https://arxiv.org/abs/2305.14930), 35 cites) in full: it *has* a neutral control, and the ordering is **neutral < non-domain < domain < task expert**. A *mismatched* expert still beats a no-expertise persona there. Mismatch costs only relative to a *match* — it isn't the harmful condition.

Three more things about Salewski I passed on without checking:
- Its primary MMLU model is **Vicuna-13B at near-floor accuracy** (STEM ≈0.27→0.32 against a 0.25 random baseline).
- Its own supplementary says that for ChatGPT, *"the neutral persona performs on par with the domain expert"* — the effect largely vanishes on a stronger model.
- It **explicitly names College Computer Science** as a task where the domain-match trend does *not* hold.
- The "bird expert ≈ 2× car expert" figure is from **image caption generation**, not a judgment task.

So the one result I described as the strongest surviving support for your idea is weaker, older-model-dependent, and specifically fails on the closest thing to your domain.

---

## What got fixed (defects the debate found in my own commit)

All three verified before changing anything:

1. **The bundle was stale.** 0 of 3 committed personas carried the beat section the generator had emitted since `6d5db99` — the feature existed in code but not in the artifact any lens reads. Regenerated; hand-owned files preserved.
2. **I fixed the stance sentence and left the bullets.** The security archetype still asserted AuthZ/AuthN, client bundles, SQL/XSS injection and RLS row-scoping — surfaces veriloop doesn't have. Dimensions now name a *class* of concern; the repo's actual surfaces come from the cited beat.
3. **The beat header made a false claim.** It read *"derived from the repo, not assumed"* — but `code-review`'s evidence is the sentinel *"always included…"*, which is precisely assumed.

Committed as `e8171d5`. Gate: 251 ok, lint 21 ok.

---

## The one open fork — the judges disagree

On `Stack: **node**` in the persona header:

- **Decision judge:** replace it with the owner-confirmed thesis from `scan-notes.md` — *"compiler — deterministic Node-ESM toolchain (detect → verify → generate → lint) + an LLM playbook, headless, dependency-free by design."*
- **Premise judge:** **delete it entirely.** *"It is the generic-job-title string family carrying the most on-point negative evidence in the corpus, and deletion is free. The repo thesis belongs in the owner-ratified constitution every lens already reads — not in an identity claim."*

Both are defensible. Deletion is strictly safer under the evidence; substitution is more informative if the evidence is wrong. **Your call.**

---

## What both judges independently said to fund instead

**Cross-model council.** `crossModel: true` already ships, but only at `high` tier in REVIEW — `/advise`'s 4-member council is **same-model**. Model heterogeneity is the largest-measured council lever in the corpus, and it addresses the correlated-reviewer problem that has recurred all session. That is a real build with a real evidence base; layer ② is not.

---

## Pre-mortem (required, from the premise judge)

A year on, the persona work shipped and failed — not because the text was wrong, but because it was **unfalsifiable**. The contrast sits below the noise floor of the tool it modifies: formatting changes alone swing accuracy up to 76 points ([Sclar et al., ICLR 2024](https://arxiv.org/abs/2310.11324), 44 cites), instruction paraphrases flip model rankings ([Mizrahi et al., TACL](https://arxiv.org/abs/2401.00595), 91 cites), and baseline-vs-best-persona in the advisory study was **p = 1.0**. Every future disagreement about the persona was settled by taste, because nothing could measure it. Meanwhile the same-model council kept producing correlated opinions at 4× cost.

**What would falsify the recommendation:** an instance-level persona (per-consult, not per-repo) showing a measurable effect — Kim et al. found instance-aligned beats dataset-aligned consistently, and *that* granularity was never tested here.
