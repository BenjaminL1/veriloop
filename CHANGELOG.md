# Changelog

## 0.3.4 — 2026-07-15
- Rust/cargo is now a first-class detected stack (m4-plan §§1-4+7 core slice). A new `detectRust` produces per-category cargo candidates — typecheck `cargo check`, lint `cargo clippy --all-targets -- -D warnings`, format `cargo fmt --all --check` (bare `cargo fmt` in a Makefile recipe ⇒ `mutates:true` + note), test `cargo nextest run` (if `.config/nextest.toml`) else `cargo test` — detected from `Cargo.toml` `[workspace]`/`[package]`, `.config/nextest.toml`, `rust-toolchain.toml` components, CI `run:` lines (feature flags captured verbatim: `cargo test --all-features` is adopted with flags intact), and cargo-driven Makefile aliases. A new `bench` category (`DEFAULT_SAFETY.bench = 'never'`) is detected + cited from CI but never auto-run and never gated.
- Dual-stack maturin: a `build-backend = "maturin"` repo now emits BOTH surfaces — `build` stays the python `maturin develop` command while lint/format/test/typecheck gain the cargo surface.
- Fixtures + selftest: new `fixtures/rust-workspace/` (workspace + nextest + toolchain + clean flagged CI) and `fixtures/rust-maturin/` (dual stack) drive positive adopt/reject/mutates/bench-never asserts bound to detector decisions; `fixtures/hostile-ci/` gains compound/piped cargo lines proving they are seen then rejected. Scan-only covenant holds — nothing in a fixture is ever executed. No reconcile changes: CI-only cargo adoption flows through step 0; the documented-dead step 3 is untouched.

## 0.3.3 — 2026-07-15
- Evidence-bundle auto-emission (M1 carryover, completes the evidence spine). The emitted loop now writes one redacted attestation record per run to `.claude/veriloop/history/<ts>.json` — a superset of the run's evidence (`ts`, shas, `verdict`, `checks[{name,command,exit,tail}]`, baseline probe, screenshots, blockers/concerns, `land`). The record-builder is a pure, marker-bounded template region (`veriloop:emit`) so the redaction is testable; the runtime write is delegated to a worktree agent (fs/Date/git are harness-forbidden in the workflow). Real runs are committed only when landed (`land && land.pushed`); dry runs emit too (see below), and all records are runtime output — NOT added to the manifest's `emitted_files`.
- Redaction is BINDING (constitution rule 7): every free-text field is stripped of known absolute roots (→ the inert `%REPO%` sentinel, never the live shell variable `$REPO`, which could re-expand it back into a real path during the write), screenshots normalize to repo-relative, and any line still matching the lint-bundle absolute-path regex is DROPPED — imperfect root inference degrades to a dropped line, never a leaked path. A selftest extracts and executes the routine against synthetic + poisoned evidence to prove zero absolute paths escape.
- Deterministic secret redaction (constitution rules 2 + 7): a single `SECRET_PATTERNS` array — env-style KEY/TOKEN/SECRET/PASSWORD/CREDENTIALS assignments, bearer tokens, AWS access key ids, PEM private-key BEGIN/END markers, and common token prefixes (`ghp_`/`gho_`/`ghs_`/`github_pat_`, `sk-`, `xox-`) — drops any matching line whole-line, never partial masking. PEM private-key blocks additionally get a RANGE drop (the BEGIN line through the matching END line inclusive, or to end of field if END is missing) so the base64 body and footer can't leak past a header-only line-drop. The array is declared once inside the marker-bounded `veriloop:emit` region and extracted from the emitted workflow by both the selftest and `lint-bundle.mjs`, never re-hardcoded as a second copy.
- Dry runs now emit too (owner decision): the same redacted record is written locally, uncommitted, to `.claude/veriloop/history/dry-runs/<ts>.json` instead of `history/<ts>.json`; that subdirectory is machine-added to the host repo's `.gitignore` splice block. Real (landed) runs are still committed as before.
- `lint-bundle.mjs` backstop: committed `.claude/veriloop/history/*.json` records (excluding `dry-runs/`) are scanned against the absolute-path regex and the shared `SECRET_PATTERNS` array; any hit fails the bundle — real defense-in-depth if a record ever escaped redaction.
- `CHECK_SCHEMA` gains optional `exit`/`tail` (the record needs the raw exit code + a redacted output tail); the verdict logic keys off `result` only and is unchanged.

## 0.3.2 — 2026-07-14
- CI adopt-path coverage: the flagship surface — the detector's reconciliation of local commands against CI ground truth — gains its first positive test coverage. A new benign `fixtures/ci-adopt/` (awkward-but-benign YAML: quoted-inline, folded scalar, backslash-continuation, plain `run:`) drives all reconcile paths, and selftest assertions pin each decision (`from` / `verified_by_ci` / `source` / presence). Previously the adopt path was tested only for what it REJECTS (`fixtures/hostile-ci/`); regression insurance for M4's Rust detector, which sits on this path.
- Version-stamp agreement is now asserted: one selftest checks that `VERILOOP_VERSION`, `package.json`, `.claude-plugin/plugin.json`, both `.claude-plugin/marketplace.json` fields, and the first `CHANGELOG.md` heading all name the same semver (the drift class bit once — M1 bug #4).
- Docs/map fix: roadmap §11 records the M1 main event as clean-landed 2026-07-12 (code-complete, pending owner sign-off of two Torevan previews); hardcoded assertion counts ("96") dropped from prose (they staled once already) — the selftest is now the single source of that number.

## 0.3.1 — 2026-07-13
- interview `roster_add`: the LLM-refined, owner-confirmed roster now actually reaches the generator (finding #11, discovered during veriloop's own self-install: the detector's heuristics missed veriloop's supply-chain/drift surfaces and there was no way to add them).

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
