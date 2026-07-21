#!/usr/bin/env node
// veriloop phase 4 — Constitution mining (IN-PROCESS core).
// Turns scan-notes.md surfaces + docs/CLAUDE.md claims into CANDIDATE constitution
// rules — each WITNESSED-OR-DROPPED and DETERMINISTICALLY RE-VERIFIED IN PROCESS —
// and writes mined.json, then STOPS for owner confirmation. mine.mjs PROPOSES; it
// never writes or confirms constitution.md (owner-gated boundary, constitution rule 8).
//
// IN-PROCESS-ONLY COVENANT (constitution rules 2/4, §3(b)-safe by construction):
// this script imports node:fs + node:path ONLY. It reads every file as TEXT and
// re-verifies each candidate by RUNNING a compiled regex query IN PROCESS. It never
// imports child-process, never shells out, and never executes/evals anything from
// the scanned repo. The danger-pattern regexes below are assembled from string
// FRAGMENTS on purpose, so the compiler-side source carries no literal spawn/argv
// option token a grep could mistake for a spawn site (same self-scan hygiene as
// scan.mjs). No LLM inside this script — facts come from deterministic queries.
//
// DEFERRED to later, separately-red-teamed slices (non-goals here): git-history /
// SZZ mining (--blind), spawned/argv/subprocess check execution + the full §3
// runnable-command contract, three-way merge on re-runs, writing/confirming the
// constitution, and the benchmark run/scoring (§6).
//
// Usage:
//   node mine.mjs --repo <path> --scan <scan-notes.md> --out <mined.json>
//     --repo   repo root to re-verify candidates against (read as TEXT)
//     --scan   scan-notes.md produced by scan.mjs (candidate source (a))
//     --out    write mined.json here
//
// Consumed downstream by bench-score.mjs (§6). This slice mines and STOPS.

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
  const args = { repo: null, scan: null, out: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = resolve(reqVal(argv, ++i, '--repo'));
    else if (a === '--scan') args.scan = resolve(reqVal(argv, ++i, '--scan'));
    else if (a === '--out') args.out = resolve(reqVal(argv, ++i, '--out'));
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

// --- Compiled-query catalog (DETERMINISTIC). Each entry compiles a candidate rule
// to a CHECKABLE query: `conforming` witnesses the invariant holding, `violating`
// witnesses it broken. A rule with no entry here does NOT compile to a check that
// could fail → it is REFUSED as unfalsifiable ("a rule that can't fail a check
// isn't a rule"). `violating` is tested first so a broken line is never miscounted
// as conforming. The `owner` is one of SPECIALIST_DEFAULTS (security|drift|ux) or
// `code-review`. The shell option regexes are assembled from FRAGMENTS so this
// source contains no literal spawn-option token. --------------------------------
const SHELL = 'shell';
const MINE_QUERIES = {
  'shell-string execution': {
    owner: 'security',
    rule: 'child-process spawns pass an argv array with the shell option false — never a synthesized shell string',
    conforming: new RegExp(SHELL + ':\\s*' + 'false' + '\\b'),
    violating: new RegExp(SHELL + ':\\s*' + 'true' + '\\b'),
  },
  'secret / env handling': {
    owner: 'security',
    rule: 'env/secret reads stay out of logs — process.env is never passed to a console call',
    conforming: /process\.env\b/,
    violating: /console\.\w+\([^)]*process\.env\b/,
  },
};

// Source (d): map a rule-shaped doc claim to a compiled query by keyword. A claim
// that matches no keyword compiles to nothing → refused (unfalsifiable prose).
const DOCS_KEYWORDS = [
  { kw: /\bshell\b|\bspawn\b|\bargv\b|child-process/i, surface: 'shell-string execution' },
  { kw: /\benv\b|\bsecret\b|\btoken\b|\bcredential/i, surface: 'secret / env handling' },
];

// The owner tag from scan-notes is untrusted; a candidate's owner must be a real roster
// expert (bench-score §6 consumes it). Unknown → fall back to the query's own owner.
const ALLOWED_OWNERS = new Set(['security', 'drift', 'ux', 'code-review']);
// Cap emitted citations per candidate so mined.json stays reviewable on a large repo; the
// TRUE conforming/violating/site counts are always kept in `conformance`.
const MAX_CITATIONS = 20;

const SKIP_DIRS = new Set(['node_modules', '.git']);
const SKIP_REL = new Set(['.claude/veriloop/.backups']);
// mine.mjs and scan.mjs DEFINE these regexes; scanning them yields self-referential
// false positives. Skip them — harmless on any repo that is not veriloop itself.
const SKIP_FILES = new Set(['scripts/mine.mjs', 'scripts/scan.mjs']);

const CODE_EXTS = new Set([
  '.mjs', '.cjs', '.js', '.mts', '.cts', '.ts', '.tsx', '.jsx', '.vue', '.svelte',
  '.py', '.rs', '.go', '.rb', '.java', '.kt', '.php', '.c', '.h', '.cpp', '.cc',
  '.sql', '.sh', '.bash',
]);
const isCode = (relPosix) => CODE_EXTS.has(extname(relPosix).toLowerCase());

/** Stable (sorted) recursive walk → relative POSIX paths. Reads nothing here. */
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
    if (statSync(abs).size > 2 * 1024 * 1024) return null;
    const t = readFileSync(abs, 'utf8');
    if (t.includes("\u0000")) return null; // binary — skip
    return t;
  } catch {
    return null;
  }
}

