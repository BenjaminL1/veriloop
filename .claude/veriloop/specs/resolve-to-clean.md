# Spec: resolve-to-clean — qualify concerns, then fix what reproduces

**Feature (one line):** Make a clean PASS reachable AND meaningful: a SHOULD-FIX counts
toward the verdict only if it survives independent confirmation, and the fix loop extends to
exactly those confirmed concerns — the ratified prerequisite of `auto-merge-dial.md`.

**Status:** RATIFIED — BINDING (owner, 2026-08-13).

> Ratified in the HYBRID form in full view of open risks R1–R5. The owner selected this form
> over the full-machinery draft after the premise-rider judged qualification-first stronger
> on this repo's own run history (six runs, zero PASS, concerns 6→9 across a fix pass), and
> stamped it knowing R4: if confirmed-concern rates stay high, the honest outcome is "the
> auto-merge dial stays unbuilt," not another sensor adjustment.

---

## The measured baseline (why qualification comes first)

Six recorded runs (`history/`): gate-1 concern counts 5, 2, 1, 14, 18, 6; **zero PASS ever**;
one observed fix pass moved blockers 3→0 while concerns went **6→9**. Concern counts behave
as draws from a fresh-lens resample, not a converging quantity. Chasing raw zero is chasing
noise; the fix is to the measurement first, the code second.

## Decisions

- **D1 — knobs.** Per-run arg `resolve: "blockers" | "clean"` (default `"blockers"` — today's
  behavior unchanged, including verdict semantics), optional interview key `resolve_default`.
  Raising intensity is the safe arg direction. **No council arg** (deferred — non-goal).
- **D2 — qualification (the sensor fix), scoped to `resolve=clean` runs.** After the lens
  pass, each SHOULD-FIX goes to an independent, fresh CONFIRM agent (structured output per
  finding — confirm/refute, plus a pre-existing judgment with a cited `path:line`). A concern
  COUNTS toward the verdict only if confirmed. This is per-finding adversarial verification,
  not free-text matching — no finding-identity scheme is needed. Blockers are never
  qualified away: they keep full weight (fail-safe). The attestation records BOTH counts —
  raw and confirmed — so every clean run also measures the sensor's noise rate (the delta),
  the number R1's drift question needs.
- **D3 — scope fence.** A confirmed finding judged pre-existing (cited hunk present
  identically in the base tree, untouched by this change) is attested but NOT fixable —
  the fixer never enters baseline code. Confirm-agent judgment with citation; the citation
  is checkable in review.
- **D4 — the fix loop.** Condition: `FAIL ∨ (clean ∧ confirmedFixableConcerns > 0)`. Halt
  unless the (blockers, confirmedFixableConcerns) tuple strictly decreases lexicographically;
  stop on no-progress; at least ONE pass reserved for the concerns phase within the shared
  MAX_FIX budget. Confirmed concerns are far stabler than raw ones, but the halt rule stays —
  bounded beats complete.
- **D5 — anti-appeasement contract.** Fix prompts: fix the CAUSE, ship the assertion
  (constitution rule 3), never silence or reword a finding away. Re-run lenses are fresh;
  re-run is not resolution verification — the confirm pass is.
- **D6 — protected-path guard, honestly labeled.** Any fix-pass diff touching the
  constitution, expert personas/overrides, interview/gate-command definitions,
  `fixtures/hostile-ci/`, the selftest (deletions only), the attestation history, or the
  binding spec → HARD STOP. Path list derives at generate time per host repo, is carried in
  the manifest, and joins a **generalized** manifest↔workflow parity check (also closing the
  existing unchecked two-copies: `budget`, `crossModel`, now `resolve_default`).
  **Guarantee class:** the workflow cannot run git (template :365-372) — pure-JS logic over
  agent-reported diff lists. A strong tripwire, never to be documented as "deterministic
  enforcement."
- **D7 — concern waiver.** `applyWaivers` extends to concerns — human-authored, arg-supplied,
  `resolve=clean` only. Waived-concern clean attests as `waived`; the future dial treats it
  as NOT clean.
- **D8 — named attestation fields.** `resolveMode`, `rawConcerns`, `confirmedConcerns`,
  `budget-exhausted-at-CONCERNS` — the future dial predicate reads these, never re-derives.
- **D9 — selftest.** The loop predicate (condition + lexicographic halt + confirmed-fixable
  filter) is marker-sliced and EXECUTED against a case table (the `verdictFrom` precedent,
  selftest :701/:947 — today nothing pins the fix loop). Parity assertions extend the
  interview↔manifest↔workflow triangle (:1249-1262) to the new keys. A case asserts
  `resolve` absent ⇒ behavior identical to today.
