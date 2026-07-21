#!/usr/bin/env node
// veriloop deterministic self-test. Runs detectCommands over the checked-in
// fixtures under fixtures/ and asserts the audit-fix behaviors (pnpm workspaces,
// headless-backend has_ui, hostile-CI rejection, verify skip/reset semantics,
// CI adopt path, and the Rust/cargo detector — rust-workspace / rust-maturin).
// Dependency-free; never executes anything from fixtures/hostile-ci/ or the
// Rust fixtures (scan-only covenant — the .rs / cargo lines are input, not code).
//
// Usage: node scripts/selftest.mjs   → prints one line per assertion, exits 1 on any FAIL.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { detectCommands } from './lib/detectors.mjs';
import { compileMinedQuery, runMinedQuery } from './lib/mined-query.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');
const verifyPath = join(here, 'verify.mjs');
const generatePath = join(here, 'generate.mjs');
const lintPath = join(here, 'lint-bundle.mjs');
const scanPath = join(here, 'scan.mjs');
const minePath = join(here, 'mine.mjs');

let pass = 0;
let fail = 0;
function assert(cond, desc) {
  if (cond) {
    pass++;
    console.log(`ok   - ${desc}`);
  } else {
    fail++;
    console.log(`FAIL - ${desc}`);
  }
}

// --- pnpm-mono ---
{
  const cj = detectCommands(join(fixtures, 'pnpm-mono'));
  assert(cj.package_manager === 'pnpm', "pnpm-mono: package_manager === 'pnpm'");
  assert(cj.scopes.length === 1, 'pnpm-mono: exactly one scope');
  assert(
    cj.scopes[0] && cj.scopes[0].commands.lint === 'pnpm --filter @fix/app run lint',
    "pnpm-mono: scope lint === 'pnpm --filter @fix/app run lint'",
  );
  assert(cj.has_ui === true, 'pnpm-mono: has_ui === true (react in leaf workspace)');
  assert(
    cj.commands.test_single && cj.commands.test_single.cmd === '(cd packages/app && npx vitest run <file>)',
    "pnpm-mono: test_single === '(cd packages/app && npx vitest run <file>)'",
  );
}

// --- fastapi-api ---
{
  const cj = detectCommands(join(fixtures, 'fastapi-api'));
  assert(cj.has_ui === false, 'fastapi-api: has_ui === false (headless backend, no screenshot gate)');
  assert(
    cj.commands.lint && cj.commands.lint.cmd.startsWith('ruff check'),
    "fastapi-api: lint starts with 'ruff check'",
  );
}

// --- hostile-ci (scan ONLY — never execute anything from this fixture) ---
{
  const cj = detectCommands(join(fixtures, 'hostile-ci'));
  assert(cj.commands.typecheck === undefined, 'hostile-ci: typecheck not adopted (unclean $() and && CI lines)');
  assert(cj.commands.lint === undefined, 'hostile-ci: lint not adopted (joined eslint line has a backtick)');
  const cmdVals = Object.values(cj.commands).map((c) => c.cmd);
  assert(
    !cmdVals.some((c) => c.includes('$(') || c.includes('`')),
    'hostile-ci: no command value contains $( or a backtick',
  );
  const ci = cj.ci_commands.map((c) => c.cmd);
  assert(
    ci.some((c) => c.includes('--max-warnings 0')),
    'hostile-ci: a ci_commands entry has --max-warnings 0 (A10 joined the eslint continuation)',
  );
  assert(
    !ci.some((c) => c === '\\' || c.endsWith('\\')),
    'hostile-ci: no ci_commands entry is a bare or trailing backslash',
  );
}

// --- verify.mjs skip/reset semantics (synthesized; only node -e one-liners run) ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-selftest-'));
  const cjPath = join(tmp, 'commands.json');
  const commands = {
    veriloop_schema: 1,
    repo_root: '.',
    commands: {
      test: {
        cmd: 'node -e "process.exit(0)"',
        cwd: '.',
        source: 'selftest',
        from: 'node',
        safety: 'ask',
        verified_by_ci: false,
        verified: null,
      },
      lint: {
        cmd: "node -e \"console.error('x'); process.exit(1)\"",
        cwd: '.',
        source: 'selftest',
        from: 'node',
        safety: 'safe',
        verified_by_ci: false,
        verified: null,
      },
    },
  };
  writeFileSync(cjPath, JSON.stringify(commands, null, 2) + '\n');

  // Run 1: include test → test runs (pass), lint is safe (runs, fails).
  spawnSync(process.execPath, [verifyPath, '--repo', tmp, '--commands', cjPath, '--include', 'test'], {
    encoding: 'utf8',
  });
  let r1 = JSON.parse(readFileSync(cjPath, 'utf8'));
  assert(r1.commands.test.verified === true, 'verify run1: test.verified === true');
  assert(r1.commands.test.verify_exit === 0, 'verify run1: test.verify_exit === 0 (numeric)');
  assert(r1.commands.lint.verified === false, 'verify run1: lint.verified === false');
  assert(typeof r1.commands.lint.verify_tail === 'string' && r1.commands.lint.verify_tail.length > 0,
    'verify run1: lint.verify_tail present');
  assert(!r1.commands.lint.verify_tail.includes(''), 'verify run1: lint.verify_tail has no ESC byte');

  // Run 2: no --include → test becomes ask-tier, not included → SKIP resets its artifacts.
  spawnSync(process.execPath, [verifyPath, '--repo', tmp, '--commands', cjPath], { encoding: 'utf8' });
  let r2 = JSON.parse(readFileSync(cjPath, 'utf8'));
  assert(r2.commands.test.verified === null, 'verify run2: test.verified === null (skip reset)');
  assert(!('verify_exit' in r2.commands.test), "verify run2: 'verify_exit' removed from test");
  assert(r2.commands.test.verify_skipped != null, 'verify run2: test.verify_skipped present');
  assert(r2.commands.lint.verified === false, 'verify run2: lint.verified === false (still runs safe)');
}

// --- generate.mjs gate composition: a non-mutating format check gates; a
//     mutating formatter never does (regression guard for the M1 warm-up fix) ---
{
  const gateOf = (pkgJson) => {
    const tmp = mkdtempSync(join(tmpdir(), 'veriloop-gate-'));
    writeFileSync(join(tmp, 'package.json'), JSON.stringify(pkgJson));
    const cj = detectCommands(tmp);
    const cjPath = join(tmp, 'commands.json');
    writeFileSync(cjPath, JSON.stringify(cj, null, 2));
    spawnSync(process.execPath, [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp], { encoding: 'utf8' });
    const manifest = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8'));
    return manifest.gate_commands.map((c) => c.name);
  };

  const checkGate = gateOf({ name: 'g1', scripts: { typecheck: 'tsc --noEmit', lint: 'eslint .', 'format:check': 'prettier --check .', test: 'vitest run' } });
  assert(checkGate.includes('format'), "generate: non-mutating format:check IS in the gate (name 'format')");
  assert(checkGate.indexOf('format') < checkGate.indexOf('test'), 'generate: format check ordered before test in the gate');

  const writeGate = gateOf({ name: 'g2', scripts: { lint: 'eslint .', format: 'prettier --write .' } });
  assert(!writeGate.includes('format'), 'generate: mutating format --write is NOT in the gate');
}

// --- lint-bundle scopes to veriloop-owned files only: a pre-existing sibling
//     workflow with an absolute path must NOT trip the linter (M1 regression) ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-lint-'));
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'lintscope', scripts: { lint: 'eslint .', test: 'vitest run' } }));
  const cj = detectCommands(tmp);
  const cjPath = join(tmp, 'commands.json');
  writeFileSync(cjPath, JSON.stringify(cj, null, 2));
  spawnSync(process.execPath, [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp], { encoding: 'utf8' });
  // a pre-existing NON-veriloop sibling workflow carrying an absolute path
  writeFileSync(join(tmp, '.claude/workflows/other-advise.js'), "const P = '/Users/someone/x/prompt.md'; export const meta = {};\n");
  const r = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(r.status === 0, 'lint-bundle: passes despite a pre-existing non-emitted sibling workflow with an absolute path');
  assert(!/other-advise/.test((r.stdout || '') + (r.stderr || '')), 'lint-bundle: never inspects the non-emitted sibling file');
}

// --- authoring-budget WARNs: a fresh bundle is within budget (no warning); a
//     fattened persona trips a WARN — never a FAIL (budget discipline, not
//     correctness). ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-budget-'));
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'budget', scripts: { lint: 'eslint .', test: 'vitest run' } }));
  const cj = detectCommands(tmp);
  const cjPath = join(tmp, 'commands.json');
  writeFileSync(cjPath, JSON.stringify(cj, null, 2));
  spawnSync(process.execPath, [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp], { encoding: 'utf8' });

  const fresh = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(fresh.status === 0, 'lint-bundle: a fresh bundle passes');
  assert(!/grew past 700 words/.test(fresh.stdout || ''), 'lint-bundle: a fresh bundle is within the persona word budget (no accretion warning)');

  // fatten one emitted persona (~300 words) well past the 700-word accretion
  // tripwire — ~600 words appended → ~900, still fires
  const persona = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8')).roster[0].file;
  const personaName = persona.split('/').pop().replace(/\.md$/, '');
  writeFileSync(join(tmp, persona), readFileSync(join(tmp, persona), 'utf8') + '\n' + 'word '.repeat(600));

  const fat = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(fat.status === 0, 'lint-bundle: an over-budget persona is a WARN, not a FAIL (still exits 0)');
  assert(
    new RegExp(`persona ${personaName} grew past 700 words \\(\\d+\\)`).test(fat.stdout || ''),
    'lint-bundle: the over-budget persona trips the accretion tripwire naming it',
  );
}

// --- v0.3.0: the experts' second mandate — /advise + /review emitted surfaces,
//     the dual-mandate persona header, and the linter guarding the new commands ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-advise-'));
  // a prettier repo so the .prettierignore exemption block is emitted (and must
  // list both new command paths)
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'adv', scripts: { lint: 'eslint .', 'format:check': 'prettier --check .', test: 'vitest run' } }));
  const cj = detectCommands(tmp);
  const cjPath = join(tmp, 'commands.json');
  writeFileSync(cjPath, JSON.stringify(cj, null, 2));
  spawnSync(process.execPath, [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp], { encoding: 'utf8' });

  const advisePath = join(tmp, '.claude/commands/advise.md');
  const reviewPath = join(tmp, '.claude/commands/review.md');
  assert(existsSync(advisePath), 'generate: /advise command is emitted');
  assert(existsSync(reviewPath), 'generate: /review command is emitted');

  const advise = readFileSync(advisePath, 'utf8');
  const review = readFileSync(reviewPath, 'utf8');
  const descOf = (t) => (t.match(/^description:\s*(.*)$/m) || [])[1] || '';
  const aDesc = descOf(advise), rDesc = descOf(review);
  assert(aDesc.startsWith('Use when') && aDesc.length <= 500, '/advise: description is trigger-first ("Use when") and ≤500 chars');
  assert(rDesc.startsWith('Use when') && rDesc.length <= 500, '/review: description is trigger-first ("Use when") and ≤500 chars');

  // /advise contract: ADVISE mode, read-only, no verdicts (grep-able strings)
  assert(/MODE: ADVISE/.test(advise), '/advise: adopts MODE: ADVISE');
  assert(/READ-ONLY/.test(advise), '/advise: states the read-only limit');
  assert(/never PASS\/FAIL\/approval/.test(advise) && /NEVER\s+substitutes/i.test(advise.replace(/\n/g, ' ')), '/advise: no-verdicts — advice never substitutes for the gate');

  // /review contract: root-cause dedup + not-the-gate/no-verdict
  assert(/deduped by ROOT CAUSE/.test(review), '/review: merges findings deduped by ROOT CAUSE');
  assert(/Advisory, NOT the gate/.test(review) && /no verdict/i.test(review) && /never/i.test(review), '/review: advisory, NOT the gate, produces no verdict and never substitutes for it');

  // the .prettierignore exemption block lists both new command paths
  const pi = readFileSync(join(tmp, '.prettierignore'), 'utf8');
  assert(pi.includes('.claude/commands/advise.md') && pi.includes('.claude/commands/review.md'), 'generate: the .prettierignore block includes both new command paths');

  // the dual-mandate persona header names both modes
  const personaFile = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8')).roster[0].file;
  const persona = readFileSync(join(tmp, personaFile), 'utf8');
  assert(/REVIEW mode/.test(persona) && /ADVISE mode/.test(persona), 'persona header: names both REVIEW mode and ADVISE mode (dual mandate)');

  // the linter guards the new surface: delete /advise after generation → FAIL
  const before = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(before.status === 0, 'lint-bundle: a fresh v0.3.0 bundle passes (0 fail)');
  rmSync(advisePath);
  const after = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(after.status !== 0, 'lint-bundle: FAILS when advise.md is deleted after generation (guards the new command surface)');
}

