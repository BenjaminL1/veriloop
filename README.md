# veriloop

**Compile a tailored, self-verifying dev-loop for any repo.**

Point veriloop at a repository and it generates a bespoke engineering setup for
*that* repo:

1. **AI "expert" personas** — a baseline reviewer plus specialists nominated by the
   repo's actual danger surfaces (security, drift/parity, UX, …); they review in the
   gate, advise/brainstorm via `/advise`, and form an expert council in `/dev-plan`.
2. **A constitution** — the repo's invariants, each one code-cited.
3. **A per-feature dev-loop workflow** whose gate passes/fails on **REAL command
   exit codes** (your `typecheck` / `lint` / `test`), never the AI's self-assessment.
4. **Four slash commands:** `/dev-plan` (spec interview + expert council), `/dev-loop`
   (build loop), `/advise` (brainstorm), and `/review` (lint-only).

> **veriloop is a compiler; the dev-loop it emits is the compiled output.** It
> automates, for any repo, work that was first done once by hand for a Next.js +
> Supabase game monorepo — then generalized.

## Why it's different

Most "AI review" setups ask a model to *judge* whether code is good. veriloop
wires the model's gate to the **process exit codes of the repo's own commands**,
discovered deterministically from `package.json` / `Makefile` / `pyproject.toml`
**and cross-checked against CI (the ground truth)**. Scripts own the facts
(paths, commands, numbers, `file:line` citations); the LLM only handles judgment
(personas, invariants) — and every mined rule must cite real code.

The popular methodology plugins (superpowers et al.) *instruct* the agent to
verify its work — prose rules the model may or may not follow on any given turn.
veriloop **wires** the verification: the gate is generated code that runs your
repo's own commands and reads their exit codes, and the reviewers are compiled
*from your repo* (personas cite your actual danger surfaces; the constitution
cites your actual code), not generic best-practice essays. Instructions can be
ignored; exit codes can't.

## Install

veriloop ships as one public repo that is *also* its own plugin marketplace:

```bash
# as a skill
npx skills add BenjaminL1/veriloop

# or as a plugin (the repo is its own marketplace)
/plugin marketplace add BenjaminL1/veriloop
/plugin install veriloop@veriloop
```

Then, in the repo you want to set up:

```
/veriloop            # runs the pipeline against the current repo
```

## Five minutes to first gate

```bash
cd your-repo
claude                      # any Claude Code session
/veriloop                   # detect → verify → scan → interview (≤5 questions) → generate
/dev-loop fix the typo in the settings page header
```

That last command runs the full loop on a real (tiny) change: plan → isolated
worktree → implement → the gate actually runs your `typecheck`/`lint`/`test` and
reads the exit codes → pushes a preview branch → stops before merge. If a check
was already red on your base branch, the loop says `[pre-existing]` instead of
blaming your change.

## The pipeline (10 phases)

| # | Phase | Owner | What happens |
|---|-------|-------|--------------|
| 0 | Preflight | script | Detect a prior install via the manifest → Quick-Update vs re-interview; back up anything it touches. |
| 1 | **Detect** | script | Parse scripts / Makefile / pyproject **+ CI `run:` blocks** → `commands.json` with source citations, safety tiers, `verified_by_ci`. |
| 2 | **Verify** | script | Smoke-run per a safe-list: auto-run typecheck/lint; **ask** before test/build; **never** e2e/deploy; skip mutating formatters. |
| 3 | Deep scan | LLM | Classify the repo, HALT for confirmation, scan danger surfaces (resumable). |
| 4 | Mine constitution | LLM | Propose only code-verified invariants; ask 1–2 "why?" per rule. |
| 5 | Interview | LLM | ≤5 non-derivable questions (tiers, merge policy, lenses, waivers). |
| 6 | **Generate** | script | Slot-fill the portable template with verified commands + roster + tiers. |
| 7 | **Wire the gate** | script | The gate literally runs the verified commands; exit codes decide. |
| 8 | **Validate** | script + LLM | Lint every artifact; then a *fresh-context* agent drives the real loop. |
| 9 | Report + stamp | script | `veriloop-manifest.json`: version, repo SHA, roster, verification results. |
| 10 | Maintenance | script | Re-run regenerates only marked sections; three-way-merges the constitution. |

