# Gate record — captured command output, NOT a session recording

**Captured command output. NOT a session recording. `/dev-loop` runs inside an interactive
Claude Code session and was not run here.**

What follows is the literal stdout/stderr and the literal process exit code of each check,
captured on 2026-07-29 by `make-demo.sh` against the demo repo it generates. Every number
below came from the process, not from a model reading output and reporting a number.

Reproduce it yourself — that is the point of a transcript over a video:

```bash
bash docs/demo/make-demo.sh /tmp/veriloop-demo   # regenerate + re-capture
bash docs/demo/replay.sh    /tmp/veriloop-demo   # re-run and diff against this record
```

Environment: node v20.13.1, macOS. `typescript` and `eslint@9` fetched via `npx` at capture
time; the `test` check needs neither and runs offline.

---

## check: `test` — `node --test src`

**exit code: 1**

```
TAP version 13
# Subtest: total sums an empty cart to zero
not ok 1 - total sums an empty cart to zero
  ---
  duration_ms: 1.590042
  location: 'file:///private/tmp/veriloop-demo/src/total.test.js:5:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    1 !== 0

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
```

Seeded defect: `src/total.js` reduces from `1` instead of `0`.

## check: `typecheck` — `tsc --noEmit`

**exit code: 1**

```
src/price.ts(6,42): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

Seeded defect: `formatPrice('1999')` passes a string to a `number` parameter.

## check: `lint` — `eslint src`

**exit code: 1**

```
/private/tmp/veriloop-demo/src/cart.js
  3:9  error  'discount' is assigned a value but never used  no-unused-vars

✖ 1 problem (1 error, 0 warnings)
```

Seeded defect: an unused `discount` binding.

## the fourth defect: no check fires

`src/render.js` interpolates a user-supplied string straight into `innerHTML`. All three
checks above **pass over it** — verified: the string `render.js` appears zero times in all
three captured logs. It is valid, used, ESM-clean code with the browser global declared.

It is seeded as a **lens-layer target. No lens has been run against it here.** What is
recorded is only that the line exists and that the exit codes are silent about it.

That gap is the honest summary of what an exit-code gate is and is not: it proves what a
command can decide, and it is completely quiet about everything a command cannot.

---

## Two things this record is not

**It is not a recording.** There is no `.cast` and no GIF anywhere in this repo, deliberately.
`/dev-loop` is not a program that emits a terminal stream — `.claude/workflows/veriloop-dev-loop.js`
and `scripts/templates/dev-loop.template.js` contain **zero** `child_process` / `spawnSync` /
`execSync` calls, and the gate's commands are handed to an LLM subagent by a prompt string.
So a `.cast` purporting to show `/dev-loop` would have to be authored frame by frame rather
than captured, and a synthesized timing track is the whole forgery. See
`dev-loop-capture.md` for the ten-minute runbook that closes this honestly, with a real
`asciinema rec` over a real interactive session.

**It is not evidence that veriloop's gate ran.** These are the demo repo's own commands, run
directly. They establish that the seeded defects are real and that the exit codes are real.
They do not establish that `/dev-loop` triaged, reviewed, or gated anything — that is the
part which needs the interactive capture above.

What veriloop contributes on top of these commands, and what is separately checkable in this
repo: the gate is **wired** to exactly these commands rather than described in prose. See
`.claude/veriloop/veriloop-manifest.json` `gate_commands`, the emitted workflow's `gate`
array, and the parity check at `scripts/lint-bundle.mjs:177` that fails the build when those
two disagree.
