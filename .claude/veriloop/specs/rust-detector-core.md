# Spec: Rust/cargo detector core (m4-plan §§1-4+7 slice; overrides/OSS/Windows deferred)

> Extracted from `docs/plans/m4-plan.md` (committed @ 2787a6d, adversarially reviewed) —
> that plan is BINDING and snippet-anchored; READ IT FIRST and follow its extension-point
> map (§0) exactly. This spec scopes tonight's unattended drive to the core slice. If a
> genuine fork appears mid-run, pick the plan's stated default and flag it in the report.

## In scope (= m4-plan sections, follow them verbatim)

1. **§1 — `detectRust(root, out)`**: detection order Cargo.toml `[workspace]`/`[package]` →
   `.config/nextest.toml` → `rust-toolchain.toml` → CI `run:` lines (feature flags captured
   verbatim — reconcile step 0 adopts the exact clean CI line) → Makefile alias recognition.
   Reuse `parseToml` (`scripts/lib/toml.mjs:141`). Add Rust regexes to `CI_SIGNATURES`
   (`scripts/lib/detectors.mjs:43-51`) and cargo families to `TOOL_FAMILIES` (`:500-508`).
   Wire into `detectCommands` (`:559`). justfile/xtask = documented-only, no parser.
2. **§2 — category mapping**: typecheck=`cargo check` (safe); lint=`cargo clippy
   --all-targets -- -D warnings` (safe); format=`cargo fmt --all --check` (safe; BARE
   `cargo fmt` ⇒ `mutates:true` + note, mirroring `detectors.mjs:346-352`); test=`cargo
   nextest run` if `.config/nextest.toml` else `cargo test` (ask); test_single placeholder
   forms (ask); **NEW `bench` category** added to CATEGORIES (`:12-22`) with
   `DEFAULT_SAFETY.bench='never'` (`:35-36` precedent) — detected + cited, never auto-run,
   never in a gate.
3. **§3 shape via fixture** — `fixtures/rust-maturin/` (pyproject `build-backend="maturin"`
   + Cargo.toml): assert dual surface — `build` stays maturin, lint/format/test gain cargo.
   catan validation itself is post-M2: DO NOT touch catan_rl_v2.
4. **§4 — fixtures + selftest per the ci-adopt precedent** (`scripts/selftest.mjs:533-622`
   is the template; fixtures supply INPUT, asserts interrogate DECISIONS):
   - `fixtures/rust-workspace/` — workspace Cargo.toml, nextest.toml, rust-toolchain.toml,
     `.github/workflows/ci.yml` with clean flagged cargo lines (`cargo test --all-features`
     adopted verbatim: `from:'ci'`, `verified_by_ci:true`, `…ci.yml:N (CI)` source).
   - bare-fmt case ⇒ `commands.format.mutates===true`.
   - hostile compound cargo lines (`cd crates/x && cargo test`, piped) ⇒ REJECTED, category
     absent. Scan-only covenant holds: never execute fixture content (`selftest.mjs:5`).
5. **§7 guardrail** — reconcile step 3 (`detectors.mjs:467-483`) is documented-dead; cargo
   CI-only adoption must flow through step 0. Do NOT revive step 3; if a Rust path seems to
   need it, the CI_SIGNATURES/matchesCategory wiring is wrong — fix the match. Comment the
   CI-only cargo assert naming step 0 (mirroring `selftest.mjs:580-583`).

## Version note

Bump one patch from the version found at execution (⟨execution-time⟩ — read
`generate.mjs:24`), all six stamps + CHANGELOG (`selftest.mjs:634-637`). KNOWN COLLISION:
the evidence-emission preview (parallel slice, branched from the same main) also bumps a
patch; whichever merges second gets rebased by the owner's session — expected, not a defect.
Regenerate the self-host bundle after the bump; `lint-bundle` must pass.

## Non-goals (binding — these are m4-plan sections deliberately NOT in this drive)

- §5 `commands.overrides.json` escape hatch.
- §6 OSS detect-only validation (ripgrep/tokio clones) + Windows portability asserts.
- catan_rl_v2 anything (post-M2). Workspace member-scope emission. Go/Java. GitLab/CircleCI.

## Acceptance

1. `npm test` green; count > run-time baseline; Rust adopt + reject + mutates + bench-never
   asserts all bind to detector decisions.
2. `fixtures/rust-workspace` detect: `stack` includes `rust`; `commands.test.cmd`
   starts with `cargo nextest run` — WITH the CI line's flags captured verbatim
   (`cargo nextest run --all-features`), per §1/§4's verbatim-flag-capture mandate.
   (Amended post-drive: the original `=== 'cargo nextest run'` contradicted §1/§4;
   the gate caught it — run `wf_1aa35e6c-af3` — and the code correctly followed
   the dominant verbatim intent.)
3. `fixtures/rust-maturin` detect: `build` maturin + cargo lint/format/test (dual stack).
4. `node scripts/lint-bundle.mjs` exit 0 on the regenerated self-host bundle; six stamps agree.
5. No changes to reconcile steps; step 3 remains documented-dead and untouched.
