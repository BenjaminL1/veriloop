# veriloop — Roadmap to v1.0

*Ratified draft for owner review · 2026-07-10*
*Inputs: owner interview (3 rounds, locked vision) · 4 research reports (prior art ~30 tools, distribution/launch, stack surfaces, invariant-mining & autonomy) · the audited v0.1.1 codebase.*

---

## 1. Vision (locked by interview — do not relitigate)

| Parameter | Decision |
|---|---|
| Audience | Personal tool + public OSS + portfolio, simultaneously |
| First milestone | Live dogfood: bundle **committed into Torevan**, real feature through `/dev-loop` |
| Hand-built gold | **Migrate & retire** once generated reaches parity (advisor via `extra_checks`) |
| Autonomy | Tier-scaled auto-land is the destination — **post-1.0**; v1.0 keeps the owner gate |
| Cost | Per-repo **budget posture** (frugal/balanced/max) captured in the interview, wired into the bundle |
| Breadth | "Any repo" meant literally long-term; **Rust/cargo is the v1.0 third stack** |
| Publish bar | **Full v1.0**: dogfood proof + bespoke phases 3–5 + Rust + docs |
| Launch | **Engineered adoption**: demo repo, recorded run, walkthrough, 5-minute path |

---

## 2. Positioning — the unoccupied square (research-verified)

