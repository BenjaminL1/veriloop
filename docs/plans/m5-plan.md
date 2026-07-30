# M5 · v0.6 "Launch machinery" — plan

*Planned 2026-07-14 · executable-by-a-weaker-model-cold (repo §8 convention). Register:
snippet-anchored, terse, imperative — match [`fix-8-9-plan.md`](./fix-8-9-plan.md).*

**Goal:** ship veriloop's launch machinery — its own CI gate, the trust pack, the demo
repo + recorded run, the README overhaul, and the distribution fixes — so a stranger goes
from README to a working generated loop in 5 minutes (roadmap acceptance criterion 6,
[roadmap-v1.md:110-112](./roadmap-v1.md)).

**Plan-stable:** not gated on any prior milestone's outcome. Structure, checklists, and the
CI spec below are fixed now; only the ⟨execution-time⟩ fills change. Each is knowable only at
execution and carries its exact fill source:

- ⟨cmd-enumeration⟩ — the concrete safe/ask/never command list for the README "What veriloop
  runs" section. Fill from the generated `.claude/veriloop/commands.json` **at the execution
  SHA** (`node scripts/detect.mjs --repo . --out .claude/veriloop/commands.json` regenerates
  it) crossed with the scripts under
  `scripts/` that actually run. Do NOT hand-transcribe; read the file.
- ⟨comparison-facts⟩ — every cell of the README comparison table (vs `/init` · Spec Kit ·
  aider · CodeRabbit). Fill by re-verifying each competitor's current behavior at publish
  time against its primary source (roadmap §11 links, [roadmap-v1.md:368-374](./roadmap-v1.md));
  a stale cell is a BLOCKER — these move.
- ⟨benchmark-number⟩ — the mining-recovery figure, IF cited in the README. Fill from the benchmark's
  held-out gold benchmark result ([roadmap-v1.md:195-198](./roadmap-v1.md)); omit the claim
  entirely if it has not been published. Its VALUE is a deferred decision (below), not a
  plan-time fill.
- ⟨quickstart-clone-result⟩ — pass/fail of the 5-minute quickstart on a clean clone. Fill by
  actually running it on a fresh `git clone` at the execution SHA.
- ⟨checkout-pin-sha⟩ — the full commit SHA to pin `actions/checkout` at in `ci.yml`. Fill
  from `git ls-remote https://github.com/actions/checkout <tag>` at execution time; pin the
  40-char SHA, never the tag.
- ⟨setup-node-pin-sha⟩ — the full commit SHA to pin `actions/setup-node` at in `ci.yml`. Fill
  from `git ls-remote https://github.com/actions/setup-node <tag>` at execution time; pin the
  40-char SHA, never the tag.

**Deferred decisions** (CONTENT depends on a prior milestone's result — NOT in this plan):
- Whether the README cites a mining-recovery number, and its value — depends on the benchmark's
  benchmark having published ≥80% ([roadmap-v1.md:105](./roadmap-v1.md)).
- Cross-tool install adapters (superpowers precedent, [roadmap-v1.md:256-258](./roadmap-v1.md)):
  **evaluate as a listed decision, do not build.** Recorded in §6 below; no work item.

---

## Part 1 — veriloop's own `ci.yml` (consultation-settled 2026-07-14, BINDING — encode exactly)

### What

Add `.github/workflows/ci.yml` to the veriloop repo. Confirmed absent today (`ls
.github/workflows/` → no such directory). The compiler gets its own exit-code gate.

### The spec (do not deviate — settled by expert consultation)

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]          # NEVER pull_request_target
permissions:
  contents: read                  # minimum; no write scopes
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20, 22]        # matches package.json engines ">=18"
    steps:
      - uses: actions/checkout@<checkout-pin-sha>   # ⟨checkout-pin-sha⟩ — full SHA, NOT a tag
      - uses: actions/setup-node@<setup-node-pin-sha>
        with:
          node-version: ${{ matrix.node }}
      - run: npm test              # === node scripts/selftest.mjs (package.json:8)
