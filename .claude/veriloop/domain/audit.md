# veriloop — domain audit (veriloop-generated)

> **veriloop MACHINE-OWNED** — this audit is regenerated on every re-run from
> `.claude/veriloop/domain.json`. Do not hand-edit it; put manual tweaks in
> `.claude/veriloop/domain/expert.overrides.md` (never overwritten, wins on conflict).

## Facts (script-owned)

Read from `.claude/veriloop/veriloop-manifest.json` → `domain_facts`, which the
generator computes. The audit **cites** these; it never re-derives them
(constitution rule 2 — scripts own facts, the LLM owns judgment).

**Stack:** node · **Package manager:** npm

### Declared dependencies (0)

- _no dependency was parsed from `package.json`, `pyproject.toml` or `Cargo.toml`. That is the absence of a PARSED declaration, not evidence the repo declares none — no other manifest format is read._

### File census (4 of 4 top-level directories; hidden and vendor directories excluded, walk depth <= 4)

- `docs/` — 13 files (.md:10, .sh:3)
- `fixtures/` — 12 files (.toml:6, .json:3, .yaml:2, .rs:1)
- `scripts/` — 14 files (.mjs:13, .js:1)
- `skills/` — 1 file (.md:1)

## Field classification

**Primary field: AI developer tooling — agentic code review and gating** — T1 6 · T2 3 · T3 2 · T4 1 (total 12)

Confidence: **high**. Tiers are ranked
lexicographically on the tier vector, so a lower tier can never override a higher one;
scores accumulate within a tier.

**Secondary fields**

- **software supply-chain and artifact trust** — T1 0 · T2 2 · T3 0 · T4 0 (total 2)
- **static analysis and CI gating** — T1 0 · T2 0 · T3 2 · T4 0 (total 2)

### Evidence by tier

#### Tier 1 — dependency manifests

- `AI developer tooling — agentic code review and gating` **+4** — the script-owned domain_facts.deps block is EMPTY — the collector parsed no dependency from any manifest it reads, so the tree carries no runtime, framework or test-runner signature (that is the absence of a parsed declaration, not evidence the repo declares none). A tree with no framework signature fits a self-contained CLI compiler and fits no framework-bearing application field _(`.claude/veriloop/veriloop-manifest.json`)_
- `AI developer tooling — agentic code review and gating` **+2** — domain_facts.package_manager is npm and the manifest's commands_summary records the ENTIRE declared command surface as a bundle linter plus a self-test — the only build steps this project declares check its own output, which is a tool's shape rather than an application's _(`.claude/veriloop/veriloop-manifest.json`)_

#### Tier 2 — framework-mandated topology

- `AI developer tooling — agentic code review and gating` **+3** — the repo carries the Claude Code plugin/marketplace contract and a skill manifest, so its topology is mandated by an agent harness rather than chosen _(`.claude-plugin/marketplace.json:12`)_
- `software supply-chain and artifact trust` **+2** — a published threat model with safety tiers, declared network paths and a reporting path is a supply-chain artifact, not application documentation _(`SECURITY.md:47`)_

#### Tier 3 — file census

- `AI developer tooling — agentic code review and gating` **+2** — the census records exactly four top-level directories — docs/, fixtures/, scripts/, skills/ — with scripts/ the sole source directory at .mjs:13 plus a single .js (the workflow template the generator emits), and no framework, app or package directory anywhere _(`.claude/veriloop/veriloop-manifest.json`)_
- `static analysis and CI gating` **+2** — the census records fixtures/ as .toml:6, .json:3, .yaml:2 and .rs:1 with no application sources at all — manifests and CI files, i.e. synthetic INPUTS to a parser rather than test data for a product _(`.claude/veriloop/veriloop-manifest.json`)_

#### Tier 4 — prose

- `AI developer tooling — agentic code review and gating` **+1** — the skill states the mental model outright: veriloop is a compiler and the dev-loop it emits is the compiled output _(`skills/veriloop/SKILL.md:38`)_

## Domain vocabulary

- **bundle** — the set of plain files veriloop emits into a target repo — workflow, commands, personas, constitution, manifest. The unit everything else is measured against. _(`skills/veriloop/SKILL.md`)_
- **gate** — the ordered list of real commands whose EXIT CODES decide PASS/FAIL. Never a model's self-assessment. _(`.claude/veriloop/constitution.md`)_
- **roster** — the reviewing lenses the gate spawns, each nominated by concrete detected evidence. Distinct from the advisory domain persona, which is not in it. _(`scripts/lib/roster.mjs`)_
- **machine-owned / hand-owned** — the ownership asymmetry: machine files are rewritten on every run, hand files are written once and never clobbered. _(`.claude/veriloop/constitution.md`)_
- **attestation record** — a committed JSON record of what a dev-loop run actually did, redacted at emit and re-scanned at lint. _(`scripts/lint-bundle.mjs`)_

## Core concepts

- **scripts own facts, the LLM owns judgment** — every path, command, number and citation comes from a deterministic script; the model decides personas, invariants and classification. The dividing line is enforced, not advisory. _(`.claude/veriloop/constitution.md`)_
- **never grade your own homework** — validation runs the real commands and, in the full pipeline, a fresh-context agent — the generator's self-report is never the evidence. _(`skills/veriloop/SKILL.md`)_
- **citation liveness** — a citation must carry a symbol token that still resolves near the cited line. An existence-only check would not have caught the defect the guard was written for. _(`scripts/selftest.mjs`)_
- **claims discipline** — a published claim about veriloop must be true as stated, not true on a technicality. Retiring an overclaim is a shipped work item, not a wording pass. _(`SECURITY.md`)_

## Architecture and data flow

A four-stage deterministic pipeline with LLM judgment interleaved between stages. Detection parses the target repo's declared command surface; verification runs the safe subset for real and records exit codes; generation slot-fills a portable workflow template plus the personas, commands and manifest; linting re-reads the emitted bundle and runs none of it, with one narrow exception taken only when a bundle has committed artifacts that need it (the workflow's marker-bounded secret-pattern region). Nothing downstream may re-derive a fact an upstream stage already established, and nothing may claim a check ran that did not.

1. detect.mjs parses package.json / Makefile / pyproject.toml / CI run blocks into commands.json, each command carrying a source citation and a safety tier
2. verify.mjs executes only the safe tier, writing verified / verify_exit / verify_skipped back into the same file
3. generate.mjs reads commands.json plus the hand-owned interview.json and domain.json, and emits the bundle through one writer that records ownership per file
4. lint-bundle.mjs re-reads the emitted bundle scoped to the manifest's emitted_files and fails on portability, placeholder, frontmatter, gate-parity and missing-artifact defects
5. the emitted workflow then runs the same commands at review time and reports from their exit codes

Sources: `scripts/detect.mjs` · `scripts/verify.mjs` · `scripts/generate.mjs` · `scripts/lint-bundle.mjs` · `skills/veriloop/SKILL.md`
