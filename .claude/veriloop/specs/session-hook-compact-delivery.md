# Spec: the routing payload survives compaction, and matcher drift becomes visible

**Status:** RATIFIED — BINDING (owner, 2026-08-04)
**Date:** 2026-08-04
**Version:** 0.5.0 (no bump; nothing has shipped)

> Ratified in full view of the four OPEN RISKS below. The owner accepted RISK 1 — a
> structural guarantee (the hook does not fire mid-work) is replaced by prose that biases but
> cannot compel, with no probe yet run under compaction — as a known cost, not a solved
> problem. RISKS 2, 3 and 4 remain open and are not addressed by this spec.

Supersedes the non-goal at `session-routing-redesign.md:235` ("the `SessionStart` matcher
list stays pinned in both directions"), which is amended in the same change.

---

## The feature, in one line

The routing payload is re-injected after a compaction, and veriloop's lint stops reporting
`wired` over a matcher it never reads.

---

## Origin — an observed incident, not a predicted one

A session compacted mid-work. Compaction evicted the injected payload; the matcher is
`startup|clear`, so nothing re-injected it. The next request was an open-ended question —
row 2, `/advise` — and it was answered directly, unrouted and unannounced, because the
table was gone. Routing stayed dead for the rest of the session.

This matters because the existing exclusion rationale (`render.mjs:1008-1013`) is a
**predicted** harm — re-entry into a running command — while the gap it protects is now an
**observed** one. The council did not treat that as decisive on its own; see RISK 1.

---

## Change A — `compact` joins `SESSION_START_SOURCES`

`SESSION_START_SOURCES = ['startup', 'clear', 'compact']`.

**ONE payload.** The existing `renderSessionRouting()` output, unparameterized. **No stdin
read, no second payload variant, no branching on the hook's `source`.** An earlier draft of
this plan proposed a weakened compact-specific payload; the council rejected it unanimously
across two rounds, on four independent grounds recorded in "Rejected alternatives" below.

### Why widening is not net-zero

`<ALREADY-ROUTED>` (`session-routing.md:12`) already says *"you are resuming one after a
compaction … Continue the task in flight; do not re-enter the command you are running."*
That clause is a **suppressor, not a supplier**: it can only mute text that is in context,
and compaction evicts the entire payload including the clause itself.

- For the command **in flight**, wiring `compact` buys nothing. Conceded by all three seats.
- For the owner's **next** request after that work finishes, today the table is absent and
  routing is dead for the session's remaining life. That is the whole payoff.

### Why `resume` and `fork` stay excluded

Both replay or copy an existing transcript, so the payload is still present; re-injecting
would duplicate it. `compact` is the only `SessionStart` source that begins with the payload
**absent**.

**Caveat, carried deliberately:** nothing in this repo grounds that claim about harness
behavior — `render.mjs:1013` asserts it and no test verifies it. If `--resume` does not in
fact replay the payload, the exclusion of `resume` is wrong for the same reason `compact`'s
was. Out of scope here; recorded so the next reader does not mistake it for verified.

---

## Change B — lint check 8a reads the matcher

**The defect, proven by probe (2026-08-04, before implementation):** `wiresSessionHook`
(`render.mjs:1062-1067`) tests `h.command` only and never reads `matcher`.

| matcher under test | `wiresSessionHook` returns |
|---|---|
| `"startup\|clear"` | `true` |
| `"startup\|clear\|compact"` | `true` |
| `"PreToolUse"` | **`true`** |
| `""` | **`true`** |
| `"banana"` | **`true`** |

So `lint-bundle.mjs:546` prints `SessionStart routing hook wired` for a hook that **can never
fire**. Combined with `handOnce` preservation (`generate.mjs:538`, rationale `:516-521`), an
installed adopter never receives a matcher change and nothing tells them: the template moves,
their file does not, and their gate stays green. This is the false-green class
`selftest.mjs:2727` exists to kill, one layer out — and it is **live today, independent of
Change A**.

### The check

Check 8a additionally compares the wired matcher's `|`-split token set against
`SESSION_START_SOURCES`:

- **Overreach** (a token veriloop does not wire) → **FAIL.** Not re-injecting into
  mid-work sources is a safety property veriloop owns.
- **Uncovered** (a source veriloop wires that the file omits) → **WARN, never FAIL.**
  `.claude/settings.json` is hand-owned; whether to adopt a new source is the adopter's call,
  and a supported choice must not turn their gate red.
- The `ok(...)` line prints the **actual matcher tokens**, so the wired verdict stops being
  silent about what it checked.

Written from lint's own constants, mirroring — never importing — the selftest, so
constitution rule 9's two-witness property survives.

---

## Change C — the exclusion prose, in four places

Change A falsifies published text that says `compact` is deliberately excluded. All four
sites are rewritten in the same change:

| site | what is false after Change A |
|---|---|
| `scripts/lib/render.mjs:1007-1019` | `"resume` and `compact` are DELIBERATELY excluded"` |
| `scripts/selftest.mjs:2726-2738`, `:2744` | `"the two no-task-in-flight sources"` |
| `SECURITY.md:83-87` | `"On `startup` and `clear` only … `resume` and `compact` are deliberately **not** wired"` |
| `CHANGELOG.md:237-240` | `"The hook fires on `startup` and `clear` only."` |

**Delete the numeral, do not update it.** `render.mjs:1008` and `CHANGELOG.md:237` both say
Claude Code "documents four" `SessionStart` sources; there are five (`fork` is neither wired
nor mentioned anywhere in the repo). Name the excluded sources and drop the count — a typed
count beside a constant that already knows it is how this repo shipped contradicting files
before (`routeWordFor()`, `render.mjs:1090`).

---

## Change D — this repo's own committed settings

`.claude/settings.json:8` must be hand-edited to `startup|clear|compact`.
`selftest.mjs:3296-3301` asserts the **committed** matcher against `SESSION_START_SOURCES`
and its message states the reason: *"settings.json is hand-owned so a re-run will NOT correct
it."* The gate fails until the hand edit lands. This is the doubling working as designed, not
an obstacle to route around.

---

## Non-goals — binding

- **No stdin read in `session-start.mjs`.** Its fail-open property is *structural* today: one
  `existsSync` guard and no throw path. Parsing harness JSON introduces hang, EOF and
  malformed-input paths on every session start, and fail-open becomes something that must be
  implemented and remembered.
- **No second payload variant, at any future point.** `render*()` taking no arguments is what
  makes byte-equality decidable (`lint-bundle.mjs:565`); that check exists because an appended
  `.env`-exfil payload once passed both gates fully green. A runtime-branched payload is also
  unassertable at build time, so `session-routing-redesign.md:155`'s
  mutation-must-go-RED requirement could not be met.
- **No `UserPromptSubmit` hook.** Rejected 3–0. It does not subsume this change (nothing but
  `SessionStart` runs before the first post-compact turn), it makes the owner's prompt text
  into hook stdin — untrusted input reaching control flow — it multiplies the injection sink
  from once per session to once per turn, and its token cost hastens the compaction it claims
  to survive.
- **No `PreToolUse` hook.** Carried unchanged from `session-routing-redesign.md:235`.
- **The matcher list stays pinned in BOTH directions.** Membership changes; the pin does not.
- **The hook remains prose.** It biases; it cannot compel. No claim here or in the payload may
  say otherwise.

---

## Rejected alternatives — recorded so they are not re-proposed

**Weakened compact-specific payload + `source` branch on stdin.** Rejected unanimously:
(1) `<ALREADY-ROUTED>` already carries its content verbatim, pinned at
`selftest.mjs:3019-3021`; (2) it would be **terminal, not transient** — every long session
eventually auto-compacts and nothing re-injects the strong payload afterward, so the weakened
variant would govern every remaining request in that session, trading "no routing" for
"permanently degraded routing"; (3) unassertable at build time; (4) it breaks structural
fail-open and the byte-equality integrity model.

---

## Acceptance criteria

Gate = `npm run test` + `node scripts/lint-bundle.mjs --bundle .`, both green.

1. `SESSION_START_SOURCES` is `['startup','clear','compact']`; the emitted matcher and this
   repo's **committed** matcher both carry all three, asserted in both directions.
2. The payload is emitted **unparameterized** — `renderSessionRouting()` still takes no
   arguments, and `session-start.mjs` still reads no stdin. Asserted, not merely true.
3. Lint check 8a FAILs on matcher overreach, WARNs on an uncovered source, and prints the
   actual matcher tokens in the wired line.
4. **Mutation-verified:** a bundle wiring `matcher: "PreToolUse"` must make check 8a go RED.
   Today it reports `wired` — the probe above proves it. A test that passes before the change
   is not evidence.
5. **Non-vacuity:** the new assertions must fail on a bundle whose matcher omits `compact`,
   so they cannot pass on the pre-change tree.
6. All four prose sites in Change C are updated, and no site states a count of `SessionStart`
   sources.
7. No new `.md` payload file and no second renderer.

---

## OPEN RISKS — carried from the premise rider, NOT cleared

**RISK 1 — the exclusion rationale may be the better-reasoned document.** The premise rider's
central charge: `render.mjs:1007-1018` argues re-entry is *structural*, and this spec replaces
a structural guarantee (the hook does not fire) with prose that the ratified spec itself says
"biases; it cannot compel" (`session-routing-redesign.md:241-242`). `compact` cannot
distinguish manual from auto, so the payload **will** land inside a running `/dev-loop`. The
drift seat put it plainly: *"I am trading a measured incident (n=1) for an unmeasured
re-entry risk on the repo's most expensive command."* **No probe has been run under
compaction.** This risk is accepted, not solved.

**RISK 2 — the pre-mortem's wreck.** A year on, the owner is filing bugs that Claude "still
doesn't route mid-session," and there are two mechanisms asserting continue-the-task —
`<ALREADY-ROUTED>` and the matcher — that have drifted, with nobody able to say which is
authoritative. Change A's single-payload constraint is the mitigation; it is a constraint, not
a mechanism, and nothing enforces it beyond the non-goals above.

**RISK 3 — the opposite case, stated in full and NOT clearly weaker.** The rider argued
*"This case is not weaker. It is stronger"* for building nothing here and building
`UserPromptSubmit` instead, on the grounds that per-message injection is what the owner
actually described wanting and makes the compact question moot. The council rebutted it 3–0
(see Non-goals), and the rebuttal's load-bearing claim — that nothing but `SessionStart` runs
before the first post-compact turn — is verified from the hook documentation, not from this
repo. **If the owner's real requirement is per-message routing rather than post-compaction
recovery, this spec is the wrong build and the correct action is to build nothing here.**

**RISK 4 — Change B's WARN is a judgment call that could go either way.** WARN-on-uncovered
keeps a supported adopter choice from turning their gate red, but it also means the delivery
gap this spec exists to close is closed with a message an adopter may ignore. FAIL would
close it harder and break adopters who deliberately declined a source. The baseline seat
argued this is a contract change to a published check that deserves its own interview; it is
being taken here instead.

---

## Off-ramp

`/dev-loop` builds to this spec. The gate runs `npm run test` + `lint-bundle` on real exit
codes and stops before merge.

---

## Pending owner decision — 2026-08-15 (recorded by the remediation drive; ratified text above unchanged)

**Provenance.** The 2026-08-15 two-week `/review` of `feat/resolve-to-clean` observed that
what shipped for Change B is a **three**-verdict table, while the table ratified above names
**two**. This block records the discrepancy against the spec it belongs to; it decides
nothing and amends nothing. Written by the review-remediation drive
(`.claude/veriloop/specs/review-remediation-2026-08-15.md`, Q1 and D4). Every line above
this heading is byte-unchanged.

**The discrepancy, stated exactly.** Change B's check enumerates two verdicts — *overreach →
FAIL*, *uncovered → WARN, never FAIL*. The shipped check has a third: an **empty or absent**
matcher (`unconstrained`) is its own **FAIL** (`scripts/lint-bundle.mjs`, the
`wires the SessionStart routing hook on an EMPTY (or absent) matcher` branch). It is not
reachable through the ratified two: `.filter(Boolean)` erases an unset matcher into zero
tokens, so *overreach* has nothing to object to and *uncovered* names every source — a
verdict that reads `(matcher: )` and exits 0, the widest possible false green. The literal
ratified text therefore prescribes **WARN** for the one case both readings of the harness
make red: match-all re-injects the full-strength block into `resume` and `fork`, and
match-none is a hook that can never fire.

**Why FAIL is retained meanwhile.** As the fail-safe, not as a decision. Downgrading it to
the literal WARN before the owner has ruled would restore a green verdict for a hook that may
never fire, and a WARN can be ignored indefinitely; the reversible direction is to stay red
and ask. (A fourth branch — an unrecognized matcher *spelling* — was added 2026-08-15 and is
deliberately **not** a new verdict class: it reuses the FAIL exit with an honest
"cannot verify this matcher form" message. It is listed here only so the count is not a
surprise at merge.)

**The owner's options at merge, none of them taken here.**

1. **Amend the spec** — add `unconstrained → FAIL` to Change B's table as a third verdict,
   ratifying what shipped.
2. **Fold it into overreach** — treat an unset matcher as the maximal overreach it may be,
   keeping the table at two verdicts and the behavior red.
3. **Downgrade to WARN** per the literal ratified text, accepting the false-green case above
   as an adopter's supported choice.

Option 3 is the only one that changes shipped behavior. Whichever is chosen, the disposition
belongs in this spec, not in a code comment. **Counter-signed — owner instruction, 2026-08-16:
*"just go ahead with your recommended paths for the merge review docket, then merge."*** The
disposition that instruction ratified is recorded in the block below.

---

## Resolved — 2026-08-16 (owner ratification)

**Authority, quoted verbatim.** The owner wrote, 2026-08-16, in response to the merge-review
docket that queued Q1–Q4 of `.claude/veriloop/specs/review-remediation-2026-08-15.md`:
*"just go ahead with your recommended paths for the merge review docket, then merge."* The
recommended path for Q1 was **option 1 — amend the spec**. That sentence is the authority for
this block and for nothing else; every line above the "Pending owner decision" heading remains
byte-unchanged, and the ratified text of Changes A–D is untouched except as amended here.

**The amendment.** Change B's verdict table is amended, as a dated amendment and not a
rewrite, to name a **third** verdict:

| matcher under test | verdict |
|---|---|
| a token veriloop does not wire (**overreach**) | **FAIL** |
| a source veriloop wires that the file omits (**uncovered**) | **WARN, never FAIL** |
| an **empty or absent** matcher (`unconstrained`) | **FAIL** *(added 2026-08-16)* |

This ratifies what already ships: `scripts/lint-bundle.mjs`, the branch whose message begins
*"wires the SessionStart routing hook on an EMPTY (or absent) matcher"* — cited by its message
and not by a line number, which the block above already does and which this file's own Change C
gives the reason for. **No code change was required or made:** the FAIL was retained as the
fail-safe when the discrepancy was recorded, it is covered by its own case, and ratification
moves the spec to the code rather than the code to the spec.

**Rationale — fail-safe, and the exposure is the reason.** An unconstrained matcher is not one
more misspelling; it fires on **every** `SessionStart` source, including the two this spec
deliberately excludes (`resume` and `fork`) and every source added to the harness in future.
The WARN reading prescribed by the literal ratified text would therefore green-light the
single **highest-exposure** spelling in the space — re-injecting the full-strength payload
into exactly the sessions Change A's own reasoning says must not receive it, or, in the
match-none reading, blessing a hook that can never fire. A verdict that is ignorable by design
is the wrong instrument for the one case both readings of the harness make red.

**What this does NOT do.** It does not create a verdict class for the fourth branch — an
unrecognized matcher *spelling* still reuses the FAIL exit with its "cannot verify this
matcher form" message, exactly as recorded above, and is not a fourth row in this table. It
does not touch the `uncovered → WARN` ruling, whose judgment-call status stays recorded as
RISK 4. It carries no licence beyond this table.
