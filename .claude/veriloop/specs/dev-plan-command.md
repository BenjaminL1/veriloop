# Spec: /dev-plan — the fourth emitted command (plan + interleaved interview + expert council)

> BINDING. Design settled by owner direction + expert council (run `wf_ac345280-c35`,
> 3 lenses × 2 rounds + frontmatter fact-check, 2026-07-15). Owner forks resolved:
> **specs git-tracked** · **council=auto (tier-scaled)** · **dev-loop trivial path =
> confirm-and-go**. Do not relitigate these.

## What /dev-plan is

A new emitted command, `.claude/commands/dev-plan.md`, rendered by a new
`renderDevPlanCommand` in `scripts/lib/render.mjs` (sibling of renderAdviseCommand `:213`).
It runs INLINE in the main session (dialogue needs AskUserQuestion — never `context: fork`).
Invoked `/dev-plan <feature description / goals>`. It:

1. **Recons first** (read the code the feature touches + the constitution), then conducts
   the spec interview **interleaved with planning** — questions surface as design decisions
   arise. Guardrails: **NO fixed question cap** (owner decision 2026-07-16 — superseded the
   original ~5 cap; the "ask ONLY what you cannot derive" discipline is the bound, not a
   number); the owner may pass an optional **`questions=<N>`** budget in the invocation to
   cap it. Co-arising forks are **coalesced into one AskUserQuestion call**; the line "if
   nothing is genuinely ambiguous, ask nothing" is preserved.
2. **Convenes the expert council** — the repo's existing roster personas loaded in their
   existing **ADVISE mode** (the council protocol is defined ONCE in dev-plan.md; NO third
   persona mode, NO PERSONA_HEAD/renderExpert changes). Protocol: independent positions
   from each roster expert (parallel read-only subagents), then ONE cross-examination round
   where each sees the others' briefs and must attack rather than concede (anti-sycophancy
   mandate stated explicitly — the experts must not blindly agree with the owner OR each
   other), then the main session synthesizes. Hard stop after two rounds.
   **Firing rule:** `council=auto|always|off`, default auto, honored from the invocation
   text. Auto fires when (a) recon-**touched files** match the repo's `high_risk_areas`
   (from the generated config — match against files, not the request phrasing, which is
   evadable), or (b) the planner hits a genuinely contested design fork. Off for trivial.
3. **Writes the spec** to `.claude/veriloop/specs/<kebab-slug>.md` — and the owner
   **ratifies it as BINDING via AskUserQuestion** before it is final. The council proposes;
   only the owner stamps BINDING. (This is the injection cut: repo text → machine-generated
   personas → council → binding spec → background implementer prompts is a laundering
   channel; owner ratification severs it.)
4. **Offers the off-ramp**: run `/dev-loop` with the ratified spec.

## HARD LIMITS block (mirror /advise's pattern, render.mjs:230-235 — it demonstrably binds)

- **Write covenant:** writes ONLY `.claude/veriloop/specs/<slug>.md` (re-writes of that same
  path during iteration allowed). Never-touch list, stated explicitly: code, branches/
  worktrees, mutating git, `constitution.md`, `experts/*` (incl. `.overrides.md`),
  `interview.json`, `commands.json`, the manifest, `.claude/commands/*`, `.env*`. No scratch
  files. Council subagents inherit /advise's read-only contract — **only the main session
  writes**.
- **NO VERDICTS** — planning advice and a proposed spec, never PASS/FAIL; verdicts belong
  to the /dev-loop gate.
- **Spec hygiene** (rule 7, stated in the command text since lint-bundle never scans
  runtime-authored specs): relative paths only, no secrets, never paste `.env` contents.
  Specs never carry runnable commands as authority — acceptance criteria reference the
  gate, whose commands derive from `commands.json` only (rule 9).
- **Ownership covenant** (stated in the command text): specs are session-authored,
  hand-owned, NEVER regenerated (generate.mjs must continue to never touch `specs/`), and
  **git-tracked** — the ratified spec is committed with the feature (or as a docs commit),
  never gitignored.

## Frontmatter (fact-checked against Claude Code docs)

- `description:` — when to use it (mirroring the /advise description style).
- `model:` — emitted **only when** `interview.json` `phase_models.plan` is set (today:
  `"fable"`, interview.json:4); value emitted verbatim from the interview key; **when the
  key is absent, emit NO model line at all** (inherit session model). Never a hardcoded
  fallback — rule 9, one source of truth. The command BODY must document the fact-checked
  semantics: turn-scoped (the owner's next typed prompt reverts to the session model — a
  multi-turn planning dialogue is NOT pinned), silent graceful fallback when the model is
  unavailable, and that a premium value spends that model's quota.
