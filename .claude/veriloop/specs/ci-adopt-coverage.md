# Spec: CI adopt-path coverage + version-stamp assertion + map fix

> Origin: `/advise` consultation 2026-07-14. Three expert lenses (baseline-reviewer,
> security, drift) reviewed "is CI the next best move?" independently, then
> cross-examined each other. Unanimous outcome: veriloop's own `ci.yml` is deferred
> to M5; the session goes to guarding the CI **adopt path** — the flagship surface —
> which currently has zero positive test coverage. This spec is BINDING on the
> planner and implementer.

## Problem

1. **The CI adopt path is tested only for what it rejects.** Every
   `fixtures/hostile-ci/` assertion is a rejection (`scripts/selftest.mjs:63-77`).
   `verified_by_ci` appears in the selftest only as synthesized `false` input
   (`selftest.mjs:95,104`). No assertion anywhere checks `from === 'ci'` or
   `verified_by_ci === true`. All four positive paths in `reconcile()`
   (`scripts/lib/detectors.mjs:449-456`, `:458-461`, `:463-465`, `:470-476`) and the
   benign side of the YAML parser (`scripts/lib/ci.mjs:44` block scalars, `:52-57`
   continuation joining, `:73-78` unquote) are unguarded. The path *works today*
   (probed live; also see `docs/plans/m1-dogfood-report.md:66` — Torevan's e2e
   command resolved CI-verified), so this is regression insurance, not a bug fix.
   The stakes: `detectors.mjs:470-476` is the only way a CI-only command enters the
   manifest at all — a future over-tightening of `isCleanInvocation`
   (`detectors.mjs:516`) would silently drop gate checks from every emitted bundle
   with the suite still green. M4's Rust detector is planned to sit directly on this
   path (`docs/plans/roadmap-v1.md:220-222`).
2. **No assertion pins the version stamps together.** The drift class has bitten
   once (M1 bug #4, `m1-dogfood-report.md:64`: `VERILOOP_VERSION` stale at 0.1.0).
   Five stamp locations exist: `scripts/generate.mjs:24`, `package.json:3`,
   `.claude-plugin/plugin.json:3`, `.claude-plugin/marketplace.json:10,17`, and the
   first `## X.Y.Z` heading of `CHANGELOG.md`.
3. **The map is stale.** `docs/plans/roadmap-v1.md:385,403-405` still says the M1
   main event is *pending*; it clean-landed 2026-07-12 (commit `2886602`, report
   section "Main event re-drive"). And a hardcoded assertion count ("96") is stale
   across `constitution.md:14`, `interview.json:23`, `scan-notes.md:37`, and (derived)
   `veriloop-manifest.json:52,289` — the actual count is 106 and will keep moving.

## Deliverables

### 1. `fixtures/ci-adopt/` — a benign CI-adoption fixture

A minimal repo: `package.json` with a few scripts, plus
`.github/workflows/ci.yml`. Design constraints (binding):

- The workflow MUST carry awkward-but-benign YAML, not just easy lines — at
  minimum: one **quoted inline** `run:` command (exercises `unquote`,
  `ci.mjs:73-78`); one **folded/block scalar** (`>-` or `|`, `ci.mjs:44`); one
  **backslash line-continuation** joined command (`ci.mjs:52-57`); one plain
  `run:` line. Rationale: a fixture authored by the detector's own authors will
  otherwise dodge exactly the constructs the parser struggles with.
- Content must be strictly benign — no `$()`, backticks, `&&`, env prefixes.
  Hostility is `fixtures/hostile-ci/`'s job; this fixture proves adoption.
- The fixture's command set must make **all four reconcile paths reachable**:
  - a clean CI line whose command also exists as a local `package.json` script
    (path 0, `:449-456` — including the literal-same-local preference at `:451`);
  - a local script that a CI line verifies by containment/shared tool but is not
    a clean adoption (path 1, `:458-461`);
  - a local-only category with and without a `sharesTool` CI match (path 2,
    `:463-465` — one `verified_by_ci: true` case, one `false`);
  - a category with **no local candidate** and a clean CI-only line (path 3,
    `:470-476`), plus a no-local-candidate category whose only CI line is
    *unclean* (compound shell) → category must be absent from `commands`.
- Fixture content is parsed only (`detectCommands`), never executed — same
  covenant as every fixture.

### 2. Selftest assertions (~12) pinning the adopt path

A new `--- ci-adopt ---` block in `scripts/selftest.mjs`, mirroring the
hostile-ci block's shape (`detectCommands(join(fixtures, 'ci-adopt'))`), asserting
per path:

- path 0: chosen command correct, `verified_by_ci === true`; the CI-adopted
  variant carries `from: 'ci'` and a `source` ending `(CI)` with the real
  `file:line`;
- path 1: local candidate chosen, `verified_by_ci === true`, `from` stays local;
- path 2: both the `true` and `false` `verified_by_ci` outcomes;
- path 3: CI-only clean command adopted (`from: 'ci'`, `verified_by_ci: true`);
  CI-only unclean command NOT adopted;
- parsing: the folded-scalar, quoted-inline, and continuation-joined commands each
  appear in `ci_commands` with correct `file:line` citations.

Assertions must bind to the detector's **decision** (`from`, `verified_by_ci`,
`source`, presence/absence), not merely to parse output.

