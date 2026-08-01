#!/usr/bin/env node
// veriloop phase 8 (artifact-lint half) — validate an emitted bundle by READING it, with
// one narrow lazily-taken exception (see getSecretPatterns). Catches what makes a bundle
// silently broken: invalid workflow syntax, non-portable absolute paths, leftover
// placeholders, missing command frontmatter, dangling expert references, an empty gate.
// (The rest of phase 8 — a fresh-context agent driving the real loop — is separate.)
//
// Usage: node lint-bundle.mjs --bundle <repo-or-out-root> [--name <repoName>]

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { listDir, isDir } from './lib/util.mjs';
import { SECRET_TRIGGER } from './lib/domain.mjs';

// The commands veriloop emits into `.claude/commands/`. ONE source of truth
// (rule 9) — referenced by every check below (bundle-file collection, frontmatter
// validation) so a new command is covered everywhere at once. Adding a command
// means adding it HERE and nowhere else.
export const EMITTED_COMMANDS = ['dev-loop.md', 'advise.md', 'review.md', 'dev-plan.md', 'posture.md'];

function parseArgs(argv) {
  const args = { bundle: process.cwd(), name: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--bundle') args.bundle = resolve(argv[++i]);
    else if (argv[i] === '--name') args.name = argv[++i];
  }
  return args;
}

const fails = [];
const warns = [];
const oks = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const ok = (m) => oks.push(m);

/**
 * The files veriloop OWNS in the target repo — never other pre-existing files in
 * the repo's `.claude/` (a hand-built sibling workflow, settings, lockfiles). The
 * manifest's `emitted_files` is the authoritative list of what generate wrote;
 * scoping to it stops the linter from flagging, e.g., a repo's own `*-advise.js`.
 */
function bundleFiles(root) {
  const man = join(root, '.claude/veriloop/veriloop-manifest.json');
  if (existsSync(man)) {
    try {
      const m = JSON.parse(readFileSync(man, 'utf8'));
      const paths = (m.emitted_files || []).map((e) => join(root, e.path)).filter((p) => existsSync(p));
      if (paths.length) return [...paths, man]; // manifest isn't in its own list
    } catch { /* fall through to the pattern scope */ }
  }
  // Fallback (no/unreadable manifest): only veriloop-owned locations.
  const out = [];
  const walk = (dir) => {
    for (const name of listDir(dir)) {
      if (name === '.backups') continue;
      const abs = join(dir, name);
      if (isDir(abs)) walk(abs);
      else out.push(abs);
    }
  };
  const vdir = join(root, '.claude/veriloop');
  if (isDir(vdir)) walk(vdir);
  for (const c of EMITTED_COMMANDS) {
    const cmd = join(root, '.claude/commands', c);
    if (existsSync(cmd)) out.push(cmd);
  }
  const wfDir = join(root, '.claude/workflows');
  for (const n of listDir(wfDir) || []) if (n.endsWith('-dev-loop.js')) out.push(join(wfDir, n));
  return out;
}

/** Syntax-check a workflow the way the Workflow harness parses it. */
function checkWorkflowSyntax(path) {
  const src = readFileSync(path, 'utf8');
  const wrapped = `async function __wf(){\n${src.replace(/^export\s+const\s+meta/m, 'const meta')}\n}`;
  const tmp = join(mkdtempSync(join(tmpdir(), 'veriloop-')), 'wf.mjs');
  writeFileSync(tmp, wrapped);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  return { okSyntax: r.status === 0, err: (r.stderr || '').split('\n').slice(0, 4).join('\n') };
}

