#!/usr/bin/env node
// veriloop phases 6/7 — Generate + wire the exit-code gate.
// Slot-fills the portable dev-loop template with the VERIFIED commands from
// commands.json + the detected expert roster + risk tiers, and emits the plain-
// file bundle into the target repo. Machine-owned sections regenerate on re-run;
// hand-owned files (each expert's `.overrides.md`, the constitution) are never
// clobbered (design decisions #1 + #2).
//
// Usage:
//   node generate.mjs --repo <path> --commands <commands.json> [--out <dir>] [--force]
//     --repo      repo to scan (roster signals + repo SHA); default cwd
//     --commands  the commands.json produced by detect/verify
//     --out       bundle destination root (default: --repo)
//     --domain    the domain audit's input (default:
//                 <out>/.claude/veriloop/domain.json; absent → no domain/ bundle)
//     --force     overwrite hand-owned files too (default: preserve them)

import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { detectRoster, SPECIALIST_DEFAULTS } from './lib/roster.mjs';
import { renderExpert, renderOverrides, renderConstitution, renderCommand, renderAdviseCommand, renderReviewCommand, renderDevPlanCommand, renderPostureCommand, renderAutoBlock, spliceAuto, renderSessionRouting, renderSessionStartHook, renderClaudeSettings, wiresSessionHook, SESSION_ROUTING_DOC, SESSION_HOOK_SCRIPT, CLAUDE_SETTINGS } from './lib/render.mjs';
import { collectDomainFacts, buildReferences, renderDomainAudit, renderDomainExpert, renderDomainOverrides, readDomainInput } from './lib/domain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERILOOP_VERSION = '0.5.0';

// Markers for the one machine-owned block veriloop maintains inside an
// owner-owned shared file (.gitignore / .prettierignore). Hash comments — valid
// in both formats. Everything outside the block is never touched.
const BLOCK_START = '# <<< veriloop:auto:start >>>';
const BLOCK_END = '# <<< veriloop:auto:end >>>';

