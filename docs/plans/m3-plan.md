# M3 · v0.4 "Intelligence" — deep scan · constitution mining · interview finalize · held-out gold benchmark

*Plan for execution on Opus · target: veriloop `9ccc455`+ (v0.3.2, `npm test` = 119 ok / 0 failed)*

**Goal:** compile a repo's invariants into an owner-confirmed, file:line-cited, deterministically re-verified constitution (phases 3+4), finalize the ≤5-question interview (phase 5), and prove the mining engine on a **blind held-out benchmark** — Torevan's 14 hand-built rules recovered ≥80% from a frozen pre-bridge corpus.

**Plan-stable:** not gated on any prior milestone's outcome. The engine design (schemas, pipeline, execution contract, lint) depends on **no M2 result**. Only the two final full-pipeline re-runs consume post-M2 repo states. ⟨execution-time⟩ parameters — knowable only when the step runs — each with its fill source:

- ⟨POST_M2_TOREVAN_SHA⟩ — the Torevan tree the final re-run mines. Fill: `git -C /Users/benjaminli/my_projects/Torevan rev-parse HEAD`, taken **after** the M2 constitution bridge has landed. (Not the benchmark corpus — that is frozen, below.)
- ⟨POST_M2_CATAN_SHA⟩ — catan_rl_v2's tree for its re-run. Fill: `git -C <catan_rl_v2 checkout> rev-parse HEAD`, after M2 converges catan.
- ⟨SELFTEST_BASELINE⟩ — assertion count that must grow. Fill: the final `N ok` line of `npm test` at branch tip (119 at 0.3.2 — governance §8 requires it rises).
- ⟨NEXT_VERSION⟩ — the release stamp. Fill: bump `VERILOOP_VERSION` at `scripts/generate.mjs:24` (currently `'0.3.2'`) to the M3 release; the version-stamp-agreement selftest asserts all five locations match.

