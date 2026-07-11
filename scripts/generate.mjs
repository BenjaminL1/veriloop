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
//     --force     overwrite hand-owned files too (default: preserve them)

import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { detectRoster } from './lib/roster.mjs';
import { renderExpert, renderOverrides, renderConstitution, renderCommand, renderAutoBlock, spliceAuto } from './lib/render.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERILOOP_VERSION = '0.1.0';

function parseArgs(argv) {
  const args = { repo: process.cwd(), commands: null, out: null, force: false, interview: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = resolve(argv[++i]);
    else if (a === '--commands') args.commands = resolve(argv[++i]);
    else if (a === '--out') args.out = resolve(argv[++i]);
    else if (a === '--interview') args.interview = resolve(argv[++i]);
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
    if ((cj.polyglot || []).some((p) => /rust|maturin/i.test(p))) {
      s += ` This repo ships a compiled (Rust/maturin) extension — also run \`${build && /maturin|rust/.test(build) ? build : 'maturin develop --release'}\` in the worktree so the extension is importable.`;
    }
    return s;
  }
  return install ? `run \`${install}\` inside the worktree so its dependencies resolve.` : 'make the repo\'s dependencies available inside the worktree.';
}

function buildRiskTiers(cj, roster) {
  const high = new Set(['migration', 'schema', 'auth', 'database', 'secret', 'token', 'password', 'rls', 'sql', 'permission', 'payment', 'deploy', 'access', 'crypto']);
  if (roster.experts.some((e) => e.key === 'drift')) ['engine', 'rules', 'parity', 'oracle', 'reward', 'rng', 'obs', 'conformance', 'fixture', 'protocol', 'contract', 'algorithm'].forEach((k) => high.add(k));
  const trivial = ['docs', 'readme', 'comment', 'typo', 'style', 'css', 'format', 'changelog', 'whitespace', 'copy'];
  return { high: [...high], trivial };
}

function buildConfig(cj, roster, repoName, interview = {}) {
  const gateOrder = ['typecheck', 'lint', 'test'];
  const gate = gateOrder
    .map((k) => cj.commands[k] && { name: k, cmd: cj.commands[k].cmd, verified: cj.commands[k].verified, ci: cj.commands[k].verified_by_ci })
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
    description: `Per-feature dev loop for ${repoName}: plan(vs constitution) -> triage -> worktree implement -> risk-tiered gate(real exit-code checks + review lenses${hasUi ? ' + screenshot' : ''}) -> bounded auto-fix -> docs sync -> push preview. Stops before merge.`,
    phases: [
      { title: 'Plan', detail: 'design + baseline review vs constitution + risk triage' },
      { title: 'Implement', detail: 'build in an isolated git worktree' },
      { title: 'Gate', detail: 'real exit-code checks + review lenses (depth by tier)' },
      { title: 'Fix', detail: 'bounded auto-fix of blockers (<=3 passes)' },
      { title: 'Land', detail: 'docs sync + push branch/preview (no merge)' },
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

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.commands) {
    console.log('Usage: node generate.mjs --repo <path> --commands <commands.json> [--out <dir>] [--force]');
    return;
  }
  const cj = JSON.parse(readFileSync(args.commands, 'utf8'));
  const repoName = kebab(basename(args.repo));
  const roster = detectRoster(args.repo, cj);
  // interview answers: prior manifest's answers survive a re-run; a --interview
  // file merges over them. They are USER data — never silently reset.
  let interview = {};
  const priorManifestPath = join(args.out, '.claude/veriloop/veriloop-manifest.json');
  if (existsSync(priorManifestPath)) {
    try { interview = JSON.parse(readFileSync(priorManifestPath, 'utf8')).interview_answers || {}; } catch { /* ignore */ }
  }
  if (args.interview) interview = { ...interview, ...JSON.parse(readFileSync(args.interview, 'utf8')) };
  const config = buildConfig(cj, roster, repoName, interview);
  const meta = buildMeta(repoName, cj.has_ui);

  const template = readFileSync(join(HERE, 'templates/dev-loop.template.js'), 'utf8');
  const workflow = spliceAuto(template, renderAutoBlock(meta, config));

  const w = makeWriter(args.out, args.force);
  const P = (...p) => join(args.out, ...p);

  // machine-owned artifacts
  w.machine(P('.claude/workflows', `${repoName}-dev-loop.js`), workflow);
  w.machine(P('.claude/commands/dev-loop.md'), renderCommand({ repoName, roster, commandsJson: cj }));
  w.machine(P('.claude/veriloop/commands.json'), JSON.stringify(cj, null, 2) + '\n');
  for (const e of roster.experts) {
    const slug = expertSlug(e.key);
    w.machine(P('.claude/veriloop/experts', `${slug}.md`), renderExpert(e.key, { repoName, stack: cj.stack, gate: config.gate, constitutionPath: config.constitution, title: e.title }));
    // hand-owned override sibling (write-once)
    w.handOnce(P('.claude/veriloop/experts', `${slug}.overrides.md`), renderOverrides(e.key, e.title, repoName), 'hand');
  }
  // hand-owned constitution (starter; three-way-merged on future re-runs)
  w.handOnce(P('.claude/veriloop/constitution.md'), renderConstitution({ repoName, stack: cj.stack, commandsJson: cj, roster }), 'starter');

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
    e2e: config.e2e,
    commands_summary: Object.fromEntries(Object.entries(cj.commands).map(([k, c]) => [k, { cmd: c.cmd, safety: c.safety, verified: c.verified, verified_by_ci: c.verified_by_ci }])),
    verified_at: cj.verified_at || null,
    emitted_files: w.emitted,
    interview_answers: interview,
  };
  w.machine(P('.claude/veriloop/veriloop-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  // report
  console.error(`veriloop generate — ${repoName}  (stack: ${cj.stack.join('+')}, has_ui: ${cj.has_ui})`);
  console.error(`  roster: ${roster.experts.map((e) => e.key).join(', ')}`);
  console.error(`  gate:   ${config.gate.map((c) => c.cmd).join('  |  ') || '(none)'}`);
  if (config.e2e) console.error(`  e2e/screenshot: ${config.e2e.cmd}`);
  console.error('  emitted:');
  for (const f of w.emitted) console.error(`    [${f.ownership}/${f.status}] ${f.path}`);
  console.error(`  backups (if any): .claude/veriloop/.backups/`);
}

main();