// --- v0.3.5: /posture — the emitted command that changes a repo's DEFAULT budget
//     posture. Asserts the surface is emitted, its frontmatter is scoped + model-less,
//     the linter guards it, the emitted valid-level list can't drift from BUDGET_PRESETS,
//     the write-covenant instructions are present in emitted text (not narration), and
//     all three lint-bundle command-list sites carry posture.md. ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-posture-'));
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'pst', scripts: { lint: 'eslint .', test: 'vitest run' } }));
  const cj = detectCommands(tmp);
  const cjPath = join(tmp, 'commands.json');
  writeFileSync(cjPath, JSON.stringify(cj, null, 2));
  spawnSync(process.execPath, [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp], { encoding: 'utf8' });

  // (a) posture.md is emitted
  const posturePath = join(tmp, '.claude/commands/posture.md');
  assert(existsSync(posturePath), 'generate: /posture command is emitted');
  const posture = readFileSync(posturePath, 'utf8');

  // (b) frontmatter carries the scoped allowed-tools and NO model: line
  const fm = (posture.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  assert(/description:/.test(fm) && /^description:\s*Use when/m.test(fm), '/posture: frontmatter description is trigger-first ("Use when")');
  assert(/^allowed-tools:\s*Read, Edit, Bash\(node:\*\)\s*$/m.test(fm), '/posture: frontmatter scopes allowed-tools to Read, Edit, Bash(node:*)');
  assert(!/^model:/m.test(fm), '/posture: frontmatter carries NO model: line (posture-setting inherits the session model)');

  // (d) the emitted valid-level list equals the REAL BUDGET_PRESETS keys parsed from
  //     generate.mjs SOURCE (never executed) — the two must not drift (rule 9).
  const genSrc = readFileSync(generatePath, 'utf8');
  const presetStart = genSrc.indexOf('const BUDGET_PRESETS = {');
  const presetBlock = genSrc.slice(presetStart, genSrc.indexOf('\n};', presetStart));
  const presetKeys = [...presetBlock.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]);
  assert(presetKeys.length === 3 && presetKeys.join('|') === 'frugal|balanced|max', 'selftest: BUDGET_PRESETS keys parsed from generate.mjs source (frugal|balanced|max)');
  assert(posture.includes(presetKeys.join(' | ')), '/posture: the emitted valid-level list equals the real BUDGET_PRESETS keys (no drift, rule 9)');

  // (e) the write-covenant instructions live in the emitted command text (grep-able,
  //     binding to emitted text — not narration).
  assert(/Validate FIRST, before any write/.test(posture), '/posture: body carries the validate-before-write instruction');
  assert(/PRESERVE every other key byte-for-byte/.test(posture), '/posture: body carries the preserve-all-other-interview-keys instruction');
  assert(/relative to the\s+veriloop skill directory/.test(posture) && /FAIL GRACEFULLY/.test(posture), '/posture: body carries the skill-relative compiler-locate + graceful-fail instruction');
  assert(/exactly one key/.test(posture) && /budget_posture/.test(posture), '/posture: body states the one-key (budget_posture) write covenant');

  // (f) the single hoisted EMITTED_COMMANDS constant (rule 9) includes posture.md
  const lintSrc = readFileSync(lintPath, 'utf8');
  const emittedConst = (lintSrc.match(/EMITTED_COMMANDS\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
  assert(/'posture\.md'/.test(emittedConst), 'lint-bundle: the EMITTED_COMMANDS constant includes posture.md (one source of truth, rule 9)');

  // (c) the linter guards the new surface: a fresh bundle passes; deleting posture.md → FAIL
  const before = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(before.status === 0, 'lint-bundle: a fresh v0.3.5 bundle passes (0 fail)');
  rmSync(posturePath);
  const after2 = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(after2.status !== 0, 'lint-bundle: FAILS when posture.md is deleted after generation (guards the new command surface)');
}

// --- #9: machine-owned files are exempted from the target repo's format check,
//     and the backups dir is gitignored — via ONE idempotent marked block in each
//     owner-owned ignore file (installing veriloop must not break the host gate) ---
{
  const gen = (dir, pkgJson) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkgJson));
    const cj = detectCommands(dir);
    const cjPath = join(dir, 'commands.json');
    writeFileSync(cjPath, JSON.stringify(cj, null, 2));
    spawnSync(process.execPath, [generatePath, '--repo', dir, '--commands', cjPath, '--out', dir], { encoding: 'utf8' });
  };
  const START = '# <<< veriloop:auto:start >>>';
  // NOTE: the detected command is the WRAPPER (`npm run format:check`) — its text
  // never says "prettier". Prettier must be detected from the script body/deps, so
  // this fixture deliberately starts with NO .prettierignore to seed the answer.
  const prettierPkg = { name: 'p1', scripts: { lint: 'eslint .', 'format:check': 'prettier --check .', test: 'vitest run' } };

  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-ignore-'));
  gen(tmp, prettierPkg);
  const pi1 = readFileSync(join(tmp, '.prettierignore'), 'utf8');
  const gi1 = readFileSync(join(tmp, '.gitignore'), 'utf8');
  assert(pi1.includes(START) && pi1.includes('.claude/veriloop/'), 'generate: prettier repo (wrapper script, no pre-existing .prettierignore) gets the exemption block');
  assert(gi1.includes('.claude/veriloop/.backups/'), 'generate: .gitignore block ignores the .backups/ dir');

  // a repo whose only prettier evidence is a devDependency still counts
  const depOnly = mkdtempSync(join(tmpdir(), 'veriloop-prettierdep-'));
  gen(depOnly, { name: 'p3', scripts: { test: 'vitest run' }, devDependencies: { prettier: '^3.0.0' } });
  assert(existsSync(join(depOnly, '.prettierignore')), 'generate: prettier as a devDependency alone is enough to emit the exemption');

  writeFileSync(join(tmp, '.prettierignore'), 'dist/\n' + readFileSync(join(tmp, '.prettierignore'), 'utf8')); // owner edits above the block
  gen(tmp, prettierPkg); // second run — the block must be replaced, not appended
  const pi2 = readFileSync(join(tmp, '.prettierignore'), 'utf8');
  assert(pi2.split(START).length === 2, 'generate: re-run leaves exactly ONE veriloop block in .prettierignore (idempotent)');
  assert(pi2.includes('dist/'), "re-run: the owner's own line ('dist/') outside the block is preserved");

  const noPrettier = mkdtempSync(join(tmpdir(), 'veriloop-noprettier-'));
  gen(noPrettier, { name: 'p2', scripts: { lint: 'eslint .', test: 'vitest run' } });
  assert(!existsSync(join(noPrettier, '.prettierignore')), 'generate: a repo that does not use prettier gets NO .prettierignore');
}

// --- #8: a check that was already RED on the base tree is a CONCERN, not a
//     blocker — but a NEW failure on top of a red baseline still blocks. The
//     emitted verdict logic is extracted from the real workflow and EXECUTED. ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-verdict-'));
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'vd', scripts: { lint: 'eslint .', test: 'vitest run' } }));
  const cj = detectCommands(tmp);
  const cjPath = join(tmp, 'commands.json');
  writeFileSync(cjPath, JSON.stringify(cj, null, 2));
  spawnSync(process.execPath, [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp], { encoding: 'utf8' });
  // the workflow is named after the repo DIRECTORY (kebab), not package.json
  const repoName = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8')).repo_name;
  const wf = readFileSync(join(tmp, `.claude/workflows/${repoName}-dev-loop.js`), 'utf8');

  const S = '// <<< veriloop:verdict:start >>>';
  const E = '// <<< veriloop:verdict:end >>>';
  const src = wf.slice(wf.indexOf(S) + S.length, wf.indexOf(E));
  assert(wf.includes(S) && wf.includes(E), 'template: emitted workflow carries the veriloop:verdict markers');
  const verdictFrom = new Function(`${src}; return verdictFrom;`)();

  const failed = { checks: [{ name: 'test', command: 'npx vitest run', result: 'fail' }], failingOutput: 'x' };
  const passing = { checks: [{ name: 'test', command: 'npx vitest run', result: 'pass' }], failingOutput: '' };
  const probe = (baseResult, newFailures, cleanedUp = true) => ({ cleanedUp, probes: [{ name: 'test', baseResult, newFailures, evidence: 'e' }] });

  const green = verdictFrom(passing, [], null, null, null, []);
  assert(green.verdict === 'PASS', 'verdict: all checks pass + no findings → PASS');

  const broke = verdictFrom(failed, [], null, null, probe('pass', []), []);
  assert(broke.verdict === 'FAIL', 'verdict: check fails but PASSES on base → FAIL (the change broke it)');

  const preExisting = verdictFrom(failed, [], null, null, probe('fail', []), []);
  assert(preExisting.verdict === 'CONCERNS', 'verdict: check already RED on base, no new failures → CONCERNS, not FAIL');
  assert(
    preExisting.concerns.some((c) => c.includes('[pre-existing]')) && preExisting.blockers.length === 0,
    "verdict: the pre-existing failure is tagged '[pre-existing]' and blocks nothing",
  );

  const regressed = verdictFrom(failed, [], null, null, probe('fail', ['apps/web/x.ts']), []);
  assert(regressed.verdict === 'FAIL', 'verdict: red baseline + NEW failure units → FAIL (regression not masked)');
  assert(
    regressed.blockers.some((b) => b.includes('apps/web/x.ts')),
    'verdict: the blocker names the new failure unit added on top of the red baseline',
  );

  const noProbe = verdictFrom(failed, [], null, null, null, []);
  assert(noProbe.verdict === 'FAIL', 'verdict: failed check with NO baseline probe → FAIL (fail safe)');

  const dirty = verdictFrom(failed, [], null, null, probe('fail', [], false), []);
  assert(dirty.verdict === 'FAIL', 'verdict: probe that did not clean up its worktree is not trusted → FAIL (fail safe)');

  const deadChecks = verdictFrom(passing, [], null, null, null, [], ['checks']);
  assert(
    deadChecks.verdict === 'FAIL' && deadChecks.blockers.some((b) => b.includes('did not return a result')),
    'verdict: a dead checks agent is a BLOCKER, not a silent PASS (fail closed, finding #10)',
  );

  const deadLens = verdictFrom(passing, [], null, null, null, [], ['lens:ux']);
  assert(deadLens.verdict === 'FAIL', 'verdict: a dead review lens blocks — absent evidence is not passing evidence');

  const waivedMissing = verdictFrom(passing, [], null, null, null, ['did not return a result'], ['checks']);
  assert(waivedMissing.verdict === 'WAIVED', 'verdict: only a human waiver may downgrade a missing gate job');

  assert(
    /missingJobs/.test(wf) && /fail closed/.test(wf),
    'template: gate computes missing jobs and fails closed',
  );
  assert(
    /PRE-FLIGHT/.test(wf) && /ZERO authority/.test(wf),
    'template: implementer pre-flight is report-only (the gate ignores its claim)',
  );
  assert(
    /never run a mutating command/.test(wf),
    'template: pre-flight bars mutating commands (the warm-up-corruption guard)',
  );

  assert(
    /\[pre-existing\][^\n]*OUT OF SCOPE/i.test(wf.replace(/\\n/g, '\n')),
    'template: the fix agent is told [pre-existing] concerns are OUT OF SCOPE',
  );
  assert(
    /baseline-probe/.test(wf) && /worktree add[^\n]*--detach/.test(wf),
    'template: the baseline probe uses a detached throwaway worktree (never stash / owner checkout)',
  );
}

