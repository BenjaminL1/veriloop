// veriloop renderers — produce the human-readable artifacts (personas, their
// override siblings, the starter constitution, the /dev-plan / /dev-loop / /advise
// / /review commands) and the machine-owned config block spliced into the workflow.
//
// SPINE NOTE: these personas + constitution are functional *defaults* templated
// from detected repo facts. veriloop phases 3 (deep scan) and 4 (constitution
// mining) enrich them with bespoke, code-cited content on a full run. Manual
// tweaks belong in each expert's `.overrides.md` (never overwritten) and in the
// constitution (three-way-merged on re-run) — not in the auto block.

const AUTO_START = '<<< veriloop:auto:start >>>';
const AUTO_END = '<<< veriloop:auto:end >>>';

function gateList(gate) {
  return gate.map((c) => `- \`${c.cmd}\` — run it, honor the **exit code**${c.verified === false ? ' _(veriloop smoke-run found this RED on the base tree — distinguish pre-existing failures from your change)_' : c.verified ? ' _(verified green)_' : ''}`).join('\n');
}

// ---------------------------------------------------------------------------
// Expert personas
// ---------------------------------------------------------------------------

const PERSONA_HEAD = (title, repoName, stack) =>
  `# ${title} — ${repoName} (veriloop-generated)\n\n` +
  `> Expert persona for \`${repoName}\` — loaded by the dev-loop gate in **REVIEW mode** and by \`/advise\` in **ADVISE mode** (the loader sets the mode). Stack: **${stack.join(' + ')}**.\n` +
  `> This file is a veriloop DEFAULT — regenerated on re-run. Put manual tweaks in the\n` +
  `> \`.overrides.md\` sibling (read alongside this file, and it wins on conflict).\n\n` +
  `MODE: REVIEW — audit a supplied diff. Ground EVERY finding in the real code; never\n` +
  `assert from memory. Where a claim is checkable, RUN the check and cite the output.\n`;

const GROUND_RULES = (constitutionPath, gate) =>
  `\n## Ground rules\n\n` +
  `- **Run the real checks**, don't guess: \n${gateList(gate)}\n` +
  `- **Check the diff against \`${constitutionPath}\`** — a violated invariant is a **BLOCKER**.\n` +
  `- **Do NOT change code.** Emit findings only.\n\n` +
  `## Output contract\n\n` +
  `Per finding — **Severity** (\`BLOCKER\` / \`SHOULD-FIX\` / \`NIT\`) · **Location** (\`path:line\`) ·\n` +
  `**Issue** (what's wrong + why it matters) · **Fix** (concrete, minimal). Group by severity,\n` +
  `blockers first. Also call out what you **verified is correct**, not only problems.\n`;

const PERSONA_BODY = {
  'code-review': () =>
    `\n## Persona\n\nYou are a **senior engineer** reviewing for correctness and craft. You are pragmatic,\n` +
    `opinionated, and precise; you distinguish a true defect from a legitimate design choice.\n\n` +
    `## Review dimensions\n\n` +
    `- **Correctness** — logic bugs, wrong edge-case handling, off-by-one, error paths, state-machine\n  boundaries, concurrency/races. Hunt the class of bug, not just the instance.\n` +
    `- **Type-safety & conventions** — honor the repo's \`CLAUDE.md\` standards (no \`any\`/untyped escapes,\n  explicit exported signatures, import hygiene, named exports where required).\n` +
    `- **Test integrity** — are new tests meaningful (not tautological / asserting the buggy behavior)?\n  Did coverage of the changed logic regress? Does the real test command actually pass?\n` +
    `- **Docs sync** — are touched READMEs / docstrings / type defs / plans updated, or now stale?\n`,
  security: () =>
    `\n## Persona\n\nYou are a **security & data reviewer**. Your beat is anything that crosses a trust\n` +
    `boundary: auth, secrets, user input, database access, and data exposure.\n\n` +
    `## Review dimensions\n\n` +
    `- **AuthZ/AuthN** — every privileged path checks identity AND authorization; no missing guard,\n  no client-trusted claims, no privilege escalation.\n` +
    `- **Secrets** — nothing sensitive hardcoded or logged; server-only secrets never reach a client\n  bundle; config via env only.\n` +
    `- **Input & injection** — untrusted input is validated/parameterized; no SQL/command/path injection,\n  no XSS via unescaped rendering.\n` +
    `- **Data exposure / access policy** — DB access rules (RLS/row scoping) intact; responses don't leak\n  another principal's private data; migrations ship with the code that needs them.\n`,
  drift: () =>
    `\n## Persona\n\nYou are a **drift sentinel**: you detect *divergence* from what a change was supposed to be —\n` +
    `the plan, the spec, a reference oracle / golden fixtures, the docs, and prior work. Not the primary\n` +
    `code reviewer — the auditor of deltas. You render a decisive GO / NO-GO.\n\n` +
    `## Drift classes (audit each)\n\n` +
    `- **Plan / scope drift** — does the change match its stated intent? Silent scope creep or shrink?\n` +
    `- **Parity / oracle drift** — if it touches logic mirrored by a reference implementation / golden\n  fixtures, is the conformance/parity check still green? Run it; don't assume.\n` +
    `- **Doc / schema-truth drift** — do docs, type defs, and schema mirrors still match the code? Hunt\n  stale claims (a comment that describes the old behavior).\n` +
    `- **Convention drift** — a reintroduced anti-pattern a prior change removed; an off-convention commit.\n` +
    `- **Test-integrity / regression** — vacuous tests, skipped suites, or a silent undo of earlier work.\n`,
  ux: () =>
    `\n## Persona\n\nYou are a **UX / visual reviewer**. You judge the change as a user experiences it — not just\n` +
    `that it renders, but that it works and looks right.\n\n` +
    `## Review dimensions\n\n` +
    `- **Interaction quality** — the changed control is actually reachable and interactive in its real\n  state; feedback/affordances are present; no dead or double-firing interactions.\n` +
    `- **Responsive layout** — no break/overflow/clipping at 1440×900, 1280×620, 760×470.\n` +
    `- **Accessibility basics** — focus order, labels/roles, contrast, keyboard operability.\n` +
    `- **Consistency** — matches existing components, spacing, and states (loading/empty/error).\n`,
};

