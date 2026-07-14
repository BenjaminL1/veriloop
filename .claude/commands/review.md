---
description: Use when the owner wants the repo's expert lenses on uncommitted or recent changes WITHOUT running the full dev-loop — a quick lens-only review of veriloop's working-tree diff or a named commit range. Read-only and ADVISORY: findings are tagged BLOCKER/SHOULD-FIX/NIT, but this is NOT the gate and produces no verdict. A few lens agents, ~10x cheaper than a full drive.
---

Run **veriloop's expert lenses** over a change — no plan, no implement, no gate:

> $ARGUMENTS

## Step 1 — Determine the change to review

Review the **uncommitted working-tree diff** (`git diff` plus `git status --porcelain`
for new/untracked files), OR the commit range the owner names in `$ARGUMENTS` (e.g.
`main..HEAD`). If there is nothing to review, say so and stop.

## Step 2 — Spawn the lenses (parallel, read-only)

Spawn the roster's experts as **parallel read-only agents** — `code-review`, `security`, `drift`. Each loads its
persona (`.claude/veriloop/experts/<name>.md`) + its `.overrides.md` sibling (the
override **wins on conflict**) + `.claude/veriloop/constitution.md`, reviews the diff in
**MODE: REVIEW**, and returns findings tagged `BLOCKER` / `SHOULD-FIX` / `NIT` with
`file:line`.

## Step 3 — Merge by ROOT CAUSE

Merge the findings **deduped by ROOT CAUSE**: when several experts describe one
underlying defect, that is **ONE** finding listing every expert that raised it — never
the same issue repeated once per lens.

## Hard limits

- **Read-only.** No edits, no worktrees/branches, no mutating commands. Do **not**
  auto-fix anything.
- **Advisory, NOT the gate.** This produces **no verdict**; passing `/review` **never**
  substitutes for the `/dev-loop` gate. It is a cheap second look, not sign-off.
- It does **not** run the real exit-code checks (`npm run test`) —
  only the `/dev-loop` gate does. `/review` is lenses only.