// --- spec interview + per-phase model routing ---
{
  const build = (interview) => {
    const tmp = mkdtempSync(join(tmpdir(), 'veriloop-route-'));
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'rt', scripts: { lint: 'eslint .', test: 'vitest run' } }));
    const cj = detectCommands(tmp);
    const cjPath = join(tmp, 'commands.json');
    writeFileSync(cjPath, JSON.stringify(cj, null, 2));
    const argv = [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp];
    if (interview) {
      const ip = join(tmp, 'interview.json');
      writeFileSync(ip, JSON.stringify(interview));
      argv.push('--interview', ip);
    }
    const r = spawnSync(process.execPath, argv, { encoding: 'utf8' });
    return { tmp, r };
  };
  const emitted = (tmp) => {
    const name = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8')).repo_name;
    return readFileSync(join(tmp, `.claude/workflows/${name}-dev-loop.js`), 'utf8');
  };

  // the emitted routeFor is extracted and EXECUTED (same technique as verdictFrom)
  const { tmp } = build(null);
  const wf = emitted(tmp);
  const S = '// <<< veriloop:route:start >>>', E = '// <<< veriloop:route:end >>>';
  const routeFor = new Function(`${wf.slice(wf.indexOf(S) + S.length, wf.indexOf(E))}; return routeFor;`)();
  const budget = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8')).budget;

  assert(budget.posture === 'balanced', 'budget: default posture is balanced');
  assert(routeFor('plan', budget, null, null, null).model === 'opus', 'route: balanced plan → opus');
  assert(routeFor('checks', budget, null, null, null).model === 'haiku', 'route: checks is cheap (haiku) — running commands and reading exit codes is mechanical');
  assert(routeFor('plan', budget, null, null, 'frugal').model === 'sonnet', 'route: per-run posture=frugal downgrades plan → sonnet');
  assert(routeFor('review', budget, null, null, 'max').effort === 'xhigh', 'route: posture=max raises review effort → xhigh');

  // the headline ask: plan on fable, execution on opus
  const split = { plan: 'fable', implement: 'opus' };
  assert(routeFor('plan', budget, split, null, 'frugal').model === 'fable', 'route: explicit per-phase model BEATS the posture preset (plan=fable even under frugal)');
  assert(routeFor('implement', budget, split, null, 'frugal').model === 'opus', 'route: plan-on-fable / implement-on-opus split works');
  assert(routeFor('review', budget, split, null, 'frugal').model === 'sonnet', 'route: groups not overridden still follow the posture');

  // a repo can persist its own routing at install time
  const { tmp: t2, r: r2 } = build({ budget_posture: 'frugal', phase_models: { plan: 'fable', implement: 'opus' } });
  assert(r2.status === 0, 'generate: accepts a budget_posture + phase_models interview');
  const b2 = JSON.parse(readFileSync(join(t2, '.claude/veriloop/veriloop-manifest.json'), 'utf8')).budget;
  assert(b2.posture === 'frugal' && b2.models.plan === 'fable' && b2.models.implement === 'opus', 'budget: interview routing persists into the manifest');
  assert(routeFor('plan', b2, null, null, null).model === 'fable', 'route: the repo\'s configured plan model wins with no per-run args');

  // build-time validation: never emit a loop that dies mid-run on a bad model name
  const bad = build({ phase_models: { plan: 'gpt-5' } });
  assert(bad.r.status !== 0 && /not one of/.test(bad.r.stderr || ''), 'generate: an unknown model FAILS THE BUILD (fail fast, not mid-run)');
  const badPosture = build({ budget_posture: 'cheap' });
  assert(badPosture.r.status !== 0, 'generate: an unknown posture fails the build');
  const badGroup = build({ phase_models: { planning: 'opus' } });
  assert(badGroup.r.status !== 0, 'generate: an unknown phase group fails the build');

  // INVARIANT: a cost dial must never be able to skip a verification job.
  const gateBody = wf.slice(wf.indexOf('async function gate('), wf.indexOf('const digest ='));
  assert(
    !/posture|budget|route\(/.test(gateBody.replace(/\.\.\.route\('(review|checks)'\)/g, '')),
    'invariant: which gate jobs run is NOT a function of posture/budget — routing only sets each job\'s model',
  );
  assert(
    /jobs = \[\{ key: 'checks'/.test(gateBody),
    'invariant: the real exit-code checks always run, at every posture',
  );

  // EVERY agent call must be routed — an unrouted one silently ignores the cost
  // dial (this caught `implement`, the very phase the model split exists for).
  const agentCalls = (wf.match(/\bagent\(/g) || []).length;
  const routed = (wf.match(/\.\.\.route\('/g) || []).length;
  assert(agentCalls === routed, `routing covers every agent call (${routed}/${agentCalls} routed)`);
  assert(/label: 'implement'[^\n]*route\('implement'\)/.test(wf), "routing: the implement agent is on the 'implement' group (the execution model)");

  // report phase: the run compresses ITSELF, inside the loop
  assert(routeFor('report', budget, null, null, null).model === 'sonnet', 'route: balanced report → sonnet (compression, not judgment)');
  assert(routeFor('report', budget, null, null, 'frugal').model === 'haiku', 'route: frugal report → haiku');
  assert(/label: 'report'[^\n]*route\('report'\)/.test(wf), 'template: the report agent is routed on its own group');
  assert(/Dedup by ROOT CAUSE, not by lens/.test(wf), 'report: findings are deduped by root cause, not repeated per lens');
  assert(/invent no findings, soften no severity, and drop no blocker or concern/.test(wf), 'report: summarizing is not reviewing — lossless on decision-relevant facts');
  assert(/\bbrief,/.test(wf) && /BRIEF_SCHEMA/.test(wf), 'template: the brief is returned as a structured result field');
  const cmdBrief = readFileSync(join(tmp, '.claude/commands/dev-loop.md'), 'utf8');
  assert(/do not re-summarize it/i.test(cmdBrief), '/dev-loop: the command presents the brief verbatim (no second lossy compression)');

  // spec plumbing
  assert(/OWNER'S SPEC/.test(wf) && /args\.spec|a\.spec/.test(wf), 'template: an owner spec is threaded into the loop');
  assert(/do not re-litigate or silently substitute/.test(wf), 'template: the spec is BINDING on the planner/implementer');
  const cmd = readFileSync(join(tmp, '.claude/commands/dev-loop.md'), 'utf8');
  assert(/AskUserQuestion/.test(cmd) && /cannot ask the owner anything/.test(cmd), '/dev-loop: the confirmation runs in the COMMAND layer (the workflow cannot ask questions)');
  assert(/Spec detection/.test(cmd) && /Confirm-and-go/.test(cmd), '/dev-loop: Step 1 is spec detection with a trivial confirm-and-go path (no interview)');
  assert(/plan: "fable", implement: "opus"/.test(cmd), '/dev-loop: documents the per-phase model split');
}

// --- v0.3.1 (finding #11): interview `roster_add` reaches the generator — the
//     LLM-refined, owner-confirmed roster the detector missed. Additions default to
//     roster.mjs's title/tiers, run BEFORE risk tiers, cap at 4, require evidence,
//     reject unknown keys, and MERGE (never duplicate) a key the detector elected. ---
{
  const gen = (dir, interviewObj) => {
    const cj = detectCommands(dir);
    const cjPath = join(dir, 'commands.json');
    writeFileSync(cjPath, JSON.stringify(cj, null, 2));
    const argv = [generatePath, '--repo', dir, '--commands', cjPath, '--out', dir];
    if (interviewObj) {
      const ip = join(dir, 'interview.json');
      writeFileSync(ip, JSON.stringify(interviewObj));
      argv.push('--interview', ip);
    }
    return spawnSync(process.execPath, argv, { encoding: 'utf8' });
  };

  // 1. bare node repo (no auth/db/parity signals) — the owner adds security + drift.
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-rosteradd-'));
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'bare', scripts: { lint: 'eslint .', test: 'vitest run' } }));
  const r = gen(tmp, { roster_add: [
    { key: 'security', title: 'Supply-Chain Reviewer', evidence: ['parses untrusted CI text'] },
    { key: 'drift', evidence: ['machine/hand ownership promises'] },
  ] });
  assert(r.status === 0, 'roster_add: a valid add generates cleanly (exit 0)');
  const manifest = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8'));
  const keys = manifest.roster.map((e) => e.key);
  assert(keys.length === 3 && keys.includes('code-review') && keys.includes('security') && keys.includes('drift'),
    'roster_add: manifest roster is code-review + security + drift (the two owner-added specialists)');
  assert(existsSync(join(tmp, '.claude/veriloop/experts/security.md')) && existsSync(join(tmp, '.claude/veriloop/experts/drift.md')),
    'roster_add: both added persona files exist on disk');
  const driftEntry = manifest.roster.find((e) => e.key === 'drift');
  assert(driftEntry.title === 'Drift Sentinel', "roster_add: an add with no title inherits roster.mjs's default (Drift Sentinel)");
  const wf = readFileSync(join(tmp, `.claude/workflows/${manifest.repo_name}-dev-loop.js`), 'utf8');
  const riskBlob = wf.slice(wf.indexOf('"riskTiers"'), wf.indexOf('"riskTiers"') + 600);
  assert(/"(oracle|parity)"/.test(riskBlob),
    'roster_add: risk tiers carry a drift-conditional keyword — proving roster_add ran BEFORE buildRiskTiers');

  // 2. unknown key → the build FAILS FAST, naming the valid keys.
  const bad = mkdtempSync(join(tmpdir(), 'veriloop-rosterbad-'));
  writeFileSync(join(bad, 'package.json'), JSON.stringify({ name: 'bad', scripts: { test: 'vitest run' } }));
  const rBad = gen(bad, { roster_add: [{ key: 'typescript', evidence: ['x'] }] });
  assert(rBad.status !== 0 && /security \| drift \| ux/.test(rBad.stderr || ''),
    'roster_add: an unknown key FAILS THE BUILD and lists the valid keys');

  // 3. missing evidence → the build fails (the roster covenant: every expert carries evidence).
  const noEv = mkdtempSync(join(tmpdir(), 'veriloop-rosternoev-'));
  writeFileSync(join(noEv, 'package.json'), JSON.stringify({ name: 'noev', scripts: { test: 'vitest run' } }));
  const rNoEv = gen(noEv, { roster_add: [{ key: 'security' }] });
  assert(rNoEv.status !== 0 && /evidence is required/.test(rNoEv.stderr || ''),
    'roster_add: an add with no evidence FAILS THE BUILD');

  // 4. adding a key the DETECTOR already elected merges (does not duplicate).
  const dup = mkdtempSync(join(tmpdir(), 'veriloop-rosterdup-'));
  writeFileSync(join(dup, 'package.json'), JSON.stringify({ name: 'dup', scripts: { test: 'vitest run' } }));
  mkdirSync(join(dup, 'supabase'), { recursive: true }); // concrete surface → detector self-elects security
  const rDup = gen(dup, { roster_add: [{ key: 'security', evidence: ['owner reconfirms the auth surface'] }] });
  assert(rDup.status === 0, 'roster_add: re-adding a self-elected key generates cleanly');
  const mDup = JSON.parse(readFileSync(join(dup, '.claude/veriloop/veriloop-manifest.json'), 'utf8'));
  const secEntries = mDup.roster.filter((e) => e.key === 'security');
  assert(secEntries.length === 1, 'roster_add: re-adding a detector-elected key does NOT duplicate the expert');
  assert(secEntries[0].evidence.some((e) => /^owner-confirmed: owner reconfirms the auth surface/.test(e)),
    'roster_add: the owner evidence is MERGED into the existing entry (prefixed owner-confirmed:)');
}

// --- ci-adopt: the CI adopt path — veriloop's flagship surface — proven by what
//     it ADOPTS, not only what it rejects (hostile-ci covers rejection). Each
//     assertion binds to the detector's DECISION (from / verified_by_ci / source /
//     presence), never merely to parse output.
//
// ci-adopt is the ONLY evidence for the adopt path — never cite veriloop's own
// self-install/manifest as proof it works (see fix-8-9-plan.md v0.1.2 lesson): a
// fixture supplies INPUT (a CI file); the assertions interrogate the detector's
// decision. Scan-only — nothing here is ever executed (same covenant as every fixture).
{
  const cj = detectCommands(join(fixtures, 'ci-adopt'));
  const C = cj.commands;
  const ci = cj.ci_commands;
  const findCi = (cmd) => ci.find((c) => c.cmd === cmd);

  // path 0 — clean CI line that IS a local script: the local candidate is
  // preferred (keeps its richer citation), and it is CI-verified.
  assert(
    C.install && C.install.cmd === 'npm install' && C.install.from === 'node' && C.install.verified_by_ci === true,
    "ci-adopt path0 (local-same): install chosen local ('npm install'), from:node, verified_by_ci:true",
  );
  // path 0 — clean CI line with NO literal-same local: the CI form is ADOPTED
  // (ground truth), carrying from:'ci' and a `file:line (CI)` source.
  assert(
    C.typecheck && C.typecheck.from === 'ci' && C.typecheck.verified_by_ci === true,
    'ci-adopt path0 (CI-adopted): typecheck adopts the clean CI form, from:ci, verified_by_ci:true',
  );
  assert(
    C.typecheck && C.typecheck.cmd === 'tsc --noEmit' && C.typecheck.source === '.github/workflows/ci.yml:8 (CI)',
    "ci-adopt path0 (CI-adopted): typecheck cmd is the CI line 'tsc --noEmit' cited at ci.yml:8 (CI)",
  );
  // path 1 — a local candidate that an UNCLEAN (but benign) CI line provably runs
  // (shares tool): the local form stays chosen, marked CI-verified.
  assert(
    C.lint && C.lint.cmd === 'npm run lint' && C.lint.from === 'node' && C.lint.verified_by_ci === true,
    "ci-adopt path1: lint stays local ('npm run lint'), verified_by_ci:true (unclean CI shares the tool)",
  );
  // path 2 — first local candidate; verified_by_ci reflects a sharesTool CI match.
  assert(
    C.format && C.format.from === 'node' && C.format.verified_by_ci === true,
    'ci-adopt path2 (true): format is local but a sharesTool CI line marks it verified_by_ci:true',
  );
  assert(
    C.test && C.test.from === 'node' && C.test.verified_by_ci === false,
    'ci-adopt path2 (false): test is local with no CI match → verified_by_ci:false',
  );
  // CI-only adopt — a category with NO local candidate adopts a clean CI-only
  // line. This is decided at reconcile() step 0 (`localSame || {…from:'ci'}`),
  // NOT the step-3 block, which is unreachable (see detectors.mjs:467 note).
  // Regression protection holds regardless of which arm adopts: both gate on the
  // same isCleanInvocation predicate, so over-tightening it fails these asserts.
  assert(
    C.e2e && C.e2e.from === 'ci' && C.e2e.verified_by_ci === true && C.e2e.cmd === 'make test-integration',
    "ci-adopt CI-only adopt: e2e (no local) adopts clean CI-only 'make test-integration', from:ci, verified",
  );
  assert(
    C.e2e && C.e2e.source === '.github/workflows/ci.yml:16 (CI)',
    'ci-adopt CI-only adopt: the adopted e2e command cites its real CI line — ci.yml:16 (CI)',
  );
  // CI-only reject — build has no local candidate and its only CI line
  // (`node node_modules/.bin/next build …`, ci.yml:14) is UNCLEAN: `node <path>`
  // is not a recognized clean entrypoint (isCleanInvocation whitelist), so it is
  // never adopted and build is absent. Deliberately unclean-by-entrypoint, not
  // compound-shell — this fixture stays free of shell metacharacters (`&&`, `$()`);
  // rejecting genuinely hostile shell is fixtures/hostile-ci/'s job.
  assert(
    C.build === undefined,
    'ci-adopt CI-only reject: a no-local category whose only CI line is unclean is ABSENT from commands',
  );

  // parsing — the awkward YAML constructs each surface in ci_commands with the
  // correct file:line (a line-number or parser regression fails here).
  // finding 'tsc --noEmit' (not '"tsc --noEmit"') by exact match already proves
  // unquote ran — a regression leaves the quotes on and this lookup returns undefined.
  const q = findCi('tsc --noEmit');
  assert(
    q && q.source === '.github/workflows/ci.yml:8',
    'ci-adopt parse: quoted-inline run is UNQUOTED in ci_commands at ci.yml:8 (unquote)',
  );
  const fld = findCi('prettier --check .');
  assert(
    fld && fld.source === '.github/workflows/ci.yml:12',
    'ci-adopt parse: folded-scalar (>-) command extracted at ci.yml:12 (block scalar)',
  );
  const joined = findCi('node node_modules/.bin/next build --no-lint');
  assert(
    joined && joined.source === '.github/workflows/ci.yml:14',
    'ci-adopt parse: backslash line-continuation lines are joined into one command at ci.yml:14',
  );
}

// --- Step 5: attestation auto-emission. The redaction+record routine is EXTRACTED
//     from the emitted workflow and EXECUTED against a synthetic evidence object built
//     inline here (constitution rule 3: the fixture must never supply the evidence under
//     test). Asserts (a) exactly one history record, (b) it parses with the required spec
//     keys, (c) a clean record carries no absolute path, and (d) a poisoned input
//     (/Users, /home, C:\ across tail/summary/screenshots) comes out fully redacted —
//     constitution rule 7, using the same ABS regex AND SECRET_PATTERNS array that
//     lint-bundle.mjs's committed-history backstop scans committed records with. ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-emit-'));
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'emit', scripts: { lint: 'eslint .', test: 'vitest run' } }));
  const cj = detectCommands(tmp);
  const cjPath = join(tmp, 'commands.json');
  writeFileSync(cjPath, JSON.stringify(cj, null, 2));
  spawnSync(process.execPath, [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp], { encoding: 'utf8' });
  const repoName = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8')).repo_name;
  const wf = readFileSync(join(tmp, `.claude/workflows/${repoName}-dev-loop.js`), 'utf8');

  const S = '// <<< veriloop:emit:start >>>';
  const E = '// <<< veriloop:emit:end >>>';
  assert(wf.includes(S) && wf.includes(E), 'template: emitted workflow carries the veriloop:emit markers');
  const attestationFrom = new Function(`${wf.slice(wf.indexOf(S) + S.length, wf.indexOf(E))}; return attestationFrom;`)();

  // synthetic evidence built INLINE — never sourced from a fixture (rule 3)
  const synth = {
    feature: 'add a widget', repo: 'demo', tier: 'standard', verdict: 'PASS',
    blockers: [], concerns: [], waived: [], fixPasses: 0,
    gateHistory: [{ verdict: 'PASS', blockers: 0, concerns: 0, waived: 0 }],
    filesChanged: ['src/widget.ts'], implSummary: 'built the widget',
    checks: [{ name: 'test', command: 'npm test', result: 'pass', exit: 0, tail: 'all green' }],
    baselineProbe: null,
    lenses: [{ lens: 'code-review', summary: 'ok', findings: [] }],
    screenshot: null, crossModel: null, missingGateJobs: [], implPreflight: 'typecheck exit 0',
    land: { branch: 'feat/widget', commitSha: 'abc1234', pushed: true }, dryRun: false,
  };
  const stamps = { ts: '2026-07-14T12-00-00Z', baseSha: 'base0000', headSha: 'head1111' };
  const clean = attestationFrom(synth, { wt: '/tmp/wt', branch: 'feat/widget' }, stamps, ['/tmp/wt']);

  // (a) exactly one history record, named by the ts
  assert(clean.relPath === `.claude/veriloop/history/${stamps.ts}.json`, 'emit: relPath is history/<ts>.json');
  const histDir = join(tmp, '.claude/veriloop/history');
  mkdirSync(histDir, { recursive: true });
  writeFileSync(join(histDir, `${stamps.ts}.json`), clean.json);
  assert(readdirSync(histDir).filter((f) => f.endsWith('.json')).length === 1, 'emit: exactly one history/*.json is written');

  // (b) parses with every required spec key; runtime stamps + normalized land
  const rec = JSON.parse(clean.json);
  const requiredKeys = ['ts', 'feature', 'repo', 'tier', 'baseSha', 'headSha', 'verdict', 'checks', 'baselineProbe', 'screenshots', 'screenshotVerdict', 'fixPasses', 'blockers', 'concerns', 'land'];
  assert(requiredKeys.every((k) => k in rec), 'emit: record has every required spec key');
  assert(rec.ts === stamps.ts && rec.baseSha === stamps.baseSha && rec.headSha === stamps.headSha, 'emit: ts/baseSha/headSha come from stamps (runtime tokens)');
  assert(rec.checks.every((c) => 'name' in c && 'command' in c && 'exit' in c && 'tail' in c), 'emit: each check carries name/command/exit/tail');
  assert(rec.land && rec.land.sha === 'abc1234' && rec.land.pushed === true && rec.land.branch === 'feat/widget', 'emit: land normalized from LAND_SCHEMA to {sha,pushed,branch}');

  // (c) a clean record carries no absolute path
  const ABS = /(\/Users\/|\/home\/[a-z]|\b[A-Z]:[\\/])/; // === lint-bundle.mjs:88
  assert(!ABS.test(clean.json), 'emit: a clean record contains no absolute path');

  // (d) a poisoned input comes out fully redacted (constitution rule 7)
  const poison = {
    ...synth,
    implSummary: 'edited /Users/secret/a.ts then C:\\Users\\evil\\b.ts',
    filesChanged: ['/Users/x/repo/src/only-abs.ts', 'src/rel-ok.ts'],
    checks: [{ name: 'test', command: 'npm test', result: 'fail', exit: 1, tail: 'FAIL at /Users/x/repo/t.ts:9\nnext /home/bob/z' }],
    screenshot: { verdict: 'fail', captured: ['/Users/x/repo-wt/shots/a.png', '/Users/x/repo/elsewhere.png', '/home/bob/s2.png'], defects: [] },
  };
  const dirty = attestationFrom(poison, { wt: '/Users/x/repo-wt', branch: 'b' }, stamps, ['/Users/x/repo-wt']);
  assert(!ABS.test(dirty.json), 'emit: a poisoned record (/Users, /home, C:\\) is fully redacted — zero absolute paths');
  const drec = JSON.parse(dirty.json);
  assert(drec.filesChanged.includes('src/rel-ok.ts') && !drec.filesChanged.some((f) => /only-abs/.test(f)), 'emit: a bare absolute-path array entry is dropped; the repo-relative one is kept');
  assert(drec.implSummary === '', 'emit: an implSummary carrying absolute paths is emptied, not leaked');
  assert(drec.screenshots.length === 1 && drec.screenshots[0] === 'shots/a.png', 'emit: an in-worktree screenshot normalizes to repo-relative; out-of-root paths are dropped');

  // (e) SECRET_PATTERNS is extracted from the SAME marker-bounded region — never
  //     re-hardcoded (constitution rule 9) — and reused for one poisoned-tail assert
  //     per pattern class (Deliverable 1): the secret-shaped line is dropped whole-line,
  //     sibling lines survive.
  const SECRET_PATTERNS = new Function(`${wf.slice(wf.indexOf(S) + S.length, wf.indexOf(E))}; return SECRET_PATTERNS;`)();
  assert(Array.isArray(SECRET_PATTERNS) && SECRET_PATTERNS.length === 8, 'emit: SECRET_PATTERNS is the single source of truth (8 pattern classes) extracted from the emitted workflow');
  const secretCases = [
    ['env-style KEY/TOKEN/SECRET/PASSWORD/CREDENTIALS assignment', 'DB_PASSWORD=hunter2'],
    ['bearer token', 'Authorization: Bearer abcdefgh12345678'],
    ['AWS access key id', 'AKIAIOSFODNN7EXAMPLE'],
    // PEM BEGIN alone is intentionally NOT tested here: with no END marker present, the
    // block-drop rule below drops to the end of the field (by design), which would also
    // swallow the 'after-line' sibling this loop asserts survives. The dedicated (e2)
    // block-drop test below covers BEGIN+body+END with the correct termination semantics.
    ['PEM private key block footer (bare, no BEGIN present)', '-----END RSA PRIVATE KEY-----'],
    ['github token prefix (ghp_/gho_/ghs_/github_pat_)', 'ghp_1234567890abcdefghijklmno'],
    ['sk- token prefix', 'sk-1234567890abcdefghijklmno'],
    ['slack xox- token prefix', 'xoxb-1234567890'],
  ];
  for (const [label, secretLine] of secretCases) {
    const tail = `before-line\n${secretLine}\nafter-line`;
    const poisonedSecret = { ...synth, checks: [{ name: 'test', command: 'npm test', result: 'fail', exit: 1, tail }] };
    const secretOut = attestationFrom(poisonedSecret, { wt: '/tmp/wt', branch: 'b' }, stamps, ['/tmp/wt']);
    const srec2 = JSON.parse(secretOut.json);
    const outTail = srec2.checks[0].tail;
    assert(
      !outTail.includes(secretLine) && outTail.includes('before-line') && outTail.includes('after-line'),
      `emit: secret redaction — ${label} line is dropped whole-line, sibling lines survive`,
    );
  }

  // (e2) PEM block-drop (security SHOULD-FIX; owner-amended spec, gate run
  //      wf_2df5505d-c2a): a poisoned multi-line PEM block — BEGIN header, three fake
  //      base64 body lines, END footer — embedded in a synthetic check tail must vanish
  //      IN FULL. A header-only line-drop (the pre-amendment behavior) would leave the
  //      body + footer readable in the committed record; assert none of the three survive
  //      and only the sibling lines outside the block do. Synthetic input only — this
  //      poisoned PEM block is fabricated here, never sourced from a real key.
  const pemBlockLines = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEpAIBAAKCAQEAxFAKEfakefakefakefakefakefakefakefakefakefakefak',
    'e2ndlineFAKEfakefakefakefakefakefakefakefakefakefakefakefakefak',
    'e3rdlineFAKEfakefakefakefakefakefakefakefakefakefakefakefakefak',
    '-----END RSA PRIVATE KEY-----',
  ];
  const pemPoison = {
    ...synth,
    checks: [{ name: 'test', command: 'npm test', result: 'fail', exit: 1, tail: ['before-line', ...pemBlockLines, 'after-line'].join('\n') }],
  };
  const pemOut = attestationFrom(pemPoison, { wt: '/tmp/wt', branch: 'b' }, stamps, ['/tmp/wt']);
  const pemTail = JSON.parse(pemOut.json).checks[0].tail;
  assert(!pemTail.includes('BEGIN RSA PRIVATE KEY'), 'emit: PEM block-drop — the BEGIN header line does not survive');
  assert(!pemTail.includes('END RSA PRIVATE KEY'), 'emit: PEM block-drop — the END footer line does not survive');
  assert(
    !pemBlockLines.slice(1, 4).some((bodyLine) => pemTail.includes(bodyLine)),
    'emit: PEM block-drop — the base64 body lines do not survive (a header-only line-drop would leak these)',
  );
  assert(pemTail.includes('before-line') && pemTail.includes('after-line'), 'emit: PEM block-drop — sibling lines outside the block survive');

  // (f) %REPO% sentinel: an in-root absolute path is stripped to the inert %REPO%
  //     placeholder, never the live shell variable $REPO (drift SHOULD-FIX — a live
  //     $REPO could re-expand the placeholder back into a real path during the write).
  const sentinelSynth = { ...synth, implSummary: 'edited /tmp/sentinel-root/src/a.ts and /tmp/sentinel-root/src/b.ts' };
  const sentinelOut = attestationFrom(sentinelSynth, { wt: '/tmp/sentinel-root', branch: 'b' }, stamps, ['/tmp/sentinel-root']);
  const srec = JSON.parse(sentinelOut.json);
  assert(srec.implSummary.includes('%REPO%'), 'emit: an in-root absolute path is stripped to the inert %REPO% sentinel');
  assert(!sentinelOut.json.includes('$REPO'), 'emit: the written record never contains the literal $REPO substring');
  assert(!ABS.test(sentinelOut.json), 'emit: the %REPO%-sentinel record contains no absolute path');

  // (g) dry-run routing: dryRun:true routes the record under history/dry-runs/, never
  //     history/ directly (owner decision — dry runs emit locally, always uncommitted).
  const dryRunSynth = { ...synth, dryRun: true };
  const dryOut = attestationFrom(dryRunSynth, { wt: '/tmp/wt', branch: 'feat/widget' }, stamps, ['/tmp/wt']);
  assert(dryOut.relPath === `.claude/veriloop/history/dry-runs/${stamps.ts}.json`, 'emit: dryRun:true routes the record to history/dry-runs/<ts>.json');
  const dryHistDir = join(tmp, '.claude/veriloop/history/dry-runs');
  mkdirSync(dryHistDir, { recursive: true });
  writeFileSync(join(dryHistDir, `${stamps.ts}.json`), dryOut.json);
  assert(existsSync(join(dryHistDir, `${stamps.ts}.json`)), 'emit: dry-run record is written under history/dry-runs/');

  // (h) lint-bundle committed-history backstop (Deliverable 4): a clean committed
  //     record passes; a committed record carrying a fake secret (API_KEY=...) fails
  //     the bundle. dry-runs/ (already seeded above) must never trip this scan.
  const cleanScan = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(cleanScan.status === 0, 'lint-bundle: passes with only clean committed history records present (dry-runs/ excluded)');
  writeFileSync(join(histDir, 'poisoned.json'), JSON.stringify({ note: 'API_KEY=abcd1234efgh' }, null, 2));
  const poisonedScan = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(poisonedScan.status !== 0, 'lint-bundle: FAILS when a committed history record carries a secret-shaped line (API_KEY=...)');
  assert(/secret-shaped content in committed attestation record/.test(poisonedScan.stdout || ''), 'lint-bundle: the failure names the committed-history secret backstop');

  // (i) lint-bundle backstop also fails on a bare PEM END-marker footer line, with no
  //     BEGIN present (security SHOULD-FIX Deliverable 1: the END-marker regex was added
  //     to the shared SECRET_PATTERNS array specifically so the backstop, which re-scans
  //     committed records with that SAME array, catches a leaked footer). Remove the
  //     API_KEY= poisoned record first so this failure is attributable to the PEM footer
  //     specifically, not the earlier fixture.
  rmSync(join(histDir, 'poisoned.json'));
  const cleanAgainScan = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(cleanAgainScan.status === 0, 'lint-bundle: passes again once the API_KEY= poisoned record is removed');
  writeFileSync(join(histDir, 'poisoned-pem-footer.json'), JSON.stringify({ note: '-----END RSA PRIVATE KEY-----' }, null, 2));
  const poisonedPemScan = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(poisonedPemScan.status !== 0, 'lint-bundle: FAILS when a committed history record carries a bare PEM END-marker footer line');
  assert(/secret-shaped content in committed attestation record/.test(poisonedPemScan.stdout || ''), 'lint-bundle: the PEM-footer failure names the committed-history secret backstop');
}

