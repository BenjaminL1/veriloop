# Spec: constitution enforcer partition + rule attribution (injection test, phases 0–1)

**Feature (one line):** Answer "do the constitution's rules ever do anything?" by (1) partitioning all
10 rules by what actually rejects a violation *and whether that enforcer runs in this repo's gate*, and
(2) making a lens finding able to name the rule it fired on.

**Status:** DRAFT — NOT RATIFIED. Two premise challenges below are UNRESOLVED.

---

## Why this, and why not firing counts

The constitution is spliced into every persona's ground rules (`scripts/lib/render.mjs:36`, "a violated
invariant is a **BLOCKER**") and gates the plan before code exists
(`.claude/workflows/veriloop-dev-loop.js:342-348`, `constitutionOk`, halt at `:804-806`).

Measured: 3 recorded runs, **0 blockers**, 8 concerns — all 8 traceable to persona review dimensions
(`render.mjs:47-52`), none to a numbered rule.

**Zero firings is uninformative, not damning.** The plan agent reads the constitution (`:798`) and is
told to set `constitutionOk=false` rather than deviate (`:800`); the implementer builds to the plan. So
deterrence flows constitution → plan → code, and a *working* constitution produces zero blockers. Four
states — deterring, irrelevant, routed-around, vacuous — all emit 0. Counting harder cannot separate them.

The discriminating test is **catchability**: inject a violation per rule, assert that rule catches it.
That is phases 2–3 and is OUT OF SCOPE here. This spec builds only the partition (phase 1) and the
attribution substrate (phase 0).

## The partition (phase 1 — the primary deliverable)

Two columns, because "a script enforces it" and "that script runs here" are different claims.

| rule | enforcer | runs in this repo's gate? |
|---|---|---|
| 1 gate runs on real exit codes | `script` — `verdictFrom` (failed check → blocker; baseline probe is the only downgrade authority; fail-safe) | **yes** (inside the workflow) |
| 2 scripts own facts; LLM owns judgment | **`lens`** — nothing else | judgment only |
| 3 fix ships an assertion / fixture never supplies the evidence | **`lens`** — nothing else | judgment only |
| 4 nothing from `fixtures/hostile-ci/` is executed | `script` — selftest asserts | **yes** (`npm run test`) |
| 5 CI text is untrusted input | `script` — `detectors#isCleanInvocation` | **yes** |
| 6 safety tiers are law | `script` — `verify#plan` | **yes** |
| 7 emitted artifacts portable + secret-free | `script` — `lint-bundle#ABS` / `#FORBIDDEN` | **NO** |
| 8 ownership asymmetry is sacred | `script` — `generate` backup / machine / spliceBlock / handOnce | **yes** |
| 9 emitted config has one source of truth | `script` — `lint-bundle` gate-parity | **NO** |
| 10 branch + preview only | `structural` — the workflow contains no merge code path | n/a — unviolatable |

**The finding:** `gate_commands` is `["npm run test"]`. `lint-bundle` is never invoked by the gate, and
every `lint-bundle` call in the selftest targets a tmp bundle or a fixture — never the repo's own
`.claude/`. **Rules 7 and 9 are enforced by neither a running script nor a lens in this repo.** That is
worth more than the schema change below, and a single-column partition would have hidden it.

Net: 5 rules gate-enforced (1, 4, 5, 6, 8), 2 script-shadowed but unenforced here (7, 9), 2
judgment-only (2, 3), 1 structural (10). Total 10.

> **Arithmetic correction, 2026-08-17.** This line originally read "6 rules gate-enforced,
> 2 script-shadowed but unenforced here, 2 judgment-only, 1 structural" — which sums to 11
> for a 10-rule constitution. It was wrong when written, not overtaken by anything: the
> table directly above has five `yes` rows (1, 4, 5, 6, 8), not six. Rule 10's `n/a —
> unviolatable` was miscounted into the gate-enforced bucket while also being counted as
> structural. Fixed inline because a tally that does not add up is a typo, not a finding.

> **Superseded — 2026-08-17.** The headline finding above (`gate_commands` is
> `["npm run test"]`; rules 7 and 9 enforced by neither a running script nor a lens) was
> **TRUE WHEN WRITTEN and false about three minutes later.** This file was created
> 2026-07-29 18:17:04 -0700. `3bb6717` — *"feat(gate): lint joins veriloop's own compiled
> gate; regenerate the self-host bundle"* — landed 2026-07-29 18:19:54 -0700, two minutes
> fifty seconds after, and put `npm run lint` into `gate_commands`. The current manifest
> reads `[{ name: "lint", cmd: "npm run lint" }, { name: "test", cmd: "npm run test" }]`,
> and `package.json` maps `lint` → `node scripts/lint-bundle.mjs --bundle .` — `lint-bundle`
> run against the repo's own `.claude/`, which is precisely the invocation the finding said
> never happens. **Rows 7 and 9 flip their gate column to `yes` as of `3bb6717`**, on their
> named enforcers: `#ABS` (`lint-bundle.mjs:94`) and `#FORBIDDEN` (`:124-135`) for rule 7,
> the workflow/manifest gate-parity check (`:177-183`) for rule 9. Post-`3bb6717` the net is
> 7 gate-enforced (1, 4, 5, 6, 7, 8, 9), 0 script-shadowed-but-unenforced, 2 judgment-only
> (2, 3), 1 structural (10).
>
> The table and finding above are left as written, because "the partition's own headline was
> obsolete within three minutes of being written" is the more useful record. It also
> retires **R3** below (the `script:` annotation would no longer be false on the day it is
> written) and removes the load-bearing case for **D1**'s gate column — the column now
> reports `yes` for every `script:` row, so it distinguishes nothing here. Both are reasons
> the draft needs re-derivation before ratification, not patching.