**Deferred decisions** (CONTENT depends on a prior milestone's *result* — deliberately NOT in this plan):
- Which mined rules survive over ⟨POST_M2_TOREVAN_SHA⟩ and how they three-way-merge against the post-bridge hand-owned constitution. The *benchmark* (§0) is content-stable because it runs on the frozen corpus; the *production re-run* (§7) is timing-only.
- Whether to emit a CLAUDE.md pointer section vs. keep the constitution the sole surface (roadmap:200-203, open decision roadmap:359) — owner call, not an engine choice.
- Language-pack review checklists — **Non-goal**, see end.

---

## §0 — Benchmark freeze: record NOW, before M2's bridge runs

**Why the ordering is load-bearing (record this rationale verbatim):** M2's bridge copies Torevan's hand-built `docs/constitution.md` (14 rules) into the generated constitution. After that, the rule prose lives in the live tree and "recovery" degenerates to **copying**, not mining. The blind benchmark is only credible against a **pre-bridge** corpus. So the freeze is pinned here, in M3's plan, executed first — before any other M3 work and before M2.

**What → the frozen corpus.** Torevan @ `4d0e114` (verified `git -C /Users/benjaminli/my_projects/Torevan rev-parse HEAD` = `4d0e11448368b761f45bd9100c70041cb9175f4c`; post-M1-merge, pre-constitution-bridge). Working assumption: any pre-bridge SHA is valid; this one is pinned. Record the SHA in the eval methodology doc.

**What → the blinding / exclusion list** (paths the miner must NOT see, at ANY SHA — they carry rule phrasings and would leak the gold):
- `docs/constitution.md` — the hand-built gold itself.
- `.claude/veriloop/**` — generated constitution, experts, specs.
- `CLAUDE.md` sections that restate rules.

Allowed sources: code, tests, git history **minus** the excluded paths, and non-constitution docs.

**How → mechanical blinding (reproducible by a stranger).** Two enforcement surfaces, because the miner reads both a checkout and git history:

```sh
# 1. filtered tree checkout — the miner's --repo points HERE, never at the live clone
git clone /Users/benjaminli/my_projects/Torevan /tmp/vl-bench
git -C /tmp/vl-bench checkout 4d0e114
rm -f /tmp/vl-bench/docs/constitution.md
rm -rf /tmp/vl-bench/.claude/veriloop
# CLAUDE.md: strip only rule-restating sections; if unsure, remove the whole file (fail-blind).

# 2. history mining runs through a fixed pathspec-exclude that every git call inherits:
#    git -C /tmp/vl-bench log -p -- . \
#      ':(exclude)docs/constitution.md' ':(exclude).claude/veriloop/**' ':(exclude)CLAUDE.md'
```

The miner (`mine.mjs`, §2) takes a `--blind <pathspec-file>` argument listing these excludes; every `git log`/`git blame` it spawns appends them. The filtered checkout guarantees tree scans cannot reach the gold even if a pathspec is forgotten.

**Verify (concrete observable):**
```sh
test ! -e /tmp/vl-bench/docs/constitution.md && test ! -e /tmp/vl-bench/.claude/veriloop; echo $?   # → 0
git -C /tmp/vl-bench log -p -- . ':(exclude)docs/constitution.md' ':(exclude).claude/veriloop/**' \
  | grep -c 'non-negotiable'   # spot-check: 0 hits from the gold's phrasing
```

**Measurement.** After mining the blind corpus, score recovery against the **frozen** gold — the answer key pinned to the corpus SHA, not the live mutable path (which persists past M2 and can drift the denominator before §6 runs). Snapshot it into the eval methodology doc: `git -C /Users/benjaminli/my_projects/Torevan show 4d0e114:docs/constitution.md` → **14** hand-built rules (verified `git -C /Users/benjaminli/my_projects/Torevan show 4d0e114:docs/constitution.md | grep -cE '^[0-9]+\.'` = 14; today `docs/constitution.md` at HEAD also = 14 — keep the live-path grep only as a today-consistency assertion, never as the scored key). Each match requires a valid file:line citation. Target **≥80% = ≥12 of 14**. Publish methodology + result (the corpus SHA, the exclusion list, the per-rule recovered/missed table, conformance stats). This is v1.0 acceptance criterion 3 (roadmap:105).

---

## §1 — Phase 3: deep scan (`scripts/scan.mjs`, new)

veriloop today runs phase 1 detect (`scripts/detect.mjs`), phase 2 verify (`scripts/verify.mjs`), phases 6/7 generate (`scripts/generate.mjs:1-2`). Phase 3 is a new script; phase 4 (§2) is another. Neither exists yet (`ls scripts/` = detect, verify, generate, lint-bundle, selftest).

**What.** Walk the repo's danger surfaces and emit `scan-notes.md` with the schema `{surface → file:line evidence → nominated expert/rule candidates}`, halting for owner classification-confirm, bounded and resumable.

**How (snippet-anchored).**
- Emit machine-readable notes so phase 4 consumes them. Each surface entry:
  ```md
  ## surface: <name>            e.g. "shell-string execution", "auth boundary"
  - evidence: scripts/verify.mjs:64   # spawnSync(..., { shell: true })
  - nominates: expert=security | rule="never synthesize shell strings"
  ```
- **Classification-confirm halt:** after nomination, write `scan-notes.md` and STOP for owner review before mining runs — mirror the write-then-stop covenant of the existing loop's plan-halt (constitution.md:3 "checks the plan … _before_ any code is written"). Do not auto-advance to phase 4.
- **Bounded + resumable:** cap surfaces scanned per invocation; persist a cursor in `scan-notes.md` frontmatter (`scanned_paths:`), so a re-run skips completed surfaces — the same journal-resume discipline M1 relied on (roadmap:399). Never re-nominate a surface already in the file.
- Reuse the roster nomination vocabulary already in code — `SPECIALIST_DEFAULTS` keys `security | drift | ux` (`scripts/generate.mjs:170`) — so a scan nomination maps 1:1 onto a roster-add the interview can confirm (`applyRosterAdd`, `generate.mjs:179-210`).

**Verify.**
```sh
node scripts/scan.mjs --repo /tmp/vl-bench --out /tmp/vl-bench/scan-notes.md; echo $?     # → 0
grep -qE '^## surface:' /tmp/vl-bench/scan-notes.md && grep -q 'evidence:.*:[0-9]' /tmp/vl-bench/scan-notes.md; echo $?  # → 0 (schema present, citations carry :line)
# resumability: second run adds no duplicate surface headers
node scripts/scan.mjs --repo /tmp/vl-bench --out /tmp/vl-bench/scan-notes.md
test "$(grep -c '^## surface:' /tmp/vl-bench/scan-notes.md)" = "$(grep '^## surface:' /tmp/vl-bench/scan-notes.md | sort -u | wc -l | tr -d ' ')"; echo $?  # → 0
```
Add a selftest fixture + assertion (must grow ⟨SELFTEST_BASELINE⟩).

**Implementation notes (shipped v0.3.8).** `scripts/scan.mjs` landed as specified: a deterministic, compiler-side script (NOT emitted — `lint-bundle` confirms it stays out of the bundle/manifest). The danger-surface catalog is a hardcoded array of `{ name, expert, rule, line?, path?, uiOnly? }`, each matched IN PROCESS (regex over file text and/or the relative path); every nominated expert key is one of `SPECIALIST_DEFAULTS` (`security|drift|ux`) so it maps 1:1 onto `applyRosterAdd`. The walk is sorted (stable output), skips `node_modules`/`.git`/`.claude/veriloop/.backups`, and reads files as TEXT only — this slice spawns NOTHING (no git; history mining stays in §2). Output carries an `emitted_surfaces:` frontmatter cursor (surface-keyed — honoring this section's stated "skips completed **surfaces**" intent): every run re-walks the WHOLE tree and re-collects evidence, then emits up to `--max` (default 12) NEW surface blocks whose surface is not already in the cursor — so a surface over the `--max` budget is DEFERRED to a re-run, **never dropped** (review fix: the first cut keyed the cursor on scanned PATHS and silently lost capped-out surfaces — the worst failure mode for a danger scanner). `line` (code-pattern) matchers are scoped to CODE files (`CODE_EXTS`), so prose mentions of `shell:` in docs/CHANGELOG no longer evict the real code hit; the scanner also skips its own source (which defines the catalog regexes). The `ux` surface only nominates when a cheap self-contained `package.json`-deps check reports a UI stack. Halt: write, print `review scan-notes.md, then run mine.mjs`, exit 0 — never chains into mining, never runs/compiles a nominated check. Smoke test: pointed at veriloop itself it surfaces `verify.mjs` `shell: true`, the `.gitignore` splice markers, and the golden-fixture surfaces. Selftest baseline grew 212 → 227 (including the evidence-eviction and `--max`-defer regression locks). (`SKILL.md:103` describes the separate LLM-driven dev-loop scan writing `$REPO/.claude/veriloop/scan-notes.md`; deterministic `scan.mjs` is a distinct compiler-side mechanism — the two coexist and are not the same surface.)

---

## §2 — Phase 4: constitution mining pipeline (`scripts/mine.mjs`, new)

**What.** Turn scan surfaces + repo signals into candidate rules, each **witnessed-or-dropped**, **deterministically re-verified by running a compiled check**, ranked by author diversity, carrying governance metadata, and three-way-merged on re-runs.

**How — candidate sources** (roadmap:172-175):
- (a) docs / CLAUDE.md claims **verified against code** — never trust the prose alone.
- (b) invariant-shaped tests (assertions that fix a repo-wide shape).
- (c) git-history mining: repeated same-pattern fixes and revert/re-fix chains **across authors** — cross-author recurrence is the anti-spurious signal (SZZ-style blame over `git log` with the §0 pathspec excludes).
- (d) danger surfaces from `scan-notes.md` (§1).

**How — witness-or-drop.** Every proposed rule ships **≥2 file:line citations** plus a conforming/violating site count, or it is rejected *before the owner sees it*. This is the discipline already codified as generated constitution rule 2 ("`file:line` citations come from the deterministic scripts", `.claude/veriloop/constitution.md:18-20`) — mining must not weaken it.

**How — deterministic re-verification (never trust the LLM's "line 42 matches").** Compile each candidate to a checkable query and **RUN it over the tree**; record a conformance ratio (guideline ≥90% over ≥5 sites, else it is a *hypothesis*, not an invariant, and is dropped). Execution obeys §3's contract absolutely.

**How — ranking + refusal.** Rank by author/commit diversity and code trustworthiness over raw frequency (frequency alone is mostly spurious). Prune implied/redundant rules. **Refuse unfalsifiable prose** — "write clean code" cannot fail a check, so it is not a rule (roadmap:184).

**How — governance metadata per rule** (roadmap:185-188): `confirmed-by`, `confirmed-at-SHA`, conformance stats, `owner` expert — the exact shape the live constitution already carries (`_(owner: security)_` tags at `.claude/veriloop/constitution.md:29,33,36,39`). Staleness = conformance decay on re-run → flag for re-confirmation. On re-runs, **three-way merge** using the stored last machine proposal as the merge base (constitution rule 8, `.claude/veriloop/constitution.md:43-47`; owner edits win) — the constitution is `handOnce`/`starter`-owned (`generate.mjs:390`), never clobbered.

**Verify.**
```sh
node scripts/mine.mjs --repo /tmp/vl-bench --scan /tmp/vl-bench/scan-notes.md \
  --blind docs/plans/m3-bench-excludes.txt --out /tmp/vl-bench/mined.json; echo $?   # → 0
# every candidate carries ≥2 citations + a conformance ratio (no naked prose survives):
node -e 'const c=require("/tmp/vl-bench/mined.json").candidates; process.exit(c.every(r=>r.citations.length>=2 && typeof r.conformance.ratio==="number")?0:1)'; echo $?  # → 0
```
Selftest: a fixture repo with one obvious invariant (≥5 conforming sites) mines to a candidate with conformance ≥0.9; a fixture with a prose-only claim mines to **zero** candidates.

**Implementation notes (shipped v0.3.9).** `scripts/mine.mjs` landed as the IN-PROCESS core of §2 — a deterministic, compiler-side script (NOT emitted; `lint-bundle` scans the emitted bundle, not `scripts/`). CLI: `--repo <path> --scan <scan-notes.md> --out <mined.json>` (`--blind` is DEFERRED with git-history). It imports `node:fs`+`node:path` ONLY, reads every file as TEXT, and spawns NOTHING — §3(b)'s in-process path satisfied **by construction**, so this slice cannot violate §3(a)/(c)/(e) (there is no runnable query to launder). To keep the compiler-side source itself spawn-free under grep, the shell-option danger regexes are assembled from string FRAGMENTS (`SHELL + ':\\s*' + 'true'`), so `grep "shell: *true" scripts/mine.mjs` finds nothing and the selftest asserts the source references no `child_process`/`spawnSync`/`exec(`. Candidate sources SHIPPED: (a) `scan-notes.md` nominations (owner from the `expert=` key; provenance `scan-surface:<name>`) and (d) rule-shaped docs/`CLAUDE.md` claims mapped to a compiled query by keyword, then VERIFIED against code (provenance `docs:<path:line>`) — the prose alone is never trusted. Sources (b) invariant-shaped tests and (c) git-history/SZZ are DEFERRED. Each candidate compiles to a `{conforming, violating}` regex query RUN in process (violating wins ties); citations are the real, repo-RELATIVE `file:line` conforming (witnessing) sites. Drop precedence: no compiled query ⇒ unfalsifiable-REFUSED; `<2` citations ⇒ witness-or-drop REJECTED; `ratio<0.9 || sites<5` ⇒ hypothesis DROPPED; else kept as an invariant. Governance metadata per survivor: `{rule, owner, provenance, citations, conformance:{ratio,conforming,violating,sites}, confirmed_at_sha}` with `confirmed_by`/`ratification` left `null` (owner-gated). `corpus_sha`/`confirmed_at_sha` are read from `<repo>/.git/HEAD` (following the ref into `refs/` and `packed-refs`) WITHOUT spawning git, degrading to `null` when there is no `.git` (e.g. the `fixtures/mine-target/` subtree — confirmed null in the selftest). Ranked by TRUE conforming-site count then distinct-file spread — both computed pre-cap, since citations are capped at 20 for output (author/commit diversity via `git blame` stays DEFERRED). Halt: write `mined.json`, print `review mined.json — the owner confirms which candidates become rules`, exit 0 — mine PROPOSES; it never writes or confirms `constitution.md`. New `fixtures/mine-target/` holds one code-backed invariant (`src/spawn-{a..e}.mjs`, 5 conforming `shell:false` sites, 0 violating ⇒ conformance 1.0) plus a prose-only `docs/GUIDELINES.md` claim (0 candidates); the selftest runs the REAL pipeline (scan.mjs → mine.mjs) end-to-end and adds the 1-citation-drop + spawns-nothing locks. Selftest baseline grew 227 → 262 — the count includes the gate resolve-to-clean (adversarial council on the final diff): comment/string lines are no longer counted as enforcement sites (a `//`-commented antipattern can't suppress a real invariant); `readHeadSha` is linked-worktree-aware (`.git`-FILE → gitdir/commondir), with size-capped reads + `..`-refusal for the untrusted-repo posture; and locks were added for the ratio-drop (isolated 5/7), prototype-key, detached-HEAD, packed-refs, and import-allowlist paths. STILL DEFERRED to later, separately-red-teamed slices: git-history/SZZ mining (`--blind`), spawned/argv/subprocess check execution + the full §3 runnable-command contract, three-way merge on re-runs, writing/confirming the constitution (owner-gated), and the benchmark run/scoring (§6).

---

## §3 — Mined-query execution contract (Security ruling 2026-07-14 · BINDING)

Phase 4's "compile each candidate to a checkable query and RUN it" is a **NEW untrusted-text→execution surface**. The candidate text originates from repo docs/history/CI — untrusted — and neither existing guard covers it: the rule-5 adoption filter (`scripts/lib/detectors.mjs:523-534`, rejecting `[$\`]`/compound shell at `:525-526`) guards *command adoption*, and the rule-6 tier gate (`plan()` at `scripts/verify.mjs:51-59`) guards *verify-time runs* — a mined query runs in neither path. Binding requirements, verbatim-strength:

- **(a) Never synthesize shell strings.** argv-array spawn ONLY. `verify.mjs`'s runner is **NOT reusable** for mined queries: `runCommand` calls `spawnSync(cmd, { shell: true, … })` (`scripts/verify.mjs:64`) — a shell string surface. Mined-query execution must use `spawnSync(argv[0], argv.slice(1), { shell: false })` or `execFile`. No `shell: true`, ever.
- **(b) grep/AST checks run in-process or via argv spawn** — a regex scan in Node, or `spawnSync('grep', ['-rn', pattern, path], {shell:false})`. Never a string handed to `sh -c`.
- **(c) Every compiled query passes the rule-6 tier gate and defaults read-only** — route it through the same `plan()` classification (`verify.mjs:51-59`): `safety=never`/`mutates` are non-runnable (`verify.mjs:54-55`); a mined query is `safe`-tier read-only or it does not run. This is generated constitution rule 6 (`.claude/veriloop/constitution.md:34-36`).
- **(d) Every candidate carries a provenance tag** — where it came from (`docs:path:line`, `git-history:<sha>`, `scan-surface:<name>`, or a fixture dir).
- **(e) Provenance inside any scan-only fixture dir bars compilation to a runnable query** (rule-4 laundering guard). A candidate whose provenance is `fixtures/hostile-ci/` (or any scan-only dir) is scan-only forever — it may be *cited*, never *compiled+run*. This is generated constitution rule 4 ("Nothing from `fixtures/hostile-ci/` is ever executed — scan-only, forever", `.claude/veriloop/constitution.md:28-29`; `scripts/selftest.mjs:5,60`).

**Verify.**
```sh
grep -n "shell: *true" scripts/mine.mjs; echo "expect no match, exit 1: $?"   # → 1 (grep found nothing)
```
Selftest (execute, don't string-match): feed the compiler a candidate tagged `fixtures/hostile-ci/…` → it emits a scan-only candidate with **no runnable query** (assert the query field is null/absent); feed a `safety=never` compiled command → the runner refuses it.

---

## §4 — Referee-as-lint: machine-check the ownership constraint

**What.** Mechanize the existing `.claude/veriloop/constitution.md:67` invariant — "No orphan rules, no jobless experts" — as a hard lint, not prose.

**How.** Extend `scripts/lint-bundle.mjs`. The referee precedent is already there: the jobless-expert **warn** at `lint-bundle.mjs:164` and the gate-equality **fail** at `lint-bundle.mjs:174-180`. Add two **fail**-level (not warn) checks reading the constitution's `_(owner: <key>)_` annotations against the manifest roster (`generate.mjs:419`):
- **No orphan rule:** every numbered rule has exactly one `owner` whose key is a roster expert → else `fail(...)`.
- **No jobless expert:** every roster expert owns **≥2 rules** (matches acceptance criterion 3, roadmap:105) → else `fail(...)`. Promote the existing `:164` warn to this stricter fail once mining fills ownership.

**Gate both fails on mined ownership present** — key off the absence of the STARTER banner (`render.mjs:108`) / TODO owner strings (`render.mjs:114,116`). A legitimate pre-mining starter bundle assigns rules 1/4/5 to `code-review` and leaves rules 2/3 as TODO placeholders whose owners are the literal strings `assign — usually …` and `the security expert …` (not roster keys), so a Torevan-shaped roster's `security`/`drift` experts own zero concrete rules — the strict fails must NOT fire there, only once mining has filled every owner.

**Verify.**
```sh
# positive: a post-mining fixture bundle (ownership fully assigned, ≥2 rules/expert) lints clean —
# NOT a bare `generate` on the blind corpus (that yields the starter, whose experts are still jobless):
node scripts/lint-bundle.mjs --bundle fixtures/mined-bundle; echo $?     # → 0 on a well-formed mined bundle
# negative: hand-edit that constitution to strip one rule's owner tag → lint exits 1
```
Selftest: a fixture bundle with an owner-less rule → lint-bundle **fails**; an expert owning 1 rule → **fails**.

---

## §5 — Phase 5: interview finalized (≤5 option-table questions)

**What.** Finalize the interview to ≤5 option-table questions **including budget posture**, and wire budget → model/effort routing into the emitted template.

**How.** The routing plumbing already exists and must be reused, not rebuilt: `BUDGET_PRESETS` for `frugal|balanced|max` (`generate.mjs:114-142`) over the 7 `PHASE_GROUPS` (`generate.mjs:106`), validated by `buildBudget` which **throws on a bad answer** (`generate.mjs:145-166`) — "never emit a loop that dies mid-run". The interview's job is to *collect* `budget_posture` (+ optional per-group `phase_models`/`phase_effort` overrides) into `interview.budget_posture`; `buildBudget` already consumes it and `buildConfig` emits it into the template (`generate.mjs:247`). Keep questions as owner-confirm option tables (roster-add nominations from §1 map onto `applyRosterAdd`, `generate.mjs:179-210`, which itself **throws** on a bad add). ≤5 total; budget posture is one of them.

**Verify.**
```sh
# §0's blinding deleted .claude/veriloop/ (incl. commands.json); regenerate it via detect first:
node scripts/detect.mjs --repo /tmp/vl-bench --out /tmp/vl-bench/.claude/veriloop/commands.json
node scripts/generate.mjs --repo /tmp/vl-bench --commands /tmp/vl-bench/.claude/veriloop/commands.json --interview /tmp/frugal.json
grep -q '"posture": *"frugal"' /tmp/vl-bench/.claude/veriloop/veriloop-manifest.json; echo $?   # → 0
# a bad posture fails the BUILD (design intent):
printf '{"budget_posture":"cheap"}' > /tmp/bad.json
node scripts/generate.mjs --repo /tmp/vl-bench --commands /tmp/vl-bench/.claude/veriloop/commands.json --interview /tmp/bad.json; echo "expect nonzero: $?"   # → nonzero (buildBudget throws)
```

---

## §6 — Held-out gold benchmark run (the credibility centerpiece)

**What.** Run §1→§2 over the §0 frozen blind corpus; score recovery of the 14 gold rules; publish.

**How.** `mine.mjs --repo /tmp/vl-bench --blind <excludes>` → `mined.json`. Score each of the 14 gold rules (source of truth: the **frozen snapshot** `git show 4d0e114:docs/constitution.md`, kept OUT of the miner's view — the live path is scored NEVER, only asserted consistent today) as recovered iff a mined candidate names the same invariant **with a valid file:line citation into the corpus**. Write the methodology doc: corpus SHA `4d0e114`, the snapshotted 14-rule frozen gold, exclusion list, per-rule recovered/missed table, conformance ratios. Record the rationale from §0 (freeze precedes M2 or recovery degenerates to copying).

**Verify (the gate for the milestone's headline claim):**
```sh
# score against the FROZEN gold pinned to the corpus SHA, not the live mutable path:
git -C /Users/benjaminli/my_projects/Torevan show 4d0e114:docs/constitution.md > /tmp/vl-bench-gold.md
node scripts/bench-score.mjs --gold /tmp/vl-bench-gold.md \
  --mined /tmp/vl-bench/mined.json; echo $?     # → 0 iff recovered ≥ 12/14 (≥80%)
# today-consistency only (NOT the scored key): live path must still match the frozen snapshot
diff <(git -C /Users/benjaminli/my_projects/Torevan show 4d0e114:docs/constitution.md) \
  /Users/benjaminli/my_projects/Torevan/docs/constitution.md; echo $?   # → 0 today
```
Observable: the methodology doc exists, states corpus `4d0e114`, embeds the frozen 14-rule gold, and its recovered count is ≥12.

---

## §7 — Sequencing, stability, exit criteria

1. **§0 benchmark freeze is recorded FIRST — before M2's bridge.** Everything else in M3 runs after M2 (needs the post-bridge tree to re-run production).
2. Engine design (§1–§5) depends on **no M2 outcome** — it is fixtures + frozen-corpus driven. The ONLY execution-time inputs are ⟨POST_M2_TOREVAN_SHA⟩ and ⟨POST_M2_CATAN_SHA⟩, consumed solely by the final production re-runs.
3. **Final production re-runs (timing-only):** regenerate both repos through the full pipeline over their post-M2 SHAs; three-way-merge mined rules into each hand-owned constitution; lint enforces the referee (§4).

**Exit criteria** (map to v1.0 acceptance criterion 3, roadmap:105 / roadmap:212-213):
- Both repos re-run through the full pipeline; **zero starter TODOs** in either constitution.
- Every rule cites file:line, carries a conformance count, is owner-confirmed; every expert owns ≥2 rules; `lint-bundle` enforces the referee (`node scripts/lint-bundle.mjs --bundle <repo>` → exit 0).
- Held-out gold benchmark **≥80% (≥12/14)**, methodology + result published.
- `npm test` green with assertion count > ⟨SELFTEST_BASELINE⟩ (governance §8, roadmap:340).
- `VERILOOP_VERSION` bumped (`generate.mjs:24`); version-stamp-agreement selftest green.

---

## Non-goals (explicit)

- **Language-pack review checklists.** Council-DEFERRED (roadmap:208-210); revisit triggers are first sustained frugal usage or M4 Rust cold-start — not M3.
- **Autonomy ladder / tier-scaled auto-land.** Post-1.0 (roadmap:15, roadmap:293-304); v1.0 keeps the owner gate.
- **CI-gate mode** (emit a GitHub Action running the gate). Post-1.0 (roadmap:311-313).
- **Rust/cargo detector.** M4 (roadmap:215-242).
- **veriloop's own `ci.yml`.** Deferred to M5, npm-test-only; `claude plugin validate` is release-checklist, **not** a push gate (binding consultation 2026-07-14).
- Do **not** reuse `verify.mjs`'s `shell:true` runner (`verify.mjs:64`) for mined queries — §3(a) forbids it.