```

Binding rules:
- **`npm test` only.** No build, no publish, no extra jobs. `package.json:8` is
  `"test": "node scripts/selftest.mjs"` — that is the whole gate.
- **Matrix node 18/20/22.** `package.json:6` declares `"engines": { "node": ">=18" }`.
- **`actions/checkout` (and `setup-node`) pinned by full commit SHA**, not a moving tag
  (supply-chain hardening — the repo's own drift lens would flag a tag).
- **`permissions: contents: read`.** No write scopes anywhere.
- **`on: [push, pull_request]`.** NEVER `pull_request_target` (it runs with secrets against
  untrusted fork code).
- **No `${{ github.event.* }}` interpolation inside any `run:` line** (shell-injection sink).
- **`claude plugin validate .` is NOT in this push gate.** It is a release-checklist step
  (§5), and OPTIONALLY a *separate* scheduled, non-blocking latest-CLI canary workflow — it
  must never fail a push/PR, because CLI-spec churn is not a code regression
  ([roadmap-v1.md:329](./roadmap-v1.md) names this risk).

### The self-detection side effect (record it, do it deliberately)

veriloop self-hosts ([commit `6830618`], `.claude/veriloop/veriloop-manifest.json` exists).
Its own manifest today records the test command as CI-unverified:

- `gate_commands: [{ name: "test", ci: false }]` (the `ci` field is set at
  [generate.mjs:227](../../scripts/generate.mjs) from `verified_by_ci`).
- `commands_summary.test.verified_by_ci: false` ([generate.mjs:424](../../scripts/generate.mjs)).

Adding `ci.yml` with a `run: npm test` line means the detector's CI scan
([detectors.mjs](../../scripts/lib/detectors.mjs) reconcile, via `ci.mjs`) will find `npm
test` as a CI-run command. **On the next `node scripts/generate.mjs --repo . --commands
.claude/veriloop/commands.json`, veriloop's own manifest flips those `false`→`true`.** Do
this deliberately: regenerate the self-host bundle
in the same change so the manifest tells the truth.

> **Discrepancy note (code wins):** there is NO top-level `"ci": false` boolean in the
> manifest. The flip is the per-command `gate_commands[test].ci` and
> `commands_summary.test.verified_by_ci` fields — verified `false` in the live manifest at
> this SHA. State it that way, not as a single manifest flag.

### The structural rule (restate from the selftest's ci-adopt comment block)

The self-install is **NEVER citable as adopt-path evidence.** Only `fixtures/ci-adopt/`
assertions count. This is already law in the tree — restate it verbatim in the CI PR
description and any doc that mentions the flip, quoting
[selftest.mjs:538-541](../../scripts/selftest.mjs):

> "ci-adopt is the ONLY evidence for the adopt path — never cite veriloop's own
> self-install/manifest as proof it works … a fixture supplies INPUT (a CI file); the
> assertions interrogate the detector's decision."

So: adding `ci.yml` makes veriloop's manifest *say* `ci: true`, but that manifest is NOT
proof the CI-adopt detector works — `fixtures/ci-adopt/` (asserted at
[selftest.mjs:542-622](../../scripts/selftest.mjs)) remains the sole evidence.

### How

1. Write `.github/workflows/ci.yml` per the spec above; fill ⟨checkout-pin-sha⟩ /
   ⟨setup-node-pin-sha⟩ from `git ls-remote`.
2. Regenerate the self-host bundle: `node scripts/generate.mjs --repo . --commands
   .claude/veriloop/commands.json` — confirm the manifest
   diff flips only `test`'s `ci`/`verified_by_ci` to `true` (plus `generated_at`).
3. Add a `## 0.6.x` CHANGELOG entry naming the CI addition and the deliberate self-manifest
   flip.

### Verify

- `node -e "require('js-yaml')"` is unavailable (repo is dependency-free) — instead:
  `python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); assert
  d['on']==['push','pull_request']; assert d['permissions']=={'contents':'read'}; assert
  d['jobs']['test']['strategy']['matrix']['node']==[18,20,22]; print('ok')"` → prints `ok`,
  exit 0.
- `grep -n 'pull_request_target\|github.event' .github/workflows/ci.yml` → no output, exit 1
  (neither appears).
- `grep -E 'actions/checkout@[0-9a-f]{40}' .github/workflows/ci.yml` → matches (SHA-pinned),
  exit 0.
- `grep -c 'claude plugin validate' .github/workflows/ci.yml` → `0`.
- After regenerate: `python3 -c "import json; m=json.load(open('.claude/veriloop/veriloop-manifest.json'));
  assert [c for c in m['gate_commands'] if c['name']=='test'][0]['ci'] is True; print('flipped')"`
  → `flipped`, exit 0.

---

## Part 2 — Trust pack (checkable items)

Each item below is a checkable deliverable from the roadmap M5 trust-pack section
([roadmap-v1.md:260-267](./roadmap-v1.md)). All target the veriloop repo root / README /
SKILL.md — nothing is emitted into a target repo.

