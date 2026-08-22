# Spec: headless autonomy — statement → overnight planning → autonomous build

**Feature (one line):** The owner states a feature; veriloop plans and builds it with
minimal human interaction — the shape of that minimum (one ratify tap vs a batched morning
docket) is the ratification question below.

**Status:** RATIFIED — BINDING (owner, 2026-08-20), in full view of open risks R1–R5. Written overnight 2026-08-20; the owner
answered the wake-up interview 2026-08-20: **Shape B now, A earned later** (adopting the
rider's stronger-judged form with the measured-override-rate upgrade path); MUST-ESCALATE
list adopted as drafted; **the docket answer launches the build** (tap-gated grant, inert
until the answer); **resolve=clean is the default** for these runs. The mode name is
`mode=overnight`; Shape A's `mode=headless` is reserved for the earned upgrade and is
refused until a ratified upgrade amendment exists.

---

## The fork the owner decides (both shapes share every hardening below)

- **Shape A — true headless (the request as stated, council-hardened).** Interview forks
  are auto-resolved to the expert recommendation and recorded in the DECISION LEDGER;
  the owner's single interaction is the ratify tap, whose prompt presents the ledger
  unabridged plus the rider's challenges. Ratification remains the injection-channel
  sever — in this shape it is also the owner's FIRST contact with the content, and the
  docs must say so (security ruling).
- **Shape B — overnight-prep (the rider's shape, judged stronger).** The same overnight
  work; every fork arrives at wake-up as ONE batched docket — each question carrying
  options, the expert recommendation marked, and its none-contradicts evidence — with an
  ACCEPT-ALL-RECOMMENDATIONS option so the common case is still one tap. Every decision
  is owner-taken; the build then runs autonomously to the preview.
- **Recommended: B now, A earned later.** B's one-tap accept-all is functionally A at
  near-zero UX cost while keeping the binding corpus owner-authored. Each docket records
  the owner's override rate; if it stays ~zero over N runs, that measured base rate is
  the evidence an A-upgrade ratification can stand on — the same earn-it sequencing the
  owner imposed on the auto-merge dial. (R4 of auto-merge-dial.md recorded confirm-over-
  autonomous as stronger once already; this mirrors it at the spec layer.)

## Decisions — both shapes

- **D1 — invocation.** `mode=headless` (A) / `mode=overnight` (B) accepted ONLY when
  typed by the owner in the invocation. `interview.json` may set `interactive` as a
  default; **file text can never raise autonomy** (generalizes the dial's D2
  args-may-lower-never-raise; closes the fix-pass/hostile-PR laundering path — a
  headless value found in the file is refused and surfaced). No new slash command; no
  routing-payload bytes move (freeze conflict verified dead — session-routing.md:27
  stays true verbatim under either shape).
- **D2 — the overnight stretch.** Recon, probe tests, council (independent briefs + one
  cross-exam), and the premise-rider run exactly as today, unattended. Every fork is
  resolved-or-prepared with: options considered, recommender, one-line rationale, and an
  enumeration of every ratified text consulted with an explicit NONE-CONTRADICTS line
  per text (under-escalation made visible — auditable coverage, not conclusions).
- **D3 — MUST-ESCALATE list** (A: the only surfaced questions; B: flagged MUST in the
  docket, never bundled into accept-all): (a) the decision would contradict or amend a
  RATIFIED spec, the constitution, a binding non-goal, or the locked vision; (b)
  danger-surface authority expansion — new egress, credentials, secrets, data deletion,
  any outward action beyond the preview push; (c) the rider judges the opposite case not
  weaker; (d) council non-convergence on a load-bearing fork; (e) anything irreversible
  (merge/publish/deploy — belt-and-braces, these modes never do them); (f) any decision
  touching the hostile-input surfaces, MECHANICALLY matched by path/identifier
  (detectors sanitizer, hostile fixtures, safety tiers, secret/path scans). (f) stays
  separate from (b): it is the checkable member (security ruling). Known honest limits,
  recorded not cleared: (a)/(c)/(d) are judged by the same model whose recommendation is
  on the table; (d) has no mechanical definition under a synthesize-always protocol; the
  list is narrower than the 10 protected-path classes (a session-hook edit contradicts
  no ratified text — the guard covers it at build time, nothing covers it at spec time).
- **D4 — PARK semantics.** Escalation stops at a clean boundary, records the pending
  question + context in the spec (pre-handoff) or attestation (in-build), and WAITS. A
  question cap can NEVER convert a park into a default: the cap copy gains a carve-out
  exempting MUST items and the ratification tap (render.mjs:484-503 "proceed on
  best-effort defaults" is the exact banned conversion). No timeout converts absence
  into consent, anywhere. Workflow-side parks serialize (history/ record + PARKED
  terminal state) so a dead session loses nothing.
- **D5 — ratification and launch.** The spec is written Status: DRAFT; **/dev-loop
  refuses to build any spec still marked DRAFT** (kills draft-laundering — today it
  adopts any on-disk spec as binding, dev-loop.md:16-17). The ratify/docket answer is
  the launch trigger (tap-gated grant, inert until the answer) — or the owner types
  /dev-loop themselves; the interview settles which.
- **D6 — the build.** These modes imply `resolve=clean` by default; force the future
  auto-merge dial to effective OFF (free via its D2); waivers stay human-only (an
  autonomous run never waives); stop-before-merge unchanged (constitution rule 10
  untouched). Run-time decisions attest ONLY (the spec ledger closes at handoff — a
  clean-mode run appending to specs/ would hard-stop on its own guard). A run that
  cannot write its attestation parks loudly (the 529 precedent). FAIL / no-progress is a
  PARK-TERMINAL: no autonomous re-plan, answered entries never re-opened. A headless
  /dev-loop with no spec PARKS (never builds spec-less; supersedes the
  args.interview=false skip for these modes, precedence stated in the docs).
- **D7 — docs + tests.** Condition the interview sentences in the command sources
  (render.mjs:497, :502-504, :210-224 incl. interview=false precedence; README;
  SKILL.md); the injection-sever sentence stays verbatim with the residual
  rubber-stamp-pressure risk RECORDED (the ratify prompt presenting the ledger
  unabridged is the mitigation and, per R1, also the risk). Selftest: replace the pinned
  old copy (:1663, :1675, :1709, :3441 era) with mode-branch assertions; new cases for
  DRAFT-refusal, cap carve-out, file-can-never-raise-autonomy. CHANGELOG.

## Non-goals — binding

- No merge authority — the auto-merge dial keeps its own ratified sequencing untouched.
- No cross-model council (named: it is the recorded stronger lever for the monoculture
  risk, deferred; see R2).
- No new slash command; no routing-table or payload changes.
- No timeout-into-consent path of any kind.

## Acceptance criteria (reference the /dev-loop gate)

1. Mode absent ⇒ behavior byte-identical to today (both commands).
2. Selftest: file-value-can-never-raise-autonomy case red/green; DRAFT-refusal case;
   cap carve-out case (a questions=1 run still parks on a MUST and still ratifies);
   ledger-completeness (every auto-resolved fork present, every ratified text
   enumerated with an explicit none-contradicts line).
3. A parked run leaves a serialized PARKED record; resuming it never re-opens answered
   entries; FAIL parks terminally with the worktree preserved.
4. Shape-specific: (A) the ratify prompt renders the full ledger + rider challenges;
   (B) the docket renders every fork with its recommendation and the MUST items
   un-bundleable from accept-all; either shape's override/decision record lands in the
   attestation.
5. Docs sweep complete; no sentence claims the interview always asks; the sever
   sentence unchanged.

## OPEN RISKS — carried, NOT cleared

- **R1 — the rider's pre-mortem (verbatim mechanism, and its verdict).** BINDING loses
  meaning through volume: ratification decays into the blanket tap (observed at n=1:
  the 2026-08-16 four-question docket answered "just go ahead with your recommended
  paths"); the unabridged ledger becomes thoroughness-as-theater; the tap doubling as
  launch trigger points the incentive against deliberation at the exact decision point;
  by 2027 the owner cannot tell which binding text is theirs. The rider judged the
  opposite build (Shape B) STRONGER on every axis except preview latency and the word
  "fully." This spec's response: the fork goes to the owner (this document), B is the
  recommendation, and A-if-chosen carries this risk on its face.
- **R2 — monoculture concentration.** "Expert's recommendation" = the drafter's model
  family recommending to itself; the project's own memory: the same-model council
  cannot fix premise monoculture, and the INTERVIEW is /dev-plan's real premise organ.
  Both shapes amputate or batch the organ; the rider is the remaining independent seat.
  Cross-model confirmation stays the named, deferred, real lever.
- **R3 — boundary erosion is invisible.** The ledger records decisions taken, never
  escalations not-taken; nothing measures the (a)-judgment's miss rate (the gateway
  catch is n=1 with coverage "never measured"). Mitigation is the none-contradicts
  enumeration; it is coverage-shaped, not correctness-shaped.
- **R4 — stacking on the unobserved mode.** These modes default resolve=clean, which
  has ZERO recorded runs; its observation period is itself the ratified gate for the
  dial. Overnight volume on an unmeasured mode both generates and pollutes the base
  rate the next autonomy step needs. (Argues for B-first: owner-taken decisions keep
  the early clean-run data interpretable.)
- **R5 — cost inversion.** Maximum fan-out (council + rider + confirm agents + full
  lenses) lands at the point of minimum oversight, against the owner's own usage-limit
  policy; a failed overnight run pays it all for a parked docket.

---

## Amendment — 2026-08-21 (owner approvals: build rulings + routing extension)

**Build rulings counter-signed.** The owner approved all six implementation rulings made
under the 2026-08-20 delegation (positive-RATIFIED DRAFT guard with mode-split ambiguity
parking; file-text-only refusal scanning; the `SlashCommand(/dev-loop:*)` scoped grant
with its disclosed prose-gated residual; interactive ratification stamping the spec;
counts-only docket attestation; the 0.7.0→Unreleased version revert). The branch as
pushed (`bb11fae`) stands.

**Routing extension approved — WIDER triggers, amending this spec's "no routing-table
changes" non-goal.** When the owner's own message requests a build in plain text AND
signals the mode — an explicit phrase ("overnight mode", "auto mode", "headless") OR an
absence-signaling intent phrase attached to the build request ("while I sleep", "while
I'm out", and close variants) — the session routes to `/dev-plan mode=overnight`
directly. Unspecified always defaults to the normal interactive loop. **Recorded
tradeoff, owner-chosen over the explicit-only recommendation:** intent inference is a
judgment call by the routing session; a misread phrase can launch an overnight run the
owner did not want. Bounded blast radius: the run produces a docket and a preview at
most — the mode grants no merge authority, and every park/refusal mechanism of this spec
applies unchanged. The mode signal remains OWNER-TYPED PROSE — this loosens the token
shape of D1, never its file-text prohibition.

**Sequencing:** the routing payload is frozen until 2026-08-24 (routing-measurement.md
non-goals). The payload/generator implementation of this extension lands only after the
window closes and its memo is written. Until then, `mode=overnight` typed in the
invocation remains the only trigger.

## Addendum — 2026-08-21: attestation-write confirmation extends to every mode
(owner-ratified via `resolve-clean-observation-period.md`)

Acceptance criterion 1 of this spec ("Mode absent ⇒ behavior byte-identical to today")
is SUPERSEDED in exactly one respect: the attestation-write confirmation (the ATT_WRITE
schema + the loud park on an unconfirmed write), introduced here as overnight-only, now
runs in EVERY mode, and the attestation record is committed on the feature branch for
every non-dry run regardless of land outcome. Authority: the owner's ratification of
`resolve-clean-observation-period.md` (2026-08-21), whose Part 1 requires a durable
substrate for the observation period this spec's own R4 names. Everything else in
acceptance criterion 1 stands unchanged.
