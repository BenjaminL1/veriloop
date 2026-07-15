# M4 · v0.5 "Rust + hardening" — cargo detector, fixtures, dual-stack maturin, override escape hatch, portability

*Planned for cold execution by a weaker model. Snippet-anchored; every claim cites file:line — verify each before you touch it. If the roadmap and the code disagree, the code wins (divergences are flagged inline).*

**Goal:** make Rust/cargo a first-class detected stack (detector + fixtures + selftest), emit BOTH cargo and python surfaces for maturin repos, ship a hand-owned `commands.overrides.json` pin, and pass a Windows-path portability sweep — satisfying v1.0 acceptance criterion 4 (roadmap-v1.md:106-107).

**Plan-stable:** not gated on any prior milestone's outcome. The detector surface is orthogonal to M2 mining and M3 Torevan convergence — no step's *content* depends on their results (see "Stability", last section). ⟨execution-time⟩ parameters (values knowable only at run time, each with the command that fills it):

- ⟨catan-crate-path⟩ — the Rust crate dir inside catan_rl_v2's maturin bundle. Fill: `find "$CATAN" -name Cargo.toml -not -path '*/target/*'` (bundle exists only post-M2; `$CATAN` = catan_rl_v2 checkout root).
- ⟨catan-bundle-root⟩ — catan_rl_v2's generated bundle. Fill: `ls "$CATAN/.claude/veriloop/commands.json"` (must exist before step 3's dual-stack assertion can run).
- ⟨ripgrep-clone⟩ / ⟨tokio-clone⟩ — read-only OSS clones for detect-only validation. Fill: `git clone --depth 1 https://github.com/BurntSushi/ripgrep <dir>` and `.../tokio-rs/tokio <dir>`; pass `<dir>` to `node scripts/detect.mjs --repo <dir>`.
- ⟨selftest-count-before⟩ — the selftest assertion count captured **at M4 start**, before any Rust asserts land. Fill: `node scripts/selftest.mjs | tail -1`. This is the execution-time baseline; do NOT hardcode a literal (the count grows through M1→M3 — M1 already moved it 21→26, and "selftest grows" is an M2/M3 exit metric, roadmap-v1.md:230, 340-341 — so any frozen number is stale by the time M4 runs).
- ⟨selftest-count-after⟩ — the assertion count once Rust asserts land. Fill: `node scripts/selftest.mjs | tail -1`. Success = ⟨selftest-count-after⟩ > ⟨selftest-count-before⟩ (growth measured against the run-time baseline, not a frozen prior-state number).
- ⟨version⟩ — `VERILOOP_VERSION` bump for v0.5. Set to `'0.5.0'` at generate.mjs:24 **and all six version stamps the agreement assert checks** (selftest.mjs:629-637): genVer (generate.mjs), pkgVer (package.json), pluginVer (.claude-plugin/plugin.json), **both** marketplace.json fields — `metadata.version` (mktMeta) and `plugins[0].version` (mktPlugin) — and the CHANGELOG.md heading (changelogVer). marketplace.json alone carries two version fields; bumping only five leaves the sixth stale and fails the assert (the drift class that bit once, M1 bug #4). (The assert's own comment mis-says "all five" — six values are enumerated at selftest.mjs:634.)

---

## 0. Extension-point map (read before editing)

Every M4 change lands at one of these seams. `cargo` and `go` are **already** whitelisted as clean bare-tool entrypoints (detectors.mjs:532) and `maturin` already appears in `TOOL_FAMILIES.build` (detectors.mjs:506) and `CI_SIGNATURES.build` (detectors.mjs:50) — so a *clean* CI `cargo …` line already survives `isCleanInvocation` (detectors.mjs:523-535). What is missing is (a) a Rust **detector** producing local candidates, (b) Rust entries in **CI_SIGNATURES / TOOL_FAMILIES** so cargo CI lines match a category, and (c) fixtures + asserts.

| Seam | file:line | M4 use |
|---|---|---|
| `CATEGORIES` | detectors.mjs:12-22 | add `bench` (see §2) |
| `DEFAULT_SAFETY` | detectors.mjs:27-37 | add `bench:'never'` mirroring `dev`/`e2e` (35-36) |
| `CI_SIGNATURES` | detectors.mjs:43-51 | add cargo/nextest regexes per category |
| `matchesCategory` | detectors.mjs:56-63 | unchanged — drives off CI_SIGNATURES |
| `detectNode` / `detectPython` | detectors.mjs:194 / 322 | new `detectRust` parallels these |
| maturin build candidate | detectors.mjs:393-400 | keep; `detectRust` adds the cargo surfaces the note at :397 promises |
| `reconcile` (steps 0-3) | detectors.mjs:420-497 | no change; cargo candidates flow through it. Step 3 (467-483) is **documented-dead** — do NOT depend on it (§7) |
| `TOOL_FAMILIES` | detectors.mjs:500-508 | add `typecheck/lint/format/test` cargo families for `sharesTool` |
| `isCleanInvocation` bare-tool regex | detectors.mjs:532 | already lists `cargo|go` — no change |
| `detectCommands` wiring | detectors.mjs:559 | call `detectRust(root, out)` alongside detectNode/detectPython |
| generate.mjs load → config | generate.mjs:352-366 | override merge slots between load (352) and `buildConfig` (366) |
| TOML parser | toml.mjs:141 | reuse for `Cargo.toml` / `rust-toolchain.toml` / nextest config (§1) |
| ci.mjs run-line extraction | ci.mjs:16-85 | already captures the whole run-line **verbatim incl. flags** — no change (§1) |

---

## 1. Rust detector — detection order & sources

**What:** a `detectRust(root, out)` producing per-category local candidates, mirroring `detectPython` (detectors.mjs:322-408). Detection order exactly per roadmap-v1.md:218-222.

**How (each source → seam):**

1. **`Cargo.toml` `[workspace]`** — parse with the existing TOML reader (`parseToml`, toml.mjs:141; it already handles tables/arrays-of-tables, adequate for `[workspace]`, `[package]`, `members`). Presence of `[package]` or `[workspace]` ⇒ push `'rust'` to `out.stack` and run the detector. Workspace `members` → future scope emission (out of M4 scope; single-crate + one-level workspace only).
2. **`.config/nextest.toml`** — presence selects the test runner. If it parses (reuse `parseToml`), test candidate = `cargo nextest run`; else `cargo test`. (roadmap-v1.md:225.)
3. **`rust-toolchain.toml`** — parse `[toolchain] components`; if `clippy`/`rustfmt` are pinned, cite that file as the source for the lint/format candidates (evidence the repo ships those components). Non-fatal if absent.
4. **CI `run:` lines** — `extractCiCommands` (ci.mjs:16) already returns each run-line **verbatim including feature flags** (`--features full`, `--all-features`, `cargo hack …`) because it stores `c.cmd` whole (ci.mjs:80-85). The bare verb is NOT what we trust: reconcile step 0 (detectors.mjs:444-456) adopts the *exact* clean CI line, so `cargo test --all-features` is adopted with its flags intact. To make a cargo CI line *match* a category at all, add Rust regexes to `CI_SIGNATURES` (detectors.mjs:43-51):
   - `typecheck: /\bcargo (check|build)\b/`
   - `lint: /\bcargo clippy\b/`
   - `format: /\bcargo fmt\b[^\n]*(--check|-- --check)/`
   - `test: /\bcargo (nextest run|test)\b/, /\bcargo hack\b/`
   Keep them primary-stack-scoped exactly as the header comment at detectors.mjs:41-42 requires.
5. **Makefile / justfile / xtask** — `parseMakefile` (makefile.mjs:8) already extracts targets; a `rust-build` alias is already in `MAKE_TARGET_ALIASES.build` (detectors.mjs:305). Add cargo-recipe recognition to the same alias table for lint/typecheck/test where a target's recipe invokes `cargo …`. justfile/xtask parsing is **documented-only** for M4 (no parser) — note it and move on.

**Verify:** `node -e "import('./scripts/lib/detectors.mjs').then(m=>{const c=m.detectCommands('fixtures/rust-workspace'); if(!c.stack.includes('rust'))process.exit(1); console.log(c.commands.typecheck.cmd)})"` prints a `cargo check` form, exit 0.

---

## 2. Category mapping table → DEFAULT_SAFETY / mutates

**What:** local cargo candidates, one per category, wired to the safety semantics at detectors.mjs:27-37.

| Category | cargo command | safety (detectors.mjs) | note |
|---|---|---|---|
| `typecheck` | `cargo check` | `safe` (:29) | |
| `lint` | `cargo clippy --all-targets -- -D warnings` | `safe` (:30) | |
| `format` | `cargo fmt --all --check` | `safe` (:31) | **bare `cargo fmt` mutates** → emit `mutates:true` + `note`, exactly as the node/python formatter path does (detectors.mjs:221-227, 345-352) |
| `test` | `cargo nextest run` if `.config/nextest.toml` else `cargo test` | `ask` (:32) | |
| `test_single` | `cargo test -p <crate> -- <name>` (nextest: `cargo nextest run -E '<filter>'`) | `ask` (:33) | placeholder form, like pytest's `<path>::<test>` at detectors.mjs:377 |
| `bench` | `cargo bench` | `never` — **new** | detected but never auto-run |

**How — the `bench` never-tier (roadmap-v1.md:226).** CATEGORIES (detectors.mjs:12-22) has no `bench` slot today — **discrepancy vs roadmap**. Resolve by adding `'bench'` to CATEGORIES and `bench: 'never'` to DEFAULT_SAFETY (detectors.mjs:35-36 shows `dev`/`e2e` already at `'never'`). `never` commands are detected + cited but excluded from auto-run (design decision #4, detectors.mjs:24-26), which is exactly "never-tier". Do not add bench to any gate; it rides the same exclusion as `dev`/`e2e`.

**How — mutates.** For the `format` candidate follow the existing pattern verbatim: set `mutates: writesFmt || undefined` and a `note` when the recipe/command lacks `--check` (detectors.mjs:346-352). A bare `cargo fmt` (no `--check`/`--all --check`) is a formatter, not a gate.

**Verify:** `node -e "…detectCommands('fixtures/rust-workspace')…"` asserts `commands.format.cmd` contains `--check`, `commands.bench` (if a bench target/CI line exists) has `safety==='never'`, and a bare-fmt fixture yields `commands.format.mutates===true`. Exit 0.

---

## 3. maturin hybrid — dual-stack surfaces

**What:** `build-backend = "maturin"` in pyproject ⇒ emit BOTH the python surface (already done: `maturin develop --release` build candidate + polyglot note, detectors.mjs:393-400) AND the cargo surface (typecheck/lint/format/test from §1-2). Before M4, detectPython only pushed a *promissory* polyglot string — "cargo fmt/clippy/test run in CI; see ci_commands" — but emitted no cargo command slots. M4 makes `detectRust` fire on the same repo so those slots exist; detectPython's polyglot note now points at it directly ("detectRust emits the cargo fmt/clippy/test/check surface alongside this build", detectors.mjs:403).

**How:** `detectRust` keys off `Cargo.toml` presence, independent of pyproject. A maturin repo has both files, so both `detectPython` (detectors.mjs:322) and `detectRust` run and add candidates; `reconcile` (detectors.mjs:420) picks one per category across all stacks. Ensure the `build` category stays the python `maturin develop` candidate (it is the dual-stack build), while typecheck/lint/format/test gain cargo candidates. `buildDepsSetup` already handles the compiled-extension worktree case (generate.mjs:72-74) — no change.

**Validation target:** catan_rl_v2's maturin crate. Crate path is ⟨catan-crate-path⟩ (bundle exists only post-M2). Mark this the dual-stack acceptance case for criterion 4 (roadmap-v1.md:106-107).

**Verify (post-M2 only; gate on ⟨catan-bundle-root⟩ existing):** `node scripts/detect.mjs --repo "$CATAN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s); if(!(c.commands.build.cmd.includes('maturin')&&c.commands.lint.cmd.includes('cargo clippy')))process.exit(1)})"` → exit 0 (build=maturin, lint=cargo). Until the bundle exists, cover the shape with a synthetic maturin+Cargo fixture (§4).

---

## 4. Fixtures + selftest (the ci-adopt precedent)

**What:** new checked-in fixtures + positive adopt-path asserts following the v0.3.2 ci-adopt template (selftest.mjs:533-622). ci-adopt is the model: a fixture supplies INPUT (files); each assert interrogates the detector's **decision** (`from`/`verified_by_ci`/`source`/`cmd`), never parse output (selftest.mjs:538-541).

**How — fixtures (mirror fixtures/ci-adopt/ layout):**

- `fixtures/rust-workspace/` — `Cargo.toml` with `[workspace]` + members, `.config/nextest.toml`, `rust-toolchain.toml` (clippy+rustfmt components), and `.github/workflows/ci.yml` with clean cargo run-lines carrying feature flags (`cargo test --all-features`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all --check`). Assert: nextest present ⇒ `commands.test.cmd==='cargo nextest run'`; the `--all-features` CI line is adopted verbatim (`from:'ci'`, `verified_by_ci:true`, source `…ci.yml:N (CI)`) — the flag-capture requirement.
- `fixtures/rust-maturin/` — pyproject `build-backend="maturin"` + `Cargo.toml`; assert dual surface (`build` maturin, `lint`/`format`/`test` cargo). Covers §3's shape without waiting for catan.
- Hostile variant: extend `fixtures/hostile-ci/` (or add `fixtures/rust-workspace` CI lines) with a compound cargo line (`cd crates/x && cargo test`, `cargo test | tee log`) and assert it is **rejected** by `isCleanInvocation` (detectors.mjs:525) — never adopted. **Never execute anything from a hostile fixture** (selftest.mjs:5, scan-only covenant).

**How — asserts (append a new block to selftest.mjs, same style as :542-622):** use the `assert(cond, desc)` helper (selftest.mjs:24-32). Bind to decisions:
- `C.typecheck.cmd==='cargo check'`, `from` reflects local-vs-CI adoption.
- `C.lint.cmd` contains `-D warnings`.
- `C.format.mutates===undefined` (has `--check`) on the clean fixture; a bare-fmt fixture ⇒ `mutates===true`.
- feature-flag capture: adopted CI test line equals the flagged verbatim string.
- hostile compound cargo line ⇒ category absent (reject), mirroring the ci-adopt `build===undefined` reject assert (selftest.mjs:598-601).

**Verify:** `node scripts/selftest.mjs` → exit 0 and final line count ⟨selftest-count-after⟩ **> ⟨selftest-count-before⟩** (the baseline captured at M4 start — never a hardcoded literal). The count MUST grow (roadmap-v1.md:230, "selftest grows").

---

## 5. `commands.overrides.json` escape hatch

**What:** a hand-owned override file letting a repo pin a wrong-detected command without forking the detector or hand-editing machine output (roadmap-v1.md:232-235). `commands.json` stays machine-written; the durable hand edits live in the override file.

**How — merge semantics (generate.mjs).** `cj` is loaded at generate.mjs:352; `buildConfig` consumes it at :366. Between them, load `commands.overrides.json` (repo root, else `.claude/veriloop/commands.overrides.json`) if present and **shallow-merge per category over `cj.commands`**: an override entry `{ typecheck: { cmd, cwd?, safety?, mutates? } }` replaces that category's chosen command wholesale; untouched categories keep detector output; stamp `source:'override'` / `from:'override'` on replaced entries so the audit trail shows provenance. Everything downstream (workflow gate, manifest `gate_commands`, the emitted `.claude/veriloop/commands.json` copy at generate.mjs:382) derives from the **merged** object — preserving constitution rule 9's single-source invariant (constitution.md:48-50; lint-bundle.mjs:179-180 asserts workflow gate === manifest gate_commands).

**Machine-purity (rule 8, constitution.md:43-47):** the override file is **hand-owned** — write it with `handOnce` semantics (generate.mjs:387 shows the `.overrides.md` precedent) so regeneration never clobbers it. The detector's own `commands.json` is never hand-edited; the override is a separate file, so ownership asymmetry stays intact.

**How — lint-bundle validation.** Add a check to lint-bundle.mjs (portability sweep already runs at :87-97): if `commands.overrides.json` is present, assert (a) every key is a member of `CATEGORIES` (detectors.mjs:12-22), (b) no absolute paths in any `cmd`/`cwd` (reuse the existing absolute-path scan at lint-bundle.mjs:94), (c) it is valid JSON. Fail the bundle otherwise.

**Verify:** generate into a tmp repo carrying a `commands.overrides.json` that pins `typecheck` to `cargo check --workspace`; assert the emitted workflow + manifest both wire that exact command (`grep` the emitted `.claude/workflows/*-dev-loop.js` and `veriloop-manifest.json`), and a second generate run leaves the override file byte-identical. `node scripts/lint-bundle.mjs --bundle <tmp>` → exit 0; an override with an absolute path or unknown category → exit non-zero.

---

## 6. Detect-only OSS validation + Windows portability

**What:** prove the detector on real Rust repos read-only, and sweep for Windows-path portability (roadmap-v1.md:236, criterion 4's "≥2 real OSS Rust repos (detect-only)").

**How — OSS detect-only:** clone ⟨ripgrep-clone⟩ and ⟨tokio-clone⟩ shallow, run `node scripts/detect.mjs --repo <dir>` (phase 1 only — never `verify.mjs`, which can auto-run `safe` commands). Confirm `stack` includes `rust`, `commands.test` resolves (ripgrep uses `cargo test`; tokio's CI uses nextest + feature sweeps → confirm flag capture). Read-only: no writes, no builds.

**How — Windows portability pass:** the detector already emits portable roots (`repo_root:'.'`, resolved by agents; detectors.mjs:546). Sweep every emitted path/command for POSIX-only assumptions: forward-slash joins are fine (git/cargo accept them on Windows), but assert no backslash-hostile logic and that `lint-bundle`'s absolute-path scan (lint-bundle.mjs:87-97) also rejects `C:\`-style Windows absolutes. **Already present — no new regex:** the `ABS` pattern at lint-bundle.mjs:88 (`/(\/Users\/|\/home\/[a-z]|\b[A-Z]:[\\/])/`) already has a `\b[A-Z]:[\\/]` arm that matches `C:\Users\x`. Scope the M4 work here to adding a fixture/selftest assertion that *proves* the rejection (per the ci-adopt precedent), not to adding detection logic.

**Deferred (documented-only, NOT built):** GitLab CI / CircleCI run-line extraction stays **post-1.0** (roadmap-v1.md:236-239) — record parser requirements (reserved-key filtering, `extends:`/anchors/`!reference` resolution, string-vs-map `run`, orb opacity) as prose only.

**Verify:** `node scripts/detect.mjs --repo <ripgrep-clone>` exits 0 with `stack` ⊇ `["rust"]`; same for tokio. `node scripts/lint-bundle.mjs --bundle <tmp>` rejects a seeded `C:\Users\x` path (exit non-zero).

---

## 7. Guardrail — do not revive the dead reconcile step

reconcile step 3 (detectors.mjs:467-483) is **documented-unreachable**: its guard recomputes the exact `ciMatches.find(isCleanInvocation)` already satisfied at step 0 (detectors.mjs:444-456; note at :470-476). Cargo CI-only adoption already flows through step 0's `localSame || {…from:'ci'}` arm — the ci-adopt selftest proves this for the generic case (selftest.mjs:579-587). **Rust work must not silently depend on or revive step 3.** If any Rust path appears to need it, that is a bug in the CI_SIGNATURES/matchesCategory wiring — fix the match, do not resurrect dead code without its own test.

**Verify:** after §1-4, `node scripts/selftest.mjs` green with the CI-only cargo adopt assert passing via step 0 (add a comment on the assert naming step 0, mirroring selftest.mjs:580-583).

---

## Stability — independent of M2 / M3

The detector surface is orthogonal to mining (M2) and Torevan convergence (M3): `detectRust` reads a repo's files and CI, producing citations — it never consults a mined constitution or a convergence result. The only cross-milestone touchpoint is the **catan dual-stack validation** (§3), whose *timing* waits on the M2 bundle but whose *content* (emit both surfaces) is fixed now; until the bundle exists, `fixtures/rust-maturin` covers the shape. No step's decision logic changes based on M2/M3 output. This satisfies the header's plan-stable contract.

## Exit criteria (→ v1.0 acceptance criterion 4, roadmap-v1.md:106-107, 241-242)

1. `node scripts/selftest.mjs` green, count ⟨selftest-count-after⟩ > ⟨selftest-count-before⟩ (grew against the M4-start baseline, no literal threshold), with Rust adopt-path + reject asserts.
2. `fixtures/rust-maturin` (and catan post-M2) emits a dual-stack bundle that `node scripts/lint-bundle.mjs --bundle <it>` passes (exit 0).
3. ripgrep + tokio detect correctly, read-only (`stack` ⊇ rust, test/lint resolve).
4. `commands.overrides.json` pins a category through to workflow + manifest; hand-file survives regen; lint-bundle validates it.
5. Windows-absolute paths rejected by lint-bundle — the capability already ships (ABS arm `\b[A-Z]:[\\/]` at lint-bundle.mjs:88); the M4 deliverable is a fixture/selftest assertion proving the rejection, not new regex. All six version stamps agree at ⟨version⟩ (selftest.mjs:634-637; both marketplace.json fields + CHANGELOG heading included).

## Deferred decisions (content depends on a later signal — NOT in this plan)

- Whether cargo checks join catan_rl_v2's **gate** (vs detect-only) — decided by catan's interview at generate time, post-M2 (roadmap-v1.md:229).
- justfile / xtask **parsers** — documented requirements only in M4; build when a real repo demands it.
- GitLab CI / CircleCI extraction — post-1.0 (roadmap-v1.md:236-239).
- Workspace **scope** emission for multi-crate members — single-crate + one-level workspace only in M4.

## Non-goals

Go / Java / Gradle detectors; GitLab / CircleCI parsers; any autonomy / auto-land behavior; launch, trust-pack, or demo work (M5-M6); executing anything from any fixture (scan-only covenant, selftest.mjs:5); reviving reconcile step 3 (§7); hand-editing machine-owned `commands.json`.

---

## Implementation notes (§§1-4+7 slice, shipped v0.3.3)

The core slice (§§1-4 + §7) shipped; §§5-6 (overrides escape hatch, OSS/Windows
validation) and catan dual-stack validation remain deferred as planned.

- **§1-2 detector.** `detectRust(root, out)` lives after `detectPython` in
  `scripts/lib/detectors.mjs` and is wired into `detectCommands` after it. It gates on
  `Cargo.toml` `[package]`/`[workspace]`, sets `package_manager='cargo'` when still null,
  and emits typecheck/lint/format/test/test_single cargo candidates. Rust regexes were
  added to `CI_SIGNATURES` (incl. new `bench`) and cargo families to `TOOL_FAMILIES`; the
  now-false "cargo does NOT fill python slots" header comment was rewritten (cargo lines
  DO fill slots by design for the maturin dual surface). `bench` was added to `CATEGORIES`
  with `DEFAULT_SAFETY.bench='never'`. Makefile-first ordering is preserved: cargo-driven
  `make` aliases are registered BEFORE the intrinsic cargo candidates (so a bare-`cargo fmt`
  recipe wins as a `mutates:true` formatter), deduped by exact cmd against detectPython's
  make candidates.
- **Design note (flagged, plan default taken).** No local `bench` candidate is emitted:
  bench is detected + cited only when CI runs `cargo bench`, adopted `from:'ci'` via
  reconcile **step 0** — satisfying §7 without touching the documented-dead step 3. No
  local install/build candidate: a maturin repo's `build` stays the python `maturin develop`
  surface; pure-rust build is covered by `typecheck=cargo check`.
- **§3 dual-stack.** Acceptance-2 was resolved with `fixtures/rust-maturin/` (pyproject
  `build-backend="maturin"` + `Cargo.toml`, no CI, no nextest.toml): the detector emits
  `build=maturin develop --release` (python) alongside cargo lint/format/test/typecheck —
  proven by selftest asserts on `stack ⊇ {python,rust}`, `build.cmd` ∋ maturin, and the
  cargo slots. catan_rl_v2 validation stays post-M2 (untouched).
- **§4 fixtures.** `fixtures/rust-workspace/` (workspace Cargo.toml + member crate +
  `.config/nextest.toml` + `rust-toolchain.toml` clippy/rustfmt + clean flagged CI) drives
  the verbatim flag-capture assert (`cargo nextest run --all-features` adopted `from:'ci'`,
  `verified_by_ci:true`, cited `…ci.yml:N (CI)`), the local-vs-CI `from` asserts, the
  `--check`/no-mutates format assert, and the `bench` never-tier assert (commented naming
  step 0). `fixtures/hostile-ci/` gained `cd crates/x && cargo test` and `cargo test | tee log`
  → both surface in `ci_commands` but `test` is absent (rejected). A synthesized bare-fmt
  mini-repo pins `format='make fmt'`/`mutates:true` + `test='cargo nextest run'`. Selftest
  grew 119 → 135.
- **§7 guardrail.** `reconcile()`, `matchesCategory`, `isCleanInvocation`, and step 3
  (detectors.mjs:467-483) are unchanged — verified in the final diff. All cargo CI-only
  adoption flows through step 0.
