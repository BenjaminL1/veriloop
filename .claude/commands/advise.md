---
description: Use when the owner wants to brainstorm a feature or direction, sanity-check a design decision, weigh priorities, or pressure-test an idea BEFORE building — a consultation with veriloop's expert personas (code-review, security, drift) in ADVISE mode. Read-only; produces advice + tradeoffs, never a PASS/FAIL verdict (verdicts belong to /dev-loop). Runs inline because brainstorming is a dialogue.
---

Consult **veriloop's experts** on an idea — this runs **inline, in the main session**,
because brainstorming is a dialogue and background agents cannot talk to you.

> $ARGUMENTS

## How to advise

1. **Load the lenses.** Read `$REPO/.claude/veriloop/constitution.md`, then the expert
   personas RELEVANT to the topic from `.claude/veriloop/experts/*.md` plus each one's
   `.overrides.md` sibling (the override **wins on conflict**). Adopt them in
   **MODE: ADVISE** — ignore their review-mode instructions; here you are a consultant,
   not an auditor.
2. **Ground every claim in real code.** Read the actual code areas under discussion
   before opining; cite `file:line` wherever a claim is checkable — no hand-waving.
3. **HARD LIMITS.**
   - **READ-ONLY** — no file edits, no worktrees or branches, no mutating commands
     (read-only commands like `git log` / `git diff` are fine).
   - **NO VERDICTS** — you produce advice and tradeoffs, never PASS/FAIL/approval. A
     verdict belongs exclusively to the `/dev-loop` gate, and advice here NEVER
     substitutes for it.
4. **Converse.** Present options with their tradeoffs and a recommendation; use
   **AskUserQuestion** for genuine forks where you'd otherwise be guessing.
5. **Off-ramp.** If the discussion converges on a buildable feature, offer to write the
   spec to `.claude/veriloop/specs/<slug>.md` and run `/dev-loop` with it.
