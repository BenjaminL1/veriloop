# Spec: M3 §4 — Referee-as-lint (machine-check the ownership constraint)

> BINDING. Extracted from `docs/plans/m3-plan.md` §4 (authority — read it). Slice 4 of M3.
> INDEPENDENT slice — branch from `main`, not from any M3 branch.

## BASE BRANCH (binding, step 0)
Branch from **main**. This slice touches `scripts/lint-bundle.mjs` only (plus a new fixture
+ selftest); it does NOT depend on `mine.mjs`/`scan.mjs` and must not modify them.

## What
Mechanize the existing `.claude/veriloop/constitution.md` invariant **"No orphan rules, no
jobless experts"** (the Rule-ownership section) as a HARD LINT in `scripts/lint-bundle.mjs`,
not prose. Two new **fail-level** checks (not warn).

## How (reuse the existing referee precedent — do not rebuild)
The precedent is already in `lint-bundle.mjs`: the jobless-expert **warn** in the roster loop
(`for (const e of m.roster ...) warn('expert ... no evidence')`) and the gate-equality
**fail** (`JSON.stringify(wired) === JSON.stringify(manifest)`). Add, reading the
constitution's inline `_(owner: \`<key>\`)_` annotations against the manifest roster keys
(`m.roster[].key`):

1. **No orphan rule** — every numbered rule (`^\d+\.` in constitution.md) has **exactly one**
   `_(owner: \`<key>\`)_` whose key is a roster expert → else `fail(...)`. A rule with zero
   owners, or an owner key absent from the roster, fails.
2. **No jobless expert** — every roster expert owns **≥2** numbered rules → else `fail(...)`.
   (This is acceptance criterion 3, roadmap:105. Do NOT delete the existing `:164` evidence
   warn; add this as a distinct rule-ownership fail.)

## GATE both fails on mined-ownership-present (binding — the critical correctness point)
The strict fails MUST fire ONLY once mining has filled ownership — NOT on a legitimate
pre-mining STARTER bundle. Key off the **absence** of the STARTER banner
(`> **veriloop STARTER**`, `render.mjs:108`) AND the absence of the literal TODO-owner
placeholder strings (`_(owner: assign — usually` and `_(owner: the \`security\` expert; if
this roster has none`, `render.mjs:114,116`). If the banner or a TODO-owner placeholder is
present → the bundle is a pre-mining starter → SKIP both strict fails (the existing warn still
applies). Only when ownership is fully mined-in (no banner, no TODO placeholders) do the two
fails run.

## Fixture (new)
`fixtures/mined-bundle/` — a COMPLETE, well-formed post-mining bundle that lints clean: a
`.claude/veriloop/` with a constitution whose every numbered rule carries a real
`_(owner: \`<key>\`)_` roster key, **≥2 rules per expert**, **no STARTER banner, no TODO
placeholders**, plus the manifest + persona files + workflow the other lint-bundle checks
require (so the bundle passes ALL checks, not just the new two). Generating a starter then
rewriting the constitution to full ownership is the intended construction. This is the §4
verify's positive input — NOT a bare `generate` on the blind corpus (that yields the starter,
whose experts are still jobless).

## Selftest (constitution rule 3 — executable, not narrated)
- `fixtures/mined-bundle` (fully owned, ≥2/expert, no banner) → lint-bundle **exit 0**.
- a copy with ONE rule's `_(owner: …)_` tag stripped → **fail** (orphan rule).
- a copy where one roster expert owns only **1** rule → **fail** (jobless expert).
- a STARTER bundle (banner present, rules 2/3 as TODO placeholders) → the two strict fails
  DO NOT fire (regression guard for the gate) — still passes/ warns as before.
Count must GROW from the branch baseline.

## MUST NOT regress (verify explicitly)
- `node scripts/lint-bundle.mjs` on **veriloop's own bundle** still exits 0 — its constitution
  is hand-owned (code-review 1/2/10, security 4/5/6/7, drift 3/8/9; all ≥2, no banner), so the
  new strict fails run and PASS. Confirm this, don't assume.
- Any existing selftest that lints a fresh STARTER bundle still passes (gate skips the fails).

## Non-goals (binding — DEFERRED / out of scope)
- Do NOT run mining, do NOT touch `mine.mjs`/`scan.mjs`/`generate.mjs` roster logic.
- Do NOT change the existing jobless-evidence warn semantics or the gate-equality fail.
- No three-way merge, no constitution writing, no owner confirmation.

## Version + acceptance
- Patch bump from main's version; all version stamps agree.
- `npm test` green, count > baseline.
- `node scripts/lint-bundle.mjs --bundle fixtures/mined-bundle` → exit 0; stripping an owner
  tag → exit 1; an expert owning 1 rule → exit 1.
- `node scripts/lint-bundle.mjs` on veriloop itself → exit 0 (no self-regression).
