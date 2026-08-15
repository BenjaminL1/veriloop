# Spec: auto-merge dial — opt-in merge after a clean gate PASS

**Feature (one line):** An owner-configurable dial letting the emitted dev-loop merge a feature
into the base branch after a clean gate PASS, instead of always stopping at the preview branch —
so "full autonomy" is truthfully claimable as an opt-in.

**Status:** RATIFIED — BINDING (owner, 2026-08-13), **sequenced behind resolve-to-clean.**

> Ratified in full view of open risks R1–R6, including the premise-rider's judgment that the
> confirm-to-merge alternative (R4) is stronger. The owner chose to keep this design and answer
> R1/R2 by SEQUENCING: **`resolve-to-clean` ships first** (its own `/dev-plan` spec — it did
> not exist yet, at ratification time), the loop demonstrates a real clean-PASS base rate, and only then does this
> spec enter `/dev-loop`. Building this spec before resolve-to-clean lands is a violation of
> the ratification, not a scheduling choice.
>
> **R5 (dial shape) resolved by owner:** the three-position dial `off|trivial|all` stands, on
> the strength of D3 (diff-re-derived tier) + D4 (prose-surface exclusion) + D5 (full lenses
> when armed). Security's `off|on` dissent is recorded and overruled.

*Annotation — 2026-08-15, recorded by the review-remediation drive
(`.claude/veriloop/specs/review-remediation-2026-08-15.md`, D4). The parenthetical in the
blockquote above read "it does **not** exist yet". `resolve-to-clean` has since been ratified,
built and gated, so a present-tense claim written on 2026-08-13 had become false on its face;
the tense was corrected and anchored to the ratification date it was true of. That phrase is
the only byte of the ratified blockquote this drive changed, and it changes no decision, no
risk and no sequencing. **Pending owner counter-signature at merge.***

---

## Amendments this spec makes — explicit, not incidental

