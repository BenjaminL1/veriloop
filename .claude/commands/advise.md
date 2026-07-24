---
description: Use when the owner wants to brainstorm a feature or direction, sanity-check a design decision, weigh priorities, or pressure-test an idea BEFORE building — a consultation with veriloop's expert personas (code-review, security, drift) in ADVISE mode. The dialogue is inline; a MANDATORY read-only premise-council then pressure-tests the recommendation before it lands. Read-only; produces advice + tradeoffs, never a PASS/FAIL verdict (verdicts belong to /dev-loop).
---

Consult **veriloop's experts** on an idea — the DIALOGUE runs **inline, in the main
session** (brainstorming is a conversation), and a **read-only premise-council** then
pressure-tests your recommendation before you hand it back.

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
     (read-only commands like `git log` / `git diff` are fine). The council subagents
     inherit this — they review and report to you; they never edit or talk to the owner.
   - **NO VERDICTS** — you produce advice and tradeoffs, never PASS/FAIL/approval. A
     verdict belongs exclusively to the `/dev-loop` gate, and advice here NEVER
     substitutes for it.
4. **Converse to a DRAFT recommendation.** Present options with their tradeoffs and a
   recommendation; use **AskUserQuestion** for genuine forks. Treat this as a DRAFT — the
   council in step 5 pressure-tests it before it is final.
5. **Convene the premise-council — ALWAYS.** `/advise` guides direction, and the costliest
   errors here are PREMISE-level, not design-level — so before your recommendation lands,
   an independent council attacks it. This fires on every consult (the only skip is a pure
   factual lookup with no recommendation to test).
   - **Spawn each roster expert (code-review, security, drift) PLUS a dedicated PREMISE reviewer as parallel,
     read-only subagents.** Give each your draft recommendation + the question + where you
     grounded it. Each returns an INDEPENDENT brief — no coordination, no shared draft.
     - The **roster experts** attack the recommendation from their lens (correctness,
       security, drift), grounded in real `file:line`.
     - The **PREMISE reviewer's ONLY job** is to attack the FRAME, not the details:
       *Is this the RIGHT problem? What unexamined assumption is the recommendation — and
       the question itself — sitting on? What would FALSIFY it? Run it cold: would the
       owner ACCEPT the outcome?* It is explicitly allowed to **overrule the owner's
       framing AND your recommendation** — that is the point.
   - **One cross-examination round** — each sees the others' briefs and **attacks rather
     than concedes**. **Anti-sycophancy mandate:** a brief that just agrees with the owner,
     with you, or with another expert is a FAILED brief. Hard stop after two rounds.
   - **Synthesize (main session).** Reconcile into the FINAL recommendation. **If the
     council overturned your draft or found a premise-level flaw, say so PLAINLY** — the
     owner hears what the council found, never a laundered version. The council PROPOSES;
     it never decides and never emits a verdict — it sharpens the advice you give.
6. **Off-ramp.** If the discussion converges on a buildable feature, **hand off to
   `/dev-plan`** — it runs the recon + interleaved spec interview + expert council and
   leaves a ratified BINDING spec, which `/dev-loop` then builds.
