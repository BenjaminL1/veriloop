# Fix plan — findings #8 (pre-existing-red checks hard-block) and #9 (emitted bundle breaks target format gate)

*2026-07-11 · planned on Fable for execution on Opus · target: veriloop `3f9be40`+*

Both findings came out of the M1 main-event drive (`wpbcukkxf`, feature #76). See
`m1-dogfood-report.md` for background. **All design decisions below are settled —
execute as written; do not re-open them.** Where a detail is genuinely
unspecified, match the existing style of the file you are editing.

**Standing constraints (non-negotiable):**
- No `Co-Authored-By` trailers referencing Claude/Anthropic/any AI, ever.
- No absolute paths in any emitted artifact (lint-bundle enforces this).
- Never execute anything from `fixtures/hostile-ci/`.
- Do not touch Torevan in this task — these are veriloop-repo changes only.
  (Regenerating Torevan's bundle is a separate, later step with its own cwd rules.)
- Surgical changes; keep the existing code style of each file.

**Execution order:** #9 first (smaller, independent), then #8, then selftest,
then docs sync, then commit. Bump `VERILOOP_VERSION` to `0.1.2` in
`scripts/generate.mjs` as part of whichever change you commit first (single bump).

---

## Part 1 — Finding #9: exempt machine-owned emitted files from the target repo's format check

### Problem

The emitted bundle (`.claude/veriloop/**`, `.claude/workflows/<repo>-dev-loop.js`,
`.claude/commands/dev-loop.md`) is not formatted to the target repo's prettier
style, so installing veriloop into a repo whose format check covers those paths
turns that repo's format gate RED (observed in Torevan).

### Decision (settled)

**Exempt, don't format.** Formatting emitted files to repo style is unstable —
the next `generate.mjs` run rewrites them and the check goes red again. Machine-
owned files' formatting is owned by the generator. So the generator maintains a
machine-owned marked block in the repo's `.prettierignore`. Same mechanism also
fixes the recorded open finding that `.claude/veriloop/.backups/` is never
gitignored: a marked block in `.gitignore`.

Prettier only, for now. Other formatters (ruff format, gofmt) are a recorded
follow-up, not part of this change — do not build an abstraction for them.

### Implementation

All in `scripts/generate.mjs` (helper may live in `scripts/lib/util.mjs` if that
file already exports similar fs helpers — check first; otherwise keep it local
to generate.mjs).

**1. Add a block-splice writer method.** In `makeWriter(outRoot, force)`, add a
third method alongside `machine`/`handOnce`:

```js
// shared file (owner-owned) carrying ONE machine-owned marked block; the block
// is created/replaced idempotently, everything outside it is never touched.
spliceBlock(path, lines, { createIfMissing }) { ... }
```

Behavior:
- Markers: `# <<< veriloop:auto:start >>>` / `# <<< veriloop:auto:end >>>`
  (hash comments — valid in both `.gitignore` and `.prettierignore`).
- Block content = start marker, then `lines` verbatim, then end marker.
- If the file exists and contains both markers: replace everything between them
  (inclusive) with the new block. If it exists without markers: append
  `\n` + block + `\n` at EOF (preserve all existing content byte-for-byte).
- If the file does not exist: write the block alone iff `createIfMissing`,
  else do nothing and record nothing.
- Back up the prior file via the existing `backup(path)` before any change
  (same as `machine()` does).
- Only write if the resulting content differs; push to `emitted` with
  `ownership: 'shared-block'` and status `'written'`/`'unchanged'` (mirroring
  the existing status conventions).
- A pre-existing identical line *outside* the block (e.g. Torevan's hand-added
  `.claude/veriloop/.backups/` in `.gitignore`) is harmless duplication for
  ignore-file semantics — do NOT try to dedupe or edit user lines.

**2. Call it from `main()`,** after the expert/constitution writes and before
the manifest is built (so `emitted_files` includes these entries):

```js
// .gitignore — backups must never be committed
w.spliceBlock(P('.gitignore'), ['.claude/veriloop/.backups/'], { createIfMissing: true });

// .prettierignore — machine-owned files are exempt from repo style: a repo-style
// format pass over them is unstable (regeneration clobbers it), so exemption is
// the only stable answer. Only when the repo actually uses prettier.
const usesPrettier =
  Object.values(cj.commands).some((c) => /\bprettier\b/.test(c.cmd || '')) ||
  existsSync(P('.prettierignore'));
if (usesPrettier) {
  w.spliceBlock(P('.prettierignore'), [
    '.claude/veriloop/',
    `.claude/workflows/${repoName}-dev-loop.js`,
    '.claude/commands/dev-loop.md',
  ], { createIfMissing: true });
}
```

Note `cj.commands` values are objects `{cmd, ...}` — guard for shape as the
existing code does. The three prettierignore paths must exactly cover the
machine-emitted set (cross-check against what `main()` emits; if you find a
fourth machine-owned path emitted outside `.claude/veriloop/`, include it).

**3. Manifest / lint-bundle interaction.** `emitted_files` now contains
`.gitignore` / `.prettierignore` entries with `ownership: 'shared-block'`.
Check `scripts/lint-bundle.mjs`: it lints files listed in `emitted_files`. Ignore
files contain only relative paths, so they pass its checks — but confirm
lint-bundle doesn't crash on non-JS/MD files; if it applies JS-specific rules
by extension, extensionless dotfiles must fall through cleanly. If needed,
skip `ownership === 'shared-block'` entries in lint-bundle with a one-line
comment (they are owner files carrying one machine block, not emitted artifacts).

### Selftest additions (in `scripts/selftest.mjs`, same tmp-dir style as the existing gate-composition block)

1. Repo with `"format:check": "prettier --check ."` in scripts → after generate:
   `.prettierignore` exists and contains `.claude/veriloop/` between veriloop
   markers; `.gitignore` contains `.claude/veriloop/.backups/`.
2. Run generate a SECOND time on the same tmp dir → `.prettierignore` contains
   exactly one start marker (idempotent; use `split('<<< veriloop:auto:start >>>').length === 2`).
3. Pre-seed the tmp `.prettierignore` with a user line (`dist/`) before generate
   → after generate the user line is still present AND the block exists.
4. Repo with no prettier in any command and no `.prettierignore` → generate does
   NOT create `.prettierignore`.

---

## Part 2 — Finding #8: a check that was already RED on the base tree must not hard-block

### Problem

`verdictFrom()` in `scripts/templates/dev-loop.template.js` (line ~199) treats
every failed check as a BLOCKER. A repo with one pre-existing red check (Torevan
`veriloop/install`: `format:check`) can never PASS, no matter how clean the
feature is. The generation-time `verified === false` flag is already threaded
into the checks prompt as a note (line ~158) but is ignored by the verdict — and
it's stale anyway (baseline changes after generation).

### Decision (settled)

**Dynamic baseline probe, run only on the failure path.** When ≥1 gate check
fails, one extra agent re-runs *only the failed checks* against the base tree
and classifies each failure as pre-existing vs. caused-by-change.

- **Mechanism: a second disposable git worktree detached at the base branch.**
  NOT `git stash` in the feature worktree (a failed pop strands the feature),
  NOT the owner's main checkout (covenant: never touch it). The probe agent:
  1. `git -C $REPO worktree add <probe-dir> --detach <baseBranch>` where
     `<probe-dir>` is a sibling of the feature worktree (e.g.
     `"$(dirname <feature-wt>)/.baseline-probe-<branch-slug>"`).
  2. Makes deps available the same way implement does (reuse the
     `VERILOOP.depsSetup` text in the prompt — for node it symlinks
     `$REPO/node_modules`).
  3. Runs ONLY the failed gate commands there, judging strictly by exit code.
  4. Compares failure units between the feature-worktree run and the base run:
     files listed by a format check, `file:line` errors for lint/typecheck,
     failing test names for tests. `newFailures` = units failing in the feature
     worktree that do NOT fail on base. If the outputs can't be compared
     confidently, treat everything as new (fail-safe).
  5. ALWAYS removes the probe worktree (`git -C $REPO worktree remove --force
     <probe-dir>`), even after errors, and reports `cleanedUp`.
- **Sequencing: strictly after the parallel gate jobs complete** (inside
  `gate()`, after `await parallel(...)`), never concurrent with lenses — lenses
  read the live worktree, and gate cost must not grow on the happy path.
- **Scope: gate commands only.** `extraChecks` (interview-defined, instruction-
  style) can't be mechanically re-run on base; their failures stay blockers.
- **Verdict rules** (the regression-masking guard — this is the critical part):
  - failed check, probe `baseResult === 'pass'` → **BLOCKER** (change broke it).
  - failed check, `baseResult === 'fail'`, `newFailures.length > 0` → **BLOCKER**,
    message names the new units: `check: X red on base, but this change ADDS new
    failures: <units>`.
  - failed check, `baseResult === 'fail'`, no new failures → **CONCERN**, tagged
    `[pre-existing] check: X already RED on <baseBranch> — not caused by this change`.
  - failed check with no probe entry, or probe errored / `cleanedUp === false`
    → **BLOCKER** (fail-safe; never silently downgrade).
- **Fix-agent guard:** the fix prompt must state that `[pre-existing]` concerns
  are OUT OF SCOPE — never attempt to fix them (otherwise it would try to
  reformat/repair the whole repo inside a feature branch).

### Implementation (all in `scripts/templates/dev-loop.template.js`)

**1. New schema** next to the others:

```js
const BASE_PROBE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['probes', 'cleanedUp'],
  properties: {
    probes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'baseResult', 'newFailures', 'evidence'],
        properties: {
          name: { type: 'string' },
          baseResult: { type: 'string', enum: ['pass', 'fail', 'error'] },
          newFailures: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string' },
        },
      },
    },
    cleanedUp: { type: 'boolean' },
  },
};
```

**2. New `runBaselineProbe(ctx, failedChecks, ph)`** helper near `runChecks`.
Prompt must include: `RESOLVE`, the mechanism steps above (worktree add
--detach at `ctx.baseBranch`, deps via the `VERILOOP.depsSetup` text, run each
failed command judging strictly by exit code, unit-level comparison
instructions including the fail-safe "if you cannot confidently compare, list
the uncertainty in evidence and treat the worktree failures as new"), and the
unconditional cleanup requirement. Pass it ONLY checks whose `name` matches a
`VERILOOP.gate` entry; include each check's exact `cmd` and its
`failingOutput` excerpt from the gate run so the agent can compare units.

**3. Wire into `gate()`** after the `parallel` results are collected:

```js
const failedGate = (checks?.checks || []).filter(
  (c) => c.result === 'fail' && VERILOOP.gate.some((gc) => gc.name === c.name),
);
const baseProbe = failedGate.length ? await runBaselineProbe(ctx, failedGate, ph) : null;
```

Pass `baseProbe` into `verdictFrom`, and include `baseProbe` in the object
`gate()` returns (for the final report / attestation).

**4. Rework `verdictFrom` + `applyWaivers` to be pure and testable.**
- Signature: `verdictFrom(checks, lenses, shot, xmodel, baseProbe, waivers)`;
  `applyWaivers(blockers, waivers)`. Update the call site in `gate()` to pass
  the module-level `waivers`. No other behavior change to waivers.
- Check classification per the verdict rules above. Non-gate check failures
  (extraChecks) keep the current blocker path.
- Wrap BOTH functions in new markers so selftest can extract and execute them:

```js
// <<< veriloop:verdict:start >>>
function applyWaivers(blockers, waivers) { ... }
function verdictFrom(checks, lenses, shot, xmodel, baseProbe, waivers) { ... }
// <<< veriloop:verdict:end >>>
```

(`spliceAuto` matches the exact `veriloop:auto` marker strings via `indexOf`,
so these new markers cannot collide — verified against `render.mjs:176`.)

**5. Fix-loop prompt** (the `Fix pass ${fixPass}/${MAX_FIX}` agent): append one
sentence: concerns prefixed `[pre-existing]` are baseline issues on
`${ctx.baseBranch}`, OUT OF SCOPE for this branch — do not touch them.

**6. Keep** the existing generation-time `baselineNote` in `runChecks` (it
primes the checks agent's failingOutput narration); the probe is the authority
for the verdict.

### Selftest additions (execute the emitted verdict logic, not string-match it)

In `scripts/selftest.mjs`: generate into a tmp repo (reuse the existing
gate-composition helper pattern), read the emitted
`.claude/workflows/<name>-dev-loop.js`, extract the text between
`// <<< veriloop:verdict:start >>>` and `// <<< veriloop:verdict:end >>>`, and
materialize it:

```js
const src = emitted.slice(emitted.indexOf(startMarker) + startMarker.length, emitted.indexOf(endMarker));
const verdictFrom = new Function(`${src}; return verdictFrom;`)();
```

Table-driven assertions (minimum set; `checks` arg shaped
`{checks:[{name,command,result}], failingOutput:''}`, gate check name must be
one that exists in the tmp repo's gate, e.g. `test`):

1. fail + probe `baseResult:'pass'` → verdict `FAIL` (regression blocks).
2. fail + probe `baseResult:'fail'`, `newFailures: []` → verdict `CONCERNS`,
   and the concern string contains `[pre-existing]`.
3. fail + probe `baseResult:'fail'`, `newFailures: ['apps/web/x.ts']` →
   verdict `FAIL`, and the blocker string contains `apps/web/x.ts`.
4. fail + `baseProbe: null` → verdict `FAIL` (fail-safe).
5. fail + probe entry present but `cleanedUp: false` → verdict `FAIL` (fail-safe).
6. All-pass checks + no findings → `PASS` (no regression from the refactor).

Also assert (string-level) that the emitted workflow contains the
`[pre-existing]`-out-of-scope sentence in the fix prompt.

---

## Part 3 — Wrap-up (same commit series, veriloop repo only)

1. `node scripts/selftest.mjs` → all assertions green (26 existing + new ones;
   ALL existing must still pass untouched).
2. `node scripts/lint-bundle.mjs` self-check if it has one; otherwise generate
   into a tmp dir and run lint-bundle against it → exit 0.
3. **Docs sync (required by CLAUDE.md):**
   - `docs/plans/m1-dogfood-report.md`: in "Open findings", mark the
     `.backups/` gitignore finding as fixed (this change) and add a short
     "Findings #8/#9 (main event)" note recording both fixes — keep it terse,
     match the existing table/list style.
   - Grep `docs/` + `README.md` for `verdictFrom`, `prettierignore`,
     `.backups` and update any stale statement.
   - This plan file: append a one-paragraph "Implementation notes" section if
     the final code diverged anywhere from the plan.
4. Bump `VERILOOP_VERSION` to `'0.1.2'` (if not already done in an earlier step).
5. Commits: conventional messages, e.g.
   `fix(generate): exempt machine-owned bundle files from target format gate (#9)`
   and `fix(template): baseline probe — pre-existing red checks concern, not block (#8)`.
   Repo author only. **NO AI co-author trailer.** Push via the existing SSH
   remote (`git push origin main`).

**NOT in scope for this task:** regenerating Torevan's bundle, merging the
Torevan prettier preview, re-driving feature #76. Those are the next session's
drive steps (cwd must be inside Torevan — see the roadmap check-offs note).

## Implementation notes (2026-07-11, executed on Opus)

Executed as planned, with one substantive divergence and two small ones.

**Divergence — prettier detection.** The plan's `usesPrettier` predicate
(`cj.commands` cmd text matching `/prettier/`, or a pre-existing `.prettierignore`)
is **wrong in the common case** and was caught by an end-to-end check after the
selftest was already green. Detected commands are *wrappers*: a repo with
`"format:check": "prettier --check ."` yields the command `npm run format:check`,
whose text never contains "prettier", so a fresh prettier repo got no exemption.
The plan's own selftest hid this by pre-seeding `.prettierignore` in the fixture
(the `existsSync` arm of the predicate then answered true). Replaced with a
`repoUsesPrettier(repo, cj)` detector reading the real signals — any prettier config
flavor, a `prettier` key / dependency in package.json, a script body invoking it, or
a command calling it directly — and the fixture no longer pre-seeds the file, so the
assertion tests what it claims. Lesson worth keeping: a selftest fixture that
supplies the evidence under test proves nothing.

**Small ones.** (1) `runBaselineProbe` takes `failingOutput` explicitly —
`CHECK_SCHEMA` carries one top-level `failingOutput`, not a per-check field, so the
planned `c.failingOutput` would always have been empty; the probe is also told it may
re-run a failed command read-only in the feature worktree to enumerate units.
(2) lint-bundle needed no change: it filters by `.js|.json|.md` for the absolute-path
scan, so extensionless ignore files pass through harmlessly.

Verification beyond the selftest: with a real prettier binary, an installed bundle
flagged **6** veriloop-owned files without the fix and **0** with it.

## Acceptance checklist

- [ ] selftest: all green, including ≥6 new #8 assertions + ≥4 new #9 assertions.
- [ ] Fresh generate on a prettier repo yields a `.prettierignore` block; second run is idempotent; non-prettier repo untouched.
- [ ] `.gitignore` gains the `.backups/` block idempotently.
- [ ] Emitted `verdictFrom` executes standalone via the verdict markers and satisfies the 6-case table.
- [ ] Probe agent is only invoked on the failure path (code-inspect `gate()`).
- [ ] Fix prompt contains the `[pre-existing]` out-of-scope guard.
- [ ] No absolute paths introduced anywhere in emitted content (lint-bundle green).
- [ ] Docs synced; version 0.1.2; commits pushed, no AI trailer.
