# Spec: M3 §2 — `scripts/mine.mjs` (constitution mining, in-process core)

> BINDING. Extracted from `docs/plans/m3-plan.md` §2 (authority — read it). Slice 2 of M3.
> Deterministic + IN-PROCESS (satisfies §3(b) by construction). Defers git-history mining,
> spawned-check execution (the full §3 contract), and three-way merge to later slices.

## BASE BRANCH (binding, step 0)
`mine.mjs` consumes `scan-notes.md`, which only exists on `feat/m3-scan-deep-scan` — so
**stack on that branch** (create the worktree/branch FROM it, not main). Verify before any
edit: `grep -q renderSurfaceBlock scripts/scan.mjs` (the symbol exists only on that branch;
if absent you are on the wrong base — stop).

## What
A new deterministic compiler-side script `scripts/mine.mjs` (sibling of `scan.mjs`; NOT
emitted into bundles). It turns `scan-notes.md` surfaces + docs-claims-verified-against-code
into candidate constitution rules — each **witnessed-or-dropped** and **deterministically
re-verified IN-PROCESS** — and writes `mined.json`. No LLM inside it (constitution rule 2);
reads files as TEXT only, spawns NOTHING (same scan-only discipline as `scan.mjs`).

## Inputs
- `scan-notes.md` (from `scan.mjs`, `--scan <path>`): `## surface: <name>` / `- evidence:
  path:line` / `- nominates: expert=<key> | rule="<candidate>"`.
- the repo tree (`--repo`), read as text in-process.
- docs / CLAUDE.md claims (parse rule-shaped statements, then VERIFY against code).

## Candidate sources (this slice)
(a) `scan-notes.md` nominations; (d) docs/CLAUDE.md claims **verified against code** — never
trust the prose alone. DEFER (b) invariant-shaped tests and (c) git-history mining.

## Witness-or-drop (constitution rule 2 — binding)
Every candidate ships **≥2 REAL file:line citations** + a conforming/violating site count,
or it is **rejected before it reaches the output** (never surfaced). No naked prose.

## Deterministic re-verification — IN-PROCESS ONLY (§3-safe by construction)
Compile each candidate to a checkable query and RUN it IN-PROCESS (a regex/AST scan in
Node — §3(b)'s allowed path). **NEVER spawn, NEVER shell.** Record a conformance ratio =
conforming / (conforming + violating) sites. Guideline: **≥90% over ≥5 sites** ⇒ invariant;
else ⇒ a *hypothesis*, DROPPED. (Spawned/argv checks + the full §3 execution contract are a
DEFERRED, separately-red-teamed slice — this slice must not spawn anything.)

## Refuse unfalsifiable prose
A candidate that cannot compile to a check that could fail is refused — "a rule that can't
fail a check isn't a rule." (e.g. "write clean code" → dropped.)

## Provenance + governance metadata (per candidate)
- `provenance`: `scan-surface:<name>` | `docs:<path:line>` (§3(d)).
- `owner`: the nominated expert key (`security|drift|ux` or `code-review`).
- `confirmed_at_sha`: the repo HEAD sha at mine time.
- `conformance`: `{ ratio, conforming, violating, sites }`, plus the citation list.
- Leave `confirmed_by` / ratification EMPTY — owner-confirmation is OWNER-gated, not this run.

## Ranking (cheap in-process proxy this slice)
Rank by TRUE conforming-site count and distinct-file spread — both computed pre-cap, since
citations are capped for output. (Author/commit-diversity via `git blame` is git-history →
DEFERRED; do not spawn git.)

## Output: `mined.json`
`{ corpus_sha, candidates: [ { rule, owner, provenance, citations:[...], conformance:{...},
confirmed_at_sha } ], note }` — machine-readable; `bench-score.mjs` (§6) will consume it.

## Halt (owner-gated boundary — respect it)
`mine.mjs` **PROPOSES**; it does NOT write the constitution and does NOT confirm rules.
Emit `mined.json`, print `review mined.json — the owner confirms which candidates become
rules`, exit 0. NEVER auto-writes `constitution.md`.

## Selftest (constitution rule 3, executable not narrated)
Fixtures + end-to-end pipeline (run `scan.mjs` to produce the notes, then `mine.mjs`):
- `fixtures/mine-target/` with ONE real invariant holding at **≥5 conforming sites** →
  mines to a candidate with conformance ≥0.9 and ≥2 citations, correct owner + provenance.
- a **prose-only** claim (a doc statement with no code backing) → **0 candidates**
  (witness-or-drop + unfalsifiable-refusal).
- a candidate with only **1 citation** → dropped (witness-or-drop).
- **assert `mine.mjs` SPAWNS NOTHING**: grep the source — no `shell:\s*true`, no
  `child_process`/`execSync`/`spawnSync` of candidate-derived strings (in-process only).
Count must GROW from the branch baseline (**227**).

## Non-goals (binding — DEFERRED to later slices)
- git-history / SZZ mining.
- spawned/argv/subprocess or AST-via-subprocess checks + the full §3 execution contract
  (the runnable-command laundering guard) — a SEPARATE red-teamed slice.
- three-way merge on re-runs.
- writing or confirming the constitution (OWNER-gated).
- the benchmark run / scoring (§6).

## Version + acceptance
- Patch bump from the branch version (scan branch is `0.3.8` → `0.3.9`); six stamps agree.
- `npm test` green, count > 227.
- `node scripts/mine.mjs --repo fixtures/mine-target --scan <notes> --out /tmp/mined.json`
  → exit 0; every candidate has ≥2 citations + a conformance ratio; the prose-only fixture
  yields 0 candidates.
- `lint-bundle` exit 0 (`mine.mjs` is compiler-side, not emitted).