// --- rust/cargo detector (m4-plan §§1-4+7): a fixture supplies INPUT (Cargo.toml /
//     nextest.toml / rust-toolchain.toml / CI), each assert interrogates the
//     detector's DECISION (cmd / from / verified_by_ci / source / safety / mutates),
//     never parse output. Scan-only — nothing here is ever executed. ---
{
  // rust-workspace: workspace manifest + nextest + toolchain + clean flagged CI.
  const cj = detectCommands(join(fixtures, 'rust-workspace'));
  const C = cj.commands;
  const findCi = (cmd) => cj.ci_commands.find((c) => c.cmd === cmd);

  assert(cj.stack.includes('rust'), "rust-workspace: stack includes 'rust'");

  // test — the flag-capture verbatim-adoption requirement: the CI line carries
  // `--all-features`, and reconcile step 0 adopts it EXACTLY (from:'ci'), citing
  // its real CI line. A bare `cargo nextest run` would lose the flags.
  const ciTest = findCi('cargo nextest run --all-features');
  assert(
    C.test && C.test.cmd === 'cargo nextest run --all-features' && C.test.from === 'ci' && C.test.verified_by_ci === true,
    "rust-workspace: test adopts the flagged CI line 'cargo nextest run --all-features' verbatim, from:ci, verified",
  );
  assert(
    C.test && ciTest && C.test.source === ciTest.source + ' (CI)',
    'rust-workspace: the adopted test command cites its real CI line (…ci.yml:N (CI))',
  );

  // lint — the CI line equals the local candidate, so the local form is kept
  // (richer rust-toolchain citation) and marked CI-verified.
  assert(
    C.lint && C.lint.cmd.includes('-D warnings') && C.lint.from === 'rust' && C.lint.verified_by_ci === true,
    "rust-workspace: lint stays local (keeps '-D warnings' + toolchain citation), verified_by_ci:true",
  );

  // format — carries --check (a gate, never a mutator).
  assert(
    C.format && C.format.cmd.includes('--check') && C.format.mutates === undefined,
    "rust-workspace: format carries '--check' and is NOT flagged mutates",
  );

  // typecheck — no CI `cargo check` line exists, so it stays the local candidate,
  // NOT CI-verified. This pins that `from`/`verified_by_ci` reflect local-vs-CI.
  assert(
    C.typecheck && C.typecheck.cmd === 'cargo check' && C.typecheck.from === 'rust' && C.typecheck.verified_by_ci === false,
    'rust-workspace: typecheck stays local cargo check, from:rust, verified_by_ci:false (no CI check line)',
  );

  // bench — the NEW never-tier category: detected + cited from the CI `cargo bench`
  // line, safety:never, adopted at reconcile STEP 0 (`localSame || {…from:'ci'}`) —
  // there is NO local bench candidate. §7 guardrail: this must NOT come from the
  // documented-dead step 3 (detectors.mjs:467-483). It never enters a gate
  // (generate.mjs gateOrder allowlist) and is never auto-run (verify.mjs safety=never).
  assert(
    C.bench && C.bench.cmd === 'cargo bench' && C.bench.safety === 'never' && C.bench.from === 'ci',
    'rust-workspace: bench is detected + cited (from:ci via reconcile step 0), safety:never — never auto-run',
  );
}
{
  // rust-maturin: dual-stack surface — python contributes install+build, cargo
  // contributes lint/format/test/typecheck (§3, no CI, no nextest.toml).
  const cj = detectCommands(join(fixtures, 'rust-maturin'));
  const C = cj.commands;
  assert(
    cj.stack.includes('python') && cj.stack.includes('rust'),
    "rust-maturin: stack is dual — includes both 'python' and 'rust'",
  );
  assert(C.build && C.build.cmd.includes('maturin'), 'rust-maturin: build stays the python maturin surface');
  assert(C.lint && C.lint.cmd.includes('cargo clippy'), 'rust-maturin: lint is the cargo surface (cargo clippy)');
  assert(
    C.format && C.format.cmd.includes('cargo fmt') && C.format.cmd.includes('--check'),
    'rust-maturin: format is cargo fmt --check (dual-stack cargo surface)',
  );
  assert(C.test && C.test.cmd === 'cargo test', "rust-maturin: test === 'cargo test' (no nextest.toml → plain cargo test)");
}
{
  // hostile extension: compound/piped cargo lines are SEEN (surface in ci_commands)
  // then REJECTED (isCleanInvocation), so `test` is absent — mirroring the ci-adopt
  // build-reject assert. Scan-only: nothing from hostile-ci is ever executed.
  const cj = detectCommands(join(fixtures, 'hostile-ci'));
  const ci = cj.ci_commands.map((c) => c.cmd);
  assert(
    ci.includes('cd crates/x && cargo test') && ci.includes('cargo test | tee log'),
    'hostile-ci: both compound cargo lines surface in ci_commands (they were parsed)',
  );
  assert(
    cj.commands.test === undefined,
    'hostile-ci: test is ABSENT — the only cargo lines are compound/piped and never adopted',
  );
}
{
  // bare-fmt mini-repo (synthesized; scan-only — only detectCommands reads it): a
  // Makefile `fmt:` recipe running BARE `cargo fmt` (no --check) is a formatter, not
  // a gate → make wins (Makefile-first) with mutates:true + note. nextest.toml pins
  // the exact no-CI local test selection.
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-barefmt-'));
  mkdirSync(join(tmp, '.config'), { recursive: true });
  writeFileSync(join(tmp, 'Cargo.toml'), '[package]\nname = "barefmt"\nedition = "2021"\nversion = "0.1.0"\n');
  writeFileSync(join(tmp, 'Makefile'), 'fmt:\n\tcargo fmt\n');
  writeFileSync(join(tmp, '.config', 'nextest.toml'), '[profile.default]\nretries = 0\n');
  const C = detectCommands(tmp).commands;
  assert(
    C.format && C.format.cmd === 'make fmt' && C.format.mutates === true && typeof C.format.note === 'string',
    "bare-fmt: a bare `cargo fmt` make recipe wins as 'make fmt' with mutates:true + a note (formatter, not gate)",
  );
  assert(
    C.test && C.test.cmd === 'cargo nextest run',
    "bare-fmt: test is the exact local nextest selection 'cargo nextest run' (no CI)",
  );
  rmSync(tmp, { recursive: true, force: true });
}

