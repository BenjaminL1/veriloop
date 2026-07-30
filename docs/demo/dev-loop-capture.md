# Runbook — capture a real `/dev-loop` recording (closes DA2)

DA2 (`docs/plans/m5-plan.md`) asks for an asciinema/GIF of `/dev-loop` catching a real
failure. **It is not met, and it was not faked.** It needs one interactive session, which an
autonomous executor cannot drive. This is the ten-minute procedure to close it.

## Why this could not be automated

`/dev-loop` is not a program that emits a terminal stream. Verified: `grep -cE
"child_process|spawnSync|execFileSync|execSync|spawn\("` over both
`.claude/workflows/veriloop-dev-loop.js` and `scripts/templates/dev-loop.template.js` returns
**0 and 0**. The gate's commands are handed to an LLM subagent by a prompt string
(`veriloop-dev-loop.js`, `runChecks`). There is no process whose output could be piped into a
recorder — a `.cast` of `/dev-loop` would have to be authored frame by frame.

So the rule applied was: real output with real timings is a recording; real output with
**synthesized timings** is a forgery, because the timing track is the only thing that makes
the file a recording rather than a transcript. Nothing was produced. What exists instead is
`gate-record.md` (real commands, real exit codes, labelled a transcript) and `replay.sh`
(reproduces them on demand).

## Prerequisites

None are installed on the authoring machine — verified `asciinema`, `agg`, `vhs` and
`termtosvg` are all absent; only `/usr/bin/script` exists.

```bash
brew install asciinema      # the recorder
brew install agg            # optional: .cast -> .gif for embedding
```

## Procedure

**1. Pick the subject.** Either works; the demo repo is the better story.

- *The demo repo* — richer, three defect classes on three different signals:
  ```bash
  bash docs/demo/make-demo.sh ~/veriloop-demo
  cd ~/veriloop-demo && claude
  /veriloop                     # generate a bundle for it
  ```
- *veriloop itself* — self-hosting, no setup; `.claude/commands/dev-loop.md` already exists.

**2. Record.**

```bash
asciinema rec ~/dev-loop-gate.cast --title "veriloop /dev-loop catches a red gate"
claude
/dev-loop fix the off-by-one in total()
# let it run to the gate verdict, then:  exit
```

Keep the real timings. If it feels slow, that is what it is — trim with `asciinema cat` only
by cutting whole segments, never by rewriting timestamps.

**3. Check it shows a genuine failure.** The recording is only worth having if the gate
actually goes red. It should show a non-zero exit code and a `FAIL` or `CONCERNS` verdict, not
a model's prose opinion. If the loop passes on the first try, seed a defect and re-record.

**4. Convert (optional) and place.**

```bash
agg ~/dev-loop-gate.cast docs/demo/dev-loop-gate.gif
```

**5. Update the record — do not leave the negative statements standing.** Three places
currently say no recording exists, and all three must change together:

- `README.md` — replace the "not yet published" sentence with the link
- `docs/demo/gate-record.md` — its "Two things this record is not" section
- `docs/plans/m5-plan.md` — exit criterion 3 in the ledger, `NOT MET (partial)` → `MET`

**6. Re-check the inverted verify.** m5:265-266's original test (`grep 'asciinema\|.gif\|.cast'
README.md` → exit 0) is unsound: it passes on a sentence saying no recording exists. The
replacement asserts a real asset:

```bash
find . -name '*.cast' -o -name '*.gif' | grep -q . && grep -q 'dev-loop-gate' README.md
```

## What NOT to do

Do not synthesize a `.cast` from `gate-record.md`'s captured output, even with a banner
saying the timings are reconstructed. A footnote can repair a claim about pacing; it cannot
repair a claim about occurrence. And do not place a capture of a single tool (`tsc` exiting 1)
where a reader will take it for veriloop's gate — the substitution happens at placement,
before any caption is read.