## Decisions

- **D1 — the partition is recorded as a per-rule annotation in `constitution.md`**, beside the existing
  owner tag: `_(enforcer: \`script:lint-bundle#ABS\` · gate: \`no\`)_`. The gate column is part of the
  grammar, not an afterthought. Verified parser-safe: `lint-bundle.mjs:290` keys on the literal
  `owner:`, so a sibling annotation does not trip the ">1 owner tag" referee.
  **The owner applies these by hand** — `constitution.md` is hand-owned (`generate.mjs:412`, `handOnce`)
  and `/dev-plan` may not write it.
- **D2 — the enforcer annotation ships with a referee** in `lint-bundle.mjs` beside the orphan-rule
  check (`:294-305`): every numbered rule carries exactly one `_(enforcer:)_` tag, its `script:<file>#<sym>`
  target resolves, and `gate: yes` is only accepted when that file appears in the manifest's
  `gate_commands` chain. Without a referee the annotation joins the 7 dead citations already in that file.
- **D3 — PER-RULE VERDICTS, not a label on findings.** *(Corrected — the original D3 was an optional
  `rule` string on a finding. That only labels a finding the lens already chose to emit; a rule the lens
  never considered produces nothing to label, so "checked and clean" stays indistinguishable from
  "never looked" — the exact ambiguity this spec exists to remove.)*

  `LENS_SCHEMA` (`scripts/templates/dev-loop.template.js:121-124`) gains
  `ruleVerdicts: [{ rule: string, checked: boolean, violated: boolean }]`.
  Each lens returns one verdict per rule **it owns**. Silence becomes impossible: a rule with no verdict
  is a recorded gap, not an implied pass.

  **Scoped by ownership, so this is 10 verdicts per run, not 30.** `constitution.md` already carries
  `_(owner: \`key\`)_` per rule (code-review 1/2/10, security 4/5/6/7, drift 3/8/9), and
  `lint-bundle.mjs:290-305` already parses that grammar. No lens opines outside its beat.

  **How a lens learns which rules it owns: at RUNTIME, from the constitution it already loads.**
  Render-time derivation is impossible — `renderExpert(key, { repoName, stack, gate, constitutionPath,
  title })` receives the expert's key but no owner-tag data; the tags are hand-assigned in the
  constitution, not produced by the renderer. So the GROUND_RULES clause is generic and
  key-parameterised: *"return a `ruleVerdicts` entry for every numbered rule tagged
  `_(owner: \`<this expert's key>\`)_`."*

- **D3a — OPTIONAL in the schema, SOFT-REQUIRED by the verdict logic.** `ruleVerdicts` is not in
  `required`. A schema-validation failure collapses the entire gate fail-closed (`CHECK_SCHEMA` note,
  `:363-366`), so a hard requirement trades an ambiguity for an outage. Instead the verdict step records
  a gap when a lens returns findings but no `ruleVerdicts` — omission becomes *visible* rather than
  *fatal*. This is the load-bearing call in the spec and it is a deliberate weakening: a lens can still
  stay silent, it just cannot do so invisibly.

- **D4 — verdict data must reach the verdict, not only the record.** `dev-loop.template.js:343-344`
  builds `` const tag = `[${l.lens}] ${f.issue}` `` and discards everything else. The verdict step must
  additionally consume `ruleVerdicts` — surfacing `violated: true` as a blocker tag naming the rule, and
  a missing/`checked: false` verdict as a recorded coverage gap. Without this the field is write-only
  telemetry and answers nothing.
- **D5 — regeneration covers personas, not only the workflow.** The GROUND_RULES clause lives in
  `render.mjs`, and lenses read their persona from disk at runtime
  (`dev-loop.template.js:234`). `generate.mjs:405-407` re-renders `.claude/veriloop/experts/*.md`
  (`w.machine`). Regenerating only the workflow would leave every lens in veriloop's own loop
  un-instructed.
