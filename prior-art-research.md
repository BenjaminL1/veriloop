# Prior art: who else mines a constitution, builds repo-derived experts, or refines agent instructions?

**Date:** 2026-07-27 · **Method:** 25 search modalities → 328 candidates → 22 adversarially verified against primary sources (source code read where OSS, every star count re-checked via `api.github.com`) → reciprocal rank fusion over three independent rankings → premise-council.

---

## The short answer

**The tool you asked for barely exists.** The two most-starred products in this space — **GitHub Spec Kit (124,022★)** and **OpenSpec (62,730★)** — both deliberately skip the mining step. Spec Kit was asked for exactly your feature in issue #80, *"Generate a constitution.md file from existing code base"*, and **closed it as not planned**.

A handful of tools genuinely do derive prescriptive rules from source into a versioned in-repo file, but the largest has **47 stars** and most have **one**. The category is real and embryonic.

**The most useful find is not a constitution miner at all.** It's `mex` — which solves the problem that actually bit you.

---

## Ranked shortlist (reciprocal rank fusion, k=60)

Fused over three independent rankings: **adoption**, **how real the derivation is**, and **relevance to veriloop**. Fusion computed in a script, not by a model.

| # | Tool | RRF | ★ | Derives? | What it actually does |
|---|---|---|---|---|---|
| 1 | **[mex](https://github.com/mex-memory/mex)** | .04649 | 1,160 | ✅ source | **Grounds doc claims to code symbols + content hashes; detects drift.** MIT. |
| 2 | [Qodo Rule Miner / pr-agent](https://github.com/qodo-ai/pr-agent) | .04573 | 12,256 | ⚠ history | Mines recurring reviewer objections from PR history into rules |
| 3 | [GitHub Spec Kit](https://github.com/github/spec-kit) | .04397 | 124,022 | ❌ template | `/speckit.constitution` fills a placeholder template |
| 4 | [context42](https://github.com/context42/context42) | .04387 | 47 | ✅ source | Bottom-up per-directory style guides → `.cursor/rules` |
| 5 | **agent-rule-miner** | .04365 | 1 | ✅ source | Mines conventions by *frequency × deviation from defaults* |
| 6 | [CodeRabbit Learnings](https://docs.coderabbit.ai/knowledge-base/learnings) | .04363 | — | ⚠ history | Converts PR replies into persistent rules (vendor DB) |
| 7 | [Agent OS](https://buildermethods.com/agent-os/discover-standards) | .04328 | 5,130 | ⚠ elicits | Reads files → asks *why* → you ratify each rule |
| 8 | **mirrorai** | .04301 | 1 | ✅ source | Emits "## Prohibited" rules + verifies its own citations |
| 9 | Cursor Bugbot | .04263 | — | ⚠ history | Learned rules from repo history (vendor DB) |
| 10 | [Harness](https://github.com/revfactory/harness) | .04236 | 8,524 | ⚠ hybrid | Repo recon → agent-team design → drift audit |

Full 25-row table and raw data in the session scratchpad (`research/rrf.json`, `cands{1,2,3}.json`).

---

## The category splits into four camps

**Camp A — elicits, doesn't mine.** Spec Kit, OpenSpec, Agent OS.

Agent OS is the instructive one because it's the most-starred *genuine* attempt (5,130★). Reading the source: `/discover-standards` is **262 lines of Markdown prompt with zero executable analysis code**. The file-reading is real, but there's no extraction logic. In their own worked example the rule's operative clause — *"No exceptions — every endpoint uses this format"* — came **verbatim from the user's typed answer**. Code reading yields candidate *topics*; the human supplies the *rule*.

Their design makes the interview **mandatory**: *"you MUST complete this full loop before moving to the next standard"* and *"Do NOT batch all questions upfront."*

**This is independent external validation of your July reframe.** The market leader in this category converged on "the spine is elicited, not mined" and built the interview in on purpose.

**Camp B — mines review history into a vendor database.** Qodo, CodeRabbit, Greptile, Cursor Bugbot, Kodus, Semgrep Memories.

All six derive genuinely prescriptive rules. All six mine **PR conversation**, not source. And all six store the result **outside your repo**, in the vendor's database — not versioned with the code, not reviewable in a diff.

**Camp C — mines source, wrong output shape.** Kiro produces *descriptive* docs (stack, layout, structure). NATURALIZE and style-analyzer produce formatting models and are dead — source{d} folded. Daikon is rigorous but needs dynamic execution traces and emits value-relationship invariants, not governance rules.

**Camp D — the real thing, embryonic.** Found only by the agent tasked with falsifying the conclusion: `mirrorai` (1★), `agent-rule-miner` (1★), `context42` (47★), `agentseed` (60★).

**Scorecard platforms** (Cortex, OpsLevel, Backstage Tech Insights, Soundcheck, Compass) deserve their own line: *rules-as-versioned-YAML + evaluator* is a **solved, commoditized shape**. But every rule is human-authored. OpsLevel is the sharpest near-miss — it has an LLM reading the repo (for descriptions) **and** a prescriptive rule engine (Repo Grep checks), and the vendor deliberately did not connect them.

---

## Your disciplines were independently reinvented

Three tools arrived at veriloop's rules without knowing about it:

- **agent-rule-miner**, Red Line 1: *"Never invent rules without evidence. Every rule must trace back to a pattern observed in ≥2 files."* → witness-or-drop.
- **agent-rule-miner**, Red Line 6: *"Never state language/framework defaults as rules… Only codify deviations."* → the signal filter you lack.
- **mirrorai**: *"check that every file path cited anywhere exists on disk. Fix or drop any citation that doesn't."* → citation verification.
- **Agent OS** pattern filter: keep only what is *"Unusual / Opinionated / Tribal / Consistent."*

That last one mechanically explains your own finding that code-mining tops out at ~5 lint-shaped rules: generic patterns fail the *opinionated/tribal* test, so they were never legitimate candidates.

---

## The headline find: mex, and why your citations rotted

**[mex](https://github.com/mex-memory/mex)** — 1,160★, MIT, tree-sitter over TS/TSX/JS/JSX/Python/Rust.

It anchors a documentation claim to a **code symbol plus a content fingerprint**:

```yaml
grounds_to:
  - node: "function:a3f8...c21"
    fingerprint: "mh:64:9f2a..."
```

`mex check` validates groundings **deterministically, without spending AI tokens**, and emits:

- `GROUNDING_DRIFT` — the cited symbol still exists but its body changed
- `GROUNDING_GONE` — the symbol is gone
- auto-rebinding for confident renames/moves

**The diagnosis is right — but the council overturned the prescription, and I verified them.**

I had reported the citations as *dead*. They are **displaced**. Re-running the census against birth commit `6830618` and searching HEAD for the birth text:

```
exact-alive 3 | recoverable by unique text match 10 | truly lost 1   (of 14)
```

`detectors.mjs:519` → `:627`, byte-identical. `lint-bundle.mjs:88` → `:94`. `generate.mjs:237` → `:247`. Only `selftest.mjs:5` was genuinely reworded. And `generate.mjs:261` cited the bare line `repoName,` — 34 matches at HEAD — which was never a citation to begin with.

**So tree-sitter's marginal value on this corpus is zero.** Symbol resolution recovers 13/14. `readFileSync` + `indexOf` recovers 13/14. Same number.

**And mex is not "a dependency."** `npm i mex-agent` pulls **118 transitive packages** — including `react@19` + `ink@7`, `posthog-node` (a network-calling telemetry SDK), and `cross-spawn` + `simple-git` (**two subprocess spawners**) — into a deliberately dependency-free compiler whose rule 7 governs emitted-artifact portability. It also requires `node >=22.5`; veriloop declares `>=18`.

**Worse, the alarm would fire backwards.** `detectors.mjs:519` moved because the file grew above it — and the cited function gained guards. The sanitizer got *stronger*. A `GROUNDING_DRIFT` event there reports a repo becoming safer, as a false positive, into a hand-owned file only the owner can clear.

**Corrected fix — content anchors, in-repo, zero deps.** Carry the anchor *text* alongside the coordinates (a normalized 3-line window hash); relocation is a string search. ~40 lines as section 9 of `lint-bundle.mjs`, beside the ownership referee that already parses this file. Emit `RELOCATED` (auto-rebind, warn) vs `LOST` (fail) — one alarm per real event, not one per insertion.

**And the deeper point, which outranks all of the above.** The constitution rots because it is the one artifact exempt from regeneration — a stored citation decays, a *re-derived* one cannot. So the anchor bug is real and minor; the real gap is that ~8 of 10 rules do not compile to a falsifiable check, which is the only reason they need static anchors at all. A rule that can't fail a check isn't a rule.

---

## Where veriloop actually sits

Nobody found combines all four of:

| | derives from source | rules in-repo & versioned | rules carry code citations | enforced on real exit codes |
|---|---|---|---|---|
| Agent OS | partly | ✅ | ❌ | ❌ **none at all** |
| Camp B (Qodo/CodeRabbit/…) | history only | ❌ vendor DB | ❌ | partly |
| Scorecards (Cortex/OpsLevel) | ❌ human-authored | ✅ | ❌ | ✅ |
| Camp D (mirrorai/context42) | ✅ | ✅ | partly | ❌ |
| **veriloop** | partly | ✅ | ✅ | ✅ |

Agent OS authors standards and **never checks compliance with anything** — no gate, no exit code, no drift detection. That half of the product is simply missing from the market leader.

---

## Positioning risk, stated plainly

The market does not currently reward derivation. Hand-curated persona catalogues with **zero repo awareness** dominate adoption: one roster has **137,004★**, `wshobson/agents` 38,281★, VoltAgent 23,760★.

And on the persona pillar specifically, **Harness (8,524★)** already ships repo recon → agent-team design → drift audit. Its limits are real — the role set bottoms out in six fixed architecture patterns, generated agents carry no citations, there's no hand-owned/machine-owned split, and no exit-code gate — but it is the closest structural competitor and it is 1,600× more adopted than the nearest true miner.

Worth copying verbatim: Harness discloses its own benchmark as *"+60% avg quality (49.5 → 79.3), 15/15 win-rate, −32% variance (n=15, author-measured A/B, third-party replications pending)"* and mandates that disclosure at every citation. That is the honesty standard veriloop's own benchmark should adopt.

---

## The counter-example worth keeping

`mylee04/claude-code-subagents` (35★, abandoned) promises almost your exact sentence — *"dynamically generate a personalized and project-specific AI development team based on your unique tech stack."* The verifier found its "tech stack detection" regexes run against **the agent files' own YAML frontmatter**, not the user's `package.json`. A shipped "project-specific" persona in that repo is full of confident domain detail and cites nothing.

That is the failure mode your evidence rule exists to prevent: **you cannot distinguish a derived persona from a hallucinated one by reading it.** Only the citation tells you.

---

## The single best lesson, from a 14,573★ project that got it right and then threw it away

**Skill_Seekers** (14,573★ — verified twice; two separate attempts to discredit the number failed) does *real* deterministic extraction: a 2,512-line code analyzer, a 2,000-line pattern recognizer with GoF detection at explicit confidence thresholds (critical 0.80 / high 0.70 / medium 0.60 / low 0.50). Its internal `PatternInstance` record carries `location`, `line_number`, and `evidence: list[str]` — genuine provenance — and that survives to `references/patterns/all_patterns.json`.

**And then the final formatting step destroys it.** `_format_patterns_section` aggregates everything down to `- **Singleton**: 12 instances`. File, line and evidence are dropped. The agent reading the artifact gets a **census, not a citation**.

That is the most transferable finding of the night: a well-engineered project with real extraction still shipped an uncited artifact, because summarizing felt like the natural last move. **Citation survival to the final artifact has to be a testable invariant, not a convention** — assert it in the gate, because this is demonstrably the step everyone loses.

(Its "AST" claim is also ~1/13 true — real `ast.parse()` for Python only; JS/TS/Go/Rust/Java/C++/etc. are regex, which the repo's own docstring admits. Tree-sitter remains genuinely unclaimed in this space.)

---

## On yesterday's 10/10 experiment: the literature says it isn't a result

**SolidiFI** is the canonical inject-faults-and-measure-detection evaluation of static analysers, and the verifier's verdict on veriloop's experiment was blunt and correct:

> *"veriloop's 10/10 at n=5 per rule is not a result, it is a smoke test, and it is specifically the failure mode this paper exists to debunk."*

The disqualifying gap: **there is no false-positive number.** SolidiFI's entire punchline is that tools which look excellent on detection rate are ruined by their false-positive rate, and my experiment measured only the detection arm. I noted "zero false-positive BLOCKERs across 10 runs" — that is an observation on 10 clean runs, not a measured FP rate against a corpus of *non*-violating diffs.

**Concrete methodology target**, from SolidiFI + `SWE-PRBench`: adopt the **CONFIRMED / PLAUSIBLE / FABRICATED** taxonomy (MIT-licensed, source-readable) with its `plausible_penalty = max(0, ratio − 0.7)`, inject faults across a taxonomy rather than one exemplar per rule, and report precision alongside recall. That is what turns the 10/10 into a publishable number instead of a smoke test.

---

## Other directly stealable mechanisms (all MIT, all verified in source)

- **ctxlint** — `findRenamesBatch` in `src/utils/git.ts` uses git rename detection to *mechanically repair* a rotted citation, and can cite the commit hash that justified the repair. Directly on your 10-of-13 wound.
- **DevReplay** — a **popularity gate**: compile each candidate rule's condition and consequent to regexes, scan every file at HEAD, compute `|files matching consequent| / |files matching (condition ∪ consequent)|`, and drop anything ≤ 0.1. "Keep the rule only if the codebase actually follows it." Cheap, deterministic, and exactly the signal filter veriloop lacks.
- **baz-scm/awesome-reviewers** — the evidence-record schema `{discussion_id, pr_number, pr_file, commented_code, comment_author, comment_body, created_at}` is the best-validated shape for justifying a mined rule.
- **Qodo's wedge, inverted** — they mine accepted-suggestion history, so they *physically cannot* emit a rule for a repo that has never run their bot. veriloop mines source at t=0. That is a real, sayable differentiator. Be honest about the flip side: every Qodo rule survived a human actually implementing the fix, so theirs carry stronger evidence of mattering.
- **gskill** (5.9k★) as a cautionary contrast: its regression gate is `if "passed" in test_output.lower()` — a substring match whose failure arm can never fire. Your exit-code gate is not a small differentiator.

---

## What I'd do

1. **Content anchors, not mex.** ~40 lines in `lint-bundle.mjs`: carry the anchor text, relocate by unique string match, `RELOCATED` warns and auto-rebinds, `LOST` fails. Verified recovery 13/14 at **zero dependencies**. Then fix the 10 displaced anchors and delete `generate.mjs:261`, which never pointed at anything. **Do not adopt mex** — 118 transitive packages including telemetry and two subprocess spawners is a rule-7 problem aimed at itself, and it buys nothing over string matching on this corpus.
2. **Adopt the deviation filter.** agent-rule-miner's *"only codify deviations from defaults"* and Agent OS's *"unusual / opinionated / tribal / consistent"* are cheap, textual, and directly explain your ~5-rule ceiling.
3. **Stop treating shallow mining as a gap.** Two independent tools reached your reframe. The interview is the organ.
4. **Front-load the differentiator.** "We generate 2–4 bespoke personas" reads as *worse* than "here are 230 free ones" unless citations + gate lead the pitch.
5. **The real gap is compilation, not anchoring.** Every rule promoted into a compiled `MINE_QUERIES` check is a rule that regenerates its own citation and needs no anchor at all. That is where the saved effort goes.

---

## Council verdict: my recommendation was overturned

I recommended adopting mex's grounding model. **The council rejected it and I verified them.** Recorded plainly rather than laundered:

- **My "10 of 13 dead" framing was wrong.** They are *displaced*, not dead: 3 exact-alive, 10 recoverable by unique text match, 1 truly lost. I also under-counted survivors — `render.mjs:11` and `lint-bundle.mjs:179-180` are intact, not just `verify.mjs:54`.
- **Tree-sitter buys nothing here.** 13/14 either way.
- **mex would violate rule 7 aimed at itself** — 118 transitive packages, telemetry SDK, two subprocess spawners, `node>=22.5` against veriloop's `>=18`.
- **The fix is ~40 lines and zero dependencies.**
- **And the anchor bug is the third-most-important layer.** The gate cannot feel the constitution at all — deleting rule 8 entirely still leaves `npm test` at 391 ok and `lint-bundle` at 23 ok. Precision-anchoring prose that only an LLM skims, inside a document no parser reads, is optimizing the wrong thing while ~8 of 10 rules remain uncompilable.

**Position that survives the council:** the moat is not the anchor — it is that rules live in the repo, so their citations can be *re-derived* rather than *maintained*. Camp B structurally cannot do that: their rules live outside the repo, so there is nothing to re-derive against. Adopting a vendor's grounding CLI would trade the one property nobody else has for a feature two of them already ship.
