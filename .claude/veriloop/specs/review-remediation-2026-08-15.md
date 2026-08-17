# Spec: review remediation 2026-08-15 — pin truth-repair, session-hook guard class, doc burn-down

**Feature (one line):** Remediate the 2026-08-15 two-week /review's findings on the
`feat/resolve-to-clean` branch before merge: fix the gate-figure pin and the frozen 0.5.0
figures, add the SessionStart surface to the protected-path guard, and burn down the live
doc concerns — in four commits, with three decisions explicitly QUEUED for the owner.

**Status:** RATIFIED — owner instruction 2026-08-16 (quoted in Q4); Q1-Q4 resolved as recorded
in the amended specs.
*(This line replaced "PROVISIONAL — EXECUTED UNDER OWNER DELEGATION, RATIFICATION REQUESTED AT
MERGE" when the ratification arrived, and is the ONLY line above the resolution block that
changed. The delegation quote, D1-D5, the queue and the open risks stand byte-for-byte as
written on 2026-08-15; every resolution is appended below, never spliced into the question it
answers.)*

> Authority, stated exactly: the owner wrote, 2026-08-15, in direct response to the /review
> summary proposing this work: *"go ahead and plan the highest leverage sequence, once
> planning is done run dev loop automatically to get it done, i will be out for a few hours,
> so you have time."* That sentence is the delegation this drive runs under. It is a chat
> sentence, not a ratification: every spec annotation this drive writes is therefore worded
> as **pending owner counter-signature**, never "owner-authorized," and the merge review is
> the ratification point. The premise-rider's challenge to this arrangement is recorded
> UNRESOLVED in R1 below. Nothing lands on main; the merge stays owner-gated.

---

## Decisions

- **D1 — Commit 1 (measurement, atomic).** Replace the selftest's first-match gate-figure
  pin with a marker design: an HTML-comment marker (`veriloop:gate-figure`) directly above
  the live figure line in README and CHANGELOG; three assertions — (a) exactly one marker
  per file and the next line's figure === the run's printed count; (b) positional all-pairs
  equality between the two files' remaining figure pairs (pins the frozen pairs the marker
  ignores); (c) the old first-match pin RETIRED (replaced, documented — two overlapping
  first-match pins is how 481 hijacked the 0.5.0 section). Correct the frozen 0.5.0
  headline figures 481 → **436** in both files (derivation, implementer re-verifies both
  legs: the section's own chain sums 253−7+149=395, +18=413, +23=436, and the commit its
  scope describes, 61802bd, prints 436 — verified twice this session, incl. by the rider
  via git-archive). Add a dated in-place disclosure note (precedent: the CHANGELOG's own
  dated-correction convention) recording that unreleased commits had rewritten a closed
  section.
