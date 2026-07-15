# veriloop deep-scan notes (phase 3, shallow — self-install, 2026-07-13)

Classification (owner-confirmed): **compiler** — deterministic Node-ESM toolchain
(detect → verify → generate → lint) + an LLM playbook (`skills/veriloop/SKILL.md`),
headless, dependency-free by design. ~15 source files under `scripts/`.

## Danger surfaces (each cited to real code)

1. **Untrusted-CI parsing.** CI `run:` lines are text anyone could have written, and
   veriloop turns text into commands it may execute. Sanitization rejects command
   substitution / backticks / env expansion at `scripts/lib/detectors.mjs:519`
   (`if (/[$\`]/.test(c)) return false`). Test bed: `fixtures/hostile-ci/` —
   **scan-only covenant** at `scripts/selftest.mjs:5` and `:60` ("scan ONLY — never
   execute anything from this fixture").
2. **Command-safety tiers.** `scripts/verify.mjs:5-9` defines the law (safe →
   auto-run; ask → only with `--include`; never → never), enforced at
   `verify.mjs:54-55` (`mutates` and `safety=never` both refuse to run). A
   regression here means veriloop runs side-effecting commands in someone's repo
   uninvited.
3. **Emitted-artifact portability & hygiene.** `scripts/lint-bundle.mjs:88` (the
   absolute-path regex — `/Users/`, `/home/`, drive letters) and `:118` (the
   FORBIDDEN harness APIs list — `Date.now`, `Math.random`, `process.*`, `require`,
   `import` — syntax-valid but banned at workflow runtime). These are the checks
   that keep a bundle from silently breaking on someone else's machine.
4. **Ownership asymmetry (machine vs hand).** `scripts/generate.mjs:249`
   (`machine()` — always rewritten, prior version backed up), `:287` (`handOnce()` —
   written once, preserved unless `--force`), `:261` (`spliceBlock()` — one marked
   block inside an owner-owned file, everything outside preserved byte-for-byte),
   backups under `:237` (`.claude/veriloop/.backups/<stamp>`). The promise "your
   edits win" lives entirely in these ~60 lines.
5. **Config↔output parity.** `scripts/lint-bundle.mjs:179-180` — the workflow's
   wired gate must equal the manifest's `gate_commands`; a mismatch is a lint FAIL.
   History: M1 bug #2 was exactly this class (command text re-hardcoding the gate).
6. **Template splicing.** `scripts/lib/render.mjs:11` (`<<< veriloop:auto:start >>>`
   markers); `spliceAuto` replaces only the marked region. A marker regression
   corrupts every emitted workflow.
7. **Selftest integrity.** `npm test` = `scripts/selftest.mjs` —
   the only exit-code gate this repo has, so anything that weakens it (or lets a
   fixture supply the evidence under test — the v0.1.2 lesson) weakens everything.

## Roster implications (owner-confirmed)

- `code-review` (baseline — always).
- `security` key, titled **Supply-Chain & Input-Safety Reviewer** — owns surfaces
  1, 2, 3. The detector's auth/db heuristics scored zero here (correctly, by its
  lights); the supply-chain surface nominated it instead (finding #11 → roster_add).
- `drift` — owns surfaces 4, 5, 6, 7.
- No `ux` (headless, `has_ui: false`).