- **D6 — the plan gate keeps `constitutionViolations: string[]`** (`:348`); the plan agent is instructed
  to prefix entries `rule N: `. No schema change on the path that halts the entire run.

## Non-goals

- Phases 2–3: the injection fixtures themselves.
- A WARN severity tier — unimplementable; every persona hardcodes "a violated invariant is a **BLOCKER**".
- Citation liveness; fixing the 9 rotted citations.
- The docs-sync constitution write path (`veriloop-dev-loop.js:862`) and the review-tier gap
  (`security` fires only at `high`; `constitution` is not a `high` keyword). Both are open safety
  issues, both are separate changes.
- Adding `lint-bundle` to the gate. The partition *reports* that it is absent; changing it is its own
  decision with its own blast radius.

## Acceptance criteria (checked by the `/dev-loop` gate)

1. The repo's gate command passes and the selftest assertion count grows.
2. A lens result carrying `ruleVerdicts` validates, AND one omitting it also validates — proving the
   change is additive and cannot collapse the gate fail-closed.
3. Executed against the extracted verdict region (never by reading the template): a `ruleVerdicts` entry
   with `violated: true` produces a blocker tag naming that rule; a lens returning findings with NO
   `ruleVerdicts` produces a recorded coverage gap rather than a silent pass; a rule with
   `checked: false` is reported as unchecked, not as clean.
4. The emitted `.claude/workflows/veriloop-dev-loop.js` and all three `.claude/veriloop/experts/*.md`
   carry the change; a self-host guard asserts it on the COMMITTED files, mirroring the existing
   `/advise` and `/dev-plan` guards.
5. `lint-bundle` on the self-host bundle stays exit 0, and its new enforcer referee fails a fixture whose
   rule carries a `script:` target that does not resolve.
6. Six version stamps agree.

> **Superseded — 2026-08-17.** Six was right on 2026-07-29 and is wrong now: there are
> **seven** version stamps. `27d7ed8` (2026-07-31, *"fix(0.5.0): verification-sweep
> findings"*) added `.claude/veriloop/veriloop-manifest.json`'s `veriloop_version` to the
> lockstep assertion, taking `scripts/selftest.mjs` from "all six stamp locations" to "all
> seven" (`selftest.mjs:1297,1314-1317`). The seven are: `scripts/generate.mjs`
> `VERILOOP_VERSION`, `package.json`, `.claude-plugin/plugin.json`,
> `.claude-plugin/marketplace.json` ×2 (`metadata.version` and `plugins[0].version`),
> `.claude/veriloop/veriloop-manifest.json` `veriloop_version`, and the CHANGELOG's first
> versioned heading. This criterion must read *seven* if the draft is ever re-derived.

## OPEN RISKS — UNRESOLVED, carried from the premise-rider. Not cleared.

- **R1 (PRE-MORTEM).** A year on, `history/*.json` has a `rule` key and `constitution.md` has enforcer
  tags, and the owner still cannot answer the question — but now believes he can. `rule` was never
  populated because it is optional and nothing requires it; the enforcer tags rotted like the 7 dead
  citations already in that file. Phases 2–3 never shipped, because shipping 0–1 discharged the felt
  urgency and moved the item to "done." **Phases 0–1 are valuable only conditional on 2–3, and shipping
  0–1 makes 2–3 less likely, not more.**
- **R2 (ARGUE THE OTHER SIDE).** The measurement already exists and is free: 3 runs, ~19 findings, 0
  blockers, 0 constitution attributions — extractable by hand from a corpus small enough to read in
  full. Phase 1 is a paper audit needing no schema change, no regeneration, no stamps. The cheapest
  falsifier is **one single-rule injection**: put an absolute path into an emitted persona and run the
  existing lenses. If one says "rule 7", attribution is worth building; if none does, there is nothing
  to attribute and phase 0 is answered too. **The rider judged this case STRONGER than the plan, not
  weaker** — its sole advantage is that the sensor exists before the experiment, and that is dominated
  by the risk that the experiment never runs.
- **R3.** `_(enforcer: \`script:lint-bundle#ABS\`)_` would be **false on the day it is written** unless
  the gate column (D1) ships with it — `lint-bundle` does not run in this repo's gate. A partition that
  over-claims coverage is worse than none, because rules tagged `script:` get skipped when phase 2
  chooses fixtures.
- **R4.** Acceptance criterion 2 as originally drafted could only fail if the splice machinery broke —
  it would assert that `generate.mjs` copied a string. Criterion 3 exists to make the test able to fail
  for the reason the owner cares about. Constitution rule 3: *a fixture must never supply the evidence
  under test.*