// --- version-stamp agreement: all five stamp locations must name the same semver.
//     The drift class bit once (M1 bug #4: VERILOOP_VERSION stale at 0.1.0). Read
//     the files (regex on generate.mjs source — do NOT import it). ---
{
  const root = join(here, '..');
  const genVer = (readFileSync(join(here, 'generate.mjs'), 'utf8').match(/VERILOOP_VERSION\s*=\s*'([^']+)'/) || [])[1];
  const pkgVer = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const pluginVer = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version;
  const mkt = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'));
  const changelogVer = (readFileSync(join(root, 'CHANGELOG.md'), 'utf8').match(/^##\s+(\d+\.\d+\.\d+)/m) || [])[1];
  const stamps = { genVer, pkgVer, pluginVer, mktMeta: mkt.metadata.version, mktPlugin: mkt.plugins[0].version, changelogVer };
  assert(
    genVer && Object.values(stamps).every((v) => v === genVer),
    `version stamps agree across all five locations (${JSON.stringify(stamps)})`,
  );
}

// --- host-hook cleanliness: emitted text carries NO trailing whitespace (the
//     catan_rl_v2 lesson, 2026-07-17: a host repo's pre-commit trailing-whitespace
//     hook rejected generated personas and would flap on every regen — the host's
//     own gate must never fight machine-owned files). ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-ws-'));
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'ws', scripts: { lint: 'eslint .', test: 'vitest run' } }));
  const cjPath = join(tmp, 'commands.json');
  writeFileSync(cjPath, JSON.stringify(detectCommands(tmp), null, 2));
  spawnSync(process.execPath, [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp], { encoding: 'utf8' });
  const offenders = [];
  const walk = (d) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, n.name);
      if (n.isDirectory()) walk(p);
      else if (/\.(md|js|json)$/.test(p) && / +\n/.test(readFileSync(p, 'utf8'))) offenders.push(p.slice(tmp.length + 1));
    }
  };
  walk(join(tmp, '.claude'));
  assert(
    offenders.length === 0,
    `emitted files carry no trailing whitespace — host pre-commit hooks must not flap on regen${offenders.length ? ' (offenders: ' + offenders.join(', ') + ')' : ''}`,
  );
  rmSync(tmp, { recursive: true, force: true });
}