## Emitted bundle (plain files, into the target repo)

```
.claude/workflows/<repo>-dev-loop.js          the dev-loop workflow (exit-code gate)
.claude/commands/dev-plan.md                  the /dev-plan command (spec interview + council)
.claude/commands/dev-loop.md                  the /dev-loop slash command
.claude/commands/advise.md                    the /advise command (experts in ADVISE mode)
.claude/commands/review.md                    the /review command (lens review, no loop)
.claude/veriloop/commands.json                detected + verified command surface
.claude/veriloop/constitution.md              invariants (hand-owned; merged on re-run)
.claude/veriloop/experts/<name>.md            expert personas (machine-owned)
.claude/veriloop/experts/<name>.overrides.md  manual tweaks (hand-owned; never clobbered)
.claude/veriloop/specs/<slug>.md              feature specs (hand-owned, ratified by owner, git-tracked)
.claude/veriloop/veriloop-manifest.json       version, repo SHA, roster, verification
```

Emitted artifacts are **portable** — they resolve the repo root at run time via
`$CLAUDE_PROJECT_DIR` (falling back to `git rev-parse --show-toplevel`); no
absolute path is ever baked in.

## The emitted loop's shape

plan-vs-constitution review → risk triage (trivial / standard / high) → isolated
**worktree** implement → tiered **GO/NO-GO gate** (real typecheck/lint/test exit
codes + review-lens experts + screenshot gate on UI + optional cross-model second
opinion → **PASS / CONCERNS / FAIL / WAIVED**) → bounded auto-fix (≤3 passes, stop
on no-progress) → docs sync → push a branch/preview, **STOP before merge**. Waivers
are human-only — an agent may never waive its own finding. The cross-model second
opinion is **on by default** and can be disabled via the interview
(`cross_model: false`).

### Repo-specific gate checks (`extra_checks`)

