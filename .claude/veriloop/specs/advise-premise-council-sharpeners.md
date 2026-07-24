# Spec: sharpen the `/advise` premise-council (pre-mortem + dialectic + steelman)

**Feature (one line):** Add the genuinely-new red-team moves to the `/advise` premise-council —
a mandatory, surfaced **pre-mortem** and an **argue-the-other-side** lens, a **steelman-first**
framing that does NOT collide with the anti-sycophancy rule, and a light **step-4 dialogue
push-back** — plus a real gate guard on the emitted roster.

**Base branch:** `feat/advise-council-sharpeners`, off `feat/advise-premise-council` (which
carries the always-firing premise-council at v0.3.16 + the Phase-1 anti-sycophancy persona base).
**Version:** `0.3.16` → `0.3.17`; six stamps agree.

---

## ⚠️ This spec was OVERTURNED by its own council and rewritten. Read this first.

The owner asked to "fold four sharpeners into `/advise`" (the Fool's 5 named modes, steelman,
pre-mortem, standing anti-sycophancy). A `/dev-plan` council (premise + execution reviewers,
read-only, grounded) then **overturned most of it** — and building it as asked would be the exact
sycophancy the owner is trying to eliminate. What the council found, plainly:

1. **Three of the five "Fool modes" already exist** in `renderAdviseCommand` step 5
   (`render.mjs:251-255`): exposing the unexamined assumption (Socratic), "what would FALSIFY it"
   (falsify), and "attack the FRAME / overrule the owner's framing" (red-team). Re-labeling them as
   "new" is ceremony, not sharpening. Only **pre-mortem** and **argue-the-other-side (dialectic)**
   are genuinely new.
2. **Steelman-first collides with the anti-sycophancy mandate** two lines below it
   (`render.mjs:256-258`: "attack rather than concede… a brief that just agrees is a FAILED brief").
   A mandatory concession-first is a contradiction that yields theater — UNLESS it is framed as
   "attack the STRONGEST version," which is MORE adversarial, not less. Ship it only in that framing.
3. **The spec's original "landmine" was empirically FALSE.** A reviewer ran `generate` from the
   committed `interview.json` + manifest and got the correct **3-expert** roster with a
   **byte-identical** `advise.md`. The security-drop happens only on a COLD path (no `--interview`
   AND no prior manifest) that a worktree-off-HEAD never hits. Surgical re-render is still preferred
   — for **minimal blast radius**, NOT because generate corrupts the roster. (Keeping a false premise
   in a ratified spec is itself the error this feature exists to catch.)
4. **The real lever is cross-model, and it is DEFERRED to the owner.** Premise oversights survive a
   same-model council because every subagent shares the drafter's blind spots. `/dev-loop` has an
   optional cross-model second opinion (`render.mjs` `args.models`); `/advise` does not. No amount of
   added prose fixes monoculture. Adding a cross-model `/advise` council member is the highest-value
   follow-up — but it is a NEW capability needing an owner decision (which model, cost, always/opt-in),
   so it is OUT OF SCOPE here and raised in the morning `/advise` verdict instead.

## What ships (the defensible subset — RATIFIED on owner pre-authorization + council correction)

Edit ONLY `renderAdviseCommand` (`render.mjs:214-267`), INSERTING (never wholesale-replacing the
block that holds the contract strings):

- **Pre-mortem (REQUIRED, surfaced).** The premise reviewer must run a pre-mortem ("assume a year
  passed and this direction FAILED after the owner built on it; write the failure story backward")
  and the synthesis must ALWAYS surface its top failure narrative + the falsification.
- **Argue-the-other-side (dialectic).** The premise reviewer builds the strongest case for the
  OPPOSITE direction; if it is not clearly weaker, say so.
- **Steelman = attack the strongest version.** Add a sub-bullet: steelman first so you demolish the
  strongest form, "not a concession — the anti-sycophancy mandate stands." (Resolves finding 2.)
- **Step-4 push-back (light).** In the DRAFT dialogue: "Do not agree with the owner's framing to be
  agreeable — if the question rests on a premise you believe is wrong, say so HERE, before drafting."
  (Non-redundant: the persona-base rule binds the council subagents; this binds the MAIN session.)
- **Name, don't repeat, the 3 already-present modes** — one clause noting the frame-attack already
  covers assumptions/falsification/red-team, so the reviewer knows it is running named lenses without
  duplicated prose.

## Non-goals (explicit)

- Do NOT re-label the 3 existing modes as new prose blocks (ceremony — finding 1).
- Do NOT add cross-model to `/advise` (finding 4 — deferred to the owner).
- Do NOT touch `/dev-plan` (`renderDevPlanCommand`, `render.mjs:275-380`), `PERSONA_HEAD`
  (`render.mjs:29`), `interview.json`, or the personas. Stay inside `renderAdviseCommand`.
- Do NOT run `generate.mjs`. Re-render `advise.md` SURGICALLY, from the repo root:
  ```
  node -e "import('./scripts/lib/render.mjs').then(m=>require('fs').writeFileSync('.claude/commands/advise.md', m.renderAdviseCommand({repoName:'veriloop', roster:{experts:[{key:'code-review'},{key:'security'},{key:'drift'}]}})))"
  ```
  (Proven byte-identical to committed modulo the additions. Reason: minimal diff, not roster safety.)
- PRESERVE verbatim/contiguous (existing selftest matches them): `overrule the owner's framing AND
  your recommendation` (`render.mjs:254`, SOLE occurrence → `selftest.mjs:240`), `PREMISE reviewer`,
  `parallel, read-only subagents` (`render.mjs:246-247` → `selftest.mjs:241`),
  `Convene the premise-council — ALWAYS`, `Anti-sycophancy mandate`.

## Acceptance criteria (gate = `npm run test`)

1. `npm run test` passes, including the prior 3 `/advise` council assertions AND new ones for:
   the REQUIRED pre-mortem, its surfacing in synthesis, argue-the-other-side, the
   "attack the STRONGEST version / not a concession" steelman framing, and the step-4 push-back.
2. **Roster guard (closes the real gap the execution reviewer found):** a NEW self-host selftest
   assertion reads the repo's own `.claude/commands/advise.md` and asserts its spawn line names all
   three roster keys — **especially `security`** — so an accidental cold-generate that drops security
   and overwrites the committed file FAILS the gate (today it stays green: lint doesn't check roster
   size, the gate runs only `npm test`, and the other `/advise` assertions read a tmp fixture).
3. `lint-bundle` on the self-host bundle stays exit 0 with 3 experts.
4. `/dev-plan` is UNCHANGED.
5. Six version stamps agree at 0.3.17.
6. Surgical: only `render.mjs`, `advise.md`, `selftest.mjs`, the 5 version files, CHANGELOG.md, and
   this spec change.

## Deferred / for the morning `/advise` verdict

- **Cross-model `/advise` council member** (finding 4) — the real premise-diversity lever.
- **Efficacy replay** (premise reviewer's ask): replay a known premise miss through the old vs new
  prompt to prove the pre-mortem/dialectic catch something the old prompt didn't — the only real
  proof this isn't theater. Recommended before trusting the sharpeners; offered, not run overnight.
- Whether these moves belong in `/dev-plan` too (the owner's Phase-4 question).
