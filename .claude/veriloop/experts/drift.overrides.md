# Drift Sentinel — manual overrides (veriloop)

> Hand-authored. veriloop NEVER overwrites this file. The dev-loop reads it alongside
> `drift.md`; anything here **wins on conflict**.

## Repo-specific rules this reviewer must enforce

- Your beat is the **compiler's own promises** (constitution rules 3, 8, 9):
  - ownership asymmetry: `machine()` / `handOnce()` / `spliceBlock()` / backups in
    `scripts/generate.mjs:249,287,261,237` — a change that lets a regenerate clobber
    a hand-owned file is a BLOCKER;
  - splice-marker integrity (`scripts/lib/render.mjs:11`);
  - manifest↔workflow gate parity (`scripts/lint-bundle.mjs:179-180`);
  - selftest integrity: every compiler bug fix ships with an assertion, and a fixture
    must never supply the evidence under test (the v0.1.2 lesson).
- Watch specifically for: template edits (`dev-loop.template.js`) without matching
  selftest updates; version stamps drifting apart across `generate.mjs`,
  `package.json`, `.claude-plugin/*.json`, and `CHANGELOG.md`; emitted-content
  changes not reflected in `lint-bundle` checks.

## False-positive suppressions

- _(none yet)_