- **Constitution rule 10** (constitution.md:57-58, "Branch + preview only… never merge or publish
  without explicit owner sign-off") is REWRITTEN per D9. The constitution is hand-owned: the
  **owner applies the amendment by hand**; this spec only records the text.
- **Locked vision row** (docs/plans/roadmap-v1.md:15, "auto-land is post-1.0; v1.0 keeps the owner
  gate") is amended: the ladder's FIRST RUNG moves pre-1.0 as an opt-in default-off dial. The
  promotion/demotion machinery stays post-1.0 (non-goal).
- **Partition spec** (constitution-enforcer-partition.md:44, :51): rule 10's "structural —
  unviolatable" classification is FALSIFIED by this feature. That row is amended and rule 10
  gains real enforcers (D6). The partition spec's 11-of-10 tally error at :51 and the stale
  gate_commands finding at :46-48 are corrected in the same pass.

## Decisions

- **D1 — the dial.** `auto_merge: "off" | "trivial" | "all"`, default `"off"`, plus
  `auto_merge_via: "push" | "pr" | "local"`, default `"push"`. Both originate in the hand-owned
  `interview.json` ONLY. `generate.mjs` must NOT seed either key from a prior manifest's
  `interview_answers` (plugs dial-laundering through the machine-owned manifest,
  generate.mjs:421-426): absent from `interview.json` means `off`, whatever the manifest says.
- **D2 — args may lower, never raise.** Effective dial = min(repo default, per-run arg). A
  per-run argument has no provenance and must never grant authority the owner's hand did not.
- **D3 — the authorization predicate is a pure, extractable region** of the emitted workflow
  (same treatment as `verdictFrom`), executed by the selftest against a case table
  (`off` ⇒ false across every verdict × tier × waiver combination; the ON cases asserted too).
  Authorized ⇔ ALL of:
  1. effective dial ≠ `off`;
  2. verdict === `PASS` strictly — zero blockers, zero concerns, zero waivers (note: today the
     land step gates on `!FAIL`, so WAIVED/CONCERNS reach the preview push; the MERGE bar is
     strict PASS regardless);
  3. dial = `all`, OR dial = `trivial` AND the tier is RE-DERIVED mechanically from the diff's
     touched files (never the plan agent's self-declared tier) AND no touched file is part of
     the bundle's prose surface (D4);
  4. no file changed after the gate returned PASS (tree-hash equality with the gated tree);
  5. the base branch SHA equals the run-start anchor (base moved ⇒ refuse);
  6. the run touched neither `constitution.md` nor the dial's config.
- **D4 — markdown is executable here.** The trivial keyword list (detectors.mjs:233) classes
  docs/readme/changelog as trivial — but in an agent repo, persona/skill/command prose IS the
  behavior surface. For AUTHORIZATION (not for cost routing), any diff touching `.claude/**`,
  `skills/**`, or the emitted command docs is non-trivial. (Rider finding, adopted.)
- **D5 — arming the dial forces the full lens roster** regardless of tier. The trivial tier's
  thin roster (code-review only, template :253-282) never merges unseen.
- **D6 — enforcers.** The manifest carries `auto_merge` beside `gate_commands`; `lint-bundle`
  gains a manifest↔workflow dial-parity check mirroring the gate-parity check (:177); the
  selftest triangle (interview ↔ manifest ↔ committed workflow, selftest.mjs:1249-1262) extends
  to the dial. The predicate case table (D3) is rule 10's second enforcer.
- **D7 — loop ordering changes.** Docs-sync moves BEFORE the gate, unconditionally (2-1 council
  majority; also fixes a live defect — docs-sync output is currently reviewed by nothing). A
  run-start anchor (base SHA + effective dial + constitution hash) is frozen into `ctx`. The
  attestation record is written and pushed BEFORE the merge (post-merge, `gh pr merge` may
  delete the branch the record commits to; today's `:949` records the wrong SHA).
- **D8 — mechanics.** `push`: local merge to base + push, refusing on base-moved. `pr`: push
  branch, open PR, merge via `gh`; `gh` availability is probed OUTSIDE the land agent; any gh
  failure stops at preview (fail closed — never silently switch mechanic); gh output is
  untrusted input to the context that holds merge authority. `local`: merge, no push.
- **D9 — rule 10 text, one version everywhere** (this repo's constitution by owner hand; the
  starter template render.mjs:174-176 for new adopters — no second variant):
  > **10. Landing is gated, never assumed.** Work lands on a branch. A merge to the base branch
  > occurs only when all hold: (a) the owner armed `auto_merge` by hand, and no per-run argument
  > raised it; (b) the verdict is `PASS` — zero blockers, zero concerns, zero waivers; (c) no
  > file changed after the gate returned that PASS; (d) the run amended neither this
  > constitution nor the dial. Otherwise the loop stops at a pushed preview and the owner
  > merges. Publishing or deploying is never automated. Conventional commits, no AI co-author
  > trailer.
- **D10 — docs sync.** README loop-shape lines (:60, :164, :247 region), skills/veriloop/SKILL.md:372,
  command-doc SOURCES in render.mjs (:201, :237, :257) plus emitted copies, SECURITY.md §3
  (add `git push` — an egress it already omits today — and the gh credential-scope disclosure),
  CHANGELOG, roadmap §6.A amendment note, generate.mjs:285/:291. Dated records (m1/m2 plans)
  are flagged, never rewritten.

## Non-goals — binding

- No promotion/demotion ladder, no shadow/advisory modes (post-1.0, roadmap §6.A).
- No branch-protection management; no sandboxing axis.
- No automated rollback — the attestation carries the pre-merge SHA and a revert command, only.
- No change to preview-push behavior for CONCERNS/WAIVED runs (recorded as a known separate
  issue; the merge bar is strict PASS regardless).
- No cross-run verdict memory (see R2 — its absence is a named risk, not an oversight).
- `resolve-to-clean` is NOT in this spec's scope — it is this spec's ratified PREREQUISITE,
  specced and built separately, landing before this spec enters `/dev-loop`.

## Acceptance criteria (reference the /dev-loop gate; commands derive from commands.json)

1. Gate green with the dial code present and `interview.json` carrying no dial key ⇒ emitted
   workflow behaves byte-for-byte-equivalently to today at the Land boundary (default off).
2. Selftest: predicate case table passes, including `off` ⇒ false universally and the armed
   PASS/tier/anchor cases; dial-parity check red when manifest and workflow disagree; triangle
   check red when interview and manifest disagree.
3. A dial-armed run with any CONCERNS, WAIVED, FAIL, post-gate file change, or base movement
   stops at preview with the reason reported.
4. `pr` mechanic with gh absent/unauthed stops at preview with the reason reported.
5. Rule-10 text updated in the starter template; this repo's constitution amendment applied by
   the owner (verified present before the loop's docs-sync closes).
6. Every D10 artifact updated; no stale "never merges" claim survives anywhere in the tree.

## OPEN RISKS — carried to ratification, NOT cleared

- **R1 — pre-mortem (premise rider, verbatim mechanism).** The dial's firing condition has a
  historical base rate of 0/6 on the verdict axis and 0/6 on the tier axis; the fix loop runs
  only on FAIL, so nothing drives CONCERNS to zero. A shipped-but-never-firing feature creates
  pressure to make PASS reachable ("verdict shopping" on free re-rolls, or a future
  resolve-to-clean fixer optimizing reviewer-appeasement against same-model lenses) — PASS
  stops measuring cleanliness, and the dial arms onto a hollowed sensor. The wreck: previously
  flagged diffs merged on manufactured PASSes; owner trust in the gate itself lost.
- **R2 — dead code on arrival.** Clean PASS is structurally unreachable by the current loop
  (fix loop is FAIL-only). Until that changes, this feature is 100% of the risk surface for
  ~0% of the capability. The predicate has no cross-run memory: a diff that previously drew
  CONCERNS can be re-rolled to PASS. Mitigation NOT included (non-goal); named here.
- **R3 — the structural guarantee is spent.** Rule 10 was the partition's only
  structural/unviolatable rule. This trades it for the predicate + case-table class — tested,
  but a weaker class by that spec's own ranking, purchased for a marketing sentence.
- **R4 — the opposite case, judged NOT WEAKER (rider's words: STRONGER).** Confirm-to-merge:
  the loop finishes, presents the attestation, the owner authorizes with one keystroke, and
  veriloop executes the chosen mechanic. Delivers the merge mechanics, anchor check, and
  attestation ordering of this spec with no constitution rewrite and no dial machinery; rule 10
  stays structural. Cannot support only the literal word "full." Sequencing alternative:
  build confirm-to-merge + resolve-to-clean first, observe a real clean-PASS base rate, then
  decide the dial.
- **R5 — council dissents, unresolved.** Security: drop `trivial`, ship `off|on` (a position
  whose residual function is scope-selection on a re-derived-but-still-heuristic tier).
  Drift: docs-sync reordering is a parity regression for dial-off adopters; hash-equality alone
  was its preferred fix.
- **R6 — the autonomy claim's honesty depends on R2.** With the dial shipped but never firing,
  "veriloop gives full autonomy" is true as an option and hollow as a demonstration — the exact
  overclaim class this repo's own discipline prosecutes.

---

## SUPERSESSION NOTE — R2, dated 2026-08-13 (owner-authorized)

**The ratified text above is unchanged and stays unchanged.** This note is appended, never a
rewrite (the discipline `attestation-redaction-hardening.md:32` set: a spec that was wrong is
amended in the open, with a date and an authority, so the original letter and the correction
are both readable).

**What R2 said:** *"Clean PASS is structurally unreachable by the current loop (fix loop is
FAIL-only)."*

**What changed:** `.claude/veriloop/specs/resolve-to-clean.md` (RATIFIED — BINDING, owner,
2026-08-13) was built. Under `resolve = "clean"` a SHOULD-FIX counts toward the verdict only
if an independent confirm agent confirms it, and the fix loop extends to exactly those
confirmed, non-pre-existing, non-waived concerns. So the *structural* half of R2 no longer
holds: a clean PASS is now reachable in principle, and reachable through a path that makes it
mean something rather than by lowering the bar.

**What R2 still says, and what is NOT superseded:**

- The **base rate is still unmeasured.** Reachable in principle is not reachable in practice.
  resolve-to-clean's own R4 is explicit that if confirmed-concern rates stay high, the honest
  outcome is *"the dial stays unbuilt"* — not another sensor adjustment. This note removes a
  structural blocker; it supplies no evidence that the dial should be built.
- **No cross-run memory** was added (an explicit non-goal of resolve-to-clean), so R2's second
  sentence — a diff that previously drew CONCERNS can be re-rolled — is untouched and still
  open.
- **R1 is sharpened, not cleared.** R1 named "a future resolve-to-clean fixer optimizing
  reviewer-appeasement against same-model lenses" as a specific wreck. That fixer now exists.
  Its mitigations are the anti-appeasement fix contract, the protected-path guard (a tripwire
  over agent-reported diff lists — the workflow cannot run git), and the raw-vs-confirmed
  delta, which is the first number that makes the sensor's noise rate visible at all. The
  confirm seat shares the lenses' model, so monoculture is reduced in noise only;
  cross-model confirmation is the recorded stronger lever and is deferred.
