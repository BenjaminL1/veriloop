# veriloop constitution — invariants the dev-loop checks every plan against

These are non-negotiables. The `/dev-loop` gate checks the **plan** against this list _before_
any code is written, and the expert lenses check the **diff** against it. A plan or diff that
violates one is a **BLOCKER**. Keep this list short and true.

> Mined 2026-07-13 (self-install) from the repo's own written principles
> (`skills/veriloop/SKILL.md` non-negotiables + guardrails) and the code that enforces
> them — every rule cites the enforcing line. Hand-owned: three-way-merged on re-run;
> owner edits win.

## Build & correctness

1. **The gate runs on real exit codes.** `npm test` (the selftest,
   `scripts/selftest.mjs`) must pass; a red check is a BLOCKER, never waved through on
   "looks right". _(owner: `code-review`)_
2. **Scripts own facts; the LLM owns judgment.** Paths, commands, numbers, and
   `file:line` citations come from the deterministic scripts under `scripts/`; LLM
   phases decide personas/invariants/roster only, and every mined rule must cite real
   code (`skills/veriloop/SKILL.md` "Non-negotiable principles"). _(owner: `code-review`)_
3. **Every compiler bug fix ships with a selftest assertion, and a fixture must never
   supply the evidence under test** (the v0.1.2 lesson: a pre-seeded `.prettierignore`
   masked a broken predicate — see `docs/plans/fix-8-9-plan.md` implementation notes).
   _(owner: `drift`)_

## Trust boundaries & safety

4. **Nothing from `fixtures/hostile-ci/` is ever executed** — scan-only, forever
   (`scripts/selftest.mjs:5,60`). _(owner: `security`)_
5. **CI text is untrusted input.** A command containing command substitution,
   backticks, or env expansion is never adopted (`scripts/lib/detectors.mjs:519`);
   joined/continuation artifacts must stay clean (hostile-ci selftest block).
   _(owner: `security`)_
6. **Safety tiers are law.** `safety=never` and `mutates` commands are never
   auto-run; `ask`-tier runs only with explicit owner inclusion
   (`scripts/verify.mjs:54-55`). _(owner: `security`)_
7. **Emitted artifacts are portable and secret-free.** No absolute paths
   (`scripts/lint-bundle.mjs:88`), no secrets, no harness-forbidden APIs in emitted
   workflows (`lint-bundle.mjs:118`). Never stage `.env*`. _(owner: `security`)_

## Ownership & parity

8. **The ownership asymmetry is sacred.** Machine-owned files regenerate; hand-owned
   files (`*.overrides.md`, this constitution) are never clobbered; anything
   overwritten is backed up first (`scripts/generate.mjs:249,287,261,237`). Splice
   markers (`scripts/lib/render.mjs:11`) bound every machine-owned block — owner
   lines outside them are preserved byte-for-byte. _(owner: `drift`)_
9. **Emitted config has one source of truth.** The workflow's wired gate must equal
   the manifest's `gate_commands` (`scripts/lint-bundle.mjs:179-180`); command and
   constitution text derive from the generated config, never re-hardcoded (M1 bug #2).
   _(owner: `drift`)_

## Landing (owner-reserved)

10. **Branch + preview only.** Work lands on a branch; never merge or publish without
    explicit owner sign-off. Conventional commits, no AI co-author trailer.
    _(owner: `code-review`)_

---

### Rule ownership

- **Baseline Reviewer** (`code-review`) — rules 1, 2, 10.
- **Supply-Chain & Input-Safety Reviewer** (`security`) — rules 4, 5, 6, 7.
- **Drift Sentinel** (`drift`) — rules 3, 8, 9.

No orphan rules, no jobless experts.
