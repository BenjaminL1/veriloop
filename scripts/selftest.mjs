#!/usr/bin/env node
// veriloop deterministic self-test. Runs detectCommands over the checked-in
// fixtures under fixtures/ and asserts the audit-fix behaviors (pnpm workspaces,
// headless-backend has_ui, hostile-CI rejection, verify skip/reset semantics).
// Dependency-free; never executes anything from fixtures/hostile-ci/.
//
// Usage: node scripts/selftest.mjs   → prints one line per assertion, exits 1 on any FAIL.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { detectCommands } from './lib/detectors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');
const verifyPath = join(here, 'verify.mjs');
const generatePath = join(here, 'generate.mjs');
const lintPath = join(here, 'lint-bundle.mjs');

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
  assert(/AskUserQuestion/.test(cmd) && /cannot ask the owner anything/.test(cmd), '/dev-loop: the interview runs in the COMMAND layer (the workflow cannot ask questions)');
  assert(/ask nothing and go straight/.test(cmd), '/dev-loop: an unambiguous feature triggers NO interview');
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
//     constitution rule 7, using the same ABS regex lint-bundle scans committed records with. ---
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

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