| # | Item | Verify (command → observable) |
|---|------|-------------------------------|
| T1 | README **"What veriloop runs"** section mirroring safe/ask/never tiers. The concrete command enumeration is ⟨cmd-enumeration⟩ — fill from `commands.json` + `scripts/` at exec SHA. | `grep -n 'What veriloop runs' README.md` → exit 0; section names the three tiers (safe/ask/never) matching the verify safe-list at [README.md:77](../../README.md) and [detectors.mjs:24-37](../../scripts/lib/detectors.mjs). |
| T2 | All scripts in-repo, small, readable; no `curl \| bash`, no obfuscation. | `grep -rn 'curl.*\|.*bash\|curl.*\|.*sh\b' scripts/ README.md skills/` → no output, exit 1. `wc -l scripts/*.mjs` — each human-readable; flag any >800 lines for a reader note. |
| T3 | `allowed-tools` scoping present in skill frontmatter. | `grep -n 'allowed-tools' skills/veriloop/SKILL.md` → exit 0 (add if absent — currently only `name`+`description` at [SKILL.md:2-3](../../skills/veriloop/SKILL.md)). |
| T4 | Never suggest `--dangerously-skip-permissions`. | `grep -rn 'dangerously-skip-permissions' README.md SECURITY.md skills/` → no output, exit 1. (Scope excludes `docs/`: the token legitimately appears there as a *negated* mention — [roadmap-v1.md:265](./roadmap-v1.md) "never suggest --dangerously-skip-permissions" and this plan — which are not violations of the never-SUGGEST requirement.) |
| T5 | Explicit no-exfil / no-network / no-telemetry statement. | `grep -in 'no-exfil\|no.telemetry\|no network\|does not.*network\|no telemetry' README.md SECURITY.md` → exit 0. |
| T6 | `SECURITY.md` at repo root (**absent today** — confirmed `ls SECURITY.md` fails). | `test -f SECURITY.md` → exit 0. Contents: threat model for a shell-running skill, the no-network/no-exfil pledge, how to report, the sha-pinnable-release note. |
| T7 | sha-pinnable tagged releases documented. | README install section references pinning by tag/SHA; `grep -n 'veriloop-v\|pin.*sha\|@v0' README.md SECURITY.md` → exit 0. |
| T8 | `LICENSE` file (MIT) at repo root (**absent today** — confirmed `ls LICENSE` fails, though `plugin.json:11` and `README.md:220` already say MIT). | `test -f LICENSE && grep -q 'MIT' LICENSE` → exit 0. |

> **Discrepancy note (code wins):** the repo advertises MIT (`plugin.json:11`,
> `README.md:218-220`) but ships **no `LICENSE` file and no `SECURITY.md`**. Both are real
> gaps this milestone closes — verified by `ls` at plan time.

---

## Part 3 — Distribution fixes

### D1 — SKILL.md keeps BOTH `name` + `description` frontmatter

Already true ([SKILL.md:2-3](../../skills/veriloop/SKILL.md): `name: veriloop`, `description:
>-`). Dual compat: Claude Code + `npx skills` standard. **Keep enforced** — do not drop
either key.

**Verify:** `python3 -c "import re,io; s=open('skills/veriloop/SKILL.md').read();
fm=s.split('---')[1]; assert 'name:' in fm and 'description:' in fm; print('ok')"` → `ok`.

### D2 — skill-dir naming DECIDED: keep `skills/veriloop/`

Keep `skills/veriloop/` and **accept the cosmetic `/veriloop:veriloop` plugin form.** The
standalone skill name IS the brand for `npx skills` users ([roadmap-v1.md:250-251](./roadmap-v1.md);
open decision resolved at [roadmap-v1.md:358](./roadmap-v1.md)). Document the rationale in the
README repo-layout section (near [README.md:156-170](../../README.md)) — do NOT rename the dir,
do NOT move SKILL.md to plugin root.

**Verify:** `test -d skills/veriloop` → exit 0; `grep -n 'veriloop:veriloop\|skills/veriloop'
README.md` → the rationale sentence present, exit 0.

### D3 — version lives in `plugin.json` ONLY (reconcile with the five-file selftest reality)

The roadmap says "`version` in `plugin.json` ONLY" ([roadmap-v1.md:252-253](./roadmap-v1.md)).
**The tree already contradicts a literal reading of that**, and the code wins:
[selftest.mjs:624-639](../../scripts/selftest.mjs) asserts version agreement across **five
files / six stamp values** — `VERILOOP_VERSION` (generate.mjs), `package.json`,
`plugin.json`, BOTH `marketplace.json` fields (`metadata.version` + `plugins[0].version`),
and the first `CHANGELOG.md` heading.

Reconcile, do not contradict: `plugin.json` is the **canonical/source-of-truth** stamp (it
silently wins over marketplace-entry versions at install time); the other four are
**kept in lockstep and machine-enforced** by the selftest. The M5 action is a doc/README
correction, NOT deleting stamps — deleting any stamp fails
[selftest.mjs:635-637](../../scripts/selftest.mjs).

> **Discrepancy note (code wins):** the roadmap's "plugin.json ONLY" is aspirational; the
> shipped invariant is "plugin.json is canonical, all five files agree, selftest enforces
> it." The plan adopts the code's reality. The selftest COMMENT says "five stamp locations"
> ([selftest.mjs:624](../../scripts/selftest.mjs)) while the `stamps` object holds six values
> across five files — a cosmetic wording mismatch, not a bug; leave it unless touching that
> block.

**Verify:** `npm test 2>&1 | grep 'version stamps agree'` → the assertion line present and
`0 failed` at the end.

