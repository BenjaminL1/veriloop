#!/usr/bin/env node
// veriloop phase 3 — Deep scan.
// Deterministically walk a repo's danger surfaces and emit scan-notes.md, then
// STOP for owner classification-confirm. Scripts own facts (a hardcoded pattern
// catalog + real file:line evidence); the owner owns judgment (confirming the
// classifications at the halt). No LLM inside this script — constitution rule 2.
//
// SCAN-ONLY COVENANT (constitution rule 4/5 spirit): scan.mjs NEVER executes,
// imports, or evals anything from the scanned repo — it reads files as TEXT only.
// This slice spawns nothing at all (git-history mining is §2, a non-goal).
//
// Usage:
//   node scan.mjs --repo <path> [--out <file>] [--max <N>]
//     --repo   repo root to scan (default: cwd)
//     --out    write scan-notes.md here (default: print to stdout — no cursor)
//     --max    cap NEW surfaces emitted per invocation (default: 12)
//
// scan-notes.md is consumed by mine.mjs (phase 4). This slice scans and STOPS:
// it NEVER mines, scores, or runs/compiles any nominated check.

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

function reqVal(argv, i, flag) {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) {
    console.error(`missing value for ${flag}`);
    process.exit(2);
  }
  return v;
}

function parseArgs(argv) {
  const args = { repo: process.cwd(), out: null, max: 12 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = resolve(reqVal(argv, ++i, '--repo'));
    else if (a === '--out') args.out = resolve(reqVal(argv, ++i, '--out'));
    else if (a === '--max') args.max = Math.max(1, parseInt(reqVal(argv, ++i, '--max'), 10) || 12);
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

// --- Danger-surface catalog (DETERMINISTIC; v1 scope, extensible). --------------
// Each entry is matched IN PROCESS — a regex over file text (`line`) and/or over
// the relative path (`path`). Nothing is ever spawned. The nominated `expert` key
// MUST be one of SPECIALIST_DEFAULTS (security|drift|ux, generate.mjs:170) so a
// nomination maps 1:1 onto applyRosterAdd (generate.mjs:179-210). `uiOnly` entries
// nominate only when the detected stack has a UI.
const CATALOG = [
  {
    name: 'shell-string execution',
    expert: 'security',
    rule: 'never synthesize shell strings — argv-array spawn only, shell:false',
    line: /shell:\s*true|\beval\(|child_process/,
  },
  {
    name: 'secret / env handling',
    expert: 'security',
    rule: 'secrets and env access must stay server-side and never be logged',
    line: /process\.env|[A-Z][A-Z0-9]*_KEY|SERVICE_ROLE|server-only/,
  },
  {
    name: 'DB / SQL / RLS access',
    expert: 'security',
    rule: 'every table access is guarded by RLS; no SECURITY DEFINER without review',
    path: /\.sql$|(^|\/)migrations\//,
    line: /SECURITY DEFINER|supabase/,
  },
  {
    name: 'untrusted-input to sink',
    expert: 'security',
    rule: 'request body/query/params must be validated before reaching a command or query',
    line: /\b(?:req|request)\.(?:body|query|params)\b/,
  },
  {
    name: 'filesystem writes / machine-owned emission',
    expert: 'drift',
    rule: 'machine-owned regions are marked and never clobber owner-edited content',
    line: /veriloop:auto:(?:start|end)|writeFileSync|\brmSync\(/,
  },
  {
    name: 'parity / golden-fixture surfaces',
    expert: 'drift',
    rule: 'golden fixtures are the parity oracle — regenerate deliberately, never silently',
    path: /\.fixture\.json$/,
    line: /\bconformance\b|\bparity\b/,
  },
  {
    name: 'UI surfaces rendering user data',
    expert: 'ux',
    rule: 'user-supplied data is escaped before render — no raw HTML injection',
    line: /dangerouslySetInnerHTML|\binnerHTML\b|v-html/,
    uiOnly: true,
  },
];

const SKIP_DIRS = new Set(['node_modules', '.git']);
// The one nested skip: .claude/veriloop/.backups (machine backups, not a surface).
const SKIP_REL = new Set(['.claude/veriloop/.backups']);

/** Cheap self-contained UI detection (reads package.json deps; no execution). */
function stackHasUi(repo) {
  try {
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
    return deps.some((d) => /^(react|react-dom|vue|svelte|next|solid-js|preact|@angular\/core)$/.test(d));
  } catch {
    return false;
  }
}

/**
 * Walk the tree with STABLE (sorted) order — deterministic output is load-bearing
 * for resumability dedup and a non-flaky selftest. Returns relative paths only.
 * Reads nothing here; the caller reads each file as TEXT.
 */
function walk(repo) {
  const out = [];
  const recur = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(repo, abs);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || SKIP_REL.has(rel)) continue;
        recur(abs);
      } else if (e.isFile()) {
        out.push(rel);
      }
    }
  };
  recur(repo);
  return out;
}

/** Read a file as text; skip anything unreadable or binary (null byte). */
function readTextSafe(abs) {
  try {
    if (statSync(abs).size > 2 * 1024 * 1024) return null; // skip huge files
    const t = readFileSync(abs, 'utf8');
    if (t.includes('\u0000')) return null; // binary — skip
    return t;
  } catch {
    return null;
  }
}

