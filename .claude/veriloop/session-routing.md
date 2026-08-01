# veriloop session routing

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore this block. It is for
the MAIN session only. A council seat, a review lens or a dev-loop implementer that re-routes
recurses into the surface that spawned it — `/advise` from inside `/advise`. Do your task.
</SUBAGENT-STOP>

<ALREADY-ROUTED>
If this MAIN session is already executing a veriloop command — you are inside `/advise`,
`/dev-plan` or `/dev-loop`, or you are resuming one after a compaction or a `--continue` —
you have already routed. Continue the task in flight; do not re-enter the command you are
running. Routing is a decision taken once, at the top of a session, never a loop.
</ALREADY-ROUTED>

<EXTREMELY-IMPORTANT>
This repo has veriloop installed. Its commands are the entry points for real work here, and
**you do not have a choice** about routing through them. Route FIRST, then work. Name the
route you took in your first sentence, so the owner can redirect you before you spend tokens.
</EXTREMELY-IMPORTANT>

## Where to route

| When the owner's message is | Route to |
|---|---|
| an open-ended question — anything that is not a direct implementation request | `/advise` |
| a feature request | `/dev-plan` |
| an implementation request | `/dev-loop` |

## Say that you routed, and say who routed you

When this block is why you enter a veriloop command, **announce it in your reply before you
do the work** — one plain sentence, in the shape superpowers uses:

> Using `/advise` to <purpose> — routed by veriloop's SessionStart hook, not requested directly.

Name the command and why that route (which row of the table above you matched). If the OWNER
typed the command themselves, say that instead — *"running `/advise` as you asked"* — because
the two are not the same event and only one of them was the owner's decision. If you consider
this block and route ANYWAY for your own reasons, or decline to route at all, say that too.
The owner never sees this payload. An unannounced route is a reply shaped by an instruction
they did not write and cannot audit.

Then note it in the session's working notes / summary — the running record of what this
session did — recording **which veriloop command fired** and **whether this block routed it or
the owner invoked it directly**. One line is enough. `/advise` is read-only and cannot write a
record of its own invocation, so the session notes are the only place this is kept.

## Red flags — thoughts that mean you are about to skip the route

| If you catch yourself thinking | The correct move |
|---|---|
| "this is just a simple question" | A question IS the `/advise` case. Route. |
| "let me explore the codebase first" | `/advise` does its own recon, with the repo's domain expert seated. Exploring first is doing the command's first step badly. |
| "the skill is overkill" | You are not the one who decides that. Route, and say in one line why it may be overkill. |
| "I need more context first" | Getting context is what the route is for. Ask the owner inside the command, not instead of it. |

## Turning this off

Delete the `SessionStart` entry from `.claude/settings.json`. That removes **all three**
routes at once — there is no partial disable — and the commands remain invocable by hand.
Deleting THIS file is not a disable: it is **machine-owned** and rewritten on the next
`/veriloop` run, so routing would silently resume. Hand edits here are overwritten for the
same reason — change `SESSION_ROUTES` / `SESSION_RED_FLAGS` / `SESSION_ANNOUNCE` in the
generator instead.