### D4 — release tags `veriloop-vX.Y.Z`

Document the tag scheme in SECURITY.md/README (the actual tagging is M6, [NON-GOALS]).

**Verify:** `grep -n 'veriloop-vX.Y.Z\|veriloop-v0' README.md SECURITY.md` → exit 0.

### D5 — cross-tool install adapters — LISTED DECISION, not committed work

Record in §6 as a decision to evaluate (superpowers ships the same skill files into
Codex/Cursor/Copilot CLI via per-tool installers, [roadmap-v1.md:256-258](./roadmap-v1.md)).
**No implementation work item.**

---

## Part 4 — Demo assets

### DA1 — purpose-built demo repo

A tiny TS web app with **3–4 seeded defect classes the gate visibly catches** (roadmap's
recommended concept, [roadmap-v1.md:361](./roadmap-v1.md); M5 section
[roadmap-v1.md:269-273](./roadmap-v1.md)). Defect classes should map to distinct gate
signals so the recorded run shows each caught:

1. a type error (fails `typecheck` exit code),
2. a lint violation (fails `lint`),
3. a failing unit test (fails `test`),
4. (optional 4th) a constitution/lens-catchable defect (e.g. a danger-surface footgun a
   review lens flags) — demonstrates the lens layer, not just exit codes.

**How:** build it in a *separate* repo/dir, not inside veriloop (it is demo data, not
veriloop source). Reference it from the README by URL/path once it exists.

**Verify:** in the demo repo, `/veriloop` then `/dev-loop` on a change touching a seeded
defect → the gate verdict FAILs on the seeded check with the real exit code shown; the run
record names the failing unit. Concrete observable: gate output contains the failing
check name and a non-zero exit code, not an LLM "looks good."

### DA2 — asciinema/GIF of `/dev-loop` catching a real failure

Record `/dev-loop` catching a real failure at the gate (the adoption-friction gap in the
closest precedent, [roadmap-v1.md:270-271](./roadmap-v1.md)). Embed/link from the README.

**Verify:** the asset file exists and is linked from README; `grep -n 'asciinema\|\.gif\|\.cast'
README.md` → exit 0.

### DA3 — README overhaul

Methodology-first narrative + comparison table + proven 5-minute quickstart. The current
README ([README.md:1-220](../../README.md)) already leads methodology-first
("Why it's different", [README.md:20-35](../../README.md)) and has a "Five minutes to first
gate" ([README.md:56-69](../../README.md)) — **the two real gaps are the comparison table
and a clean-clone proof.**

- **Comparison table** vs `/init` · Spec Kit · aider · CodeRabbit (from the landscape,
  [roadmap-v1.md:271-273](./roadmap-v1.md)). Rows = the positioning axes at
  [roadmap-v1.md:39-55](./roadmap-v1.md): per-repo construction of the gate · code-cited
  constitution · exit-code-grounded vs LLM-as-judge · upstream/pre-PR vs PR-surface. Every
  cell is ⟨comparison-facts⟩ — re-verify at publish. **No such table exists in README today**
  (`grep -n 'CodeRabbit\|Spec Kit' README.md` → no output).
- **Claims discipline:** do NOT claim exit-code gating is novel; claim the *automated
  per-repo construction* ([roadmap-v1.md:40-42](./roadmap-v1.md)).
- Update the `## Status` block ([README.md:174-181](../../README.md)) — currently pinned at
  "v0.3.0"; bump to the M5 version and reflect launch-machinery state.

**Verify:** `grep -n 'CodeRabbit' README.md && grep -n 'Spec Kit' README.md && grep -n
'aider' README.md` → all exit 0 (table present). ⟨quickstart-clone-result⟩: in a fresh
`git clone` of the repo, follow the README quickstart end-to-end → reach a generated
`.claude/workflows/<repo>-dev-loop.js` within 5 minutes; record pass/fail.

---

## Part 5 — Stability & exit criteria

**Stable now** (fixed at plan time; a change here is a re-plan, not a fill): the CI spec
(Part 1), the trust-pack checklist (Part 2), the distribution decisions D2/D3/D5 (Part 3),
and the demo-asset structure (Part 4).

**⟨execution-time⟩ fills** (each with its source — repeated from the header for the executor):

| Fill | Source |
|------|--------|
| ⟨cmd-enumeration⟩ | `.claude/veriloop/commands.json` regenerated via `node scripts/detect.mjs --repo . --out .claude/veriloop/commands.json` + the `scripts/` that run, at exec SHA |
| ⟨comparison-facts⟩ | each competitor's primary source at publish (roadmap §11 links) |
| ⟨benchmark-number⟩ | held-out gold benchmark result IF cited; else omit |
| ⟨quickstart-clone-result⟩ | actual run on a fresh `git clone` |
| ⟨checkout-pin-sha⟩ / ⟨setup-node-pin-sha⟩ | `git ls-remote https://github.com/actions/<action> <tag>` |

