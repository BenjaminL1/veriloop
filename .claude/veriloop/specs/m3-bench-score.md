# Spec: M3 §6 — `scripts/bench-score.mjs` (the SCORER only; the gold RUN is owner-gated)

> BINDING. Extracted from `docs/plans/m3-plan.md` §6 (authority — read it). Slice 6 of M3.
> SCOPE FENCE: build the deterministic SCORER + its fixture-based selftest ONLY. The actual
> held-out gold benchmark RUN (scoring the frozen Torevan gold, publishing the ≥12/14 result,
> the methodology doc's real numbers) is OWNER-GATED and OUT OF SCOPE for this slice — the gold
> has known defects pending an owner audit (is_guest missing, rule 13 unfalsifiable, rules
> 11/14 bundled), so a trusted run before that audit is meaningless. Build the tool; the owner
> runs it.

## BASE BRANCH (binding, step 0)
Stack on the latest M3 branch (feat/m3-exec-contract if §3 landed, else feat/m3-mine) — the
scorer consumes `mined.json`, whose shape is produced by `mine.mjs`. Verify the base has
`grep -q "MINE_QUERIES" scripts/mine.mjs` before editing.

## What
A new deterministic compiler-side script `scripts/bench-score.mjs` (sibling of mine.mjs; NOT
emitted). It scores how many gold constitution rules a mining run recovered:
`node scripts/bench-score.mjs --gold <gold-constitution.md> --mined <mined.json>` →
prints a per-rule recovered/missed table + the recovered count, and **exits 0 iff recovered ≥
80% (≥12/14 on the real gold), else exits nonzero**. Reads files as TEXT; spawns NOTHING (same
in-process covenant as scan/mine).

## Scoring contract (from §6)
- Parse the gold's numbered rules from the gold constitution markdown (the `--gold` file — at
  RUN time the owner pipes `git show 4d0e114:docs/constitution.md`; the scorer just reads the
  file it is given, it never reaches into Torevan itself).
- A gold rule is RECOVERED iff a mined candidate names the SAME invariant **with a valid
  file:line citation into the corpus**. Pick a DETERMINISTIC matcher (e.g. normalized keyword /
  signature overlap above a threshold, plus the candidate carrying ≥1 well-formed `path:line`
  citation) — no LLM, no network. Document the matcher's rule in a comment; it must be
  reproducible.
- Threshold is a parameter defaulting to 0.8 (12/14). Output: a table `rule → recovered|missed
  (matched candidate / citation)` and `recovered N/total (pct)`.

## Selftest (constitution rule 3 — executable, FIXTURE-based, NOT the real gold)
Use SYNTHETIC fixtures (a small hand-written gold md + a hand-written mined.json), never the
real frozen gold (owner-gated):
- a mined.json that recovers ≥ threshold of the fixture-gold rules → `bench-score` **exit 0**.
- a mined.json that recovers < threshold (e.g. a rule matched but with NO valid citation, and a
  rule not matched at all) → **exit nonzero**.
- a candidate that "matches" a gold rule by keywords but carries NO valid file:line citation →
  that rule counts as MISSED (citation is required, not just a text match).
Count must GROW from the branch baseline.

## Non-goals (binding — OWNER-GATED or DEFERRED)
- The actual gold RUN, the ≥12/14 trusted result, and the methodology doc's real numbers —
  OWNER-GATED (needs the gold audit first). Do NOT run against Torevan's real constitution.
- Rewriting/auditing the gold answer key — OWNER-GATED.
- The blind-corpus production mining (`mine --blind`) and §7 three-way merge — DEFERRED/gated.
- No LLM, no network, no git spawn.

## Version + acceptance
- Patch bump from the base branch version (→ 0.3.11 if stacked on §3's 0.3.10); all stamps agree.
- `npm test` green, count > the base branch baseline.
- `node scripts/bench-score.mjs --gold <fixture-gold> --mined <fixture-recovering>` → exit 0;
  `--mined <fixture-under-threshold>` → exit nonzero.
- `lint-bundle` exit 0 (bench-score.mjs is compiler-side, not emitted).
