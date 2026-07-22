# mined-bundle constitution — invariants the dev-loop checks every plan against

These are non-negotiables. The `/dev-loop` gate checks the **plan** against this list *before*
any code is written, and the review lenses check the **diff** against it. A plan or diff that
violates one is a **BLOCKER**. Keep this list short and true.

> Mined 2026-07-21 from the repo's own written principles and the code that enforces
> them — every rule cites the enforcing line. Hand-owned: three-way-merged on re-run;
> owner edits win.

## Build & correctness

1. **The gate runs on real exit codes.** `npm run lint` · `npm run test` must pass; a
   red check is a BLOCKER, never waved through on "looks right" (`package.json:1`).
   _(owner: `code-review`)_
2. **Every bug fix ships with a regression test.** A fix without a test that would have
   caught it is incomplete (`test/parity/golden.json`). _(owner: `code-review`)_
3. **Honor `CLAUDE.md` code standards** — explicit types, no `any`, exports typed,
   secrets via env only. _(owner: `code-review`)_

## Trust boundaries & safety

4. **Untrusted input is validated at the boundary.** Every request body is parsed and
   narrowed before use (`src/api/parse.ts`); never trust the client shape.
   _(owner: `security`)_
5. **The SQL layer is parameterized.** No string-concatenated queries; every value
   crosses the boundary as a bound parameter (`db/schema.sql`). _(owner: `security`)_
6. **Secrets never land in the repo.** No credentials in source, fixtures, or emitted
   artifacts; configuration comes from the environment. _(owner: `security`)_
7. **Auth checks are server-authoritative.** Authorization is decided on the server,
   never inferred from a client-supplied flag. _(owner: `security`)_

## Parity & drift

8. **The golden oracle is the source of truth.** A behavior change that moves parity
   output ships with the regenerated golden (`test/parity/golden.json`), never a
   silent drift. _(owner: `drift`)_
9. **Emitted config has one source of truth.** Generated files derive from the config;
   the same fact is never hardcoded twice. _(owner: `drift`)_
10. **Machine-owned files regenerate; hand-owned files are preserved.** `*.overrides.md`
    and this constitution are never clobbered; anything overwritten is backed up first.
    _(owner: `drift`)_

---

### Rule ownership

- **Baseline Reviewer** (`code-review`) — rules 1, 2, 3.
- **Security & Data Reviewer** (`security`) — rules 4, 5, 6, 7.
- **Drift Sentinel** (`drift`) — rules 8, 9, 10.

No orphan rules, no jobless experts.
