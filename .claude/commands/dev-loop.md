---
description: Run the veriloop per-feature dev loop (detect/confirm the spec → plan → risk-tiered gate → bounded auto-fix → push a preview) on an isolated branch, stopping before merge for owner sign-off. For a full spec interview + expert council on a non-trivial feature, run /dev-plan first to produce the binding spec.
---

Run the **veriloop dev-loop** for this feature:

> $ARGUMENTS

## Step 1 — Spec detection (you do this, BEFORE invoking the workflow)

The workflow's agents run in the background and **cannot ask the owner anything**, so the spec
must be settled HERE, by you, now — before the loop starts. The full spec interview lives in
`/dev-plan` now; `/dev-loop` only DETECTS or CONFIRMS a spec, it no longer runs an interview.

1. **Spec provided or already on disk?** If `args.spec` is set, or a spec for this feature exists
   under `.claude/veriloop/specs/`, treat it as **BINDING** and proceed to Step 2. The planner and
   implementer build to it, and the review lenses treat contradicting an explicit decision — or
   quietly dropping something the spec requires — as a **BLOCKER**.
2. **No spec, and the change is trivial?** **Confirm-and-go:** present a **one-line spec** (the
   feature in a sentence plus the acceptance check) and confirm it with a **single AskUserQuestion**
   — this is a confirmation, **NOT a second interview**. On confirmation, write it to
   `.claude/veriloop/specs/<kebab-slug>.md`, pass it as `args.spec`, and proceed. A trivial change
   should not trigger an interrogation.
3. **No spec, and the change is non-trivial?** **Stop and point the owner to `/dev-plan`** — that
   command runs the full recon + interleaved spec interview + expert council and leaves a ratified
   BINDING spec. Re-invoke `/dev-loop` once the spec exists. Do **not** run a spec interview here.

Skip spec detection entirely when the owner says so (`args.interview = false`, or an unattended
run): proceed with `args.feature` as the only intent.

## Step 2 — Invoke

Invoke the `veriloop-dev-loop` workflow with `args = { feature: "$ARGUMENTS", spec: "<the spec>" }`.

It then runs autonomously on a dedicated **git worktree + branch** (never the owner's main checkout):

1. **Plan-review** — design the smallest correct slice **to the spec**; the baseline reviewer checks it
   against `constitution.md`. If the plan violates an invariant, it stops and reports instead of coding.
2. **Risk triage** — classifies the change (trivial / standard / high) so gate depth scales with risk.
3. **Implement** in the worktree.
4. **GO/NO-GO gate** — REAL `npm run test` that must actually pass (exit codes decide), plus the
   review lenses (code-review, security, drift) and an optional cross-model second opinion. A failing check is re-run
   against the base tree, so a **pre-existing** red check is a concern, not a blocker — but a NEW failure
   stacked on a red baseline still blocks. Emits **PASS / CONCERNS / FAIL / WAIVED**.
5. **Bounded auto-fix** — on FAIL, fixes blockers and re-runs, up to **3 passes**, stopping early if it
   stops making progress.
6. **Docs sync**, then **push the branch + leave a preview**.

It **STOPS before merge/deploy** — that is the owner gate.

## Options

- `args.dryRun = true` — run everything, stop before the push.
- `args.waive = ["substring", ...]` — human waiver: downgrade a matching blocker to WAIVED. An agent
  may never waive its own finding.
- `args.spec = "..."` — the spec from step 1 (binding on the planner, implementer, and reviewers).
- `args.posture = "frugal" | "balanced" | "max"` — the cost dial. Shifts the model + reasoning effort of
  each phase. **It never removes a check, a lens, or the baseline probe** — the exit-code gate is ground
  truth, not a budget line.
- `args.models = { plan: "fable", implement: "opus", ... }` — per-phase model, overriding the posture.
  Groups: `plan`, `implement`, `review`, `checks`, `fix`, `land`. Models: `haiku`, `sonnet`, `opus`,
  `fable`. So "plan on Fable, build on Opus" is `{ plan: "fable", implement: "opus" }`.
- `args.effort = { plan: "xhigh", ... }` — per-phase reasoning effort (`low`…`max`).

This repo's default routing (posture `balanced`): plan=opus · implement=opus · review=opus · checks=opus · fix=opus · land=opus.

## When it returns

The workflow already compressed itself: `result.brief` is a deduplicated, lossless summary written
inside the loop (headline · what changed · findings merged by ROOT CAUSE with the lenses that agreed ·
what landed · what you must decide). **Present `brief` — do not re-summarize it.** It was compressed
once, by an agent that had the full evidence; compressing it again only loses more. Render it as prose
+ the findings, add the branch/preview from `result.land` and the `result.routing` line, and say
nothing the brief does not support. Then **wait for explicit merge/deploy sign-off.**
