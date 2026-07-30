# The demo repo (DA1)

A tiny deliberately-broken app with four seeded defects, each tripping a different signal.
It is **generated, not committed** — `make-demo.sh` in this directory materializes it.

```bash
bash docs/demo/make-demo.sh [target-dir]     # default: ../veriloop-demo
```

## Why a generator instead of a checked-in directory

`docs/plans/m5-plan.md` requires the demo live *"in a separate repo/dir, not inside veriloop
(it is demo data, not veriloop source)."* A committed `demo/` or `examples/` folder would
break that, and it would put a repo whose `npm test` **fails by design** one directory away
from a repo whose whole pitch is a green gate. It would also drag the first `typescript` and
`eslint` dependencies into a tree whose `package.json` advertises "deliberately
dependency-free."

A tracked generator satisfies both halves: the script is veriloop source, the demo data lands
outside the tree, and — unlike a sibling directory described in prose — it survives a fresh
clone. The script **refuses to run** if you point it inside the veriloop tree.

**The demo repo itself is not yet published; publishing is part of the launch step (M6).**
It gets a real `git init` and a real commit, but no remote, and it is never pushed.

## File tree

```
README.md
eslint.config.js
package.json          type: module; scripts typecheck / lint / test
tsconfig.json         strict
src/total.js          DEFECT 1 — off-by-one
src/total.test.js     the test that catches it
src/price.ts          DEFECT 2 — type error
src/cart.js           DEFECT 3 — unused binding
src/render.js         DEFECT 4 — lens-only footgun
```

## The four defects

| # | file | defect | trips | exit |
|---|------|--------|-------|------|
| 1 | `src/total.js` | `reduce` starts at `1`, so every total is off by one | `test` | **1** |
| 2 | `src/price.ts` | `formatPrice('1999')` — string into a `number` param | `typecheck` | **1** |
| 3 | `src/cart.js` | `discount` assigned and never used | `lint` | **1** |
| 4 | `src/render.js` | user input interpolated into `innerHTML` | **nothing** | 0 |

Captured output and exit codes: **[gate-record.md](./gate-record.md)**. Re-run and diff them:
**[replay.sh](./replay.sh)**.

**Defect 1 is dependency-free on purpose.** `node --test` is built into node ≥18, so at least
one defect class is capturable offline with no install step and no network. Defects 2 and 3
need `npx` to fetch `typescript` and `eslint@9`; if there is no network the script records
them as `NOT CAPTURED (no network)` rather than inventing a number.

**Defect 4 is the interesting one.** Every exit-code check above passes over it — verified,
`render.js` appears zero times in all three captured logs. It is valid, used, ESM-clean code,
and `document` is declared as a browser global specifically so `no-undef` does *not* fire.
It is seeded as a **lens-layer target; no lens has been run against it here.** The record
states only that the line exists and that the exit codes are silent about it.

That is the honest shape of the claim veriloop makes: an exit code proves exactly what a
command can decide, and says nothing at all about everything a command cannot see.

## Two things found while building this

Both are recorded because they are the kind of thing a demo usually hides.

**The first version failed for the wrong reason.** `node --test` exited 1 — but on
`SyntaxError: Cannot use import statement outside a module`, not the seeded off-by-one. The
demo would have "caught a defect" by accident. Fixed with `"type": "module"`; the record now
shows the actual `AssertionError: 1 !== 0`.

**`npx tsc` does not run TypeScript.** It resolves the `tsc` package, which is a different
package, and newer npm refuses it for exactly that reason. The script uses explicit
`--package=typescript`. This is a live instance of the look-alike hazard documented in
[SECURITY.md](../../SECURITY.md) — met by accident while writing a demo.