**Exit criteria (mapped to v1.0 acceptance criterion 6, [roadmap-v1.md:110-112](./roadmap-v1.md)):**

1. **Trust pack complete** — T1–T8 all verify green (Part 2 table). → criterion 6 "trust
   pack + docs complete".
2. **CI live** — `.github/workflows/ci.yml` merged; a push runs `npm test` green on node
   18/20/22; self-host manifest flip recorded. → criterion 6 "docs complete" + risk-register
   "compiler gets its own exit-code gate".
3. **Demo + recording** — demo repo exists with ≥3 seeded defects the gate catches; the
   asciinema/GIF is linked from README. → criterion 6 "demo repo + recorded run".
4. **5-minute quickstart proven on a clean clone** — ⟨quickstart-clone-result⟩ = pass. →
   criterion 6 "5-minute quickstart proven on a clean clone" and the M5 exit
   ([roadmap-v1.md:275-276](./roadmap-v1.md)) "a stranger can go from README to a working
   generated loop in 5 minutes".
5. **Docs synced** — README comparison table present + Status bumped; CHANGELOG entry;
   version stamps agree (`npm test` version-stamp assertion green,
   [selftest.mjs:635-637](../../scripts/selftest.mjs)).

Governance close (repo §8, [roadmap-v1.md:336-342](./roadmap-v1.md)): selftest assertion
count must not drop; append an "actual vs planned" check-off to `roadmap-v1.md` §11 when M5
lands (a later step — this plan does not edit the roadmap).

---

## Non-goals

- **The actual publish / tag / announce (M6, [roadmap-v1.md:278-288](./roadmap-v1.md)).** M5
  writes the release-checklist and documents `veriloop-vX.Y.Z`; it does NOT push tags,
  create releases, or post announcements.
- **Marketplace submissions** (`claude-plugins-community`/`-official`, Show HN, curated
  lists) — all M6.
- **Autonomy / auto-land** — post-1.0 ([roadmap-v1.md:293-304](./roadmap-v1.md)).
- **New stacks** (Rust is M4; Go/Java post-1.0). M5 adds no detector work.
- **Cross-tool install adapters** — evaluated as a decision (D5), not built.
- **`claude plugin validate .` as a push gate** — explicitly release-checklist / optional
  canary only, never in `ci.yml`'s blocking path.
- **Editing the emitted bundle, target repos, or the roadmap** — this plan writes only
  `m5-plan.md`; the CI/README/trust-pack edits are the executor's implementation step.

---

## Supersessions

Executor amendments to this BINDING plan, made 2026-07-29 during M5 execution. This plan
already ranks the tree above itself — see the three `**Discrepancy note (code wins):**`
blocks at m5:105-108, m5:170-172 and m5:213-218 — so an amendment is legitimate ONLY with
all four of: (a) the superseded clause named by line, (b) falsifying `file:line` evidence
that POST-DATES the 2026-07-14 settlement, (c) the substitute, (d) a verify command.
Anything lacking all four reverts to the literal spec. The Part 1 spec block above is
deliberately left unedited — amending it in place would destroy the record.

### S1 — the `npm run lint` step is RETAINED in `ci.yml`

- **Superseded clause:** m5:75-77 — *"**`npm test` only.** No build, no publish, no extra
  jobs. `package.json:8` is `"test": "node scripts/selftest.mjs"` — that is the whole gate."*
- **Falsifying evidence:** the clause grounds itself in a citation that is now false.
  `package.json:8` is `"lint": "node scripts/lint-bundle.mjs --bundle ."`; `test` moved to
  `package.json:9`. Changed by commit `0b9e604` (2026-07-27), **13 days after settlement**,
  whose message states the reason: constitution rules 7 and 9 both name `lint-bundle.mjs`
  as their enforcer and nothing executed it. Corroborating: `scripts/generate.mjs:235`
  `gateOrder = ['typecheck','lint','format','test']` — veriloop's own compiler puts `lint`
  in the gate of every target repo, so hand-written CI that ran test-but-not-lint would put
  the drift tool out of parity with its own emitted output.
- **Substitute:** one additional `run:` in the SAME job. m5:75's "no build, no publish, no
  extra jobs" remains literally enforced — there is still exactly one job.
- **Falsifier checked before adopting:** `npm run lint` was run from a fresh `git clone`
  (`git clone . /tmp/vl-cleanclone`) and exited **0** (`21 ok, 0 warn, 0 fail`). Had it
  depended on untracked `.claude/**` state it would have turned CI red for every
  contributor, and this supersession would have been withdrawn.
- **Verify:** `python3 -c "import yaml;j=yaml.safe_load(open('.github/workflows/ci.yml'))['jobs']['test'];assert [s['run'] for s in j['steps'] if 'run' in s]==['npm run lint','npm run test']"`

