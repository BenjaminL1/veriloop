---
description: Use when the owner wants to change mined-bundle's DEFAULT budget posture (the cost/quality dial baked into the bundle) — set it to `frugal`, `balanced`, `max`, or show the current posture. NOT a per-run override (that is `args.posture` on /dev-loop); this rewrites the repo's default in `interview.json` and regenerates the bundle.
allowed-tools: Read, Edit, Bash(node:*)
---

Change **mined-bundle's default budget posture** — the cost/quality dial baked into the
emitted loop from `.claude/veriloop/interview.json`. This runs **inline, in this repo**.

> $ARGUMENTS

The valid levels are **frugal | balanced | max** (the only postures the compiler accepts).

## `/posture` (no argument) — show, change nothing

If `$ARGUMENTS` is empty:

1. Read `budget_posture` from `$REPO/.claude/veriloop/interview.json` (default `balanced`
   if the key or the file is absent).
2. Print the current posture, the three valid levels (**frugal | balanced | max**), and the resulting
   per-phase routing — read it verbatim from the `This repo's default routing` line in
   `$REPO/.claude/commands/dev-loop.md` (do NOT recompute the presets — that line already
   carries them). Change nothing and stop.

## `/posture <level>` — set the default

1. **Validate FIRST, before any write.** If `<level>` is not one of **frugal | balanced | max**, print the
   valid set and STOP. Never leave `interview.json` half-edited on a bad level.
2. **Edit only one key.** In `$REPO/.claude/veriloop/interview.json`, set `budget_posture` to
   `<level>`. **PRESERVE every other key byte-for-byte** — `phase_models` (e.g.
   `{ "plan": "fable" }`), `cross_model`, `high_risk_areas`, `roster_add`, `extra_checks`, … Parse
   the JSON → set the single field → serialize (or make a targeted edit to that one key). NEVER a
   blind rewrite that could drop keys. (An installed bundle always has `interview.json`; if it is
   genuinely absent, STOP and tell the owner to re-install — this command may not create it.)
3. **Regenerate via the sanctioned compiler.** Locate veriloop's compiler **relative to the
   veriloop skill directory** — the directory containing veriloop's `SKILL.md` (`scripts/` is at
   `<skill-dir>/../../scripts`). Resolve it the way the skill resolves its own dir; **never hardcode
   an absolute path.** Then run:
   ```
   node <skill-dir>/../../scripts/generate.mjs --repo "$REPO" \
     --commands "$REPO/.claude/veriloop/commands.json" \
     --interview "$REPO/.claude/veriloop/interview.json"
   ```
   **FAIL GRACEFULLY** if the compiler is not reachable (e.g. the bundle was installed without the
   veriloop skill on disk): report that `interview.json` **was already updated so no state is lost**,
   and tell the owner to regenerate manually once the skill is available. Do not fabricate a path.
4. **Report** the new posture and the resulting per-phase routing — read the regenerated
   `This repo's default routing` line from `$REPO/.claude/commands/dev-loop.md` (the compiler also
   prints `budget: posture=… — plan:… implement:… …` to stderr) so the owner sees the effect
   without opening a file.

## HARD LIMITS

- **Write covenant.** You write **exactly one key** (`budget_posture`) in
  `$REPO/.claude/veriloop/interview.json`, then invoke the compiler which regenerates the
  machine-owned bundle (the normal, sanctioned regeneration — the same files a documented
  re-run rewrites, honoring the three-way merge / backups / splice markers). **NOTHING else:** no
  code, no branches, no other `interview.json` keys, and never edit `constitution.md`,
  `experts/*`, `commands.json`, or the manifest by hand, never `.env*`.
- **Validation before mutation.** A bad level changes nothing.
- **Portability.** No absolute paths — resolve the compiler relative to the skill dir.
- **Node scope.** The ONLY node invocation permitted is the sanctioned `generate.mjs` compiler call
  above — never `node -e`, never an arbitrary script. `Bash(node:*)` is granted for that one command;
  the covenant, not the tool glob, is the real boundary.
- **No verdicts, no gate authority.** This is a config command, not a review surface.
