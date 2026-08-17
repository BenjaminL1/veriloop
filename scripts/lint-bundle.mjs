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
      const paths = (m.emitted_files || []).filter((e) => lintable(e, root)).map((e) => join(root, e.path)).filter((p) => existsSync(p));
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
    if (/\.(js|mjs|json|md)$/.test(f)) {
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
      // the workflow's spliced config must equal the manifest's copy — `gate_commands`
      // first, and now EVERY key emitted into both places. Generalized from the gate-only
      // comparison because `budget` and `crossModel` were emitted twice and checked once;
      // `resolve_default` and `protected_paths` join the table rather than adding two more
      // unchecked copies. One key table, so a new emitted key is covered by a new row.
      const PARITY_KEYS = [
        ['gate_commands', 'gate'],
        ['budget', 'budget'],
        ['cross_model', 'crossModel'],
        ['resolve_default', 'resolveDefault'],
        ['protected_paths', 'protectedPaths'],
      ];
      const wfDirX = join(args.bundle, '.claude/workflows');
      const wfX = (listDir(wfDirX) || []).find((x) => x.endsWith('-dev-loop.js'));
      if (wfX) {
        const srcX = readFileSync(join(wfDirX, wfX), 'utf8');
        const cfgRaw = (srcX.match(/^const VERILOOP = (\{[\s\S]*?\n\});$/m) || [])[1];
        let cfg = null;
        try { cfg = cfgRaw ? JSON.parse(cfgRaw) : null; } catch { /* reported below */ }
        if (!cfg) {
          fail(`workflow ${wfX} — its spliced VERILOOP config could not be read, so NOT ONE manifest↔workflow parity key could be compared (re-run generate)`);
        } else {
          let diverged = 0;
          for (const [mKey, wKey] of PARITY_KEYS) {
            // absent from BOTH = a bundle predating the key, not a divergence
            if (!(mKey in m) && !(wKey in cfg)) continue;
            if (JSON.stringify(m[mKey]) === JSON.stringify(cfg[wKey])) continue;
            diverged++;
            fail(`manifest↔workflow parity: manifest \`${mKey}\` and workflow \`${wKey}\` disagree — the emitted config has two copies and only one was updated. Re-run \`node scripts/generate.mjs\` to regenerate the bundle from its single source of truth.`);
          }
          if (!diverged) ok(`workflow config matches the manifest on every emitted key (${PARITY_KEYS.map(([k]) => k).join(', ')})`);
        }
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

  // 6a. the TEMP-ROOT backstop, TIMESTAMP-GATED (owner ratification, 2026-08-16 — Q2 of
  //     `.claude/veriloop/specs/review-remediation-2026-08-15.md`). The emitted workflow's
  //     `redactStr` has dropped temp-root lines since 2026-08-15, but this backstop scanned
  //     with ABS alone, so the widening covered new records and nothing else. It now covers
  //     every record EXCEPT the ones the cutoff exempts: a record whose FILENAME timestamp
  //     parses to a moment BEFORE `TEMP_BACKSTOP_FROM` is scanned with ABS alone, exactly as
  //     it always was — that exemption is what keeps the two temp-carrying records already
  //     committed here (2026-07-21, 2026-08-04) green, since a retroactive widening turns the
  //     gate red on history nobody can rewrite without the owner. Everything else is
  //     additionally whole-line-failed on the temp-root shapes.
  //
  //     FAIL-CLOSED ON AN UNPARSEABLE NAME. The predicate is written `!(instant < CUTOFF)`
  //     rather than `instant >= CUTOFF` because EVERY comparison with NaN is false: the `>=`
  //     spelling silently exempted any record whose name is not `<ts>.json` — `notes.json`,
  //     `restored.json` — which is the wrong side to fail toward, since a hand-placed file is
  //     exactly the case this backstop exists for. Only a name that PARSES, to a moment
  //     before the cutoff, is exempt. That costs nothing here: all six committed records
  //     parse and parse pre-cutoff, so none of them change verdict.
  //
  //     THE RESIDUAL BYPASS, NAMED rather than implied: the gate is still the record's own
  //     FILE NAME, so a record BACKDATED to a parseable pre-cutoff stamp —
  //     `2020-01-01T00-00-00Z.json` — is exempted exactly as a genuine pre-cutoff record is.
  //     No parse fix closes that; it is what gating on a self-reported name means. Closing it
  //     needs a different gate (the commit date, or scanning every record and hand-amending
  //     the two), which is an owner call and not a lint tweak.
  //
  //     The regex is a MIRRORED LITERAL, the same convention ABS already uses in its three
  //     copies (the template's `attestationFrom`, and selftest :980/:1922): lint-bundle is a
  //     scanner aimed at third-party bundles, so it must be able to scan one whose workflow it
  //     has not executed. Both halves of the anchor are load-bearing and are documented at the
  //     source — the non-word class (so `docs/private/notes.md` is not a temp path, while
  //     `file:///tmp/x` still is) and the `%REPO%` lookbehind (so a repo with its own `tmp/`
  //     directory does not empty its own attestation).
  const TEMP = /(?:^|[^\w])(?<!%REPO%)\/(?:private|tmp|var\/folders)\//; // === dev-loop.template.js redactStr TEMP
  const TEMP_BACKSTOP_FROM = Date.parse('2026-08-16T00:00:00Z');
  // `2026-08-17T04-05-06Z.json` → the instant it names. NaN for any other shape, and NaN
  // compares false against everything — so the exemption below is spelled as a NEGATED
  // `<`, which puts an unparseable name on the SCANNED side rather than the exempt one.
  const recordInstant = (name) => {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.json$/.exec(name);
    return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : NaN;
  };

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
          const tempScanned = !(recordInstant(name) < TEMP_BACKSTOP_FROM); // NaN ⇒ scanned
          t.split('\n').forEach((line, i) => {
            if (ABS.test(line)) { histHits++; fail(`absolute path in committed attestation record ${relPath}:${i + 1} → ${line.trim().slice(0, 80)}`); return; }
            if (tempScanned && TEMP.test(line)) { histHits++; fail(`temp-root path in committed attestation record ${relPath}:${i + 1} → ${line.trim().slice(0, 80)} (every record is scanned for /tmp/, /private/ and /var/folders/ unless its filename timestamp parses to before 2026-08-16)`); return; }
            for (const re of secretPatterns) {
              if (re.test(line)) { histHits++; fail(`secret-shaped content in committed attestation record ${relPath}:${i + 1}`); break; }
            }
          });
        }
      }
    };
    walkHist(histDir, '');
    if (!histHits) ok('committed attestation records scanned for absolute paths + secret patterns (and for temp-root paths, except where the filename timestamp parses to before 2026-08-16)');
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
  //    run that skipped the domain writer). No domain input → one explicit line, so the
  //    outcome is visible in the report rather than being an absence of output: a WARN when
  //    the bundle ships `/advise` (the degraded path — see below), otherwise a plain `ok`.
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
    if (!absent) {
      ok('domain subsystem: the domain input has all three machine-owned artifacts');

      // 7b. INTEGRITY of `audit.md` and `expert.md` — the same bar check 8b holds
      //     `session-routing.md` to, and for the same reason it was invented. `expert.md` is
      //     adopted VERBATIM by four stance seats plus the main session in `/advise`, and
      //     `audit.md` is where those seats are sent for the evidence behind it. Both are
      //     machine-owned and committed, and until now the existence check above was the whole
      //     guard: verified by mutation on a pristine `git archive` copy, appending a line to
      //     either file left both gates fully green, 0 fail, exit 0. Presence is not integrity.
      //
      //     Byte equality is DECIDABLE here because both renderers are pure functions of two
      //     committed inputs: `domain.json` (the hand/LLM-owned judgment half) and the
      //     manifest's `domain_facts` (the script-owned facts half, written by the SAME
      //     generate run that wrote these files). The census is deliberately NOT recomputed
      //     from the live tree — that would turn "somebody added a directory" into a hard gate
      //     failure, which is staleness, not tampering, and the recomputation is exactly what
      //     `selftest.mjs` pins instead.
      //
      //     FAIL, not warn: machine-owned means "I edited it" is not an ownership right the way
      //     an edited `*.overrides.md` is, and `node generate.mjs` restores it. The differing
      //     text is NOT echoed — `domain.json` carries third-party dependency and source
      //     metadata, so anything spliced into these files is attacker-controlled by the same
      //     route `session-routing.md`'s diff is.
      let canon = null;
      if (!existsSync(domainInputPath) || !existsSync(man)) {
        // `--domain <path>` can point outside the bundle, and then the input simply is not
        // here to re-render from. Say so rather than printing an `ok` for a check that never
        // ran — the reassurance-on-absence failure check 7 exists to stop.
        warn('domain subsystem: the domain INPUT is not in the bundle (built with --domain pointing elsewhere?), so audit.md / expert.md could not be checked for byte-integrity — they are machine-owned and a hand edit there is invisible to this gate');
      } else {
        try {
          const di = JSON.parse(readFileSync(domainInputPath, 'utf8'));
          const mf = JSON.parse(readFileSync(man, 'utf8'));
          const facts = mf.domain_facts || {};
          const opts = { repoName: mf.repo_name || args.name || '(bundle)', repo: args.bundle, facts };
          canon = {
            'audit.md': renderDomainAudit(di, facts, opts),
            'expert.md': renderDomainExpert(di, buildReferences(di), opts),
          };
        } catch {
          // The render threw — a `domain.json` that no longer parses, or a citation in it
          // that no longer resolves. A real defect, but not this check's verdict to
          // describe, and the exception message quotes `domain.json` text.
          fail('.claude/veriloop/domain/{audit,expert}.md could not be re-rendered from domain.json + the manifest\'s domain_facts, so their integrity is UNKNOWN — run `node generate.mjs`, which reports the underlying error (not echoed here: it quotes third-party text)');
        }
      }
      let tampered = 0;
      for (const f of canon ? Object.keys(canon) : []) {
        const doc = readFileSync(join(args.bundle, '.claude/veriloop/domain', f), 'utf8');
        if (doc === canon[f]) continue;
        tampered++;
        const shape = doc.startsWith(canon[f]) ? `${doc.length - canon[f].length} bytes APPENDED after the canonical render` : `${doc.length} bytes vs ${canon[f].length} canonical`;
        fail(`.claude/veriloop/domain/${f} does not match what veriloop emits from domain.json + the manifest's domain_facts (${shape}) — EITHER this file was tampered with, OR your bundle predates your current veriloop version. This check cannot tell those apart and does not try: it FAILS for both, deliberately, and the remedy is the same one. It is machine-owned and /advise adopts it verbatim, so a hand edit here is an edit to every consult. Re-run generate to restore it; to change it for real, change domain.json. (The differing text is deliberately not echoed.)`);
      }
      if (canon && !tampered) ok('domain subsystem: audit.md and expert.md are byte-identical to what the renderers emit from domain.json + the manifest\'s domain_facts');

      // SIZE, INFORMATIONAL ONLY. Not a check: it cannot fail, cannot warn, and cannot move
      // this run's exit code. `expert.md` is adopted verbatim by every /advise consult and by
      // four stance subagents, so its length is a cost every consult pays and a number worth
      // seeing — but the owner retired all three length caps (T12) and chose a review-on-growth
      // PROMPT over a replacement cap, so the gate has no opinion about this number. The prompt
      // that does have one lives in `generate.mjs` (EXPERT_GROWTH_MARGIN), fires on GROWTH
      // against the manifest's recorded baseline, and also only prints.
      {
        const p = join(args.bundle, '.claude/veriloop/domain/expert.md');
        if (existsSync(p)) {
          const t = readFileSync(p, 'utf8');
          ok(`domain subsystem: expert.md is ${(t.match(/\S+/g) || []).length} words / ${Buffer.byteLength(t, 'utf8')} bytes — informational, NOT a limit (there is no length cap; generate prompts a re-read on growth)`);
        }
      }
    }
  } else if (existsSync(join(args.bundle, '.claude/commands/advise.md'))) {
    // The DEGRADED PATH, named rather than reported as a clean skip. Since the Phase 2
    // `/advise` redesign the domain expert is that command's SOLE lens, so a bundle with
    // `/advise` and no `domain/expert.md` has ZERO lens seats: the consult degrades to the
    // PREMISE reviewer alone (the command says so and discloses it, `advise.md` step 1).
    // That is the state of every bundle generated before the domain subsystem existed, and
    // `generate.mjs` treats a missing `domain.json` as a no-op — so it is reached by doing
    // nothing. A plain `ok` here would report "check skipped" for a command running at a
    // fraction of its documented council. WARN, not fail: the degradation is disclosed and
    // supported, so it must not break a pre-existing adopter's gate (exit stays 0).
    // The remediation names the path that WORKS. It used to say "run generate with
    // --domain", which hard-errors for exactly the adopter this WARN describes: `--domain`
    // names an EXISTING input file (`generate.mjs:43`) and generate passes
    // `{ required: !!args.domain }`, so an adopter with no `domain.json` — the state this
    // line reports — gets an ENOENT throw for following the advice. `domain.json` is
    // AUTHORED by the skill's Phase 7.5, never by the generator.
    warn('domain subsystem not installed — /advise has NO lens seats and degrades to the PREMISE reviewer alone (run /veriloop: its Phase 7.5 authors .claude/veriloop/domain.json, which generate then reads. Do NOT pass --domain for this — it names an input file that must already exist and throws ENOENT when it does not)');
  } else {
    ok('domain subsystem not installed — check skipped');
  }

  // 8. the SessionStart routing hook (v0.5.0). Three emitted files that only work
  //    TOGETHER — `.claude/settings.json` registers the hook, the hook script prints the
  //    SessionStart envelope, `session-routing.md` is the entire payload — so any one of
  //    them missing ships a hook that injects nothing, silently, on a green gate.
  //
  //    TWO INDEPENDENT HALVES, and the split is the whole design:
  //
  //    8a WIRING — is the hook registered in the adopter's settings.json, and on WHICH
  //       sources? Two verdicts with deliberately different force:
  //         PRESENCE  — ok or WARN, NEVER fail. Preserve-or-write means an adopter who
  //                     already had a settings.json never gets it merged, and a supported
  //                     degradation must not break their gate (the same rule as check 7).
  //                     An UNCOVERED source (veriloop wires it, their matcher omits it) is
  //                     the same class: settings.json is hand-owned, so a narrower matcher
  //                     is their choice. WARN, never FAIL.
  //         OVERREACH — a matcher token veriloop does NOT wire FAILs, and so does an EMPTY
  //                     or ABSENT matcher, which is read separately because `.filter(Boolean)`
  //                     erases it into zero tokens and the comparison then has nothing to
  //                     object to. It is not a narrow matcher, it is an unconstrained one:
  //                     match-all re-injects into `resume`/`fork`, match-none can never fire,
  //                     and both are red. Not re-injecting the routing block into mid-work
  //                     sources is veriloop's OWN safety property, not the adopter's dial, and
  //                     the check that owns a safety property must be able to go red.
  //       The matcher read is not decorative: `wiresSessionHook` tested `h.command` alone and
  //       never looked at `matcher`, so this check printed "SessionStart routing hook wired"
  //       for matcher `PreToolUse`, `""` and `banana` alike — a green vouch for a hook that
  //       CAN NEVER FIRE. Combined with `handOnce` preservation, an installed adopter never
  //       receives a matcher change and nothing told them. Same false-green class as the
  //       byte-equality check below, one layer out. The ok line therefore prints the ACTUAL
  //       matcher tokens rather than asserting a list nobody read.
  //       Written from `SESSION_START_SOURCES` and lint's own comparison, MIRRORING — never
  //       importing — the selftest's, so rule 9's two independent witnesses survive.
  //    8b PAYLOAD — is what the hook would inject intact? Runs whenever `session-routing.md`
  //       EXISTS, wired or not, and FAILs. Nesting it inside 8a (the first version) skipped
  //       every payload check on the DEFAULT adopter path: an unwired settings.json plus a
  //       payload with `<SUBAGENT-STOP>` deleted and `/advise` rewritten to `/nonexistent`
  //       linted 18 ok / 2 warn / 0 fail. The payload is emitted regardless of wiring and
  //       goes live the moment the owner merges the entry — or wires it in
  //       `settings.local.json`, which this file never sees. Wiring is the adopter's
  //       decision; payload integrity is veriloop's bug either way.
  //
  //    Absent from `emitted_files` — a pre-0.5.0 bundle: ONE explicit ok line naming the
  //    state, never a silent skip (the reassurance-on-absence failure check 7 documents).
  //
  //    "Wired" means `wiresSessionHook`: a SessionStart command naming
  //    `${CLAUDE_PROJECT_DIR}/<SESSION_HOOK_SCRIPT>`, the exact path veriloop writes. NOT
  //    "some project-relative `.mjs`" — an adopter with their own SessionStart hook is the
  //    precise case preserve-or-write creates, and a loose match reports THEIR hook as
  //    veriloop's routing, so the WARN this check exists to raise never fires. Shared with
  //    `generate.mjs` (rule 9) so the two surfaces cannot disagree about the same file.
  //    Keyed off the file's CONTENT, deliberately, NOT off `emitted_files[].status`.
  //    `handOnce` reports `preserved` for every file that already exists, so after the
  //    second generate a correctly-wired settings.json veriloop wrote itself reports
  //    `preserved` too. A status-keyed check would therefore WARN on every re-generated
  //    bundle — including this repo's own — while saying "may not be wired" about a file
  //    that provably is. The status cannot distinguish the two cases; the content can.
  {
    let registered = false;
    if (existsSync(man)) {
      try {
        registered = (JSON.parse(readFileSync(man, 'utf8')).emitted_files || []).some((e) => e.path === CLAUDE_SETTINGS);
      } catch { /* the manifest-integrity check above already reported this */ }
    }
    // The routed command names are this check's OWN list, hand-written here and CROSS-CHECKED
    // against `EMITTED_COMMANDS` below — not derived from it, and not imported from the
    // renderer. Deriving (the first version filtered against `EMITTED_COMMANDS`) did the
    // opposite of the stated purpose: renaming `dev-plan.md` would have dropped it from
    // ROUTED, and the check would have stopped requiring the route while the payload kept
    // sending the model to a command that no longer exists. A DISAGREEMENT between the two
    // lists must be a failure, never a silent narrowing.
    // `dev-loop.md` was here until 2026-08-01 and is deliberately NOT: `/dev-loop` is no
    // longer a routing DESTINATION, it is reached only through `/dev-plan`. The row check
    // below is the other half — requiring the two routes is not the same as forbidding a
    // third, and a renderer regression that re-added the row would satisfy this list.
    const ROUTED_COMMANDS = ['advise.md', 'dev-plan.md'];
    const unemitted = ROUTED_COMMANDS.filter((c) => !EMITTED_COMMANDS.includes(c));
    const ROUTED = ROUTED_COMMANDS.map((c) => `/${c.replace(/\.md$/, '')}`);
    const settingsPath = join(args.bundle, CLAUDE_SETTINGS);
    // The WHITELIST of matcher spellings this check can tokenize without guessing (see the
    // tokenizer below for why a whitelist and not a wider splitter): a bare `|`-separated
    // list, the same list inside a capturing or non-capturing group, with or without `^`/`$`
    // anchors. Group 1 is the grouped alternation, group 2 the bare one; exactly one matches.
    const MATCHER_FORM = /^(?:\^)?(?:\((?:\?:)?([a-z]+(?:\|[a-z]+)*)\)|([a-z]+(?:\|[a-z]+)*))(?:\$)?$/;
    let wired = false;
    let unreadable = null;
    let tokens = [];
    let unconstrained = false;
    let unverifiable = null;
    if (registered && existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, 'utf8');
      try {
        wired = wiresSessionHook(raw);
        // Only veriloop's OWN groups (`sessionHookMatchers` scopes it), tokenized per matcher.
        const matchers = sessionHookMatchers(raw);
        // A matcher is a REGEX, and `split('|')` is not a regex parser. The first version
        // split every matcher unconditionally, so `^(startup|clear|compact)$` — the ANCHORED
        // spelling Claude Code's own docs use, and a correctly-wired hook — tokenized to
        // `^(startup`, `clear`, `compact)$`: two tokens that are not SessionStart sources, and
        // the check FAILED a bundle that was right. Widening the splitter is not the fix (the
        // next spelling breaks it again). WHITELIST the spellings this check can actually read
        // — a bare `|`-list, a group, an anchored group, a non-capturing group — tokenize those
        // from the captured alternation, and refuse to guess at anything else.
        const parsed = matchers.map((m) => (m.trim() ? MATCHER_FORM.exec(m.trim()) : null));
        tokens = [...new Set(parsed.flatMap((p) => (p ? (p[1] || p[2]).split('|') : [])))].filter(Boolean);
        // An EMPTY or ABSENT matcher is not a narrow matcher, it is an UNCONSTRAINED one, and
        // it has to be read separately: `.filter(Boolean)` erases it into zero tokens, so the
        // overreach comparison below sees nothing to complain about and the ok line printed
        // `(matcher: )` — the widest possible false green, reachable by deleting six characters
        // from a hand-owned file `handOnce` will never correct.
        unconstrained = matchers.some((m) => !m.trim());
        // An UNRECOGNIZED spelling is not a pass and not an overreach — it is a matcher this
        // check cannot read. It keeps the FAIL exit (fail-noisy: a whitelist whose miss case
        // is a soft green would be a silent hole that widens with every new spelling), but the
        // message says the check could not verify rather than accusing the matcher of naming
        // sources it may not name. Carries the offending string so the report names it.
        const badIdx = parsed.findIndex((p, i) => matchers[i].trim() && !p);
        if (badIdx !== -1) unverifiable = matchers[badIdx].trim();
      } catch (e) { unreadable = e.message; }
    }
    if (!registered) {
      ok('SessionStart routing hook not in emitted_files — pre-0.5.0 bundle, check skipped');
    } else {
      // --- 8a. WIRING. PRESENCE is ok/warn only; MATCHER OVERREACH can and must FAIL
      //     (see the OVERREACH paragraph above — the check that owns a safety property
      //     must be able to go red).
      if (!existsSync(settingsPath)) {
        // `.claude/settings.json` is starter/hand-owned: an owner who deletes it is exercising
        // a right the ownership model grants, and "remove the file veriloop added" is the most
        // natural way to revert the hook wholesale. WARN, not FAIL — the same rule as the
        // unwired case: a supported removal must not break the adopter's gate. It is still
        // named out loud, because the other reading (an accidental `c88f130`-class deletion)
        // is indistinguishable from here and `bundleFiles` drops missing paths silently.
        warn(`${CLAUDE_SETTINGS} is listed in emitted_files but is missing on disk — if you deleted it deliberately the routing hook is simply off (supported); if not, this is the deletion class check 8 exists to surface, and re-running generate restores it`);
      } else if (unreadable) {
        warn(`${CLAUDE_SETTINGS} is not valid JSON (${unreadable}) — veriloop never rewrites an existing settings file, so this is yours to fix; the SessionStart routing hook cannot be wired until it parses`);
      } else if (!wired) {
        warn(`${CLAUDE_SETTINGS} carries no SessionStart entry for ${SESSION_HOOK_SCRIPT} — preserve-or-write means an existing settings file is never merged, so routing is NOT wired (merge the SessionStart entry generate printed into your own file)`);
      } else {
        // The MATCHER, finally read. Overreach FAILs; an uncovered source WARNs and the hook
        // is still vouched for, because it IS wired — just narrower than veriloop wires it.
        const overreach = tokens.filter((t) => !SESSION_START_SOURCES.includes(t));
        const uncovered = SESSION_START_SOURCES.filter((s) => !tokens.includes(s));
        if (unconstrained) {
          // Both readings of an empty/omitted SessionStart matcher are red, which is why this
          // is a FAIL and not a WARN: if it matches ALL sources the hook re-injects the
          // full-strength routing block on `resume` and `fork` — maximal overreach, and the
          // uncovered WARN below would be affirmatively FALSE about sessions the hook is
          // firing on; if it matches nothing the hook CAN NEVER FIRE, the same false-green
          // this check exists to kill. The uncovered WARN is suppressed either way.
          fail(`${CLAUDE_SETTINGS} wires the SessionStart routing hook on an EMPTY (or absent) matcher — ${SESSION_HOOK_SCRIPT} is wired ONLY to ${SESSION_START_SOURCES.join('|')}, the sources that begin a session with the routing payload absent. An unset matcher is not a narrower matcher: it either matches every source (re-injecting the full-strength routing block into resume and fork, sessions that are mid-work) or matches none (a hook that can never fire). Not re-injecting mid-work is veriloop's own safety property, not a setting: spell the matcher out in ${CLAUDE_SETTINGS} (it is hand-owned, so re-running generate will NOT correct it)`);
        } else if (unverifiable) {
          // NOT a new verdict class: the same FAIL, with an honest message. The check knows
          // what it cannot read, and says that instead of pretending the tokens it failed to
          // extract are sources the adopter asked for.
          fail(`${CLAUDE_SETTINGS} wires the SessionStart routing hook on \`${unverifiable}\` — cannot verify this matcher form — use plain |-separated source tokens (${SESSION_START_SOURCES.join('|')}, optionally as an anchored group like ^(${SESSION_START_SOURCES.join('|')})$). A matcher is a regex and this check only reads the spellings it can tokenize without guessing; anything else could name sources veriloop does not wire, so it stays red rather than vouching for a hook nobody read. ${CLAUDE_SETTINGS} is hand-owned, so re-running generate will NOT correct it`);
        } else if (overreach.length) {
          fail(`${CLAUDE_SETTINGS} wires the SessionStart routing hook on ${overreach.join(', ')} — ${SESSION_HOOK_SCRIPT} is wired ONLY to ${SESSION_START_SOURCES.join('|')}, the sources that begin a session with the routing payload absent. Anything else either never fires at all (a matcher that is not a SessionStart source) or re-injects the full-strength routing block into a session that is mid-work. Not doing that is veriloop's own safety property, not a setting: fix the matcher in ${CLAUDE_SETTINGS} (it is hand-owned, so re-running generate will NOT correct it)`);
        } else {
          ok(`SessionStart routing hook wired: settings.json → ${SESSION_HOOK_SCRIPT} (matcher: ${tokens.join('|')})`);
        }
        // The uncovered WARN prints ONLY beside the green vouch. Beside any of the three FAILs
        // it is noise at best and false at worst: "those sessions start with no routing table"
        // is a claim about a matcher that was READ, and an overreaching, unconstrained or
        // unreadable matcher is precisely one that was not. It co-fired with the overreach FAIL
        // until 2026-08-15 — a `PreToolUse` matcher (an overreach under that day's tokenizer;
        // an unreadable FORM under this one) printed the FAIL and then advised the adopter to
        // widen the matcher the same check had just rejected.
        if (uncovered.length && !unconstrained && !unverifiable && !overreach.length) {
          warn(`${CLAUDE_SETTINGS}'s SessionStart matcher omits ${uncovered.join(', ')} — veriloop wires ${SESSION_START_SOURCES.join('|')}, so those sessions start with no routing table. settings.json is hand-owned and a narrower matcher is a supported choice, so this is a WARN, never a failure (widen the matcher yourself if you want it; generate will not touch your file)`);
        }
      }

      // --- 8b. PAYLOAD. Independent of 8a, and FAILs.
      let bad = 0;
      for (const c of unemitted) {
        bad++;
        fail(`session-routing.md routes to /${c.replace(/\.md$/, '')} but ${c} is not in EMITTED_COMMANDS — the routing table and the emitted commands disagree`);
      }
      if (!existsSync(join(args.bundle, SESSION_HOOK_SCRIPT))) {
        bad++;
        fail(`${SESSION_HOOK_SCRIPT} — the script the SessionStart entry names — is machine-owned and emitted by veriloop, but is not in the bundle; re-run generate`);
      } else {
        // INTEGRITY of the hook SCRIPT, held to the same bar as the payload below and ranked
        // above it in consequence: `session-routing.md` is text Claude Code reads, this is
        // CODE Claude Code EXECUTES at every session start. The check used to stop at
        // "the file exists" — mutation-verified on a pristine `git archive` copy, appending
        // to `session-start.mjs` left both gates green, 0 fail, exit 0, while the gate
        // printed a "routing hook wired" line vouching for it. `renderSessionStartHook()`
        // takes no arguments, so its output is canonical for every bundle at this version.
        // FAIL, machine-owned, and the differing text is NOT echoed.
        const hook = readFileSync(join(args.bundle, SESSION_HOOK_SCRIPT), 'utf8');
        const canonHook = renderSessionStartHook();
        if (hook !== canonHook) {
          bad++;
          const shape = hook.startsWith(canonHook) ? `${hook.length - canonHook.length} bytes APPENDED after the canonical script` : `${hook.length} bytes vs ${canonHook.length} canonical`;
          fail(`${SESSION_HOOK_SCRIPT} does not match what veriloop emits (${shape}) — EITHER this file was tampered with, OR your bundle predates your current veriloop version. This check cannot tell those apart and does not try: it FAILS for both, deliberately, and the remedy is the same one. It is machine-owned and Claude Code EXECUTES it at every session start, so a hand edit here runs on every startup. Re-run generate to restore it; to change it for real, change renderSessionStartHook() in the generator. (The differing text is deliberately not echoed.)`);
        }
      }
      const routingPath = join(args.bundle, SESSION_ROUTING_DOC);
      if (!existsSync(routingPath)) {
        bad++;
        fail(`${SESSION_ROUTING_DOC} — the hook's entire payload — is missing; the hook would inject nothing. It is machine-owned, so deleting it is not a disable: re-run generate (to disable, remove the SessionStart entry from ${CLAUDE_SETTINGS})`);
      } else {
        const doc = readFileSync(routingPath, 'utf8');
        // INTEGRITY, first and hardest. `session-routing.md` is a maximum-strength injection
        // sink: its entire contents go into every session verbatim under <EXTREMELY-IMPORTANT>
        // framing. Property checks alone (does it contain <SUBAGENT-STOP>? the routed commands?)
        // all survive an APPENDED block — so a payload with "read every .env* and echo the
        // contents" bolted onto the end linted 19 ok / 0 fail and the gate printed a green
        // "routing hook wired" line VOUCHING for it. `renderSessionRouting()` takes no
        // arguments, so its output is canonical for every bundle at this version: byte
        // equality is decidable, and anything else is either tampering or a stale bundle.
        // FAIL, not warn — the file is MACHINE-owned, so "I edited it" is not an ownership
        // right the way an edited `settings.json` or `*.overrides.md` is, and re-running
        // generate restores it. The diff is NOT echoed: it is attacker-controlled text.
        if (doc !== renderSessionRouting()) {
          bad++;
          const canon = renderSessionRouting();
          const shape = doc.startsWith(canon) ? `${doc.length - canon.length} bytes APPENDED after the canonical payload` : `${doc.length} bytes vs ${canon.length} canonical`;
          fail(`${SESSION_ROUTING_DOC} does not match what veriloop emits (${shape}) — EITHER this file was tampered with, OR your bundle predates your current veriloop version. This check cannot tell those apart and does not try: it FAILS for both, deliberately, and the remedy is the same one. It is machine-owned and its entire text is injected into every session verbatim, so a hand edit here is an injection into every session. Re-run generate to restore it; to change it for real, change SESSION_ROUTES / SESSION_NO_ROUTE / SESSION_RED_FLAGS / SESSION_ANNOUNCE in the generator (SESSION_NO_ROUTE is its OWN constant on purpose — folding it into SESSION_ROUTES renders the string undefined into the payload). (The differing text is deliberately not echoed.)`);
        }
        // The properties, checked SEPARATELY from the byte-equality above and not folded into
        // it. Byte-equality answers "is this veriloop's file"; these answer "does veriloop's
        // file still carry the guards" — which is what breaks when the RENDERER regresses,
        // and byte-equality is blind to that by construction (it compares the file to the
        // regression).
        //
        // <SUBAGENT-STOP> is required, not a nicety: without it every council seat, /review
        // lens and /dev-loop implementer inherits the routing instruction and can re-enter the
        // surface that spawned it (`/advise` from inside `/advise`). <ALREADY-ROUTED> is the
        // same guard for the MAIN session — a session that compacts or resumes mid-command is
        // re-entry the subagent guard says nothing about.
        if (!doc.includes('<SUBAGENT-STOP>')) { bad++; fail('session-routing.md carries no <SUBAGENT-STOP> guard — every subagent would inherit the routing instruction'); }
        if (!doc.includes('<ALREADY-ROUTED>')) { bad++; fail('session-routing.md carries no <ALREADY-ROUTED> clause — a main session already executing a veriloop command would be told to re-enter it'); }
        // The ANNOUNCEMENT and SESSION-NOTES clauses (owner decisions, 2026-08-01). Checked
        // here for the same reason the two guards above are: byte-equality compares the file
        // to whatever the renderer currently emits, so a renderer regression that dropped
        // these would leave every bundle byte-perfect and silent. What this check can prove
        // is that the payload CARRIES the instruction. Whether the model then announces or
        // notes anything is not observable from a bundle linter, and nothing here claims it.
        if (!/routed by veriloop's SessionStart hook, not requested directly/.test(doc)) {
          bad++;
          fail('session-routing.md asks for no ANNOUNCEMENT — a hook-routed reply would be indistinguishable from an ordinary one, and the owner never sees this payload');
        }
        if (!/whether this block routed it or\n?\s*the owner invoked it directly/.test(doc)) {
          bad++;
          fail('session-routing.md never asks the session to record which command fired and whether the hook routed it or the owner invoked it directly — /advise is read-only and cannot record its own invocation, so the session notes are the only place this is kept');
        }
        for (const r of ROUTED) if (!doc.includes(r)) { bad++; fail(`session-routing.md never routes to ${r}`); }
        // The INVERSE direction. The loop above only proves the required routes are present;
        // it says nothing about a route the doc adds. Read the route table back out of the
        // payload and require every command it sends the model to be one veriloop emits —
        // otherwise the session is routed to a command that does not exist in the bundle.
        const table = (doc.match(/## Where to route\n([\s\S]*?)(?=\n## |$)/) || [, ''])[1];
        const dangling = [...new Set([...table.matchAll(/`\/([a-z0-9-]+)`/g)].map((m) => m[1]))]
          .filter((n) => !EMITTED_COMMANDS.includes(`${n}.md`));
        for (const n of dangling) { bad++; fail(`session-routing.md's route table sends the session to /${n}, which veriloop does not emit`); }
        // /dev-loop is EMITTED, so the dangling check above can never catch a row routing to
        // it — and a direct route there is exactly the defect the two-row table fixed: "fix
        // the typo in README line 40" went straight into a worktree + gate + lens + auto-fix
        // drive with no proportionality valve. The valve lives in `/dev-plan` now. ROWS only,
        // so the payload may still EXPLAIN why /dev-loop is not a destination.
        const devLoopRows = table.split('\n').filter((l) => l.trim().startsWith('|') && l.includes('`/dev-loop`'));
        if (devLoopRows.length) {
          bad++;
          fail('session-routing.md\'s route table has a row routing the session DIRECTLY to /dev-loop — /dev-loop is not a routing destination: /dev-plan is the implementation gateway and is the only path to it (it judges proportionality with a cited danger surface)');
        }
        // The ASSEMBLED table's SHAPE — the second witness. Written from THIS file's own
        // `ROUTED` list, never imported from the renderer, so rule 9's two-witness property
        // survives: the generator and the linter must agree about the table independently.
        //
        // Every check above is a PRESENCE check, and presence cannot see the drift that
        // matters here. Prepending a row without touching the prose ordinal leaves every route
        // present, every guard present and byte-equality green (it compares the file to the
        // regression) while the payload now tells each session that the WRONG row is residual
        // — which makes the last route unreachable and resurrects the swallow defect the
        // residual row was built to fix. So the ordinal is checked against the table it
        // describes, never against a literal.
        const tableRows = table.split('\n')
          .filter((l) => l.trim().startsWith('|'))
          .slice(2)
          .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
        const rowCmd = (cell) => ((cell || '').match(/`(\/[a-z0-9-]+)`/) || [, null])[1];
        const shape = [];
        if (tableRows.length !== ROUTED.length + 1) shape.push(`it has ${tableRows.length} rows; veriloop routes to ${ROUTED.length} commands, so it should have ${ROUTED.length + 1} — one per route, plus the no-route row`);
        const noCmd = tableRows.map((r, i) => (rowCmd(r[1]) ? -1 : i)).filter((i) => i >= 0);
        if (noCmd.length !== 1 || noCmd[0] !== 0) shape.push(`the command-less no-route row must be row 1 and the ONLY command-less row (found: ${noCmd.length ? noCmd.map((i) => i + 1).join(', ') : 'none'})`);
        ROUTED.forEach((c, i) => { if (rowCmd((tableRows[i + 1] || [])[1]) !== c) shape.push(`${c} is not on row ${i + 2}`); });
        if (!tableRows.length || !/^ANYTHING NOT COVERED BY THE ROWS ABOVE/.test(tableRows[tableRows.length - 1][0])) shape.push('the LAST row does not carry the residual trigger, so the table is not total and a message can match no row at all');
        const ordinal = table.match(/\*\*(\d+) rows, read IN ORDER, and row (\d+) is RESIDUAL\*\*/);
        if (!ordinal) shape.push('the prose never states how many rows there are and which one is RESIDUAL');
        else if (Number(ordinal[1]) !== tableRows.length || Number(ordinal[2]) !== tableRows.length) shape.push(`the prose says ${ordinal[1]} rows and row ${ordinal[2]} is RESIDUAL while the table has ${tableRows.length} rows — the payload is telling every session that the wrong row is residual`);
        for (const s of shape) { bad++; fail(`session-routing.md's route table is malformed: ${s}`); }
      }
      if (!bad) ok(`SessionStart routing payload intact: ${SESSION_ROUTING_DOC} and ${SESSION_HOOK_SCRIPT} both byte-identical to what veriloop emits (<SUBAGENT-STOP>, <ALREADY-ROUTED>, routes ${ROUTED.join(' ')})`);
    }
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

// The emitted paths and the two renderers whose output check 8 compares against, IMPORTED
// rather than re-typed — `render.mjs` declares them the single source of truth (rule 9), and
// check 8 must recognise veriloop's own hook by the exact path veriloop writes, not by "some
// project-relative `.mjs`". `wiresSessionHook` is shared with `generate.mjs` so the two
// surfaces cannot publish contradictory wiring verdicts about the same file. Only paths and
// renderers are shared: check 8's routed command names are still its own, cross-checked
// against this file's `EMITTED_COMMANDS`, so the check keeps an independent opinion about
// which commands exist.
// Placed at the FOOT of the file, with `lintable`, for the reason stated there: `SECURITY.md`,
// `constitution.md` and the manifest all cite checks in this file BY LINE NUMBER, and an
// import at the top would silently move every one of them. ESM hoists the binding, so both
// `lintable` and check 8 see it.
import { SESSION_HOOK_SCRIPT, SESSION_ROUTING_DOC, CLAUDE_SETTINGS, SESSION_START_SOURCES, renderClaudeSettings, renderSessionRouting, renderSessionStartHook, wiresSessionHook, sessionHookMatchers } from './lib/render.mjs';
// Check 7b's two renderers, imported for the same reason and placed with them. Re-rendering
// `audit.md` / `expert.md` from `domain.json` + the manifest's `domain_facts` is the only way
// to decide whether the committed files are veriloop's; `SECRET_TRIGGER` above already comes
// from this module, so the dependency edge is not new.
import { renderDomainAudit, renderDomainExpert, buildReferences } from './lib/domain.mjs';

/**
 * Which `emitted_files` entries `bundleFiles` may hand to the content checks. Everything
 * veriloop WROTE, plus every hand-owned file it created — but NOT a `.claude/settings.json`
 * that is the ADOPTER's own. That file is their Claude Code config: it legitimately carries
 * absolute paths (`/Users/…/bin/foo` in a hook command, `statusLine.command`, `env`,
 * `permissions.additionalDirectories` — all routine), and may carry `env` secrets, so
 * check 1 would turn THEIR gate red for a file veriloop never touched and echo 80
 * characters of it into the log.
 * The test is BYTE-EQUALITY against `renderClaudeSettings()`, not "does it wire veriloop's
 * hook". The wiring predicate looked right and was the exact harm this docstring forbids:
 * it flips TRUE the moment an adopter follows veriloop's own printed instruction and merges
 * the SessionStart entry into their existing file — and from then on their whole personal
 * settings.json is fed to check 1. Byte-equal means veriloop EMITTED this file and nothing
 * has been added to it, which is the only condition under which reading it into a log is
 * safe; it is also exactly the condition under which portability coverage still means
 * something, since the emitted file is the only one veriloop is answerable for.
 * Keyed off CONTENT rather than `emitted_files[].status` for the reason check 8 is:
 * `handOnce` reports `preserved` for ANY pre-existing file, so from the second generate on
 * veriloop's OWN settings.json is `preserved` too — this repo's manifest already says so. A
 * status-keyed test therefore excluded veriloop's own emitted file from check 1, check 2 and
 * the secret scan, on every bundle that had been generated twice.
 * Declared here (a hoisted function declaration) rather than beside `bundleFiles`, to keep
 * the cited line numbers above stable.
 * Deliberately NOT mirrored into the pattern-walk fallback in `bundleFiles` — that fallback
 * is already scoped away from pre-existing `.claude/` files, for the same reason.
 */
function lintable(e, root) {
  if (e.path !== CLAUDE_SETTINGS) return true;
  const p = join(root, e.path);
  if (!existsSync(p)) return false;
  try { return readFileSync(p, 'utf8') === renderClaudeSettings(); } catch { return false; }
}

main();