export function renderExpert(key, { repoName, stack, gate, constitutionPath, title }) {
  const body = PERSONA_BODY[key] || PERSONA_BODY['code-review'];
  return PERSONA_HEAD(title, repoName, stack) + body() + GROUND_RULES(constitutionPath, gate);
}

export function renderOverrides(key, title, repoName) {
  return (
    `# ${title} — manual overrides (${repoName})\n\n` +
    `> Hand-authored. veriloop NEVER overwrites this file. The dev-loop reads it alongside\n` +
    `> \`${key === 'code-review' ? 'baseline-reviewer' : key}.md\`; anything here **wins on conflict**.\n\n` +
    `## Repo-specific rules this reviewer must enforce\n\n` +
    `- _(add project invariants, known footguns, or "always check X" rules here)_\n\n` +
    `## False-positive suppressions\n\n` +
    `- _(patterns this reviewer should stop flagging, with the reason)_\n`
  );
}

// ---------------------------------------------------------------------------
// Constitution (starter — phase 4 mining enriches with code-cited invariants)
// ---------------------------------------------------------------------------

export function renderConstitution({ repoName, stack, roster, gate }) {
  const owners = roster.experts.map((e) => `- **${e.title}** (\`${e.key}\`) — ${e.evidence[0]}`).join('\n');
  // the real exit-code gate, straight from the generated config (single source of
  // truth with the workflow); build/install are ask-tier and not gated
  const cmds = (gate || []).map((c) => `\`${c.cmd}\``).join(' · ');
  return (
    `# ${repoName} constitution — invariants the dev-loop checks every plan against\n\n` +
    `These are non-negotiables. The \`/dev-loop\` gate checks the **plan** against this list *before*\n` +
    `any code is written, and the review lenses check the **diff** against it. A plan or diff that\n` +
    `violates one is a **BLOCKER**. Keep this list short and true.\n\n` +
    `> **veriloop STARTER** — a scaffold from detected facts. Replace the TODOs with real, code-cited\n` +
    `> invariants (veriloop phase 4 mines these from the code + git history). This file is\n` +
    `> three-way-merged on re-run: your edits are preserved.\n\n` +
    `## Build & correctness\n\n` +
    `1. **The gate runs on real exit codes.** ${cmds || '(no check commands detected)'} must pass; a\n` +
    `   red check is a BLOCKER, never waved through on "looks right". _(owner: \`code-review\`)_\n` +
    `2. _TODO: the core correctness invariant of this repo (the rule a change must never break)._ _(owner: assign — usually \`code-review\` or \`drift\`)_\n\n` +
    `## Boundaries & safety\n\n` +
    `3. _TODO: the trust/boundary invariant (what must never leak, what stays server-authoritative)._ _(owner: the \`security\` expert; if this roster has none, delete this rule or revisit the roster)_\n\n` +
    `## Conventions\n\n` +
    `4. **Honor \`CLAUDE.md\`** code standards (types, exports, imports, secrets via env only). _(owner: \`code-review\`)_\n\n` +
    `## Landing (owner-reserved)\n\n` +
    `5. **Branch + preview only.** Work lands on a branch; **never** merge to the default branch or\n` +
    `   deploy without explicit owner sign-off. Conventional commits, no AI co-author trailer, never\n` +
    `   stage \`.env*\`. _(owner: \`code-review\`)_\n\n` +
    `---\n\n` +
    `### Rule ownership — target state\n` +
    `Every rule must be owned by exactly ONE expert, and every expert must own at least a\n` +
    `few rules (no orphan rules, no jobless experts). The starter rules are pre-assigned\n` +
    `below; assign each TODO as you replace it — if a rule has no plausible owner in this\n` +
    `roster, either the roster is missing an expert or the rule doesn't belong here.\n\n${owners}\n`
  );
}

