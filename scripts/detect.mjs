#!/usr/bin/env node
// veriloop phase 1 — Detect.
// Deterministically parse the repo's real command surface and emit commands.json.
// No LLM: scripts own facts (paths/commands/numbers). Every command cites a source.
//
// Usage:
//   node detect.mjs --repo <path> [--out <file>] [--print]
//     --repo   repo root to scan (default: cwd)
//     --out    write commands.json here (default: print to stdout)
//     --print  also print the JSON to stdout even when --out is given
//
// commands.json is consumed by verify.mjs (phase 2) and generate.mjs (phase 6/7).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { detectCommands, CATEGORIES } from './lib/detectors.mjs';

function reqVal(argv, i, flag) {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) {
    console.error(`missing value for ${flag}`);
    process.exit(2);
  }
  return v;
}

function parseArgs(argv) {
  const args = { repo: process.cwd(), out: null, print: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = resolve(reqVal(argv, ++i, '--repo'));
    else if (a === '--out') args.out = resolve(reqVal(argv, ++i, '--out'));
    else if (a === '--print') args.print = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function summary(cj) {
  const lines = [];
  lines.push(`veriloop detect — ${cj.repo_root === '.' ? '(repo root)' : cj.repo_root}`);
  lines.push(`  stack: ${cj.stack.join('+')}   pkg-mgr: ${cj.package_manager}   has_ui: ${cj.has_ui}`);
  if (cj.polyglot.length) lines.push(`  polyglot: ${cj.polyglot.join('; ')}`);
  lines.push('  commands:');
  for (const cat of CATEGORIES) {
    const c = cj.commands[cat];
    if (!c) {
      lines.push(`    ${cat.padEnd(11)} —  (not found)`);
      continue;
    }
    const flags = [c.verified_by_ci ? 'CI✓' : 'CI✗', c.safety].join(' ');
    lines.push(`    ${cat.padEnd(11)} ${c.cmd}`);
    lines.push(`    ${''.padEnd(11)}   ↳ ${flags} · ${c.source}${c.note ? ` · NOTE: ${c.note}` : ''}`);
  }
  if (cj.scopes.length) {
    lines.push(`  scopes (${cj.scopes.length}):`);
    for (const s of cj.scopes) lines.push(`    ${s.name} (${s.path}) → ${Object.keys(s.commands).join(', ') || '—'}`);
  }
  if (cj.warnings && cj.warnings.length) {
    lines.push('  warnings:');
    for (const w of cj.warnings) lines.push(`    ⚠ ${w}`);
  }
  lines.push(`  ci: ${cj.ci_files.join(', ') || '(none)'} — ${cj.ci_commands.length} run-lines`);
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node detect.mjs --repo <path> [--out <file>] [--print]');
    return;
  }
  const cj = detectCommands(args.repo);
  const json = JSON.stringify(cj, null, 2);

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, json + '\n');
    console.error(summary(cj));
    console.error(`\nwrote ${args.out}`);
    if (args.print) console.log(json);
  } else {
    console.error(summary(cj));
    console.log(json);
  }
}

main();