**Headline finding:** across ~30 tools examined, the pieces all exist somewhere —
persona review panels, hand-written "constitutions," exit-code test loops,
machine/hand file splits — but **no tool generates a complete, per-repo,
verification-gated dev-loop, and no tool ships a code-derived constitution where
every invariant carries a file:line citation.** GitHub Spec Kit users explicitly
requested a codebase-derived constitution and it was **declined**
([spec-kit#80](https://github.com/github/spec-kit/issues/80)) — the single
clearest proof the gap is real and demanded.

**One-line pitch:** *veriloop compiles your repo into a verification-gated
dev-loop: a code-cited constitution, reviewer personas derived from your danger
surfaces, and a GO/NO-GO gate wired to your real commands' exit codes — not the
AI's self-assessment.*

**Claims discipline (from the landscape):**
- Do NOT claim exit-code gating is novel — aider gates on exit codes; Claude Code
  `Stop` hooks can hard-block. Claim the **automated per-repo construction** of it:
  today only power users hand-assemble this plumbing; veriloop generates it.
- Do NOT fight for the PR-review surface (CodeRabbit/Greptile/Bugbot own it, and
  all of them verdict by LLM judgment — even CodeRabbit's blocking checks reason in
  a read-only sandbox). veriloop lives **upstream**: the local pre-PR loop.
- Personas alone are a commodity (existing skills do panels). veriloop's persona
  value is the **derivation from danger surfaces + integration with the gate**.
- The machine/hand ownership contract is a felt pain (`/init` output is "a starting
  point, edit it") — **name the regeneration contract explicitly** in the README.

**Positioning vocabulary** (terms with live search/discovery value): verification
loop · agent harness · code-derived constitution · exit-code-grounded (vs
LLM-as-judge) · pre-merge checks / merge gate · GO/NO-GO gate · bounded auto-fix ·
danger surfaces · CLAUDE.md/AGENTS.md generator (veriloop supersets it) ·
spec-driven development (contrast with Spec Kit's hand-written constitutions).

**Threats & moat:** (1) **Anthropic** — an upgraded `/init` that detects commands
and writes Stop-hook gates absorbs the plumbing overnight; (2) **Spec Kit** — owns
the "constitution" vocabulary + GitHub distribution; #80 was closed-as-stale, not
rejected-on-principle; (3) **CodeRabbit/Greptile** — already execute tools in
sandboxes; extending to the repo's own test suite is their shortest path to
"execution-grounded." **Moat = the analysis products**: file:line-cited invariants,
danger-surface roster derivation, the held-out-gold-validated mining eval, and the
formal machine/hand contract. These are judgment+evidence systems, not primitives —
move fast on them.

---

## 3. North-star architecture — one evidence spine

Every milestone strengthens the same pipeline (this is the synthesis of the mining
and autonomy research, and nothing on the market combines the two halves):

```
mined invariant (witness-or-drop: file:line citations + conformance count)
  → compiled, where possible, to an executable check (grep/AST/command)
    → becomes a GATE condition (alongside typecheck/lint/test exit codes)
      → each gate run emits an EVIDENCE RECORD (attestation: SHAs, diff digest,
        commands, exit codes, verdict, tier, screenshots)
        → the attestation log is the TRACK RECORD
          → which (post-1.0) earns tier-scaled autonomy per change class
          → and detects invariant STALENESS (conformance decay → re-confirm)
```

Design rationale from documented failures: agents fabricate verification (fake
test results in the Replit/SaaStr incident; fabricated tool-result transcripts;
"94% of test runs never executed"). Spec Kit constitutions fail because they are
*asserted, never verified* — agents ignore prose. veriloop's answer at every layer:
**the gate executes; narration is never trusted; rules that can't compile to a
check or cite a witness don't ship.**

---

## 4. v1.0 acceptance criteria (all measurable)

1. **PROOF** — a real feature shipped through a veriloop-GENERATED loop on Torevan,
   driven end-to-end by a fresh-context agent: plan → worktree → gate (real exit
   codes + lenses + screenshot) → verdict → preview pushed, stopped before merge.
   Evidence bundle saved.
2. **PARITY & MIGRATION** — parity checklist passed vs the hand-built gold; Torevan
   and catan_rl_v2 both run generated loops as canonical; hand-built dev-loop retired.
3. **INTELLIGENCE** — both repos: constitution has zero starter TODOs; every rule
   cites file:line, carries a conformance count, and is owner-confirmed; personas
   carry repo-specific footguns; referee constraint machine-checked (every rule
   exactly one owner; every expert ≥2 rules). Held-out gold benchmark ≥80%.
4. **BREADTH** — Rust/cargo first-class (detector + fixtures + selftest), validated
   on catan's maturin crate AND ≥2 real OSS Rust repos (detect-only).
5. **BUDGET** — interview captures posture; emitted template routes model/effort by
   tier × posture.
6. **LAUNCH** — trust pack + docs complete; demo repo + recorded run; 5-minute
   quickstart proven on a clean clone; handle confirmed; public; listed in ≥2
   discovery channels.

---

## 5. Milestones

### M1 · v0.2 "First Blood" — the live dogfood (~1–2 sessions)

Install the bundle **committed** into Torevan, with a real
`.claude/veriloop/interview.json` (Supabase-advisor `extra_checks`, budget
posture). Then drive it:

- **Warm-up task (deliberate):** Torevan's `format:check` baseline is RED (79
  files). Make the first `/dev-loop` task *"land the prettier formatting fix"* —
  trivial tier, zero-risk content, turns the baseline green, and the loop eats its
  own dogfood on day one.
- **Main event:** one standard-tier, UI-touching feature (exercises lenses +
  screenshot gate + land policy), driven by a **fresh-context agent** that has
  never seen veriloop's internals (phase 8's "never grade your own homework").
- **Iron rule:** every failure is a **compiler bug** — fix veriloop, regenerate,
  re-run. Never hand-patch the emitted bundle.
- **Evidence bundle v0 (start the attestation spine now, cheaply):** each gate run
  records base/head SHA, exact commands, exit codes, output tails, screenshot
  paths, verdict, tier → `.claude/veriloop/history/<timestamp>.json`. M1 produces
  the first real records; post-1.0 autonomy will feed on this format.

**Exit criteria:** PASS-gated preview branch pushed by the loop; dogfood report
written; every discovered compiler bug fixed with a selftest/fixture where
applicable.

### M2 · v0.3 "Parity & Convergence" — retire the gold safely (~1–2 sessions)

- **Constitution bridge:** the generated constitution file is hand-owned — seed it
  by copying Torevan's hand-built `docs/constitution.md` (14 real rules) into it.
  Rule-parity achieved immediately, without waiting for phase-4 mining.
- **Parity checklist** (generated must match or exceed): plan-halt · tiers ·
  worktree+deps · real checks · **advisor via extra_checks proven on a DB-touching
  change** · lenses by tier · screenshot · cross-model · bounded fix · land policy ·
  dryRun · waivers (superset). Side-by-side dry-run on one small feature; diff the
  gate coverage; owner sign-off.
- **Retirement scope (two discovered subtleties):**
  - `prompts/senior-web-game.md` is SHARED with `torevan-advise.js`
    (ideate/prioritize modes veriloop does not replace). Retire ONLY
    `torevan-dev-loop.js` + the old `/dev-loop` command; the advise workflow keeps
    its prompt.
  - Record the retirement commit hash in Torevan's docs (git history preserves the
    gold; no archive copy needed).
- **Converge catan_rl_v2:** commit its bundle; re-point its CLAUDE.md
  "review-and-resolve loop" convention to `/dev-loop`; one headless shakedown
  feature.

**Exit criteria:** both repos on generated loops as canonical; hand-built dev-loop
deleted; parity checklist archived in the dogfood report.

### M3 · v0.4 "Intelligence" — phases 3+4+5, evidence-grounded (~3–4 sessions; the biggest lift)

**Phase 3 — deep scan:** `scan-notes.md` schema `{surface → file:line evidence →
nominated expert/rule candidates}`; classification-confirm halt; bounded + resumable.

**Phase 4 — constitution mining (upgraded by the research):**
- Candidate sources: (a) CLAUDE.md/docs claims **verified against code**, (b)
  invariant-shaped tests, (c) git-history mining — repeated same-pattern fixes and
  revert/re-fix chains across authors (SZZ-style blame; cross-author recurrence is
  the anti-spurious signal), (d) danger surfaces from the scan.
- **Witness-or-drop:** every proposed rule ships ≥2 file:line citations plus a
  conforming/violating site count, or it is rejected before the owner sees it.
- **Deterministic re-verification (the Packmind/Daikon lesson):** compile each
  candidate to a checkable query (grep/AST/command) and RUN it over the tree;
  record the conformance ratio (guideline: ≥90% over ≥5 sites, else it's a
  hypothesis, not an invariant). Never trust the LLM's claim that line 42 matches.
- **Ranking:** author/commit diversity and code trustworthiness over raw frequency
  (frequency alone is mostly spurious); prune implied/redundant rules; refuse
  unfalsifiable prose ("write clean code") — a rule that can't fail a check isn't a rule.
- **Governance metadata per rule:** confirmed-by, confirmed-at-SHA, conformance
  stats, owner expert. Staleness = conformance decay on re-run → flag for
  re-confirmation. Three-way merge on re-runs, using the stored last machine
  proposal as merge base.
- **Referee as lint:** machine-readable owner annotations in the constitution,
  enforced by lint-bundle — no orphan rules, no jobless experts.

**Phase 5 — interview finalized:** ≤5 option-table questions incl. budget posture;
budget → model/effort routing wired into the emitted template's agent calls.

**The credibility centerpiece — held-out gold benchmark:** mine Torevan's
constitution BLIND (hand-built one hidden from the miner), then measure recovery
of the 14 hand-authored rules. Target ≥80% recovered with citations. Publish the
eval methodology + results — this is the portfolio-grade proof that mining works.

**Decision item (recommended):** keep the constitution canonical for the loop, and
emit a short pointer section into CLAUDE.md — the community already resents
constitution-vs-AGENTS.md rival files, and AGENTS.md has 60k-repo adoption; don't
create a third competing surface.

**Deferred — language-pack checklists (council 2026-07-13):** per-language review
checklists for the expert personas were council-reviewed and DEFERRED — both council
seats converged on packs mattering only for (a) frugal-posture review lenses (Sonnet)
and (b) freshly-compiled repos with thin constitutions. Triggers to revisit: first
sustained frugal usage, or M4 Rust support (cold-start stack). Budget-neutral if built
(won back from role prose, never appended; never a roster seat).

**Exit criteria:** both repos re-run through the full pipeline; zero TODOs;
benchmark ≥80%; lint enforces the referee.

### M4 · v0.5 "Rust + hardening" (~2 sessions)

Research-informed cargo detector:
- Detection order: `Cargo.toml` `[workspace]` → `.config/nextest.toml` (runner
  choice) → `rust-toolchain.toml` (components) → CI `run:` lines (**capture the
  feature flags attached to the trusted test command** — `--features full`,
  `--all-features`, `cargo hack` sweeps; the bare verb is not what the repo
  trusts) → Makefile/justfile/xtask.
- Category mapping: typecheck=`cargo check`; lint=`cargo clippy --all-targets -- -D
  warnings`; format=`cargo fmt --all --check` (**bare `cargo fmt` = mutates**);
  test=`cargo nextest run` if configured else `cargo test`; single-test=`cargo test
  -p <crate> -- <name>` / nextest `-E` filters; bench=never-tier.
- **maturin hybrid:** `build-backend = "maturin"` in pyproject ⇒ emit BOTH surfaces
  (cargo jobs + maturin/pytest jobs). catan_rl_v2 becomes a true dual-stack bundle;
  the interview decides whether cargo checks join its gate.
- Fixtures: rust-workspace + hostile variants; selftest grows. Validate detect-only
  against ripgrep + tokio (read-only).
- **Override escape hatch (nixpacks lesson):** a hand-owned
  `commands.overrides.json` consumed at generate time — commands.json stays
  machine-pure, but a repo can pin a wrong-detected command without forking the
  detector.
- Windows-path portability pass. GitLab CI / CircleCI extraction: parser
  requirements are documented (reserved-key filtering, `extends:`/anchors/
  `!reference` resolution, string-vs-map `run`, orb opacity) → **post-1.0** unless
  a real repo demands it sooner.

**Exit criteria:** selftest green with Rust assertions; catan dual-stack bundle
lints clean; 2 OSS repos detect correctly.

### M5 · v0.6 "Launch machinery" (~2 sessions)

Distribution fixes (verified against current official specs):
- SKILL.md frontmatter carries BOTH `name` + `description` (dual compat: Claude
  Code + `npx skills` standard) — already true; keep enforced.
- **Skill-dir naming decision:** keep `skills/veriloop/` (the standalone skill name
  IS the brand for `npx skills` users) and accept the cosmetic `/veriloop:veriloop`
  plugin form — document the rationale. (Alternative if it grates: plugin-root SKILL.md.)
- `version` in `plugin.json` ONLY (it silently wins over marketplace-entry
  versions); tag releases `veriloop-vX.Y.Z`; CHANGELOG.
- Add CI to the veriloop repo itself: `claude plugin validate .` + selftest on push
  (the compiler gets its own exit-code gate — good story, good safety).
- Cross-tool install adapters precedent — superpowers ships the same skill files into
  Codex/Cursor/Copilot CLI via per-tool installers; evaluate for launch breadth
  alongside the official-marketplace listing.

**Trust pack** (make-or-break for a shell-running skill; from documented attack
patterns):
- README **"What veriloop runs"** section enumerating every command/script, when it
  fires, why — mirroring the safe/ask/never tiers.
- All scripts in-repo, small, readable; **no `curl | bash`**, no obfuscation.
- `allowed-tools` scoping in frontmatter; never suggest `--dangerously-skip-permissions`.
- Explicit no-exfil / no-network / no-telemetry statement; `SECURITY.md`;
  sha-pinnable tagged releases; MIT `LICENSE`.

**Demo assets:** a small purpose-built demo repo with seeded defect classes + an
asciinema/GIF of `/dev-loop` catching a real failure at the gate (the explicitly
identified adoption-friction gap in the closest precedent). README overhaul:
methodology-first narrative, comparison table (vs `/init`, Spec Kit, aider,
CodeRabbit — from the landscape table), 5-minute quickstart proven on a clean clone.

**Exit criteria:** a stranger can go from README to a working generated loop in 5
minutes; all trust-pack items shipped; handle confirmed.

### M6 · v1.0 "Launch" (~1 session + async follow-through)

Publish (git push + tag). Engineered adoption, in order of expected leverage:
1. Blog-style methodology write-up (precedent: methodology framing, not features,
   is what carried the biggest comparable launch to 435 HN points).
2. Show HN + r/ClaudeAI + X/Bluesky thread; seed to a respected amplifier if possible.
3. skills.sh listing is automatic via install telemetry; PR into curated awesome
   lists; submit to `claude-plugins-community`, then pursue
   `claude-plugins-official` (acceptance there was the growth inflection for the
   closest precedent).

---

## 6. Post-1.0 tracks

**A. Autonomy ladder (v1.1+ headline)** — built on M1's attestation records:
- Two orthogonal axes always: **tier decides auto-land; sandbox decides blast
  radius** (a trivial change still runs network-off).
- Auto-land formula (Renovate precedent): change-class **allowlist** (not denylist)
  AND gate PASS AND branch protection satisfied AND branch up-to-date AND a
  **verified rollback path**.
- Promotion is earned: N consecutive verified PASSes over a time window (shadow →
  advisory → auto); automatic demotion + cooldown on any post-land failure/revert.
- Veto architecture: a gate deny outranks every mode; the loop can never approve
  its own merge (Copilot's structural rule).
- Evidence log formalized: in-toto-style attestations, hash-chained, ≥90-day
  retention — the same records double as the trust audit trail.

**B. Breadth:** Go next (command table ready: `go build`/`vet`/`golangci-lint run`
v2-aware, `-run '^Name$'`), then Java/Gradle (CI-dominant detection — the manifest
is a program, not data; wrapper `./gradlew` mandatory), GitLab/CircleCI parsers,
Windows.

**C. CI-gate mode:** emit a GitHub Action that runs the same gate on push/PR —
positions veriloop as repo infrastructure; enter the PR surface only from this
angle, never as a comment-bot.

**D. Cross-model expansion** beyond Codex CLI (gemini CLI, etc.) for the
second-opinion lens.

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Live loop breaks in un-benched ways (prompt misreads, worktree deps) | M1 exists to surface them; iron rule: fix the compiler, never the output |
| Mining hallucination / spurious rules | Witness-or-drop + deterministic re-verification + diversity ranking + held-out gold benchmark + per-rule owner confirmation |
| Agents ignore the constitution (Spec Kit's documented failure) | Rules compile to executable gate checks — enforcement by execution, not prose |
| Usage limits mid-loop | Budget posture routing; Opus delegation for implementers; per-tier cost estimates documented |
| Incumbent absorbs the plumbing (Anthropic `/init`+hooks, Spec Kit, CodeRabbit) | Speed + moat on analysis products (citations, danger surfaces, mining eval, machine/hand contract) |
| Ecosystem format churn (plugin/skills specs) | `claude plugin validate .` in CI; re-verify specs at publish |
| Torevan regression after retiring gold | Parity checklist + side-by-side run + retirement commit recorded; git history preserves the gold |
| Instruction dilution (constitution bloat) | Short, atomic, falsifiable rules only; prune implied rules; conformance-backed |
| Breadth scope creep | v1.0 is strictly Rust; everything else is a labeled backlog |

---

## 8. Governance (how every milestone runs)

The pattern that already worked twice: **adversarial audit → snippet-anchored fix
plan (executable by a weaker model) → Opus implementation → independent Fable
verification.** Each milestone ends with one. Tracked metrics per milestone:
selftest assertion count (must grow), gate-run evidence records accumulated,
docs-sync (this roadmap gets a check-off + "actual vs planned" note per milestone).

**Model routing:** Fable for planning/review/synthesis; Opus subagents for
implementation; the emitted loops route by tier × budget posture (from M3 on).

## 9. Immediate next session (M1 kickoff, concrete)

1. Write Torevan's real `interview.json` (advisor extra_check + posture) →
   regenerate bundle → commit into Torevan.
2. `/dev-loop "apply prettier formatting across the repo"` (trivial tier, fixes the
   red baseline) — driven by a fresh-context agent.
3. Fix whatever breaks (in veriloop), regenerate, re-run.
4. Pick the standard-tier UI feature for the main dogfood event.

## 10. Open decisions for the owner (small, non-blocking)

1. Skill-dir naming: keep `skills/veriloop/` (recommended) vs rename.
2. CLAUDE.md pointer section from the constitution (recommended) — yes/no.
3. Demo-repo concept for M5 (recommendation: a tiny TS web app with 3–4 seeded
   defect classes the gate visibly catches).
4. GitHub handle confirmation — needed only at M5/M6.

---

## 11. Sources appendix (key evidence)

**Prior art:** [spec-kit#80 (declined codebase-derived constitution)](https://github.com/github/spec-kit/issues/80) · [aider lint/test exit-code loop](https://aider.chat/docs/usage/lint-test.html) · [Claude Code hooks (Stop exit-2 hard block)](https://code.claude.com/docs/en/hooks) · [CodeRabbit pre-merge checks (LLM-judged)](https://docs.coderabbit.ai/pr-reviews/pre-merge-checks) · [Greptile TREX](https://www.greptile.com/blog/trex) · [Copilot review cannot block](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review) · [Osmani on ungrounded /init output](https://medium.com/@addyosmani/stop-using-init-for-agents-md-3086a333f380)

**Distribution:** [plugin marketplaces spec](https://code.claude.com/docs/en/plugin-marketplaces) · [plugin manifest schema](https://code.claude.com/docs/en/plugins-reference) · [skills spec](https://code.claude.com/docs/en/skills) · [vercel-labs/skills + skills.sh](https://github.com/vercel-labs/skills) · [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) · [superpowers precedent](https://github.com/obra/superpowers) + [HN launch](https://news.ycombinator.com/item?id=45547344) · [malicious-skill attack pattern](https://labs.reversec.com/posts/2026/05/skill-issues-compromising-claude-code-with-malicious-skills-agents-part-1)

**Stacks:** [cargo-nextest](https://nexte.st/docs/running/) · [cargo features](https://doc.rust-lang.org/cargo/reference/features.html) · [ripgrep CI](https://github.com/BurntSushi/ripgrep/blob/master/.github/workflows/ci.yml) · [tokio CI](https://github.com/tokio-rs/tokio/blob/master/.github/workflows/ci.yml) · [maturin](https://github.com/PyO3/maturin) · [golangci-lint v2 migration](https://golangci-lint.run/docs/product/migration-guide/) · [GitLab CI YAML](https://docs.gitlab.com/ci/yaml/) · [CircleCI config](https://circleci.com/docs/reference/configuration-reference/) · [Turborepo (declared scripts as truth)](https://turborepo.dev/docs/crafting-your-repository/running-tasks) · [Nixpacks (override hatch)](https://nixpacks.com/docs/guides/configuring-builds)

**Mining & autonomy:** [Daikon (statistical justification)](https://web.eecs.umich.edu/~weimerw/2025-481F/readings/daikon-tool-scp2007.pdf) · [Le Goues & Weimer (trustworthiness > frequency)](https://web.eecs.umich.edu/~weimerw/p/weimer-tacas2009.pdf) · [Packmind (detector-per-rule, sandbox-tested)](https://docs.packmind.com/linter/linter) · [git-pkgs/brief (evidence-only detection)](https://github.com/git-pkgs/brief) · [Spec Kit constitution ignored (issue #287)](https://github.com/github/spec-kit/issues/287) · [Fowler/Böckeler on SDD tools](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) · [Renovate automerge conditions](https://docs.renovatebot.com/key-concepts/automerge/) · [Codex sandboxing axes](https://developers.openai.com/codex/concepts/sandboxing) · [Claude Code permission evaluation order](https://code.claude.com/docs/en/agent-sdk/permissions) · [Replit/SaaStr incident](https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident/) · [in-toto attestations](https://in-toto.io/) · [SLSA levels](https://slsa.dev/spec/v1.0/levels)

---

*Estimated total: ~10–13 working sessions to v1.0. Milestone check-offs and
"actual vs planned" notes get appended below as work lands.*

---

## Check-offs

### M1 warm-up — DONE (2026-07-11) · main event DONE (2026-07-12), pending owner sign-off

Warm-up completed in one session ([full report](./m1-dogfood-report.md)). Actual vs
planned:

- **Better than planned:** the warm-up wasn't just plumbing validation — the review
  lenses caught a real content-corruption bug (Prettier non-idempotency mangling
  `random_ai` + italics in `mvp-build-plan.md`) that the green `format:check` exit
  code missed. Thesis validated on day one.
- **As planned (iron rule held):** 6 compiler bugs found, all fixed in veriloop with
  selftest coverage (21→26), never hand-patched in the emitted bundle; bundle
  regenerated + recommitted into Torevan after each fix.
- **Exit met:** PASS-gated preview `feat/format-check-green` @ `f264731` pushed by
  the loop (93 files; verified author/trailer/`.env` hygiene). A mid-run process
  restart was recovered via journal-cache resume with zero loss.
- **Deviations:** evidence-bundle v0 (`.claude/veriloop/history/*.json`) NOT yet
  auto-emitted — the dogfood report + run records serve as v0; auto-emission moved
  to the M1 main event / M2. Warm-up landed as `style:` on a preview branch rather
  than auto-merging (owner gate, as designed).
- **Then remaining (now done):** the main event — one standard-tier UI-touching
  feature driven fresh-context; it clean-landed 2026-07-12 (see the next section).

### M1 main event — DONE (2026-07-12), pending owner sign-off

Clean-landed 2026-07-12 (run `wf_bb6dd006-dff`): a standard-tier UI-touching
feature driven fresh-context to a PASS-gated preview `feat/lobby-queue-timeout-feedback`
@ `63bc84a`, recorded in commit `2886602`. Actual vs planned:

- **Exit met:** the loop drove the feature end-to-end and pushed a PASS-gated
  preview; the e2e command resolved CI-verified through the adopt path (see
  [dogfood report](./m1-dogfood-report.md) "Main event re-drive").
- **True position:** M1 is **code-complete**, blocked only on **owner sign-off** of
  two unmerged Torevan previews — `feat/format-check-green` @ `f264731` (warm-up)
  and `feat/lobby-queue-timeout-feedback` @ `63bc84a` (main event). Both were pushed
  by the loop for the owner gate, as designed; neither auto-merges.
- **M2:** not started.
