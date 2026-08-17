# Spec: resolution pass 2026-08-17 — release 0.6.0, tags, orphan specs, window deviation

**Feature (one line):** Execute the owner's blanket resolution instruction ("go ahead and
resolve everythign at your discretion", 2026-08-17): stamp and tag the 0.6.0 release,
backfill the missing tags, commit the three orphan working-tree items, and record the
probe-battery loss as a pre-registered window deviation.

**Status:** EXECUTED UNDER OWNER DELEGATION (sentence above, quoted verbatim), disclosed
at completion. Owner-only items deliberately NOT resolved: the roadmap C3 amendment (locked
vision), the frozen routing payload (window to 2026-08-24), DA2 (needs a live session).

---

## Already done before this spec (time-sensitive, disclosed)

- `origin/main` pushed to `35b90f9` (the classifier block cleared on retry).
- Probe-battery rescue ATTEMPTED and FAILED: `/private/tmp` cleanup already deleted every
  file (directory skeletons remain; discovered 2026-08-17). See D5 for the deviation.
- Feasibility verified for the replacement rule: 79 of 90 project transcripts date to
  2026-08-10; probe prompt A1a byte-matches 6 transcripts.

## Decisions

- **D1 — settings.json is repo policy, committed.** The superpowers disable
  (`enabledPlugins: false`) is committed as policy, not moved to settings.local.json:
  README documents that a second SessionStart pack fights veriloop's routing with no
  arbitration, and this repo is the routing measurement's instrument. Commit message
  carries the rationale; the mid-window environment condition is recorded in D5's append.
