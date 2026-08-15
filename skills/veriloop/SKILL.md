---
name: veriloop
description: >-
  Use when the user wants to "set up a dev loop", "add a review gate", "scaffold
  veriloop", or "generate a dev-loop / review pipeline" for a repo. Compiles a
  bespoke, self-verifying engineering setup for ANY repo: AI expert personas, a
  code-cited constitution of the repo's invariants, a per-feature workflow whose
  gate passes/fails on REAL command exit codes (never the AI's self-assessment),
  and five slash commands to drive it: /dev-plan (spec interview + expert
  council), /dev-loop (build loop), /advise (brainstorm), /review (lens-only),
  /posture (the repo's default budget posture).
allowed-tools: Read, Grep, Glob, Write, Edit, AskUserQuestion, Task, Bash(node:*), Bash(git rev-parse:*), Bash(git log:*), Bash(git status:*)
---

<!--
  On the fence above (trust-pack T3). This is a SCOPED grant, not a read-only one:
  veriloop's job is to write a bundle, so Write and Edit are load-bearing — the
  constitution, scan-notes.md and interview.json are all authored here. What the
  fence excludes is the point: unscoped `Bash` is absent, so the pipeline cannot
  run arbitrary shell. `Bash(node:*)` covers the four deterministic scripts
  (detect / verify / generate / lint-bundle) and nothing else; the three `git`
  entries are read-only subcommands used to compare `repo_sha` and read history.
  There is no `git commit`, no `git push`, no branch or worktree verb — landing is
  owner-reserved (constitution rule 10). Commands the TARGET repo declares are run
  by `scripts/verify.mjs` inside its own safety tiers, never by this skill directly.

  What the fence does NOT bound, as of 0.5.0: the NETWORK. `Task` is already granted,
  and a subagent it spawns can hold tools this fence does not list. Phase 7.5 uses
  exactly that — it spawns a source-verification subagent whose only network grant is
  `WebFetch`. No `WebFetch`/`WebSearch` was added to the line above and its bytes are
  unchanged, but the fence's honest DESCRIPTION changed: setup now performs network
  I/O. Claiming the fence holds unchanged would be technically true and misleading.
-->


# veriloop — compile a self-verifying dev-loop for any repo

**Mental model: veriloop is a compiler; the dev-loop it emits is the compiled
output.** It automates, for any repo, work already done once by hand (the Torevan
dev-loop). It emits **plain files** into the target repo:

```
.claude/workflows/<repo>-dev-loop.js     the dev-loop workflow (exit-code gate)
.claude/commands/dev-plan.md             the /dev-plan command (spec interview + council)
.claude/commands/dev-loop.md             the /dev-loop slash command
.claude/commands/advise.md               the /advise command (domain expert, N stances)
.claude/commands/review.md               the /review command (lens review, no loop)
.claude/commands/posture.md              the /posture command (set the repo's default budget posture)
.claude/veriloop/commands.json           detected + verified command surface
.claude/veriloop/constitution.md         the repo's invariants (hand-owned)
.claude/veriloop/experts/<name>.md       expert personas (machine-owned)
.claude/veriloop/experts/<name>.overrides.md   manual tweaks (hand-owned, never clobbered)
.claude/veriloop/specs/<slug>.md         feature specs (hand-owned, ratified by owner, git-tracked)
.claude/veriloop/domain.json             the domain audit's answers (hand/LLM-owned, git-tracked)
.claude/veriloop/domain/audit.md         field classification, vocabulary, architecture (machine-owned)
.claude/veriloop/domain/expert.md        the domain-expert persona (machine-owned)
.claude/veriloop/domain/expert.overrides.md    manual tweaks (hand-owned, never clobbered)
.claude/veriloop/domain/references.json  the three-category reference library (machine-owned)
.claude/veriloop/session-routing.md      the SessionStart routing payload (machine-owned)
.claude/veriloop/session-start.mjs       the SessionStart hook script (machine-owned)
.claude/settings.json                    registers the hook (starter; PRESERVED if one exists)
.claude/veriloop/veriloop-manifest.json  version, repo SHA, roster, verification results
```

## Non-negotiable principles

- **Scripts own facts; the LLM owns judgment.** Paths, commands, numbers, and
  file:line citations come from the deterministic scripts under `scripts/`. The
  LLM only decides personas, invariants, and roster — and every mined rule must
  cite real code.
- **Real exit codes gate — never "looks good".** The emitted gate literally runs
  the verified commands from `commands.json`; a nonzero exit is a BLOCKER.
- **Portable output only.** Emitted artifacts use `$CLAUDE_PROJECT_DIR` (falling
  back to `git rev-parse --show-toplevel`) — NEVER an absolute path.
- **Your edits win (asymmetric updates).** On re-run, machine sections regenerate;
  hand-owned files (`*.overrides.md`, `constitution.md`, `.claude/settings.json`) are preserved untouched — never clobbered and never MERGED (nothing in the generator merges; `handOnce` returns early on an existing file),
  never clobbered.
- **Never grade your own homework.** Validation runs the real commands and, in the
  full pipeline, uses a fresh-context agent — not the generator's self-report.

`SKILL_DIR` below = the directory containing this file. Scripts are at
`SKILL_DIR/../../scripts` (repo-root `scripts/`). Use `node <script>` (Node ≥18).

---

## The pipeline

Run these in order for the **target repo** `$REPO` (absolute path the user names,
or the cwd). Phases **1, 2, 6, 7, 8-lint** are deterministic scripts (built,
tested). Phases **3, 4, 5, 8-drive** are your judgment, described here.

### Phase 0 — Preflight
- If `$REPO/.claude/veriloop/veriloop-manifest.json` exists → this is a **re-run**.
  Read it. Compare its `repo_sha` to `git -C $REPO rev-parse HEAD`. If the repo has
  drifted a lot, say so. Offer **Quick-Update** (re-detect + regenerate machine
  sections only) vs **full re-interview**. Never overwrite hand-owned files.
- Anything you will overwrite is auto-backed-up by the scripts under
  `.claude/veriloop/.backups/<timestamp>/`.

### Phase 1 — Detect (deterministic)
```
node SKILL_DIR/../../scripts/detect.mjs --repo "$REPO" --out "$REPO/.claude/veriloop/commands.json"
```
Parses `package.json` scripts / `Makefile` targets / `pyproject.toml` tool tables
**and** CI `run:` blocks (CI = ground truth), reconciles them, and writes
`commands.json` with a `source` citation, `safety` tier, and `verified_by_ci` flag
per command, plus `stack`, `package_manager`, `has_ui`, `scopes`, and the full CI
record. Show the user the summary it prints. **Do not hand-edit the commands — if
one is wrong, it's a detector bug; fix the detector.**

### Phase 2 — Verify (deterministic, safe-list gated)
Auto-run the SAFE checks; ASK before slow ones; NEVER auto-run side-effecting ones.
```
# safe (typecheck/lint/format-check) auto-run; mutating formatters are skipped:
node SKILL_DIR/../../scripts/verify.mjs --repo "$REPO" --commands "$REPO/.claude/veriloop/commands.json"
```
- `safety=safe` → auto-run. `safety=ask` (test/build/install) → **ask the user
  first**, then re-run with `--include test,build`. `safety=never`
  (dev/e2e/bench) → never auto-run (real side effects, e.g. e2e may
  hit a live DB). Commands flagged `mutates` are never run.
- Verified commands get hard-wired into the gate; unverified ones are flagged (the
  gate still runs them for real, but with a "baseline may be red" note).
- **Run verify ONCE with the full `--include` set you intend to run.** Verify is
  last-run-wins: a later, narrower run **resets** the verification of any command it
  now skips (clears `verified`/`verify_exit`/tail, sets `verify_skipped`) so the
  record can never claim both "skipped" and "verified pass". This is by design (A6).

### Phase 3 — Deep scan (LLM, bounded, RESUMABLE)
1. Classify the repo type from `commands.json` + a quick read of `README`/`CLAUDE.md`
   + top-level layout. **Present the classification and HALT for the user to
   confirm** before scanning deeper.
2. At the confirmed depth, scan for danger surfaces (auth, DB/migrations, secrets,
   user input, UI, an oracle/golden reference, a published API, hot paths, deep
   domain logic). Write findings to `$REPO/.claude/veriloop/scan-notes.md` so the
   scan is resumable. Cite `file:line` for every surface.

### Phase 4 — Mine the constitution (LLM)
- Propose ONLY invariants you can VERIFY in the actual code + git history (skip
  framework-obvious rules). For each candidate, ask the user **1–2** serial "why /
  any exceptions?" questions.
- Write the result over the STARTER `constitution.md` (replace its `TODO` lines),
  in the style of the Torevan `docs/constitution.md`: short, true, each rule
  code-cited. On a re-run the existing file is preserved untouched — never clobber
  the user's edits. (There is no merge: a constitution you have edited will not
  receive later generator improvements. Edit it deliberately.)

### Phase 5 — Interview (LLM, ≤5 questions)
Ask ONLY non-derivable facts, as option-table questions with a recommended default:
risk-tier boundaries, merge/deploy policy, cross-model second opinion, the **budget
posture / per-phase model routing** (below), and any repo-specific gate checks that
aren't portable commands.

**Budget posture + model routing.** The emitted loop routes each phase group
(`plan`, `implement`, `review`, `checks`, `fix`, `land`, `report`) to its own model and
reasoning effort. `budget_posture` (frugal/balanced/max) picks a preset; `phase_models`
overrides any group individually — so "plan on Fable, build on Opus" is
`{"phase_models": {"plan": "fable", "implement": "opus"}}`. An unknown model, effort,
or group **fails the build** rather than dying mid-run. Routing changes only how well
each judgment layer thinks — it can NEVER drop a gate check, a review lens, or the
baseline probe. The cost dial must not be able to weaken the ground truth.

Write the answers to `$REPO/.claude/veriloop/interview.json` and pass that file to
the generator so they shape the emitted loop:
```
node SKILL_DIR/../../scripts/generate.mjs --repo "$REPO" \
  --commands "$REPO/.claude/veriloop/commands.json" \
  --interview "$REPO/.claude/veriloop/interview.json"
```
Schema (every field optional):
```
{ "cross_model": bool,              // default true; false disables the cross-model lens
  "high_risk_areas": string[],      // extra keywords appended to the high-risk tier
  "budget_posture": "frugal" | "balanced" | "max",   // default balanced; cost dial
  "question_cap": int,              // default null (no cap); /dev-plan interview's DEFAULT question ceiling (positive int)
  "resolve_default": "blockers" | "clean",   // default blockers (today's loop, unchanged). "clean" makes
                                    // /dev-loop qualify every SHOULD-FIX through an independent confirm
                                    // agent and extend the fix loop to the confirmed ones. Any OTHER
                                    // value FAILS THE BUILD — it is never silently ignored.
  "phase_models": {                 // per-phase model — overrides the posture preset
    "plan"|"implement"|"review"|"checks"|"fix"|"land"|"report": "haiku"|"sonnet"|"opus"|"fable" },
  "phase_effort": {                 // per-phase reasoning effort
    "<same groups>": "low"|"medium"|"high"|"xhigh"|"max" },
  "extra_checks": [                 // repo-specific gate checks the checks agent runs
    { "name": string, "instruction": string, "areaKeywords"?: string[] } ],
  "roster_add": [              // add experts the detector missed — LLM-refined roster, owner-confirmed
    { "key": "security"|"drift"|"ux", "title"?: string, "tiers"?: string[],
      "evidence": string[] } ] } // evidence REQUIRED: what nominated this expert
```
Answers persist in the manifest's `interview_answers` and **merge** over prior
answers on every re-run — a re-run WITHOUT `--interview` keeps them; a re-run WITH
one overlays the new file. Answers are never silently reset.

`extra_checks` restores non-portable repo checks the gate would otherwise lose. An
entry runs inside the gate's checks agent, gated to the change's touched areas when
`areaKeywords` is given. Worked example — Torevan's Supabase security advisor on
DB-touching changes:
```json
{ "extra_checks": [
  { "name": "supabase-advisor",
    "instruction": "This change touches the DB: run the Supabase security advisor (MCP get_advisors, type security) and report pass (no new WARN/ERROR) or fail",
    "areaKeywords": ["db", "schema", "migration", "supabase", "rls", "sql"] } ] }
```

### Phases 6 + 7 — Generate + wire the exit-code gate (deterministic + LLM roster)
1. **Propose the roster and PAUSE for confirmation.** The generator detects a
   first-pass roster (baseline + specialists nominated by danger surfaces, capped
   at 4). Refine it with your scan: **every constitution rule must be owned by
   exactly one expert; every expert must own ≥ a few rules — cut jobless experts,
   keep only opposed mandates.** Present the roster + evidence; get a yes. Additions
   the scan justifies go into the interview file as `roster_add` (with evidence) so
   the generator actually applies them.
2. Generate the bundle:
   ```
   node SKILL_DIR/../../scripts/generate.mjs --repo "$REPO" --commands "$REPO/.claude/veriloop/commands.json"
   ```
   On a first run the domain subsystem is not built yet, so this pass emits no
   `domain/` — Phase 7.5 writes `domain.json` and re-runs the generator.
   This slot-fills the portable template with the verified commands, the roster →
   lens map, risk tiers, and stack-specific worktree-deps setup; writes the
   workflow, the five commands — `/dev-plan` (spec interview + expert council),
   `/dev-loop`, `/review` (the experts' second mandate — lens review without the
   loop) and `/advise` (the DOMAIN expert under N stances); both read-only, no
   gate authority — plus `/posture`
   (change the repo's default budget posture) —
   STARTER personas + `.overrides` siblings, the STARTER constitution (only if
   absent), and the manifest. Machine files
   regenerate; hand files are preserved (use `--force` only to intentionally
   replace them).
   It also emits the **`SessionStart` routing payload + hook script** and registers them in
   `.claude/settings.json` — which is PRESERVE-OR-WRITE. If the repo already has a
   `settings.json`, veriloop leaves it byte-for-byte alone and **prints a complete hook-only
   settings.json to stderr between `--- 8< ---` markers**. When that happens, surface the
   block to the owner and tell them the routing is **not wired** until they **merge** the
   `SessionStart` entry into their own file — it is a whole document, so pasting it verbatim
   into a settings.json that already has a `hooks` key would give them two `hooks` keys and
   silently drop their existing hooks. Do not edit their `settings.json` for them. The hook *biases* the session
   toward `/advise` / `/dev-plan` (and a no-route row that answers reads directly; `/dev-loop` is NOT a destination — it is reached only through `/dev-plan`) — it cannot force an invocation, so do not
   describe it that way.
3. **(Full pipeline) Enrich** the machine persona `.md` files with the bespoke,
   code-cited content from your scan (phase 3) so each reviewer knows this repo's
   real footguns — the generated persona is a functional default. Keep manual
   tweaks in the `.overrides.md` sibling.

### Phase 7.5 — Domain audit + reference library (LLM + deterministic)

**Built on FIRST RUN only.** Rebuilt by `/veriloop --refresh`. Skip this phase entirely
on a re-run where `$REPO/.claude/veriloop/domain.json` already exists and `--refresh` was
not asked for — regenerating is `node generate.mjs` alone, which re-emits `domain/` from
the existing `domain.json` byte-identically.

The generator you just ran wrote `veriloop-manifest.json` with a script-owned
`domain_facts` block — the declared dependencies (each with a `path:line` source) and a
bounded file census. **Read those facts and CITE them; never re-derive them** (constitution
rule 2). That is why this phase runs after Phase 6/7 and before Phase 8.

1. **Audit the repo's domain** on tiered evidence: **Tier 1** dependency manifests >
   **Tier 2** framework-mandated topology > **Tier 3** file census > **Tier 4** prose.
   Scores **accumulate** within a tier; a lower tier never overrides a higher one (the
   ranking is lexicographic on the tier vector, and the script enforces it). Every factual
   claim carries a `path` or `path:line` citation **that resolves in the repo** — a path
   that does not exist, or a line past EOF, fails the build. Cite the narrowest real thing:
   a bare directory is accepted but is practically unfalsifiable, and a Tier 1 / Tier 3
   claim should cite `.claude/veriloop/veriloop-manifest.json` (the `domain_facts` block)
   rather than re-derive what the block already says. This evidence, the architecture
   summary and the `domain_facts` block are ALSO rendered into `domain/expert.md`'s
   script-owned repo-evidence section — the persona four `/advise` stance seats adopt
   verbatim — so a weak citation here is a weak citation in every consult, not only in
   the audit.
2. **On low classification confidence, HALT and ask the owner** with `AskUserQuestion`
   rather than guessing. A `confidence: "low"` classification without
   `owner_confirmed: true` **fails the build** — never bake a guessed field into a bundle.
3. **Select sources by judgment** across three categories — `research`, `products_tools`,
   `current_discussions` — balancing quality against topic diversity. There is no
   selection algorithm. Each entry needs a **one-line rationale**: it is the only field
   that records what the source *says*, and it is what a later claim-level guard checks.
4. **Verify each source resolves — in a `Task` subagent whose ONLY network grant is
   `WebFetch`.** It returns `{url, status, title}` and nothing else. The parent context
   holds `Write` and **never fetches**: this feature is a path where repo prose steers
   which URL gets fetched and the response reaches disk, so keeping *fetch* and *write* in
   separate contexts is the structural mitigation. Hosts are checked against a literal
   allowlist in `scripts/lib/domain.mjs` (`arxiv.org`, `api.semanticscholar.org`,
   `api.github.com`, `doi.org`); anything off-list, unreachable, or non-200 is stored
   `UNVERIFIED` no matter what you claim, and the script recomputes every status. So is any
   entry whose `url` the sanitizer had to REWRITE — over 200 chars, embedded newlines, an
   absolute path: the stored string is then not the string that was fetched, so the reported
   `http_status` cannot describe it. Such an entry carries `url_rewritten: true`.
5. **Sources found on-demand mid-conversation are STAGED for owner approval**, in the
   `staged` array — never auto-appended to the three categories, and never `VERIFIED`.
6. Write the answers to `$REPO/.claude/veriloop/domain.json` and **re-run the generator**
   so it emits `domain/`:
   ```
   node SKILL_DIR/../../scripts/generate.mjs --repo "$REPO" \
     --commands "$REPO/.claude/veriloop/commands.json"
   ```
   (`--domain <path>` overrides the default location. Never use `--force`.)

Schema (`domain.json`):
```
{ "classification": {
    "primary": string,                    // must AGREE with the script's tier ranking
    "confidence": "high" | "medium" | "low",
    "owner_confirmed": bool,              // REQUIRED when confidence is "low"
    "evidence": [ { "tier": 1|2|3|4, "field": string, "score": number,
                    "claim": string, "source": "path" | "path:line" } ] },
  "vocabulary": [ { "term": string, "meaning": string, "source": string } ],
  "concepts":   [ { "name": string, "detail": string, "source": string } ],
  "architecture": { "summary": string, "data_flow": string[], "sources": string[] },
  "persona": { "body": string },          // stances, citation protocol AND the repo-evidence
                                          // section are script-owned — appended after this
                                          // body, so a body cannot omit or reword them
  "references": {
    // attempted_at: the instant you ACTUALLY attempted the fetches. Format-checked
    // against ISO-8601; a placeholder fails the build. REQUIRED once any entry exists
    // and `reachable` is not false — omit it and EVERY entry is stored UNVERIFIED, because
    // an undated fetch cannot be checked for staleness. No script fetches, so nothing
    // recomputes this or http_status — both are YOUR report, and the emitted
    // references.json labels them as such in `attempted_at_note`.
    "attempted_at": iso8601, "reachable": bool,
    "research" | "products_tools" | "current_discussions" | "staged":
      [ { "url": string, "title": string, "rationale": string,   // ≤200 chars, one line
          "http_status": int } ] } }
```

**Offline is not a failure.** If the network is unreachable, set `reachable: false`: a
valid `references.json` is still written with every entry `UNVERIFIED`, a warning prints,
the install does **not** block, and the emitted persona says the library could not be
verified instead of citing anything as checked.

### Phase 8 — Validate (never grade your own homework)
1. **Lint the artifacts (deterministic):**
   ```
   node SKILL_DIR/../../scripts/lint-bundle.mjs --bundle "$REPO"
   ```
   Fails on invalid workflow syntax, absolute paths, leftover placeholders, a
   dangling expert reference, missing command frontmatter, an empty gate, or a
   **missing domain artifact** (an `emitted_files` entry under
   `.claude/veriloop/domain/` gone from disk, or a `domain.json` whose three
   machine-owned outputs were never emitted). It also
   rejects **harness-forbidden APIs** in the workflow (`Date.now`, `new Date`,
   `Math.random`, `process.*`, `require`, `import` — syntax-valid but banned at
   runtime) and **config↔file mismatches** (a roster expert whose persona file is
   missing, or a workflow whose wired gate doesn't match the manifest's
   `gate_commands`).
2. **(Full pipeline) Fresh-context drive:** spawn a NEW subagent with no memory of
   this build and have it run `/dev-loop` on one tiny real task, confirming the gate
   actually executes the commands and reports from exit codes. Do NOT drive it
   yourself.

### Phase 9 — Report + stamp the manifest
The generator already wrote `veriloop-manifest.json` (version, repo SHA, roster,
verification results, emitted files). Its `interview_answers` are exactly the
answers supplied via `--interview` (Phase 5); they **persist and merge** across
re-runs — a re-run without `--interview` keeps the prior answers, a re-run with one
overlays it. Present the final report: roster + evidence, the exact gate commands
(with verified/CI flags), any red baselines, and how to run `/dev-loop`.

### Phase 10 — Maintenance (re-run)
Re-run reads the committed manifest first, regenerates only marked machine
sections, and never clobbers hand-owned files — `constitution.md` and
`.overrides.md` are preserved untouched (not merged). If the re-rendered
`domain/expert.md` is more than 20% longer than the size the prior manifest
recorded (`domain_expert_size`), the report prints a **review prompt** asking the
owner to re-read it — that file is adopted verbatim by every `/advise` seat. It is
a prompt, not a cap: there is no length limit and the exit code is unaffected.

---

## The emitted dev-loop's proven shape (do not reinvent)

**spec detection (in the `/dev-loop` command, not the workflow; the spec itself is
authored upstream by `/dev-plan`)** → plan-vs-constitution
review → risk triage (trivial/standard/high) → isolated **worktree** implement → tiered
**GO/NO-GO gate** (real typecheck/lint/test exit codes + review-lens experts + screenshot
gate on UI + optional cross-model second opinion → **PASS / CONCERNS / FAIL / WAIVED**) →
bounded auto-fix of **blockers** (≤3 passes, stop on no-progress) → docs sync → push a
branch/preview, **STOP before merge** (owner gate). Waivers are human-only (`args.waive`);
an agent may never waive its own finding.

**`args.resolve` (default `"blockers"` — the shape above, unchanged).** With
`resolve: "clean"` each SHOULD-FIX first goes to a **fresh independent confirm agent**
(one finding + the diff, never another lens's agreement); only confirmed concerns count
toward the verdict, and the fix loop extends to the confirmed, non-pre-existing,
non-waived ones. Blockers are never qualified away. The attestation records both the raw
and the confirmed count, so a clean run also measures the lenses' noise rate. A
pre-existing finding is never fixed but is waivable like any other (a waiver yields
WAIVED, never PASS). A fix-pass diff touching a protected path (constitution,
personas/overrides, interview + gate definitions, specs, history, hostile fixtures, or a
deletion from the selftest) is caught in **both** modes: under `clean` it hard-stops the
run, under `blockers` it is logged and recorded in the attestation's `guardStops` with the
verdict untouched. Either way it is a tripwire over an agent-reported diff census, since
the workflow cannot run git. Docs sync at Land may never edit the constitution —
constitution edits are owner-only, by hand.

**Why the interview lives in a command, not the workflow:** the workflow's agents are
background subagents with **no channel to ask the owner anything**. So `/dev-plan` (main
session) does the recon, asks only the questions it cannot derive (NO fixed cap by default; a repo may bake one via `interview.question_cap` and `questions=<N>` overrides per run — skipped entirely
when nothing is ambiguous), convenes the expert council, and writes
`.claude/veriloop/specs/<slug>.md`, which the owner ratifies as BINDING. `/dev-loop`
detects or confirms that spec (a trivial change gets a confirm-and-go, not a second
interview) and passes it in as `args.spec`. The spec is then **binding**: the planner and
implementer build to it, and a review lens treats contradicting an explicit decision as a
BLOCKER.

## Guardrails
- The domain phase is the only one that reaches the network, and only through a
  `WebFetch`-only subagent. Never fetch from the context that holds `Write`.
- Only touch the veriloop scripts and the target repo's `.claude/veriloop/**`, `.claude/settings.json` (written ONLY if absent — an existing one is never edited),
  `.claude/workflows/<repo>-dev-loop.js`, the five emitted commands
  `.claude/commands/{dev-plan,dev-loop,advise,review,posture}.md`, and the marked
  veriloop block in `.gitignore` / `.prettierignore` (owner lines outside the
  block are never touched).
- Never run a `safety=never` command during setup. Never auto-run a `mutates`
  command. Ask before `safety=ask`.
- Never write secrets into any emitted file. Never emit an absolute path.
