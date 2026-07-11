# M1 "First Blood" — Torevan dogfood report

*2026-07-11 · veriloop `ca5f79f` · Torevan branch `veriloop/install`*

The warm-up milestone from the [roadmap](./roadmap-v1.md) §M1: install the
veriloop-generated bundle **committed into Torevan** and drive a real task through
`/dev-loop`. Warm-up task (deliberate): turn Torevan's RED `format:check` baseline
green by landing a Prettier fix.

## Headline result

**The generated loop worked on the first drive and caught a real content-corruption
bug that the exit-code gate alone missed — veriloop's core thesis, validated on day
one.**

Driving `npm run format` on Torevan produced a green `format:check` (the exit-code
gate passed), but all four review lenses independently flagged that the format pass
had silently **corrupted prose** in `docs/plans/mvp-build-plan.md`:

| | base | what the loop's worktree shipped | single-pass `prettier(base)` |
|---|---|---|---|
| module ref | `random_ai` | `random*ai` (broken) | `random_ai` (preserved) |
| emphasis | `*more*` | `\_more*` (broken italics) | `_more_` (valid) |

Root cause (independently verified against the real files): **Prettier 3.x is
non-idempotent on that file** — a very wide markdown table cell mixing an intra-word
underscore (`random_ai`) with emphasis. One `prettier --write` pass leaves
`format:check` still RED, so the implementer ran it a second time to green the gate,
and the second pass mangled the text. `format:check` (exit code) went green and
**missed it**; the review lenses caught it via real `git diff` inspection. The loop
returned **CONCERNS** and correctly **did not push**.

This is exactly the gap veriloop exists to close: exit-code checks verify *that
commands pass*; the review lenses catch *semantic regressions green checks can't
see*.

## Warm-up resolution (owner chose "fix the doc, push clean preview")

- Found and **proved** the minimal idempotency fix: backtick `random_ai` (making the
  underscore inert as a code span) and normalize `*more*`→`_more_`. Verified Prettier
  then converges in a single pass with content preserved. Committed as Torevan
  `6fca028`.
- Re-ran the loop → clean single-pass format, all gate checks green, **preview branch
  `feat/prettier-repo-format` pushed** to `BenjaminL1/Torevan` (93 files, +2367/-1563,
  `prettier --check` clean, no `.env` touched, repo author, no AI trailer), stopped
  before merge.

### Latent Torevan bug surfaced

`npm run format` (Prettier 3.x) could not make `npm run format:check` green on
`mvp-build-plan.md` without corrupting it — the naive "run format once, commit"
workflow was silently broken on this repo. Fixed in `6fca028`.

## Compiler bugs found and fixed (veriloop)

Every failure was treated as a **compiler bug** (fix veriloop, never hand-patch the
emitted bundle). All fixed with selftest coverage (**21 → 26 assertions, all green**).

| # | Bug | Fix | File |
|---|---|---|---|
| 1 | Gate omitted a non-mutating `format:check` — the warm-up's own verification | Gate includes `format` iff it doesn't `mutate` (keeps Torevan's `format:check`, still excludes catan's `make format`) | `generate.mjs` |
| 2 | `/dev-loop` command + constitution re-hardcoded the gate as `typecheck/lint/test` | Both derive the gate text from the real `config.gate` (single source of truth) | `render.mjs` |
| 3 | `lint-bundle` walked all of `.claude/**` and flagged Torevan's own `torevan-advise.js` absolute path | Scope strictly to the manifest's `emitted_files` | `lint-bundle.mjs` |
| 4 | `VERILOOP_VERSION` stale at `0.1.0` (manifest mis-stamped) | Bumped to `0.1.1` | `generate.mjs` |
| 5 | Review lenses/cross-model read `git diff <base>...<branch>` — **empty**, because `implement` leaves the change uncommitted at gate time (raised a false CONCERNS) | Read the worktree diff (`git diff <base>` + `status --porcelain` for new files) | `dev-loop.template.js` |
| 6 | e2e resolved to the Playwright **install** line (`npx playwright install --with-deps`) instead of the run command | Install/setup lines can't fill a run-command slot; e2e signature tightened to the run command. e2e now `npm run test:e2e -w @torevan/web …` (CI-verified) | `detectors.mjs` |