// ---------------------------------------------------------------------------
// /dev-loop command
// ---------------------------------------------------------------------------

export function renderCommand({ repoName, roster, commandsJson, gate, budget }) {
  const lenses = roster.experts.map((e) => e.key).join(', ');
  const gateText = (gate || []).map((c) => `\`${c.cmd}\``).join(' + ');
  const shot = commandsJson.has_ui ? ', a **screenshot gate** on UI changes,' : '';
  const b = budget || { posture: 'balanced', presets: {}, models: {}, effort: {} };
  const groups = ['plan', 'implement', 'review', 'checks', 'fix', 'land'];
  const routeLine = groups
    .map((g) => `${g}=${b.models[g] || ((b.presets[b.posture] || {})[g] || {}).model || 'session'}`)
    .join(' · ');
  return (
    `---\n` +
    `description: Run the ${repoName} per-feature dev loop (detect/confirm the spec → plan → risk-tiered gate → bounded auto-fix → push a preview) on an isolated branch, stopping before merge for owner sign-off. For a full spec interview + expert council on a non-trivial feature, run /dev-plan first to produce the binding spec.\n` +
    `---\n\n` +
    `Run the **${repoName} dev-loop** for this feature:\n\n` +
    `> $ARGUMENTS\n\n` +
    `## Step 1 — Spec detection (you do this, BEFORE invoking the workflow)\n\n` +
    `The workflow's agents run in the background and **cannot ask the owner anything**, so the spec\n` +
    `must be settled HERE, by you, now — before the loop starts. The full spec interview lives in\n` +
    `\`/dev-plan\` now; \`/dev-loop\` only DETECTS or CONFIRMS a spec, it no longer runs an interview.\n\n` +
    `1. **Spec provided or already on disk?** If \`args.spec\` is set, or a spec for this feature exists\n` +
    `   under \`.claude/veriloop/specs/\`, treat it as **BINDING** and proceed to Step 2. The planner and\n` +
    `   implementer build to it, and the review lenses treat contradicting an explicit decision — or\n` +
    `   quietly dropping something the spec requires — as a **BLOCKER**.\n` +
    `2. **No spec, and the change is trivial?** **Confirm-and-go:** present a **one-line spec** (the\n` +
    `   feature in a sentence plus the acceptance check) and confirm it with a **single AskUserQuestion**\n` +
    `   — this is a confirmation, **NOT a second interview**. On confirmation, write it to\n` +
    `   \`.claude/veriloop/specs/<kebab-slug>.md\`, pass it as \`args.spec\`, and proceed. A trivial change\n` +
    `   should not trigger an interrogation.\n` +
    `3. **No spec, and the change is non-trivial?** **Stop and point the owner to \`/dev-plan\`** — that\n` +
    `   command runs the full recon + interleaved spec interview + expert council and leaves a ratified\n` +
    `   BINDING spec. Re-invoke \`/dev-loop\` once the spec exists. Do **not** run a spec interview here.\n\n` +
    `Skip spec detection entirely when the owner says so (\`args.interview = false\`, or an unattended\n` +
    `run): proceed with \`args.feature\` as the only intent.\n\n` +
    `## Step 2 — Invoke\n\n` +
    `Invoke the \`${repoName}-dev-loop\` workflow with \`args = { feature: "$ARGUMENTS", spec: "<the spec>" }\`.\n\n` +
    `It then runs autonomously on a dedicated **git worktree + branch** (never the owner's main checkout):\n\n` +
    `1. **Plan-review** — design the smallest correct slice **to the spec**; the baseline reviewer checks it\n` +
    `   against \`constitution.md\`. If the plan violates an invariant, it stops and reports instead of coding.\n` +
    `2. **Risk triage** — classifies the change (trivial / standard / high) so gate depth scales with risk.\n` +
    `3. **Implement** in the worktree.\n` +
    `4. **GO/NO-GO gate** — REAL ${gateText || 'checks'} that must actually pass (exit codes decide), plus the\n` +
    `   review lenses (${lenses})${shot} and an optional cross-model second opinion. A failing check is re-run\n` +
    `   against the base tree, so a **pre-existing** red check is a concern, not a blocker — but a NEW failure\n` +
    `   stacked on a red baseline still blocks. Emits **PASS / CONCERNS / FAIL / WAIVED**.\n` +
    `5. **Bounded auto-fix** — on FAIL, fixes blockers and re-runs, up to **3 passes**, stopping early if it\n` +
    `   stops making progress.\n` +
    `6. **Docs sync**, then **push the branch + leave a preview**.\n\n` +
    `It **STOPS before merge/deploy** — that is the owner gate.\n\n` +
    `## Options\n\n` +
    `- \`args.dryRun = true\` — run everything, stop before the push.\n` +
    `- \`args.waive = ["substring", ...]\` — human waiver: downgrade a matching blocker to WAIVED. An agent\n` +
    `  may never waive its own finding.\n` +
    `- \`args.spec = "..."\` — the spec from step 1 (binding on the planner, implementer, and reviewers).\n` +
    `- \`args.posture = "frugal" | "balanced" | "max"\` — the cost dial. Shifts the model + reasoning effort of\n` +
    `  each phase. **It never removes a check, a lens, or the baseline probe** — the exit-code gate is ground\n` +
    `  truth, not a budget line.\n` +
    `- \`args.models = { plan: "fable", implement: "opus", ... }\` — per-phase model, overriding the posture.\n` +
    `  Groups: \`plan\`, \`implement\`, \`review\`, \`checks\`, \`fix\`, \`land\`. Models: \`haiku\`, \`sonnet\`, \`opus\`,\n` +
    `  \`fable\`. So "plan on Fable, build on Opus" is \`{ plan: "fable", implement: "opus" }\`.\n` +
    `- \`args.effort = { plan: "xhigh", ... }\` — per-phase reasoning effort (\`low\`…\`max\`).\n\n` +
    `This repo's default routing (posture \`${b.posture}\`): ${routeLine}.\n\n` +
    `## When it returns\n\n` +
    `The workflow already compressed itself: \`result.brief\` is a deduplicated, lossless summary written\n` +
    `inside the loop (headline · what changed · findings merged by ROOT CAUSE with the lenses that agreed ·\n` +
    `what landed · what you must decide). **Present \`brief\` — do not re-summarize it.** It was compressed\n` +
    `once, by an agent that had the full evidence; compressing it again only loses more. Render it as prose\n` +
    `+ the findings, add the branch/preview from \`result.land\` and the \`result.routing\` line, and say\n` +
    `nothing the brief does not support. Then **wait for explicit merge/deploy sign-off.**\n`
  );
}

