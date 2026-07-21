# Fixture gold constitution — SELFTEST ONLY (synthetic; NEVER the real Torevan gold)

> Hand-written fixture for the bench-score selftest. Five numbered rules with
> distinctive content tokens so the deterministic matcher has an unambiguous target.
> This is NOT the frozen held-out gold (that RUN is owner-gated).

1. Child-process spawns must pass an argv array with the shell option false, never a synthesized shell string. _(owner: `security`)_
2. Environment secrets stay out of logs; the process environment is never written to a console call. _(owner: `security`)_
3. The gate runs on real exit codes; the deterministic selftest must pass before any merge. _(owner: `code-review`)_
4. Emitted artifacts are portable; no absolute filesystem paths appear in any generated bundle file. _(owner: `drift`)_
5. Work lands on a feature branch only; never merge or publish without explicit owner sign-off. _(owner: `code-review`)_