- `allowed-tools:` — ship on /dev-plan ONLY (the M5 trust-pack precedent, first emitted
  command with a narrower-than-everything contract): Read, Grep, Glob, AskUserQuestion,
  the subagent tool (Task/Agent — implementer verifies the canonical name in current Claude
  Code), Write, and read-only Bash patterns (`Bash(git log:*)`, `Bash(git diff:*)`,
  `Bash(git show:*)`). Defense-in-depth; the HARD LIMITS text remains the real covenant.
  Do NOT retrofit allowed-tools onto advise/review in this change.

## Companion edits (the other two spec on-ramps shrink — single-author principle)

- **dev-loop.md Step 1 → spec detection** (rewrite in renderCommand, render.mjs:151-170):
  spec provided/exists → binding, proceed; absent + feature is trivial → **confirm-and-go**
  (present a one-line spec and confirm it via one AskUserQuestion — confirmation, NOT a
  second interview; zero duplicated question-prose); absent + non-trivial → point to
  /dev-plan. The `args.interview=false` / unattended-run passthrough (render.mjs:170) is
  PRESERVED unchanged — regenerated Torevan/catan bundles must not break any existing
  invocation pattern. Amend the dev-loop frontmatter description (render.mjs:147) to match
  the new shape.
- **advise.md off-ramp** (render.mjs:238-239): "offer to write the spec and run /dev-loop"
  → "hand off to /dev-plan". Pin the NEW handoff text in the selftest (the old text was
  never pinned; the new one must be).

## Surface checklist (machine-owned artifacts — regenerate, never hand-patch)

- `scripts/lib/render.mjs`: new `renderDevPlanCommand`; renderCommand Step 1 rewrite +
  description amend; renderAdviseCommand off-ramp edit.
- `scripts/generate.mjs`: machine() emit of `.claude/commands/dev-plan.md` (pattern at
  :377-381); prettierignore machine-block list (:403 area) gains the new path; VERSION bump.
- `scripts/lint-bundle.mjs`: the command list `['dev-loop.md','advise.md','review.md']` is
  hardcoded in **THREE** places (`:60`, `:144`, `:198` — verified by council). Hoist to ONE
  shared constant (rule 9) and add `dev-plan.md`.
- Manifest `emitted_files` gains the new command; regenerate the self-host bundle.
- `docs/plans/roadmap-v1.md`: document the fourth emitted command; note the M3 phase-5
  orthogonality (phase 5 finalizes the generator's INSTALL interview; /dev-plan supersedes
  dev-loop Step 1's FEATURE interview — different interviews); amend any dev-loop
  description quotes. CHANGELOG entry.

## Selftest (rule 3 — mirror the v0.3.0 dual-mandate block, selftest.mjs:199-246)

Assert at minimum: (a) dev-plan.md is emitted; (b) frontmatter carries `model:` when a tmp
interview sets `phase_models.plan` AND omits the line when unset (both directions); (c)
delete dev-plan.md → lint-bundle FAILS (mirroring :241-246); (d) the prettierignore
machine-block contains the new path (assert at :234 area); (e) the advise off-ramp handoff
text is pinned; (f) dev-loop Step 1's spec-detection text is pinned (spec-present, trivial
confirm-and-go, and pointer branches all present); (g) the council protocol text carries
the anti-sycophancy mandate and the read-only-council + owner-ratifies-BINDING covenants;
(h) the lint-bundle command list is a single constant covering all four commands.
Count must GROW from the run-time baseline (capture fresh; main is at 119).

## Version note

Patch bump from the version found at execution (`generate.mjs:24`; main = 0.3.2). KNOWN
COLLISION: two open previews (attestation, rust-detector) already claim 0.3.3 — whichever
merges later gets rebased by the owner; expected, not a defect.

## Non-goals (binding)

- NO changes to the dev-loop WORKFLOW template's plan phase (the background planner stays;
  /dev-plan is upstream of it, not a replacement).
- NO persona file changes, NO third persona mode, NO PERSONA_HEAD edits.
- NO allowed-tools retrofit on advise/review. NO M3 install-interview work. NO council
  seats beyond the existing roster ("no jobless experts" also means no invented ones).
- NO scratch/staging files from /dev-plan; NO gitignoring of specs/.

## Acceptance

1. `npm test` green; count > baseline; every new assert binds to emitted text/decisions.
2. `node scripts/lint-bundle.mjs` exit 0 on the regenerated self-host bundle; deleting
   dev-plan.md makes it exit non-zero (proven by selftest, not narration).
3. Self-host `.claude/commands/dev-plan.md` exists with correct frontmatter (veriloop's own
   interview.json sets `phase_models.plan: "fable"` → the emitted file carries a model line).
4. Version stamps agree; `git status` clean on the branch after land.