Some real gate checks aren't portable commands (e.g. Torevan's Supabase security
advisor, which must run on any DB-touching change). The interview's `extra_checks`
restore them: each entry becomes an instruction the gate's **checks agent** runs
(scoped to the change's touched areas when `areaKeywords` is given), reported as a
pass/fail check alongside the exit-code checks. Without an `extra_checks` entry, the
generated loop does **not** reproduce such repo-specific checks that a hand-built
loop had — they must be declared through the interview.

## Locked design decisions

1. **Your edits win.** Re-runs regenerate only clearly-marked machine sections;
   hand-tuned personas / constitution are preserved, and drift is flagged.
2. **Bespoke + override.** Each expert is `<name>.md` (regenerable) **+**
   `<name>.overrides.md` (yours, never overwritten).
3. **Plain files only.** No plugin/hook magic in the emitted bundle — portable and
   inspectable.
4. **Auto-run safe-list.** Verify auto-runs typecheck + lint; asks before test /
   build; never auto-runs e2e / deploy / integration (real side effects). Verify
   runs commands with `CI=1` (deterministic, non-watch), which can make a
   warnings-as-errors toolchain verify **red** even when it is locally green — the
   stored failure tail shows the real output.

## Proven on two very different stacks

The deterministic spine is validated against two real repos; detection reproduces
the command surface an expert would map by hand, and every emitted bundle lints
clean (valid workflow syntax, portable paths, real gate):

| Repo | Stack | Detected gate | Roster |
|------|-------|---------------|--------|
| Torevan | TS + Next.js + Supabase monorepo (npm workspaces) | `npm run typecheck / lint / test` (+ `test:e2e -w @torevan/web`) | baseline, security, drift, ux |
| catan_rl_v2 | Python RL + Rust ext (maturin, Makefile-driven) | `make typecheck / lint / test-unit` (+ integration) | baseline, drift |

Note the compiler correctly reads CI as ground truth (catan's `make test-unit` is
what CI runs, not `make test`), promotes workspace-only signals (Torevan's
`has_ui` + `e2e` live in `apps/web`, not root), and cuts a jobless expert (catan
has no real security surface).

## Repo layout

```
.claude-plugin/plugin.json          plugin manifest
.claude-plugin/marketplace.json     the repo is its own marketplace
skills/veriloop/SKILL.md            the pipeline runbook (LLM orchestration)
scripts/detect.mjs                  phase 1 — command-surface detection
scripts/verify.mjs                  phase 2 — safe-list smoke-run
scripts/generate.mjs                phases 6/7 — generate + wire the gate
scripts/lint-bundle.mjs             phase 8 — artifact lint
scripts/selftest.mjs                deterministic self-test (asserts detect/verify/generate on fixtures)
scripts/templates/dev-loop.template.js   the portable workflow machinery
scripts/lib/                        detectors, parsers (toml/makefile/ci), roster, renderers
fixtures/                           fixture repos exercised by the self-test
```

Publishing is just `git push`. Requires Node ≥ 18.

## Status

**v0.3.3 — `/dev-plan` emitted command (spec interview + expert council)** enables
binding spec ratification before `/dev-loop` builds. The other two spec on-ramps shrink
(single-author principle): `/dev-loop` detects/confirms a spec; `/advise` hands off to
`/dev-plan` for a full spec interview + expert council. The council (existing roster in
ADVISE mode) runs independent briefs → one cross-examination round with an explicit
anti-sycophancy mandate → main-session synthesis (hard stop after two rounds). Specs are
hand-owned, git-tracked, owner-ratified as BINDING.

**v0.3.0 — deterministic spine complete and self-tested** (detect → verify →
generate → wire gate → lint, with a deterministic `scripts/selftest.mjs` over
fixtures). Interview answers persist in the manifest and shape the emitted loop
(cross-model on/off, extra high-risk areas, and repo-specific `extra_checks`). The
LLM-judgment layers (deep scan, constitution mining, interview, fresh-context
validation) are driven by `skills/veriloop/SKILL.md`.

Dogfooded on a real repo (see `docs/plans/m1-dogfood-report.md`), which added two
guarantees worth stating up front:

- **Installing veriloop never breaks the host repo's own gate.** Machine-owned
  files are exempted from the repo's format check via a marked block veriloop
  maintains in `.prettierignore` (and `.backups/` in `.gitignore`). Your own lines
  in those files are never touched.
- **A check that was already RED before your change does not block it.** When a
  gate check fails, the loop re-runs it against the base tree in a throwaway
  worktree: pre-existing failures become a `[pre-existing]` concern, while any
  *new* failure added on top of a red baseline still blocks.
- **Absent evidence never passes.** If a gate job (checks, a review lens, the
  screenshot) dies or is skipped, the loop FAILS closed — a verification that
  did not run cannot vouch for anything. Only a human waiver can downgrade it.
- **It asks before it builds — but only what it can't work out itself.** `/dev-plan`
  recons the code first, then conducts an interleaved spec interview (≤5 questions,
  skipped entirely when nothing is genuinely ambiguous) about scope, design forks, and
  acceptance criteria, convenes an expert council that pressure-tests the design, and
  leaves a spec you ratify as BINDING. The reviewers treat a silent deviation from an
  explicit decision as a blocker. `/dev-loop` detects or confirms the spec; the spec
  is upstream of the build loop.
- **The run summarizes itself, losslessly.** A final Report phase compresses the whole
  run *inside the loop* — deduplicating findings by **root cause** rather than repeating
  each one per reviewer, so three lenses converging on one bug reads as one finding with
  three signatures. It never drops a blocker, softens a severity, or invents a finding.
  You get a brief, not a transcript.
- **You choose the model for each phase.** `plan`, `implement`, `review`, `checks`,
  `fix`, `land`, `report` route independently — e.g. `{ plan: "fable", implement: "opus" }`, with
  the mechanical run-the-commands agent on `haiku`. `posture: frugal|balanced|max` is a
  one-word preset over the same map. Routing sets *how well each layer thinks*; it can
  never drop a check, a lens, or the baseline probe — the cost dial is not allowed to
  weaken the ground truth.
- **The experts advise as well as review.** The same personas that gate a change also power
  `/advise` (brainstorm/sanity-check/pressure-test an idea before building, in ADVISE mode)
  and `/review` (the lenses on a diff without the full loop). Both are read-only and carry
  **no verdict authority** — advice and findings never stand in for the dev-loop gate.

## License

MIT
