# Spec: `/dev-plan` ALWAYS-firing premise-rider (pre-mortem + dialectic)

**Feature (one line):** Port the genuinely-new premise moves from the `/advise` sharpeners
(v0.3.17) into `/dev-plan` as a **decoupled, always-firing rider** — a REQUIRED pre-mortem and
argue-the-other-side that run on every `/dev-plan` regardless of the `auto` council, surfaced at
ratification as CHALLENGES (never "cleared"). Steelman is deliberately NOT ported.

**Base branch:** `feat/dev-plan-premise-rider`, off `feat/advise-council-sharpeners` (HEAD
`7306e97`, v0.3.17) so the version chain and CHANGELOG stay continuous.
**Version:** `0.3.17` → `0.3.18`; six stamps agree.

---

## The Phase-4 verdict this implements

The owner asked whether the `/advise` sharpeners (pre-mortem, dialectic, steelman, anti-sycophancy)
should also go into `/dev-plan`. Verdict: **mostly no** — a same-model premise reviewer bolted onto
`/dev-plan`'s council (a) medicates the wrong organ (`/dev-plan`'s premise defense is the
**interview/elicitation**, not the council), and (b) has a **net-negative laundering mode** `/advise`
cannot have: "a premise council cleared it" sitting in front of `/dev-plan`'s **BINDING**
owner-ratification makes the owner *more* likely to rubber-stamp. Cross-model is the real lever but
is **not** a drop-in for `/dev-plan` (no diff/worktree; the `allowed-tools` allowlist would need
widening) — deferred. So port **only** the cheap genuinely-new bits, framed to defuse the laundering
mode.

**Owner fork (ratified 2026-07-24): auto council + always premise-rider.** The 3-expert council
stays on `council=auto` (default unchanged — proportionate, no fan-out on trivial specs), but the
premise moves are **decoupled** from it and fire ALWAYS. This closes the "`auto` skips
uncontested-wrong premises" hole (a wrong premise need not touch `high_risk_areas`, and the planner
won't flag the fork it is itself sitting on) without paying the always-council cost.

## What ships (edit ONLY `renderDevPlanCommand`, `render.mjs`)

- **`## Premise-rider — ALWAYS`** section between the council (Step 2) and Step 3. On **every**
  `/dev-plan` — even `council=off`, even when `auto` fires nothing — the **main session** runs two
  cheap solo moves against its own plan before writing the spec. Explicitly **not** the council and
  **not delegable** to a subagent.
  1. **Pre-mortem (REQUIRED)** — assume a year passed and the feature FAILED after the owner built
     on it; write the failure story backward from the wreck.
  2. **Argue the other side** — build the strongest case for NOT building this / the OPPOSITE; if it
     is not clearly weaker, say so.
- **Step 3 anti-laundering surfacing.** The pre-mortem failure story + opposite-case are recorded as
  open **RISKS** in the spec AND surfaced at ratification as UNRESOLVED **CHALLENGES**. They are
  **never** framed as "cleared" / "the council signed off" / "passed" — that framing is the exact
  laundering path that makes the owner rubber-stamp, so it is banned in the command text.
- **Council default stays `auto`** (asserted, so it is not accidentally flipped to `always`).
- **Steelman NOT ported** (asserted absent) — it collides with the anti-sycophancy mandate; the
  `/advise` version needed a careful "attack the STRONGEST version" framing this command lacks.

## Non-goals (explicit)

- Do NOT flip the council default to `always` (over-fires on trivial specs; owner chose `auto`).
- Do NOT add steelman or cross-model to `/dev-plan` (deferred / out of scope).
- Do NOT touch `renderAdviseCommand`, `PERSONA_HEAD`, `interview.json`, personas, or `/dev-loop`.
- Do NOT run `generate.mjs`. Re-render `dev-plan.md` SURGICALLY from the repo root:
  ```
  node -e "import('./scripts/lib/render.mjs').then(m=>require('fs').writeFileSync('.claude/commands/dev-plan.md', m.renderDevPlanCommand({repoName:'veriloop', roster:{experts:[{key:'code-review'},{key:'security'},{key:'drift'}]}, planModel:'opus'})))"
  ```
  (Params `planModel:'opus'` from `interview.json` `phase_models.plan`; no `questionCap` → the
  "NO fixed cap" branch — proven correct by a pre-edit byte-diff.)

## Acceptance criteria (gate = `npm run test` + `node scripts/lint-bundle.mjs --bundle .`)

1. `npm run test` passes, including NEW `/dev-plan` assertions for: the ALWAYS premise-rider
   (independent of the firing rule; fires even `council=off`), a REQUIRED pre-mortem,
   argue-the-other-side, the "never cleared" anti-laundering framing, `default \`auto\`` preserved,
   and steelman absent.
2. **Self-host guard:** a NEW selftest reads the repo's own `.claude/commands/dev-plan.md` and
   asserts it carries the premise-rider — same gap class as the v0.3.17 `/advise` roster guard, since
   the other `/dev-plan` assertions run against a tmp fixture and would stay green on a stale file.
3. `lint-bundle` on the self-host bundle stays exit 0.
4. `/advise`, `/dev-loop`, `PERSONA_HEAD`, `interview.json`, personas are UNCHANGED.
5. Six version stamps agree at 0.3.18.
6. Surgical: only `render.mjs`, `dev-plan.md`, `selftest.mjs`, the 5 version files, `CHANGELOG.md`,
   and this spec change (plus the pre-existing `dev-plan.md` reflow drift corrected by the re-render).

## Open RISKS (this spec's own premise-rider, per the discipline it ships)

- **Pre-mortem:** a year out, the rider fires on every `/dev-plan` but the main session treats it as
  a checkbox — writes a perfunctory pre-mortem and a strawman "other side," and the CHALLENGES it
  surfaces are noise the owner learns to skip past. Failure mode = the same theater the anti-sycophancy
  work exists to kill, now with more words. Mitigation lever (deferred): the **efficacy replay** below
  is the only real proof the moves catch anything a plain plan didn't.
- **Opposite case:** the strongest argument for NOT shipping this is that `/dev-plan`'s real premise
  organ is the **interview**, so effort should have gone there instead. It is not clearly stronger —
  the rider is cheap, decoupled, and closes a specific named hole the interview does not (a premise
  the planner is blind to, in a spec whose files miss `high_risk_areas`) — but improving elicitation
  remains the higher-value follow-up and is explicitly deferred, not dropped.

## Deferred / owner-gated

- **Improve `/dev-plan`'s interview elicitation** — the actual premise organ.
- **Cross-model council for BOTH `/advise` and `/dev-plan`** as one joint decision (which model,
  cost, always/opt-in), AFTER an **efficacy replay** that proves the premise moves catch something a
  same-model plan misses.
