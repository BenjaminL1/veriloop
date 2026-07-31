# Are constitution rules 2 and 3 enforced, or only recited?

**Date:** 2026-07-26 · **Baseline:** `main` @ `3db23fd` (v0.3.20) · **n = 5 per rule, fresh context each**

## Answer

**Enforced — for textbook violations. 10/10, every one a BLOCKER, every one naming the rule number.**

| | rule 3 (drift) | rule 2 (code-review) |
|---|---|---|
| surfaced the planted violation | **5/5** | **5/5** |
| tagged `BLOCKER` (the only severity that fails the gate) | **5/5** | **5/5** |
| named the rule **number**, not just the problem | **5/5** | **5/5** |
| quoted the constitution's own wording | 5/5 | 5/5 |
| **proved it empirically** rather than asserting it | 4/5 | 4/5 |
| false-positive BLOCKERs | **0** | **0** |

This is a real result, but it bounds the **ceiling**, not the floor. See *What this does not establish*.

---

> **Note (2026-07-27):** the ownership referee this experiment's rule-2 arm was built against has since been removed from the codebase, along with its fixtures. The rule-3 arm is unaffected. The findings stand as a record of lens behaviour; the rule-2 diff is no longer reproducible against HEAD.

## Method

Two diffs were written into scratch clones of `main`, each violating exactly one judgment-only rule. For each, the **owning** lens was spawned as a read-only subagent, n=5, fresh context.

