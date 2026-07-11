// veriloop renderers — produce the human-readable artifacts (personas, their
// override siblings, the starter constitution, the /dev-loop command) and the
// machine-owned config block spliced into the workflow.
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
  `> Reviewer persona for the \`${repoName}\` dev-loop gate. Stack: **${stack.join(' + ')}**.\n` +
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

export function renderCommand({ repoName, roster, commandsJson, gate }) {
  const lenses = roster.experts.map((e) => e.key).join(', ');
  const gateText = (gate || []).map((c) => `\`${c.cmd}\``).join(' + ');
  const shot = commandsJson.has_ui ? ', a **screenshot gate** on UI changes,' : '';
  return (
    `---\n` +
    `description: Run the ${repoName} per-feature dev loop (plan → risk-tiered gate → bounded auto-fix → push a preview) on an isolated branch, stopping before merge for owner sign-off.\n` +
    `---\n\n` +
    `Run the **${repoName} dev-loop** for this feature:\n\n` +
    `> $ARGUMENTS\n\n` +
    `Invoke the \`${repoName}-dev-loop\` workflow with \`args = { feature: "$ARGUMENTS" }\`.\n\n` +
    `It runs autonomously on a dedicated **git worktree + branch** (never the owner's main checkout):\n\n` +
    `1. **Plan-review** — design the slice; the baseline reviewer checks it against \`constitution.md\`.\n` +
    `   If the plan violates an invariant, it stops and reports instead of coding.\n` +
    `2. **Risk triage** — classifies the change (trivial / standard / high) so gate depth scales with risk.\n` +
    `3. **Implement** in the worktree.\n` +
    `4. **GO/NO-GO gate** — REAL ${gateText || 'checks'} that must actually pass (exit codes decide), plus the\n` +
    `   review lenses (${lenses})${shot} and an optional cross-model second opinion. Emits **PASS / CONCERNS /\n` +
    `   FAIL / WAIVED**.\n` +
    `5. **Bounded auto-fix** — on FAIL, fixes blockers and re-runs, up to **3 passes**, stopping early if it\n` +
    `   stops making progress.\n` +
    `6. **Docs sync**, then **push the branch + leave a preview**.\n\n` +
    `It **STOPS before merge/deploy** — that is the owner gate.\n\n` +
    `Options: \`args.dryRun = true\` (stop before push), \`args.waive = ["substring", ...]\` (human waiver:\n` +
    `downgrade a matching blocker to WAIVED — an agent may never waive its own finding).\n\n` +
    `When the workflow returns, present its report: the final **verdict**, the branch + preview link/note,\n` +
    `remaining **CONCERNS**, and the fix-pass history. Then **wait for explicit merge/deploy sign-off.**\n`
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
