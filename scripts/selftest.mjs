#!/usr/bin/env node
// veriloop deterministic self-test. Runs detectCommands over the checked-in
// fixtures under fixtures/ and asserts the audit-fix behaviors (pnpm workspaces,
// headless-backend has_ui, hostile-CI rejection, verify skip/reset semantics).
// Dependency-free; never executes anything from fixtures/hostile-ci/.
//
// Usage: node scripts/selftest.mjs   → prints one line per assertion, exits 1 on any FAIL.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { detectCommands } from './lib/detectors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures');
const verifyPath = join(here, 'verify.mjs');

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

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