// ---------------------------------------------------------------------------
// /advise command — the experts in ADVISE mode (consultation, not the gate)
// ---------------------------------------------------------------------------

export function renderAdviseCommand({ repoName, roster }) {
  const lenses = roster.experts.map((e) => e.key).join(', ');
  return (
    `---\n` +
    `description: Use when the owner wants to brainstorm a feature or direction, sanity-check a design decision, weigh priorities, or pressure-test an idea BEFORE building — a consultation with ${repoName}'s expert personas (${lenses}) in ADVISE mode. Read-only; produces advice + tradeoffs, never a PASS/FAIL verdict (verdicts belong to /dev-loop). Runs inline because brainstorming is a dialogue.\n` +
    `---\n\n` +
    `Consult **${repoName}'s experts** on an idea — this runs **inline, in the main session**,\n` +
    `because brainstorming is a dialogue and background agents cannot talk to you.\n\n` +
    `> $ARGUMENTS\n\n` +
    `## How to advise\n\n` +
    `1. **Load the lenses.** Read \`$REPO/.claude/veriloop/constitution.md\`, then the expert\n` +
    `   personas RELEVANT to the topic from \`.claude/veriloop/experts/*.md\` plus each one's\n` +
    `   \`.overrides.md\` sibling (the override **wins on conflict**). Adopt them in\n` +
    `   **MODE: ADVISE** — ignore their review-mode instructions; here you are a consultant,\n` +
    `   not an auditor.\n` +
    `2. **Ground every claim in real code.** Read the actual code areas under discussion\n` +
    `   before opining; cite \`file:line\` wherever a claim is checkable — no hand-waving.\n` +
    `3. **HARD LIMITS.**\n` +
    `   - **READ-ONLY** — no file edits, no worktrees or branches, no mutating commands\n` +
    `     (read-only commands like \`git log\` / \`git diff\` are fine).\n` +
    `   - **NO VERDICTS** — you produce advice and tradeoffs, never PASS/FAIL/approval. A\n` +
    `     verdict belongs exclusively to the \`/dev-loop\` gate, and advice here NEVER\n` +
    `     substitutes for it.\n` +
    `4. **Converse.** Present options with their tradeoffs and a recommendation; use\n` +
    `   **AskUserQuestion** for genuine forks where you'd otherwise be guessing.\n` +
    `5. **Off-ramp.** If the discussion converges on a buildable feature, **hand off to\n` +
    `   \`/dev-plan\`** — it runs the recon + interleaved spec interview + expert council and\n` +
    `   leaves a ratified BINDING spec, which \`/dev-loop\` then builds.\n`
  );
}