function parseArgs(argv) {
  const args = { repo: process.cwd(), commands: null, out: null, force: false, interview: null, domain: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = resolve(argv[++i]);
    else if (a === '--commands') args.commands = resolve(argv[++i]);
    else if (a === '--out') args.out = resolve(argv[++i]);
    else if (a === '--interview') args.interview = resolve(argv[++i]);
    else if (a === '--domain') args.domain = resolve(argv[++i]);
    else if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  if (!args.out) args.out = args.repo;
  return args;
}

const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const expertSlug = (key) => (key === 'code-review' ? 'baseline-reviewer' : key);

function repoSha(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function buildDepsSetup(cj) {
  const install = cj.commands.install?.cmd;
  const build = cj.commands.build?.cmd;
  if (cj.stack.includes('node')) {
    return (
      'symlink the main checkout\'s dependencies into the worktree so checks resolve — ' +
      '`ln -s $REPO/node_modules <wt>/node_modules` at the root and for each workspace that has its own ' +
      'node_modules' + (install ? `; fall back to \`${install}\` inside the worktree only if a symlink won't resolve.` : '.')
    );
  }
  if (cj.stack.includes('python')) {
    let s = install
      ? `create/enter a virtualenv (or reuse the project's), then \`${install}\` inside the worktree so imports + entry points resolve.`
      : 'ensure the package is importable in the worktree (editable install into a virtualenv).';
    if (usesCargo(cj)) s += ` This repo ships a compiled (Rust/maturin) extension — also run \`${build && /maturin|rust/.test(build) ? build : 'maturin develop --release'}\` in the worktree so the extension is importable.${cargoShare()}`;
    return s;
  }
  if (cj.stack.includes('rust')) return rustDepsSetup();
  return install ? `run \`${install}\` inside the worktree so its dependencies resolve.` : 'make the repo\'s dependencies available inside the worktree.';
}

/**
 * Does this repo run prettier over its tree? A detected command is NOT enough
 * evidence — `format:check` resolves to the wrapper `npm run format:check`, whose
 * text never contains "prettier". So look at the real signals: a prettier config
 * (any flavor), a prettier dependency, a script body that invokes it, or a
 * command that calls it directly (`npx prettier --check .`).
 */
function repoUsesPrettier(repo, cj) {
  const CONFIGS = [
    '.prettierrc', '.prettierrc.json', '.prettierrc.json5', '.prettierrc.yaml', '.prettierrc.yml',
    '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.toml',
    'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs', '.prettierignore',
  ];
  if (CONFIGS.some((f) => existsSync(join(repo, f)))) return true;
  try {
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
    if (pkg.prettier) return true;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (Object.keys(deps).some((d) => d === 'prettier' || d.startsWith('prettier-') || d.includes('/prettier'))) return true;
    if (Object.values(pkg.scripts || {}).some((s) => /\bprettier\b/.test(String(s)))) return true;
  } catch { /* no/unreadable package.json */ }
  return Object.values(cj.commands || {}).some((c) => /\bprettier\b/.test((c && c.cmd) || ''));
}

// ---- cost/quality routing (phase-group → model + reasoning effort) ----
// Phase groups, not individual agents: a knob per agent would be unusable.
const PHASE_GROUPS = ['plan', 'implement', 'review', 'checks', 'fix', 'land', 'report'];
const MODELS = ['haiku', 'sonnet', 'opus', 'fable'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// Presets are only DEFAULTS for the per-group map — the map is the primitive, so
// any group can be pointed at any model (e.g. plan on fable, implement on opus).
// `checks` is deliberately cheap at every posture: that agent runs the real
// commands and reports exit codes — a mechanical job, not a judgment call, so
// spending a frontier model on it buys nothing. The posture NEVER removes a job.
const BUDGET_PRESETS = {
  frugal: {
    plan: { model: 'sonnet', effort: 'high' },
    implement: { model: 'sonnet', effort: 'medium' },
    review: { model: 'sonnet', effort: 'medium' },
    checks: { model: 'haiku', effort: 'low' },
    fix: { model: 'sonnet', effort: 'medium' },
    land: { model: 'haiku', effort: 'low' },
    report: { model: 'haiku', effort: 'medium' },
  },
  balanced: {
    plan: { model: 'opus', effort: 'high' },
    implement: { model: 'opus', effort: 'medium' },
    review: { model: 'opus', effort: 'high' },
    checks: { model: 'haiku', effort: 'low' },
    fix: { model: 'opus', effort: 'medium' },
    land: { model: 'sonnet', effort: 'low' },
    report: { model: 'sonnet', effort: 'high' },
  },
  max: {
    plan: { model: 'opus', effort: 'xhigh' },
    implement: { model: 'opus', effort: 'high' },
    review: { model: 'opus', effort: 'xhigh' },
    checks: { model: 'sonnet', effort: 'low' },
    fix: { model: 'opus', effort: 'high' },
    land: { model: 'sonnet', effort: 'medium' },
    report: { model: 'opus', effort: 'high' },
  },
};

/** Fail the BUILD on a bad routing answer — never emit a loop that dies mid-run. */
function buildBudget(interview) {
  const posture = interview.budget_posture || 'balanced';
  if (!BUDGET_PRESETS[posture]) {
    throw new Error(`interview.budget_posture: '${posture}' is not one of ${Object.keys(BUDGET_PRESETS).join(' | ')}`);
  }
  const pick = (key, allowed) => {
    const src = interview[key] || {};
    const out = {};
    for (const [group, val] of Object.entries(src)) {
      if (!PHASE_GROUPS.includes(group)) throw new Error(`interview.${key}: '${group}' is not a phase group (${PHASE_GROUPS.join(' | ')})`);
      if (!allowed.includes(val)) throw new Error(`interview.${key}.${group}: '${val}' is not one of ${allowed.join(' | ')}`);
      out[group] = val;
    }
    return out;
  };
  return {
    posture,
    presets: BUDGET_PRESETS,
    models: pick('phase_models', MODELS),
    effort: pick('phase_effort', EFFORTS),
  };
}

/** Fail the BUILD on a bad question cap — never emit a loop that dies mid-run. */
function buildQuestionCap(interview) {
  const cap = interview.question_cap;
  if (cap === undefined || cap === null) return null; // default: no cap (behavior unchanged)
  if (!Number.isInteger(cap) || cap <= 0) {
    throw new Error(`interview.question_cap: '${cap}' must be a positive integer (the /dev-plan default question cap)`);
  }
  return cap;
}

// The specialist keys an owner may add — exactly the persona bodies render.mjs
// supports, minus the always-present baseline. (finding #11)
const ROSTER_ADD_KEYS = Object.keys(SPECIALIST_DEFAULTS); // security | drift | ux

/**
 * Apply the interview's owner-confirmed roster additions to the detected roster,
 * IN PLACE, before risk tiers / config are built (so e.g. a drift add engages the
 * drift-conditional risk keywords). Finding #11: the LLM-refined roster now has a
 * home in the interview. Fails the BUILD on a bad add — matches buildBudget's throw
 * style: never emit a loop whose roster silently dropped an owner's expert.
 */
function applyRosterAdd(roster, interview) {
  const adds = interview.roster_add;
  if (adds === undefined) return;
  if (!Array.isArray(adds)) throw new Error('interview.roster_add: must be an array of { key, title?, tiers?, evidence }');
  for (const add of adds) {
    const key = add && add.key;
    if (!ROSTER_ADD_KEYS.includes(key)) {
      throw new Error(`interview.roster_add: '${key}' is not one of ${ROSTER_ADD_KEYS.join(' | ')}`);
    }
    // Every expert carries the evidence that nominated it — the roster covenant.
    if (!Array.isArray(add.evidence) || !add.evidence.some((e) => typeof e === 'string' && e.trim())) {
      throw new Error(`interview.roster_add.${key}: evidence is required — a non-empty array of strings (what nominated this expert)`);
    }
    const evidence = add.evidence.filter((e) => typeof e === 'string' && e.trim());
    const existing = roster.experts.find((e) => e.key === key);
    if (existing) {
      // detector already elected this key — merge, don't duplicate.
      existing.evidence.push(...evidence.map((e) => `owner-confirmed: ${e}`));
      continue;
    }
    const def = SPECIALIST_DEFAULTS[key];
    roster.experts.push({
      key,
      title: add.title || def.title,
      tiers: Array.isArray(add.tiers) && add.tiers.length ? add.tiers.map(String) : [...def.tiers],
      evidence,
    });
    // T4 (2026-07-31): the 4-expert cap is scoped to the ROSTER — the reviewing
    // lenses the gate spawns. It does not, and never did, cover the advisory
    // domain persona under `.claude/veriloop/domain/`, which sits outside
    // `roster` and generates unconditionally. Retired as intent, not as code:
    // bounded persona count still governs the roster exactly as before.
    if (roster.experts.length > 4) {
      throw new Error(`interview.roster_add: roster would exceed the cap of 4 experts (baseline + 3 specialists)`);
    }
  }
}

function buildRiskTiers(cj, roster) {
  const high = new Set(['migration', 'schema', 'auth', 'database', 'secret', 'token', 'password', 'rls', 'sql', 'permission', 'payment', 'deploy', 'access', 'crypto']);
  if (roster.experts.some((e) => e.key === 'drift')) ['engine', 'rules', 'parity', 'oracle', 'reward', 'rng', 'obs', 'conformance', 'fixture', 'protocol', 'contract', 'algorithm'].forEach((k) => high.add(k));
  const trivial = ['docs', 'readme', 'comment', 'typo', 'style', 'css', 'format', 'changelog', 'whitespace', 'copy'];
  return { high: [...high], trivial };
}

function buildConfig(cj, roster, repoName, interview = {}) {
  // Gate order: static analysis first (fast, non-mutating), then tests. A
  // read-only format check (e.g. `prettier --check`) belongs in the gate; a
  // MUTATING formatter (`prettier --write`, `ruff format`) never does — it would
  // rewrite files mid-gate. `mutates` is the precise signal (verify also skips on
  // it), so include `format` only when it does not mutate.
  const gateOrder = ['typecheck', 'lint', 'format', 'test'];
  const gate = gateOrder
    .map((k) => cj.commands[k] && !cj.commands[k].mutates && { name: k, cmd: cj.commands[k].cmd, verified: cj.commands[k].verified, ci: cj.commands[k].verified_by_ci })
    .filter(Boolean);
  const experts = roster.experts.map((e) => ({
    key: e.key,
    title: e.title,
    tiers: e.tiers,
    file: `.claude/veriloop/experts/${expertSlug(e.key)}.md`,
    overrides: `.claude/veriloop/experts/${expertSlug(e.key)}.overrides.md`,
  }));
  return {
    repoName,
    stack: cj.stack,
    packageManager: cj.package_manager,
    hasUi: cj.has_ui,
    constitution: '.claude/veriloop/constitution.md',
    gate,
    e2e: cj.commands.e2e ? { cmd: cj.commands.e2e.cmd, verified: cj.commands.e2e.verified, ci: cj.commands.e2e.verified_by_ci } : null,
    install: cj.commands.install?.cmd || null,
    depsSetup: buildDepsSetup(cj),
    crossModel: interview.cross_model !== undefined ? !!interview.cross_model : true,
    budget: buildBudget(interview),
    questionCap: buildQuestionCap(interview),
    uiAreas: ['ui', 'component', 'page', 'screen', 'view', 'css', 'style', 'layout', 'hud', 'board', 'lobby', 'render', 'widget', 'gui', 'frontend'],
    riskTiers: (() => {
      const rt = buildRiskTiers(cj, roster);
      for (const k of interview.high_risk_areas || []) if (!rt.high.includes(k)) rt.high.push(k);
      return rt;
    })(),
    extraChecks: (interview.extra_checks || []).map((x) => ({
      name: String(x.name),
      instruction: String(x.instruction),
      areaKeywords: Array.isArray(x.areaKeywords) ? x.areaKeywords.map(String) : [],
    })),
    experts,
  };
}

function buildMeta(repoName, hasUi) {
  return {
    name: `${repoName}-dev-loop`,
    description: `Per-feature dev loop for ${repoName}: plan(vs constitution) -> triage -> worktree implement -> risk-tiered gate(real exit-code checks + review lenses${hasUi ? ' + screenshot' : ''}) -> bounded auto-fix of blockers (and, under resolve=clean, of independently confirmed concerns) -> docs sync -> push preview. Stops before merge.`,
    phases: [
      { title: 'Plan', detail: 'design + baseline review vs constitution + risk triage' },
      { title: 'Implement', detail: 'build in an isolated git worktree' },
      { title: 'Gate', detail: 'real exit-code checks + review lenses (depth by tier)' },
      { title: 'Fix', detail: 'bounded auto-fix of blockers — plus confirmed concerns under resolve=clean (<=3 passes)' },
      { title: 'Land', detail: 'docs sync + push branch/preview (no merge)' },
      { title: 'Report', detail: 'compress the run into a lossless brief' },
    ],
  };
}

// ---- write helpers with ownership policy ----
function makeWriter(outRoot, force) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(outRoot, '.claude/veriloop/.backups', stamp);
  const emitted = [];
  const backup = (path) => {
    if (!existsSync(path)) return;
    const rel = path.slice(outRoot.length + 1);
    const dest = join(backupDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(path, dest);
  };
  const rel = (p) => p.slice(outRoot.length + 1);
  return {
    // machine-owned: always (re)written; prior version backed up if it changed
    machine(path, content) {
      mkdirSync(dirname(path), { recursive: true });
      const changed = !existsSync(path) || readFileSync(path, 'utf8') !== content;
      if (changed && existsSync(path)) backup(path);
      writeFileSync(path, content);
      emitted.push({ path: rel(path), ownership: 'machine', status: existsSync(path) && !changed ? 'unchanged' : 'written' });
    },
    // shared: an OWNER-owned file (.gitignore/.prettierignore) carrying ONE
    // machine-owned marked block. The block is created/replaced idempotently;
    // every line outside it is preserved byte-for-byte. A user line that happens
    // to duplicate a block line is harmless for ignore-file semantics — never
    // rewrite the owner's lines.
    spliceBlock(path, lines, { createIfMissing = false } = {}) {
      const exists = existsSync(path);
      if (!exists && !createIfMissing) return;
      const block = [BLOCK_START, ...lines, BLOCK_END].join('\n');
      const prior = exists ? readFileSync(path, 'utf8') : null;
      let next;
      if (prior === null) {
        next = block + '\n';
      } else {
        const s = prior.indexOf(BLOCK_START);
        const e = prior.indexOf(BLOCK_END);
        if (s !== -1 && e !== -1 && e > s) {
          next = prior.slice(0, s) + block + prior.slice(e + BLOCK_END.length);
        } else {
          next = prior.replace(/\n*$/, '\n') + '\n' + block + '\n';
        }
      }
      const changed = next !== prior;
      if (changed && exists) backup(path);
      if (changed) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, next);
      }
      emitted.push({ path: rel(path), ownership: 'shared-block', status: changed ? 'written' : 'unchanged' });
    },
    // hand-owned: written once; preserved on re-run unless --force
    handOnce(path, content, kind = 'hand') {
      mkdirSync(dirname(path), { recursive: true });
      if (existsSync(path) && !force) {
        emitted.push({ path: rel(path), ownership: kind, status: 'preserved' });
        return;
      }
      if (existsSync(path)) backup(path);
      writeFileSync(path, content);
      emitted.push({ path: rel(path), ownership: kind, status: 'written' });
    },
    emitted,
    backupDir,
  };
}

// ---------------------------------------------------------------------------
// Review-on-growth prompt for `.claude/veriloop/domain/expert.md`
// (owner decision, 2026-08-01; spec § Open RISKS "Cap-removal risk")
// ---------------------------------------------------------------------------
//
// THIS IS A PROMPT, NOT A LIMIT. It has no ceiling, no threshold that blocks, and it
// cannot fail a run or change an exit code. It asks a human to re-read a file. T12
// retired all three length caps and the spec declined a replacement in as many words —
// *"a review-on-growth prompt costs less than a cap and does not constrain length"* —
// and this is that prompt, chosen by the owner over a cap and over doing nothing.
//
// WHY it exists: `persona-debate-verdict.md:26` measured that **longer personas damage
// more**, and that models better at system-prompt steering take LARGER hits. `expert.md`
// is adopted verbatim by every `/advise` consult and by four stance subagents, so its
// length is a cost every consult pays. Nothing else in the repo notices accretion since
// T12. But "damages more" is a reason to LOOK, not a number to enforce: the right length
// is a judgment about content, and a cap would make the generator the judge.
//
// WHY growth and not absolute size: an absolute number is a cap wearing a different hat —
// it would fire forever once crossed, and it would fire on a repo whose domain is simply
// large. Growth fires once, on the run that caused it, at the one moment a human can
// still cheaply read the diff.
//
// WHY at generate time: `expert.md` is byte-integrity-checked by lint check 7b, so the
// file cannot change without a regenerate. Growth therefore only ever happens HERE, when
// a changed `domain.json` renders a longer artifact over the one it replaces.
const EXPERT_GROWTH_MARGIN = 0.2;
// 20%, and the number is a judgment about NOISE, not about a safe size. A reference entry
// renders as one ~15-word bullet, so ordinary curation of `domain.json` — add a source, add
// a vocabulary term — moves the render by a percent or two whatever the persona's size.
// 20% is a whole new section, or a batch of eight-plus entries landing at once: an
// accretion event, which is what the prompt is for. (Deliberately stated as a RATIO with
// no absolute word figure. This comment used to say "~680-word expert.md ⇒ 20% is ~135
// words"; the very next commit took it to 1448 and the arithmetic silently went false.)
// 15% sits close enough to a routine multi-entry batch to fire on normal work, and a prompt
// that fires on normal work is one the owner learns to scroll past — the failure mode a
// prompt has no defense against, unlike a cap, which is obeyed whether or not it is read.
const measureExpert = (text) => ({ words: (text.match(/\S+/g) || []).length, bytes: Buffer.byteLength(text, 'utf8') });

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.commands) {
    console.log('Usage: node generate.mjs --repo <path> --commands <commands.json> [--out <dir>] [--domain <domain.json>] [--force]');
    return;
  }
  const cj = JSON.parse(readFileSync(args.commands, 'utf8'));
  const repoName = kebab(basename(args.repo));
  const roster = detectRoster(args.repo, cj);
  // interview answers: prior manifest's answers survive a re-run; a --interview
  // file merges over them. They are USER data — never silently reset.
  let interview = {};
  // The BASELINE for the review-on-growth prompt: the size the LAST generate run recorded
  // for the `domain/expert.md` it wrote — i.e. the size of the file this run is about to
  // replace. Read from the same prior manifest, and absent on a first-ever generate, which
  // is why a first run cannot prompt (there is nothing to have grown from).
  let priorExpertSize = null;
  const priorManifestPath = join(args.out, '.claude/veriloop/veriloop-manifest.json');
  if (existsSync(priorManifestPath)) {
    try {
      const pm = JSON.parse(readFileSync(priorManifestPath, 'utf8'));
      interview = pm.interview_answers || {};
      priorExpertSize = pm.domain_expert_size || null;
    } catch { /* ignore */ }
  }
  if (args.interview) interview = { ...interview, ...JSON.parse(readFileSync(args.interview, 'utf8')) };
  // owner-confirmed roster additions (finding #11) — applied BEFORE buildConfig so
  // roster-conditional risk keywords (e.g. drift) engage.
  applyRosterAdd(roster, interview);
  const config = buildConfig(cj, roster, repoName, interview);
  // resolve-to-clean (D1 + D6). Attached HERE rather than inside `buildConfig` so the
  // line numbers the constitution and both hand-owned `*.overrides.md` cite in this file
  // (`:303 backup`, `:313 machine`, `:325 spliceBlock`, `:351 handOnce`) do not move.
  config.resolveDefault = buildResolveDefault(interview);
  config.protectedPaths = deriveProtectedPaths(args.repo, config);
  const meta = buildMeta(repoName, cj.has_ui);
  // Tier 1 (declared dependencies) and Tier 3 (file census) facts for the domain
  // audit. Computed HERE, by a script, and published in the manifest so the audit
  // CITES them instead of deriving them (constitution rule 2). Always computed —
  // the manifest carries the facts whether or not a domain bundle is emitted.
  const domainFacts = collectDomainFacts(args.repo, cj);

  const template = readFileSync(join(HERE, 'templates/dev-loop.template.js'), 'utf8');
  const workflow = spliceAuto(template, renderAutoBlock(meta, config));

  const w = makeWriter(args.out, args.force);
  const P = (...p) => join(args.out, ...p);

  // machine-owned artifacts
  w.machine(P('.claude/workflows', `${repoName}-dev-loop.js`), workflow);
  w.machine(P('.claude/commands/dev-loop.md'), renderCommand({ repoName, roster, commandsJson: cj, gate: config.gate, budget: config.budget }));
  // /advise seats the DOMAIN EXPERT, never the roster (Phase 2 of the domain-expert
  // spec) — hence NO `roster` argument here. The experts' second mandate is now
  // /review (lens review without the loop) and /dev-plan's council in ADVISE mode.
  // Both are read-only and carry NO gate authority.
  w.machine(P('.claude/commands/advise.md'), renderAdviseCommand({ repoName, gate: config.gate }));
  w.machine(P('.claude/commands/review.md'), renderReviewCommand({ repoName, roster, gate: config.gate }));
  // /dev-plan — recon + interleaved spec interview + expert council → a spec the
  // owner ratifies as BINDING before /dev-loop builds it. The plan-phase model is
  // emitted verbatim from the interview (config.budget.models.plan is exactly the
  // raw interview key if present, else undefined — no preset fallback); an absent
  // key emits NO model line (inherit the session model). Runs inline; writes only
  // the spec; carries NO gate authority.
  w.machine(P('.claude/commands/dev-plan.md'), renderDevPlanCommand({ repoName, roster, planModel: config.budget.models.plan, questionCap: config.questionCap, gate: config.gate }));
  // /posture — change the repo's DEFAULT budget posture (the value baked into the
  // bundle from interview.json). The emitted valid-level list derives from the real
  // BUDGET_PRESETS keys (rule 9 — command text can't drift from the presets).
  w.machine(P('.claude/commands/posture.md'), renderPostureCommand({ repoName, postures: Object.keys(BUDGET_PRESETS) }));
  w.machine(P('.claude/veriloop/commands.json'), JSON.stringify(cj, null, 2) + '\n');
  for (const e of roster.experts) {
    const slug = expertSlug(e.key);
    w.machine(P('.claude/veriloop/experts', `${slug}.md`), renderExpert(e.key, { repoName, stack: cj.stack, gate: config.gate, constitutionPath: config.constitution, title: e.title, evidence: e.evidence }));
    // hand-owned override sibling (write-once)
    w.handOnce(P('.claude/veriloop/experts', `${slug}.overrides.md`), renderOverrides(e.key, e.title, repoName), 'hand');
  }
  // hand-owned constitution (starter; preserved untouched on future re-runs — handOnce)
  w.handOnce(P('.claude/veriloop/constitution.md'), renderConstitution({ repoName, stack: cj.stack, roster, gate: config.gate }), 'starter');

  // domain subsystem (v0.5.0) — the advisory domain-expert path. Its judgment half
  // (classification, vocabulary, persona body, source SELECTION) is LLM-authored and
  // arrives as `.claude/veriloop/domain.json`, which this generator READS and never
  // writes — the same posture as interview.json. No domain.json → no domain/ bundle,
  // and every check below is skipped rather than half-satisfied.
  // `required` when --domain was passed EXPLICITLY: an unreadable explicit path is a typo,
  // not "the subsystem is not installed", and silently dropping domain/ on a green gate is
  // the failure mode lint check 7 exists to prevent.
  const domainInput = readDomainInput(args.domain || P('.claude/veriloop/domain.json'), { required: !!args.domain });
  let references = null;
  let expertSize = null;
  if (domainInput) {
    references = buildReferences(domainInput, { warn: (m) => console.error(m) });
    // `repo` is passed so every `source` in domain.json is RESOLVED against the real
    // tree — a citation that does not exist fails the build instead of rendering into
    // audit.md reading exactly like a checked one.
    w.machine(P('.claude/veriloop/domain/audit.md'), renderDomainAudit(domainInput, domainFacts, { repoName, repo: args.repo }));
    // Measured BEFORE the write, because `w.machine` replaces the file this size is
    // compared against. Fallback baseline: a bundle generated by a veriloop old enough to
    // predate `domain_expert_size` still has the previous artifact on disk, and skipping
    // the check on that run would silence it on exactly the upgrade where domain.json
    // most often changes. The manifest field stays the primary source — it is what the
    // run that wrote the file recorded, so it cannot be moved by editing the file.
    const expertPath = P('.claude/veriloop/domain/expert.md');
    const expertDoc = renderDomainExpert(domainInput, references, { repoName, repo: args.repo, facts: domainFacts });
    if (!priorExpertSize && existsSync(expertPath)) priorExpertSize = measureExpert(readFileSync(expertPath, 'utf8'));
    expertSize = measureExpert(expertDoc);
    w.machine(expertPath, expertDoc);
    w.machine(P('.claude/veriloop/domain/references.json'), JSON.stringify(references, null, 2) + '\n');
    w.handOnce(P('.claude/veriloop/domain/expert.overrides.md'), renderDomainOverrides(repoName), 'hand');
  }

  // SessionStart routing hook (v0.5.0, Phase 3). Three plain files: the markdown
  // payload, a dependency-free node script that prints the documented SessionStart
  // envelope, and the settings entry that registers it. It BIASES the model toward
  // /advise and /dev-plan — and, on the no-route row, toward answering a read directly
  // with no command at all. /dev-loop is NOT a destination: lint-bundle fails any table
  // row pointing at it. It cannot compel any of this.
  //
  // `.claude/settings.json` is handOnce/'starter' — PRESERVE-OR-WRITE. Absent → written.
  // Present → veriloop does NOT merge and does NOT edit (absent `--force`, which replaces
  // it wholesale after a backup, like every other hand-owned file); the entry is printed
  // for the owner to merge in themselves (see the report section). There is no JSON-aware merge primitive on
  // purpose: `spliceBlock` is line-based with HASH comments and JSON has no comments, so
  // no marker-bounded machine block is possible inside it — and corrupting an adopter's
  // settings.json breaks their whole Claude Code config, not just veriloop.
  //
  // The report below is keyed on the file's CONTENT — does it already wire veriloop's hook?
  // — never on mere existence. From the second run on, veriloop's OWN settings.json exists,
  // so an existence-keyed report printed "veriloop did NOT modify your settings.json —
  // routing is NOT wired" about a file veriloop wrote and lint-bundle simultaneously reported
  // as wired. An owner who believed it and pasted the block ended up with a DUPLICATED
  // SessionStart array — the corruption preserve-or-write exists to prevent.
  const settingsPath = P(CLAUDE_SETTINGS);
  const settingsExisted = existsSync(settingsPath);
  let settingsWired = false;
  if (settingsExisted) {
    try { settingsWired = wiresSessionHook(readFileSync(settingsPath, 'utf8')); } catch { /* unparseable → theirs, not wired; lint check 8 warns */ }
  }
  w.machine(P(SESSION_ROUTING_DOC), renderSessionRouting());
  w.machine(P(SESSION_HOOK_SCRIPT), renderSessionStartHook());
  w.handOnce(settingsPath, renderClaudeSettings(), 'starter');

  // shared owner files: veriloop keeps one marked block in each.
  // .gitignore — the rolling backups of clobbered machine files are local state, and so
  // are dry-run attestation records (owner decision: dry runs emit locally but never commit).
  w.spliceBlock(P('.gitignore'), ['.claude/veriloop/.backups/', '.claude/veriloop/history/dry-runs/'], { createIfMissing: true });
  // .prettierignore — machine-owned files are EXEMPT from the repo's style, not
  // formatted to it: the generator rewrites them on every re-run, so any
  // repo-style pass over them is undone and the repo's format check flaps back
  // to RED. Exemption is the only stable answer (installing veriloop must never
  // break the host repo's own gate).
  if (repoUsesPrettier(args.repo, cj)) {
    w.spliceBlock(
      P('.prettierignore'),
      ['.claude/veriloop/', `.claude/workflows/${repoName}-dev-loop.js`, '.claude/commands/dev-loop.md', '.claude/commands/advise.md', '.claude/commands/review.md', '.claude/commands/dev-plan.md', '.claude/commands/posture.md'],
      { createIfMissing: true },
    );
  }

  // manifest (phase 9)
  const manifest = {
    veriloop_version: VERILOOP_VERSION,
    generated_at: new Date().toISOString(),
    repo_name: repoName,
    repo_root: '.',
    repo_sha: repoSha(args.repo),
    stack: cj.stack,
    package_manager: cj.package_manager,
    has_ui: cj.has_ui,
    polyglot: cj.polyglot,
    roster: roster.experts.map((e) => ({ key: e.key, title: e.title, tiers: e.tiers, evidence: e.evidence, file: `.claude/veriloop/experts/${expertSlug(e.key)}.md` })),
    roster_notes: roster.notes,
    gate_commands: config.gate,
    budget: config.budget,
    // The keys `lint-bundle.mjs`'s GENERALIZED manifest↔workflow parity check compares.
    // `cross_model` and `budget` were emitted into the workflow with no manifest twin to
    // check them against; `resolve_default` and `protected_paths` join them rather than
    // adding two more unchecked copies (constitution rule 9).
    cross_model: config.crossModel,
    resolve_default: config.resolveDefault,
    protected_paths: config.protectedPaths,
    e2e: config.e2e,
    commands_summary: Object.fromEntries(Object.entries(cj.commands).map(([k, c]) => [k, { cmd: c.cmd, safety: c.safety, verified: c.verified, verified_by_ci: c.verified_by_ci }])),
    domain_facts: domainFacts,
    // The BASELINE the next run compares against (null when no domain bundle is emitted).
    // Recorded, not enforced: nothing reads it to fail a build — `lint-bundle` reports the
    // live size as an informational line and the only consumer that acts on it is the
    // review-on-growth prompt below, which prints and returns.
    domain_expert_size: expertSize,
    verified_at: cj.verified_at || null,
    emitted_files: w.emitted,
    interview_answers: interview,
  };
  w.machine(P('.claude/veriloop/veriloop-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // report
  console.error(`veriloop generate — ${repoName}  (stack: ${cj.stack.join('+')}, has_ui: ${cj.has_ui})`);
  console.error(`  roster: ${roster.experts.map((e) => e.key).join(', ')}`);
  console.error(`  gate:   ${config.gate.map((c) => c.cmd).join('  |  ') || '(none)'}`);
  {
    const b = config.budget;
    const r = (g) => b.models[g] || (b.presets[b.posture][g] || {}).model || 'session';
    console.error(`  budget: posture=${b.posture} — ${PHASE_GROUPS.map((g) => `${g}:${r(g)}`).join(' ')}`);
  }
  if (config.e2e) console.error(`  e2e/screenshot: ${config.e2e.cmd}`);
  if (references) console.error(`  domain: references ${references.verified} verified / ${references.unverified} unverified (reachable: ${references.reachable})`);
  console.error('  emitted:');
  for (const f of w.emitted) console.error(`    [${f.ownership}/${f.status}] ${f.path}`);
  console.error(`  backups (if any): .claude/veriloop/.backups/`);
  // REVIEW-ON-GROWTH PROMPT (see EXPERT_GROWTH_MARGIN above). Printed, never enforced:
  // this branch has no `process.exit`, no non-zero status, and no effect on anything the
  // gate reads. A run that prints it and a run that does not are the same run to every
  // caller. `priorExpertSize.words > 0` guards the ratio — a zero-word baseline is not a
  // 100%-growth event, it is a bundle with nothing to compare against.
  if (expertSize && priorExpertSize && priorExpertSize.words > 0 && expertSize.words > priorExpertSize.words * (1 + EXPERT_GROWTH_MARGIN)) {
    const pct = Math.round((expertSize.words / priorExpertSize.words - 1) * 100);
    const bar = '='.repeat(72);
    console.error('');
    console.error(`  ${bar}`);
    console.error('  REVIEW PROMPT — .claude/veriloop/domain/expert.md GREW. Please re-read it.');
    console.error(`  ${bar}`);
    console.error(`    was:   ${priorExpertSize.words} words / ${priorExpertSize.bytes} bytes`);
    console.error(`    now:   ${expertSize.words} words / ${expertSize.bytes} bytes`);
    console.error(`    delta: +${expertSize.words - priorExpertSize.words} words (+${pct}%, past the ${Math.round(EXPERT_GROWTH_MARGIN * 100)}% review margin)`);
    console.error('');
    console.error('    This file is adopted VERBATIM by every /advise consult and by four stance');
    console.error('    subagents, so every word is a word all five seats pay for. Longer personas');
    console.error('    measurably damage more (persona-debate-verdict.md:26). Read the new text and');
    console.error('    cut what does not earn its place — edit domain.json, then re-generate.');
    console.error('');
    console.error('    This is a PROMPT, not a limit: there is no length cap, nothing failed, and');
    console.error('    this run\'s exit status is exactly what it would be without this notice.');
    console.error(`  ${bar}`);
  }
  // Preserve-or-write, reported. veriloop never merges an existing settings.json, so the
  // routing hook is NOT wired for this adopter until they merge the entry themselves.
  // Printed AFTER the emitted list so it is the last thing on stderr and cannot scroll off.
  //
  // Gated on `!settingsWired` — CONTENT, not existence. `handOnce` preserves any file that
  // already exists, so from run 2 on veriloop's OWN settings.json is "existing" too: an
  // existence-keyed gate printed "routing is NOT wired" about a file veriloop wrote and
  // lint-bundle check 8 reported as wired IN THE SAME TREE, on this repo, on every
  // regenerate. Two veriloop surfaces publishing contradictory facts is the failure; the
  // owner-visible cost is worse — believe the paste instruction, paste, and you have a
  // DUPLICATED SessionStart array injecting the payload twice.
  //
  // Gated on `!args.force` as well: `handOnce` honors `force`, so a --force run REPLACES the
  // adopter's settings.json — printing "veriloop did NOT modify your settings.json" there
  // would be veriloop's own output lying about veriloop's own write, contradicted three lines
  // above by `[starter/written] .claude/settings.json`.
  //
  // What is printed is a COMPLETE settings.json, not a fragment, and it says so: an adopter
  // whose file already has a top-level `hooks` key and who pastes this verbatim ends up with
  // two `hooks` keys — last-wins in most parsers, silently discarding their existing hooks.
  // That is exactly the corruption preserve-or-write exists to prevent, so the instruction
  // must not re-introduce it.
  if (settingsExisted && !settingsWired && !args.force) {
    console.error('');
    console.error('  veriloop did NOT modify your settings.json — routing is NOT wired until you merge');
    console.error('  the SessionStart entry below into your own file. This is a COMPLETE settings.json:');
    console.error('  if yours already has a top-level "hooks" key, copy the SessionStart array INTO it');
    console.error('  rather than pasting a second "hooks" key.');
    console.error('  --- 8< --- settings.json ---');
    console.error(renderClaudeSettings().trimEnd());
    console.error('  --- >8 --- settings.json ---');
  } else if (settingsExisted && args.force) {
    console.error('');
    console.error('  veriloop REPLACED your existing .claude/settings.json (--force) — the previous');
    console.error('  file is in .claude/veriloop/.backups/. Anything it held (permissions, env,');
    console.error('  statusLine, model) is NOT carried over; the new file is the hook entry alone.');
  }
  // The remaining case — the file exists AND already wires veriloop's hook — prints nothing:
  // `[starter/preserved] .claude/settings.json` in the list above is the whole truth, and a
  // paste instruction here would be an instruction to duplicate the entry.
}

main();

// ---------------------------------------------------------------------------
// Cargo target-dir sharing (used by `buildDepsSetup` above).
//
// These are FUNCTION DECLARATIONS, and they live at the very bottom on purpose:
// declarations hoist, so `buildDepsSetup` resolves them fine, and defining them
// here shifts NO line above — this file is cited by `file:line` from the
// constitution, both hand-owned `*.overrides.md` files, `interview.json`, the
// manifest, SECURITY.md and README.md, and the first draft of this change moved
// `machine`/`handOnce`/`spliceBlock`/`backup` far enough to rot six of them.
//
// WHY THIS EXISTS: cargo writes its build tree to `<cwd>/target`, so a per-feature
// worktree compiled its OWN copy and nothing ever reclaimed it. Measured before the
// fix: four worktrees of one repo held 5.2 GB of duplicate `target/` on top of the
// main checkout's 1.4 GB. The node branch had always avoided the equivalent by
// symlinking `node_modules`; cargo had nothing, and a rust-PRIMARY repo fell through
// to a generic branch that never mentioned cargo at all.
// ---------------------------------------------------------------------------

/** The shared-target instruction. States the lock tradeoff rather than hiding it. */
function cargoShare() {
  return (
    ' Before any `cargo` or `maturin` command in the worktree, `export CARGO_TARGET_DIR=$REPO/target`' +
    ' so every worktree SHARES one build directory instead of compiling its own (~1.3 GB apiece) —' +
    ' cargo locks it, so concurrent worktree builds serialize rather than corrupt each other.'
  );
}

/** Rust as the primary stack OR as a maturin extension alongside python. */
function usesCargo(cj) {
  return cj.stack.includes('rust') || (cj.polyglot || []).some((p) => /rust|maturin/i.test(p));
}

// ---------------------------------------------------------------------------
// resolve-to-clean (spec `.claude/veriloop/specs/resolve-to-clean.md`, D1 + D6).
//
// FUNCTION DECLARATIONS at the foot of the file for the reason stated above: this
// file is cited by `file:line` from the constitution, both hand-owned
// `*.overrides.md`, `interview.json`, the manifest, SECURITY.md and README.md, and
// declarations hoist, so nothing above them moves.
// ---------------------------------------------------------------------------

/**
 * D1. The repo's DEFAULT resolve mode. Fails the BUILD on an unrecognized value —
 * the same posture as an unknown posture or model name: never emit a loop that
 * silently runs a different mode than the interview asked for.
 */
function buildResolveDefault(interview) {
  const v = interview.resolve_default;
  if (v === undefined || v === null) return 'blockers';
  if (v !== 'blockers' && v !== 'clean') {
    throw new Error(`interview.resolve_default: '${v}' is not one of blockers | clean`);
  }
  return v;
}

/**
 * The classes the protected-path guard covers, in the order the spec's D6 lists them.
 * `deletionsOnly` classes hard-stop only on a REMOVAL — a fix pass must still be able
 * to ADD the selftest assertion constitution rule 3 demands.
 *
 * A FUNCTION, not a `const`: everything in this trailer is reached from `main()`, which
 * runs above it, and only declarations hoist. NOT exported: `main()` runs at import
 * time, so nothing may import this module — the selftest reads the GENERATED manifest
 * instead, which is the same source of truth one step downstream.
 */
function protectedClasses() {
  return ['constitution', 'personas', 'overrides', 'interview', 'gate-defs', 'binding-spec', 'history', 'hostile-fixtures', 'selftest', 'session-hook'];
}

/**
 * D6. Derive the guard's path list AT GENERATE TIME, per host repo, REPO-RELATIVE only
 * (constitution rule 7 — emitted artifacts are portable). A trailing `/` means "this
 * prefix"; anything else is an exact path.
 *
 * A class that derives EMPTY on this repo is still recorded, with `path: null`, so the
 * manifest and the workflow both say plainly which classes the guard does NOT cover
 * here. The guard skips a null path; it never implies coverage it lacks.
 */
function deriveProtectedPaths(repo, config) {
  const found = [];
  const add = (path, cls, deletionsOnly = false) => found.push({ path, class: cls, deletionsOnly });
  add(config.constitution, 'constitution');
  for (const e of config.experts) { add(e.file, 'personas'); add(e.overrides, 'overrides'); }
  add('.claude/veriloop/interview.json', 'interview');
  // the gate's own definitions: the detected commands and the emitted manifest
  add('.claude/veriloop/commands.json', 'gate-defs');
  add('.claude/veriloop/veriloop-manifest.json', 'gate-defs');
  add('.claude/veriloop/specs/', 'binding-spec');
  add('.claude/veriloop/history/', 'history');
  if (existsSync(join(repo, 'fixtures/hostile-ci'))) add('fixtures/hostile-ci/', 'hostile-fixtures');
  const selftest = resolveSelftestPath(repo, config.gate);
  if (selftest) add(selftest, 'selftest', true);
  // The SessionStart surface. It decides what every future session in this repo reads before
  // it reads anything else, so a fix pass editing it edits the next agent's instructions —
  // the same authority the constitution has, reached by a different door. NOT deletions-only:
  // an EDIT to the matcher or to the routing payload is the whole attack, and a deletion is
  // the least of it. Derived from the renderer's own exported constants rather than re-typed,
  // so a rename in render.mjs moves the guard with it instead of silently disarming it;
  // `settings.local.json` has no constant of its own and is derived as `CLAUDE_SETTINGS`'s
  // sibling for exactly that reason.
  add(CLAUDE_SETTINGS, 'session-hook');
  add(CLAUDE_SETTINGS.replace(/settings\.json$/, 'settings.local.json'), 'session-hook');
  add(SESSION_HOOK_SCRIPT, 'session-hook');
  add(SESSION_ROUTING_DOC, 'session-hook');
  // record every class, including the ones that derived nothing here
  for (const cls of protectedClasses()) {
    if (!found.some((p) => p.class === cls)) found.push({ path: null, class: cls, deletionsOnly: cls === 'selftest' });
  }
  return found;
}

/**
 * Resolve the repo's TEST script to an in-repo file that exists — the `selftest` class.
 * The gate command is usually a wrapper (`npm test`), so it is followed through
 * `package.json` scripts once, then scanned for the first source-file token that
 * resolves on disk. No match ⇒ null ⇒ the class is recorded as empty rather than
 * guessed.
 */
function resolveSelftestPath(repo, gate) {
  const test = (gate || []).find((c) => c.name === 'test');
  if (!test) return null;
  let cmd = test.cmd;
  const wrapper = cmd.match(/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([\w:.-]+)/);
  if (wrapper) {
    try {
      const body = (JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).scripts || {})[wrapper[1]];
      if (body) cmd = body;
    } catch { /* no/unreadable package.json — fall through to the raw command */ }
  }
  for (const raw of cmd.split(/\s+/)) {
    const tok = raw.replace(/^['"]|['"]$/g, '').replace(/^\.\//, '');
    if (!/^[\w./-]+\.(mjs|cjs|js|ts|py|rs)$/.test(tok) || tok.startsWith('..')) continue;
    if (existsSync(join(repo, tok))) return tok;
  }
  return null;
}

/** Rust-primary: no install step needed — the registry cache is already shared. */
function rustDepsSetup() {
  return (
    'cargo resolves dependencies from the registry cache in `$CARGO_HOME`, which is already shared ' +
    'across worktrees, so no install step is needed inside the worktree.' + cargoShare()
  );
}