/**
 * Resolve the repo's HEAD sha by READING .git — never by spawning git (in-process
 * covenant). Returns null when there is no .git (e.g. a fixture subtree) or on any
 * failure — the caller must degrade gracefully, never crash.
 */
function readHeadSha(repo) {
  try {
    const dotgit = join(repo, '.git');
    // .git is a DIRECTORY (normal clone) or a FILE `gitdir: <path>` (worktree/submodule).
    // veriloop self-hosts inside isolated worktrees, so the file layout is the common case.
    let gitdir;
    if (statSync(dotgit).isDirectory()) {
      gitdir = dotgit;
    } else {
      const m = readFileSync(dotgit, 'utf8').match(/gitdir:\s*(.+)/);
      if (!m) return null;
      gitdir = resolve(repo, m[1].trim());
    }
    // Worktrees keep HEAD in their own gitdir but share refs via the commondir.
    let commondir = gitdir;
    try {
      commondir = resolve(gitdir, readFileSync(join(gitdir, 'commondir'), 'utf8').trim());
    } catch { /* single repo — no commondir */ }
    const head = readFileSync(join(gitdir, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head; // detached HEAD
    const ref = head.match(/^ref:\s*(.+)$/);
    if (!ref) return null;
    const refRel = ref[1].trim();
    for (const base of [gitdir, commondir]) {
      const loose = join(base, refRel);
      if (existsSync(loose)) {
        const s = readFileSync(loose, 'utf8').trim();
        if (/^[0-9a-f]{40}$/.test(s)) return s;
      }
    }
    for (const base of [commondir, gitdir]) {
      const packed = join(base, 'packed-refs');
      if (existsSync(packed)) {
        for (const line of readFileSync(packed, 'utf8').split('\n')) {
          const m = line.match(/^([0-9a-f]{40})\s+(.+)$/);
          if (m && m[2] === refRel) return m[1];
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse scan-notes.md into candidate seeds — source (a). Each `## surface:` block
 * yields { surface, owner } from its `- nominates: expert=<key>` line. The scan
 * evidence is NOT trusted for citations; mine re-derives citations in process.
 */
function parseScanNotes(text) {
  const seeds = [];
  const blocks = text.split(/^## surface:/m).slice(1);
  for (const b of blocks) {
    const surface = (b.match(/^\s*(.+)/) || [])[1]?.trim();
    if (!surface) continue;
    const owner = (b.match(/nominates:\s*expert=([a-z-]+)/) || [])[1] || null;
    seeds.push({ surface, owner, provenance: `scan-surface:${surface}` });
  }
  return seeds;
}

/**
 * Parse rule-shaped claims from docs/CLAUDE.md — source (d). A rule-shaped line
 * (never/always/must) is mapped to a compiled query by keyword; a line matching no
 * keyword compiles to nothing and is refused upstream. The claim is VERIFIED
 * against code by the caller — the prose alone is never trusted.
 */
function parseDocsClaims(repo, paths) {
  const seeds = [];
  const docPaths = paths.filter(
    (p) => p === 'CLAUDE.md' || (p.startsWith('docs/') && p.toLowerCase().endsWith('.md')),
  );
  for (const rel of docPaths) {
    const text = readTextSafe(join(repo, rel));
    if (text === null) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/\b(never|always|must)\b/i.test(line)) continue; // not rule-shaped
      const hit = DOCS_KEYWORDS.find((k) => k.kw.test(line));
      // No keyword → the claim compiles to no checkable query → REFUSE (unfalsifiable).
      if (!hit) continue;
      seeds.push({ surface: hit.surface, owner: null, provenance: `docs:${rel}:${i + 1}` });
    }
  }
  return seeds;
}

/**
 * Re-verify a compiled query IN PROCESS over the code tree: classify each code line
 * as conforming / violating (violating wins ties). Returns real repo-relative
 * citations for the conforming (witnessing) sites plus the site counts.
 */
function verify(repo, paths, query) {
  const citations = [];
  let conforming = 0;
  let violating = 0;
  for (const rel of paths) {
    if (!isCode(rel)) continue;
    const text = readTextSafe(join(repo, rel));
    if (text === null) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (query.violating.test(line)) {
        violating++;
      } else if (query.conforming.test(line)) {
        conforming++;
        citations.push(`${rel}:${i + 1}`);
      }
    }
  }
  return { citations, conforming, violating };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node mine.mjs --repo <path> --scan <scan-notes.md> --out <mined.json>');
    return;
  }
  for (const [flag, val] of [['--repo', args.repo], ['--scan', args.scan], ['--out', args.out]]) {
    if (!val) {
      console.error(`missing required ${flag}`);
      process.exit(2);
    }
  }
  if (!existsSync(args.scan)) {
    console.error(`scan notes not found: ${args.scan}`);
    process.exit(2);
  }

  const corpusSha = readHeadSha(args.repo);
  const paths = walk(args.repo);

  // Candidate seeds: (a) scan-notes nominations, (d) verified docs/CLAUDE.md claims.
  const seeds = [
    ...parseScanNotes(readFileSync(args.scan, 'utf8')),
    ...parseDocsClaims(args.repo, paths),
  ];

  const candidates = [];
  const seenRules = new Set();
  for (const seed of seeds) {
    // Object.hasOwn guards the untrusted scan-notes trust boundary: a `## surface:` name
    // that is a prototype key (__proto__, constructor, toString, …) would otherwise return
    // an inherited value from a bracket lookup and crash verify(). No OWN query here →
    // the candidate cannot compile to a falsifiable check → refuse (skip).
    if (!Object.hasOwn(MINE_QUERIES, seed.surface)) continue;
    const query = MINE_QUERIES[seed.surface];
    if (seenRules.has(query.rule)) continue; // dedupe implied/redundant candidates

    const { citations, conforming, violating } = verify(args.repo, paths, query);
    const sites = conforming + violating;

    // Witness-or-drop (constitution rule 2): <2 real citations → REJECTED before output.
    if (citations.length < 2) continue;

    // Deterministic re-verification: ≥90% over ≥5 sites ⇒ invariant; else hypothesis → DROP.
    const ratio = sites === 0 ? 0 : conforming / sites;
    if (!(ratio >= 0.9 && sites >= 5)) continue;

    seenRules.add(query.rule);
    candidates.push({
      rule: query.rule,
      owner: ALLOWED_OWNERS.has(seed.owner) ? seed.owner : query.owner,
      provenance: seed.provenance,
      citations: citations.slice(0, MAX_CITATIONS),
      conformance: { ratio, conforming, violating, sites },
      confirmed_at_sha: corpusSha,
      confirmed_by: null, // owner-gated — never set by this run
      ratification: null, // owner-gated — never set by this run
    });
  }

  // Ranking (cheap in-process proxy): citation count, then distinct-file spread.
  // Author/commit-diversity via git blame is git-history → DEFERRED.
  candidates.sort((a, b) => {
    // rank by the TRUE conforming-site count (citations are capped for output)
    if (b.conformance.conforming !== a.conformance.conforming) return b.conformance.conforming - a.conformance.conforming;
    const spread = (c) => new Set(c.citations.map((x) => x.split(':')[0])).size;
    const sb = spread(b), sa = spread(a);
    if (sb !== sa) return sb - sa;
    return a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0;
  });

  const note = 'review mined.json — the owner confirms which candidates become rules';
  const mined = { corpus_sha: corpusSha, candidates, note };

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(mined, null, 2)}\n`);
  console.error(`veriloop mine — ${args.repo}`);
  console.error(`  ${seeds.length} candidate seed(s); ${candidates.length} survived witness-or-drop + re-verification`);

  // OWNER-GATED HALT: mine PROPOSES, it does not write or confirm the constitution.
  console.log(note);
  process.exit(0);
}

main();
