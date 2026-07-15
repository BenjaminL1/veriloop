#!/usr/bin/env node
// veriloop phase 2 — Verify.
// Smoke-run detected commands to prove they actually work, then hard-wire the
// verified ones into the gate. Enforces the auto-run safe-list (design #4):
//   • safety=safe  (typecheck/lint/format-check) → auto-run
//   • safety=ask   (test/build/install)          → run ONLY if --include lists it
//                                                   (SKILL.md asks the user first)
//   • safety=never (dev/e2e/integration/bench/deploy) → NEVER run (real side effects)
// Commands flagged `mutates` (a formatter with no --check) are never run — they
// would dirty the target repo. Placeholder commands (<file>, <path>::<test>) are
// skipped. Results (exit code + timing) are written back into commands.json.
//
// Usage:
//   node verify.mjs --repo <path> --commands <commands.json>
//                   [--include test,build | --include all]
//                   [--timeout 180] [--report <file>]
//
// NOTE: run verify ONCE with your full --include set — a later narrower run resets the skipped commands' verification.

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function reqVal(argv, i, flag) {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) {
    console.error(`missing value for ${flag}`);
    process.exit(2);
  }
  return v;
}

function parseArgs(argv) {
  const args = { repo: process.cwd(), commands: null, include: [], timeout: 180, report: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = resolve(reqVal(argv, ++i, '--repo'));
    else if (a === '--commands') args.commands = resolve(reqVal(argv, ++i, '--commands'));
    else if (a === '--include') args.include = reqVal(argv, ++i, '--include').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--timeout') args.timeout = parseInt(reqVal(argv, ++i, '--timeout'), 10);
    else if (a === '--report') args.report = resolve(reqVal(argv, ++i, '--report'));
    else if (a === '--help' || a === '-h') args.help = true;
  }
  if (!Number.isFinite(args.timeout) || args.timeout <= 0) args.timeout = 180;
  return args;
}

const hasPlaceholder = (cmd) => /<[^>]+>/.test(cmd);

/** Decide whether/why to run a command, honoring the safe-list. */
function plan(cat, c, include) {
  if (!c || !c.cmd) return { run: false, reason: 'not detected' };
  if (hasPlaceholder(c.cmd)) return { run: false, reason: 'placeholder command (needs a target file/test)' };
  if (c.mutates) return { run: false, reason: 'mutates working tree (formatter without --check)' };
  if (c.safety === 'never') return { run: false, reason: `safety=never (real side effects) — never auto-run` };
  if (c.safety === 'safe') return { run: true, reason: 'safe' };
  // ask-tier: run only if explicitly included
  if (include.includes('all') || include.includes(cat)) return { run: true, reason: 'included by user' };
  return { run: false, reason: 'safety=ask — not included (re-run with --include ' + cat + ')' };
}

function runCommand(cmd, cwd, timeoutSec) {
  const started = Date.now();
  const res = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    maxBuffer: 64 * 1024 * 1024,
    killSignal: 'SIGKILL',
    // CI=1 makes watch-style tools exit, but some toolchains treat CI as
    // warnings-as-errors — a local-green command may verify red. Tradeoff: we
    // prefer deterministic termination; the tail records the real output.
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  });
  const ms = Date.now() - started;
  const timedOut = res.error && res.error.code === 'ETIMEDOUT';
  const out = `${res.stdout || ''}${res.stderr || ''}`.replace(/\[[0-9;]*[A-Za-z]/g, '');
  const tail = out.split('\n').slice(-20).join('\n').slice(-2000);
  return {
    exit: timedOut ? null : res.status,
    ok: !timedOut && res.status === 0,
    ms,
    timedOut,
    tail,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.commands) {
    console.log('Usage: node verify.mjs --repo <path> --commands <commands.json> [--include test,build] [--timeout 180] [--report <file>]');
    return;
  }
  const cj = JSON.parse(readFileSync(args.commands, 'utf8'));
  const results = [];
  console.error(`veriloop verify — repo ${args.repo}`);
  console.error(`  safe-list: safe=auto, ask=${args.include.length ? args.include.join(',') : '(none included)'}, never=blocked\n`);

  for (const [cat, c] of Object.entries(cj.commands)) {
    const p = plan(cat, c, args.include);
    if (!p.run) {
      // A skipped command has NO current verification: reset all run artifacts so
      // the record can never simultaneously claim "skipped" and "verified pass".
      c.verified = null;
      delete c.verify_exit;
      delete c.verify_ms;
      delete c.verify_tail;
      c.verify_skipped = p.reason;
      results.push({ cat, cmd: c.cmd, status: 'skip', reason: p.reason });
      console.error(`  ⊘ ${cat.padEnd(11)} SKIP  ${c.cmd}  (${p.reason})`);
      continue;
    }
    const cwd = c.cwd && c.cwd !== '.' ? resolve(args.repo, c.cwd) : args.repo;
    process.stderr.write(`  … ${cat.padEnd(11)} run   ${c.cmd}\r`);
    const r = runCommand(c.cmd, cwd, args.timeout);
    c.verified = r.ok;
    c.verify_exit = r.exit;
    c.verify_ms = r.ms;
    delete c.verify_skipped;
    if (!r.ok) c.verify_tail = r.tail;
    else delete c.verify_tail;
    const mark = r.ok ? '✓' : r.timedOut ? '⏱' : '✗';
    results.push({ cat, cmd: c.cmd, status: r.ok ? 'pass' : 'fail', exit: r.exit, ms: r.ms, timedOut: r.timedOut });
    console.error(`  ${mark} ${cat.padEnd(11)} ${r.ok ? 'PASS' : r.timedOut ? 'TIMEOUT' : 'FAIL'}  ${c.cmd}  (${r.ms}ms${r.ok ? '' : ', exit ' + r.exit})`);
    if (!r.ok && r.tail) console.error(r.tail.split('\n').map((l) => '        │ ' + l).join('\n'));
  }

  cj.verified_at = new Date().toISOString();
  writeFileSync(args.commands, JSON.stringify(cj, null, 2) + '\n');
  if (args.report) writeFileSync(args.report, JSON.stringify({ repo: cj.repo_root, verified_at: cj.verified_at, results }, null, 2) + '\n');

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  console.error(`\n  ${passed} verified, ${failed} failed, ${results.length - passed - failed} skipped → ${args.commands}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
