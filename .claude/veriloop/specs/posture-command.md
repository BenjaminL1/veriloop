# Spec: /posture — emitted slash command to change a repo's default budget posture

> BINDING. Owner decisions (2026-07-16): emitted slash command (not a compiler-only
> affordance) · built via full /dev-loop. This command crosses the "bundle
> reconfigures itself" trust boundary the council flagged for /dev-plan — the
> security + drift lenses must scrutinize the write/regeneration path.

## What /posture is

A new emitted command `.claude/commands/posture.md`, rendered by a new
`renderPostureCommand` in `scripts/lib/render.mjs` (sibling of `renderCommand` :136 /
`renderAdviseCommand` :213). Runs INLINE in the repo it's installed in. It changes the
repo's **default** budget posture (the value baked into the bundle from
`interview.json`) — NOT a per-run override (`args.posture` on /dev-loop already does
per-run). Invoked:

- `/posture <level>` where `<level>` ∈ `frugal | balanced | max` — set the default.
- `/posture` (no arg) — show the current posture + the three valid levels + the
  resulting per-phase routing, change nothing.

## Behavior (the command body instructs the running agent to)

1. **Validate FIRST, before any write.** If `<level>` is not one of the three valid
   postures, print the valid set and STOP — never leave `interview.json` half-edited.
   (The valid set must match `BUDGET_PRESETS` keys in `generate.mjs:114`; the command
   text lists them literally — a build-time selftest pins that the emitted list equals
   the real preset keys so they can't drift, constitution rule 9.)
2. **Edit only one key.** In `$REPO/.claude/veriloop/interview.json`, set
   `budget_posture` to `<level>`. PRESERVE every other key byte-for-byte —
   `phase_models` (e.g. `{ "plan": "fable" }`), `cross_model`, `high_risk_areas`,
   `roster_add`, etc. Parse → set one field → serialize, or a targeted edit; never a
   blind rewrite that could drop keys.
3. **Regenerate via the sanctioned path.** Run the compiler the way SKILL.md does
   (`SKILL.md:128,172`): locate veriloop's compiler relative to the veriloop skill
   directory — `node <skill-dir>/../../scripts/generate.mjs --repo "$REPO" --commands
   "$REPO/.claude/veriloop/commands.json" --interview "$REPO/.claude/veriloop/interview.json"`.
   The command text must (a) locate the compiler portably (never a hardcoded absolute
   path — rule 7; find it the way the skill resolves its own dir), and (b) FAIL
   GRACEFULLY with a clear message if the compiler isn't reachable (e.g. bundle
   installed without the skill on disk) — telling the owner to regenerate manually,
   the `interview.json` edit having already succeeded so no state is lost.
4. **Report** the new posture and the resulting per-phase routing line (the same
   `plan=… implement=… …` line renderCommand emits at `render.mjs:143`), so the owner
   sees the effect without opening a file.

## HARD LIMITS block (mirror /advise's pattern, render.mjs:230-235 — it binds)

- **Write covenant:** writes exactly one key (`budget_posture`) in
  `$REPO/.claude/veriloop/interview.json`, then invokes the compiler which regenerates
  the machine-owned bundle (the normal, sanctioned regeneration — same files a
  documented re-run rewrites). NOTHING else: no code, no branches, no other config
  keys, never `constitution.md` / `experts/*` / `commands.json` / the manifest by
  hand, never `.env*`. The `interview.json` edit is a bounded, owner-authorized change
  to a hand-owned input; regeneration honors rules 8/9 (three-way merge, backups,
  splice markers) exactly as any re-run does.
- **Validation before mutation** (above) — a bad level changes nothing.
- **Portability (rule 7):** the emitted command text carries no absolute paths; it
  resolves the compiler relative to the skill dir.
- **No verdicts, no gate authority** — this is a config command, not a review surface.

## Frontmatter

- `description:` — when to use it (change the repo's default cost posture).
- `allowed-tools:` — scope to what it needs: `Read`, `Edit`, and `Bash(node:*)` (to run
  the compiler). Defense-in-depth; the HARD LIMITS text is the real covenant. (First
  emitted command that writes config — set the precedent narrowly.)
- NO `model:` line — posture-setting is mechanical, inherit the session model.

## Surface checklist (machine-owned — regenerate, never hand-patch)

- `scripts/lib/render.mjs`: new `renderPostureCommand`.
- `scripts/generate.mjs`: machine() emit of `.claude/commands/posture.md` (pattern at
  the dev-loop/advise/review emits ~:377); prettierignore machine-block list gains the
  path; VERSION bump (main is v0.3.4 → 0.3.5).
- `scripts/lint-bundle.mjs`: the emitted-command list is hardcoded in THREE places on
  main (`:60`, `:144`, `:198`). Add `posture.md` to all three. **KNOWN COLLISION:** the
  unmerged `feat/dev-plan-command` branch hoists these three into one `EMITTED_COMMANDS`
  constant and adds `dev-plan.md`; whichever merges second resolves by keeping the
  hoisted constant carrying BOTH `dev-plan.md` and `posture.md`. Expected, not a defect
  — note it in the run report.
- Manifest `emitted_files` gains the new command; regenerate the self-host bundle.
- `skills/veriloop/SKILL.md` (hand-owned — edit directly): its emitted-command
  enumeration must list `posture.md`. (Same doc-sync class as the dev-plan SKILL fix.)
- `README.md`: its command enumeration must list `posture.md` and the count phrasing
  updated (four → five commands once dev-plan also lands; on THIS branch dev-plan isn't
  present, so reconcile against what's actually on main — do not claim dev-plan exists).
- `docs/plans/roadmap-v1.md` note + CHANGELOG entry.

## Selftest (rule 3 — mirror the emitted-command assertion style, e.g. selftest.mjs dev-loop/advise blocks)

Assert at minimum: (a) `posture.md` is emitted; (b) its frontmatter carries the scoped
`allowed-tools` and NO `model:` line; (c) delete `posture.md` → lint-bundle FAILS
(command-presence check); (d) the emitted command's valid-level list equals the real
`BUDGET_PRESETS` keys (`generate.mjs:114`) — they must not drift (rule 9); (e) the
command body contains the validate-before-write instruction, the "preserve all other
interview keys" instruction, and the skill-relative compiler-locate + graceful-fail
instruction; (f) the lint-bundle command list (all three sites) includes `posture.md`.
Count must GROW from the run-time baseline (main = 170; capture fresh).

## Non-goals (binding)

- NO per-phase model/effort changes via this command — posture level ONLY. Changing
  `phase_models` (e.g. plan→fable) stays a manual interview edit / future feature.
- NO per-invocation behavior — `args.posture` on /dev-loop already covers one-offs.
- NO cross-repo operation — operates on the repo it runs in.
- NO new persona/mode, NO council, NO gate authority.
- NO hoisting the lint-bundle list (leave the three sites; add to each) — avoids a
  gratuitous second conflict shape with dev-plan beyond the unavoidable one.

## Acceptance

1. `npm test` green on the branch; count > 170; every new assert binds to emitted
   text/decisions, not narration.
2. `node scripts/lint-bundle.mjs` exit 0 on the regenerated self-host bundle; deleting
   `posture.md` makes it exit non-zero (proven by selftest).
3. The emitted self-host `.claude/commands/posture.md` exists, frontmatter correct;
   `/posture balanced` on a scratch repo edits only `budget_posture` (phase_models and
   all other keys intact — verify by diffing a fixture interview.json before/after the
   edit logic) and the regenerated routing line reflects the new posture.
4. Six version stamps agree at 0.3.5; `git status` clean on the branch after land.