- **D10 — docs + supersession.** `auto-merge-dial.md` R2 ("clean PASS structurally
  unreachable") superseded by a dated owner-authorized note, never rewritten (precedent:
  attestation-redaction-hardening :32 et al.). Sweep: render.mjs :201/:234, generate.mjs
  :285/:290, template :6, README :246, SKILL.md :371, regenerated command-doc mirrors; dated
  plan records annotated, not rewritten. The owner memory file's "needs a base-branch arg"
  is KNOWINGLY dropped (stacking = separate feature).

## Non-goals — binding

- No council pass (the validated adversarial-council-on-final-diff idea is deferred to its
  own spec — it earned evidence on 2026-07-21 and is not being discarded, only unbundled).
- No resolution trail / finding-identity machinery; no cross-run verdict memory; no
  base-branch/stacking arg.
- No verdict-semantics change outside `resolve=clean` (default runs are byte-equivalent).
- Cross-model confirmation is named as the known stronger lever for D2's confirm seat
  (same-model monoculture caveat) and deliberately deferred.

## Acceptance criteria (reference the /dev-loop gate)

1. `resolve` absent/`"blockers"` ⇒ workflow behavior identical to today.
2. Selftest executes the sliced predicate case table: FAIL-only entry, clean-mode entry on
   confirmed concerns, lexicographic halt, pre-existing exclusion, reserved concern pass.
3. Guard case table: each protected path class hard-stops; parity red on any generalized-key
   divergence.
4. A `resolve=clean` run attests raw AND confirmed counts; an unconfirmed SHOULD-FIX never
   blocks PASS; a confirmed-pre-existing finding is attested and never fixed.
5. Waived-concern clean attests `waived`; exhaustion attests its named marker.
6. D10 sweep complete; no artifact calls the guard "deterministic enforcement."

## OPEN RISKS — carried, NOT cleared

- **R1 — the confirm seat shares the lenses' model.** Same-model confirmation reduces noise,
  not monoculture: a systematic blind spot passes both samples. Cross-model confirmation is
  the recorded stronger lever, deferred. The raw-vs-confirmed delta (D2) at least makes the
  noise rate visible for the first time.
- **R2 — the armed pre-mortem, reduced but alive.** The appeasement gradient now points at
  confirmed concerns only — fewer, realer targets — but a fixer rewording code so a defect
  no longer draws attention still beats a fresh lens + fresh confirmer. The guard and rule-3
  contract mitigate; nothing measures residual drift except the D2 delta over time.
- **R3 — guarantee class.** Guard and scope-fence inputs are agent-reported (the workflow
  cannot run git). Recorded in D6; not closed.
- **R4 — the base rate is still a hypothesis.** Qualification makes PASS reachable in
  principle; whether the confirmed-concern rate is actually low enough for a real base rate
  is exactly what the dial's prerequisite observation period must show. If it isn't, the
  honest outcome is "the dial stays unbuilt," not another round of sensor adjustment.
- **R5 — compounding spend on the weaker branch** (carried verbatim from the prior draft):
  the dial spec's own R4 recorded confirm-to-merge as stronger than the dial; this remains
  spend on the prerequisite of the branch the process flagged as worse. The sequencing was
  the owner's ratified call; the bill is recorded.

---

## Owner rulings — 2026-08-15 (settle D5/D6/D7 scoping and the Land phase; ratified text above unchanged)

The 2026-08-14 gate run escalated four implementer judgment calls. The owner rules as
follows; these BIND the build:

1. **D6 — middle path.** The protected-path census and guard run in EVERY mode. Under
   `resolve=clean` a violation HARD-STOPS (as built). Under `resolve=blockers` a violation
   is OBSERVED AND ATTESTED — logged and recorded in `guardStops` — with the verdict
   untouched. Acceptance criterion 1 is amended accordingly: default-mode VERDICT semantics
   stay identical to today; the observational census is an accepted default-mode addition.
2. **D5 — unconditional.** The anti-appeasement contract (fix the CAUSE, ship the
   assertion, never silence/reword a finding) is emitted in ALL fix prompts. Only the
   closing confirm-pass sentence remains clean-only.
3. **D7 — confirmed-pre-existing concerns are waivable.** `applyWaivers` also runs over the
   confirmed-pre-existing bucket (human-authored waivers only); waived entries fold into
   `waivedConcerns` and are attested. A genuine baseline defect no longer makes clean PASS
   structurally unreachable.
4. **Land — the constitution leaves the docs-sync target list.** The Land agent may no
   longer edit the constitution; constitution edits are owner-only, by hand. Closes the
   guard's Land-phase back door.
