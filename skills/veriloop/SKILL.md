---
name: veriloop
description: >-
  Use when the user wants to "set up a dev loop", "add a review gate", "scaffold
  veriloop", or "generate a dev-loop / review pipeline" for a repo. Compiles a
  bespoke, self-verifying engineering setup for ANY repo: AI expert personas, a
  code-cited constitution of the repo's invariants, a per-feature workflow whose
  gate passes/fails on REAL command exit codes (never the AI's self-assessment),
  and four slash commands to drive it: /dev-plan (spec interview + expert
  council), /dev-loop (build loop), /advise (brainstorm), /review (lens-only).
---

# veriloop — compile a self-verifying dev-loop for any repo

**Mental model: veriloop is a compiler; the dev-loop it emits is the compiled
output.** It automates, for any repo, work already done once by hand (the Torevan
dev-loop). It emits **plain files** into the target repo:

```
.claude/workflows/<repo>-dev-loop.js     the dev-loop workflow (exit-code gate)
.claude/commands/dev-plan.md             the /dev-plan command (spec interview + council)
.claude/commands/dev-loop.md             the /dev-loop slash command
.claude/commands/advise.md               the /advise command (experts in ADVISE mode)
.claude/commands/review.md               the /review command (lens review, no loop)
.claude/commands/posture.md              the /posture command (set the repo's default budget posture)
.claude/veriloop/commands.json           detected + verified command surface
.claude/veriloop/constitution.md         the repo's invariants (hand-owned)
.claude/veriloop/experts/<name>.md       expert personas (machine-owned)
.claude/veriloop/experts/<name>.overrides.md   manual tweaks (hand-owned, never clobbered)
.claude/veriloop/specs/<slug>.md         feature specs (hand-owned, ratified by owner, git-tracked)
.claude/veriloop/veriloop-manifest.json  version, repo SHA, roster, verification results
```

## Non-negotiable principles

- **Scripts own facts; the LLM owns judgment.** Paths, commands, numbers, and
  file:line citations come from the deterministic scripts under `scripts/`. The
  LLM only decides personas, invariants, and roster — and every mined rule must
  cite real code.
- **Real exit codes gate — never "looks good".** The emitted gate literally runs
  the verified commands from `commands.json`; a nonzero exit is a BLOCKER.
- **Portable output only.** Emitted artifacts use `$CLAUDE_PROJECT_DIR` (falling
  back to `git rev-parse --show-toplevel`) — NEVER an absolute path.
- **Your edits win (asymmetric updates).** On re-run, machine sections regenerate;
  hand-owned files (`*.overrides.md`, `constitution.md`) are preserved / merged,
  never clobbered.
- **Never grade your own homework.** Validation runs the real commands and, in the
  full pipeline, uses a fresh-context agent — not the generator's self-report.

`SKILL_DIR` below = the directory containing this file. Scripts are at
`SKILL_DIR/../../scripts` (repo-root `scripts/`). Use `node <script>` (Node ≥18).

---

## The pipeline

Run these in order for the **target repo** `$REPO` (absolute path the user names,
or the cwd). Phases **1, 2, 6, 7, 8-lint** are deterministic scripts (built,
tested). Phases **3, 4, 5, 8-drive** are your judgment, described here.

### Phase 0 — Preflight
- If `$REPO/.claude/veriloop/veriloop-manifest.json` exists → this is a **re-run**.
  Read it. Compare its `repo_sha` to `git -C $REPO rev-parse HEAD`. If the repo has
  drifted a lot, say so. Offer **Quick-Update** (re-detect + regenerate machine
  sections only) vs **full re-interview**. Never overwrite hand-owned files.
- Anything you will overwrite is auto-backed-up by the scripts under
  `.claude/veriloop/.backups/<timestamp>/`.

### Phase 1 — Detect (deterministic)
```
node SKILL_DIR/../../scripts/detect.mjs --repo "$REPO" --out "$REPO/.claude/veriloop/commands.json"
```
Parses `package.json` scripts / `Makefile` targets / `pyproject.toml` tool tables
**and** CI `run:` blocks (CI = ground truth), reconciles them, and writes
`commands.json` with a `source` citation, `safety` tier, and `verified_by_ci` flag
per command, plus `stack`, `package_manager`, `has_ui`, `scopes`, and the full CI
record. Show the user the summary it prints. **Do not hand-edit the commands — if
one is wrong, it's a detector bug; fix the detector.**

### Phase 2 — Verify (deterministic, safe-list gated)
Auto-run the SAFE checks; ASK before slow ones; NEVER auto-run side-effecting ones.
```
# safe (typecheck/lint/format-check) auto-run; mutating formatters are skipped:
node SKILL_DIR/../../scripts/verify.mjs --repo "$REPO" --commands "$REPO/.claude/veriloop/commands.json"
```
- `safety=safe` → auto-run. `safety=ask` (test/build/install) → **ask the user
  first**, then re-run with `--include test,build`. `safety=never`
  (dev/e2e/integration/deploy) → never auto-run (real side effects, e.g. e2e may
  hit a live DB). Commands flagged `mutates` are never run.
- Verified commands get hard-wired into the gate; unverified ones are flagged (the
  gate still runs them for real, but with a "baseline may be red" note).
- **Run verify ONCE with the full `--include` set you intend to run.** Verify is
  last-run-wins: a later, narrower run **resets** the verification of any command it
  now skips (clears `verified`/`verify_exit`/tail, sets `verify_skipped`) so the
  record can never claim both "skipped" and "verified pass". This is by design (A6).

### Phase 3 — Deep scan (LLM, bounded, RESUMABLE)
1. Classify the repo type from `commands.json` + a quick read of `README`/`CLAUDE.md`
   + top-level layout. **Present the classification and HALT for the user to
   confirm** before scanning deeper.
2. At the confirmed depth, scan for danger surfaces (auth, DB/migrations, secrets,
   user input, UI, an oracle/golden reference, a published API, hot paths, deep
   domain logic). Write findings to `$REPO/.claude/veriloop/scan-notes.md` so the
   scan is resumable. Cite `file:line` for every surface.

### Phase 4 — Mine the constitution (LLM)
- Propose ONLY invariants you can VERIFY in the actual code + git history (skip
  framework-obvious rules). For each candidate, ask the user **1–2** serial "why /
  any exceptions?" questions.
- Write the result over the STARTER `constitution.md` (replace its `TODO` lines),
  in the style of the Torevan `docs/constitution.md`: short, true, each rule
  code-cited. On a re-run, three-way-merge — never clobber the user's edits.

### Phase 5 — Interview (LLM, ≤5 questions)
Ask ONLY non-derivable facts, as option-table questions with a recommended default:
risk-tier boundaries, merge/deploy policy, cross-model second opinion, the **budget
posture / per-phase model routing** (below), and any repo-specific gate checks that
aren't portable commands.

**Budget posture + model routing.** The emitted loop routes each phase group
(`plan`, `implement`, `review`, `checks`, `fix`, `land`, `report`) to its own model and
reasoning effort. `budget_posture` (frugal/balanced/max) picks a preset; `phase_models`
overrides any group individually — so "plan on Fable, build on Opus" is
`{"phase_models": {"plan": "fable", "implement": "opus"}}`. An unknown model, effort,
or group **fails the build** rather than dying mid-run. Routing changes only how well
each judgment layer thinks — it can NEVER drop a gate check, a review lens, or the
baseline probe. The cost dial must not be able to weaken the ground truth.

Write the answers to `$REPO/.claude/veriloop/interview.json` and pass that file to
the generator so they shape the emitted loop:
```
node SKILL_DIR/../../scripts/generate.mjs --repo "$REPO" \
  --commands "$REPO/.claude/veriloop/commands.json" \
  --interview "$REPO/.claude/veriloop/interview.json"
```
Schema (every field optional):
```
{ "cross_model": bool,              // default true; false disables the cross-model lens
  "high_risk_areas": string[],      // extra keywords appended to the high-risk tier
  "budget_posture": "frugal" | "balanced" | "max",   // default balanced; cost dial
  "phase_models": {                 // per-phase model — overrides the posture preset
    "plan"|"implement"|"review"|"checks"|"fix"|"land"|"report": "haiku"|"sonnet"|"opus"|"fable" },
  "phase_effort": {                 // per-phase reasoning effort
    "<same groups>": "low"|"medium"|"high"|"xhigh"|"max" },
  "extra_checks": [                 // repo-specific gate checks the checks agent runs
    { "name": string, "instruction": string, "areaKeywords"?: string[] } ],
  "roster_add": [              // add experts the detector missed — LLM-refined roster, owner-confirmed
    { "key": "security"|"drift"|"ux", "title"?: string, "tiers"?: string[],
      "evidence": string[] } ] } // evidence REQUIRED: what nominated this expert
```
Answers persist in the manifest's `interview_answers` and **merge** over prior
answers on every re-run — a re-run WITHOUT `--interview` keeps them; a re-run WITH
one overlays the new file. Answers are never silently reset.

`extra_checks` restores non-portable repo checks the gate would otherwise lose. An
entry runs inside the gate's checks agent, gated to the change's touched areas when
`areaKeywords` is given. Worked example — Torevan's Supabase security advisor on
DB-touching changes:
```json
{ "extra_checks": [
  { "name": "supabase-advisor",
    "instruction": "This change touches the DB: run the Supabase security advisor (MCP get_advisors, type security) and report pass (no new WARN/ERROR) or fail",
    "areaKeywords": ["db", "schema", "migration", "supabase", "rls", "sql"] } ] }
```

### Phases 6 + 7 — Generate + wire the exit-code gate (deterministic + LLM roster)
1. **Propose the roster and PAUSE for confirmation.** The generator detects a
   first-pass roster (baseline + specialists nominated by danger surfaces, capped
   at 4). Refine it with your scan: **every constitution rule must be owned by
   exactly one expert; every expert must own ≥ a few rules — cut jobless experts,
   keep only opposed mandates.** Present the roster + evidence; get a yes. Additions
   the scan justifies go into the interview file as `roster_add` (with evidence) so
   the generator actually applies them.
2. Generate the bundle:
   ```
   node SKILL_DIR/../../scripts/generate.mjs --repo "$REPO" --commands "$REPO/.claude/veriloop/commands.json"
   ```
   This slot-fills the portable template with the verified commands, the roster →
   lens map, risk tiers, and stack-specific worktree-deps setup; writes the
   workflow, the five commands — `/dev-plan` (spec interview + expert council),
   `/dev-loop`, `/advise` and `/review` (the experts' second mandate —
   advise + lens-review, read-only, no gate authority), plus `/posture`
   (change the repo's default budget posture) —
   STARTER personas + `.overrides` siblings, the STARTER constitution (only if
   absent), and the manifest. Machine files
   regenerate; hand files are preserved (use `--force` only to intentionally
   replace them).
3. **(Full pipeline) Enrich** the machine persona `.md` files with the bespoke,
   code-cited content from your scan (phase 3) so each reviewer knows this repo's
   real footguns — the generated persona is a functional default. Keep manual
   tweaks in the `.overrides.md` sibling.

### Phase 8 — Validate (never grade your own homework)
1. **Lint the artifacts (deterministic):**
   ```
   node SKILL_DIR/../../scripts/lint-bundle.mjs --bundle "$REPO"
   ```
   Fails on invalid workflow syntax, absolute paths, leftover placeholders, a
   dangling expert reference, missing command frontmatter, or an empty gate. It also
   rejects **harness-forbidden APIs** in the workflow (`Date.now`, `new Date`,
   `Math.random`, `process.*`, `require`, `import` — syntax-valid but banned at
   runtime) and **config↔file mismatches** (a roster expert whose persona file is
   missing, or a workflow whose wired gate doesn't match the manifest's
   `gate_commands`).
2. **(Full pipeline) Fresh-context drive:** spawn a NEW subagent with no memory of
   this build and have it run `/dev-loop` on one tiny real task, confirming the gate
   actually executes the commands and reports from exit codes. Do NOT drive it
   yourself.

### Phase 9 — Report + stamp the manifest
The generator already wrote `veriloop-manifest.json` (version, repo SHA, roster,
verification results, emitted files). Its `interview_answers` are exactly the
answers supplied via `--interview` (Phase 5); they **persist and merge** across
re-runs — a re-run without `--interview` keeps the prior answers, a re-run with one
overlays it. Present the final report: roster + evidence, the exact gate commands
(with verified/CI flags), any red baselines, and how to run `/dev-loop`.

### Phase 10 — Maintenance (re-run)
Re-run reads the committed manifest first, regenerates only marked machine
sections, three-way-merges the constitution, and never clobbers `.overrides.md`.

---

## The emitted dev-loop's proven shape (do not reinvent)

**spec detection (in the `/dev-loop` command, not the workflow; the spec itself is
authored upstream by `/dev-plan`)** → plan-vs-constitution
review → risk triage (trivial/standard/high) → isolated **worktree** implement → tiered
**GO/NO-GO gate** (real typecheck/lint/test exit codes + review-lens experts + screenshot
gate on UI + optional cross-model second opinion → **PASS / CONCERNS / FAIL / WAIVED**) →
bounded auto-fix (≤3 passes, stop on no-progress) → docs sync → push a branch/preview,
**STOP before merge** (owner gate). Waivers are human-only (`args.waive`); an agent may
never waive its own finding.

**Why the interview lives in a command, not the workflow:** the workflow's agents are
background subagents with **no channel to ask the owner anything**. So `/dev-plan` (main
session) does the recon, asks only the questions it cannot derive (≤5, skipped entirely
when nothing is ambiguous), convenes the expert council, and writes
`.claude/veriloop/specs/<slug>.md`, which the owner ratifies as BINDING. `/dev-loop`
detects or confirms that spec (a trivial change gets a confirm-and-go, not a second
interview) and passes it in as `args.spec`. The spec is then **binding**: the planner and
implementer build to it, and a review lens treats contradicting an explicit decision as a
BLOCKER.

## Guardrails
- Only touch the veriloop scripts and the target repo's `.claude/veriloop/**`,
  `.claude/workflows/<repo>-dev-loop.js`, the four emitted commands
  `.claude/commands/{dev-plan,dev-loop,advise,review}.md`, and the marked
  veriloop block in `.gitignore` / `.prettierignore` (owner lines outside the
  block are never touched).
- Never run a `safety=never` command during setup. Never auto-run a `mutates`
  command. Ask before `safety=ask`.
- Never write secrets into any emitted file. Never emit an absolute path.