### S2 — `run: npm run test`, NOT `run: npm test`

- **Superseded clause:** m5:71 — the sample snippet's `- run: npm test`.
- **Falsifying evidence:** m5's own checkable criterion contradicts its illustrative
  snippet, and the criterion wins. m5:130-131 requires the regenerate diff to flip
  *"only `test`'s `ci`/`verified_by_ci` to `true` (plus `generated_at`)"*. Measured on
  identical trees at this SHA: with `run: npm test`, `scripts/lib/detectors.mjs` adopts CI's
  exact string as ground truth and `commands.json` `test.cmd` becomes `npm test` with
  `from: "ci"`, `source: ".github/workflows/ci.yml"` — a **rename**, cascading into the
  manifest, `commands_summary`, the emitted workflow's `gate` array, three `experts/*.md`
  gate lines and `advise.md`'s derived `allowed-tools` fence. That is not m5:130-131's diff.
  With `run: npm run test`, `test.cmd` stays `npm run test` with `source: package.json:9`.
- **Both spellings meet m5's stated goal:** `verified_by_ci` flips `false → true` either
  way, and m5:147-149's assert (`ci is True`) passes either way. This amendment is
  intent-preserving and costs 4 characters.
- **Why the rename is wrong on principle:** it re-roots the command's provenance from
  `package.json` (the declaration) to the CI file (a consumer), making CI the source of the
  command CI is supposed to independently corroborate — collapsing the evidence relation
  `verified_by_ci` exists to express, and violating constitution rule 9 (one source of truth).
- **Verify:** `python3 -c "import json;c=json.load(open('.claude/veriloop/commands.json'));assert c['commands']['test']['cmd']=='npm run test' and c['commands']['test']['source']=='package.json:9'"`

> **Six deviations REVERTED, not superseded.** The `ci.yml` committed at `5ff3e73` also
> carried `name: gate`, job id `gate`, `on:` as a mapping, a string matrix, a `concurrency`
> block, `fail-fast: false`, and per-step `name:` keys. None had a falsifying citation, and
> three of them break this plan's own verify (`d['jobs']['test']`, `== [18,20,22]`). All
> reverted to the literal spec. `concurrency` was additionally wrong on the merits:
> `cancel-in-progress` discards a superseded push's gate result, so some commits would
> never obtain a recorded green — the wrong default for a product selling recorded
> exit-code evidence. No `.github/dependabot.yml`: absent from this plan and from
> `roadmap-v1.md:200-238`, a pin rots into staleness rather than insecurity, and the
> pin-refresh procedure is documented in `SECURITY.md` per T6 instead.

### Discrepancy notes — repairs to THIS plan's own text

**N1 (code wins) — m5:139's verify raises `KeyError` on a conformant file.** YAML 1.1
resolves the unquoted key `on:` to boolean `True`, so `yaml.safe_load(...)` yields keys
`['name', True, 'permissions', 'jobs']` and `d['on']` fails. Confirmed at this SHA:
`'on' in d` → `False`. Any executor running m5:137-141 against a *correct* file would
conclude the file was wrong. Repaired below.

**N2 (code wins) — a raw-text ban on `pull_request_target` fails on m5's own comment.**
m5:57 mandates the comment `# NEVER pull_request_target`, which contains the string, so
asserting `'pull_request_target' not in text` fails on a conformant file and forbids
documenting the hazard avoided. The real safety property is that it is not a **trigger**.
Repaired below: assert it is absent from the parsed `on:` list and from all non-comment
text.

**Repaired Part-1 verify (replaces m5:137-141):**

```bash
python3 - <<'PY'
import yaml, re
t = open('.github/workflows/ci.yml').read(); d = yaml.safe_load(t)
on = d['on'] if 'on' in d else d[True]          # N1: YAML 1.1 coerces bare `on` to True
assert on == ['push', 'pull_request'], on
assert d['permissions'] == {'contents': 'read'}
assert list(d['jobs']) == ['test'], list(d['jobs'])
j = d['jobs']['test']
assert j['strategy']['matrix']['node'] == [18, 20, 22]
assert 'concurrency' not in d and 'fail-fast' not in j['strategy']
assert [s['run'] for s in j['steps'] if 'run' in s] == ['npm run lint', 'npm run test']  # S1, S2
assert len(re.findall(r'actions/(?:checkout|setup-node)@[0-9a-f]{40}', t)) == 2
assert 'pull_request_target' not in on          # N2: a trigger check, not a substring ban
code = '\n'.join(l.split('#')[0] for l in t.splitlines())
assert 'pull_request_target' not in code and 'claude plugin validate' not in code
assert not any(re.search(r'\$\{\{\s*github\.event\.', s.get('run', '')) for s in j['steps'])
print('Part 1 ok')
PY
```

