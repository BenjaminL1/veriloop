# veriloop session routing

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore this block. It is for
the MAIN session only. A council seat, a review lens or a dev-loop implementer that re-routes
recurses into the surface that spawned it — `/advise` from inside `/advise`. Do your task.
</SUBAGENT-STOP>

<ALREADY-ROUTED>
Scope: the COMMAND IN FLIGHT, not the session. If this MAIN session is already executing a
veriloop command — you are inside `/advise`, `/dev-plan` or `/dev-loop`, or you are resuming
one after a compaction or a `--continue` — you have already routed FOR THAT REQUEST.
Continue the task in flight; do not re-enter the command you are running.
Two things this does NOT suspend. A **handoff is not a re-entry**: `/dev-plan` handing a
ratified spec — or a change it judged trivial and cited — to `/dev-loop` is the designed
path, and nothing here blocks it. And routing is **per REQUEST, not once per session**: when
the command finishes, the owner's next message routes from the table below like any other.
</ALREADY-ROUTED>

<EXTREMELY-IMPORTANT>
This repo has veriloop installed. Its commands are the entry points for real work here, and
**when a row of the table below names a command, you do not have a choice** about routing
through it. Route FIRST, then work. The one exception is the **no-route row**, which names no
command: a request that only READS is answered directly. That is the table deciding, not you
deciding to skip it — you still have to match a row, and you still have to say which one.
Name what you did in your first sentence: neither route writes code — `/advise` is read-only
and `/dev-plan` writes only a spec the owner ratifies — so saying it gives the owner a turn to
send you elsewhere before anything is built.
</EXTREMELY-IMPORTANT>

## Where to route

| When the owner's message is | Route to |
|---|---|
| a request for INFORMATION THAT ALREADY EXISTS, where nothing the owner would review changes — report test or build results, read or summarize a file, answer a question about git state, run a command whose only effect is its output | **no route — answer directly** |
| an OPEN-ENDED QUESTION — you are asked to think, weigh, compare or advise; the answer does not exist yet and has to be reasoned into being | `/advise` |
| ANYTHING NOT COVERED BY THE ROWS ABOVE — a feature request, an implementation request, a bug report, a one-line fix, a typo, and anything that changes reviewable state | `/dev-plan` |

**3 rows, read IN ORDER, and row 3 is RESIDUAL** — it takes everything rows 1–2
do not, so there is always exactly one answer and never a judgment call about which row wins.

**The no-route row's test is SEMANTIC state, not bytes.** If carrying out the request changes
anything the owner would review, ship, or find in a diff — a tracked file, the index, a ref, a
worktree, a deliverable — it is NEVER the no-route row, however precisely the operation was
named. Mutating operations — delete, move, rename, revert, regenerate — take the residual row,
where triviality gets decided with a cited danger surface and the gate still runs.
**Explicitly permitted in the no-route row:** incidental, gitignored, reproducible byproducts
of a read-only command — build caches, `target/`, test binaries, coverage output, temp files.
Running the suite writes them, and *"report the build results"* is this row's own headline
example; delete them and re-run and the state is identical, and none of it appears in a diff,
so there is nothing there to gate.

**The capability test — the anti-rephrasing backstop.** Grammar alone is gameable: *"change
448 to 464"*, *"what's the correct figure?"* and *"does the run print 464?"* are one intent in
three sentences, and word choice alone would send them to three different rows. So: **if
answering requires a tool that WRITES something reviewable, it is the residual row — whatever
the sentence looks like.** Capability governs; grammar does not.

**Compound messages: MOST-SEVERE WINS.** A message spanning rows takes the highest row any
part of it needs. *"Show me the test results and fix the failures"* is the residual row,
entire. Splitting a mixed message and routing the halves separately is a general
skip-the-gate lever, because any change request can be prefixed with a verifiable claim. The
read still happens, inside the routed command's own recon.

**`/dev-loop` is NOT a routing destination** — you never send a session there from this
table. It is reached only through `/dev-plan`, which decides how much process a change gets:
the full spec for anything real, and for a genuine one-liner clear of every danger surface a
direct handoff with no interview and no spec — the gate still runs either way. That judgment
is `/dev-plan`'s, it has to CITE the danger surface it cleared, and it is not yours to make
here instead of routing.

## Say that you routed, and say who routed you

When this block is why you enter a veriloop command, **announce it in your reply before you
do the work** — one plain sentence, in the shape superpowers uses:

> Using `/dev-plan` to <purpose> — routed by veriloop's SessionStart hook, not requested directly.

Name the command and why that route (which row of the table above you matched) — the same
sentence with `/advise` when the message was an open-ended question. If the OWNER
typed the command themselves, say that instead — *"running `/advise` as you asked"* — because
the two are not the same event and only one of them was the owner's decision. If you consider
this block and route somewhere OTHER than the table sends you, say that and say why.
The owner never sees this payload. An unannounced route is a reply shaped by an instruction
they did not write and cannot audit.

**The no-route row is announced too.** It enters no command, so there is nothing to name —
announce it anyway, in one sentence: *the no-route row matched, and here is what I read to
answer.* This is the ONE carve-out in the requirement above, and it is stated because without
it the instruction reads as "you must always be able to name a skill" — a thumb on the scale
toward the rows that name one. The no-route row leaves no spec and no history record behind;
this sentence is the only trace it ever happened.

Then note it in the session's working notes / summary — the running record of what this
session did — recording **which veriloop command fired** and **whether this block routed it or
the owner invoked it directly**, or, when the no-route row matched, **that no command fired and
what was read**. One line is enough. `/advise` is read-only and cannot write a
record of its own invocation, so the session notes are the only place this is kept.

## Red flags — thoughts that mean you are about to skip the route

| If you catch yourself thinking | The correct move |
|---|---|
| "this is just a simple question" | A question that asks you to THINK — weigh, compare, advise, reason an answer into being — is the `/advise` row. A question whose answer ALREADY EXISTS, and answering it changes nothing, is the no-route row: answer it. If something is being asked to CHANGE, it is the residual row and the question framing is not a reason to skip it. |
| "let me explore the codebase first" | Both routes open with their own recon — `/advise` with the repo's domain expert seated, `/dev-plan` with a deep-scan-grounded pass. Exploring first is doing the command's first step badly. |
| "the skill is overkill" | It may well be, and `/dev-plan` is where that gets DECIDED. Route there and say why you think so; if the change really is a one-liner clear of every danger surface, `/dev-plan` cites that and hands it straight to `/dev-loop` with no interview and no spec. |
| "I need more context first" | Getting context is what the route is for — `/advise`'s dialogue and `/dev-plan`'s interview both ask the owner. Ask inside the command, not instead of it. |
| "I can just do this one myself" | That is the no-route row's OVER-claim, and it is the one mistake here that is silent. The no-route row is for requests that only READ. If carrying this out changes anything the owner would review, ship, or find in a diff, it is not that row — route it, however small it looks. |

## Turning this off

Delete the `SessionStart` entry from `.claude/settings.json`. That removes **both**
routes at once — there is no partial disable — and the commands remain invocable by hand.
Deleting THIS file is not a disable: it is **machine-owned** and rewritten on the next
`/veriloop` run, so routing would silently resume. Hand edits here are overwritten for the
same reason — change `SESSION_ROUTES` / `SESSION_NO_ROUTE` / `SESSION_RED_FLAGS` /
`SESSION_ANNOUNCE` in the generator instead.
