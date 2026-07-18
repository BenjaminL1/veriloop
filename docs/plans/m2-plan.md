# M2 · v0.3 "Parity & Convergence" — retire the hand-built gold loop safely

*Planned 2026-07-14 · veriloop `9ccc455` (v0.3.2, `npm test` = 119 ok / 0 failed) · targets:
veriloop + Torevan `main@4d0e114` + catan_rl_v2. Executable cold by a weaker model — every
claim cites `file:line`; read the cited file before trusting a line number.*

**Goal:** make the generated `/dev-loop` canonical in both Torevan and catan_rl_v2, seed the
generated constitution to rule-parity with the 14-rule gold, retire the gold loop, and start
persisting the evidence-bundle attestation records — satisfying v1.0 acceptance criterion **2**
(roadmap-v1.md:100).

**Plan-stable:** not gated on any prior milestone's outcome. M1 is code-complete
(roadmap-v1.md:407–420); M2's steps depend only on the *substrate* M1 built (the generated
bundle already installed + proven in Torevan), never on a pending M1 *result*.

**⟨execution-time⟩ parameters** — values knowable only when the steps run, with the exact
source that fills each:

| param | fill source |
|---|---|
| `VNEXT` | next veriloop version after the evidence-emission change. `grep VERILOOP_VERSION scripts/generate.mjs` (currently `0.3.2` at generate.mjs:24) → bump one patch → `0.3.3`. |
| `BRIDGE_SHA` | Torevan commit that lands the 14-rule constitution bridge. `git -C /Users/benjaminli/my_projects/Torevan rev-parse --short HEAD` after the commit. |
| `RETIRE_SHA` | Torevan commit that records gold retirement in its docs (same rev-parse after that commit). The *already-effected* in-place replacement is `aa03218` — verifiable now. |
| `CATAN_SHA` | catan_rl_v2 commit that lands its bundle + CLAUDE.md re-point. `git -C /Users/benjaminli/my_projects/catan_rl_v2 rev-parse --short HEAD` after the commit. |
| `DB_FEATURE` | the DB-touching feature that proves the Supabase advisor `extra_check` fires — owner-chosen at execution. |
| `PARITY_FEATURE` | the one small feature driven side-by-side (gold vs generated, dryRun) — owner-chosen. |
| `CATAN_SHAKEDOWN` | the headless shakedown feature for catan — owner-chosen. |
| `SELFTEST_N` | selftest assertion count after the evidence-emission additions. `npm test 2>&1 \| tail -1` (currently `119 ok`). |
| `HISTORY_TS` | `.claude/veriloop/history/<ts>.json` filenames — minted by the loop at run time. |