// --- v0.3.3: /dev-plan — the fourth emitted command (recon + interleaved spec
//     interview + expert council → an owner-ratified BINDING spec). Companion edits
//     shrink the other two on-ramps: /dev-loop Step 1 → spec DETECTION (spec-present
//     / trivial confirm-and-go / non-trivial → point to /dev-plan); /advise off-ramp
//     → hand off to /dev-plan. lint-bundle's command list is ONE hoisted constant. ---
{
  const gen = (interview) => {
    const tmp = mkdtempSync(join(tmpdir(), 'veriloop-devplan-'));
    // a prettier repo so the .prettierignore exemption block is emitted (and must
    // list the new command path)
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'dp', scripts: { lint: 'eslint .', 'format:check': 'prettier --check .', test: 'vitest run' } }));
    const cj = detectCommands(tmp);
    const cjPath = join(tmp, 'commands.json');
    writeFileSync(cjPath, JSON.stringify(cj, null, 2));
    const argv = [generatePath, '--repo', tmp, '--commands', cjPath, '--out', tmp];
    if (interview) {
      const ip = join(tmp, 'interview.json');
      writeFileSync(ip, JSON.stringify(interview));
      argv.push('--interview', ip);
    }
    const r = spawnSync(process.execPath, argv, { encoding: 'utf8' });
    return { tmp, r };
  };

  // (a) dev-plan.md is emitted (with phase_models.plan set → carries a model line)
  const { tmp, r } = gen({ budget_posture: 'frugal', phase_models: { plan: 'fable' } });
  assert(r.status === 0, 'generate: a repo with phase_models.plan generates cleanly');
  const devPlanPath = join(tmp, '.claude/commands/dev-plan.md');
  assert(existsSync(devPlanPath), 'generate: /dev-plan command is emitted');
  const devPlan = readFileSync(devPlanPath, 'utf8');

  // description trigger-first + within the frontmatter budget
  const dpDesc = (devPlan.match(/^description:\s*(.*)$/m) || [])[1] || '';
  assert(dpDesc.startsWith('Use when') && dpDesc.length <= 500, '/dev-plan: description is trigger-first ("Use when") and ≤500 chars');

  // allowed-tools ships on /dev-plan ONLY, narrower-than-everything (no bare Bash(*))
  const dpAllowed = (devPlan.match(/^allowed-tools:\s*(.*)$/m) || [])[1] || '';
  assert(/\bWrite\b/.test(dpAllowed) && /AskUserQuestion/.test(dpAllowed) && /\bTask\b/.test(dpAllowed), '/dev-plan: allowed-tools lists the write/ask/subagent tools');
  assert(/Bash\(git log:\*\)/.test(dpAllowed) && !/Bash\(\*\)/.test(dpAllowed), '/dev-plan: allowed-tools scopes Bash to read-only git patterns (no bare Bash(*))');

  // (b) model line PRESENT when phase_models.plan is set (verbatim from the interview)
  assert(/^model:\s*fable\s*$/m.test(devPlan), '/dev-plan: frontmatter carries `model: fable` when the interview sets phase_models.plan');
  assert(/turn-scoped/i.test(devPlan) && /silently falls back/i.test(devPlan) && /quota/i.test(devPlan), '/dev-plan: the body documents the model semantics (turn-scoped, silent fallback, spends that model\'s quota)');

  // (b') model line ABSENT when phase_models.plan is unset (both directions)
  const { tmp: tmp2 } = gen(null);
  const devPlan2 = readFileSync(join(tmp2, '.claude/commands/dev-plan.md'), 'utf8');
  assert(!/^model:/m.test(devPlan2), '/dev-plan: NO model line when the interview omits phase_models.plan (inherit the session model)');

  // (g) council protocol: anti-sycophancy mandate + read-only council + owner ratifies BINDING
  assert(/attack rather than concede/i.test(devPlan) && /not\s+blindly agree/i.test(devPlan), '/dev-plan: the council protocol carries the anti-sycophancy mandate (attack, do not blindly agree)');
  assert(/subagents are \*\*read-only\*\*/i.test(devPlan) && /only the main\s+session writes/i.test(devPlan), '/dev-plan: the council subagents are read-only — only the main session writes');
  assert(/owner ratifies it as BINDING/i.test(devPlan) && /AskUserQuestion/.test(devPlan), '/dev-plan: the owner ratifies the spec as BINDING via AskUserQuestion (only the owner stamps BINDING)');
  assert(/council=auto\|always\|off/.test(devPlan) && /high_risk_areas/.test(devPlan), '/dev-plan: the council firing rule keys off recon-touched files vs high_risk_areas, not request phrasing');
  // interview: NO fixed question cap; owner may set an optional questions=<N> budget
  assert(/NO fixed cap/i.test(devPlan) && /questions=<N>/.test(devPlan), '/dev-plan: the interview has no fixed question cap and documents the optional owner-set questions=<N> budget');

  // HARD LIMITS: NO VERDICTS + ownership covenant (hand-owned, git-tracked, never regenerated)
  assert(/NO VERDICTS/.test(devPlan) && /never PASS/i.test(devPlan.replace(/\n/g, ' ')), '/dev-plan: HARD LIMITS state NO VERDICTS (verdicts belong to /dev-loop)');
  assert(/never regenerates/i.test(devPlan) && /git-tracked/i.test(devPlan), '/dev-plan: ownership covenant — specs are hand-owned, git-tracked, never regenerated');

  // (e) /advise off-ramp now hands off to /dev-plan (the NEW handoff text, pinned)
  const advise2 = readFileSync(join(tmp, '.claude/commands/advise.md'), 'utf8').replace(/\n/g, ' ');
  assert(/hand off to\s+`?\/dev-plan`?/i.test(advise2), '/advise: off-ramp hands off to /dev-plan (the new handoff text is pinned)');

  // (f) /dev-loop Step 1 is spec DETECTION — all three branches present, passthrough preserved
  const devLoop2 = readFileSync(join(tmp, '.claude/commands/dev-loop.md'), 'utf8');
  assert(/Spec detection/.test(devLoop2), '/dev-loop: Step 1 is spec DETECTION (not an interview)');
  assert(/treat it as \*\*BINDING\*\*/.test(devLoop2), '/dev-loop: spec-present branch — a provided/on-disk spec is BINDING');
  assert(/Confirm-and-go/.test(devLoop2) && /NOT a second interview/.test(devLoop2), '/dev-loop: trivial branch is confirm-and-go, NOT a second interview');
  assert(/point the owner to `\/dev-plan`/.test(devLoop2), '/dev-loop: non-trivial branch stops and points to /dev-plan');
  assert(/args\.interview = false/.test(devLoop2), '/dev-loop: the unattended / args.interview=false passthrough is preserved');

  // (d) the .prettierignore machine-block lists the new command path
  const pi = readFileSync(join(tmp, '.prettierignore'), 'utf8');
  assert(pi.includes('.claude/commands/dev-plan.md'), 'generate: the .prettierignore block includes the /dev-plan command path');

  // manifest emitted_files carries the new command
  const man = JSON.parse(readFileSync(join(tmp, '.claude/veriloop/veriloop-manifest.json'), 'utf8'));
  assert((man.emitted_files || []).some((e) => e.path === '.claude/commands/dev-plan.md'), 'manifest: emitted_files includes .claude/commands/dev-plan.md');

  // (c) the linter guards the new surface: delete /dev-plan after generation → FAIL
  const before = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(before.status === 0, 'lint-bundle: a fresh v0.3.3 bundle passes (0 fail)');
  rmSync(devPlanPath);
  const after = spawnSync(process.execPath, [lintPath, '--bundle', tmp], { encoding: 'utf8' });
  assert(after.status !== 0, 'lint-bundle: FAILS when dev-plan.md is deleted after generation (guards the new command surface)');

  // (h) lint-bundle's command list is ONE hoisted constant covering all four commands
  const lintSrc = readFileSync(lintPath, 'utf8');
  const listMatch = lintSrc.match(/EMITTED_COMMANDS\s*=\s*\[([^\]]*)\]/);
  assert(!!listMatch, 'lint-bundle: EMITTED_COMMANDS is defined as a single constant (rule 9)');
  const listBody = listMatch ? listMatch[1] : '';
  assert(['dev-loop.md', 'advise.md', 'review.md', 'dev-plan.md'].every((c) => listBody.includes(`'${c}'`)), 'lint-bundle: the single command constant covers all four commands');
  assert(!/\[\s*'dev-loop\.md'\s*,\s*'advise\.md'\s*,\s*'review\.md'\s*\]/.test(lintSrc), 'lint-bundle: no remaining hardcoded [dev-loop, advise, review] array — every check references EMITTED_COMMANDS');
}