- **D2 — Commit 2 (enforcement).** New protected-path guard class `session-hook`:
  `.claude/settings.json`, `.claude/settings.local.json`, `.claude/veriloop/session-start.mjs`,
  `.claude/veriloop/session-routing.md`; derived in `generate.mjs` from the exported path
  constants (render.mjs:790-791,1046 — never re-typed strings), `deletionsOnly: false`; one
  guard case-table row per path; mirror regenerated. A separate dated addendum block in
  `resolve-to-clean.md` (never inside the owner-rulings block) records the class addition
  with its provenance (review finding #2, owner-endorsed summary, this delegation) and the
  clause that it carries no further licence — **pending owner counter-signature at merge**.
  The per-path content-hash census extension is NOT built (owner authority required); its
  absence is recorded against R3 of `resolve-to-clean.md` as known magnitude-blindness.
- **D3 — Commit 3 (behavior).** (a) lint 8a co-fire fix: the uncovered WARN never prints
  beside an overreach FAIL (`uncovered.length && !unconstrained && !overreach.length`).
  (b) Matcher tokenizer reworked to a whitelist of recognized spellings (bare tokens,
  `^(...)$` anchored groups, `(?:...)`) using the council-verified regex; **unrecognized
  forms keep the FAIL exit** with an honest "cannot verify this matcher form" message —
  no new verdict class, fail-noisy preserved (this answers the rider's fail-silent
  pre-mortem); `^(startup|clear|compact)$` becomes green (false-positive fix) with a case.
  (c) Attestation redaction widened at EMIT TIME ONLY: `redactStr`'s line-drop also matches
  anchored `/private/`, `/tmp/`, `/var/folders/` path shapes; the lint backstop is NOT
  widened (the ts-gating scheme is queued — Q2). SECURITY.md:271 softened to name the
  shapes matched. (d) `buildDepsSetup` node branch appends `cargoShare()` when
  `usesCargo(cj)` (+ fixture assertion); cargoShare's instruction resolves the repo root
  explicitly instead of `$REPO`.
- **D4 — Commit 4 (prose, no assertion changes).** SECURITY.md:84-86 hedged to mirror
  render.mjs's own caveat (compact verified; resume/fork inference, unverified in-repo);
  README:215 covers the compact source + the mid-work-firing cost joins README's
  "worth knowing" list (one-way sync from SECURITY.md); selftest:3113 comment updated;
  SKILL.md:76 dangling clause dropped + the "nothing merges" parenthetical scoped to the
  one marked-block splice; render.mjs AUTO_START comment de-numeraled; auto-merge-dial.md
  blockquote gains "at ratification time" (dated annotation); SECURITY.md:9 provenance
  re-dated (version stamp is vacuous — date the check instead); CHANGELOG entry for
  15bdf9c (three sentences: the ~1.3 GB duplication, the shared dir, the stated
  serialization tradeoff); a dated **pending-owner-decision** note appended to
  `session-hook-compact-delivery.md` recording that the shipped third lint verdict
  (`unconstrained` FAIL) exceeds the ratified two and awaits the owner's disposition (Q1).
- **D5 — Execution shape, disclosed.** The emitted workflow cannot target an unmerged
  branch (base-branch arg is a ratified non-goal of resolve-to-clean), so the drive runs
  hand-driven with the same organs: Opus implementer in the existing worktree → real
  exit-code gates after each commit (each commit republishes the marker figure so every
  commit is green, per the council) → three-lens re-gate on the full delta → push to
  `origin/feat/resolve-to-clean`. No merge.

## QUEUED FOR THE OWNER (decisions this drive does NOT make)

- **Q1 — `unconstrained` disposition:** keep the third FAIL verdict via spec amendment /
  fold into overreach / downgrade to WARN per the literal ratified text. (Council split
  three ways; FAIL retained meanwhile as the fail-safe.)
- **Q2 — redaction backstop:** ts-gated forward coverage (security's design; a named
  bypass class) vs. emit-time-only forever vs. retroactive with the two protected records
  hand-amended by the owner.
- **Q3 — blob-sha census** (closes the guard's magnitude-blindness): a D6 amendment for
  the owner's signature, with the honest note that the sha is agent-reported either way.
- **Q4 — counter-signatures** on the THREE blocks this drive writes that end "pending owner
  counter-signature": the `resolve-to-clean.md` addendum recording the `session-hook` guard
  class (D2), the `auto-merge-dial.md` dated annotation correcting the blockquote's tense
  (D4), and the `session-hook-compact-delivery.md` pending-owner-decision block recording the
  third lint verdict (D4). The third's signature is subsumed by answering **Q1** — ruling on
  the `unconstrained` disposition settles what that block records — if the owner prefers to
  handle it there rather than sign it separately.

## Non-goals — binding

- No merge to main; no edits to constitution.md, experts/*, interview.json, commands.json.
- No backstop-scan semantics change (Q2), no census schema change (Q3), no verdict-class
  change beyond message accuracy (Q1 preserved as-is).
- No new docs; every touched artifact already exists.

## Acceptance criteria (reference the /dev-loop gate)

1. After each commit: real lint + selftest green at that commit (marker figure repub).
2. Marker assertions: exactly-one-per-file, live-figure === printed, positional all-pairs
   equality, old first-match pin gone; frozen 0.5.0 pair reads 436 in both files.
3. Guard case rows: each session-hook path trips the guard (enforce mode) and attests
   (observe mode); derivation from constants asserted (no re-typed strings).
4. Whitelist cases: `^(startup|clear|compact)$` green; `(startup)|(clear)` and `banana`
   FAIL with the cannot-verify/overreach messages respectively; no new verdict class.
5. Redaction case: an emit-time record line carrying a `/private/tmp/...` path is dropped;
   the lint backstop's behavior on existing records is UNCHANGED (532-era records green).
6. node+rust fixture gets the cargo clause; node-only fixture still lacks it (non-vacuity).
7. Every spec annotation carries its date, its provenance sentence, and pending-signature
   status; the literal phrase "standing instruction" appears nowhere in text this drive
   writes (correction, 2026-08-15: the rider's "only inside a recorded injection-probe
   header" undercounted — the phrase also lives in render.mjs:396 prose and its emitted
   advise.md mirror; the prohibition here binds only what this drive authors — outside this
   criterion's own statement).
8. Three-lens re-gate on the full delta lands no BLOCKER before push.

## OPEN RISKS — carried, NOT cleared

- **R1 — the rider's authority challenge (UNRESOLVED, partially overridden).** The rider
  judged that for the enforcement/behavior half, queueing three questions beats unattended
  execution — "the correct response to a conceded authority gap is a queued question, not a
  dated note beside finished work" — and that agent-authored addenda to ratified specs,
  however disclaimered, teach later agents that the form is legitimate (its pre-mortem:
  the owner becomes auditor-of-faits-accomplis; spec-authority provenance becomes
  unreconstructable). This spec proceeds anyway for the owner-endorsed findings (#2/#4
  were verbatim in the summary the owner approved) under the verbatim delegation, narrows
  everything else (Q1-Q3 queued, backstop dropped, census dropped, pending-signature
  wording), and records the rider's position here in full for the merge review.
- **R2 — the rider's fail-silent pre-mortem** (a future matcher spelling the whitelist
  doesn't recognize produces a soft non-FAIL): answered structurally by keeping the FAIL
  exit for unrecognized forms; residual risk is message-trust, not verdict drift.
- **R3 — merge-review burden.** Four built commits + four queued questions is a heavier
  owner gate than usual; the mitigation is this spec's queue section and per-commit
  partition (measurement / enforcement / behavior / prose) so each can be judged alone.
- **R4 — the delegation's scope reading is mine.** If the owner meant less than the
  endorsed-summary reading, the remedy is cheap (revert unmerged commits), and the
  disagreement itself becomes a recorded calibration point for future delegations.

---

## RESOLVED — 2026-08-16 (owner ratification)

**Authority, quoted verbatim.** The owner wrote, 2026-08-16, in response to the merge-review
docket that queued the four questions above: *"just go ahead with your recommended paths for
the merge review docket, then merge."* That sentence ratifies exactly the four dispositions
below and the three counter-signatures in Q4 — nothing wider. Every line above this block is
as written on 2026-08-15, except the Status line, which is annotated where it changed.

- **Q1 — `unconstrained` disposition: RESOLVED, option 1 (amend the spec).** `unconstrained →
  FAIL` is ratified as a third verdict in Change B's table, recorded as a dated amendment in
  `.claude/veriloop/specs/session-hook-compact-delivery.md` ("Resolved — 2026-08-16"). Rationale
  recorded there: fail-safe. An unconstrained matcher fires on **every** `SessionStart` source
  including `resume` and `fork`, so the literal WARN reading would green-light the
  highest-exposure spelling in the space. **No code change** — the FAIL already ships and is
  case-covered; ratification moves the spec to the code, not the code to the spec. The fourth
  branch (unrecognized matcher *spelling*) remains the FAIL exit with its cannot-verify
  message and is still **not** a verdict class.
- **Q2 — redaction backstop: RESOLVED, ts-gated forward coverage.** `lint-bundle.mjs`'s
  committed-record scan now also whole-line-FAILs on the three temp roots, for records whose
  **filename timestamp** parses to `2026-08-16T00:00:00Z` or later. The two records already
  committed (2026-07-21, 2026-08-04) are unchanged in behavior, so no history is hand-amended
  and no gate turns red on a record nobody can rewrite. The bypass class is **named**: the gate
  is a file name, so a hand-placed record not named `<ts>.json` is not temp-scanned. Recorded in
  `SECURITY.md`'s redaction paragraph with the cutoff date. Acceptance criterion 5's second
  clause is superseded by this ruling for post-cutoff records only; the 532-era records it
  names stay green, which is what it was protecting.
- **Q3 — blob-sha census: RESOLVED, built.** D6 is amended by a dated, ratified addendum in
  `.claude/veriloop/specs/resolve-to-clean.md` ("Addendum — 2026-08-16: content-hash census").
  The census reports `git hash-object` for protected prefixes only; a moved sha over an
  unmoved (added, deleted) delta is a violation reading *content changed, line counts
  preserved*, covering the N-for-N rewrite and the binary case, and it reaches the
  deletions-only class too. **The honest note stands and is recorded in the addendum:** the sha
  is agent-reported like every other census field, so the guarantee class is unchanged and R3
  of `resolve-to-clean.md` stays open. What it closes is the **magnitude-blindness** recorded
  against R3 on 2026-08-15. The SCOPE hole (census sees the worktree, not the main checkout)
  is untouched. This supersedes the second clause of the non-goal "no census schema change
  (Q3)" — which was scoped to the drive that wrote it, pending exactly this answer.
- **Q4 — counter-signatures: GRANTED on all three blocks.** The owner's sentence is recorded
  verbatim as the signature in each: the `resolve-to-clean.md` session-hook addendum (D2), the
  `auto-merge-dial.md` dated annotation (D4), and the `session-hook-compact-delivery.md`
  pending-decision block (D4) — whose signature is, as anticipated, subsumed by the Q1 ruling
  and also recorded separately there.

**R1 is answered by ratification, not dissolved.** The rider's objection — that agent-authored
addenda to ratified specs teach later agents the form is legitimate, and that the owner becomes
auditor-of-faits-accomplis — was carried UNRESOLVED into this merge review, which is where the
owner ruled. The three blocks are now signed rather than pending, so the specific instances are
closed; the general objection is **not** thereby settled, and this block is not a precedent for
writing the next one unsigned.

> **Amendment — 2026-08-16 (same owner instruction as the RESOLVED block):** Q2's shipped
> form was refined one commit later (9d927b5) after a security-lens finding verified by
> execution: unparseable record filenames now fail CLOSED (scanned), since all committed
> records parse pre-cutoff and fail-open bought nothing. The honest residual bypass is a
> BACKDATED parseable name, which no parse rule closes; SECURITY.md names it.