// ---------------------------------------------------------------------------
// /dev-plan command — recon + interleaved spec interview + expert council, then
// a spec the owner ratifies as BINDING before /dev-loop builds it. Runs INLINE
// (the interview is a dialogue). Writes ONLY the spec — no code, no verdicts.
// ---------------------------------------------------------------------------

export function renderDevPlanCommand({ repoName, roster, planModel }) {
  const lenses = roster.experts.map((e) => e.key).join(', ');
  // frontmatter model line: emitted ONLY when the interview set phase_models.plan
  // (verbatim, no hardcoded fallback — rule 9). Absent key → no line, inherit the
  // session model. The BODY documents the model semantics only when a line ships.
  const modelLine = planModel ? `model: ${planModel}\n` : '';
  const modelNote = planModel
    ? `## About the \`model:\` frontmatter\n\n` +
      `This command declares \`model: ${planModel}\`. That is **turn-scoped**: it applies to\n` +
      `this command's turn only — your next typed prompt reverts to the session model, so a\n` +
      `multi-turn planning dialogue here is **not** pinned to \`${planModel}\`. If \`${planModel}\` is\n` +
      `unavailable the harness **silently falls back** to the session model (no error). A premium\n` +
      `value spends **that model's quota**, not the session's.\n\n`
    : '';
  return (
    `---\n` +
    `description: Use when the owner wants to turn a feature idea into a BINDING spec for ${repoName} — recon first, an interleaved spec interview, then an expert council (${lenses}) that pressure-tests the design before a spec is written and the owner ratifies it. Runs inline (the interview is a dialogue). Writes ONLY the spec, never code, and produces NO PASS/FAIL verdict (verdicts belong to /dev-loop).\n` +
    modelLine +
    `allowed-tools: Read, Grep, Glob, AskUserQuestion, Task, Write, Bash(git log:*), Bash(git diff:*), Bash(git show:*)\n` +
    `---\n\n` +
    modelNote +
    `Plan a feature for **${repoName}** and leave a ratified, BINDING spec — this runs\n` +
    `**inline, in the main session**, because the interview is a dialogue and background\n` +
    `agents cannot talk to you. \`/dev-plan\` is **upstream** of \`/dev-loop\`: it produces the\n` +
    `spec; \`/dev-loop\` builds to it.\n\n` +
    `> $ARGUMENTS\n\n` +
    `## Step 1 — Recon first, then interview interleaved with planning\n\n` +
    `1. **Recon first, cheaply.** Read the code the feature would touch and the relevant part\n` +
    `   of \`.claude/veriloop/constitution.md\`. Most of what you need is derivable — derive it.\n` +
    `   Note which files the feature touches: that set drives the council firing rule below.\n` +
    `2. **Interview interleaved with planning** — questions surface as design decisions arise,\n` +
    `   not as an up-front interrogation. Ask ONLY what you genuinely cannot derive: scope\n` +
    `   boundaries and explicit non-goals, a design fork with more than one defensible answer\n` +
    `   (where state lives, client vs server, which existing pattern to follow), user-visible\n` +
    `   specifics (copy, thresholds, edge-case behavior), and what "done" means (the check or\n` +
    `   test that would prove it). Use **AskUserQuestion**, each with a recommended default.\n` +
    `   Guardrails: **ask as many questions as you genuinely need** — there is NO fixed cap; the\n` +
    `   "ask ONLY what you cannot derive" discipline above is what keeps this bounded, not a number.\n` +
    `   The owner may cap it by passing **\`questions=<N>\`** in the invocation (e.g. \`questions=3\`);\n` +
    `   when set, stop asking after N and proceed on best-effort defaults for the rest. Forks that\n` +
    `   co-arise are **coalesced into ONE AskUserQuestion call**, not asked serially.\n` +
    `   **If nothing is genuinely ambiguous, ask nothing** and go straight to the council. A\n` +
    `   trivial change should not trigger an interrogation.\n\n` +
    `## Step 2 — Convene the expert council\n\n` +
    `The council is the repo's existing roster personas (${lenses}) loaded in **MODE: ADVISE**\n` +
    `(read \`.claude/veriloop/experts/*.md\` + each \`.overrides.md\` sibling, the override winning\n` +
    `on conflict). This protocol is defined here and ONLY here — there is no separate council\n` +
    `persona mode.\n\n` +
    `**Firing rule — \`council=auto|always|off\`, default \`auto\`** (honored from the invocation\n` +
    `text, e.g. \`council=off\`):\n` +
    `- \`auto\` fires the council when EITHER (a) the **recon-touched files** match this repo's\n` +
    `  \`high_risk_areas\` (read from \`.claude/veriloop/veriloop-manifest.json\`, which carries it\n` +
    `  verbatim from the interview's \`high_risk_areas\` answer in \`interview.json\` — match against\n` +
    `  the FILES you are touching, never the request phrasing, which is evadable), OR (b) the\n` +
    `  planner hits a genuinely contested design fork. A trivial change fires nothing.\n` +
    `- \`always\` fires it unconditionally; \`off\` skips it (you still plan and write the spec).\n\n` +
    `**Protocol (hard stop after two rounds):**\n` +
    `1. **Independent positions.** Spawn each roster expert as a **parallel, read-only\n` +
    `   subagent** (Task). Each returns its own brief on the proposed design — no coordination,\n` +
    `   no shared draft.\n` +
    `2. **One cross-examination round.** Give each expert the others' briefs and have it\n` +
    `   **attack rather than concede**. **Anti-sycophancy mandate:** the experts must NOT\n` +
    `   blindly agree with the owner OR with each other — surface the real disagreement, name\n` +
    `   the tradeoff, defend or retract with reasons. A brief that just agrees is a failed brief.\n` +
    `3. **Synthesize.** The **main session** (not a subagent) reconciles the positions into a\n` +
    `   design recommendation. **Hard stop after these two rounds** — no third round.\n\n` +
    `The council **proposes**; it never decides. Only the owner stamps a spec BINDING (Step 3).\n\n` +
    `## Step 3 — Write the spec, then the owner ratifies it as BINDING\n\n` +
    `1. **Write the spec** to \`.claude/veriloop/specs/<kebab-slug>.md\`: the feature in one line,\n` +
    `   then the decisions made, the non-goals, and the acceptance criteria. Acceptance criteria\n` +
    `   reference the \`/dev-loop\` gate — they never carry runnable commands as authority (the\n` +
    `   gate's commands derive from \`commands.json\` only).\n` +
    `2. **The owner ratifies it as BINDING via AskUserQuestion** before it is final. The council\n` +
    `   proposes; **only the owner stamps BINDING.** Until the owner ratifies, the spec is a\n` +
    `   draft. (This severs the injection channel: repo text → generated personas → council →\n` +
    `   spec → background implementer prompts is a laundering path; owner ratification cuts it.)\n\n` +
    `## Step 4 — Off-ramp\n\n` +
    `Once the spec is ratified, offer to run **\`/dev-loop\`** with it — the ratified spec is the\n` +
    `binding \`args.spec\`, and \`/dev-loop\` builds, gates, and pushes a preview.\n\n` +
    `## HARD LIMITS\n\n` +
    `- **Write covenant.** You write **ONLY** \`.claude/veriloop/specs/<slug>.md\` (re-writing\n` +
    `  that same path while iterating is fine). **Never touch:** code, branches/worktrees,\n` +
    `  mutating git, \`constitution.md\`, \`experts/*\` (incl. \`.overrides.md\`), \`interview.json\`,\n` +
    `  \`commands.json\`, the manifest, \`.claude/commands/*\`, \`.env*\`. **No scratch files.** The\n` +
    `  council subagents are **read-only** (they inherit \`/advise\`'s contract) — **only the main\n` +
    `  session writes**, and it writes only the spec.\n` +
    `- **NO VERDICTS.** You produce planning advice and a proposed spec — never PASS / FAIL /\n` +
    `  approval. A verdict belongs exclusively to the \`/dev-loop\` gate; \`/dev-plan\` never\n` +
    `  substitutes for it.\n` +
    `- **Spec hygiene.** Relative paths only, no secrets, never paste \`.env\` contents into a\n` +
    `  spec. A spec carries decisions and acceptance criteria, not runnable commands as authority.\n` +
    `- **Ownership covenant.** Specs are session-authored and **hand-owned** — the generator\n` +
    `  NEVER regenerates \`specs/\`. The ratified spec is **git-tracked**: it is committed with\n` +
    `  the feature (or as a docs commit), **never gitignored**.\n`
  );
}