**Deferred decisions** (CONTENT depends on a later milestone's result — NOT in this plan):
the benchmark exclusion-list *content* and mining methodology (defined in m3-plan.md, M3); any
constitution reconciliation *after* blind mining (M3 three-way merge, roadmap-v1.md:188). This
plan only *consumes* the freeze as a precondition and *seeds* the constitution by copy.

---

## Step 0 — Precondition (checkable; NOT work in this plan)

The M3 held-out-gold benchmark mines Torevan's constitution **blind**. Once the constitution
bridge (Step 1) lands the 14 gold rules into Torevan, no pre-bridge tree exists to mine
against unless the corpus SHA is frozen **first**. Consultation 2026-07-14 (binding): *the
benchmark freeze must be recorded before the M2 bridge runs.*

- **What:** `docs/plans/m3-plan.md` must exist with a `## §0 — Benchmark freeze` section pinning
  frozen corpus SHA `4d0e114` (Torevan main, post-M1-merge, pre-bridge) + the exclusion list.
- **Verify:**
  ```
  test -f docs/plans/m3-plan.md && \
  grep -q '4d0e114' docs/plans/m3-plan.md && \
  grep -qi 'Benchmark freeze' docs/plans/m3-plan.md ; echo $?   # → 0
  ```
- **Status now:** MET — `docs/plans/m3-plan.md` exists (committed at `9ccc455`) with a
  `## §0 — Benchmark freeze` section (m3-plan.md:21) pinning frozen corpus SHA `4d0e114`
  (m3-plan.md:25) + the exclusion list; the verify above exits `0`. The freeze record is in
  place before the bridge — Step 1 is unblocked.

---

## Step 1 — Constitution bridge (copy 14 gold rules into the generated constitution)

**What:** the generated Torevan bundle constitution
`/Users/benjaminli/my_projects/Torevan/.claude/veriloop/constitution.md` currently holds **5**
condensed rules sourced from `docs/DESIGN_DECISIONS.md §1.3` (see its header at that file
lines 8–10), NOT the 14-rule hand-built gold. It DIFFERS from
`Torevan/docs/constitution.md` (14 numbered rules) — the bridge has not run. Seed rule-parity
by copying the 14 gold rules in, achieving parity immediately without waiting for M3 mining
(roadmap-v1.md:144–147).

**How (mechanical, owner-ownership preserved):**
1. The bundle constitution is **hand-owned**: veriloop three-way-merges it on re-run and owner
   edits win (its header, `.claude/veriloop/constitution.md:8–10`; the ownership guarantee is
   veriloop constitution **rule 8**, `.claude/veriloop/constitution.md:43–47` — hand-owned
   files are never clobbered, backed up first). So a hand edit here survives regeneration by
   construction — this is exactly the mechanism rule 8 protects.
2. Replace the 5-rule body of `Torevan/.claude/veriloop/constitution.md` with the 14 numbered
   rules of `Torevan/docs/constitution.md`, **verbatim in rule prose**. The gold source carries
   **no** owner annotations (`grep -c 'owner:' Torevan/docs/constitution.md` = 0), while the
   current 5-rule bundle does (= 5); a verbatim body-swap would regress ownership to zero.
   So **assign** an `_(owner: `<expert>`)_` annotation to each of the 14 rules — drawn from the
   bundle's expert set (`code-review`, `drift`, `security`, …) — and confirm **every expert
   holds ≥2 rules** (the ownership model of roadmap-v1.md:189–190). This is a manual assignment
   check in M2: machine-enforcement of it (referee-as-lint, roadmap-v1.md:189–190) is M3 —
   `lint-bundle.mjs` does not yet parse rule ownership (lint-bundle.mjs:155 only asserts the
   constitution file exists). Keep the veriloop header/ownership note; update its source pointer
   to read `docs/constitution.md` (the seed), since §1.3 is no longer the source once the 14
   rules are in.
3. This is a **hand edit to a hand-owned file** — do NOT run `generate.mjs` to produce it and
   do NOT hand-patch any *machine-owned* file (rule 8/9 boundary).
4. Commit in Torevan → `BRIDGE_SHA`.

**Verify:**
```
cd /Users/benjaminli/my_projects/Torevan
diff <(grep -E '^[0-9]+\.' docs/constitution.md) \
     <(grep -E '^[0-9]+\.' .claude/veriloop/constitution.md) ; echo $?   # → 0 (14 == 14)
grep -cE '^[0-9]+\.' .claude/veriloop/constitution.md                    # → 14
grep -c 'owner:' .claude/veriloop/constitution.md                       # → 14 (every rule owned — manual check; lint does NOT enforce this in M2)
node /Users/benjaminli/my_projects/veriloop/scripts/lint-bundle.mjs --bundle .claude ; echo $?  # → 0 (bundle integrity: constitution + manifest present, lint-bundle.mjs:155 — NOT a rule-ownership check)
```
Then regenerate once and confirm the 14 rules survive (rule-8 proof):
```
# regenerate Torevan's bundle from veriloop, then:
grep -cE '^[0-9]+\.' .claude/veriloop/constitution.md   # → still 14
```

---

## Step 2 — Parity checklist (generated must match or exceed the gold)

Every item named in roadmap-v1.md:147–151, expanded to *item → side-by-side verification →
pass condition*. Anchors are in the emitted loop
`Torevan/.claude/workflows/torevan-dev-loop.js` (structurally identical to the template
`scripts/templates/dev-loop.template.js`, cited below).

| item | how verified side-by-side | pass condition |
|---|---|---|
| **plan-halt** | feed a plan that violates a constitution rule; watch for the halt return (`dev-loop.template.js:414`, `halted:'plan-violates-constitution'`). | no worktree created; loop returns `halted`. |
| **tiers** | triage output assigns `trivial\|standard\|high` (tier enum `dev-loop.template.js:90`); each maps a distinct lens panel via `lensesForTier` (`:207–208`). | 3 tiers resolve to 3 distinct panels. |
| **worktree+deps** | implement runs in an isolated worktree; deps made available (ctx.wt `dev-loop.template.js:431`). | gate checks run green in the worktree, not the main checkout. |
| **real checks** | gate runs `config.gate` commands, verdict strictly by exit code (`dev-loop.template.js:351–356`). | a deliberately-failing gate command → `FAIL`, never a narrated pass. |
| **advisor via `extra_checks` (DB-touching)** | drive `DB_FEATURE` (a change touching Supabase/DB surface); the interview's Supabase-advisor `extra_check` (roadmap-v1.md:121; M2 item roadmap-v1.md:148–149) must run and gate. | the advisor check appears in the gate result and a violating change is BLOCKED. **Flagship parity proof.** |
| **lenses by tier** | `lensesForTier` (`:207–208`) filters `VERILOOP.experts` by tier. | high tier runs the full panel incl. xmodel; trivial runs a reduced set. |
| **screenshot** | UI change → screenshot-gate agent (`SHOT_SCHEMA` `:122`, agent `:290`) captures + judges. | captures the *changed* state; `verdict:'fail'` on any real defect (`:344`). |
| **cross-model** | high tier + `VERILOOP.crossModel` schedules xmodel (`:369`); absent Codex → `{skipped:true}` (`:297`). | present → second opinion runs; absent → skipped, NOT a false fail. |
| **bounded fix** | fix loop `≤ MAX_FIX`, stop-on-no-progress (`dev-loop.template.js:441–457`, `:454`). | ≤3 passes; halts when blockers don't shrink. |
| **land policy** | land pushes a branch/preview, never merges/deploys (`dev-loop.template.js:473–481`). | `git push -u origin <branch>`; no merge to base. |
| **dryRun** | `dryRun` leaves the worktree, no push, no docs sync (`dev-loop.template.js:465–466`). | branch left in worktree; nothing pushed. |
| **waivers (superset)** | `applyWaivers` downgrades waived blockers (`dev-loop.template.js:308–314`); superset of the gold's waiver set. | every gold waiver has a generated equivalent; extras allowed. |

**Side-by-side dry-run procedure (one small feature):**
1. The gold loop is preserved at
   `Torevan/.claude/veriloop/.backups/2026-07-11T09-46-26-719Z/.claude/workflows/torevan-dev-loop.js`
   (its last hand-authored state is Torevan commit `673991f`; it reads `EXPERT =
   prompts/senior-web-game.md` at that file's line 23). Run it and the current generated loop
   on `PARITY_FEATURE` with `dryRun`, from cwd Torevan.
2. Diff the two runs' **gate coverage** (which checks + which lenses each scheduled). Confirm
   generated ⊇ gold for every row above.
3. **Archive** the filled table + the two dry-run gate-coverage lists in
   `docs/plans/m1-dogfood-report.md` (roadmap-v1.md:164 — "parity checklist archived in the
   dogfood report"), under a new `## M2 parity checklist` section.

**Verify:** the archived table has all 12 rows marked pass, and the `DB_FEATURE` drive shows
the advisor `extra_check` in its gate output.

**Implementation notes (executed 2026-07-17):** `PARITY_FEATURE` = the lobby-timeout-nits
re-drive (dryRun PASS after one fix pass, `wf_0dbaca84`); `DB_FEATURE` = Top Climbers
weekly slice 1 (owner pick over the recommended cosmetics; CONCERNS/0 blockers,
`feat/top-climbers-weekly` @ `8867cd4`) — **the advisor extra_check fired live and passed
with zero new WARN/ERROR**. Gold side verified statically (runtime execution of the backup
script was blocked by the session permission classifier; byte-identity to `673991f`
verified first). Table archived in `m1-dogfood-report.md` § "M2 parity checklist": 12/12
pass, 2 rows anchor-verified (plan-halt, cross-model — no live trigger this run), 5 rows
exceed. Prerequisite regen: Torevan bundle 0.3.0 → 0.3.6 (`9eb5663`) before certification.

---

## Step 3 — Retire the gold loop

**Discrepancy note (code wins over roadmap):** roadmap-v1.md:152–158 frames retirement as
*deleting* `torevan-dev-loop.js` + the old `/dev-loop` command. In the real tree they were
already replaced **in place** at M1 install `aa03218`: the generator emits to the exact same
paths (`.claude/workflows/torevan-dev-loop.js`, `.claude/commands/dev-loop.md`), so install
overwrote the gold (backed up under `.claude/veriloop/.backups/`, git-preserved through
`673991f`). Current `Torevan/.claude/workflows/torevan-dev-loop.js` is the **generated** loop
(`// GENERATED BY veriloop`, 23 `VERILOOP` refs). **There is no separate hand-built file left
to `git rm`.** M2 retirement is therefore *confirm + record*, not delete.

**What stays (the shared-prompt subtlety, roadmap-v1.md:153–156):**
- `prompts/senior-web-game.md` is SHARED: the hand-built `torevan-advise.js`
  (`.claude/workflows/torevan-advise.js` — NOT veriloop-generated, 0 `veriloop:auto` markers)
  still reads it at `torevan-advise.js:33`. The gold dev-loop also read it (line 23 of its
  backup). Retirement removes the dev-loop consumer only; the advise consumer keeps it. **Do
  not delete `prompts/senior-web-game.md`.**
- `torevan-advise.js` and its generated sibling `/advise` (v0.3.0, roadmap: advise.md command)
  coexist — out of M2 scope; the roadmap retires only the dev-loop.

**Work:**
1. Confirm the gold loop + gold `/dev-loop` command no longer exist as live hand-built files
   (both are the generated versions now).
2. Record the retirement in Torevan's docs — append a terse note to
   `Torevan/docs/constitution.md` (or the dogfood report) citing the retiring commit `aa03218`
   ("gold `torevan-dev-loop.js` + `/dev-loop` replaced in place by the generated bundle;
   history preserved at `673991f` and in `.claude/veriloop/.backups/`"). Commit → `RETIRE_SHA`.

**Observation (pre-existing; mention, do not delete):** `prompts/drift-sentinel.md` references
`senior-web-game.md` (drift-sentinel.md:4,30) and fed the gold loop's `DRIFT` prompt; after
retirement no live consumer references it (`torevan-advise.js` reads only
`senior-web-game.md`). It may be orphaned — flag to the owner; do not remove in M2.

**Verify:**
```
cd /Users/benjaminli/my_projects/Torevan
grep -c 'GENERATED BY veriloop' .claude/workflows/torevan-dev-loop.js   # → 1 (generated, not gold)
test -f prompts/senior-web-game.md ; echo $?                            # → 0 (shared prompt kept)
grep -q 'aa03218' docs/constitution.md || grep -rq 'aa03218' docs/plans # retirement recorded
```

**Implementation notes (executed 2026-07-16 — `RETIRE_SHA = dce6a8f`):** all three verify
commands pass. Preconditions were independently re-verified by a 3-agent workflow
(`wf_e571ef53-50c`: gold archaeology / active provenance / consumer analysis, all
CONFIRMED) — gold recoverable and byte-identical at `673991f` (workflow 266 lines +
command 33 lines; the `.backups/` copies are gitignored/transient, so the record cites
git history as the durable store); the active paths carry only generated content with a
clean regeneration lineage; `senior-web-game.md`'s live consumer confirmed at
`torevan-advise.js:33`; `drift-sentinel.md` confirmed orphaned (flagged in the record,
not deleted). The record also truth-fixed the two docs still describing the hand-built
flow (`DESIGN_DECISIONS.md` §1.6 and `.specify/memory/constitution.md` §VIII — the
latter was outside this plan's sweep scope but covered by the standing doc-sync rule).
**Sequencing deviation, owner-authorized:** retirement ran BEFORE Step 2's formal parity
checklist (owner instruction 2026-07-16; de facto evidence at that point: 2 Torevan + 5
veriloop features through the generated loop). Steps 1, 2, 4 remain open. Torevan's
bundle is veriloop v0.3.0 — stale vs 0.3.6 (missing /dev-plan, /posture, attestation
emission); regeneration is a natural Step-1/Step-2 companion, owner's call.

---

## Step 4 — Converge catan_rl_v2

**State:** `/Users/benjaminli/my_projects/catan_rl_v2` exists (path verified from this
machine) but has **no** `.claude/veriloop/` bundle and no `.claude/workflows/` yet. Its
CLAUDE.md loop convention is the hand-written "Review-and-resolve loop" at `CLAUDE.md:147`
(referenced as "the review-and-resolve loop" at `CLAUDE.md:149–150`). Working tree is dirty
(`.claude/scheduled_tasks.lock`, `scripts/dev/…`) — stage deliberately, never `git add -A`.

**Work:**
1. Generate + install the veriloop bundle into catan_rl_v2 (its interview decides whether
   cargo/maturin checks join the gate — that surface is M4, roadmap-v1.md:228; M2 installs the
   node/python surface only). Commit the bundle → `CATAN_SHA`.
2. Re-point the CLAUDE.md convention: edit `CLAUDE.md:147`'s "Review-and-resolve loop" section
   to direct feature work to `/dev-loop` (keep the section; change the standing convention to
   the generated loop). Same commit.
3. One **headless shakedown** feature `CATAN_SHAKEDOWN` via the generated loop, `dryRun` or
   preview — proving the bundle drives on a second repo.

**Verify:**
```
cd /Users/benjaminli/my_projects/catan_rl_v2
test -d .claude/veriloop && test -f .claude/workflows/catan_rl_v2-dev-loop.js ; echo $?  # → 0
node /Users/benjaminli/my_projects/veriloop/scripts/lint-bundle.mjs --bundle .claude ; echo $?  # → 0
grep -q 'dev-loop' CLAUDE.md ; echo $?   # → 0 (convention re-pointed)
```
Observable: the `CATAN_SHAKEDOWN` run reaches a gate verdict (PASS/CONCERNS/FAIL) on catan.

**Implementation notes (executed 2026-07-17):** `CATAN_SHA = aad09c2` (bundle v0.3.7 +
CLAUDE.md re-point; first commit attempt surfaced veriloop compiler bug — trailing
whitespace in emitted personas rejected by catan's pre-commit hook — fixed at the renderer
as veriloop v0.3.7 with a selftest assertion, then reinstalled clean). Detection found the
**dual stack** (python + rust — the M4 detector's first real repo); roster = baseline +
drift. `CATAN_SHAKEDOWN` = the Makefile bench-drift fix: CONCERNS (only pre-existing
findings), pushed `veriloop/bench-target-dedrift` @ `6b89ab7` (Makefile + the
benchmarks/README.md repoint — a run-evidence conflict about the commit's contents was
resolved by diffing it directly: both files, both in scope). The baseline probe correctly
attributed catan's pre-existing red `make lint` and a pre-existing test failure as
concerns, not blockers.

---

## Step 5 — Evidence-bundle auto-emission (M1 carryover — completes the evidence spine)

**Authority (documented deferral, not a fold-by-fiat):** auto-emission was promised for M1
(roadmap-v1.md:135–136) but M1 explicitly deferred it — m1-dogfood-report.md:86–89 records the
loop "does not yet write `.claude/veriloop/history/<ts>.json` attestation records (roadmap M1)"
and calls auto-emission "a candidate template enhancement," with the report + inline run records
serving as the v0 attestation. M2 discharges that carryover: it is the natural completion of the
evidence spine this milestone already touches (the constitution bridge + parity archive), not
new scope invented here.

**Gap (verified):** the emitted loop builds the full `evidence` object
(`dev-loop.template.js:486–506`) but **never writes it to disk** — it is only summarized into
`brief` and returned (`:507–520`, return `:523`). No `.claude/veriloop/history/<ts>.json` is
produced (roadmap-v1.md:135–136 promised this; M1 deferred it, m1-dogfood-report.md:86–89).

**What:** the loop writes one attestation record per run to
`$REPO/.claude/veriloop/history/<ts>.json`. Schema sketch (superset of the existing `evidence`
fields, roadmap-v1.md:79):
```jsonc
{
  "ts": "2026-07-14T…Z", "feature": "<text>", "repo": "torevan",
  "tier": "standard",                       // enum dev-loop.template.js:90
  "baseSha": "<sha>", "headSha": "<sha>",
  "verdict": "PASS|CONCERNS|WAIVED|FAIL",   // dev-loop.template.js:351–356
  "checks": [{ "name": "test", "command": "npm test", "exit": 0, "tail": "<redacted>" }],
  "baselineProbe": [ … ] | null,            // pre-existing-red classification (#8)
  "screenshots": ["<repo-relative path>"], "screenshotVerdict": "pass|fail",
  "fixPasses": 0, "blockers": [], "concerns": [],
  "land": { "sha": "<sha>", "pushed": true, "branch": "<name>" } | null
}
```

**BINDING safety requirement (veriloop constitution rule 7,
`.claude/veriloop/constitution.md:37–39` — emitted artifacts portable + secret-free):** before
writing, redact every free-text field (`checks[].tail`, screenshot paths, `implSummary`,
lens findings). Reuse the lint-bundle absolute-path precedent regex
`/(\/Users\/|\/home\/[a-z]|\b[A-Z]:[\\/])/` (`scripts/lint-bundle.mjs:88`): replace the repo
root with `$REPO`, normalize screenshot paths to repo-relative, and drop any line still
matching. No env/secret spew, never echo `.env*`.

**Commit-vs-gitignore decision — COMMIT (justified):** the attestation log *is* the track
record the whole evidence spine and post-1.0 autonomy ladder feed on (roadmap-v1.md:79–83,
293–304: hash-chained, ≥90-day retention). Gitignoring would discard exactly that durable
audit trail. Committing is safe *because* redaction (above) is mandatory and self-verified —
not by hiding the files. Records are **runtime output**, so they are NOT added to the
manifest's `emitted_files`; instead a selftest scans emitted records with the same rule-7
regex to prove redaction (rule 3, `.claude/veriloop/constitution.md:21–24` — every fix ships a
selftest; the fixture must not supply the evidence under test).

**Implementation (veriloop repo; per the iron rule this is compiler work, not a hand-patch):**
- In `dev-loop.template.js`, after the report phase, `writeFileSync` the redacted record to
  `$REPO/.claude/veriloop/history/<ts>.json` (mkdir -p the dir).
- Add a selftest asserting: (a) a run writes exactly one `history/*.json`; (b) it parses as
  JSON with the required keys; (c) it contains **no** absolute-path match (`lint-bundle.mjs:88`
  regex). Assertion count `119 → SELFTEST_N`.
- Bump `VERILOOP_VERSION` (generate.mjs:24) → `VNEXT`; regenerate + recommit the bundle into
  Torevan and catan_rl_v2 (same commits as Steps 1/4 or a follow-up).

**Verify:**
```
cd /Users/benjaminli/my_projects/veriloop
npm test 2>&1 | tail -1                        # → SELFTEST_N ok, 0 failed
# after one Torevan drive:
ls /Users/benjaminli/my_projects/Torevan/.claude/veriloop/history/*.json | head -1   # exists
node scripts/lint-bundle.mjs --bundle /Users/benjaminli/my_projects/Torevan/.claude ; echo $?  # → 0
```

**Implementation notes (v0.3.3, veriloop-repo slice as shipped):**
- **One mechanical substitution vs the sketch:** the record is NOT written with a literal
  `writeFileSync` in the workflow — `fs`/`Date`/`git` are all harness-forbidden in the
  emitted loop (`lint-bundle.mjs` FORBIDDEN). Instead the redaction+record-build is a PURE,
  marker-bounded template region (`veriloop:emit`, mirroring the `veriloop:verdict`
  precedent) returning `{ relPath, json }`; a single worktree `agent()` step fills three
  runtime tokens (`__VERILOOP_TS__` / `__VERILOOP_BASE_SHA__` / `__VERILOOP_HEAD_SHA__` — token
  shapes chosen not to trip the leftover-placeholder regex) and writes the bytes. Redaction
  therefore runs in testable JS, not inside the agent.
- **Redaction as shipped (hardened):** strip known roots (worktree + repo-root derived from
  the `<parent>/.veriloop-veriloop/<slug>` layout) → the inert `%REPO%` sentinel (never the
  literal `$REPO`, which a live shell variable could re-expand back into a real path during
  the write), normalize screenshots to repo-relative, then DROP any line still matching
  `lint-bundle.mjs:88`'s ABS regex OR the shared `SECRET_PATTERNS` array (env-style
  KEY/TOKEN/SECRET/PASSWORD/CREDENTIALS assignments, bearer tokens, AWS access key ids, PEM
  BEGIN/END markers, common token prefixes) — one exported array both the selftest and
  `lint-bundle.mjs` extract from the same marker-bounded `veriloop:emit` region, never a
  re-hardcoded copy. PEM private-key blocks get a RANGE drop (BEGIN line through the
  matching END line inclusive, or to end of field if END is missing) so the base64 body and
  footer can't leak past a header-only line-drop. `CHECK_SCHEMA` gained optional
  `exit`/`tail`; `verdictFrom` untouched.
- **Emission policy:** every run emits (owner decision, supersedes the original `!dryRun`
  carve-out) — real runs write the redacted record to `history/<ts>.json`, committed+pushed
  on the feature branch ONLY when the run landed (`land && land.pushed`); dry runs
  (`dryRun:true`) write the same redacted record to `history/dry-runs/<ts>.json`, which is
  local and uncommitted (spliced into the host repo's `.gitignore`). Records are runtime
  output — NOT in the manifest's `emitted_files`.
- **Lint-bundle backstop:** `lint-bundle.mjs` re-scans committed `history/*.json` (excluding
  `dry-runs/`) with the same ABS regex + `SECRET_PATTERNS` array, extracted from the emitted
  workflow the same way the selftest does — defense-in-depth against a record that escaped
  redaction and got committed anyway.
- **Selftest:** the emit region is extracted and executed against synthetic + poisoned
  evidence (fixture never supplies the evidence under test). Count grew `119 → 131 → 154`
  (redaction hardening: PEM block-drop, %REPO% sentinel, dry-run routing, lint-bundle
  backstop).
- **Non-goals honored:** NO Torevan/catan_rl_v2 recommit (owner's merge-time step), NO
  history pruning/rotation policy, NO gate/lens/verdict changes.

---

## Step 6 — Iron rule (holds for every step above)

Every failure discovered while driving M2 is a **compiler bug**: fix veriloop, regenerate,
re-commit the bundle — **never hand-patch an emitted file** (veriloop constitution rules 8 & 9,
`.claude/veriloop/constitution.md:43–51`; machine-owned files regenerate, emitted config has
one source of truth). The only hand edits M2 makes are to *hand-owned* files: the bundle
constitution (Step 1, a hand-owned file per rule 8) and catan's `CLAUDE.md` (Step 4). If a
drive surfaces a loop defect, it lands in `scripts/` with a selftest (rule 3), then the bundle
is regenerated — matching M1's discipline (m1-dogfood-report.md:54–67, 6 bugs fixed this way).

**Note (kept, not fixed here):** `reconcile()` step 3 in
`scripts/lib/detectors.mjs:467–476` is documented-unreachable dead code (its guard recomputes
step 0's `ciMatches.find(isCleanInvocation)`); left as a defensive fallback, covered by the
ci-adopt selftest. Not in M2 scope — do not delete.

---

## Exit criteria (→ v1.0 acceptance criterion 2, roadmap-v1.md:100)

1. **Parity checklist passed vs the gold** — all 12 rows pass; side-by-side dry-run archived in
   `docs/plans/m1-dogfood-report.md`; the DB-touching advisor `extra_check` proven (Step 2).
2. **Both repos run generated loops as canonical** — Torevan already does; catan_rl_v2 bundle
   committed (`CATAN_SHA`), its CLAUDE.md re-pointed to `/dev-loop`, one shakedown driven
   (Step 4).
3. **Hand-built dev-loop retired** — confirmed replaced in place, retirement commit `aa03218`
   recorded in Torevan docs (`RETIRE_SHA`); shared `senior-web-game.md` preserved (Step 3).
4. **Constitution at rule-parity** — Torevan bundle constitution = the 14 gold rules, survives
   regeneration (Step 1, `BRIDGE_SHA`); referee lint green.
5. **Evidence spine live** — the loop writes redacted `history/<ts>.json` records; selftest
   grew `119 → SELFTEST_N`; records pass lint-bundle scanning; version `VNEXT` (Step 5).
6. **Precondition honored** — the M3 benchmark freeze (`4d0e114`) was recorded in
   `docs/plans/m3-plan.md` **before** the bridge landed (Step 0).

---

## Non-goals (explicit)

- **No mining** — blind constitution mining + the held-out-gold benchmark are M3
  (roadmap-v1.md:166–213). M2 seeds by *copy*, not derivation.
- **No new stacks** — Rust/cargo + maturin dual-stack are M4 (roadmap-v1.md:215–242); catan
  installs the node/python surface only.
- **No veriloop `ci.yml`** — deferred to M5 (consultation 2026-07-14, binding); veriloop stays
  npm-test-only; `claude plugin validate` is a release-checklist item, not a push gate.
- **No auto-merge / auto-land** — the owner gate holds; the loop pushes previews only
  (roadmap-v1.md:16, tier-scaled autonomy is post-1.0).
- **No drift-sentinel.md deletion** — flagged as possibly orphaned; owner decides (Step 3).
</content>
</invoke>
