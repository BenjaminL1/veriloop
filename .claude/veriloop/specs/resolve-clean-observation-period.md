# Spec: resolve=clean observation period — durable records, pre-registered arming criteria, sensor probes

**Feature (one line):** Give the resolve=clean observation period a durable, provenance-gated
substrate (committed attestation records in every mode), pre-register the arming criteria the
auto-merge-dial reading must be taken against, characterize the confirm sensor TODAY (seeded
probe with a TRUE-control arm + replay battery), and set `resolve_default: "clean"` so every
future drive feeds the base rate.

**Status:** RATIFIED — BINDING (owner, 2026-08-21).

> Owner request 2026-08-21 (four-part bundle) plus the owner's same-day directive: *"i don't
> want to test through natural prompt disection, i want to have results by the end of today."*
> This spec OPERATIONALIZES the observation sequencing that `auto-merge-dial.md`'s
> ratification imposed ("the loop demonstrates a real clean-PASS base rate, and only then does
> this spec enter /dev-loop") and that `resolve-to-clean.md` R4 and `headless-autonomy.md` R4
> name. It EDITS NO RATIFIED TEXT: it is a new spec plus one dated addendum (D1) applied
> byte-for-byte from the text embedded here. The same-day measurements characterize the
> SENSOR; they never substitute for the prospective base rate the dial's ratification demands.
> The premise-rider's pre-mortem and opposite-case are carried UNRESOLVED as R6/R7; four of
> the pre-mortem's mechanical steps are answered by amendments marked [rider] below.

---

## Part 1 — attestation durability

- **D1 — the write confirmation runs in EVERY mode.** The attestation-write confirmation
  (the `ATT_WRITE` schema + the loud park on an unconfirmed write, today gated to
  `mode=overnight` in `scripts/templates/dev-loop.template.js` ~:1613-1621) becomes
  unconditional: a run in ANY mode that cannot confirm its record written parks loudly.
  This supersedes `headless-autonomy.md` acceptance criterion 1 ("Mode absent ⇒ behavior
  byte-identical to today") in exactly this one respect. The addendum below is embedded
  here VERBATIM so the owner's ratification of this spec covers its bytes; the drive's
  docs-sync appends it to `headless-autonomy.md` mechanically, with zero drafting
  discretion:

  > ## Addendum — 2026-08-21: attestation-write confirmation extends to every mode
  > (owner-ratified via `resolve-clean-observation-period.md`)
  >
  > Acceptance criterion 1 of this spec ("Mode absent ⇒ behavior byte-identical to today")
  > is SUPERSEDED in exactly one respect: the attestation-write confirmation (the ATT_WRITE
  > schema + the loud park on an unconfirmed write), introduced here as overnight-only, now
  > runs in EVERY mode, and the attestation record is committed on the feature branch for
  > every non-dry run regardless of land outcome. Authority: the owner's ratification of
  > `resolve-clean-observation-period.md` (2026-08-21), whose Part 1 requires a durable
  > substrate for the observation period this spec's own R4 names. Everything else in
  > acceptance criterion 1 stands unchanged.

- **D2 — commit always, push only when landed.** Every non-dry run COMMITS its record on the
  feature branch regardless of land outcome (today the commit is gated on `landedNow`,
  template ~:1628). Push behavior is UNCHANGED: landed runs push as today; the non-landed
  emit prompt RETAINS an explicit never-push hard limit (the differential deny stays — the
  emit agent's prompt embeds lens-authored free text, most adversarial exactly on FAIL runs).
  Parked runs already preserve branch + worktree, so the committed record survives for triage.
- **D3 — provenance gates the record class.** Every record written after this spec lands
  carries `emittedBy: "loop" | "regate" | "probe"` (loop = machine emit by a drive; regate =
  hand-driven re-gate; probe = measurement record, Part 3). Hand-written records (regate,
  probe) follow the procedure this spec defines: schema-conforming JSON, a MANDATORY
  pre-commit hygiene scan (the same absolute-path / temp-root / secret shapes
  `attestationFrom` redacts — scan BEFORE the commit, never detection-after-durability),
  committed under the existing `chore(veriloop): attestation record` convention.
  `lint-bundle`'s committed-record walker (check 6a) is EXTENDED: required keys validated on
  every post-instrumentation record (incl. `emittedBy`; incl. the D8-fields
  `rawConcerns`/`confirmedConcerns`/`unverifiedConcerns` when `resolveMode` is `clean`), and
  any NEW commit introducing a record whose filename timestamp predates the window's first
  record is FLAGGED (the commit-date gate the 6a backstop's own comment names as the close
  for its self-reported-filename backdating bypass). The six legacy records are grandfathered
  exactly as the existing timestamp cutoff already grandfathers them.
- **D4 — run #1 is LOST (owner ruling, 2026-08-21). EXCLUSION LEDGER, dated:**
  - The first clean run's numbers — 15 raw / 15 confirmed / 0 refuted, 2026-08-20 — exist
    only as session memory; no in-tree artifact carries them. Recorded HERE as unverifiable
    session evidence, EXCLUDED from N, the base rate, and every window statistic. No
    backfilled record is written (a hand-fabricated machine-shaped file legitimized at
    window open is the exact class D3's provenance rules fence). Precedent:
    `routing-measurement.md` battery-loss deviation; `resolution-pass-2026-08-17.md` D5.
  - [rider] The two FAIL records (2026-08-01) carry `baseSha == headSha` — the known
    wrong-SHA defect `auto-merge-dial.md` D7 names — and their worktrees hold no
    implementation state, so the ground state their 16 final-pass concern texts were judged
    against is UNRECOVERABLE. Those 16 findings are excluded from the replay battery (D11)
    and recorded lost here.
  - [rider] A SEVENTH record exists stranded and uncommitted:
    `2026-08-01T01-44-25Z.json` in the domain-expert-phase1 worktree's history/. The drive
    COLLECTS it into `.claude/veriloop/history/` (legacy, pre-cutoff-grandfathered by
    filename, non-countable — pre-window by construction). It is the live specimen of the
    leak class this Part exists to close.

## Part 2 — pre-registered arming criteria (ratifying this spec IS the pre-registration)

- **D5 — countability and the sole home.** A COUNTABLE run is a record ON MAIN's
  `.claude/veriloop/history/` with `emittedBy ∈ {loop, regate}`, effective
  `resolveMode: "clean"`, that reached a gate verdict — PASS, CONCERNS, WAIVED, or FAIL,
  including park-terminal-after-verdict. Dry runs, parked-before-gate runs, and every
  probe-class record are NEVER countable. Main is the SOLE countable home. A committed
  counter script computes, from main's records only: countable N; strict-PASS base rate;
  refutation rate `(raw − confirmed − unverified) / (raw − unverified)` (a dead confirm seat
  must never read as sensor discrimination — `unverifiedConcerns` is already an attested
  bucket); window segmentation (D7); and UNCOLLECTED — records reachable on any local/remote
  ref but absent from main (enumeration is a completeness check: it WARNS, it never counts).
  **The arming evaluation is BLOCKED while UNCOLLECTED > 0.** The owner triage-commits
  stranded records to main (the counter prints the exact list); collect a preserved branch's
  record BEFORE deleting the branch — a deleted ref is invisible to the counter (R2).
- **D6 — the numbers (owner-chosen, 2026-08-21).** Window opens at the FIRST record carrying
  `emittedBy` + the D7 window key (record-defined, not date-defined — pre-instrumentation
  runs are mechanically non-countable, which discharges "must land before run #2").
  **Minimum N = 10** live clean runs. **Arming threshold: strict-PASS share ≥ 70%** of
  countable runs AND the seeded floor (D8) met at evaluation time. **Honesty riders, stated
  rather than implied:** N = 10 is ≈ 6–8 weeks at observed drive cadence (the same-day
  battery, Part 3, exists because of this); at n = 10 the 70% threshold is an anti-goalpost
  PRE-COMMITMENT, not statistics — a true-0.5 process arms with p ≈ 0.17; 7/10 observed is
  compatible with a mediocre process. The threshold's value is that it was fixed BEFORE the
  data, not that it discriminates sharply at this n.
- **D7 — the sensor freeze pins BOTH axes [rider: model axis added].** The sensor's identity
  is (prompt, model), and the window key is BOTH:
  1. `confirm_prompt_hash` — wording-neutral markers bound the confirm-prompt region in the
     template (precedent: the `verdict` and `emit` marker regions); `generate.mjs` computes
     the hash from that region and emits it into the manifest; a PARITY_KEYS row + selftest
     mutation case pin manifest↔workflow agreement; the emitted workflow stamps the hash
     into EVERY attestation record.
  2. the CONFIRM-SEAT ROUTE — the record's existing `routing` map already stamps the
     resolved review-route configuration (`routeFor`: per-run args → budget.models →
     posture preset → session default); the confirm seat rides `route('review')`, so the
     recorded review-route string joins the window key.
  **A mid-window change to EITHER restarts the window** (runs under different sensors never
  pool) — a `/posture` change or per-run model arg that moves the review route is a sensor
  change, exactly as a prompt edit is. HONEST LIMIT: an upstream point-release inside an
  unchanged model name, and a `session default` route whose underlying session model varies,
  are both invisible to this key — recorded, not solved (R1). This spec ratifies the RULE —
  the values live only in machine-owned artifacts, so nothing is ever inserted into ratified
  text post-ratification. The markers change no prompt wording — the freeze is measurement
  discipline, not a guard.
- **D8 — the two-sided seeded floor and the dead-seat rule [rider: TRUE arm added].** The
  probe seeds BOTH directions, because a one-sided floor co-moves with the base rate in the
  sensor's worst failure direction (an over-refuting seat aces a refutation-only floor AND
  inflates strict-PASS, since refuted concerns stop counting toward the verdict):
  - FALSE arm: **≥ 9 of 10 known-false seeds REFUTED**;
  - TRUE arm: **≥ 4 of 5 known-true seeds CONFIRMED** (planted defects — by-construction
    ground truth, D10).
  A dead confirm seat is re-run ONCE; twice-dead = the seed SCORES AGAINST the floor (a
  false seed counts not-refuted, a true seed counts not-confirmed — fail-closed, both
  attempts logged). **Floor failure in EITHER direction** ⇒ the PRE-REGISTERED response is
  switching the confirm seat to CROSS-MODEL confirmation and restarting the window under
  the switched sensor. **Never a confirm-prompt wording change** — the council-rejected
  adversarial reframing is the sensor-adjustment move `resolve-to-clean.md` R4 forbids, in
  every branch of this spec. **Cross-model reality, verified 2026-08-21: the codex CLI is
  NOT installed on this machine and `crossModel` is null in all six history records — the
  cross-model seat has zero recorded runs ever.** Therefore the switch is defined as:
  window SUSPENDS until a cross-model confirm seat exists AND has been smoke-tested (≥ 1
  trial seed through the verbatim confirm prompt); suspension is the LIVE consequence of a
  floor failure today, and the owner ratifies knowing it.
- **D9 — the UNBUILD criterion (dial R4, operationalized) + the reversal question [rider].**
  If at window close (N reached, UNCOLLECTED = 0) the sensor is NON-VACUOUS (floor met, both
  arms) and the base rate is below threshold, the pre-registered reading IS: **the
  auto-merge dial stays unbuilt.** That outcome is recorded as a dated memo; re-opening the
  question requires a NEW owner ratification with new evidence — never a sensor adjustment,
  never a threshold moved after the fact. **AND, whatever the reading:** window close
  RE-OPENS `resolve_default` as a dated owner decision — the per-drive confirm fan-out (D12)
  is re-authorized with the data in hand, or the default reverts to `blockers`. The bill is
  bounded by the window, never silently permanent.

## Part 3 — same-day sensor measurement (owner directive: results by end of 2026-08-21)

- **D10 — seeded probe, two arms (non-vacuity + non-rubber-stamp; stated honestly: neither
  is discrimination power).**
  - FALSE seeds (10): mechanically DERIVED from historical recorded findings — retargeted
    to the wrong file, citing code that does not exist, citing an issue whose fix already
    landed — matching the confirm prompt's own refute taxonomy (wrong / already handled /
    describes code that does not exist).
  - TRUE seeds (5) [rider]: real defects PLANTED into the probe worktree's diff (e.g. a
    removed null-check, an inverted predicate), each paired with the finding that describes
    it — ground truth by construction, the constitution-experiment's own shape.
  - Hygiene, both arms: seeds pre-flighted MECHANICALLY before use — no command
    substitution, backticks, or env expansion (the rule-5 shapes); no
    secret/absolute-path/temp-root shapes; NEVER sourced from `fixtures/hostile-ci/`
    (rule 4's spirit — hostile text is never put in front of a Bash-holding seat). Each
    seed goes to ONE real confirm seat: the VERBATIM confirm prompt extracted from the
    emitted workflow, a throwaway worktree, the probed diff reconstructed as UNCOMMITTED
    state (`git apply`, no commit — real seats see uncommitted work); probed-diff selection
    mechanically EXCLUDES any diff touching `fixtures/hostile-ci/`. Seeds are generated
    fresh per probe and NEVER committed mid-window: probe records carry
    `sha256(seed) + arm + category + verdict + a SCRUBBED reason-excerpt` (a seat's reason
    may quote the seed — scrub it, or the leak returns); the VERBATIM seed corpus is
    committed at window close or restart, passing the same pre-commit hygiene scan
    (deferred disclosure: full audit at decision time, zero overlap with live measurement).
    The probe runs TODAY and repeats at the arming evaluation.
- **D11 — replay battery, honest size [rider: corrected from a false 46].** The six
  committed records persist **33** final-pass concern texts (5+2+1+9+7+9); the 46 in the
  owner's council brief was the gate-1 COUNT sum (5,2,1,14,18,6), whose texts for the two
  FAIL runs were never persisted (`gateHistory` stores counts only). Of the 33, the 16 from
  the FAIL records have unrecoverable ground state (D4). The battery is therefore the
  **17 reconstructable findings** from the four CONCERNS runs, each to a fresh confirm seat
  against its branch's reconstructed uncommitted state, PLUS an ADJUDICATION step: every
  REFUTATION is classified by the executing session with a cited `path:line` — sensor error
  / finding was actually wrong / reconstruction mismatch — because a raw refutation count
  over replayed findings has no ground truth and would otherwise be uninterpretable.
  Battery records are probe-class (`emittedBy: "probe"`), committed under
  `history/probes/` — the FIRST TRACKED history subdirectory (dry-runs/ and parks/ are
  machine-ignored; probes/ stays OUT of the ignore block) — hygiene-covered by the extended
  6a walker. Battery results are sensor characterization ONLY: never countable, never a
  substitute for the prospective base rate. Same-day seat budget, corrected: 15 probe + 17
  battery ≈ **32 confirm seats**.

## Part 4 — every drive feeds the base rate

- **D12 — `resolve_default: "clean"`.** `interview.json` gains the key; the bundle is
  regenerated. The machinery pre-exists end-to-end: value validation fails the build on a
  typo (`generate.mjs` ~:758), the manifest carries the key, the interview↔manifest↔workflow
  parity triangle and its mutation case already pin propagation (`selftest.mjs`
  ~:4408-4437). A per-run arg may still LOWER to `blockers`; an arg-lowered run is simply
  not countable (D5). The protected-path guard is fix-pass-scoped by construction (the
  census baseline is taken before the first fix pass), so the implementer's plan-approved
  edit of the protected `interview.json` is not a guard event. COST, recorded and BOUNDED:
  every future drive pays the confirm fan-out (one seat per raw SHOULD-FIX) — and D9's
  reversal question re-opens this default at window close, so the spend has a scheduled
  re-authorization point.

## Build + docs-sync directives

- One `/dev-loop` drive builds D1-D3, D5 counter, D7 machinery, D12, collects the D4
  stranded record, and runs the docs census: the now-false overnight-only comment at the
  emit step, its emitted-workflow copy, the `.claude/commands/dev-loop.md` source framing
  the loud park as overnight-armed, the D1 addendum applied byte-for-byte, CHANGELOG.
  Selftest pins (constitution rule 3): the write-confirmation schema + park rows made
  mode-unconditional; a mutation-style row proving the record commit no longer branches on
  `landedNow`; 6a black-box cases with SYNTHETIC inline records (missing provenance FAILS;
  missing D8-fields on a clean record FAILS; a backdated-looking new record FLAGS; probes/
  exempt from run-record keys, still hygiene-scanned); the counter executed against
  SYNTHETIC records (countable-N, base rate, refutation formula, window segmentation on
  BOTH key axes, UNCOLLECTED) — a fixture never supplies the evidence under test. The
  measurement (D10, D11) is executed by a hand session AFTER the drive lands, per this
  spec's protocol, records committed same day.

## Non-goals — binding

- NO auto-merge-dial code, and no change to its ratified sequencing — this spec is the
  prerequisite's instrument, never the dial.
- NO cross-model confirm implementation now — only the pre-registered switch boundary and
  its smoke-test precondition (D8).
- NO confirm-prompt wording change, in any branch, for any reason within this spec's scope.
- NO routing-surface or session-hook changes; the routing payload freeze (to 2026-08-24) is
  untouched.
- NO history-record pruning/rotation; NO change to default-mode verdict semantics.
- Replay-battery and probe results NEVER substitute for the prospective base rate.

## Acceptance criteria (reference the /dev-loop gate; commands derive from commands.json)

1. Gate green. A run in ANY mode that cannot confirm its record written parks loudly; the
   record commit no longer branches on `landedNow`; push behavior unchanged (selftest rows).
2. Parity: `confirm_prompt_hash` joins the parity keys with a red/green mutation case; the
   regenerated bundle carries `resolve_default: "clean"` through the existing triangle.
3. Lint 6a extension: the four synthetic-record cases red/green as specified; the six
   legacy records and the collected seventh stay green.
4. The counter, executed against synthetic records, computes all quantities, segments the
   window on BOTH D7 axes, and REFUSES the arming evaluation while UNCOLLECTED > 0.
5. Docs census complete: no artifact still claims the write confirmation is overnight-only;
   the D1 addendum present in `headless-autonomy.md` byte-identical to the text embedded
   here.
6. Same-day deliverables (post-gate, hand-executed per protocol): one two-arm probe record
   and one battery record (17 findings, adjudicated) under `history/probes/`, lint-clean,
   committed 2026-08-21.

## OPEN RISKS — carried to ratification, NOT cleared

- **R1 — same-model monoculture, now with named blind axes.** Seeds are derived and judged
  inside the same model family the seat runs on; "known-false" is bounded by what that
  family can know to be false. The D7 window key cannot see an upstream point-release
  inside an unchanged model name, nor what `session default` resolves to. Cross-model
  confirmation remains the recorded stronger lever — and today it is UNINSTALLED with zero
  recorded runs (D8), so the pre-registered escalation currently lands on SUSPEND.
- **R2 — the UNCOLLECTED gate is discipline made checkable, not enforcement — and the
  observed compliance base rate is bad.** At least five landings 2026-08-14→08-20 committed
  no record under the existing convention (0/5), and a seventh record sat stranded in a
  worktree until this spec's recon found it. A branch deleted before collection is a ref
  the counter cannot see: deleting it UNBLOCKS arming by destroying (statistically
  FAIL-ward) negative evidence, and deletion is the easier command — the friction asymmetry
  points the wrong way. The counter's WARN and the arming block are tripwires over what
  remains, same guarantee class as the D6 guard, never to be documented as deterministic.
- **R3 — replay representativeness.** The 17 replayed findings were authored by earlier
  lens prompts against earlier code; the adjudication step (D11) makes each refutation
  interpretable but is itself same-model judgment. Same-day evidence, honestly labeled,
  never a window statistic.
- **R4 — the counter reads agent-written records.** Garbage in, statistics out — records
  are redacted, schema-checked, provenance-gated, and still agent-reported (the workflow
  cannot run git). Rule-2 facts here are "what the records say," not "what happened."
- **R5 — cost inversion, chosen and now bounded.** resolve=clean everywhere + ~32 seats
  today runs against the owner's own usage-limit policy; the owner chose it for measurement
  velocity, and D9's reversal question is the scheduled re-authorization.
- **R6 — premise-rider PRE-MORTEM (verbatim mechanism, UNRESOLVED).** August 2027: the dial
  armed on this window and its first bad merge was a defect a fresh confirm seat had
  dismissed; forensics could not reconstruct what the window measured. Backward: (5) both
  arming criteria were inflated by the SAME drift — an over-refuting seat aces a
  refutation-only floor AND raises strict-PASS, and the design had no seeded-TRUE control
  [answered by D8/D10's TRUE arm — the deeper monoculture stands]; (4) the sensor moved
  mid-window through the MODEL axis (posture/arg/upstream release) while the freeze watched
  only wording [answered by D7's two-axis key; the point-release blindness stands in R1];
  (3) the denominator leaked FAIL-ward through honor-system hand sessions (observed 0/5)
  and deletable branches — "the bias got laundered as tidiness" [tripwired by D5+R2, NOT
  solved]; (2) day one ratified a false fact (46 vs 33/17) and an unexecutable procedure
  under deadline pressure [answered by D11's corrected numbers and adjudication step];
  (1) THE ROOT: "results by end of today" compressed ratification, build, corpus design,
  and first measurement into one day — the pre-registration urgency was half-manufactured,
  since a record-defined window never counted uninstrumented runs anyway. The deadline
  pressure itself is UNANSWERED and stands as the rider left it. Most-likely variant: the
  window never closes — restart/suspend triggers fire until the owner stops feeding it, and
  the dial decision is made "on vibes plus a dead spec."
- **R7 — premise-rider OPPOSITE CASE, judged NOT CLEARLY WEAKER (UNRESOLVED).** Verbatim
  verdict: for P2 and the arming machinery, the opposite case "is, by this repo's own
  recorded premise-rider judgments, the stronger branch" — `auto-merge-dial.md` R4 recorded
  confirm-to-merge as STRONGER, `resolve-to-clean.md` R5 carried the bill forward, and
  Shape B validated the one-owner-tap pattern in production. Confirm-to-merge delivers the
  merge mechanics with NO base rate, NO probe, NO window, NO arming spec — a human decision
  per merge needs no sensor-validity proof. The opposite build: ship Part 1 alone (standalone
  audit value), let clean data accrue incidentally, build confirm-to-merge when merge
  mechanics are wanted, write the arming spec only if the owner affirmatively re-decides the
  dial against R4. Component verdicts: P1 build (clearly stronger than not); P3 probe run
  today (cheap, decisive-if-negative, weak-if-positive — a passed textbook probe bounds the
  ceiling only); P3 battery only at its honest size with adjudication; P2 premature; P4
  defensible for volume once bounded (D9). This spec proceeds on the owner's TWICE-ratified
  sequencing (the dial ratification and resolve-to-clean both carried this dissent in their
  text); ratifying it a third time, in view of this risk, is exactly what ratification is.

---

## Owner rulings — 2026-08-21 (post-gate escalation of the first build drive)

The 2026-08-21 build drive FAILed its gate (7→2→4 blockers, no-progress halt) escalating
three questions; the owner ruled via the escalation docket, answers quoted. These BIND the
remediation pass and the re-gate.

1. **The implementer's 14-line D4 rider is REFUSED** (*"Undo it"*). The worktree copy of
   this spec is restored byte-identical to this file. This block — owner-authored from the
   owner's recorded answers — is the sanctioned route for the same information. The refusal
   stands as precedent: agents do not amend ratified text, even flagged for
   counter-signature; the corpus has refused that form before
   (`review-remediation-2026-08-15.md` R1) and refuses it again here.
2. **The eighth record is KEPT** (*"Keep it"*), by this ruling — the route corrected, the
   substance authorized. `2026-08-21T01-17-08Z.json`, found stranded uncommitted in the
   headless-autonomy-overnight worktree: a resolve=clean, FAIL-ward record all three lenses
   judged legitimate evidence. EXCLUSION-LEDGER ENTRY: it predates instrumentation (no
   `emittedBy`), is mechanically NON-COUNTABLE toward N and the base rate, and joins the
   seventh record as collected-legacy. The selftest pin at the by-name assertion is
   reshaped to the growing-directory invariant (the D3 assertion shape); the adjacent
   `preSpec.length` pin follows the new count.
3. **The D6/D7 window-key gap is fixed IN THIS DRIVE** (*"Fix now, then ship"*): the
   countable class requires BOTH sensor axes (`confirmPromptHash` + the recorded review
   route) in lint 6a and the counter; keyless records are NON-COUNTABLE and warned, never
   pooled into a segment; the hand-record procedure documents both keys. Bundled into the
   same remediation: `addedAt()` batched to one git pass anchored on the EARLIEST add;
   unparseable record names FAIL CLOSED in the backdating suspects filter; `probes/`
   subdirectory records enumerated by UNCOLLECTED; the SKILL.md citation corrected to the
   real owner of the default.
