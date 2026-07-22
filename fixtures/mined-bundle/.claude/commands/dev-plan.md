---
description: Use when the owner wants to turn a feature idea into a BINDING spec for mined-bundle — recon first, an interleaved spec interview, then an expert council (code-review, security, drift) that pressure-tests the design before a spec is written and the owner ratifies it. Runs inline (the interview is a dialogue). Writes ONLY the spec, never code, and produces NO PASS/FAIL verdict (verdicts belong to /dev-loop).
allowed-tools: Read, Grep, Glob, AskUserQuestion, Task, Write, Bash(git log:*), Bash(git diff:*), Bash(git show:*)
---

Plan a feature for **mined-bundle** and leave a ratified, BINDING spec — this runs
**inline, in the main session**, because the interview is a dialogue and background
agents cannot talk to you. `/dev-plan` is **upstream** of `/dev-loop`: it produces the
spec; `/dev-loop` builds to it.

> $ARGUMENTS

## Step 1 — Recon first, then interview interleaved with planning

1. **Recon first, cheaply.** Read the code the feature would touch and the relevant part
   of `.claude/veriloop/constitution.md`. Most of what you need is derivable — derive it.
   Note which files the feature touches: that set drives the council firing rule below.
2. **Interview interleaved with planning** — questions surface as design decisions arise,
   not as an up-front interrogation. Ask ONLY what you genuinely cannot derive: scope
   boundaries and explicit non-goals, a design fork with more than one defensible answer
   (where state lives, client vs server, which existing pattern to follow), user-visible
   specifics (copy, thresholds, edge-case behavior), and what "done" means (the check or
   test that would prove it). Use **AskUserQuestion**, each with a recommended default.
   Guardrails: **ask as many questions as you genuinely need** — there is NO fixed cap; the
   "ask ONLY what you cannot derive" discipline above is what keeps this bounded, not a number.
   The owner may cap it by passing **`questions=<N>`** in the invocation (e.g. `questions=3`);
   when set, stop asking after N and proceed on best-effort defaults for the rest. Forks that
   co-arise are **coalesced into ONE AskUserQuestion call**, not asked serially.
   **If nothing is genuinely ambiguous, ask nothing** and go straight to the council. A
   trivial change should not trigger an interrogation.

## Step 2 — Convene the expert council

The council is the repo's existing roster personas (code-review, security, drift) loaded in **MODE: ADVISE**
(read `.claude/veriloop/experts/*.md` + each `.overrides.md` sibling, the override winning
on conflict). This protocol is defined here and ONLY here — there is no separate council
persona mode.

**Firing rule — `council=auto|always|off`, default `auto`** (honored from the invocation
text, e.g. `council=off`):
- `auto` fires the council when EITHER (a) the **recon-touched files** match this repo's
  `high_risk_areas` (read from `.claude/veriloop/veriloop-manifest.json`, which carries it
  verbatim from the interview's `high_risk_areas` answer in `interview.json` — match against
  the FILES you are touching, never the request phrasing, which is evadable), OR (b) the
  planner hits a genuinely contested design fork. A trivial change fires nothing.
- `always` fires it unconditionally; `off` skips it (you still plan and write the spec).

**Protocol (hard stop after two rounds):**
1. **Independent positions.** Spawn each roster expert as a **parallel, read-only
   subagent** (Task). Each returns its own brief on the proposed design — no coordination,
   no shared draft.
2. **One cross-examination round.** Give each expert the others' briefs and have it
   **attack rather than concede**. **Anti-sycophancy mandate:** the experts must NOT
   blindly agree with the owner OR with each other — surface the real disagreement, name
   the tradeoff, defend or retract with reasons. A brief that just agrees is a failed brief.
3. **Synthesize.** The **main session** (not a subagent) reconciles the positions into a
   design recommendation. **Hard stop after these two rounds** — no third round.

The council **proposes**; it never decides. Only the owner stamps a spec BINDING (Step 3).

## Step 3 — Write the spec, then the owner ratifies it as BINDING

1. **Write the spec** to `.claude/veriloop/specs/<kebab-slug>.md`: the feature in one line,
   then the decisions made, the non-goals, and the acceptance criteria. Acceptance criteria
   reference the `/dev-loop` gate — they never carry runnable commands as authority (the
   gate's commands derive from `commands.json` only).
2. **The owner ratifies it as BINDING via AskUserQuestion** before it is final. The council
   proposes; **only the owner stamps BINDING.** Until the owner ratifies, the spec is a
   draft. (This severs the injection channel: repo text → generated personas → council →
   spec → background implementer prompts is a laundering path; owner ratification cuts it.)

## Step 4 — Off-ramp

Once the spec is ratified, offer to run **`/dev-loop`** with it — the ratified spec is the
binding `args.spec`, and `/dev-loop` builds, gates, and pushes a preview.

## HARD LIMITS

- **Write covenant.** You write **ONLY** `.claude/veriloop/specs/<slug>.md` (re-writing
  that same path while iterating is fine). **Never touch:** code, branches/worktrees,
  mutating git, `constitution.md`, `experts/*` (incl. `.overrides.md`), `interview.json`,
  `commands.json`, the manifest, `.claude/commands/*`, `.env*`. **No scratch files.** The
  council subagents are **read-only** (they inherit `/advise`'s contract) — **only the main
  session writes**, and it writes only the spec.
- **NO VERDICTS.** You produce planning advice and a proposed spec — never PASS / FAIL /
  approval. A verdict belongs exclusively to the `/dev-loop` gate; `/dev-plan` never
  substitutes for it.
- **Spec hygiene.** Relative paths only, no secrets, never paste `.env` contents into a
  spec. A spec carries decisions and acceptance criteria, not runnable commands as authority.
- **Ownership covenant.** Specs are session-authored and **hand-owned** — the generator
  NEVER regenerates `specs/`. The ratified spec is **git-tracked**: it is committed with
  the feature (or as a docs commit), **never gitignored**.