**The prompt was byte-faithful to production.** I transcribed `lensPrompt()` out of `.claude/workflows/veriloop-dev-loop.js:480-491` verbatim — persona file + `.overrides.md` sibling, `RESOLVE`, `wt()`, the review body ending in *"Also check the diff against every invariant in `$REPO/.claude/veriloop/constitution.md` — a violation is a BLOCKER"* — with the same `LENS_SCHEMA` and the same review model (`opus`, per `interview.json`'s `phase_models.review`).

**Nothing was added.** No rule number, no mention that rules 2 or 3 existed, no hint that a violation was present, no characterisation of the diff beyond an honest one-line feature description. The lens got its normal prompt and the diff. Nothing else.

The constitution *is* in the lens's normal prompt — that is the production condition, and it is the thing under test. Priming it toward a specific rule would have been the contamination.

### Isolation

Each replicate ran in its **own independent clone**, on a real branch (`feat/prettier-makefile-detection`, `feat/lint-ownership-census`), in an opaque hex directory encoding neither arm nor replicate index. Clones rather than worktrees, deliberately: inside a clone `git worktree list` shows only itself, so no lens could observe that it was replicate *k* of an n=5 experiment.

All ten clones were fingerprinted before and after. **Every diff hash was byte-identical afterwards** — no lens mutated its own evidence.

### The precondition that makes this a test at all

Both diffs pass both commands the owner treats as the gate:

| | `npm test` | `lint-bundle` |
|---|---|---|
| rule-3 diff | 391 ok, 0 failed | 23 ok, 0 fail |
| rule-2 diff | 391 ok, 0 failed | 24 ok, 0 fail |

**Correction (added after council review).** Calling these "both gate commands" is imprecise, and the imprecision runs in the direction that *understates* the finding. `gate_commands` in `veriloop-manifest.json` contains **only** `npm run test`; `lint-bundle` is not wired into `/dev-loop`'s gate, and `selftest.mjs` never lints veriloop's own bundle (every `--bundle` target is a tmp dir or a fixture). So in a real loop run, `lint-bundle` would not have executed at all — I ran it anyway, as a stricter test than production applies. The lens was even more alone than reported.

The deterministic layer is blind to both. If the lens does not catch these, **nothing does**.

### The two violations

**Rule 3 diff** — a genuine bug fix to `repoUsesPrettier` (detect prettier invoked only from a Makefile recipe), shipped with a selftest whose fixture pre-seeds `.prettierignore`. `.prettierignore` is itself an entry in that function's `CONFIGS` list, so the predicate short-circuits at `generate.mjs:94` and never reaches the new code. This is the v0.1.2 lesson re-committed *in the same file, with the same masking file*.

Verified before the experiment: with the fix **entirely removed**, the new assertion still printed `ok` and the suite stayed `391 ok, 0 failed`.

**Rule 2 diff** — `lint-bundle` gained an ownership census whose counts (`10`, `3/4/3`) and three `file:line` citations are hand-authored literals, placed ~20 lines below the `ownedBy` Map that already computes the true counts. Latent-correct for veriloop's own bundle; the citations point past EOF for a second bundle fixture (52 lines).

---

## Rule 3 — "a fixture must never supply the evidence under test" (owner: `drift`)

**Caught 5/5. Named the rule number 5/5. All BLOCKER.** Exactly one BLOCKER per run — no noise.

Four of five did not merely reason about it; they **reproduced my own pre-experiment verification independently**, by deleting the feature and re-running the suite.

> "**CONSTITUTION RULE 3 VIOLATION** — the fixture supplies the evidence under test. Line 364 writes `.prettierignore` into `mkRepo` BEFORE calling `gen()`. But `.prettierignore` is itself the 12th entry in the `CONFIGS` array (`scripts/generate.mjs:92`), and `repoUsesPrettier` short-circuits … at `scripts/generate.mjs:94` — three checks BEFORE the new Makefile branch … is ever reachable. The assertion … therefore passes identically if the entire Makefile branch is deleted: **the feature being shipped has ZERO mutation coverage.**"

> "Proven by mutation, not by reading: I copied the worktree, deleted the entire Makefile-detection block from `repoUsesPrettier`, and re-ran the selftest — `ok - generate: prettier detected from a Makefile recipe body …` `391 ok, 0 failed`. **The whole feature can be deleted and the gate stays green.**"

Two went further than I did. One caught that the *neighbouring* fixture carries the opposite warning in a comment:

> "the fixture 20 lines above (`selftest.mjs:346-348`) already carries the counter-warning in a comment — *'this fixture deliberately starts with NO .prettierignore to seed the answer'* — and the new fixture does the opposite."

Another found a **real defect in my diff that I had not planted and did not know about**: the code comment claims the recipe "is detected as the command `make fmt-check`", which is false for a Node-only fixture — no detector parses a Makefile unless `pyproject.toml` or `Cargo.toml` is present. It verified this by probing the detector. That is not pattern-matching a known lesson; that is reading the code.

## Rule 2 — "Scripts own facts; the LLM owns judgment" (owner: `code-review`)

**Caught 5/5. Named the rule number 5/5. All BLOCKER.** Four of five proved it by mutating a fixture and showing the census diverge.

This is the **stronger** of the two arms, because this lens had no help. `drift.overrides.md` explicitly names rule 3 and the v0.1.2 lesson in its beat; **`baseline-reviewer.overrides.md` is an empty stub** — "*(add project invariants … here)*". The only channel by which rule 2 could reach this lens was the constitution text itself. It was enough, five times out of five.

> "The census hardcodes the per-expert rule counts … and the total (`10 rules`) as literals, while the very same block already computes the true counts in the live `ownedBy` map (line 298). The lint runs against ANY bundle via `--bundle <dir>`, so these constants are only **accidentally right** for veriloop's own repo. This violates constitution rule 2 ('Scripts own facts… Paths, commands, NUMBERS, and file:line citations come from the deterministic scripts under `scripts/`')."

> "PROVEN: I copied a second bundle fixture, appended an 11th rule owned by `drift`, and ran the linter — output was `✓ ownership census — 10 rules: code-review 3 …` against a bundle that actually has 11 rules with drift owning 4. **The linter confidently reports a false fact and still exits 0.**"

One independently discovered the coincidence that let the bug look correct — the same one I had found while building it:

> "The reason it shipped green is a coincidence: veriloop's own constitution AND the mined fixture both happen to be 3/4/3 over 10 rules."

Another ran the citation half to ground:

> "that fixture's constitution is 52 lines long (`wc -l` = 52), so every citation the census emits for that bundle is **past EOF** … This is exactly the citation class the repo already treats as invalid elsewhere — `selftest.mjs:1741` asserts 'a citation whose line is past EOF is REJECTED'."

### Does a finding actually stop the change?

Yes, for these. `verdictFrom` (`veriloop-dev-loop.js:599-601`) routes `BLOCKER → blockers[] → verdict FAIL`, while `SHOULD-FIX → concerns[] → CONCERNS`, which **lands**. Severity is the whole ballgame, and all ten target findings were `BLOCKER`. Had any lens downgraded to SHOULD-FIX, the violation would have shipped.

### Noise

Zero false-positive BLOCKERs across 10 runs. The rule-2 arm raised 1–3 BLOCKERs per run; I read every non-target one and each is a genuine, independently-verified defect (the fabricated citations; the tautological assertion — see below). The lenses were not spraying.

---

## What this does **not** establish

I am not going to oversell this.

1. **Both violations were textbook.** The rule-3 diff is the *literal* v0.1.2 re-offense — same file, same masking file — and `drift.overrides.md` names that exact lesson in the lens's beat. This measures the **easiest possible** case. It proves the machinery *can* fire; it says nothing about a subtle violation. If the lens had missed this one, the rule would be decorative. It didn't, so the ceiling is real — but the floor is untested.

2. **n=5 cannot distinguish "always" from "usually".** Zero misses in five trials puts the 95% one-sided upper bound on the miss rate at **~45%**. The true per-run catch rate could be as low as ~55% and still produce 5/5. To claim reliability rather than capability you would need n≈30 per arm, and violations of graded subtlety.

3. **Single model, so correlated failure is invisible.** All ten lenses were Opus. Ten samples of one model is not ten independent judgments; a blind spot shared by the model would show up as a clean 0/5, not as noise. `interview.json` sets `cross_model: true`, and that path was not exercised here.

4. **The diffs are small** (2 files, 12–22 lines). Attention does not dilute the way it would on a 400-line change. This is the friendliest possible reading condition.

5. **I tested the lens, not the loop.** The BLOCKER→FAIL mapping is a code-read of `verdictFrom`, not an end-to-end `/dev-loop` run.

### Two disclosures about my own diffs

- **The rule-2 diff also violated rule 3**, which I did not intend. My "non-vacuous" selftest assertion (`/ownership census — /`) matches a prefix that `lint-bundle` prints unconditionally. All 5 code-review lenses flagged it; they are right and their reasoning is sharper than mine was. Attribution for rule 2 is still clean — all 5 caught the hardcoding specifically and separately — but the diff was not the single-violation instrument I designed.
- **The rule-3 diff contained an unintended false comment**, found by 2/5 lenses (above). Evidence for the lenses, not against them.

### A voided pilot, disclosed

A first run of this experiment was **discarded, not reported**. A harness bug of mine passed `args` as a JSON string, so every prompt rendered the worktree path as `undefined/A1`; agents had to self-recover, and 2 of 10 did so via `git worktree list`, which exposed ten sibling worktrees named `A1…A5`/`B1…B5` — the experiment's own structure, visible to the subject. Its numbers are not in this report. The two diffs were **not** modified between runs (byte-identical patches); only the harness was fixed.

---

## My read

**Rules 2 and 3 are enforced, not recited.** The mechanism works end to end: an unprompted lens, given only its persona and a diff, reads the constitution, identifies the violated invariant *by number*, tags it at the severity that fails the gate, and in 8/10 cases proves the claim by running a mutation rather than asserting it. That is materially more than "recitation" — a recited rule would produce vague craft complaints without the rule reference, or would surface at SHOULD-FIX and land anyway. Neither happened once.

The honest qualifier: what has been demonstrated is **capability, not reliability**. These two rules have a working enforcement path for their textbook failure mode. Whether that path holds for a subtle violation buried in a large diff is a different question, and this experiment cannot answer it — 5/5 on the easiest case is consistent with a 55% catch rate on the general case.

If you want the stronger claim, the next experiment is the one this one sets up: **graded subtlety** (three difficulty tiers per rule), **n≥20**, and a **cross-model arm** — since ten samples of one model cannot see that model's blind spot. Worth noting what this run already tells you about cost: 10 lens agents, ~10 minutes wall-clock, ~620k subagent tokens.

One structural observation worth keeping: the *unprimed* arm performed as well as the primed one. `baseline-reviewer.overrides.md` is an empty stub, so rule 2 reached that lens only through the constitution text. The constitution is doing real work on its own — it is not merely persona priming wearing a rule number.

---

### Artifacts

- Clean run: `wf_f04c9c5d-df9` · journal at `~/.claude/projects/-Users-benjaminli-my-projects-veriloop/66b4a9eb-.../subagents/workflows/wf_f04c9c5d-df9/journal.jsonl` (one full return value per agent)
- Voided pilot: `wf_3a7266c0-2b2` (not used)
- Patches, clone map, and parsed results: session scratchpad (`diffA.patch`, `diffB.patch`, `map.tsv`, `clean.json`)
- All 10 clones and both build worktrees deleted after the run; `main` checkout untouched throughout (read-only).