### 3. Version-stamp agreement assertion

One selftest assertion that all five stamps agree: `VERILOOP_VERSION` in
`scripts/generate.mjs` === `package.json` `.version` === `.claude-plugin/plugin.json`
`.version` === both `version` fields in `.claude-plugin/marketplace.json` === the
first `## <semver>` heading in `CHANGELOG.md`. Read the files; do not import
`generate.mjs` if a regex on the source line is simpler and sufficient.

### 4. Docs sync (the map fix)

- `docs/plans/roadmap-v1.md` §11 Check-offs: append the M1 main-event check-off —
  clean-landed 2026-07-12 (run `wf_bb6dd006-dff`, preview
  `feat/lobby-queue-timeout-feedback` @ `63bc84a`, recorded in commit `2886602`);
  state the true position: M1 code-complete, blocked on owner sign-off of two
  unmerged Torevan previews (`feat/format-check-green` @ `f264731` and the above);
  M2 not started. Do not rewrite history above; append, matching the existing
  check-off style.
- **Drop hardcoded assertion counts from prose** (they staled once already, inside
  the very rule about citation accuracy). Fix at the sources:
  `constitution.md:14` ("the 96-assertion selftest" → "the selftest"),
  `interview.json:23` evidence string, `scan-notes.md:37`. Then **regenerate**
  (`node scripts/generate.mjs`) so `veriloop-manifest.json` follows — never edit
  the machine-owned manifest by hand (constitution rules 8/9). Constitution is
  hand-owned; editing it directly is correct.
- CHANGELOG entry per existing convention; version bump per maintainer convention
  (patch).

### 5. Structural rule — self-install is never adopt-path evidence

Ruling from the consultation (Drift, owner of rule 3): the ban attaches to the
**citation**, not the file. Veriloop's own repo/manifest must never be cited as
evidence the adopt path works — only `fixtures/ci-adopt/` assertions count. Encode
this as a short comment atop the new selftest block (greppable), e.g.:
`// ci-adopt is the ONLY evidence for the adopt path — never cite veriloop's own
self-install/manifest as proof it works (see fix-8-9-plan.md v0.1.2 lesson).`

## Rule-3 clarification (why this fixture is NOT the v0.1.2 trap)

The v0.1.2 failure: a fixture **supplied the evidence** an assertion depended on
(a pre-seeded `.prettierignore` satisfied an `existsSync` arm; the assertion proved
nothing — `docs/plans/fix-8-9-plan.md`). Here the fixture supplies **input** (a CI
file) and the assertions interrogate the detector's **decision**. Input is not
evidence. This distinction may be recorded in the plan/report but needs no code.

## Non-goals (binding)

- **NO `.github/workflows/` for veriloop itself.** Deferred to M5 by unanimous
  expert conclusion (`npm test` only, node matrix, SHA-pinned checkout — when it
  comes). Nothing in this change creates `.github/` at the repo root.
- **NO `claude plugin validate` anywhere** — killed for the push gate (zero
  schema-drift observed; it checks schema, not stamp agreement); it is an M5/M6
  release-checklist item.
- **NO detector behavior changes.** This change pins current behavior. If writing
  an assertion exposes a genuine defect in the adopt path, fix it per the iron
  rule (with the assertion shipping alongside, rule 3) — but flag it prominently
  in the run report as an unplanned defect fix.

## Acceptance criteria

1. `npm test` green; assertion count grows from 106 to ≥118.
2. Each of the four reconcile paths has ≥1 assertion that fails if its
   `verified_by_ci`/`from`/`source` output changes.
3. The parsing assertions genuinely bind: breaking folded-scalar handling or
   `unquote` would fail the suite (implementer verifies by inspection or a quick
   local mutation, not committed).
4. `grep -rn "96 assertion\|96-assertion" .claude/ docs/ scripts/` → no matches;
   the manifest change arrived via regeneration, not hand-editing.
5. Roadmap §11 reflects the actual M1 state.
6. No new files under `.github/` at the repo root; `git status` clean after land.
