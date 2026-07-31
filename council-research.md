# LLM councils: what the literature actually shows

**Date:** 2026-07-28 · **Method:** 5 parallel literature agents (debate-vs-single, voting-vs-debate,
judge-panels, agents-rounds-topology, failure-modes), 79 findings, 52 min, 623k tokens, arXiv +
OpenAlex + Semantic Scholar APIs. **All citation counts below re-verified by me** via the Semantic
Scholar batch endpoint; the agents under-reported several by 10× (Cemri et al. reported as 15, actual
**477**). Three load-bearing 2026 preprints verified to exist by arXiv ID with matching abstracts.

---

## 1. Are councils effective? Only against a weak baseline.

**Against naive single-agent prompting: yes.** MAD beats direct-prompt single-agent in 34/45
conditions.

**Against a compute-matched baseline: no.** Zhang et al., *"Stop Overvaluing Multi-Agent Debate"*
([2502.08788](https://arxiv.org/abs/2502.08788), 33 cites) is the largest controlled re-evaluation —
5 frameworks × 9 benchmarks × 4 models, rounds adjusted so every method uses ~6 LLM calls. **No
method exceeds a 20% win rate against plain Chain-of-Thought.**

| framework | win / tie / lose vs CoT |
|---|---|
| Society-of-Minds | 13.9 / 44.4 / 41.7 |
| ChatEval | 11.1 / 61.1 / 27.8 |
| AgentVerse | 13.9 / 38.9 / 47.2 |
| Exchange-of-Thoughts | 5.6 / 36.1 / 58.3 |
| **Multi-Persona** | **0 / 22.2 / 77.8** |

**On programming specifically** (HumanEval + MBPP × 4 models = 8 configs): Multi-Persona, EoT and
ChatEval won **0 of 8**; SoM and AgentVerse won 1 of 8. Against self-consistency at matched tokens
MAD is worse still — *"in most cases when SC can be applied, SC achieves the highest performance,
defeating CoT, not to mention MAD methods."*

**Why the canonical positive result doesn't settle it.** Du et al.
([2305.14325](https://arxiv.org/abs/2305.14325), **1,993 cites**, ICML 2024) runs 3 agents × 2 rounds
= 6 calls against a majority-vote baseline of 3 calls — half the budget — and never runs
self-consistency at 6 samples. On MMLU and Biographies the majority baseline is omitted entirely.
Model is GPT-3.5-class.

Wang et al. ([2402.18272](https://arxiv.org/abs/2402.18272), 200 cites, ACL 2024): a single agent
with a strong prompt matches the best discussion method, and multi-agent wins **only when there is no
demonstration in the prompt** — the gain substitutes for prompt quality rather than adding reasoning.

---

## 2. Style: voting beats deliberation

Kaesberg et al., *"Voting or Consensus?"* ([2502.19130](https://arxiv.org/abs/2502.19130), 63 cites,
Findings of ACL 2025) is the only study that varies **only** the decision protocol:

- **Voting protocols: +13.2% on reasoning tasks.** Consensus protocols: +2.8% on knowledge tasks.
- **More agents improves performance. More discussion rounds before voting reduces it.**
- Their best protocols — All-Agents Drafting (+3.3%) and Collective Improvement (+7.4%) — work by
  *increasing answer diversity*, not by adding deliberation.

The rounds finding replicates everywhere. L-MAD ([2607.09099](https://arxiv.org/abs/2607.09099)):
*"extending discussion rounds induces a detrimental over-deliberation drift where agents reinforce
each other's mistakes."* Zhang et al.: rounds 2→4 gives "stagnation or even a decline."

**Debate's strongest positive result requires a structural asymmetry veriloop doesn't have.** Khan et
al. ([2402.06782](https://arxiv.org/abs/2402.06782), 288 cites, ICML 2024) gets 76% vs 48% for LLM
judges — but the judge *cannot see the source passage* and the two debaters can, with opposing
assigned answers. Absent that information asymmetry, the result doesn't transfer.

**Aggregation rule:** don't use plurality voting on final answers. The failure literature (ARMOR-MAD)
attributes a 32.3pp oracle gap to it; a synthesis step reading the whole trajectory dominates
last-round majority vote.

---

## 3. Agent count: an optimum, not a slope

- **Sampling + voting scales monotonically** — Li et al., *"More Agents Is All You Need"*
  ([2402.05120](https://arxiv.org/abs/2402.05120), **188 cites**, TMLR 2024), tested N=1→40.
  GSM8K/Llama2-13B: **sampling+voting 0.59 vs LLM-Debate 0.38 vs CoT 0.39.** HumanEval/GPT-3.5
  0.67→0.73. The curve is steep early, flat late.
- **But it can invert.** Chen, Zaharia, Zou et al. ([2403.02419](https://arxiv.org/abs/2403.02419),
  NeurIPS 2024): Vote and Filter-Vote performance can first increase **then decrease** with more LM
  calls, because more calls raise accuracy on easy queries and *lower* it on hard ones. They give an
  analytical model that predicts the optimal count from a small sample — **council size is
  measurable, not assumed.**
- **The pro-scaling counterweight** — MacNet ([2406.07155](https://arxiv.org/abs/2406.07155), 245
  cites, ICLR 2025) scales past 1,000 agents with logistic growth, but it varies *topology*; the flat
  3→9 result held topology fixed.

---

## 4. The ceiling that matters most here: correlated errors

Two 2026 results bound the whole design space, and the first one is veriloop's architecture measured
directly.

**Representational Collapse in Multi-Agent LLM Committees**
([2604.03809](https://arxiv.org/abs/2604.03809), Apr 2026) — *"Multi-agent LLM committees replicate
the same model under different role prompts and aggregate outputs by majority vote, implicitly
assuming that agents contribute complementary evidence."* Measured across 100 GSM8K questions with
three Qwen2.5-14B agents: **mean pairwise cosine similarity 0.888, effective rank 2.17 of 3.0.**

**Nine Judges, Two Effective Votes** ([2605.29800](https://arxiv.org/abs/2605.29800), May 2026) — 9
frontier LLMs from **7 different model families** supply only ~2 independent votes of information
(Kish n_eff ≈ 2); ~75% of nominal independence is lost to shared errors. Panel accuracy falls 8–22pp
short of the independent-voting ideal, and **"the best single judge matches or outperforms the full
panel across all conditions."** Established aggregation methods close at most 11% of the gap *even
with oracle access to correct answers*.

**What still works:** model-family heterogeneity, the one lever with a positive controlled result.
Zhang et al.'s fix — random per-call draw from a heterogeneous model pool — gives Heter-SoM +6.4%,
Heter-EoT +8.2%, Heter-ChatEval +4.0%, Heter-AgentVerse +2.7%. Verga et al.
([2404.18796](https://arxiv.org/abs/2404.18796), **277 cites**): a panel of *smaller* models from
disjoint families beats a single GPT-4 judge, with less intra-model bias, at **1/7th the cost**.

But note the ordering: cross-model heterogeneity is worth single-digit percent, and even 7 distinct
families collapse to n_eff ≈ 2.

---

## 5. What this means for veriloop

1. **The replay experiment the direction council ranked #1 is the right call, and the literature
   predicts the winner.** Arm C (repeated sampling of one lens + vote) is the arm nobody has run and
   the one with the strongest evidence. Li et al. is the direct precedent.
2. **Rounds are already right.** `/advise` runs one cross-exam round with a hard stop at two. Every
   study that varies rounds says fewer is better. Don't add more.
3. **Aggregation is the untried lever with literature support.** `verdictFrom` concatenates. The
   evidence says synthesis-over-trajectory > plurality vote > concatenation, and the council's own
   dedup/corroboration proposal lands exactly there.
4. **Cross-model is worth more than persona diversity, and less than hoped.** Single-digit gains,
   bounded by n_eff ≈ 2. Worth installing `codex` to get *any* observation; not worth a redesign.
5. **The most on-point number in the whole corpus is 0/8** — multi-persona's win rate against
   compute-matched CoT on programming benchmarks.

---

## Corrections to claims made in the direction council

- The figure **"0.73 vs 0.57"** attributed to Li et al. TMLR is **garbled**. The actual comparison is
  GSM8K/Llama2-13B: sampling+voting **0.59** vs LLM-Debate **0.38**; the 0.73 is HumanEval/GPT-3.5 at
  N=40. The *direction* of the claim (sampling+voting beats multi-persona debate) is well supported;
  those specific numbers were not.

## Confidence

Strong-empirical and citation-verified: Zhang (33), Kaesberg (63), Du (1,993), Khan (288), Wang
(200), Smit (108), Li (188), Verga (277), Cemri (477), Wang-fair-evaluators (1,134).

Weaker: the 2026 preprints (0 cites, single-study, not peer-reviewed). I verified 2605.29800,
2604.03809 and 2607.09099 exist with matching abstracts, but they carry single-study weight — they
are the newest and most on-point evidence, and also the least corroborated.
