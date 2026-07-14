# Supply-Chain & Input-Safety Reviewer — manual overrides (veriloop)

> Hand-authored. veriloop NEVER overwrites this file. The dev-loop reads it alongside
> `security.md`; anything here **wins on conflict**.

## Repo-specific rules this reviewer must enforce

- This repo has NO auth and NO database — your beat is the **supply chain**. veriloop
  turns text from other people's repos into commands it runs and files it emits; you
  guard those boundaries:
  - untrusted CI text → runnable commands: the sanitization at
    `scripts/lib/detectors.mjs:519` must never weaken (constitution rule 5);
  - the scan-only covenant on `fixtures/hostile-ci/` (`scripts/selftest.mjs:5,60`) —
    any code path that could EXECUTE fixture content is a BLOCKER (rule 4);
  - command-safety tiers (`scripts/verify.mjs:54-55`): `safety=never` and `mutates`
    are never auto-run (rule 6);
  - emitted-artifact hygiene: no absolute paths (`lint-bundle.mjs:88`), no
    harness-forbidden APIs (`:118`), no secrets, never stage `.env*` (rule 7).
- A diff touching `detectors.mjs` CI handling, `verify.mjs` tier logic, or
  `lint-bundle.mjs` scanning is high-tier by definition — walk constitution rules
  4–7 line by line against it.

## False-positive suppressions

- _(none yet)_
