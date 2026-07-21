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
// BOUNDED + RESUMABLE, with NO data loss: --max caps NEW surface blocks emitted
// per invocation; the frontmatter `emitted_surfaces:` cursor records what is
// already in the doc. Every run re-walks the WHOLE tree and re-collects evidence,
// then emits up to --max surfaces NOT yet in the cursor — so a surface over the
// --max budget is DEFERRED to the next run, never dropped. Resume keys on
// SURFACES, not walked paths: the whole point of a danger scan is to never
// silently MISS a surface.
//
// Usage:
//   node scan.mjs --repo <path> [--out <file>] [--max <N>]
//     --repo   repo root to scan (default: cwd)
//     --out    write scan-notes.md here (default: print to stdout — no cursor/resume)
//     --max    cap NEW surface blocks emitted per invocation (default: 12)
//
// scan-notes.md is consumed by mine.mjs (phase 4). This slice scans and STOPS:
// it NEVER mines, scores, or runs/compiles any nominated check.

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';

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
// the relative path (`path`). Nothing is ever spawned. `line` matchers apply ONLY
// to code files (see CODE_EXTS): matching `shell:true` or `child_process` inside a
// CHANGELOG or a plan doc is prose noise, not a spawn site. The nominated `expert`
// key MUST be one of SPECIALIST_DEFAULTS (security|drift|ux, generate.mjs:170) so a
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
// The scanner's OWN source DEFINES the catalog regexes; scanning it yields
// self-referential false positives (e.g. the literal `child_process` inside a
// pattern). Skip it — harmless on any repo that isn't veriloop itself.
const SKIP_FILES = new Set(['scripts/scan.mjs']);

// `line` (code-pattern) matchers fire only on these extensions. `path` matchers
// (e.g. *.fixture.json, migrations/) are unaffected and match any path.
const CODE_EXTS = new Set([
  '.mjs', '.cjs', '.js', '.mts', '.cts', '.ts', '.tsx', '.jsx', '.vue', '.svelte',
  '.py', '.rs', '.go', '.rb', '.java', '.kt', '.php', '.c', '.h', '.cpp', '.cc',
  '.sql', '.sh', '.bash',
]);
const isCode = (relPosix) => CODE_EXTS.has(extname(relPosix).toLowerCase());

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
 * for a non-flaky selftest. Returns relative POSIX paths only. Reads nothing here;
 * the caller reads each file as TEXT.
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
      const rel = relative(repo, abs).split(/[\\/]/).join('/');
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || SKIP_REL.has(rel)) continue;
        recur(abs);
      } else if (e.isFile()) {
        if (!SKIP_FILES.has(rel)) out.push(rel);
      }
    }
  };
  recur(repo);
  return out;
}

/** Read a file as text; skip anything unreadable, oversized, or binary (null byte). */
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

// Bounds citations PER SURFACE so one noisy surface can't flood the notes. Kept
// distinct from the default --max (surface cap) to avoid conflating the two bounds.
const MAX_EVIDENCE_PER_SURFACE = 8;

/**
 * Collect evidence per catalog surface over `paths`. `line` matchers fire only on
 * code files (isCode); `path` matchers fire on any path. Text is read at most once
 * per file, and only for code files.
 * @returns Map<surfaceName, string[]>  bounded "path:line" evidence entries.
 */
function collectEvidence(repo, paths, hasUi) {
  const evidence = new Map();
  for (const entry of CATALOG) {
    if (entry.uiOnly && !hasUi) continue;
    evidence.set(entry.name, []);
  }
  for (const relPosix of paths) {
    const code = isCode(relPosix);
    const text = code ? readTextSafe(join(repo, relPosix)) : null;
    const lines = text === null ? null : text.split('\n');
    for (const entry of CATALOG) {
      if (entry.uiOnly && !hasUi) continue;
      const hits = evidence.get(entry.name);
      if (hits.length >= MAX_EVIDENCE_PER_SURFACE) continue;
      // path-glob match → cite the file at line 1 (the path itself is the evidence)
      if (entry.path && entry.path.test(relPosix)) {
        hits.push(`${relPosix}:1`);
        if (hits.length >= MAX_EVIDENCE_PER_SURFACE) continue;
      }
      // line match → cite matching lines (CODE files only)
      if (entry.line && lines) {
        for (let i = 0; i < lines.length && hits.length < MAX_EVIDENCE_PER_SURFACE; i++) {
          if (entry.line.test(lines[i])) hits.push(`${relPosix}:${i + 1}`);
        }
      }
    }
  }
  return evidence;
}

