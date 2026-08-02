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
**you do not have a choice** about routing through them. Route FIRST, then work. Name the
route you took in your first sentence: neither route writes code — `/advise` is read-only and
`/dev-plan` writes only a spec the owner ratifies — so saying it gives the owner a turn to
send you elsewhere before anything is built.
</EXTREMELY-IMPORTANT>

## Where to route

| When the owner's message is | Route to |
|---|---|
| an OPEN-ENDED QUESTION — you are being asked to think, weigh, compare or advise, and nothing is being asked to change | `/advise` |
| ANYTHING NOT COVERED BY THE ROW ABOVE — a feature request, an implementation request, a bug report, a one-line fix, a typo | `/dev-plan` |

**Two rows, read IN ORDER, and row 2 is RESIDUAL** — it takes everything row 1 does not, so
there is always exactly one answer and never a judgment call about which row wins. A message
that is both a question and a request to change something is a request: row 2.

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

Then note it in the session's working notes / summary — the running record of what this
session did — recording **which veriloop command fired** and **whether this block routed it or
the owner invoked it directly**. One line is enough. `/advise` is read-only and cannot write a
record of its own invocation, so the session notes are the only place this is kept.

## Red flags — thoughts that mean you are about to skip the route

| If you catch yourself thinking | The correct move |
|---|---|
| "this is just a simple question" | If nothing is being asked to CHANGE, a question is row 1 — route to `/advise`. If something is, it is row 2 and the question framing is not a reason to skip it. |
| "let me explore the codebase first" | Both routes open with their own recon — `/advise` with the repo's domain expert seated, `/dev-plan` with a deep-scan-grounded pass. Exploring first is doing the command's first step badly. |
| "the skill is overkill" | It may well be, and `/dev-plan` is where that gets DECIDED. Route there and say why you think so; if the change really is a one-liner clear of every danger surface, `/dev-plan` cites that and hands it straight to `/dev-loop` with no interview and no spec. |
| "I need more context first" | Getting context is what the route is for — `/advise`'s dialogue and `/dev-plan`'s interview both ask the owner. Ask inside the command, not instead of it. |

## Turning this off

Delete the `SessionStart` entry from `.claude/settings.json`. That removes **both**
routes at once — there is no partial disable — and the commands remain invocable by hand.
Deleting THIS file is not a disable: it is **machine-owned** and rewritten on the next
`/veriloop` run, so routing would silently resume. Hand edits here are overwritten for the
same reason — change `SESSION_ROUTES` / `SESSION_RED_FLAGS` / `SESSION_ANNOUNCE` in the
generator instead.