const MAX_EVIDENCE_PER_SURFACE = 12;

/**
 * Collect evidence per catalog surface over the given (not-yet-scanned) paths.
 * @returns Map<surfaceName, string[]>  evidence "path:line" entries (bounded).
 */
function collectEvidence(repo, paths, hasUi) {
  const evidence = new Map();
  for (const entry of CATALOG) {
    if (entry.uiOnly && !hasUi) continue;
    evidence.set(entry.name, []);
  }
  for (const rel of paths) {
    const relPosix = rel.split(/[\\/]/).join('/');
    const text = readTextSafe(join(repo, rel));
    if (text === null) continue;
    const lines = text.split('\n');
    for (const entry of CATALOG) {
      if (entry.uiOnly && !hasUi) continue;
      const hits = evidence.get(entry.name);
      if (hits.length >= MAX_EVIDENCE_PER_SURFACE) continue;
      // path-glob match → cite the file at line 1 (the path itself is the evidence)
      if (entry.path && entry.path.test(relPosix)) {
        hits.push(`${relPosix}:1`);
        if (hits.length >= MAX_EVIDENCE_PER_SURFACE) continue;
      }
      // line match → cite the first matching line(s)
      if (entry.line) {
        for (let i = 0; i < lines.length && hits.length < MAX_EVIDENCE_PER_SURFACE; i++) {
          if (entry.line.test(lines[i])) hits.push(`${relPosix}:${i + 1}`);
        }
      }
    }
  }
  return evidence;
}

/** Parse an existing scan-notes.md: its scanned_paths cursor + emitted headers. */
function parseExisting(text) {
  const scanned = new Set();
  const headers = new Set();
  let body = text;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const m of fm[1].matchAll(/^\s*-\s+(.+)$/gm)) scanned.add(m[1].trim());
    body = text.slice(fm[0].length);
  }
  for (const m of body.matchAll(/^## surface:\s*(.+)$/gm)) headers.add(m[1].trim());
  return { scanned, headers, body: body.replace(/^\n+/, '') };
}

function renderFrontmatter(scannedPaths) {
  const sorted = [...scannedPaths].sort();
  const lines = ['---', 'scanned_paths:'];
  for (const p of sorted) lines.push(`  - ${p}`);
  lines.push('---');
  return lines.join('\n');
}

function renderSurfaceBlock(entry, hits) {
  const lines = [`## surface: ${entry.name}`];
  for (const h of [...new Set(hits)]) lines.push(`- evidence: ${h}`);
  lines.push(`- nominates: expert=${entry.expert} | rule="${entry.rule}"`);
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node scan.mjs --repo <path> [--out <file>] [--max <N>]');
    return;
  }

  // Resumability: load an existing cursor so a re-run skips completed paths and
  // adds NO duplicate `## surface:` headers, preserving owner-reviewed content.
  let prior = { scanned: new Set(), headers: new Set(), body: '' };
  if (args.out && existsSync(args.out)) {
    prior = parseExisting(readFileSync(args.out, 'utf8'));
  }

  const hasUi = stackHasUi(args.repo);
  const allPaths = walk(args.repo);
  const fresh = allPaths.filter((p) => !prior.scanned.has(p.split(/[\\/]/).join('/')));

  const evidence = collectEvidence(args.repo, fresh, hasUi);

  // Emit a block per catalog surface with >=1 NEW hit whose header is not already
  // present. BOUNDED: at most --max new surface blocks this invocation.
  const newBlocks = [];
  let emitted = 0;
  for (const entry of CATALOG) {
    if (emitted >= args.max) break;
    if (prior.headers.has(entry.name)) continue;
    const hits = evidence.get(entry.name);
    if (!hits || hits.length === 0) continue;
    newBlocks.push(renderSurfaceBlock(entry, hits));
    emitted++;
  }

  // Merge cursor: every walked path is now scanned.
  const scannedPaths = new Set(prior.scanned);
  for (const p of allPaths) scannedPaths.add(p.split(/[\\/]/).join('/'));

  const bodyParts = [];
  if (prior.body.trim()) bodyParts.push(prior.body.trimEnd());
  bodyParts.push(...newBlocks);
  const doc = `${renderFrontmatter(scannedPaths)}\n\n${bodyParts.join('\n\n')}\n`;

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, doc);
    console.error(`veriloop scan — ${args.repo}`);
    console.error(`  scanned ${allPaths.length} files (${fresh.length} new this run), has_ui=${hasUi}`);
    console.error(`  ${emitted} new surface block(s); ${scannedPaths.size} paths in cursor`);
    console.error(`  wrote ${args.out}`);
  } else {
    process.stdout.write(doc);
  }

  // CLASSIFICATION-CONFIRM HALT: write scan-notes.md and STOP. Never chain into
  // mining, never run/compile any nominated check (constitution.md:3 plan-halt).
  console.error('\nreview scan-notes.md, then run mine.mjs');
  process.exit(0);
}

main();
