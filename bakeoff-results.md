# Constitution bake-off: six tools, one held-out repo, hidden gold

**Date:** 2026-07-27 · **Corpus:** Torevan (1,363 files; 152 `.ts`, 93 `.tsx`, 27 `.sql`) with all three constitutions and `.git` removed — **0 verbatim gold-rule leaks** verified · **Gold:** the owner's hand-written 22 rules, held out · **Scoring:** blind (tool names stripped, key withheld), one scorer per arm.

---

## Result

| tool | recall (C / P / M of 22) | score | extras | legit / style / wrong |
|---|---|---|---|---|
| **Spec Kit** | 16 / 2 / 4 | **17.0** | 21 | 15 / 5 / 1 |
| **Agent OS** | 14 / 2 / 6 | 15.0 | 9 | 8 / 1 / 0 |
| context42 | 10 / 3 / 9 | 11.5 | 48 | 28 / 20 / 0 |
| **veriloop** | 10 / 2 / 10 | 11.0 | 8 | 8 / 0 / 0 |
| mirrorai | 10 / 2 / 10 | 11.0 | 16 | 10 / 6 / 0 |
| agent-rule-miner | 8 / 3 / 11 | 9.5 | 18 | 12 / 6 / 0 |

**The winner read zero source files.** Spec Kit's own method log:

> *"This command is a TEMPLATE-FILLING routine, not a mining routine… **I did not open a single `.ts`, `.tsx`, or `.sql` file.** … **5 of 5 principles came from a DOC. 0 of 5 came from CODE.** … Nothing here was *discovered*; it was *relocated*."*

It found `docs/DESIGN_DECISIONS.md §1.3` — a section literally titled **"INVARIANTS (block-merge on violation)"**. The gold derives from that same document. So the top of this table measures *"did the tool find the answer key,"* not *"did it derive anything."*

**And transcription propagates staleness.** Spec Kit and Agent OS both enshrined `CLAUDE.md`'s stale *"push directly to origin/main, no PRs"* — the precise inverse of gold rule 16 (branch + preview, never merge without sign-off). A miner that reads code would not have made that error.

**This repo also flatters doc-readers.** Agent OS's log: *"Every one of its 153 source modules opens with a long 'why this exists / what must never happen' JSDoc header… ~10 of 20 rules are restatements of prose the owner already wrote."*

---

## Per-rule coverage — where the real signal is

```
 # gold rule                                     spec  a-os  ctx42 veri  mirr  a-r-m   hits
 1 TS engine is sole game-logic authority         ██    ██    ██    ██    ██    ██     6/6
 2 Python↔TS byte-parity, conformance harness     ██    ██    ██    ██    ██    ▒▒     5/6
 3 RNG determinism; CSPRNG seed, never random     ··    ▒▒    ▒▒    ▒▒    ██    ··     1/6
 4 Integer-ID topology, no float Point leak       ··    ··    ··    ··    ··    ··     0/6
 5 Server re-validates every move                 ██    ██    ██    ██    ██    ▒▒     5/6
 6 Per-seat redaction; leak = compile error       ██    ██    ██    ██    ██    ██     6/6
 7 No server secret in the browser                ██    ██    ██    ██    ██    ██     6/6
 8 No injection/XSS; no dangerouslySetInnerHTML   ··    ··    ··    ··    ··    ··     0/6
 9 Guest gating server-enforced                   ██    ▒▒    ▒▒    ▒▒    ··    ··     1/6
10 RLS everywhere; DEFINER hardening              ██    ██    ██    ██    ▒▒    ██     5/6
11 Migration + schema mirror + advisor pass       ██    ██    ██    ██    ██    ▒▒     5/6
12 No `any`                                       ██    ██    ██    ██    ██    ██     6/6
13 Explicit return types on exports               ██    ██    ██    ██    ██    ██     6/6
14 Named exports only                             ██    ██    ██    ··    ██    ██     5/6
15 No deep relative imports                       ██    ██    ▒▒    ··    ▒▒    ██     3/6
16 Branch + preview only, no unsigned merge       ▒▒    ··    ··    ··    ··    ··     0/6
17 Soft-migrate; never remove a surface           ··    ··    ··    ··    ··    ··     0/6
18 Conventional commits                           ██    ██    ··    ··    ··    ··     2/6
19 Commit author must be <owner email>            ██    ··    ··    ··    ··    ··     1/6
20 No AI co-author trailer                        ██    ██    ··    ··    ··    ··     2/6
21 [skip ci] only for docs-only pushes            ██    ██    ··    ██    ··    ··     3/6
22 Never stage .env*                              ▒▒    ··    ··    ··    ··    ··     0/6
```

