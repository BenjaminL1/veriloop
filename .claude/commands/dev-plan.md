---
description: Use when the owner wants to turn a feature idea into a BINDING spec for veriloop — recon first, an interleaved spec interview, then an expert council (code-review, security, drift) that pressure-tests the design before a spec is written and the owner ratifies it. Runs inline (the interview is a dialogue). Writes ONLY the spec, never code, and produces NO PASS/FAIL verdict (verdicts belong to /dev-loop).
model: opus
allowed-tools: Read, Grep, Glob, AskUserQuestion, Task, Write, Bash(git log:*), Bash(git diff:*), Bash(git show:*)
---

## About the `model:` frontmatter

This command declares `model: opus`. That is **turn-scoped**: it applies to
this command's turn only — your next typed prompt reverts to the session model, so a
multi-turn planning dialogue here is **not** pinned to `opus`. If `opus` is
unavailable the harness **silently falls back** to the session model (no error). A premium
value spends **that model's quota**, not the session's.

Plan a feature for **veriloop** and leave a ratified, BINDING spec — this runs
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
   when set, stop asking after N and proceed on best-effort defaults for the rest.
   Forks that co-arise are **coalesced into ONE AskUserQuestion call**, not asked serially.
   **If nothing is genuinely ambiguous, ask nothing** and go straight to the council. A
   trivial change should not trigger an interrogation.
3. **If you see a BETTER route than the one asked for, PROPOSE IT — do not just spec the
   owner's vision faithfully.** Distinct from the premise attacks below: those fire when the
   owner is WRONG; this fires when they are RIGHT and something still beats it. Raise it as a
   named ALTERNATIVE with the tradeoff, in the dialogue AND at ratification (Step 3). A better
   idea found while planning and dropped because it was not what was asked for is the most
   expensive kind of deference. Do NOT invent one: if the owner's route is best, say so.

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

## Premise-rider — ALWAYS (independent of the council firing rule)

The council fires on `auto` — proportionate, but **blind to premises**: a wrong premise
need not touch `high_risk_areas`, and the planner will not flag the design fork it is
itself sitting on. So `auto` skips the council in exactly the case a bad premise hides in.
To close that, on **every** `/dev-plan` — even `council=off`, even when `auto` fires
nothing — spawn **ONE read-only premise subagent** (Task) against your own plan before
writing the spec. It is **not** the council and never a substitute for it, and it is never
skipped. **Why a subagent and not you:** a fresh context cannot inherit the reasoning chain
that produced the plan, so it cannot be anchored by "we already settled that" — and you
grading your own plan is the one review configuration that reliably fails.

**Briefing — MINIMUM LEAK.** Give it EXACTLY two things, **VERBATIM, never summarized**: the
owner's request, and the plan you intend to spec. **Withhold everything else** — why you chose
it, what you already rejected, your confidence, your read of the risk, the owner's enthusiasm.
A named rejection pre-empts its analysis; signalled confidence tells it what to conclude.
A briefing that argues for the plan has already failed.

It returns two things, and you carry both back verbatim:
1. **Pre-mortem (REQUIRED).** Assume a year has passed and this feature FAILED after the
   owner built on it; the most likely failure story, backward from the wreck.
2. **Argue the other side.** The strongest case for NOT building this — or building the
   OPPOSITE; if that case is not clearly weaker, say so.
Carry both to ratification (Step 3) as **CHALLENGES** — under the anti-laundering rule there.

## Step 3 — Write the spec, then the owner ratifies it as BINDING

1. **Write the spec** to `.claude/veriloop/specs/<kebab-slug>.md`: the feature in one line,
   then the decisions made, the non-goals, and the acceptance criteria. Acceptance criteria
   reference the `/dev-loop` gate — they never carry runnable commands as authority (the
   gate's commands derive from `commands.json` only). **Record the premise-rider's pre-mortem
   failure story and the opposite-case as explicit open RISKS in the spec** — so the challenge
   persists into the binding artifact, not just this turn.
2. **Surface the premise CHALLENGES at ratification — never as "cleared."** Put the pre-mortem's
   top failure narrative and the strongest opposite-case in front of the owner as UNRESOLVED
   challenges in the ratification prompt itself. **Never** frame them as "cleared," "the council
   signed off," or "passed": a premise pass that reports "handled" in front of a BINDING
   ratification is a laundering path — it makes the owner MORE likely to rubber-stamp, not less.
   The owner ratifies in FULL VIEW of the open challenges, or sends the spec back. **If Step 1
   surfaced a better ALTERNATIVE route, restate it here too** — the owner should see it at the
   moment of the binding decision, not only when it came up mid-dialogue.
3. **The owner ratifies it as BINDING via AskUserQuestion** before it is final. The council
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