**N3 (executor note) — the annotation obligation vs the no-roadmap-edits rule.** The ruling
that produced these supersessions required annotating all three artifacts carrying the
superseded clause (m5:75-77, `roadmap-v1.md:214`, `specs/ci-adopt-coverage.md:132`) so the
amendment does not itself create a rule-9 violation — three artifacts asserting two truths.
It ALSO barred editing `roadmap-v1.md` (per m5:345-346) and deferred the §11 check-off (per
m5:328-329). Resolved as follows: the bar is on **substantive** roadmap change — the §11
milestone check-off and any reconciliation of the off-roadmap 0.3.15-0.3.22 work — and a
one-line pointer that prevents a contradiction is a different act. Both annotations are
therefore a single inline sentence each, adding no milestone claim and reconciling nothing.
The §11 check-off remains undone and is listed in the governance debt below.

**Verify the annotations:**
```bash
grep -c 'm5-plan.md#supersessions' docs/plans/roadmap-v1.md \
  .claude/veriloop/specs/ci-adopt-coverage.md   # → both 1
git diff --stat docs/plans/roadmap-v1.md        # → 1 file, +2/-1 (pointer only)
```

### S3 — citation repair extended to the hand-owned overrides, and symbol tokens made MANDATORY

- **Superseded clause:** m5:345-346 bars *"editing the emitted bundle"*, which contains
  `.claude/veriloop/constitution.md` and `experts/*`.