// --- v0.3.8: phase-3 deep scan (scripts/scan.mjs). Drive scan over the
//     fixtures/scan-target/ INPUT and interrogate its DECISION (the ci-adopt
//     rule-3 discipline: the fixture supplies input, the assertions interrogate
//     scan's classification — scan NEVER executes fixture content). ---
{
  const target = join(fixtures, 'scan-target');
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-scan-'));
  const out = join(tmp, 'scan-notes.md'); // TMP, never inside fixtures/ (would self-scan)

  const r1 = spawnSync(process.execPath, [scanPath, '--repo', target, '--out', out], { encoding: 'utf8' });
  assert(r1.status === 0, 'scan: exits 0 on fixtures/scan-target (write-then-halt)');
  assert(/review scan-notes\.md, then run mine\.mjs/.test(r1.stderr || ''), 'scan: prints the classification-confirm halt (never chains into mining)');

  const notes = existsSync(out) ? readFileSync(out, 'utf8') : '';

  // (a) expected `## surface:` blocks are emitted for the fixture's known surfaces.
  const headers = (notes.match(/^## surface:\s*(.+)$/gm) || []).map((h) => h.replace(/^## surface:\s*/, '').trim());
  assert(headers.includes('shell-string execution'), 'scan: emits the shell-string execution surface (run-check.mjs shell:true)');
  assert(headers.includes('secret / env handling'), 'scan: emits the secret/env surface (config.mjs process.env.FOO_KEY)');
  assert(headers.includes('parity / golden-fixture surfaces'), 'scan: emits the parity/golden surface (golden.fixture.json)');

  // frontmatter cursor persists the emitted surfaces (surface-keyed resume).
  assert(/^---\nemitted_surfaces:\n(?:\s*-\s+.+\n)+---/m.test(notes), 'scan: frontmatter carries an emitted_surfaces resumability cursor');

  // (b) every nomination cites a REAL file:line and names a valid expert key.
  //     Parse each surface block; verify the cited file exists and the line is in range,
  //     and the nominated expert is one of security|drift|ux (the SPECIALIST_DEFAULTS set).
  const blocks = notes.split(/^## surface:/m).slice(1);
  const VALID_EXPERTS = new Set(['security', 'drift', 'ux']);
  let allCitationsReal = blocks.length > 0;
  let allExpertsValid = blocks.length > 0;
  let shellCitesRunCheck = false;
  for (const b of blocks) {
    const name = (b.match(/^\s*(.+)/) || [])[1].trim();
    const evidence = [...b.matchAll(/^- evidence:\s*(.+?):(\d+)\s*$/gm)];
    if (evidence.length < 1) allCitationsReal = false;
    for (const [, relPath, lineStr] of evidence) {
      const abs = join(target, relPath);
      if (!existsSync(abs)) { allCitationsReal = false; continue; }
      const n = readFileSync(abs, 'utf8').split('\n').length;
      const ln = parseInt(lineStr, 10);
      if (!(ln >= 1 && ln <= n)) allCitationsReal = false;
      if (name === 'shell-string execution' && relPath === 'run-check.mjs') shellCitesRunCheck = true;
    }
    const expert = (b.match(/nominates:\s*expert=([a-z-]+)/) || [])[1];
    if (!VALID_EXPERTS.has(expert)) allExpertsValid = false;
  }
  assert(allCitationsReal, 'scan: every nomination cites a REAL in-range file:line');
  assert(allExpertsValid, 'scan: every nomination names a valid expert key (security|drift|ux → maps 1:1 onto applyRosterAdd)');

  // (d) scan NEVER executes fixture content: run-check.mjs would spawn a shell if
  //     run; instead scan read it as TEXT and CLASSIFIED it. The presence of the
  //     shell-string nomination citing run-check.mjs IS the decision-not-execution proof.
  assert(shellCitesRunCheck, 'scan: classified run-check.mjs as shell-string execution — read-and-decided, never executed (rule-4 scan-only covenant)');

  // (e) EVIDENCE-EVICTION FIX: code-pattern (`line`) matchers are scoped to CODE files,
  //     so the .md prose mention of "shell: true" in notes.md is NOT cited — the real
  //     code hit (run-check.mjs) survives instead of being evicted by documentation noise.
  assert(!/^- evidence:\s*notes\.md:/m.test(notes), 'scan: code-pattern surfaces exclude .md prose (notes.md not cited) — real code hit survives, no doc-noise eviction');

  // (c) a second run adds NO duplicate surface headers (resumability cursor).
  const r2 = spawnSync(process.execPath, [scanPath, '--repo', target, '--out', out], { encoding: 'utf8' });
  assert(r2.status === 0, 'scan: second run exits 0 (resumable)');
  const notes2 = readFileSync(out, 'utf8');
  const headers2 = (notes2.match(/^## surface:/gm) || []).length;
  const uniqueHeaders2 = new Set((notes2.match(/^## surface:\s*(.+)$/gm) || [])).size;
  assert(headers2 === uniqueHeaders2, 'scan: a second run adds NO duplicate surface headers (header count === unique count)');
  assert(headers2 === headers.length, 'scan: a second run adds NO new surface blocks at all (cursor skips completed surfaces)');

  // (f) --max DEFERS, never DROPS: cap at 1 surface/run over a FRESH doc; each run
  //     emits the NEXT surface, prior surfaces preserved, none lost. This is the
  //     security-tool invariant — never silently miss a surface (the earlier path-keyed
  //     cursor DROPPED capped-out surfaces; under it this progression was 1→1→1).
  const out3 = join(tmp, 'scan-max1.md');
  const progression = [];
  for (let k = 0; k < 3; k++) {
    spawnSync(process.execPath, [scanPath, '--repo', target, '--out', out3, '--max', '1'], { encoding: 'utf8' });
    progression.push((readFileSync(out3, 'utf8').match(/^## surface:/gm) || []).length);
  }
  assert(progression.join('→') === '1→2→3', `scan: --max 1 DEFERS surfaces across re-runs (1→2→3, none dropped) — got ${progression.join('→')}`);
  const finalNames = new Set((readFileSync(out3, 'utf8').match(/^## surface:\s*(.+)$/gm) || []));
  assert(finalNames.size === 3, 'scan: after --max-1 re-runs every fixture surface is emitted exactly once (no loss, no duplication)');

  rmSync(tmp, { recursive: true, force: true });
}

// --- v0.3.9: phase-4 constitution mining (scripts/mine.mjs, IN-PROCESS core).
//     Drive the REAL pipeline end-to-end — run scan.mjs to produce the notes, then
//     mine.mjs to re-verify candidates IN PROCESS against fixtures/mine-target/ and
//     emit mined.json. The harness may spawnSync node; the ASSERTION under test is
//     that mine.mjs's OWN source spawns nothing (grepped below). ---
{
  const target = join(fixtures, 'mine-target');
  const tmp = mkdtempSync(join(tmpdir(), 'veriloop-mine-'));
  const notes = join(tmp, 'scan-notes.md'); // TMP, never inside fixtures/ (would self-scan)
  const out = join(tmp, 'mined.json');

  const scanRun = spawnSync(process.execPath, [scanPath, '--repo', target, '--out', notes], { encoding: 'utf8' });
  assert(scanRun.status === 0, 'mine: scan.mjs produces scan-notes.md for fixtures/mine-target (real pipeline, not a stub)');

  const mineRun = spawnSync(process.execPath, [minePath, '--repo', target, '--scan', notes, '--out', out], { encoding: 'utf8' });
  assert(mineRun.status === 0, 'mine: exits 0 on fixtures/mine-target (write-then-halt)');
  assert(/review mined\.json — the owner confirms which candidates become rules/.test(mineRun.stdout || ''), 'mine: prints the owner-confirm halt (proposes, never confirms the constitution)');

  const mined = JSON.parse(readFileSync(out, 'utf8'));
  const cands = mined.candidates;

  // (a) ONE real invariant (≥5 conforming sites) mines to exactly one candidate.
  assert(cands.length === 1, 'mine: mine-target yields exactly ONE candidate (the code-backed invariant; the prose-only doc yields none)');

  // (b) that candidate carries conformance ≥0.9, ≥2 citations, correct owner + provenance.
  const c0 = cands[0] || {};
  assert(c0.conformance && c0.conformance.ratio >= 0.9, `mine: candidate conformance ratio ≥0.9 (got ${c0.conformance && c0.conformance.ratio})`);
  assert(c0.conformance && c0.conformance.sites >= 5, 'mine: candidate re-verified over ≥5 sites (invariant, not hypothesis)');
  assert(Array.isArray(c0.citations) && c0.citations.length >= 2, 'mine: candidate ships ≥2 real file:line citations (witness-or-drop)');
  assert(c0.owner === 'security', "mine: candidate owner === 'security' (from the scan nomination's expert key)");
  assert(c0.provenance === 'scan-surface:shell-string execution', "mine: candidate provenance === 'scan-surface:shell-string execution'");

  // (c) governance metadata is present but owner-gated fields stay EMPTY (not this run).
  assert('confirmed_at_sha' in c0 && c0.confirmed_by === null && c0.ratification === null, 'mine: confirmed_by / ratification left EMPTY — owner-confirmation is not this run');

  // (d) acceptance invariant: EVERY candidate has ≥2 citations + a numeric conformance ratio.
  assert(cands.every((r) => r.citations.length >= 2 && typeof r.conformance.ratio === 'number'), 'mine: every candidate has ≥2 citations + a conformance ratio (no naked prose survives)');

  // (e) citations are repo-RELATIVE — no absolute paths leak into the artifact (rule 7).
  const allCites = cands.flatMap((r) => r.citations);
  assert(allCites.every((x) => !x.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(x)), 'mine: every citation is repo-relative (no absolute path in mined.json)');

  // (f) each cited file:line is REAL and in range (re-verified in process, never trusted from prose).
  let allReal = allCites.length > 0;
  for (const cite of allCites) {
    const m = cite.match(/^(.+):(\d+)$/);
    if (!m) { allReal = false; continue; }
    const abs = join(target, m[1]);
    if (!existsSync(abs)) { allReal = false; continue; }
    const n = readFileSync(abs, 'utf8').split('\n').length;
    if (!(parseInt(m[2], 10) >= 1 && parseInt(m[2], 10) <= n)) allReal = false;
  }
  assert(allReal, 'mine: every citation names a REAL in-range file:line (deterministic in-process re-verification)');

  // (g) the PROSE-ONLY doc claim ("always write clean code") produces no candidate.
  assert(cands.every((r) => !r.provenance.startsWith('docs:')), 'mine: the prose-only doc claim yields 0 candidates (unfalsifiable-refusal)');

  // (h) fixtures/mine-target has no .git → corpus_sha resolves gracefully to null (never crashes).
  assert(mined.corpus_sha === null, 'mine: corpus_sha is null when --repo has no .git (graceful, no git spawned)');

  // (i) WITNESS-OR-DROP: a surface with only ONE conforming citation is DROPPED.
  //     Synthesize a minimal repo + hand-written notes so the query finds a single site.
  const dropRepo = join(tmp, 'drop-repo');
  mkdirSync(dropRepo, { recursive: true });
  writeFileSync(join(dropRepo, 'only.mjs'), 'export const x = 1;\nconst r = call(a, b, { shell: false });\n');
  const dropNotes = join(tmp, 'drop-notes.md');
  writeFileSync(dropNotes, '---\nemitted_surfaces:\n  - shell-string execution\n---\n\n## surface: shell-string execution\n- evidence: only.mjs:2\n- nominates: expert=security | rule="never synthesize shell strings"\n');
  const dropOut = join(tmp, 'drop-mined.json');
  const dropRun = spawnSync(process.execPath, [minePath, '--repo', dropRepo, '--scan', dropNotes, '--out', dropOut], { encoding: 'utf8' });
  assert(dropRun.status === 0, 'mine: exits 0 even when every candidate is dropped');
  assert(JSON.parse(readFileSync(dropOut, 'utf8')).candidates.length === 0, 'mine: a candidate with only 1 citation is DROPPED (witness-or-drop, <2 citations)');

  // (k) HYPOTHESIS-DROP by ratio: a surface conforming at 5 of 7 sites (ratio 0.71 < 0.9) is a
  //     hypothesis, not an invariant — DROPPED. The fixture is 5 conforming + 2 violating on
  //     PURPOSE: 5 conforming citations clear witness-or-drop (≥2), so the ONLY thing that can
  //     drop it is the deterministic re-verification gate (mine.mjs ratio<0.9). This isolates
  //     that branch — a regression that stopped counting conforming sites would fail elsewhere,
  //     not pass here vacuously (the 3/7 version could also drop via witness-or-drop).
  const mixRepo = join(fixtures, 'mine-drop');
  const mixNotes = join(tmp, 'mix-notes.md');
  const mixScan = spawnSync(process.execPath, [scanPath, '--repo', mixRepo, '--out', mixNotes], { encoding: 'utf8' });
  assert(mixScan.status === 0, 'mine: scan.mjs nominates the shell surface for fixtures/mine-drop (real pipeline)');
  const mixOut = join(tmp, 'mix-mined.json');
  const mixRun = spawnSync(process.execPath, [minePath, '--repo', mixRepo, '--scan', mixNotes, '--out', mixOut], { encoding: 'utf8' });
  assert(mixRun.status === 0, 'mine: exits 0 on the mixed-conformance repo');
  assert(JSON.parse(readFileSync(mixOut, 'utf8')).candidates.length === 0, 'mine: a surface conforming at only 5/7 sites (ratio 0.71 < 0.9) is DROPPED by the ratio gate — its 5 citations clear witness-or-drop, so ONLY re-verification can drop it');

  // (k2) COMMENT/STRING ARE NOT CODE: a line-comment that MENTIONS the antipattern must not
  //     flip a real invariant. 5 real `shell: false` sites + 1 file whose ONLY `shell: true`
  //     is inside a `//` warning comment: without comment-stripping that comment scores as a
  //     6th (violating) site → ratio 5/6 = 0.83 < 0.9 → the valid invariant is suppressed.
  //     With stripping: 5 conforming / 0 violating / ratio 1.0 → surfaced. (baseline lens SHOULD-FIX)
  const csRepo = join(tmp, 'comment-strip');
  mkdirSync(join(csRepo, 'src'), { recursive: true });
  for (const f of ['a', 'b', 'c', 'd', 'e']) {
    writeFileSync(join(csRepo, 'src', `ok-${f}.mjs`), "import { spawnSync } from 'node:child_process';\nexport const r = () => spawnSync('git', ['status'], { shell: false });\n");
  }
  writeFileSync(join(csRepo, 'src', 'warn.mjs'), '// SECURITY: never call spawn with shell: true — synthesizing a shell string is banned.\nexport const ok = () => 1;\n');
  const csNotes = join(tmp, 'comment-strip-notes.md');
  const csScan = spawnSync(process.execPath, [scanPath, '--repo', csRepo, '--out', csNotes], { encoding: 'utf8' });
  assert(csScan.status === 0, 'mine: scan nominates the shell surface for the comment-strip repo');
  const csOut = join(tmp, 'comment-strip-mined.json');
  const csRun = spawnSync(process.execPath, [minePath, '--repo', csRepo, '--scan', csNotes, '--out', csOut], { encoding: 'utf8' });
  const csCands = JSON.parse(readFileSync(csOut, 'utf8')).candidates;
  assert(csRun.status === 0 && csCands.length === 1, 'mine: a `shell: true` inside a `//` comment does NOT flip the 5-site invariant to a hypothesis (comment/string is not an enforcement site)');
  assert(csCands[0].conformance.violating === 0, 'mine: the commented antipattern is not counted as a violating site (0 violations, ratio 1.0)');

  // (l) PROTOTYPE-KEY SAFETY: a scan-notes surface literally named "__proto__" / "constructor"
  //     must not crash the MINE_QUERIES lookup (Object.hasOwn guard, mine.mjs:297) — a bracket
  //     lookup would otherwise return an inherited function and blow up verify().
  const protoNotes = join(tmp, 'proto-notes.md');
  writeFileSync(protoNotes, '## surface: __proto__\n- evidence: only.mjs:1\n- nominates: expert=security | rule="x"\n\n## surface: constructor\n- evidence: only.mjs:1\n- nominates: expert=security | rule="y"\n');
  const protoOut = join(tmp, 'proto-mined.json');
  const protoRun = spawnSync(process.execPath, [minePath, '--repo', dropRepo, '--scan', protoNotes, '--out', protoOut], { encoding: 'utf8' });
  assert(protoRun.status === 0, 'mine: a surface named "__proto__"/"constructor" does not crash the query lookup (prototype-key guard)');
  assert(JSON.parse(readFileSync(protoOut, 'utf8')).candidates.length === 0, 'mine: a prototype-key surface yields 0 candidates (no OWN query → refused, not inherited)');

  // (m) POPULATED corpus_sha — readHeadSha resolves HEAD both in a normal repo (.git is a DIR)
  //     and in a linked WORKTREE (.git is a FILE → gitdir), the layout self-host actually runs
  //     under. Regression lock: the worktree path returned null before the fix, blanking
  //     confirmed_at_sha on every real run. corpus_sha resolves regardless of candidate count.
  const shaDir = 'a'.repeat(40);
  const dirRepo = join(tmp, 'sha-dir');
  mkdirSync(join(dirRepo, '.git', 'refs', 'heads'), { recursive: true });
  writeFileSync(join(dirRepo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(join(dirRepo, '.git', 'refs', 'heads', 'main'), shaDir + '\n');
  writeFileSync(join(dirRepo, 'note.txt'), 'no rule-shaped prose here\n');
  const dirNotes = join(tmp, 'sha-dir-notes.md');
  writeFileSync(dirNotes, '---\nemitted_surfaces: []\n---\n');
  const dirShaOut = join(tmp, 'sha-dir-mined.json');
  const dirShaRun = spawnSync(process.execPath, [minePath, '--repo', dirRepo, '--scan', dirNotes, '--out', dirShaOut], { encoding: 'utf8' });
  assert(dirShaRun.status === 0 && JSON.parse(readFileSync(dirShaOut, 'utf8')).corpus_sha === shaDir, 'mine: corpus_sha resolves HEAD in a normal .git-dir repo (populated-sha path)');

  const shaWt = 'b'.repeat(40);
  const wtRepo = join(tmp, 'sha-wt');
  const wtGitdir = join(tmp, 'sha-wt-gitdir');
  mkdirSync(wtRepo, { recursive: true });
  mkdirSync(join(wtGitdir, 'refs', 'heads'), { recursive: true });
  writeFileSync(join(wtRepo, '.git'), `gitdir: ${wtGitdir}\n`); // .git is a FILE (linked worktree)
  writeFileSync(join(wtGitdir, 'HEAD'), 'ref: refs/heads/wt\n');
  writeFileSync(join(wtGitdir, 'refs', 'heads', 'wt'), shaWt + '\n');
  const wtNotes = join(tmp, 'sha-wt-notes.md');
  writeFileSync(wtNotes, '---\nemitted_surfaces: []\n---\n');
  const wtShaOut = join(tmp, 'sha-wt-mined.json');
  const wtShaRun = spawnSync(process.execPath, [minePath, '--repo', wtRepo, '--scan', wtNotes, '--out', wtShaOut], { encoding: 'utf8' });
  assert(wtShaRun.status === 0 && JSON.parse(readFileSync(wtShaOut, 'utf8')).corpus_sha === shaWt, 'mine: corpus_sha resolves HEAD via a .git-FILE linked worktree (the self-host layout; was null before the fix)');

  // (m2) DETACHED HEAD — .git/HEAD is a bare sha, not a `ref:` line. Exercises readHeadSha's
  //      early-return branch (the resolve rewrote it; test (m) only covered the loose-ref path).
  const shaDet = 'c'.repeat(40);
  const detRepo = join(tmp, 'sha-detached');
  mkdirSync(join(detRepo, '.git'), { recursive: true });
  writeFileSync(join(detRepo, '.git', 'HEAD'), shaDet + '\n');
  const detNotes = join(tmp, 'sha-det-notes.md');
  writeFileSync(detNotes, '---\nemitted_surfaces: []\n---\n');
  const detOut = join(tmp, 'sha-det-mined.json');
  const detRun = spawnSync(process.execPath, [minePath, '--repo', detRepo, '--scan', detNotes, '--out', detOut], { encoding: 'utf8' });
  assert(detRun.status === 0 && JSON.parse(readFileSync(detOut, 'utf8')).corpus_sha === shaDet, 'mine: corpus_sha resolves a DETACHED HEAD (bare sha in .git/HEAD)');

  // (m3) PACKED REFS — the ref has no loose file; the sha lives only in .git/packed-refs.
  //      Exercises the packed-refs loop (moved into the two-base loop by the resolve).
  const shaPk = 'd'.repeat(40);
  const pkRepo = join(tmp, 'sha-packed');
  mkdirSync(join(pkRepo, '.git'), { recursive: true });
  writeFileSync(join(pkRepo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(join(pkRepo, '.git', 'packed-refs'), `# pack-refs with: peeled fully-peeled sorted\n${shaPk} refs/heads/main\n`);
  const pkNotes = join(tmp, 'sha-pk-notes.md');
  writeFileSync(pkNotes, '---\nemitted_surfaces: []\n---\n');
  const pkOut = join(tmp, 'sha-pk-mined.json');
  const pkRun = spawnSync(process.execPath, [minePath, '--repo', pkRepo, '--scan', pkNotes, '--out', pkOut], { encoding: 'utf8' });
  assert(pkRun.status === 0 && JSON.parse(readFileSync(pkOut, 'utf8')).corpus_sha === shaPk, 'mine: corpus_sha resolves a ref that lives ONLY in packed-refs (no loose ref file)');

  // (m4) HOSTILE .git — a ref name with `..` is refused (no traversal read), and readHeadSha
  //      degrades to null without crashing. (security lens: bounded untrusted-repo hardening.)
  const evRepo = join(tmp, 'sha-evil');
  mkdirSync(join(evRepo, '.git'), { recursive: true });
  writeFileSync(join(evRepo, '.git', 'HEAD'), 'ref: ../../../../etc/hostname\n');
  const evNotes = join(tmp, 'sha-ev-notes.md');
  writeFileSync(evNotes, '---\nemitted_surfaces: []\n---\n');
  const evOut = join(tmp, 'sha-ev-mined.json');
  const evRun = spawnSync(process.execPath, [minePath, '--repo', evRepo, '--scan', evNotes, '--out', evOut], { encoding: 'utf8' });
  assert(evRun.status === 0 && JSON.parse(readFileSync(evOut, 'utf8')).corpus_sha === null, 'mine: a HEAD ref containing `..` is refused (no traversal) → corpus_sha null, no crash');

  // (j) SPAWNS-NOTHING covenant — assert on mine.mjs's OWN SOURCE (§3(b): in-process only).
  const mineSrc = readFileSync(minePath, 'utf8');
  assert(!/child_process/.test(mineSrc), 'mine: source never references child_process (imports node:fs + node:path only)');
  assert(!/\bspawnSync\b|\bexecSync\b|\bexecFileSync\b|\bspawn\s*\(|\bexec\s*\(/.test(mineSrc), 'mine: source contains no spawn/exec call (spawns nothing)');
  assert(!/shell:\s*true/.test(mineSrc), 'mine: source contains no shell:true options object (danger regex is fragment-assembled)');
  // import allowlist — the spawns-nothing covenant is only as strong as the module surface.
  // Assert mine.mjs imports EXACTLY node:fs + node:path (no child_process/vm/net/dynamic import).
  const imports = [...mineSrc.matchAll(/^import\s+.*?from\s+'([^']+)';/gm)].map((m) => m[1]);
  assert(imports.every((s) => s === 'node:fs' || s === 'node:path') && imports.length >= 2, `mine: imports are EXACTLY node:fs + node:path (defense-in-depth for spawns-nothing; got ${imports.join(', ')})`);
  assert(!/\brequire\s*\(|\bimport\s*\(|\beval\s*\(|\bnew Function\b/.test(mineSrc), 'mine: no dynamic require/import()/eval/Function (the source grep cannot be obfuscation-evaded)');

  rmSync(tmp, { recursive: true, force: true });
}

// --- v0.3.10: M3 §3 — the mined-query EXECUTION CONTRACT (scripts/lib/mined-query.mjs).
//     mine.mjs stays IN-PROCESS (spawns nothing — asserted in the mine block above); THIS
//     is the separate, red-teamed contract governing whether/how an UNTRUSTED candidate
//     may compile to a runnable (spawned) check. Feed it adversarial candidates and assert
//     REFUSAL — refusal is EXECUTABLE here, never asserted in prose. ---
{
  const codeProv = 'scan-surface:shell-string execution'; // a legit code-provenance tag

  // (1) LAUNDERING GUARD (e) — provenance inside a scan-only fixture dir is scan-only
  //     FOREVER: even a perfectly safe command compiles to NO runnable query (rule 4).
  const hostile = compileMinedQuery({ provenance: 'fixtures/hostile-ci/hostile.yml:3', command: { cmd: 'grep -rn shell scripts', safety: 'safe' } });
  assert(hostile.runnable === null, 'mined-query (e): a fixtures/hostile-ci/ candidate compiles to NO runnable query (scan-only forever — rule-4 laundering guard)');
  assert(/scan-only/.test(hostile.reason), 'mined-query (e): the refusal names the scan-only laundering guard');
  assert(compileMinedQuery({ provenance: 'docs:fixtures/hostile-ci/x.yml:1', command: { cmd: 'grep -rn x scripts', safety: 'safe' } }).runnable === null, 'mined-query (e): a docs:-tagged path INTO a scan-only dir is still refused (a tag prefix cannot launder)');
  const hostileRun = runMinedQuery(hostile);
  assert(hostileRun.ran === false && hostileRun.refused === true, 'mined-query (e): the runner REFUSES a scan-only candidate — it never spawns');

  // (2) TIER GATE (c) — a candidate classifying safety=never / mutates is non-runnable;
  //     routed through verify.mjs's OWN plan() (rule-6). The runner refuses it.
  const neverCand = compileMinedQuery({ provenance: 'docs:CLAUDE.md:1', command: { cmd: 'npm run dev', safety: 'never' } });
  assert(neverCand.runnable === null && /never/.test(neverCand.reason), 'mined-query (c): a safety=never candidate is non-runnable (rule-6 tier gate via verify.mjs plan())');
  assert(runMinedQuery(neverCand).refused === true, 'mined-query (c): the runner REFUSES a safety=never candidate (non-runnable)');
  assert(compileMinedQuery({ provenance: codeProv, command: { cmd: 'npm test' } }).runnable === null, 'mined-query (c): an unclassified command defaults READ-ONLY (ask-tier, not included) → refused');

  // (3) SHELL-INJECTION (a/b) — NO shell string is ever synthesized. Every named vector is
  //     refused (argv-only); a shell interpreter as argv[0] (`sh -c <str>`) is refused too.
  for (const cmd of ['grep x scripts ; rm -rf /', 'echo $(whoami)', 'ls `pwd`', 'a && b', 'find . | xargs rm', 'x=1 grep y']) {
    assert(compileMinedQuery({ provenance: codeProv, command: { cmd, safety: 'safe' } }).runnable === null, `mined-query (a): shell-injection "${cmd}" is refused — never synthesized into a shell string`);
  }
  assert(compileMinedQuery({ provenance: codeProv, command: { cmd: 'sh -c grep', safety: 'safe' } }).runnable === null, 'mined-query (b): a `sh -c` executable is refused — never hand a string to a shell');
  assert(compileMinedQuery({ provenance: codeProv, command: { cmd: '/bin/bash -c evil', safety: 'safe' } }).runnable === null, 'mined-query (b): a /bin/bash -c executable is refused (basename shell-interpreter denylist)');
  // No shell-true option ever reaches spawn — assert on the module's OWN SOURCE (source grep,
  // like the mine covenant). `\s*` keeps the assertion itself off `grep "shell: *true"`.
  const mqSrc = readFileSync(join(here, 'lib', 'mined-query.mjs'), 'utf8');
  assert(!/shell:\s*true/.test(mqSrc), 'mined-query (a): the module source contains no shell-true spawn option (argv-array only by construction)');
  assert(/shell:\s*false/.test(mqSrc), 'mined-query (a): the runner sets the shell option false (never a shell string)');

  // (4) MUTATING / WRITE candidate → refused (read-only default, rule-6 `mutates`).
  assert(compileMinedQuery({ provenance: codeProv, command: { cmd: 'prettier --write .', safety: 'safe', mutates: true } }).runnable === null, 'mined-query (c): a mutating (write) candidate is refused — read-only default');

  // (5) POSITIVE — a legit safe-tier, code-provenance candidate compiles to a non-null argv
  //     ARRAY and RUNS read-only (shell-option-false spawn, exit 0).
  const mqTmp = mkdtempSync(join(tmpdir(), 'veriloop-mq-'));
  writeFileSync(join(mqTmp, 'code.mjs'), "export const r = () => spawnSync('git', ['status'], { shell: false });\n");
  const good = compileMinedQuery({ provenance: codeProv, command: { cmd: `grep -rn spawnSync ${mqTmp}`, safety: 'safe' } });
  assert(Array.isArray(good.runnable) && good.runnable[0] === 'grep' && good.runnable.length === 4, 'mined-query (+): a legit safe-tier code-provenance candidate compiles to a non-null argv ARRAY');
  const goodRun = runMinedQuery(good, { cwd: mqTmp });
  assert(goodRun.ran === true && goodRun.refused === false && goodRun.ok === true && goodRun.exit === 0, 'mined-query (+): the compiled argv RUNS read-only via a shell-option-false spawn (exit 0)');
  rmSync(mqTmp, { recursive: true, force: true });

  // (6) COVENANT (kept) — mine.mjs stays IN-PROCESS; execution lives ONLY in this contract.
  const mineSrc2 = readFileSync(minePath, 'utf8');
  assert(!/child_process|\bspawnSync\b|\bexecFile/.test(mineSrc2), 'mined-query: mine.mjs still spawns nothing — the execution contract is the ONLY spawn surface (covenant preserved)');
}

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
