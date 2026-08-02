# veriloop

**Compile a tailored, self-verifying dev-loop for any repo.**

Point veriloop at a repository and it generates a bespoke engineering setup for
*that* repo:

1. **AI "expert" personas** — a baseline reviewer plus specialists nominated by the
   repo's actual danger surfaces (security, drift/parity, UX, …); they review in the
   gate, form an expert council in `/dev-plan`, and run the lenses in `/review`.
   (Brainstorming in `/advise` is the **domain expert's** job as of v0.5.0, not theirs.)
2. **A constitution** — the repo's invariants, each one code-cited.
3. **A per-feature dev-loop workflow** whose gate passes/fails on **REAL command
   exit codes** (your `typecheck` / `lint` / `test`), never the AI's self-assessment.
4. **Five slash commands:** `/dev-plan` (spec interview + expert council), `/dev-loop`
   (build loop), `/advise` (brainstorm), `/review` (lens-only), and `/posture`
   (the repo's default budget posture).

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
veriloop **wires** the verification instead: the commands are discovered from your
repo and baked into the gate, and the reviewers are compiled *from your repo*
(personas cite your actual danger surfaces; the constitution cites your actual
code), not generic best-practice essays.

Precisely what that buys, stated without overclaiming. The checks are your real
commands and the numbers are their real process exit codes — but a subagent runs
them and reports the integer back through a fixed schema, so this narrows what the
model is trusted for rather than eliminating it: from *"is this code good?"* down to
*"what number did the command print?"* What is **not** a judgment call is the
verdict: `verdictFrom` is a pure function the harness executes over those reported
results, it fails closed when any scheduled check is missing, and only a human can
waive a blocker. The selftest extracts that function out of the emitted artifact and
runs it against a case table, so the decision logic is tested rather than described.

## How it compares

Rows are the axes veriloop is built around, so read this as positioning rather than an
even-handed survey — a table whose dimensions the author chose is an argument, not a
benchmark. Sources checked 2026-07-29; each claim links the primary source it came from.

| | **veriloop** | **`/init`** <sup>[1]</sup> | **Spec Kit** <sup>[2]</sup> | **aider** <sup>[3]</sup> | **CodeRabbit** <sup>[4]</sup> |
|---|---|---|---|---|---|
| **Gate built per repo** | commands parsed from `package.json` / Makefile / `pyproject.toml` and reconciled against CI, each with a `source` citation and a safety tier | writes a `CLAUDE.md` guide; no gate | — the docs describe specs, plans and task lists, not command detection | you supply the commands (`--lint-cmd`, `--test-cmd`) | not its layer |
| **Code-cited constitution** | rules carry `file:line` anchors, and the selftest fails if a citation stops resolving | conventions in prose | `/speckit.constitution` produces governing principles as markdown | — | — |
| **What decides a verdict** | your commands' real exit codes, reported through a schema, then aggregated by a pure fail-closed function with human-only waivers | nothing decides; it is a context file | — no execution described | non-zero exit from your lint/test command triggers a fix attempt | LLM review of the diff |
| **Where it sits** | upstream, pre-PR: plan → gate → preview branch, stops before merge | session start | upstream, pre-development | upstream, in the edit loop | PR-time, plus a CLI and IDE surface |

**Claims discipline.** Exit-code-driven correction is not new and veriloop does not claim it.
**aider already does this** — *"Aider will try and fix any errors if the command returns a
non-zero exit code"* <sup>[3]</sup> — and Claude Code's own `Stop` and `PostToolUse` hooks can
gate a session on a real command. What veriloop adds is narrower: it **derives** the command
surface for a given repo instead of asking you to name it, cross-checks it against CI, and
compiles the reviewers and invariants from that repo's own code. The aggregation being a
tested pure function with fail-closed semantics is the second half. Neither is a new idea
about running commands.

<sup>[1]</sup> <https://code.claude.com/docs/en/commands> — *"Initialize project with a `CLAUDE.md` guide."*
<sup>[2]</sup> <https://github.com/github/spec-kit> — constitution → specify → plan → tasks → implement, emitted as markdown.
<sup>[3]</sup> <https://aider.chat/docs/usage/lint-test.html> — `--lint-cmd` / `--test-cmd` / `--auto-test`.
<sup>[4]</sup> <https://docs.coderabbit.ai/> — PR reviews plus a pre-commit CLI and IDE extensions.

Cells marked "—" are ones the tool's own documentation does not claim; they are gaps in the
public docs as read on the date above, not measured absences.

## What veriloop runs

veriloop runs commands it finds in *your* repo, so here is the whole policy. Every detected
command is assigned a safety tier (`scripts/lib/detectors.mjs`, `DEFAULT_SAFETY`), and
Phase 2 honors it (`scripts/verify.mjs:54`):

| tier | categories | what happens |
|------|-----------|--------------|
| **safe** | `typecheck`, `lint`, `format` | auto-run during verify |
| **ask** | `install`, `test`, `test_single`, `build` | **skipped** unless you include it explicitly (`--include test`) |
| **never** | `dev`, `e2e`, `bench` | never auto-run — real side effects |
| *`mutates`* | any formatter without `--check` | **refused** — it would rewrite your tree |

Commands run with `CI=1` so they are deterministic and non-watching. A command whose text
contains command substitution, backticks, or environment expansion is **never adopted at
all** (`isCleanInvocation`, `scripts/lib/detectors.mjs:627`). Every entry in the generated
`commands.json` carries a `source` citation naming the file and line it came from, so you can
audit what veriloop decided and why.

There is **no telemetry** — nothing about you is reported anywhere, ever. But **three**
deliberate network paths exist and are worth knowing about before you install: `/advise` may
use `WebSearch`/`WebFetch` to check a claim against a source; the optional cross-model second
opinion passes your diff to the `codex` CLI at `high` tier when enabled; and, new in 0.5.0,
the **domain reference library fetches sources during setup**, choosing them from a model's
reading of your private repo and marking `VERIFIED` only what a four-host allowlist admits. All
three are documented — with what the opt-out actually is, and is not, and the known
weaknesses — in
**[SECURITY.md](./SECURITY.md)** — which also covers the threat model, a known `npx`
look-alike limitation, and how to report a vulnerability. veriloop never suggests
`--dangerously-skip-permissions`.

## Install

veriloop ships as one public repo that is *also* its own plugin marketplace:

```bash
# as a skill
npx skills add BenjaminL1/veriloop

# or as a plugin (the repo is its own marketplace)
/plugin marketplace add BenjaminL1/veriloop
/plugin install veriloop@veriloop
```

**Pin it.** Releases are tagged `veriloop-vX.Y.Z`, and for anything you rely on you should
install a tag or a commit SHA rather than tracking a branch — a tool that runs your commands
should not change under you silently:

```bash
npx skills add BenjaminL1/veriloop#veriloop-v0.5.0
```

The version in `.claude-plugin/plugin.json` is canonical (it wins over marketplace-entry
versions at install time); `package.json`, both `marketplace.json` fields, `VERILOOP_VERSION`
in `scripts/generate.mjs`, and the top `CHANGELOG.md` heading are kept in lockstep, and the
self-test fails if they disagree. Tagging currently lags the version stamps — the CHANGELOG
is authoritative.

Then, in the repo you want to set up:

```
/veriloop            # runs the pipeline against the current repo
```

## First gate — what is measured, and what is not

```bash
cd your-repo
claude                      # any Claude Code session
/veriloop                   # detect → verify → scan → interview (≤5 questions) → generate
/dev-loop fix the typo in the settings page header
```

**How long that takes is only partly known, and this section says which part.** The
deterministic spine — `detect → verify → generate → lint-bundle` — completed in **14s** on a
clean clone against a real third-party repo (`docs/demo/quickstart-check.sh`, m5 exit
criterion 4). The LLM phases you actually run first are **unmeasured end to end**: the deep
scan, constitution mining, the ≤5-question interview, and since 0.5.0 the domain audit with
its network source verification. Nothing here times them, so no total is published. (Through
0.4.x this heading promised a first gate in five minutes. No measurement ever supported that
number, m5 logged the criterion as NOT MET, and the domain audit widened the gap — so it was
retired rather than re-estimated.)

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
| 7.5 | Domain audit | LLM + script | Classify the repo's field on tiered, cited evidence (HALT on low confidence); build a three-category reference library, host-allowlisted and verified over the network; emit the advisory domain persona. |
| 8 | **Validate** | script + LLM | Lint every artifact; then a *fresh-context* agent drives the real loop. |
| 9 | Report + stamp | script | `veriloop-manifest.json`: version, repo SHA, roster, verification results. |
| 10 | Maintenance | script | Re-run regenerates only marked sections; hand-owned files are preserved untouched. |

## Emitted bundle (plain files, into the target repo)

```
.claude/workflows/<repo>-dev-loop.js          the dev-loop workflow (exit-code gate)
.claude/commands/dev-plan.md                  the /dev-plan command (spec interview + council)
.claude/commands/dev-loop.md                  the /dev-loop slash command
.claude/commands/advise.md                    the /advise command (domain expert, N stances)
.claude/commands/review.md                    the /review command (lens review, no loop)
.claude/commands/posture.md                   the /posture command (set the repo's default budget posture)
.claude/veriloop/commands.json                detected + verified command surface
.claude/veriloop/constitution.md              invariants (hand-owned; preserved on re-run)
.claude/veriloop/experts/<name>.md            expert personas (machine-owned)
.claude/veriloop/experts/<name>.overrides.md  manual tweaks (hand-owned; never clobbered)
.claude/veriloop/specs/<slug>.md              feature specs (hand-owned, ratified by owner, git-tracked)
.claude/veriloop/domain.json                  the domain audit's answers (hand/LLM-owned, git-tracked)
.claude/veriloop/domain/audit.md              field classification + vocabulary + architecture (machine-owned)
.claude/veriloop/domain/expert.md             the advisory domain persona (machine-owned)
.claude/veriloop/domain/expert.overrides.md   manual tweaks (hand-owned; never clobbered)
.claude/veriloop/domain/references.json       the verified three-category reference library (machine-owned)
.claude/veriloop/session-routing.md           the SessionStart routing payload (machine-owned)
.claude/veriloop/session-start.mjs            the SessionStart hook script (machine-owned)
.claude/settings.json                         registers the hook (starter; PRESERVED if you already have one)
.claude/veriloop/veriloop-manifest.json       version, repo SHA, roster, verification
```

Emitted artifacts are **portable** — they resolve the repo root at run time via
`$CLAUDE_PROJECT_DIR` (falling back to `git rev-parse --show-toplevel`); no
absolute path is ever baked in.

**On the `SessionStart` hook, plainly.** It injects `session-routing.md` at the top of a
session to **bias** routing toward `/advise` and `/dev-plan`, and to ask the model to say
plainly when this block — rather than you — is why it entered a veriloop command.
**`/dev-loop` is deliberately NOT a routing destination**: it is reached only through
`/dev-plan`, which decides how much process a change gets and can hand a genuine one-liner
straight through with a cited danger surface — the gate runs either way. That table used to
route to `/dev-loop` directly, and "fix the typo in README line 40" went into a full
worktree + gate + lens + auto-fix drive with no proportionality valve anywhere.
It is prose in a context window: it raises the odds the model routes and announces, it
cannot compel either, and both commands stay invocable by hand regardless. Two things worth
knowing before you keep it.
**It does not arbitrate with anyone else's hook** — if you also run a skill pack that
injects its own `SessionStart` block (superpowers does), you get both at full strength and
nothing resolves a disagreement between them. And **the disable path is all-or-nothing**:
deleting the `SessionStart` entry from `.claude/settings.json` removes the routing for both
commands at once.

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
3. **Portable, plain, inspectable files — and, since 0.5.0, one hook.** The bundle may ship
   a `SessionStart` routing hook, so *"no hook"* no longer holds and is not claimed. The
   retired text claimed the emitted files were **portable and inspectable**; *"no hook"* is
   the only part being retired — **both of those still hold, and neither is being dropped
   quietly.** Every emitted file is a plain file you can read, diff and delete, and none of
   them bakes in an absolute path: the portability scan now covers the emitted `.mjs` too,
   so the new file class is held to the same rule as the rest of the bundle. The hook is a
   markdown payload (`.claude/veriloop/session-routing.md`) plus a ~20-line dependency-free
   node script that resolves the repo root from `${CLAUDE_PROJECT_DIR}` —
   nothing minified, nothing compiled, no runtime installed. The boundary is
   **preserve-or-write**: `.claude/settings.json` is written only if you do not have one,
   and if you do, veriloop **never merges or edits it** (absent `--force`, which overwrites
   every hand-owned file after a backup) — it prints a complete hook-only settings.json for
   you to merge the `SessionStart` entry out of. Disable by deleting that entry, or the whole
   file (it takes both routes with it; there is no partial disable).
4. **Auto-run safe-list.** Verify auto-runs typecheck + lint; asks before test /
   build; never auto-runs e2e / deploy / integration (real side effects). Verify
   runs commands with `CI=1` (deterministic, non-watch), which can make a
   warnings-as-errors toolchain verify **red** even when it is locally green — the
   stored failure tail shows the real output.

## See it catch something

`docs/demo/make-demo.sh` generates a tiny broken app with four seeded defects, each tripping
a different signal — an off-by-one that fails `test`, a type error that fails `typecheck`, an
unused binding that fails `lint`, and a `innerHTML` footgun that **passes all three** and is
only visible to a reviewing lens.

```bash
bash docs/demo/make-demo.sh /tmp/veriloop-demo   # builds it outside this tree
bash docs/demo/replay.sh    /tmp/veriloop-demo   # re-runs it, diffs against the record
```

The captured output and real exit codes are in
[`docs/demo/gate-record.md`](./docs/demo/gate-record.md); `replay.sh` re-executes every
command and fails if any recorded exit code stops reproducing. The demo repo itself is not
yet published — publishing is part of the launch step.

**There is no recorded screencast yet.** A recorded `/dev-loop` run needs a live interactive
session, so what is published is the machine-verifiable half above rather than a
reconstruction. The runbook for capturing a real one is
[`docs/demo/dev-loop-capture.md`](./docs/demo/dev-loop-capture.md).

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
SECURITY.md                         threat model, safety tiers, network paths, reporting
```

Every script is in-repo, dependency-free and meant to be read — there is no `curl | bash`
step and no code is downloaded or minified: what you clone is what runs. **Setup is not
network-free, though.** Since 0.5.0 the domain phase fetches the reference sources it stores
(host-allowlisted, `SECURITY.md` §3), so an install does reach the network — for *data*, not
for code. Note the condition, because the intuitive guess is backwards: the fetch is Phase 7.5
of the *skill*, not anything in `scripts/`, and it runs when `.claude/veriloop/domain.json` is
**absent** (a first install) or `--refresh` is asked for. An existing `domain.json` is what
suppresses it. One reader's note: `selftest.mjs` is
the outlier at ~3,200 lines. It is a flat sequence of independent assertion blocks with
section banners rather than a deep call graph, so it reads top-to-bottom; start at the banner
for the behavior you care about.

**On the skill directory name.** The skill lives at `skills/veriloop/`, which means the plugin
form is the slightly redundant `/veriloop:veriloop`. That is deliberate: the standalone skill
name is the thing `npx skills` users type and see, so it stays `veriloop` rather than being
renamed or hoisted to the plugin root to tidy up a namespace prefix.

Publishing is just `git push`. Requires Node ≥ 18.

## Status

**v0.5.0 — the domain subsystem (all three phases).** A new advisory path,
`.claude/veriloop/domain/`, ships an audit that classifies the repo's field on tiered,
cited evidence; a domain-expert persona; and a three-category reference library whose every
entry's verification status is recomputed by a script — the status the entry *claims* is
discarded, and only a four-host allowlist plus a 200 can yield `VERIFIED`. That recomputation
is narrower than it sounds and the docs say so: the HTTP result and the `attempted_at` stamp
are reported by the verification subagent, nothing in `scripts/` fetches, so no deterministic
component re-checks them. **The persona is a REPO expert, not a field expert, and that is
mechanical rather than promised:** the renderer appends a **script-owned repo-evidence
section** after whatever persona text the model authored — what the repo is, its stack and
declared dependencies with citations, its architecture and data flow, and the tier evidence
behind the classification — re-rendered from the audit's own already-cited evidence plus the
generator's `domain_facts` block. The model never authors it, so it cannot drop, soften or
reword it, and every citation in it is resolved against the tree at generate time and
re-resolved at gate time. **Advisory only:** it is not
a reviewing lens, not in the roster, and has no gate authority. Setup now reaches the
network for the first time, which retires three published no-network claims; see
[`SECURITY.md`](./SECURITY.md) §3, which states the new path, the allowlist, the offline
behavior, and the three known weaknesses. Three length caps came out by owner decision — four
assertions deleted outright, three narrowed to their surviving trigger-first half, two
`lint-bundle` WARN checks removed; the gate went 253 → 464 and `CHANGELOG.md` names every
removal individually. The one cap the owner later wanted back came back as a **prompt**: a
re-render of `domain/expert.md` more than 20% longer than the size recorded in
`veriloop-manifest.json` makes `generate` ask you to re-read the file. It has no ceiling and
never changes an exit code. **Phase 2 also ships:** `/advise` now consults that domain expert as
its **sole lens**, seated four times under different stances (`RESEARCH`, `PRACTICE`,
`FIELD`, `SKEPTIC`) plus the dedicated PREMISE reviewer — and every
seat's prompt names `domain/expert.md` **and** `domain/expert.overrides.md`, the owner's only
lever on that persona. **The stance seats need that persona installed.** With no
`.claude/veriloop/domain/expert.md` — the state of every bundle generated before this release,
because a missing `domain.json` makes the domain writer a no-op — `/advise` has **zero lens
seats** and degrades to the PREMISE reviewer alone. The command says so, `lint-bundle` WARNs
(exit 0), and the emitted description names both paths. `code-review`, `security` and `drift` no longer advise and are
review-only, so their persona header now names `/dev-plan`'s council as the ADVISE-mode
loader instead of `/advise` — a **deviation from a ratified Non-goal**, made by the
implementing orchestrator rather than the owner and recorded for confirm-or-revert in
`.claude/veriloop/specs/domain-expert-persona.md`. `/advise` also stopped loading the constitution — **that surface
only**; `/dev-plan`, `/review` and the gate all still read it, and assertions pin both the
committed files and the templates they are rendered from. (`/posture` never loaded it — its
only mention is a write prohibition, and it is guarded as exactly that.) **Phase 3 ships
too:** a `SessionStart` hook that **biases** the session toward `/advise`, `/dev-plan` and
`/dev-loop` — three plain files, a `<SUBAGENT-STOP>` guard so no council seat or review lens
inherits the routing, and preserve-or-write on `.claude/settings.json` (an existing one is
never merged; a complete hook-only settings.json is printed for you to merge the
`SessionStart` entry out of). The payload also **asks** the session to announce a hook-routed
invocation in its reply — naming the command, and distinguishing it from you typing that
command yourself — and to note the fired command and its provenance in the session's working
notes; the gate asserts the payload carries those instructions, and nothing asserts the model
obeyed them, because nothing observes a reply. It cannot compel invocation, nothing
arbitrates it against another pack's `SessionStart` block, and deleting the entry disables
both routes at once. Locked decision #3 was rewritten rather than deleted (T5), and the
unmeasured five-minute quickstart claim was retired for the measured 14s spine plus an
explicit statement that the LLM phases are unmeasured (T10).

**v0.4.0 — launch machinery (partial).** veriloop's own gate is now enforced rather than
remembered: `.github/workflows/ci.yml` runs `npm run lint` + `npm run test` on push and PR
across node 18/20/22, with both actions pinned by commit SHA. `lint-bundle` joined the
compiled gate, so `/dev-loop` now runs the enforcer for constitution rules 7 and 9. Nine dead
`file:line` citations in the constitution were repaired and a selftest assertion now fails the
build when any citation stops resolving. `LICENSE` and [`SECURITY.md`](./SECURITY.md) exist
for the first time. **Two launch items are open:** there is no recorded `/dev-loop` screencast
(it needs a live interactive session — see
[`docs/demo/dev-loop-capture.md`](./docs/demo/dev-loop-capture.md)), and the five-minute
quickstart is measured only for the scripted half — `detect → verify → generate → lint`
completes in ~14s on a clean clone against a real third-party repo, while the LLM phases
(deep scan, constitution mining, interview) are unmeasured end to end. Details in
`docs/plans/m5-plan.md`.

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
  weaken the ground truth. `/posture <level>` changes the repo's **default** posture
  (a per-run override is still `args.posture` on `/dev-loop`).
- **Two read-only surfaces beside the gate.** The personas that gate a change also power
  `/review` (the same lenses on a diff, without the full loop). `/advise`
  (brainstorm/sanity-check/pressure-test an idea before building, in ADVISE mode) runs the
  **domain expert** instead — one persona seated once per stance, plus a PREMISE reviewer.
  Both surfaces are read-only and carry **no verdict authority** — advice and findings never
  stand in for the dev-loop gate.

## License

MIT