function main() {
  const args = parseArgs(process.argv);
  const files = bundleFiles(args.bundle);
  if (!files.length) {
    console.error(`no .claude bundle found under ${args.bundle}`);
    process.exit(2);
  }

  // 1. portability — no absolute paths anywhere
  const ABS = /(\/Users\/|\/home\/[a-z]|\b[A-Z]:[\\/])/;
  let absHits = 0;
  for (const f of files) {
    if (/\.(js|json|md)$/.test(f)) {
      const t = readFileSync(f, 'utf8');
      const bad = t.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => ABS.test(l));
      for (const [ln, l] of bad) { absHits++; fail(`absolute path in ${f.slice(args.bundle.length + 1)}:${ln} → ${l.trim().slice(0, 80)}`); }
    }
  }
  if (!absHits) ok('portable — no absolute paths in any emitted file');

  // 2. no leftover placeholders
  let ph = 0;
  for (const f of files) {
    const t = readFileSync(f, 'utf8');
    if (/generate\.mjs splices|\{\{[A-Z_]+\}\}|<<SLOT/.test(t)) { ph++; fail(`leftover placeholder in ${f.slice(args.bundle.length + 1)}`); }
  }
  if (!ph) ok('no leftover template placeholders');

  // 3. workflow file — locate, syntax-check, portability token, gate wiring
  const wfDir = join(args.bundle, '.claude/workflows');
  const wfFiles = (listDir(wfDir) || []).filter((n) => n.endsWith('-dev-loop.js'));
  if (!wfFiles.length) fail('no <repo>-dev-loop.js workflow emitted');
  for (const n of wfFiles) {
    const p = join(wfDir, n);
    const { okSyntax, err } = checkWorkflowSyntax(p);
    if (okSyntax) ok(`workflow ${n} — valid harness syntax`); else fail(`workflow ${n} — SYNTAX ERROR:\n${err}`);
    const src = readFileSync(p, 'utf8');
    // the Workflow harness forbids these at runtime; they are syntax-valid, so
    // node --check alone gives false confidence
    const FORBIDDEN = [
      [/\bDate\.now\s*\(/, 'Date.now()'],
      [/\bnew\s+Date\s*\(/, 'new Date()'],
      [/\bMath\.random\s*\(/, 'Math.random()'],
      [/\bprocess\.(env|argv|exit|cwd)\b/, 'process.*'],
      [/\brequire\s*\(/, 'require()'],
      [/^\s*import\s+[\w{*]/m, 'import statement'],
    ];
    for (const [re, label] of FORBIDDEN) {
      if (re.test(src)) fail(`workflow ${n} — uses harness-forbidden API: ${label}`);
    }
    if (!FORBIDDEN.some(([re]) => re.test(src))) ok(`workflow ${n} — no harness-forbidden APIs`);
    if (/CLAUDE_PROJECT_DIR|git rev-parse --show-toplevel/.test(src)) ok(`workflow ${n} — resolves repo root portably`); else fail(`workflow ${n} — no portable repo-root resolution`);
    // gate must be wired with at least one real command
    const m = src.match(/"gate":\s*\[([^\]]*)\]/);
    if (m && /"cmd":/.test(m[1])) ok(`workflow ${n} — gate wired with real command(s)`); else fail(`workflow ${n} — empty/unwired gate`);
    // every referenced expert file must exist
    for (const fm of src.matchAll(/"file":\s*"(\.claude\/veriloop\/experts\/[^"]+)"/g)) {
      const ep = join(args.bundle, fm[1]);
      if (existsSync(ep)) ok(`expert file present: ${fm[1]}`); else fail(`workflow references missing expert file: ${fm[1]}`);
    }
  }

  // 4. command frontmatter — every emitted command (/dev-loop, /advise, /review,
  //    /dev-plan, /posture) must have valid frontmatter with a description; a missing one
  //    is a FAIL (an emitted surface must ship, not silently vanish).
  for (const c of EMITTED_COMMANDS) {
    const name = `/${c.replace(/\.md$/, '')}`;
    const cmd = join(args.bundle, '.claude/commands', c);
    if (existsSync(cmd)) {
      const t = readFileSync(cmd, 'utf8');
      if (/^---\n[\s\S]*?\n---/.test(t) && /description:/.test(t)) ok(`${name} command has valid frontmatter`); else fail(`${name} command missing frontmatter/description`);
    } else fail(`no .claude/commands/${c} emitted`);
  }

  // 5. constitution + manifest integrity
  const con = join(args.bundle, '.claude/veriloop/constitution.md');
  if (existsSync(con)) ok('constitution.md present'); else fail('no constitution.md emitted');

  const man = join(args.bundle, '.claude/veriloop/veriloop-manifest.json');
  if (existsSync(man)) {
    try {
      const m = JSON.parse(readFileSync(man, 'utf8'));
      if (m.roster?.length) ok(`manifest: ${m.roster.length} experts (${m.roster.map((e) => e.key).join(', ')})`); else fail('manifest: empty roster');
      if (m.gate_commands?.length) ok(`manifest: gate = ${m.gate_commands.map((c) => c.cmd).join(' | ')}`); else fail('manifest: empty gate');
      // every expert with only weak evidence is a smell (jobless-expert guard)
      for (const e of m.roster || []) if (e.key !== 'code-review' && (!e.evidence || !e.evidence.length)) warn(`expert '${e.key}' has no evidence (possible jobless expert)`);
      // every roster expert's persona file must exist on disk
      for (const e of m.roster || []) {
        if (!e.file) continue;
        if (existsSync(join(args.bundle, e.file))) ok(`roster persona present: ${e.file}`);
        else fail(`roster expert '${e.key}' persona missing: ${e.file}`);
      }
      // the workflow's wired gate must equal the manifest's gate commands
      const wfDirX = join(args.bundle, '.claude/workflows');
      const wfX = (listDir(wfDirX) || []).find((x) => x.endsWith('-dev-loop.js'));
      if (wfX && m.gate_commands) {
        const srcX = readFileSync(join(wfDirX, wfX), 'utf8');
        const gm = srcX.match(/"gate":\s*\[([^\]]*)\]/);
        const wired = gm ? [...gm[1].matchAll(/"cmd":\s*"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse(`"${x[1]}"`)) : [];
        const manifest = m.gate_commands.map((c) => c.cmd);
        if (JSON.stringify(wired) === JSON.stringify(manifest)) ok('workflow gate matches manifest gate_commands');
        else fail(`gate mismatch — workflow [${wired.join(' | ')}] vs manifest [${manifest.join(' | ')}]`);
      }
    } catch (e) { fail(`manifest is not valid JSON: ${e.message}`); }
  } else fail('no veriloop-manifest.json emitted');

  // 6. committed attestation records — defense-in-depth (constitution rule 7). The
  //     redaction routine already runs at emit time; this backstop re-scans what actually
  //     landed in `.claude/veriloop/history/*.json` (excluding `dry-runs/`, which are
  //     never committed) for the SAME absolute-path regex plus the SAME SECRET_PATTERNS
  //     array the workflow's `veriloop:emit` region defines — extracted from the emitted
  //     workflow itself (the same marker-slice-and-`new Function` technique the selftest
  //     uses), never a second hardcoded copy (constitution rule 9). A hit here means a
  //     record escaped redaction and got committed anyway.
  //     Shared with `.claude/veriloop/domain/` (6b) and manifest `domain_facts` (6c):
  //     all three are committed files fed by third-party text.
  //
  //     LAZY AND MEMOIZED, deliberately. `new Function(...)` EXECUTES code taken out of the
  //     bundle being scanned, and lint-bundle is a SCANNER aimed at third-party bundles.
  //     Hoisting the call to top level ran it for EVERY bundle — including ones with no
  //     history/, no domain/ and no manifest, where nothing consumes the result. Only the
  //     three consumers below call it, so a bundle with none of those surfaces is never
  //     executed at all.
  let secretPatternsCache = null;
  function getSecretPatterns() {
    if (secretPatternsCache !== null) return secretPatternsCache;
    secretPatternsCache = [];
    const wfDirH = join(args.bundle, '.claude/workflows');
    const wfH = (listDir(wfDirH) || []).find((n) => n.endsWith('-dev-loop.js'));
    if (wfH) {
      const src = readFileSync(join(wfDirH, wfH), 'utf8');
      const S = '// <<< veriloop:emit:start >>>';
      const E = '// <<< veriloop:emit:end >>>';
      const si = src.indexOf(S);
      const ei = src.indexOf(E);
      if (si !== -1 && ei !== -1) {
        try {
          secretPatternsCache = new Function(`${src.slice(si + S.length, ei)}; return SECRET_PATTERNS;`)();
        } catch { /* fall through — treated as no patterns available */ }
      }
      // A workflow exists but yielded no patterns: every rule-7 backstop below then has
      // nothing to match with and reports nothing. Say so ONCE, here, rather than letting
      // three checks print a reassuring ok() for a loop that never ran.
      if (!secretPatternsCache.length) {
        warn(`workflow ${wfH} — SECRET_PATTERNS could not be extracted from its veriloop:emit region; the rule-7 secret backstops (committed records, domain bundle, manifest domain_facts) are SKIPPED, not passing`);
      }
    }
    return secretPatternsCache;
  }

  const histDir = join(args.bundle, '.claude/veriloop/history');
  if (isDir(histDir)) {
    const secretPatterns = getSecretPatterns();
    let histHits = 0;
    const walkHist = (dir, rel) => {
      for (const name of listDir(dir)) {
        if (rel === '' && name === 'dry-runs') continue; // dry-run records never commit
        const abs = join(dir, name);
        if (isDir(abs)) walkHist(abs, rel ? `${rel}/${name}` : name);
        else if (name.endsWith('.json')) {
          const t = readFileSync(abs, 'utf8');
          const relPath = `.claude/veriloop/history/${rel ? `${rel}/${name}` : name}`;
          t.split('\n').forEach((line, i) => {
            if (ABS.test(line)) { histHits++; fail(`absolute path in committed attestation record ${relPath}:${i + 1} → ${line.trim().slice(0, 80)}`); return; }
            for (const re of secretPatterns) {
              if (re.test(line)) { histHits++; fail(`secret-shaped content in committed attestation record ${relPath}:${i + 1}`); break; }
            }
          });
        }
      }
    };
    walkHist(histDir, '');
    if (!histHits) ok('committed attestation records scanned for absolute paths + secret patterns');
  }

  // 6b. the domain bundle — the SAME backstop, for the same reason (constitution rule 7).
  //     `.claude/veriloop/domain/` is fed entirely by third-party text: dependency version
  //     strings copied out of a `package.json` / `pyproject.toml` / `Cargo.toml` (a
  //     `git+https://x-access-token:<PAT>@…` requirement or a private index URL is a
  //     common real pattern) and the url/title/rationale of an external source. Those are
  //     scrubbed at the source in `domain.mjs scrubSecrets`, and these files are
  //     COMMITTED, so the scrub gets a backstop rather than being trusted alone. Scoped
  //     to `domain/` deliberately: the manifest legitimately carries `"key": "code-review"`
  //     and would trip the KEY pattern.
  //     The `getSecretPatterns().length` guard mirrors 6c: with an empty pattern set the
  //     inner loop never runs, so the ok() below reported a check that could not have failed.
  //     The TRIGGER entry is swapped for `domain/*` only. The workflow's own
  //     `SECRET_PATTERNS[0]` is a PREFIX match (`[A-Z0-9_]*(KEY|TOKEN|…)[A-Z0-9_]*[=:]`), so
  //     it fires on an ordinary academic title — `Tokenization: A Survey`,
  //     `Secretariat: an agent benchmark`. `domain/*` is the one emitted surface whose
  //     content is prose quoted from external sources, and `domain.mjs`'s scrub
  //     deliberately leaves those titles VERBATIM; a backstop that rejects what its own
  //     scrub emits leaves the gate permanently red on a machine-owned file the owner is
  //     told not to hand-edit. So the identifier-shaped `SECRET_TRIGGER` is imported from
  //     `domain.mjs` rather than re-typed (rule 9 — the scrub and its backstop are the same
  //     rule, by construction). Residual miss, stated rather than hidden:
  //     `MY_TOKENIZER=secret` matches neither, because `TOKEN` is not `_`-delimited there.
  //     Every other SECRET_PATTERNS entry is used unchanged.
  const domDir = join(args.bundle, '.claude/veriloop/domain');
  if (isDir(domDir) && getSecretPatterns().length) {
    // `/PASSWD/` identifies the trigger entry: it is the one alternation only that entry has.
    const domPatterns = getSecretPatterns().map((re) => (/PASSWD/.test(re.source) ? SECRET_TRIGGER : re));
    let domHits = 0;
    for (const name of listDir(domDir)) {
      // `listDir` filters by NAME only, so a directory called `notes.md` would reach
      // `readFileSync` and throw EISDIR — guarded like every other walk in this file.
      const p = join(domDir, name);
      if (!/\.(md|json)$/.test(name) || isDir(p)) continue;
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        for (const re of domPatterns) {
          if (re.test(line)) { domHits++; fail(`secret-shaped content in emitted domain artifact .claude/veriloop/domain/${name}:${i + 1}`); break; }
        }
      });
    }
    if (!domHits) ok('domain bundle scanned for secret patterns (dependency specs and third-party source metadata)');
  }

  // 6c. the SAME third-party dependency strings also land in `veriloop-manifest.json` →
  //     `domain_facts`, which `generate.mjs` emits UNCONDITIONALLY — for every adopter,
  //     whether or not `domain.json` exists and `domain/` is ever written. Scoping the
  //     backstop to `domain/` alone therefore left the common case with exactly one line
  //     of defence (`domain.mjs scrubSecrets`), which is the posture 6b's own comment
  //     rejects. Scoped to the `domain_facts` BLOCK, not the whole manifest, for the
  //     reason 6b gives: the manifest legitimately carries `"key": "code-review"`.
  //     (Absolute paths in the manifest are already covered by check 1 — it is a `.json`
  //     in `emitted_files` — so only the secret patterns are re-scanned here.)
  if (existsSync(man) && getSecretPatterns().length) {
    const secretPatterns = getSecretPatterns();
    try {
      const facts = JSON.parse(readFileSync(man, 'utf8')).domain_facts;
      if (facts) {
        let factHits = 0;
        JSON.stringify(facts, null, 2).split('\n').forEach((line, i) => {
          for (const re of secretPatterns) {
            if (re.test(line)) { factHits++; fail(`secret-shaped content in veriloop-manifest.json → domain_facts (block line ${i + 1}): ${line.trim().slice(0, 60)}`); break; }
          }
        });
        if (!factHits) ok('manifest domain_facts scanned for secret patterns (emitted for every adopter, domain subsystem or not)');
      }
    } catch { /* the manifest-integrity check above already reported this */ }
  }

  // (6d, the `domain/expert.md` accretion tripwire, was RETIRED by owner ruling: T12
  //  retired ALL THREE length caps and the spec's § Open RISKS explicitly declined a
  //  replacement. Guard-wiring item 2 asked for the cap's SCOPE to be extended; T12 deleted
  //  the cap it referenced, so there was nothing to extend. No accretion guard covers
  //  `domain/expert.md`, by decision.)

  // 7. domain subsystem existence — `.claude/veriloop/domain/` is deliberately NOT in
  //    `manifest.roster`, so the persona-presence check above (`roster persona present`)
  //    cannot cover it, and `bundleFiles` SILENTLY DROPS emitted paths that no longer
  //    exist on disk (`.filter((p) => existsSync(p))`) — so a deleted domain file is
  //    invisible to every other check here. That is the `c88f130` class: a deletion that
  //    takes an artifact nobody listed, on a green gate. Two directions, both FAIL:
  //    (a) an `emitted_files` entry under `domain/` that is gone; (b) a bundle that has
  //    the domain INPUT but is missing one of the three machine-owned outputs (a generate
  //    run that skipped the domain writer). No domain input → one explicit `ok`, so the
  //    skip is visible in the report rather than being an absence of output.
  const DOMAIN_REQUIRED = ['audit.md', 'expert.md', 'references.json'];
  const domainInputPath = join(args.bundle, '.claude/veriloop/domain.json');
  let domainEmitted = [];
  if (existsSync(man)) {
    try {
      domainEmitted = (JSON.parse(readFileSync(man, 'utf8')).emitted_files || [])
        .map((e) => e.path)
        .filter((p) => p.startsWith('.claude/veriloop/domain/'));
    } catch { /* the manifest-integrity check above already reported this */ }
    let missing = 0;
    for (const p of domainEmitted) {
      if (!existsSync(join(args.bundle, p))) { missing++; fail(`domain file listed in emitted_files is missing on disk: ${p}`); }
    }
    if (domainEmitted.length && !missing) ok(`domain subsystem: all ${domainEmitted.length} emitted domain files present`);
  }
  // "Installed" cannot key off the DEFAULT input path alone: `generate.mjs` accepts
  // `--domain <path>`, so a bundle built from an input kept outside `.claude/veriloop/`
  // has domain artifacts in `emitted_files` and no `domain.json` where this looks — and
  // the check would print the reassuring "not installed — check skipped" for a subsystem
  // that IS installed, which is the exact reassurance-on-absence failure it exists to stop.
  const domainInstalled = existsSync(domainInputPath) || domainEmitted.length > 0;
  if (domainInstalled) {
    let absent = 0;
    for (const f of DOMAIN_REQUIRED) {
      if (!existsSync(join(args.bundle, '.claude/veriloop/domain', f))) {
        absent++;
        fail(`the domain subsystem is installed but .claude/veriloop/domain/${f} was never emitted — re-run generate`);
      }
    }
    if (!absent) ok('domain subsystem: the domain input has all three machine-owned artifacts');
  } else {
    ok('domain subsystem not installed — check skipped');
  }

  // report
  const name = args.name || '(bundle)';
  console.log(`\nveriloop lint — ${name} @ ${args.bundle.split('/').slice(-1)[0]}`);
  for (const m of oks) console.log(`  ✓ ${m}`);
  for (const m of warns) console.log(`  ⚠ ${m}`);
  for (const m of fails) console.log(`  ✗ ${m}`);
  console.log(`\n  ${oks.length} ok, ${warns.length} warn, ${fails.length} fail`);
  process.exit(fails.length ? 1 : 0);
}

main();
