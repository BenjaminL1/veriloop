# Changelog

## 0.3.0 — 2026-07-13
- Experts gain a second mandate. The same personas that REVIEW in the dev-loop gate now also ADVISE in consultation — two new emitted commands make the mandate explicit: `/advise` (brainstorm/sanity-check/pressure-test an idea BEFORE building, inline, in ADVISE mode) and `/review` (the expert lenses on a working-tree diff or commit range, WITHOUT the full loop). Both are read-only and carry NO gate authority: they produce advice/findings, never a PASS/FAIL verdict, and never substitute for the dev-loop gate.
- Persona word budget raised 500 → 700 and reframed: it is an accretion tripwire (a persona that grew past 700 words usually carries unreviewed bolt-ons a human should re-read and re-distill), not an instruction-dilution/token claim. Still WARN-only.
- Language-pack checklists for expert personas were council-reviewed and DEFERRED (packs matter only for frugal-posture review lenses and freshly-compiled repos with thin constitutions; revisit on first sustained frugal usage or M4 Rust cold-start support).

## 0.2.2 — 2026-07-13
- Gate fails CLOSED (finding #10): a gate agent that dies or is skipped becomes a blocker — absent evidence is never passing evidence. Only a human waiver may downgrade it.
- Implementer pre-flight: runs the gate's static checks (typecheck/lint) once before hand-off and reports what it saw — zero authority, the gate re-runs everything; mutating commands are barred (the warm-up-corruption guard).

## 0.2.1 — 2026-07-13
- Report phase: the loop compresses its own run into a lossless brief before returning — findings deduped by root cause (not repeated once per lens), every blocker/concern preserved, nothing invented. The owner's session presents the brief rather than re-summarizing a transcript.

## 0.2.0 — 2026-07-12
- /dev-loop spec interview: recon first, ask only non-derivable design questions (≤5), answers become a binding spec the reviewers enforce.
- Per-phase model routing: plan/implement/review/checks/fix/land each pick a model + effort; frugal/balanced/max presets; routing can never drop a check, lens, or probe.
- First clean land on a real repo: Torevan #76 re-drive, CONCERNS with zero blockers.

## 0.1.2 — 2026-07-11
- Baseline probe: a gate check that was already red on the base tree becomes a [pre-existing] concern instead of a false blocker; new failures stacked on a red baseline still block.
- Machine-owned bundle files are exempted from the host repo's format check (marked .prettierignore block); .backups/ auto-gitignored.

## 0.1.1 — 2026-07-11
- First public spine: detect → verify → generate → wire gate → lint, deterministic and self-tested; six compiler bugs fixed during the Torevan warm-up dogfood.

## 0.1.0 — 2026-07-10
- Initial build of the compiler pipeline and portable dev-loop template.