/**
 * Parse an existing scan-notes.md into the set of already-emitted surface names
 * (from the `emitted_surfaces:` frontmatter cursor AND the body `## surface:`
 * headers — belt and suspenders) plus the body to preserve.
 */
function parseExisting(text) {
  const emitted = new Set();
  let body = text;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const m of fm[1].matchAll(/^\s*-\s+(.+)$/gm)) emitted.add(m[1].trim());
    body = text.slice(fm[0].length);
  }
  for (const m of body.matchAll(/^## surface:\s*(.+)$/gm)) emitted.add(m[1].trim());
  return { emitted, body: body.replace(/^\n+/, '') };
}

function renderFrontmatter(emittedNames) {
  const sorted = [...emittedNames].sort();
  const lines = ['---', 'emitted_surfaces:'];
  for (const n of sorted) lines.push(`  - ${n}`);
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

  // Resumability: load prior emitted surfaces so a re-run skips completed surfaces
  // (no duplicate `## surface:` headers) and preserves owner-reviewed content.
  let prior = { emitted: new Set(), body: '' };
  if (args.out && existsSync(args.out)) prior = parseExisting(readFileSync(args.out, 'utf8'));

  const hasUi = stackHasUi(args.repo);
  const allPaths = walk(args.repo);
  // Re-collect over the WHOLE tree every run — this is what makes --max a DEFER,
  // not a drop: a surface capped out last run is re-found and emitted next run.
  const evidence = collectEvidence(args.repo, allPaths, hasUi);

  const newBlocks = [];
  const newlyEmitted = [];
  let deferred = 0;
  for (const entry of CATALOG) {
    if (entry.uiOnly && !hasUi) continue;
    if (prior.emitted.has(entry.name)) continue; // already in the doc — resume past it
    const hits = evidence.get(entry.name);
    if (!hits || hits.length === 0) continue;
    if (newlyEmitted.length >= args.max) {
      deferred++; // hit, but over the --max budget → defer to a re-run (never dropped)
      continue;
    }
    newBlocks.push(renderSurfaceBlock(entry, hits));
    newlyEmitted.push(entry.name);
  }

  const emittedNames = new Set([...prior.emitted, ...newlyEmitted]);
  const bodyParts = [];
  if (prior.body.trim()) bodyParts.push(prior.body.trimEnd());
  bodyParts.push(...newBlocks);
  const doc = `${renderFrontmatter(emittedNames)}\n\n${bodyParts.filter(Boolean).join('\n\n')}\n`;

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, doc);
    console.error(`veriloop scan — ${args.repo}`);
    console.error(`  ${allPaths.length} files scanned, has_ui=${hasUi}`);
    console.error(`  ${newlyEmitted.length} new surface block(s); ${emittedNames.size} total in ${args.out}`);
    if (deferred > 0) console.error(`  ${deferred} more surface(s) hit but deferred by --max ${args.max} — re-run to emit them`);
  } else {
    process.stdout.write(doc);
    if (deferred > 0) console.error(`\n${deferred} surface(s) deferred by --max ${args.max}; pass --out to persist + resume`);
  }

  // CLASSIFICATION-CONFIRM HALT: write scan-notes.md and STOP. Never chain into
  // mining, never run/compile any nominated check (constitution.md:3 plan-halt).
  console.error('\nreview scan-notes.md, then run mine.mjs');
  process.exit(0);
}

main();
