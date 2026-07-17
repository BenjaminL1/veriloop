# Spec: Evidence-bundle auto-emission (m2-plan Step 5, veriloop-repo slice)

> Extracted verbatim-strength from `docs/plans/m2-plan.md` "Step 5" (committed @ 2787a6d,
> adversarially reviewed). This spec is BINDING. Unattended overnight drive: no owner
> questions are answerable mid-run — if a genuine fork appears, pick the plan's stated
> default and flag it in the report.

## Problem (verified in m2-plan)

The emitted loop builds the full `evidence` object (`scripts/templates/dev-loop.template.js:486-506`)
but never writes it to disk — only summarized into `brief` and returned (`:507-520`, return `:523`).
No `.claude/veriloop/history/<ts>.json` attestation record is produced. Promised at
`docs/plans/roadmap-v1.md:135-136`; deferred by M1 (`docs/plans/m1-dogfood-report.md:86-89`);
discharged now as the M1 carryover completing the evidence spine.

## Deliverables (veriloop repo ONLY — cross-repo bundle recommits are the owner's merge-time step)

1. **Template emission.** In `dev-loop.template.js`, after the report phase, write ONE
   redacted attestation record to `$REPO/.claude/veriloop/history/<ts>.json` (mkdir -p).
   Schema (superset of the existing `evidence` fields; see m2-plan Step 5 for the sketch):
   `ts, feature, repo, tier, baseSha, headSha, verdict, checks[{name,command,exit,tail}],
   baselineProbe|null, screenshots[], screenshotVerdict, fixPasses, blockers[], concerns[],
   land{sha,pushed,branch}|null`.
2. **Redaction (BINDING — constitution rule 7, `.claude/veriloop/constitution.md:37-39`).**
   Before writing, redact every free-text field (`checks[].tail`, screenshot paths,
   implementer summary, lens findings): replace the repo root with `$REPO`, normalize
   screenshot paths to repo-relative, and DROP any line still matching the lint-bundle
   absolute-path regex `/(\/Users\/|\/home\/[a-z]|\b[A-Z]:[\\/])/` (`scripts/lint-bundle.mjs:88`).
   No env/secret spew; never echo `.env*` content.
3. **Records are committed, not gitignored** (justified in m2-plan: the attestation log IS
   the track record the autonomy ladder feeds on). They are runtime output — NOT added to
   the manifest's `emitted_files`.
4. **Selftest (constitution rule 3).** Follow the executed-extracted-logic precedent
   (`scripts/selftest.mjs:339-349` executes the extracted verdict logic): extract the
   emission+redaction routine and execute it against a SYNTHETIC evidence object (the
   fixture must never supply the evidence under test). Assert: (a) exactly one
   `history/*.json` written; (b) parses as JSON with the required keys; (c) zero matches
   of the rule-7 absolute-path regex; (d) a poisoned input (tail containing `/Users/x` and
   `C:\Users\x`) comes out clean. Assertion count must GROW from the run-time baseline
   (currently 119 — capture fresh, do not hardcode).
5. **Self-host regeneration.** Bump `VERILOOP_VERSION` (`scripts/generate.mjs:24`) one patch
   + all six stamps the agreement assert checks (`scripts/selftest.mjs:634-637`: generate.mjs,
   package.json, plugin.json, BOTH marketplace.json fields, CHANGELOG heading). CHANGELOG
   entry per convention. Then regenerate veriloop's own bundle (`node scripts/generate.mjs`)
   so the self-host workflow gains emission; `node scripts/lint-bundle.mjs` must pass.

## Non-goals (binding)

- NO regeneration/recommit into Torevan or catan_rl_v2 (cross-repo; rides the M2 session).
- NO history-record pruning/rotation policy (post-1.0 formalization, roadmap §6-A).
- NO changes to gate logic, lenses, or verdict semantics.

## Acceptance

1. `npm test` green; count > baseline; new asserts bind to emission DECISIONS (file exists,
   keys, redaction), not narration.
2. `node scripts/lint-bundle.mjs` exit 0 on the regenerated self-host bundle.
3. Six version stamps agree (the existing agreement assert proves it).
4. `git status` clean on the branch after land.