- **D2 — routing-measurement.md committed, with two dated appends.** (a) An environment
  note: superpowers has been disabled in this repo since window start (Arm 2 condition,
  recorded per the spec's own deviation discipline). (b) The battery-loss deviation (D5).
- **D3 — partition draft committed as DRAFT, corrected.** constitution-enforcer-partition.md
  gets dated corrections — the rules-7/9 "unenforced" finding is marked superseded by
  3bb6717 (landed three minutes after the spec was written; the gate now runs lint), and
  the 6+2+2+1=11 tally is fixed to sum to 10 — while the DRAFT / NOT-RATIFIED header and
  the two unresolved premise challenges stay untouched. Committing a visibly-DRAFT spec is
  the cheap-and-safe disposition the 2026-08-12 consult recommended.
- **D4 — the 0.6.0 release.** One commit on main: the CHANGELOG's three unreleased-era
  sections consolidate under `## 0.6.0 — 2026-08-17` (internal structure preserved as
  subsections; the marker-pinned live figure stays where it is — the marker design's
  stamp-day behavior is that the marker moves only when the next count-changing commit
  opens a new Unreleased section). All five version stamps bump to 0.6.0 (package.json,
  plugin.json, marketplace.json ×2, generate.mjs VERILOOP_VERSION) with the manifest
  regenerated; the release paragraph carries the two council-mandated sentences (routing
  72/72 measured on claude-fable-5 under the frozen payload; floor-check window open to
  2026-08-24). Pin examples fixed to a tag that will exist (README `#veriloop-v0.6.0`,
  SECURITY.md same); the "tagging currently lags" hedge updated. Gate green before commit;
  the selftest's lockstep pin (first versioned heading = five stamps) and the marker/
  positional figure assertions are the verify points.
- **D5 — the window deviation, pre-registered before close.** Appended to
  routing-measurement.md, dated 2026-08-17: the scratchpad battery results (including all
  recorded probe session IDs) were destroyed by OS temp cleanup before rescue. REPLACEMENT
  EXCLUSION RULE, pre-registered now for the 2026-08-24 count: exclude any project session
  dated 2026-08-10 whose transcript contains a user message byte-equal to one of the 36
  probe prompts recorded verbatim in this spec, plus same-day headless runner-infrastructure
  sessions (depth-prefix builders and fork parents), corroborated by the deny-all
  PreToolUse overlay visible in their transcripts. The rule adds no prompt text to the
  repo (the prompts are already in the ratified spec) and is mechanical. The loss and the
  rescue-came-too-late timeline are stated plainly — the 2026-08-12 consult flagged this
  exact risk and the rescue was not confirmed then.
- **D6 — tags.** `veriloop-v0.6.0` annotated on the release commit. Backfills
  `veriloop-v0.4.0` and `veriloop-v0.5.0` as ANNOTATED tags on the archaeology-verified
  version-stamp commits (found via `git log -S` on package.json), each annotation stating
  it was created retroactively on 2026-08-17 (release was stamp-only at the time). Tags
  pushed with main.

## Non-goals — binding

- No routing-payload, SESSION_ROUTES, or matcher changes (frozen to 2026-08-24).
- No roadmap/vision-table edits (C3 amendment is the owner's, flagged not fixed).
- No constitution edits; no changes to the resolve-to-clean machinery.
- No window-close memo (due 2026-08-24, computed then under D5's rule).

## Acceptance criteria (reference the /dev-loop gate)

1. Gate green (lint + selftest) after every commit; lockstep pin satisfied at 0.6.0.
2. `git tag` lists v0.4.0/v0.5.0/v0.6.0; backfills verifiably sit on the commits whose
   trees printed the counts their CHANGELOG sections publish; annotations carry the
   retroactive statement.
3. Pin examples reference only tags that exist.
4. routing-measurement.md carries both dated appends; partition draft corrected, DRAFT
   header intact; settings.json committed with rationale.
5. Working tree clean at the end; origin/main and origin tags current.

## Amendments — 2026-08-17, post-council and post-rider (before execution)

- **Corrections from the council (executed findings):** TWO unreleased sections, not three;
  SEVEN version stamps, not five (manifest included, regenerated after the bump, same
  commit); the v0.5.0 tag targets **61802bd** (tree prints 436 — the count its section
  publishes) not the `git log -S` stamp commit fe1db20 (tree prints 307), and v0.4.0
  targets 0724f2e (prints 253) — annotations name BOTH SHAs and, for v0.5.0, disclose
  that 61802bd's in-tree CHANGELOG still published 253 until the 2026-08-15 repair on
  main. D5's prompt-match RULE is replaced by a **frozen, fenced, class-tagged list of the
  79 excluded session IDs** inside the deviation append (38 probe-first-message, 39
  runner-infrastructure, 2 seed smokes; derivation line included; the sole real session in
  the window, 5f7d0ff2…, named INCLUDED; the false PreToolUse-overlay corroborator is
  dropped — kill-at-first-tool_use preempts hooks, so it never appears in probe
  transcripts). The 79-vs-75 arithmetic slack against the ratified memos is reconciled in
  the append. `.gitignore` gains a `.claude/settings.local.json` line in D1's commit.
- **Rider rulings, adopted:** (a) execution SPLITS BY CLOCK — the derivation and the three
  private commits run now (the transcripts auto-expire ~2026-09-09; after that the list is
  uncheckable); the RELEASE COMMIT AND TAGS are built and staged locally but NOT pushed —
  the owner signs three things (the number 0.6.0, the 72/72 release sentence, the
  retroactive-tag plan) before anything public and irreversible ships. (b) The two
  discretionary calls in the derivation (the runner-infrastructure class; the
  sole-real-session identification) are flagged **pending owner counter-signature**, with
  the ~2026-09-09 verification mortality stated so the owner knows the check must happen
  while transcripts exist. (c) The 2026-08-24 window-close memo publishes counts BOTH ways
  — under the frozen exclusions and under the no-exclusion worst case — so the post-hoc
  list is demoted from keystone to footnote; this commitment is written into the append
  now. (d) The CHANGELOG consolidation is verified by explicit diff against drift's
  enumerated must-survive list, not by the gate alone (the gate pins markers and figures,
  not prose survival).

## OPEN RISKS

- **R1 — the battery loss weakens the window count's provenance.** The replacement rule is
  pre-registered before close and mechanical, but it was written AFTER the data loss — a
  reader may fairly note the exclusion set is now derived, not recorded. Mitigation: the
  rule uses only the spec's own pre-registered prompt texts; the derivation is
  reproducible by anyone with the transcripts.
- **R2 — 0.6.0's scope is owner-inferred.** Version and date chosen by convention under a
  blanket delegation; if the owner wanted a different number or a launch-coupled release,
  the remedy is a follow-up stamp — tags are cheap, history is annotated.