// ---------------------------------------------------------------------------
// /review command — the expert lenses on a diff, WITHOUT the full dev-loop
// ---------------------------------------------------------------------------

export function renderReviewCommand({ repoName, roster, gate }) {
  const lensList = roster.experts.map((e) => `\`${e.key}\``).join(', ');
  const gateText = (gate || []).map((c) => `\`${c.cmd}\``).join(' + ');
  return (
    `---\n` +
    `description: Use when the owner wants the repo's expert lenses on uncommitted or recent changes WITHOUT running the full dev-loop — a quick lens-only review of ${repoName}'s working-tree diff or a named commit range. Read-only and ADVISORY: findings are tagged BLOCKER/SHOULD-FIX/NIT, but this is NOT the gate and produces no verdict. A few lens agents, ~10x cheaper than a full drive.\n` +
    `---\n\n` +
    `Run **${repoName}'s expert lenses** over a change — no plan, no implement, no gate:\n\n` +
    `> $ARGUMENTS\n\n` +
    `## Step 1 — Determine the change to review\n\n` +
    `Review the **uncommitted working-tree diff** (\`git diff\` plus \`git status --porcelain\`\n` +
    `for new/untracked files), OR the commit range the owner names in \`$ARGUMENTS\` (e.g.\n` +
    `\`main..HEAD\`). If there is nothing to review, say so and stop.\n\n` +
    `## Step 2 — Spawn the lenses (parallel, read-only)\n\n` +
    `Spawn the roster's experts as **parallel read-only agents** — ${lensList}. Each loads its\n` +
    `persona (\`.claude/veriloop/experts/<name>.md\`) + its \`.overrides.md\` sibling (the\n` +
    `override **wins on conflict**) + \`.claude/veriloop/constitution.md\`, reviews the diff in\n` +
    `**MODE: REVIEW**, and returns findings tagged \`BLOCKER\` / \`SHOULD-FIX\` / \`NIT\` with\n` +
    `\`file:line\`.\n\n` +
    `## Step 3 — Merge by ROOT CAUSE\n\n` +
    `Merge the findings **deduped by ROOT CAUSE**: when several experts describe one\n` +
    `underlying defect, that is **ONE** finding listing every expert that raised it — never\n` +
    `the same issue repeated once per lens.\n\n` +
    `## Hard limits\n\n` +
    `- **Read-only.** No edits, no worktrees/branches, no mutating commands. Do **not**\n` +
    `  auto-fix anything.\n` +
    `- **Advisory, NOT the gate.** This produces **no verdict**; passing \`/review\` **never**\n` +
    `  substitutes for the \`/dev-loop\` gate. It is a cheap second look, not sign-off.\n` +
    `- It does **not** run the real exit-code checks (${gateText || 'the repo\'s gate commands'}) —\n` +
    `  only the \`/dev-loop\` gate does. \`/review\` is lenses only.\n`
  );
}

