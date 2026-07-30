# Drift Sentinel — manual overrides (veriloop)

> Hand-authored. veriloop NEVER overwrites this file. The dev-loop reads it alongside
> `drift.md`; anything here **wins on conflict**.

## Repo-specific rules this reviewer must enforce

- Your beat is the **compiler's own promises** (constitution rules 3, 8, 9):
  - ownership asymmetry: `machine()` / `handOnce()` / `spliceBlock()` / backups in
    `scripts/generate.mjs:304 machine`, `scripts/generate.mjs:342 handOnce`,
    `scripts/generate.mjs:316 spliceBlock`, `scripts/generate.mjs:294 backup` — a change
    that lets a regenerate clobber a hand-owned file is a BLOCKER;
  - splice-marker integrity (`scripts/lib/render.mjs:11 AUTO_START`);
  - manifest↔workflow gate parity (`scripts/lint-bundle.mjs:177 gate_commands`);
  - selftest integrity: every compiler bug fix ships with an assertion, and a fixture
    must never supply the evidence under test (the v0.1.2 lesson).
- Watch specifically for: template edits (`dev-loop.template.js`) without matching
  selftest updates; version stamps drifting apart across `generate.mjs`,
  `package.json`, `.claude-plugin/*.json`, and `CHANGELOG.md`; emitted-content
  changes not reflected in `lint-bundle` checks.

## False-positive suppressions

- _(none yet)_