- **Falsifying evidence:** `scripts/generate.mjs:407` renders `experts/security.md` and
  `experts/drift.md` from `interview.json`'s `roster_add` evidence via `w.machine(...)`, so
  the regenerate that m5:129-130 itself mandates would **re-emit false citations with a
  fresh `generated_at`**. The executor's choice was never fix-vs-leave; it was
  fix-vs-re-certify-as-true, in violation of constitution rule 2 (*"`file:line` citations
  come from the deterministic scripts"*), inside the trust milestone. Nine citations were
  dead and one imprecise, verified line by line: rule 4 `selftest.mjs:5,60`; rule 5
  `detectors.mjs:519` (the sanitizer had moved 108 lines to `:627`); rule 7
  `lint-bundle.mjs:88,118`; rule 8 `generate.mjs:249,287,261,237` (all four).
- **Two extensions beyond the repair, both strengthenings:**
  1. **`experts/*.overrides.md` are included.** They are hand-owned, so `handOnce`
     (`generate.mjs:342`) preserves them forever — no regenerate will ever repair them, and
     "later" therefore means "never." They carried five of the dead citations.
  2. **A symbol token is now REQUIRED on every citation**, not optional. This was forced by
     mutation testing, and it is the substantive finding of this step: an
     existence-only check **does not catch the original bug.** Restoring rule 5's bare
     `detectors.mjs:519` passed a green run, because line 519 still exists (the file has
     640 lines) — it simply no longer holds the sanitizer. A citation without a symbol
     anchor is unfalsifiable in practice.
- **Substitute:** citation tokens only. No rule was reworded, added or removed; rule count
  is still 10; rule 1's command list is untouched (adding `lint` there would add an
  invariant, which is the owner's act — flagged as debt). Enforced by a minimality gate:
  every changed line in `constitution.md` carries an `mjs:` token.
- **The deliverable is the assertion, not the renumber.** `scripts/selftest.mjs` gained
  `self-host CITATION LIVENESS`: every `scripts/*.mjs` citation in the constitution, the
  hand-owned overrides, and `interview.json`'s roster evidence must name an existing file,
  an in-range line, and a symbol token present within +/-6 lines. 34 citations checked.
  Renumbering without it would re-ship the identical defect.
- **Seen red before being trusted** (0.3.21's standard) — five mutations, all RED:
  bare `:519` (the original defect); `:519 isCleanInvocation` (right token, wrong line);
  `handOnce` moved to `:100`; past-EOF; and a stripped token.
- **Verify:**
  ```bash
  npm test 2>&1 | grep 'self-host citations'      # 2 assertions, both ok, 34 checked
  git diff -U0 .claude/veriloop/constitution.md | grep '^[+-]' | grep -v '^[+-][+-]' | grep -vc 'mjs:'   # → 0
  grep -cE '^[0-9]+\. \*\*' .claude/veriloop/constitution.md   # → 10, unchanged
  ```

### S4 — the regenerate needs `--interview`, and the citation guard must cover the ARTIFACTS

- **Superseded clause:** m5:129-130 specifies a one-step regenerate
  (`node scripts/generate.mjs --repo . --commands .claude/veriloop/commands.json`).
- **Falsifying evidence, part 1 — the input was stale.** That `commands.json` carried
  `verified_at: 2026-07-14`, `ci_files: []`, no `lint` key, and `test.source: package.json:8`
  (now the `lint` line). Run literally it flips nothing and **fails m5's own Verify at
  :147-149**. m5's How and Verify were mutually unsatisfiable at this SHA. The working
  sequence is three steps: `detect` -> `verify --include test` -> `generate`. The middle step
  is mandatory: `detect` does not smoke-run, so `detect -> generate` alone **downgrades a
  true `verified: true` attestation to `null`** (measured).
- **Falsifying evidence, part 2 — `--interview` is required, and this was missed.**
  `generate.mjs:369-373` reads interview answers from the **prior manifest's**
  `interview_answers`, merging `interview.json` only when `--interview` is passed. So the
  repaired citations in `interview.json` had **no effect** on the first regenerate: the
  emitted `experts/security.md` and `experts/drift.md` came back still citing
  `detectors.mjs:519`, `lint-bundle.mjs:88,118` and `generate.mjs:249,287,261,237` — the
  exact laundering this repair existed to prevent, one indirection further out. The correct
  command adds `--interview .claude/veriloop/interview.json`. `interview.json` is NOT the
  source of truth on a re-run; the manifest is, unless you say otherwise.
- **Consequence for the guard, and this is the substantive finding.** Fixing a source does
  not fix an artifact. `self-host CITATION LIVENESS` now also covers the **emitted**
  `experts/*.md` and the **manifest's** persisted `interview_answers.roster_add` — 34
  citations checked before, **56** after. Both new surfaces mutation-tested RED
  independently: breaking only an emitted persona, and breaking only the manifest's
  persisted evidence. Without this, "source correct, artifact stale" passes green — which is
  the same defect class as the stale persona bundle found earlier in this repo's history.
- **Verified after:** roster intact (`code-review, security, drift` — no `--out`, so no
  roster drop); gate `npm run lint | npm run test`; both entries `ci: true, verified: true`;
  **no `cmd` string renamed anywhere** (S2 paying for itself); `constitution.md` and all
  three `*.overrides.md` reported `preserved`; the changed-file set matched the written
  prediction exactly, 10 for 10. Idempotent apart from `generated_at` and
  `written`->`unchanged` status fields.
- **Verify:**
  ```bash
  npm test 2>&1 | grep 'self-host citations'    # 56 checked
  git diff .claude/veriloop/veriloop-manifest.json | grep '^-.*"cmd"'   # NO OUTPUT
  ```

### Discrepancy notes — two more of this plan's verifies are unsound

**N4 (code wins) — m5:162's T2 pattern is malformed and passes on nothing.** The pattern
`'curl.*\|.*bash\|curl.*\|.*sh\b'` is a BRE alternation in which `.*bash` and `.*sh\b` are
their own branches, so it matches any line containing "bash" or "sh" anywhere. Run verbatim
against a clean tree at this SHA it returns **153 lines and exit 0**, while m5 expects no
output and exit 1. An executor trusting it would conclude the repo pipes curl into a shell.
**Replaced with a pattern that tests the actual property:**

```bash
grep -rnE 'curl[^|]*\|[[:space:]]*(ba)?sh|wget[^|]*\|[[:space:]]*(ba)?sh' \
  scripts/ README.md skills/ SECURITY.md ; test $? -eq 1
```

T2's reader note is also now due on a second count: `scripts/selftest.mjs` is **1389 lines**,
over m5:162's 800-line threshold.

**N5 (code wins) — m5:163's T4 verify fails on the trust pack's own security statement.**
T4 requires that veriloop never *suggest* `--dangerously-skip-permissions`. m5:164 already
concedes that a **negated mention** is not a violation — it excludes `docs/` on exactly that
basis. But `SECURITY.md` now states *"veriloop never suggests
`--dangerously-skip-permissions`"*, which is the trust pack doing its job, and a raw-text ban
flags it. Same failure shape as N2. **Replaced with a check of the requirement rather than
the substring:** every occurrence must be a negated mention, none an instruction.

```bash
python3 - <<'PY'
import re, pathlib
NEG = re.compile(r"\b(never|not|no|don't|do not|avoid|without|refus)\w*\b", re.I)
FLAG = '--dangerously-skip-permissions'
bad = []
for r in ['README.md', 'SECURITY.md', 'skills', '.claude/commands']:
    p = pathlib.Path(r)
    files = [p] if p.is_file() else [f for f in p.rglob('*') if f.is_file() and '.backups' not in str(f)]
    for f in files:
        for line in f.read_text().splitlines():
            if FLAG in line and not NEG.search(line):
                bad.append(f'{f}: {line.strip()[:90]}')
assert not bad, bad
print('T4 ok — every occurrence is a negated mention')
PY
```

**A pattern worth naming, since three of this plan's five verifies had it.** N2, N4 and N5
are the same defect: a verify written as a **substring ban** on a security-relevant token,
where the requirement is about **use**. Banning the string also bans documenting that you
avoided it, so the check fires on correct, well-documented work and stays silent on the real
hazard. When the property is "X is never used", assert it against parsed structure or against
negation context — never against raw text.
