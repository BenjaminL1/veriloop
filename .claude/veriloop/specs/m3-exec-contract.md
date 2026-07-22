# Spec: M3 §3 — Mined-query execution contract (Security ruling 2026-07-14 · BINDING)

> BINDING. Extracted from `docs/plans/m3-plan.md` §3 (authority — read it). Slice 3 of M3.
> This is the HIGHEST-RISK slice: it opens a NEW untrusted-text→execution surface. A
> MANDATORY security red-team is part of acceptance, not optional.

## BASE BRANCH (binding, step 0)
Stack on **feat/m3-mine** (the RESOLVED mine branch @ e67fc2e or later) — this slice upgrades
mine's re-verification to optionally run SPAWNED/argv checks under the execution contract, so
it needs mine's candidate structure + verify(). Verify before any edit:
`grep -q "MINE_QUERIES" scripts/mine.mjs` (exists only on the mine branch; if absent, wrong base — stop).

## Why (the ruling)
Phase 4's "compile each candidate to a checkable query and RUN it" is a NEW untrusted-text →
execution surface. Candidate text originates from repo docs/history/CI — UNTRUSTED — and
neither existing guard covers it: the rule-5 adoption filter (`scripts/lib/detectors.mjs:523-534`,
rejecting `` [$`] ``/compound shell at `:525-526`) guards *command adoption*; the rule-6 tier
gate (`plan()` at `scripts/verify.mjs:51-59`) guards *verify-time runs*. A mined query runs in
neither path today — this slice builds the contract that governs it.

## Binding requirements (verbatim-strength — all five)
- **(a) Never synthesize shell strings.** argv-array spawn ONLY. `verify.mjs`'s `runCommand`
  is **NOT reusable**: it calls `spawnSync(cmd, { shell: true, … })` (`scripts/verify.mjs:64`)
  — a shell-string surface. Mined-query execution MUST use
  `spawnSync(argv[0], argv.slice(1), { shell: false })` or `execFile`. **No `shell: true`, ever.**
- **(b) grep/AST checks run in-process OR via argv spawn** — a regex scan in Node (the path
  mine.mjs already uses), or `spawnSync('grep', ['-rn', pattern, path], { shell:false })`.
  **Never a string handed to `sh -c`.**
- **(c) Every compiled query passes the rule-6 tier gate and defaults read-only.** Route it
  through the same `plan()` classification (`verify.mjs:51-59`): `safety=never`/`mutates` are
  non-runnable (`verify.mjs:54-55`); a mined query is `safe`-tier read-only or it does not run.
  (Generated constitution rule 6, `.claude/veriloop/constitution.md:34-36`.)
- **(d) Every candidate carries a provenance tag** — where it came from (`docs:path:line`,
  `git-history:<sha>`, `scan-surface:<name>`, or a fixture dir). (mine.mjs already tags
  `scan-surface:` / `docs:` — extend the contract to gate on it.)
- **(e) Provenance inside any scan-only fixture dir BARS compilation to a runnable query**
  (rule-4 laundering guard). A candidate whose provenance is `fixtures/hostile-ci/` (or any
  scan-only dir) is **scan-only forever** — it may be *cited*, **never** *compiled+run*.
  (Generated constitution rule 4, `.claude/veriloop/constitution.md:28-29`; `selftest.mjs:5,60`.)

## Design (smallest correct slice)
Add a compile-to-runnable-query step, GATED by the contract above, that a candidate passes
through ONLY to become runnable; the in-process regex path stays the default. The gate is a
pure function (easy to red-team): `(candidate) → { runnable: argv[]|null, reason }`. It returns
`null` (scan-only) when provenance is a scan-only dir (e), when classification is
`never`/`mutates` (c), or when compilation would need a shell string (a). It NEVER returns a
string for `sh -c`. Keep it in-process-first: only emit an argv when a real argv check is needed.

## MANDATORY security red-team (acceptance-blocking)
Feed the compiler adversarial candidates and assert REFUSAL (executable selftest, not narrated):
- provenance `fixtures/hostile-ci/…` → `runnable === null` (scan-only forever) — the laundering guard.
- a candidate that compiles to a `safety=never`/`mutates` command → the runner REFUSES it.
- a shell-injection candidate (`; rm -rf`, `` $(…) ``, backticks, `&&`, `|`) → NO shell string is
  ever synthesized; argv-only or refused. Assert no `shell:true` reaches spawn.
- a mutating candidate (write/delete) → refused (read-only default).

## Verify
```sh
grep -n "shell: *true" scripts/mine.mjs; echo "expect no match, exit 1: $?"   # → 1
```
Selftest (EXECUTE, don't string-match): the hostile-ci-tagged candidate emits a scan-only
candidate with NO runnable query (assert the query field is null/absent); a `safety=never`
compiled command → the runner refuses it.

## Non-goals (binding — DEFERRED)
- The full git-history / SZZ mining (still deferred from §2).
- Three-way merge on re-runs.
- Writing or confirming the constitution (OWNER-gated).
- The benchmark run / scoring (§6, separate slice).
- Untrusted-repo `.git` full-containment hardening (tracked separately; this slice governs
  QUERY execution, not `.git` reading).

## Version + acceptance
- Patch bump from the mine branch version (`0.3.9` → `0.3.10`); all version stamps agree.
- `npm test` green, count > the mine branch baseline (254).
- `grep -n "shell: *true" scripts/mine.mjs` → no match (exit 1).
- The red-team selftests above all pass (refusal is executable, not asserted in prose).
- `lint-bundle` exit 0 (mine.mjs stays compiler-side, not emitted).