// ---------------------------------------------------------------------------
// /posture command — set the repo's DEFAULT budget posture (not a per-run knob)
// ---------------------------------------------------------------------------

// `postures` is passed in as Object.keys(BUDGET_PRESETS) so the emitted literal
// level list derives from the single source of truth (constitution rule 9 — the
// command text and the real presets cannot drift). Runs INLINE in the repo it's
// installed in; writes exactly one key in interview.json then regenerates via the
// sanctioned compiler. NO model: line — posture-setting is mechanical.
export function renderPostureCommand({ repoName, postures }) {
  const levels = postures.join(' | ');
  const levelList = postures.map((p) => `\`${p}\``).join(', ');
  return (
    `---\n` +
    `description: Use when the owner wants to change ${repoName}'s DEFAULT budget posture (the cost/quality dial baked into the bundle) — set it to ${levelList}, or show the current posture. NOT a per-run override (that is \`args.posture\` on /dev-loop); this rewrites the repo's default in \`interview.json\` and regenerates the bundle.\n` +
    `allowed-tools: Read, Edit, Bash(node:*)\n` +
    `---\n\n` +
    `Change **${repoName}'s default budget posture** — the cost/quality dial baked into the\n` +
    `emitted loop from \`.claude/veriloop/interview.json\`. This runs **inline, in this repo**.\n\n` +
    `> $ARGUMENTS\n\n` +
    `The valid levels are **${levels}** (the only postures the compiler accepts).\n\n` +
    `## \`/posture\` (no argument) — show, change nothing\n\n` +
    `If \`$ARGUMENTS\` is empty:\n\n` +
    `1. Read \`budget_posture\` from \`$REPO/.claude/veriloop/interview.json\` (default \`balanced\`\n` +
    `   if the key or the file is absent).\n` +
    `2. Print the current posture, the three valid levels (**${levels}**), and the resulting\n` +
    `   per-phase routing — read it verbatim from the \`This repo's default routing\` line in\n` +
    `   \`$REPO/.claude/commands/dev-loop.md\` (do NOT recompute the presets — that line already\n` +
    `   carries them). Change nothing and stop.\n\n` +
    `## \`/posture <level>\` — set the default\n\n` +
    `1. **Validate FIRST, before any write.** If \`<level>\` is not one of **${levels}**, print the\n` +
    `   valid set and STOP. Never leave \`interview.json\` half-edited on a bad level.\n` +
    `2. **Edit only one key.** In \`$REPO/.claude/veriloop/interview.json\`, set \`budget_posture\` to\n` +
    `   \`<level>\`. **PRESERVE every other key byte-for-byte** — \`phase_models\` (e.g.\n` +
    `   \`{ "plan": "fable" }\`), \`cross_model\`, \`high_risk_areas\`, \`roster_add\`, \`extra_checks\`, … Parse\n` +
    `   the JSON → set the single field → serialize (or make a targeted edit to that one key). NEVER a\n` +
    `   blind rewrite that could drop keys. (An installed bundle always has \`interview.json\`; if it is\n` +
    `   genuinely absent, STOP and tell the owner to re-install — this command may not create it.)\n` +
    `3. **Regenerate via the sanctioned compiler.** Locate veriloop's compiler **relative to the\n` +
    `   veriloop skill directory** — the directory containing veriloop's \`SKILL.md\` (\`scripts/\` is at\n` +
    `   \`<skill-dir>/../../scripts\`). Resolve it the way the skill resolves its own dir; **never hardcode\n` +
    `   an absolute path.** Then run:\n` +
    "   ```\n" +
    `   node <skill-dir>/../../scripts/generate.mjs --repo "$REPO" \\\n` +
    `     --commands "$REPO/.claude/veriloop/commands.json" \\\n` +
    `     --interview "$REPO/.claude/veriloop/interview.json"\n` +
    "   ```\n" +
    `   **FAIL GRACEFULLY** if the compiler is not reachable (e.g. the bundle was installed without the\n` +
    `   veriloop skill on disk): report that \`interview.json\` **was already updated so no state is lost**,\n` +
    `   and tell the owner to regenerate manually once the skill is available. Do not fabricate a path.\n` +
    `4. **Report** the new posture and the resulting per-phase routing — read the regenerated\n` +
    `   \`This repo's default routing\` line from \`$REPO/.claude/commands/dev-loop.md\` (the compiler also\n` +
    `   prints \`budget: posture=… — plan:… implement:… …\` to stderr) so the owner sees the effect\n` +
    `   without opening a file.\n\n` +
    `## HARD LIMITS\n\n` +
    `- **Write covenant.** You write **exactly one key** (\`budget_posture\`) in\n` +
    `  \`$REPO/.claude/veriloop/interview.json\`, then invoke the compiler which regenerates the\n` +
    `  machine-owned bundle (the normal, sanctioned regeneration — the same files a documented\n` +
    `  re-run rewrites, honoring the three-way merge / backups / splice markers). **NOTHING else:** no\n` +
    `  code, no branches, no other \`interview.json\` keys, and never edit \`constitution.md\`,\n` +
    `  \`experts/*\`, \`commands.json\`, or the manifest by hand, never \`.env*\`.\n` +
    `- **Validation before mutation.** A bad level changes nothing.\n` +
    `- **Portability.** No absolute paths — resolve the compiler relative to the skill dir.\n` +
    `- **Node scope.** The ONLY node invocation permitted is the sanctioned \`generate.mjs\` compiler call\n` +
    `  above — never \`node -e\`, never an arbitrary script. \`Bash(node:*)\` is granted for that one command;\n` +
    `  the covenant, not the tool glob, is the real boundary.\n` +
    `- **No verdicts, no gate authority.** This is a config command, not a review surface.\n`
  );
}

// ---------------------------------------------------------------------------
// Machine-owned config block (spliced into the workflow's auto region)
// ---------------------------------------------------------------------------

export function renderAutoBlock(meta, config) {
  const metaJs = `export const meta = ${JSON.stringify(meta, null, 2)};`;
  const cfgJs = `const VERILOOP = ${JSON.stringify(config, null, 2)};`;
  return `// ${AUTO_START}\n${metaJs}\n\n${cfgJs}\n// ${AUTO_END}`;
}

export function spliceAuto(template, autoBlock) {
  const start = template.indexOf(`// ${AUTO_START}`);
  const end = template.indexOf(`// ${AUTO_END}`);
  if (start === -1 || end === -1) throw new Error('template is missing the veriloop:auto markers');
  const endLineEnd = template.indexOf('\n', end);
  return template.slice(0, start) + autoBlock + template.slice(endLineEnd);
}