The table splits at rule 15, and the split is the finding.

**Rules 1–15 — code-resident. Mining works.** The whole correctness / anti-cheat / DB spine is recovered by nearly every tool, independently, from source.

**Rules 16–22 — owner policy. Mining fails.** Only the two doc-transcribing tools scored here at all, and only because the owner had already written them down somewhere.

---

## The deepest finding: **you cannot mine a prohibition on something that never happens**

Three of the universal misses share a mechanism. I checked the corpus:

| gold rule | occurrences in the repo |
|---|---|
| 8 — no `dangerouslySetInnerHTML` | **0** |
| 17 — soft-migrate / deprecation shims | **0** |
| 22 — never stage `.env*` | nothing staged |

The invariant exists **precisely because the bad thing never happened.** There is no pattern to observe, no frequency to count, no deviation to measure. Every filter in the prior art — deviation-from-defaults, popularity gates, ≥2-file thresholds — operates on things that *are present*. All of them are structurally blind here.

Compare the rules everyone found: redaction (31 files), RLS (16 `enable row level security`), server authority (a recurring sentence in the source). Loud, countable, present.

**Rule 4 is the instructive exception.** `Point` appears in 34 files — loud evidence — and **0/6 found it**. The invariant is *"no **float** Point leaks into the integer topology"*: a type-level distinction, not a count. Presence of evidence isn't sufficient; some invariants need reasoning about what's absent *within* what's present.

---

## What each tool is actually good at

- **Spec Kit** — a relocator. Strong wherever the owner already wrote a rule down; structurally blind everywhere else; will faithfully transcribe a stale line over the repo's real posture.
- **Agent OS** — best doc-and-JSDoc reconstruction, 8 legitimate extras, and its mandatory interview is the right instinct. Blind to owner-reserved process rules.
- **context42** — most productive: 28 legitimate extras (version-gating, one-transaction completion, no-derived-cache) the gold itself lacks. But it read only 24% of in-scope files, and the "must never be violated" filter its arm used was *the agent's, not the tool's* — context42 optimizes for stylistic mimicry.
- **veriloop** — **10C achieved with docs/specs/PLAN files deliberately unread**, 13 of 17 rules confirmed against executable artifacts, **8 legitimate extras and 0 style, 0 wrong** — the cleanest precision in the field.
- **mirrorai** — best pure code derivation: 12 of 14 rules from code, **zero false claims**, all 46 path citations existence-checked with 0 broken.
- **agent-rule-miner** — auditable to a fault (grep tallies, not impressions), but `frequency × deviation` is blind to anything that isn't a repeated token.

---

## What this says veriloop should be

1. **The elicitation tier is not a fallback — it is 7 of 22 rules, and no amount of scanning will reach them.** Stop treating the interview as a cost to minimise. It is the only channel for the entire landing/policy layer, and for every prohibition on a thing that never happened.
2. **Mining is genuinely good at the code-resident spine.** Nine rules were recovered independently by 5–6 tools. That half is solved; don't over-engineer it.
3. **Ask for absences explicitly.** The interview needs a prompt the prior art has no equivalent of: *"what must never appear in this repo?"* — because the miner is constitutionally incapable of asking it.
4. **Extras are underrated.** Every tool produced legitimate invariants the gold lacks (28, 12, 10, 8…). The interview should present mined extras for adoption, not just confirm mined hits — that is where mining beats the human.
5. **Prefer derivation over transcription even at a recall cost.** Transcription won this table *and* imported a stale rule that inverts the owner's actual policy. veriloop's arm scored lower and was never wrong.
6. **Precision is the differentiator, not recall.** veriloop: 8 extras, 0 style, 0 wrong. Everyone else carried noise.

---

*Method caveats, stated plainly: n=1 repo, one domain, one scorer per arm. `.git` was removed, which handicaps tools using git-history signal (mirrorai). No owner was available, so every interview step was marked `[INFERRED]` — Agent OS and Spec Kit are elicitation-first and are penalised accordingly; that penalty is the measurement, not a flaw. Spec Kit's own output predates and partly seeded the gold, so its recall is upward-biased by an unknown amount.*
