# Spec: routing measurement — pre-registered probe battery + natural floor-check

**Status:** RATIFIED — BINDING (owner, 2026-08-10)
**Date:** 2026-08-10
**Version:** 0.5.0 (no bump; a measurement protocol, not a bundle change)

> Ratified in full view of the OPEN RISKS below, including RISK 4: if the battery is clean
> and the window stays quiet, the honest reading is that the hypothesized failure never
> existed, and the owner has agreed to accept that outcome.

---

## The claim being tested, in one line

The owner's hypothesis: *the model ignores routing even when the payload is present in
context.* Measured, not argued — by an active probe battery today (primary verdict) plus a
two-week natural floor-check (guard against the battery's easy-case bias).

## Why not a retrospective audit (rider findings, verified 2026-08-10)

Of the 10 pre-existing transcripts: 7 predate the payload; the rest span three
incompatible payload versions from one week; the no-route announcement exists only in the
newest; typed-command markers and `Skill` tool_use are disjoint channels (131 vs 17). The
population that matters began accumulating 2026-08-10, when the compact matcher merged.

---

## Arm 1 — the probe battery (runs 2026-08-10)

**Mechanics.** 36 independent headless sessions (`claude -p`, cwd = this repo, fresh
session each, `--max-turns 1` so a route is *observed* but its command never actually
executes — no councils spawned, no cost explosion, no writes). Model: **Fable** (the
owner's session default — the model whose routing is actually experienced). Runner lives
in the session scratchpad, never in the repo. Runner records every probe's session ID so
the floor-check arm can exclude synthetic sessions.

**Detection, per probe, from the first assistant turn:** a `Skill` tool call for
`advise`/`dev-plan` (exact), or an announcement naming the route (regex), or a no-route
announcement (regex, labelled heuristic). Payload injection is verified per session from
the transcript before the probe counts.

**Pre-registered verdict rules — locked before any probe runs:**
- **Miss** = a should-route probe whose first turn neither invokes nor announces its
  expected command. Routing to the *other* command is scored `routed-wrong`, reported
  separately, not a miss.
- **Under-routing threshold: ≥2 misses landing on ≥2 distinct base intents** → the
  `UserPromptSubmit` constant-nudge becomes the sanctioned next step (via `/dev-plan`,
  amending the ratified non-goal, rates attached — never prompt text).
- **Over-routing check: ≥2 controls routed, on ≥2 distinct control intents** → evidence
  *against* the nudge (it would amplify exactly this). If BOTH thresholds trip, the data
  is mixed: no automatic sanction either way; both numbers go to `/dev-plan`.
- A clean battery is a **bounded negative** (easy-case ceiling), not proof of absence —
  the floor-check below covers the floor.

**The pre-registered probe set — verbatim, fixed now.**

*Should-route → `/advise` (4 intents × 3 paraphrases):*
- A1a "should veriloop's lint also validate the manifest's version stamps, or is that overkill?"
- A1b "is it worth making lint-bundle check the version stamps in the manifest too? what's the tradeoff?"
- A1c "I'm debating whether version-stamp validation belongs in lint — what do you think?"
- A2a "what's the best way to make the constitution easier for new adopters to understand?"
- A2b "how could we make the constitution rules more approachable for someone new to veriloop?"
- A2c "brainstorm ways to lower the learning curve of the constitution for first-time users"
- A3a "should the detector support python/poetry next, or is rust polish more valuable?"
- A3b "which is the better next investment: poetry support in detect, or improving the cargo path?"
- A3c "help me weigh adding poetry detection against deepening rust support"
- A4a "how should veriloop think about monorepos with multiple package.json files?"
- A4b "what's the right architecture for handling multi-package monorepos in detect?"
- A4c "I want your take on strategies for multi-package.json repos before we build anything"

*Should-route → `/dev-plan` (4 intents × 3 paraphrases):*
- D1a "add a --quiet flag to lint-bundle that suppresses the ok lines"
- D1b "give lint-bundle a quiet mode so it only prints warnings and failures"
- D1c "implement a flag that hides the ✓ lines in lint-bundle output"
- D2a "fix the stale comment in selftest.mjs that still says 374 selftests"
- D2b "the comment near the top of selftest.mjs mentions an old test count — correct it"
- D2c "update that outdated '374 selftests' comment in the selftest"
- D3a "rename scan-notes.md to danger-surfaces.md everywhere"
- D3b "change the scan-notes filename to danger-surfaces and update all references"
- D3c "I want scan-notes.md called danger-surfaces.md across the repo"
- D4a "the gate figure in the README looks wrong, update it"
- D4b "README's published test count doesn't match the suite — fix it"
- D4c "correct the gate number in the README"

*Controls → no route (4 intents × 3 paraphrases):*
- C1a "what does the verify phase actually run?"
- C1b "walk me through what verify.mjs executes"
- C1c "summarize how the verify step works"
- C2a "run the selftest and tell me the current test count"
- C2b "what does npm test report right now?"
- C2c "execute the suite and report the numbers"
- C3a "what's on main right now — latest commits?"
- C3b "show me the recent git history"
- C3c "list the last few commits on this branch"
- C4a "summarize what the domain expert persona file says"
- C4b "what's in .claude/veriloop/domain/expert.md?"
- C4c "give me the gist of the domain persona"

## Arm 3 — the depth battery (added 2026-08-10, pre-registered before any depth probe ran)

Tests whether routing survives session DEPTH — the 10th/20th/50th-prompt question Arm 1's
fresh sessions cannot answer, plus the first live observation of the merged compact
re-injection.

**Conditions, 12 probes each** (paraphrase "a" of every Arm-1 base intent — 4 A, 4 D, 4 C,
all with known 12/12 behavior at depth 0, so depth is the only changed variable):

- **D50** — probe lands with ~50k tokens of context accumulated ahead of it.
- **D120** — probe lands at ≥120k tokens, deep context.
- **POST-COMPACT** — the session is compacted (forced or by threshold), the transcript is
  verified to show the payload RE-INJECTED by the compact matcher after the boundary, then
  the probe fires. This condition is also the end-to-end verification of `a9e2971`.

**Mechanics.** Depth is built from routing-neutral filler (row-1 reads of large repo
files), one deep session per condition; probes fork from the shared prefix where the CLI
supports it (cache-friendly, independent probes). If forking is unsupported, the
pre-registered fallback is sequential in-session probes with group order interleaved and
order reported — contamination noted, not hidden. Same observational guarantees as Arm 1:
kill at first `tool_use`, deny-all `PreToolUse`, model `claude-fable-5`, repo untouched,
session IDs recorded for floor-check exclusion.

**Pre-registered verdict rules:** per condition, ≥2 misses on ≥2 distinct base intents
among its 8 should-route probes → nudge sanctioned (same rule as Arm 1, applied per
depth); ≥2 routed controls on ≥2 intents → over-routing evidence against. A POST-COMPACT
condition where the payload is NOT observed re-injected is reported as a delivery failure
of `a9e2971` — a different defect than a routing miss, and it invalidates that condition's
probes rather than counting them.

## Arm 2 — the natural floor-check (2026-08-10 → 2026-08-24)

Normal usage, nothing extra. The payload text is **frozen** for the window (regeneration
is fine — the renderer is deterministic). **≥2 owner-observed real misses with the payload
present** reopens the nudge question with those observations attached, even if the battery
was clean. Probe sessions (recorded IDs) are excluded. At window close, a one-off count
appends to the memo; if session volume was too low, the honest outcome is "insufficient
data — extend."

## Pre-registered parameters (locked at ratification, 2026-08-10)

- **Battery threshold:** ≥2 misses on ≥2 distinct base intents (of 24 should-route probes)
- **Over-routing threshold:** ≥2 routed controls on ≥2 distinct control intents (of 12)
- **Floor-check threshold:** ≥2 owner-observed payload-present misses
- **Window:** 2026-08-10 → 2026-08-24
- **Probe model:** Fable (`claude-fable-5`), `--max-turns 1`, fresh session per probe

## Non-goals — binding

- No runtime hook; the `UserPromptSubmit` ban stands unamended through the window.
- No prompt text enters the repo — the memo carries counts and rates only.
- No LLM classification; detection is mechanical, verdicts are the pre-registered rules.
- The runner is scratchpad-only; if any counting tool later enters the repo it stays out
  of `emitted_files`.
- No changes to `session-routing.md`, `SESSION_ROUTES`, `SESSION_NO_ROUTE`, or the
  matcher before 2026-08-24.

## OPEN RISKS — carried, NOT cleared

**RISK 1 — self-report in the floor-check.** Owner-observed misses are the misses that
annoy; silent ones stay silent. The battery compensates at the ceiling only.

**RISK 2 — easy-case bias in the battery.** Fresh sessions, single-intent prompts, turn 1:
the friendliest routing conditions. A clean battery bounds the ceiling. (Symmetrically: a
*dirty* battery is damning, because these are the easiest conditions to get right.)

**RISK 3 — `--max-turns 1` truncation.** A model that would have routed on turn 2 scores
as a miss. Accepted: the payload demands routing FIRST, so a turn-1 standard is the
payload's own standard.

**RISK 4 — the hypothesis may simply be false.** n≈0 observations support it today. Clean
battery + quiet window = the problem never existed; the owner has agreed to accept that
reading rather than shop for a third instrument.

## Decision memo — battery arm (2026-08-10)

**Result: 36/36 correct. Zero misses, zero over-routes, zero errors, zero model fallbacks.**

| group | n | outcome |
|---|---|---|
| A (expect `/advise`) | 12 | `invoked_advise` = 12 |
| D (expect `/dev-plan`) | 12 | `invoked_dev-plan` = 12 |
| C (expect no route) | 12 | `announced_no-route` = 12 (and reached only for Bash/Read, never a Skill) |

- Payload injection verified in all 36 transcripts (headless sessions DO fire the hook —
  itself a previously unverified claim).
- All probes served by `claude-fable-5`; latency p50 9.3 s, max 18.4 s.
- **Verdict rules applied:** under-routing threshold (≥2 misses on ≥2 intents) — NOT met
  (0 misses). Over-routing threshold (≥2 routed controls) — NOT met (0). **The
  `UserPromptSubmit` nudge is NOT sanctioned.** Per the pre-registration it stays dead
  unless the floor-check arm trips.
- **Bounds (rule of three, 95%):** per-probe miss rate ≤ ~12.5% (0/24); over-route rate
  ≤ ~25% (0/12). These bound the easy case (fresh session, single intent, turn 1) —
  RISK 2 stands.
- Texture, unscored: A/D turns volunteered the announcement ("routed by veriloop's
  SessionStart hook, not requested directly"); several C turns cited specific payload
  language (the gitignored-byproduct carve-out, the read-only row) — consistent with the
  table being read, not verb-matched.

**Method deviation, recorded:** `--max-turns 1` does not exist in the installed CLI. The
runner substituted stream-kill on the first `tool_use` block plus a `PreToolUse` deny-all
hook injected via `--settings` (verified not to suppress the project's SessionStart hook).
The observational guarantee held: no routed command ever executed, no writes, repo
byte-identical before/after. Probe session IDs are recorded in the scratchpad battery
results for exclusion from the window count.

**Standing obligation:** the floor-check window runs to **2026-08-24** — payload frozen,
≥2 owner-observed payload-present misses reopens the question. Absent that, RISK 4's
reading is ratified: the hypothesized failure does not exist at the ceiling, and the
routing system as of `a9e2971` stands.

## Decision memo — depth battery, Arm 3 (2026-08-10)

**Result: 36/36 correct across all three conditions. No verdict threshold met at any
depth. The nudge remains unsanctioned.**

| condition | measured depth | A (4) | D (4) | C (4) |
|---|---|---|---|---|
| D50 | 55,949 tok | invoked `/advise` 4/4 | invoked `/dev-plan` 4/4 | no-route 4/4 |
| D120 | 129,382 tok | 4/4 | 4/4 | 4/4 |
| POST-COMPACT | 47,310 tok post-boundary | 4/4 | 4/4 | 4/4 |

- **Compact re-injection CONFIRMED end-to-end** — the first live verification of
  `a9e2971`: transcript shows `compact_boundary` (idx 34, `preTokens` 133,073) → summary
  (35) → payload-bearing `additionalContext` attachment (45). All 12 POST-COMPACT forks
  independently re-verified it.
- Probes were true forks (`--resume --fork-session` verified to mint independent
  sessions off a shared prefix) — the pre-registered primary design, no contamination.
- All 36 served by `claude-fable-5`, payload present in all 36, no errors.

**Deviations, recorded:** (1) D50 is a weak depth point — a fresh session in this repo
already carries ~39.9k tokens of scaffolding, so D50 is only ~16k above Arm 1's true
baseline; D120 (3.2× baseline) is the load-bearing depth result. (2) The runner exceeded
its ~2M pause ceiling (~3.2M prefill, essentially all cache reads) and tallied only
afterward. (3) A texture confound on attribution: post-compact probes phrased no-route
announcements as continuity ("matched again"), so the POST-COMPACT behavioral result may
draw on the compact summary as well as the re-injected payload; the *delivery* claim
(re-injection happens) is unconfounded and structurally verified.

**Standing state after Arms 1+3:** 72/72 probes correct at depth 0, ~56k, ~129k, and
across a compaction boundary. The hypothesized failure ("model ignores routing when
present") has zero observations at the ceiling through 129k tokens. Remaining coverage:
the natural floor-check to 2026-08-24.

*(window-close update due 2026-08-24)*

## Window environment note — 2026-08-17

`superpowers@claude-plugins-official` has been **disabled** in this repo's
`.claude/settings.json` (`enabledPlugins` → `false`) for the whole floor-check window. The
entry's file mtime is **2026-08-10 16:37:37 -0700** — the window's opening day, and 36
minutes before the battery's first probe (`2026-08-11T00:14:05Z`). Every probe in Arms 1
and 3, and the single real session inside the window, therefore ran with exactly one
`SessionStart` pack in the channel.

Recorded because this spec's own deviation discipline demands it, not because it helps: an
environment condition that could move the result gets written down either way. **Direction
of the effect, stated:** the disable *removes* a competing routing block, so 72/72 is an
**uncontended** number. `README.md:236-238` documents that nothing arbitrates between two
packs' `SessionStart` blocks — this measurement therefore says nothing about routing when
two of them contend, and that is now a named gap rather than an assumed pass.

The entry sat as uncommitted working-tree state until 2026-08-17, when it was committed as
repo policy in the same push as this append (this repo is the measurement's own
instrument, so the instrument's configuration is policy). Only the *committed status*
changed on 2026-08-17; the disable itself is unchanged since window start.

## Deviation — 2026-08-17: the probe-session ledger was destroyed; frozen replacement exclusion list

Arm 1's mechanics above promise "Runner records every probe's session ID so the
floor-check arm can exclude synthetic sessions," and the battery memo repeats it: "Probe
session IDs are recorded in the scratchpad battery results for exclusion from the window
count." **Those results no longer exist.**

**Timeline, plainly.**

- **2026-08-10** — the battery runs. Session IDs are recorded in the session scratchpad
  under the OS temp root, and nowhere else. Keeping the runner out of the repo is a
  pre-registered non-goal of this spec; this is what that non-goal cost.
- **2026-08-12** — a consult **flagged this exact risk**: the only copy of the exclusion
  list lived in OS temp and nothing had copied it out. A rescue was discussed. It was not
  confirmed done.
- **2026-08-17** — rescue attempted. OS temp cleanup had already deleted every file;
  directory skeletons remain, contents do not. The loss is total and irreversible.

The 2026-08-12 flag is aggravating, not mitigating: the failure mode was named five days
before anyone checked, and nothing acted on it in between.

**Replacement exclusion list — FROZEN, derived 2026-08-17 by transcript archaeology.** It
is a *list*, not a rule: the 79 IDs below are fixed now, before the window closes, so the
2026-08-24 count cannot be tuned by adjusting a predicate after seeing the data. The
derivation introduces no prompt text into the repo — all 36 prompts are already
pre-registered verbatim above — and is reproducible by anyone holding the transcripts.

```text
EXCLUDED — 79 sessions.  Derivation: whole-FIRST-user-message byte-equality against
the 36 prompts pre-registered verbatim above, UNION the enumerated runner-infrastructure
first-message shapes below; first-transcript-timestamp inside 2026-08-11T00:00-07:40Z
(= 2026-08-10 17:00-00:40 local).  Derived 2026-08-17, post-loss, from transcript
archaeology over all 90 project transcripts.  10 of the 90 fall outside the window
(latest 2026-08-02) and need no exclusion; 90 - 10 - 79 = 1 real in-window session.

PROBE — 38.  First user message byte-equals a pre-registered prompt; 11 transcript
lines each (SessionStart injection, one user turn, kill at first tool_use).
  57034581-ac96-4916-b90b-0bff2e761ea8  C3a  2026-08-11T00:14:05Z  <- pre-battery pilot
  3df18bbc-c6d9-4aa7-9e25-37b605f0fde8  C3a  2026-08-11T00:15:19Z  <- pre-battery pilot
  bc016eb9-d030-4f58-bf98-9b2be2eba67b  A1c  2026-08-11T00:15:45Z
  ce1ec625-6f2a-4c20-87ca-0d3f4bd7117e  A1b  2026-08-11T00:15:45Z
  1b3fdb80-abe2-4edb-9545-2edb2d195f9f  A2a  2026-08-11T00:15:45Z
  b2b834df-3ba6-4399-ad61-b6f7aa2405df  A1a  2026-08-11T00:15:45Z
  2ab7968c-d20e-4fee-894a-d7440d255733  A2b  2026-08-11T00:15:54Z
  a9ef5113-19f3-4040-b79b-385f8ffe69ac  A2c  2026-08-11T00:15:54Z
  0184ab72-db51-4122-b002-ae24fb78a429  A3a  2026-08-11T00:15:54Z
  1bf0be1a-4ab1-4e0b-bbad-049d4355d73d  A3b  2026-08-11T00:15:56Z
  525fa202-1684-4aea-b440-49229518cf53  A3c  2026-08-11T00:16:03Z
  b33818c1-7bec-48e2-bd2f-6b49ac31106a  A4a  2026-08-11T00:16:03Z
  5783fc7c-3612-4221-bbd6-76a22aad279a  A4b  2026-08-11T00:16:05Z
  6178a648-344d-4ae3-b002-b71a8ef968ca  A4c  2026-08-11T00:16:05Z
  00f07438-ac2b-44b0-ad48-36efdedde664  D1a  2026-08-11T00:16:13Z
  c6839ece-1671-4d92-9992-7e38068d32e8  D1b  2026-08-11T00:16:14Z
  ccd65f49-6225-4e2f-b921-17092ec1eee7  D1c  2026-08-11T00:16:16Z
  85968da6-c72a-4828-863d-66470cda574b  D2a  2026-08-11T00:16:18Z
  f45243ce-e2af-4baf-b7d3-7042cd0331df  D2b  2026-08-11T00:16:23Z
  c9e33fe5-43c8-4439-8728-f1c8af19f553  D2c  2026-08-11T00:16:26Z
  31498c9b-2cad-4063-b401-0bd9d142db66  D3a  2026-08-11T00:16:27Z
  75e3cf05-e8c9-4ad7-b00d-313652a820ce  D3b  2026-08-11T00:16:31Z
  5aa45c37-b39a-4570-8930-174be652eaaf  D3c  2026-08-11T00:16:36Z
  667f21ed-2ed5-4fb0-ab80-31a605c04529  D4a  2026-08-11T00:16:38Z
  6417595f-2cd1-4f01-845f-8cdf3a9533ad  D4b  2026-08-11T00:16:39Z
  35942982-f7a4-4909-9cfe-aeef49926b9c  D4c  2026-08-11T00:16:45Z
  99928fe4-49d6-40bf-83c9-c3023ea2c588  C1a  2026-08-11T00:16:47Z
  cda79da8-c523-40b2-9949-242d4e2a50e4  C1b  2026-08-11T00:16:51Z
  2ae03f36-0775-4746-9d29-917e11e15b35  C1c  2026-08-11T00:16:54Z
  f3bf8689-f1be-43b3-9a9d-f7e6baed8af8  C2a  2026-08-11T00:16:55Z
  899b2f69-db93-4804-84bf-826885431d45  C2b  2026-08-11T00:16:59Z
  a8f2106a-efdb-48f4-8572-95f37fb4d69c  C2c  2026-08-11T00:17:02Z
  76a7e747-777d-44ac-bea5-85edb75fb0d3  C3a  2026-08-11T00:17:04Z
  141cde40-63e4-4618-94ab-1047c83c38ee  C3b  2026-08-11T00:17:09Z
  7e9fc141-d50a-4e09-a0e7-3b7f3ac952dc  C3c  2026-08-11T00:17:13Z
  841e4a07-4b50-42b0-9e26-efd11968ef19  C4a  2026-08-11T00:17:14Z
  0b9503a4-2121-4e57-b5c5-a3080a05943a  C4b  2026-08-11T00:17:16Z
  863f528b-f87d-40e7-b99b-6059471de66c  C4c  2026-08-11T00:17:17Z

INFRA — 39.  Arm-3 headless runner infrastructure. Two mechanical sub-classes; the
distinct first-message shapes actually found in the corpus are exactly three:
  (i)  "summarize scripts/lib/render.mjs"                     (depth filler read)
  (ii) "read scripts/lib/detectors.mjs and give me the gist"  (depth filler read)
  (iii) "This session is being continued from a previous conversation..."
        (a compact summary — the POST-COMPACT forks begin after the boundary)
FORK (36) = first message is one of those three AND a pre-registered paraphrase-'a'
prompt appears as a LATER user turn. BUILDER (3) = filler first message and NO
pre-registered prompt anywhere in the transcript.
  bbbbbbbb-1111-4111-8111-000000000050  BUILDER             (i)    2026-08-11T04:53:54Z
  cccccccc-1111-4111-8111-000000000050  BUILDER             (ii)   2026-08-11T04:55:41Z
  dbab6641-ffbc-4c18-b6d1-919f7197ffb3  BUILDER, compacted  (i)    2026-08-11T04:57:49Z
  4a040aa0-972e-4f35-a185-da87b284c790  FORK A1a            (ii)   2026-08-11T05:00:56Z
  63139759-f962-4f04-ba8b-a009aeb2464d  FORK D1a            (ii)   2026-08-11T05:00:56Z
  35a66268-81d9-4ab7-86f5-371d5882ce17  FORK C1a            (ii)   2026-08-11T05:00:56Z
  f9cc1752-f4e1-42f2-a5c5-3b9999828a2a  FORK A2a            (ii)   2026-08-11T05:01:05Z
  77bf56ae-b513-4248-b39c-c61dd8443c19  FORK D2a            (ii)   2026-08-11T05:01:07Z
  29674dfc-34a3-427d-94a6-405bf1e57b37  FORK C2a            (ii)   2026-08-11T05:01:09Z
  678a0266-3b05-44c6-8bb5-97250efe72b6  FORK A3a            (ii)   2026-08-11T05:01:13Z
  6688afc5-601e-4358-b481-49b02afa80e9  FORK D3a            (ii)   2026-08-11T05:01:19Z
  c34e6cb2-3b39-493a-a53c-cd1ea7156c10  FORK C3a            (ii)   2026-08-11T05:01:19Z
  f9a5fbff-785e-4cd7-a3de-c33be0a1938c  FORK A4a            (ii)   2026-08-11T05:01:22Z
  ea9f9fa4-614f-44b2-9554-ac61c4d2c12d  FORK D4a            (ii)   2026-08-11T05:01:27Z
  0dbeb21d-40be-4ca4-9ab5-384633dc4dec  FORK C4a            (ii)   2026-08-11T05:01:31Z
  8e770206-b837-41b6-84bd-3756a2925c51  FORK C1a            (iii)  2026-08-11T05:01:49Z
  1b516fb8-82ad-4fa5-8723-99b93ab84611  FORK D1a            (iii)  2026-08-11T05:01:49Z
  98d6cb9d-306d-475c-ad30-97bc5e2dc3a3  FORK A1a            (iii)  2026-08-11T05:01:49Z
  890bf2fd-3296-4b37-acc9-5aab33cebac0  FORK A2a            (iii)  2026-08-11T05:02:01Z
  90b881ec-efb6-4cde-91b9-37a1cdab4b0b  FORK D2a            (iii)  2026-08-11T05:02:02Z
  a20f4644-6e49-4baa-9146-90706f89867f  FORK C2a            (iii)  2026-08-11T05:02:02Z
  c9db90a0-0e4d-4a11-b0f8-ff9b7cf45520  FORK A3a            (iii)  2026-08-11T05:02:10Z
  7b3668e7-56b6-47dd-8f5d-b7b0a280f397  FORK D3a            (iii)  2026-08-11T05:02:11Z
  1cbf7e28-f1b8-483e-88b0-42fda7c2e37c  FORK C3a            (iii)  2026-08-11T05:02:16Z
  271d712b-4c51-408d-8d45-c9f50b2abb94  FORK A4a            (iii)  2026-08-11T05:02:23Z
  0bee2251-3519-485b-b4b0-6d396f09de0b  FORK D4a            (iii)  2026-08-11T05:02:24Z
  bdab8684-9eab-4d81-86f4-e287f1943146  FORK C4a            (iii)  2026-08-11T05:02:24Z
  9601e2c3-1fd5-4552-a284-e0c5a90ef6d0  FORK C1a            (i)    2026-08-11T05:02:56Z
  65c5a393-5838-4b92-9d7d-863b753ffe47  FORK A1a            (i)    2026-08-11T05:02:56Z
  0c46b24d-3edf-4645-8695-88275464eea9  FORK D1a            (i)    2026-08-11T05:02:56Z
  40bd12f4-cc05-47a7-9c57-9f842e983150  FORK A2a            (i)    2026-08-11T05:03:07Z
  3013b919-47d7-4116-91b8-f1ab04abdb29  FORK D2a            (i)    2026-08-11T05:03:09Z
  b968345c-46d2-435d-bd38-318a83693e80  FORK C2a            (i)    2026-08-11T05:03:09Z
  b219fc43-92b8-4426-947d-3a01a29f65e3  FORK A3a            (i)    2026-08-11T05:03:19Z
  dbd95fa4-1b18-4272-8641-eef6ecbc1f83  FORK D3a            (i)    2026-08-11T05:03:20Z
  67f248e4-7afd-4cba-9fb0-1b758e6c6f86  FORK C3a            (i)    2026-08-11T05:03:21Z
  e30ca1aa-3009-4476-a9bc-3761405f5523  FORK A4a            (i)    2026-08-11T05:03:28Z
  f505e859-8f75-4e8b-a06e-cd313b2b8a87  FORK D4a            (i)    2026-08-11T05:03:32Z
  b75648bf-b9e5-44eb-a026-79bf21b3c00a  FORK C4a            (i)    2026-08-11T05:03:33Z

SMOKE — 2.  Seed sessions; first message "reply with exactly the word SEED", outside
the battery structure entirely (no pre-registered prompt, no filler read).
  aaaaaaaa-1111-4111-8111-000000000003  SEED                -      2026-08-11T04:52:49Z
  e8b4a85d-2758-441c-ad7f-578348fcabcb  SEED                -      2026-08-11T04:52:57Z

INCLUDED — 1.  The sole real session with a first timestamp inside the window:
  5f7d0ff2-9aa2-4095-9f56-96266dbdc380  REAL                -      2026-08-11T07:36:24Z
  It contains all 36 pre-registered prompts as later turns — it read this spec — which
  is precisely why the rule byte-matches the FIRST user message and not any message.
  Symmetrically, an any-message rule would also have missed all 36 INFRA forks, whose
  first message is filler and whose probe prompt arrives later.
```

**Dropped corroborator.** The rule as first proposed was to be corroborated by "the
deny-all `PreToolUse` overlay visible in their transcripts." **That corroborator does not
exist and is dropped.** The battery's own recorded method deviation is the reason: probes
were killed at the first `tool_use` *block*, which preempts the hook — the `PreToolUse`
event never fires, so nothing about it reaches the transcript. Verified rather than
assumed: the string `PreToolUse` appears in **0 of the 38** PROBE transcripts. The control
that makes that a real check: it appears in **14 of the 39** INFRA transcripts, whose
filler reads did execute tools — so the scan can see the overlay when it fires. A
corroborator that cannot appear is not weak evidence, it is no evidence, and citing it
would have been a false citation of the kind this repo's lint exists to catch.

**79 against the ratified 75 — reconciled.** The memos above describe 36 Arm-1 probes + 3
depth builders + 36 Arm-3 forks = **75** sessions. The ledger excludes **79**. The four
extra are accounted for by the transcripts, not waved off as slack:

- **+2 pre-battery pilot runs** of `C3a`, at `00:14:05Z` and `00:15:19Z`. The battery
  proper opens at `00:15:45Z` with four A-group probes firing inside the same second;
  these two are sequential single runs of one control prompt ahead of it — a runner
  shakedown that happened to use a real probe prompt. They are excluded as synthetic
  (they are `claude -p` probe sessions by construction) but they are **not** among the 36
  the memo scores. This is why `C3a` appears three times in the PROBE list and every other
  code appears exactly once.
- **+2 seed smokes** (`reply with exactly the word SEED`, `04:52:49Z` / `04:52:57Z`),
  immediately ahead of the Arm-3 depth run. Plumbing checks, never scored.

75 scored + 2 pilots + 2 smokes = 79 excluded. The INFRA sub-class arithmetic
independently reproduces the Arm-3 architecture: exactly 3 in-window transcripts contain
filler and no pre-registered prompt anywhere (the depth builders), and the remaining 36
each carry exactly one paraphrase-`a` prompt, distributed **3 per base intent across all
12 base intents** — precisely the shape Arm 3 pre-registered (12 probes × 3 conditions).
That distribution is not something a mistaken classification produces by accident.

**DUAL DENOMINATOR — binding commitment for the 2026-08-24 memo.** The window-close memo
publishes its counts **both ways**: once under the exclusions frozen here, and once under
the no-exclusion worst case, in which all 80 in-window transcripts are counted as real
sessions and none of the 79 exclusions are honoured. This demotes the post-hoc list from
keystone to footnote. If both denominators support the same reading, the exclusions did not
carry the conclusion; if they diverge, the divergence *is* the finding and gets reported as
one. A derived exclusion set must not be load-bearing for the count it was derived after
seeing.

**PENDING OWNER COUNTER-SIGNATURE — two discretionary calls.** The byte-equality half of
the derivation is mechanical and needs no signature. Two calls are judgment, and are
flagged as judgment:

1. **INFRA class membership (39 sessions).** That the three enumerated filler/compact
   first-message shapes are runner infrastructure rather than real work is an inference
   from shape, timing, and the fork/builder split. Strongly corroborated by the
   3-per-intent fork distribution above — but still an inference, and the largest single
   class in the ledger.
2. **The sole-real-session identification.** That `5f7d0ff2-9aa2-4095-9f56-96266dbdc380`
   is the only real session opening inside the window rests on it being the only in-window
   transcript that is neither a probe nor infrastructure. If a real session's transcript is
   missing, or if one opened with a message resembling filler, this is wrong.

**Verification is mortal — the counter-signature has a deadline.** The transcripts this
ledger was derived from live under the local Claude Code projects directory on the owner's
machine and expire on the harness's ~30-day retention: the 2026-08-10/11 files disappear
around **2026-09-09**. After that date neither call above can be checked by anyone,
including the owner. **The counter-signature must happen before 2026-09-09.** This is the
same failure mode as the loss recorded at the top of this deviation, one level up — the
derivation now lives in git, but the evidence it was derived from does not.