## Open findings / observations (recorded, not yet fixed)

- **Auto-gitignore `.backups/`** — the generator writes `.claude/veriloop/.backups/`
  but doesn't gitignore it; added to Torevan's `.gitignore` by hand during install.
  veriloop should manage this entry itself.
- **Repo-identity guard** — the emitted loop resolves its target via
  `${CLAUDE_PROJECT_DIR:-git rev-parse}`. With an empty `CLAUDE_PROJECT_DIR` and a cwd
  inside a *different* repo, it would silently operate on the wrong repo. Mitigated
  operationally this session (verified cwd→Torevan before every drive). Recommend the
  emitted loop assert its resolved repo matches the one it was generated for and abort
  otherwise.
- **`implement` doesn't commit** (the deeper root of #5) — a cleaner architecture
  commits the change inside `implement`, so the gate reviews the committed diff and
  also sees newly-added files. #5's fix (read the worktree diff) handles tracked
  edits; the commit-in-implement refactor is a candidate for M2.
- **Screenshot gate fires for formatting/trivial changes** touching UI-named files
  (tier came out `high`, and `game-hud` matched the `hud` UI keyword). Vindicated
  here (high-tier depth caught the corruption), but a formatting-only diff arguably
  shouldn't trigger a visual gate — candidate for M3 tier refinement.
- **Evidence-bundle auto-emission** — the loop returns its result but does not yet
  write `.claude/veriloop/history/<ts>.json` attestation records (roadmap M1). This
  report + the run records below are the v0 attestation; auto-emission is a candidate
  template enhancement.

## M1 exit criteria

- [x] Bundle **committed into Torevan** (`aa03218`), gold preserved on `main` + `.backups/`.
- [x] Real feature driven through the generated `/dev-loop`; **exit-code gate on real commands**.
- [x] Every discovered compiler bug fixed **with selftest coverage** (6 bugs, 26/26).
- [x] Dogfood report written (this document).
- [x] **PASS-gated preview branch pushed by the loop** — `feat/format-check-green` @ `f264731`, verdict PASS (0/0/0).

## Evidence

**veriloop:** `8523376` (v0.1.1 spine) → `ca5f79f` (M1 fixes).
**Torevan `veriloop/install`:** `aa03218` (install) → `6fca028` (doc idempotency fix)
→ `189dd30` (regenerate with #5/#6 fixes).
**Preview:** `feat/format-check-green` @ `f264731` pushed to `BenjaminL1/Torevan`
(93 files, +2367/−1563; verified: repo author, conventional `style:` commit, no AI
trailer, no `.env*`). The earlier `feat/prettier-repo-format` preview (`0bf3a96`,
gated by the pre-#5 loop) was superseded and deleted from the remote.

| run | verdict | note |
|---|---|---|
| `wez8f34sv` (dryRun, pre-fix loop) | CONCERNS | **caught the prettier corruption** (4 lenses); did not push |
| `wy1n9r3ka` (real, pre-#5 loop) | CONCERNS | clean content pushed (`0bf3a96`, later superseded); sole concern was the #5 empty-diff false alarm |
| `wf_8e30603f-d35` (real, fixed loop) | **PASS** | 0 blockers · 0 concerns · 0 fix passes — the #5 fix validated (no empty-diff false alarm); pushed `feat/format-check-green` @ `f264731`. Interrupted once by a Claude Code process restart mid-gate and **resumed from the journal cache with zero loss** (plan+implement replayed cached) — incidental validation of the loop's recoverability. |

## Next: the main event

The roadmap's M1 main event — one **standard-tier, UI-touching feature** driven by a
fresh-context agent (exercises the review lenses + screenshot gate + land policy on a
real feature, and validates the #5 fix on a real feature diff). Feature choice is an
owner decision.
