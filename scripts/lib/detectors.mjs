// veriloop detectors (phase 1). Deterministic: parse package.json scripts,
// Makefile targets, pyproject tool tables AND CI `run:` blocks, then reconcile
// against CI (ground truth) to choose one command per category and mark whether
// CI provably exercises it. No LLM, no guessing — every command cites a source.

import { join } from 'node:path';
import { readText, readJson, exists, isDir, listDir, findLine, sourceRef } from './util.mjs';
import { parseToml } from './toml.mjs';
import { parseMakefile } from './makefile.mjs';
import { extractCiCommands } from './ci.mjs';

export const CATEGORIES = [
  'install',
  'typecheck',
  'lint',
  'format',
  'test',
  'test_single',
  'build',
  'dev',
  'e2e',
  'bench',
];

// Auto-run safe-list (locked design decision #4): during veriloop's own verify
// phase, `safe` commands auto-run, `ask` commands prompt first, `never` commands
// are never auto-run (real side effects — live DBs, servers, deploys).
const DEFAULT_SAFETY = {
  install: 'ask',
  typecheck: 'safe',
  lint: 'safe',
  format: 'safe',
  test: 'ask',
  test_single: 'ask',
  build: 'ask',
  dev: 'never',
  e2e: 'never',
  bench: 'never',
};

// Signatures that identify what an arbitrary command (e.g. a CI run-line) does,
// so we can (a) mark a chosen command CI-verified and (b) adopt a CI-only command
// for a category we found no local candidate for. Signatures stay stack-scoped by
// TOOL: python/node tools fill python/node slots, cargo tools fill the cargo slots.
// cargo lines DO fill lint/format/test/typecheck by design — a maturin repo emits a
// dual (python + cargo) surface, so `cargo clippy`/`cargo fmt --check`/`cargo test`
// are real category signals, not noise.
const CI_SIGNATURES = {
  install: [/\bnpm (ci|install)\b/, /\bpnpm (install|i)\b/, /\byarn( install)?\b/, /\bbun install\b/, /\bpip install\b/, /\buv sync\b/, /\bpoetry install\b/],
  typecheck: [/\bmypy\b/, /\btsc\b/, /\bpyright\b/, /\bnpm run typecheck\b/, /\bmake typecheck\b/, /\btype-?check\b/, /\bcargo (check|build)\b/],
  lint: [/\bruff check\b/, /\beslint\b/, /\bnext lint\b/, /\bflake8\b/, /\bpylint\b/, /\bnpm run lint\b/, /\bmake lint\b/, /\bcargo clippy\b/],
  format: [/\bprettier\b[^\n]*(--check|-c)\b/, /\bruff format\b[^\n]*--check/, /\bblack\b[^\n]*--check/, /\bnpm run format:check\b/, /\bmake format-check\b/, /\bcargo fmt\b[^\n]*--check/],
  test: [/\bpytest\b/, /\bvitest\b/, /\bjest\b/, /\bmocha\b/, /\bnpm run test\b/, /\bnpm test\b/, /\bmake test(-unit)?\b/, /\bcargo (nextest run|test)\b/, /\bcargo hack\b/],
  e2e: [/-m integration\b/, /\bplaywright\s+test\b/, /\bcypress\s+(run|open)\b/, /test:e2e/, /\bmake test-integration\b/],
  build: [/\bnpm run build\b/, /\bnext build\b/, /\bmaturin\b/, /python -m build\b/, /\bmake build\b/, /\btsc -p\b/],
  bench: [/\bcargo bench\b/],
};

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Does a raw command match a category's signature? */
function matchesCategory(cmd, category) {
  const sigs = CI_SIGNATURES[category] || [];
  // A dependency/browser install or other setup step is never the RUN command for
  // another category — e.g. `npx playwright install --with-deps chromium` is e2e
  // *setup*, not the e2e run, and must not fill the e2e slot.
  if (category !== 'install' && /(\binstall\b|--with-deps)/.test(cmd)) return false;
  return sigs.some((re) => re.test(cmd));
}

// ---------------------------------------------------------------------------
// Package-manager / stack detection
// ---------------------------------------------------------------------------

function detectNodePM(root) {
  if (exists(join(root, 'bun.lockb'))) return 'bun';
  if (exists(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(join(root, 'yarn.lock'))) return 'yarn';
  if (exists(join(root, 'package-lock.json'))) return 'npm';
  const pkg = readJson(join(root, 'package.json'));
  if (pkg && typeof pkg.packageManager === 'string') return pkg.packageManager.split('@')[0];
  return 'npm';
}

function nodeRunner(pm) {
  return pm === 'yarn' ? 'yarn' : `${pm} run`;
}

/** PM-correct "run script X in workspace pkg" invocation. npm's -w flag is npm-only. */
function scopeRun(pm, script, pkgName, dir) {
  if (pkgName) {
    if (pm === 'npm') return `npm run ${script} -w ${pkgName}`;
    if (pm === 'pnpm') return `pnpm --filter ${pkgName} run ${script}`;
    if (pm === 'yarn') return `yarn workspace ${pkgName} run ${script}`;
  }
  return `(cd ${dir} && ${nodeRunner(pm)} ${script})`; // bun + nameless fallback
}

/** Minimal pnpm-workspace.yaml reader: the `packages:` list only. */
function readPnpmWorkspace(root) {
  const text = readText(join(root, 'pnpm-workspace.yaml'));
  if (!text) return null;
  const out = [];
  let inPkgs = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '');
    if (/^packages\s*:/.test(line)) { inPkgs = true; continue; }
    if (inPkgs) {
      const m = line.match(/^\s+-\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (m) out.push(m[1]);
      else if (line.trim() && !line.startsWith(' ')) inPkgs = false; // dedent = section over
    }
  }
  return out.length ? out : null;
}

function nodeInstall(root, pm) {
  if (pm === 'npm') return exists(join(root, 'package-lock.json')) ? 'npm ci' : 'npm install';
  if (pm === 'pnpm') return exists(join(root, 'pnpm-lock.yaml')) ? 'pnpm install --frozen-lockfile' : 'pnpm install';
  if (pm === 'yarn') return 'yarn install --frozen-lockfile';
  if (pm === 'bun') return 'bun install';
  return `${pm} install`;
}

function detectPythonRunner(root) {
  if (exists(join(root, 'uv.lock'))) return { pm: 'uv', prefix: 'uv run ' };
  if (exists(join(root, 'poetry.lock'))) return { pm: 'poetry', prefix: 'poetry run ' };
  if (exists(join(root, 'Pipfile'))) return { pm: 'pipenv', prefix: 'pipenv run ' };
  return { pm: 'pip', prefix: '' };
}

// ---------------------------------------------------------------------------
// Node detector
// ---------------------------------------------------------------------------

const SCRIPT_ALIASES = {
  typecheck: ['typecheck', 'type-check', 'tsc', 'check-types'],
  lint: ['lint', 'lint:check', 'eslint'],
  format: ['format:check', 'format-check', 'fmt:check', 'prettier:check', 'format'],
  test: ['test', 'test:unit', 'test:ci'],
  build: ['build'],
  dev: ['dev', 'start', 'serve'],
  e2e: ['test:e2e', 'e2e', 'test:playwright', 'playwright', 'cypress'],
};

function pickScript(scripts, aliases) {
  for (const a of aliases) if (scripts[a]) return a;
  return null;
}

function testRunnerOf(scriptBody) {
  const b = norm(scriptBody);
  if (b.includes('vitest')) return 'vitest';
  if (b.includes('jest')) return 'jest';
  if (b.includes('mocha')) return 'mocha';
  if (b.includes('playwright')) return 'playwright';
  if (b.includes('node --test')) return 'node';
  return null;
}

const UI_DEP_SIGNALS = ['next', 'react', 'react-dom', 'vue', 'svelte', 'solid-js', '@angular/core', 'astro', '@remix-run/react', 'nuxt'];
const E2E_DEP_SIGNALS = ['@playwright/test', 'playwright', 'cypress'];

// Expand workspace globs: literal dirs, single `*`, nested `a/x/y`, and `**` (depth<=3).
function expandWorkspaces(root, patterns, warnings) {
  const dirs = new Set();
  const walkSeg = (rel, segs, i) => {
    if (i === segs.length) {
      if (rel && isDir(join(root, rel))) dirs.add(rel);
      return;
    }
    const seg = segs[i];
    const base = rel ? join(root, rel) : root;
    if (seg === '**') {
      walkSeg(rel, segs, i + 1); // zero dirs
      for (const name of listDir(base)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const next = rel ? `${rel}/${name}` : name;
        if (isDir(join(root, next)) && next.split('/').length <= 3) walkSeg(next, segs, i);
      }
    } else if (seg === '*') {
      for (const name of listDir(base)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const next = rel ? `${rel}/${name}` : name;
        if (isDir(join(root, next))) walkSeg(next, segs, i + 1);
      }
    } else {
      walkSeg(rel ? `${rel}/${seg}` : seg, segs, i + 1);
    }
  };
  for (const p of patterns || []) {
    if (p.startsWith('!')) continue; // negation patterns: not needed for scope discovery
    const before = dirs.size;
    walkSeg('', p.split('/').filter(Boolean), 0);
    if (dirs.size === before && warnings) warnings.push(`workspace pattern matched nothing: ${p}`);
  }
  return [...dirs];
}

function detectNode(root, out) {
  const pkgPath = join(root, 'package.json');
  const pkg = readJson(pkgPath);
  if (!pkg) return false;
  const pkgText = readText(pkgPath);
  const pm = detectNodePM(root);
  const runner = nodeRunner(pm);
  const scripts = pkg.scripts || {};
  out.stack.push('node');
  if (out.package_manager === null) out.package_manager = pm;

  const scriptsAt = findLine(pkgText, '"scripts"') || 1;
  const cite = (name) => {
    const lines = (pkgText || '').split('\n');
    for (let ln = scriptsAt; ln < lines.length; ln++) {
      if (lines[ln - 1].includes(`"${name}"`)) return sourceRef(root, pkgPath, ln);
    }
    return sourceRef(root, pkgPath, findLine(pkgText, `"${name}"`));
  };

  // install
  addCandidate(out, 'install', { cmd: nodeInstall(root, pm), source: `lockfile → ${pm}`, from: 'node' });

  // root-level script categories (e2e handled below with a scope fallback)
  for (const cat of ['typecheck', 'lint', 'format', 'test', 'build', 'dev']) {
    const name = pickScript(scripts, SCRIPT_ALIASES[cat]);
    if (!name) continue;
    const writesFmt = cat === 'format' && name === 'format' && !/(--check|-c)\b/.test(scripts[name]);
    addCandidate(out, cat, {
      cmd: `${runner} ${name}`,
      source: cite(name),
      from: 'node',
      mutates: writesFmt || undefined,
      note: writesFmt ? 'script writes files (no --check variant found); use as a formatter, not a gate' : undefined,
    });
  }

  // scopes (workspaces) — read them first so UI/e2e/test_single can see them.
  // In a workspaces monorepo the framework/e2e deps usually live in a leaf
  // package (e.g. apps/web), NOT the root — so root-only signals miss them.
  let wsPatterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
  if (!wsPatterns && pm === 'pnpm') wsPatterns = readPnpmWorkspace(root); // pnpm declares workspaces in YAML
  const scopePkgs = [];
  for (const dir of expandWorkspaces(root, wsPatterns, out.warnings)) {
    const wpkg = readJson(join(root, dir, 'package.json'));
    if (!wpkg) continue;
    scopePkgs.push({ dir, wpkg });
    const wscripts = wpkg.scripts || {};
    const scopeCmds = {};
    for (const cat of ['typecheck', 'lint', 'format', 'test', 'build', 'dev', 'e2e']) {
      const n = pickScript(wscripts, SCRIPT_ALIASES[cat]);
      if (n) scopeCmds[cat] = scopeRun(pm, n, wpkg.name, dir);
    }
    out.scopes.push({ name: wpkg.name || dir, path: dir, commands: scopeCmds });
  }

  // e2e — root script if present, else promote from the first scope that has one
  const rootE2E = pickScript(scripts, SCRIPT_ALIASES.e2e);
  if (rootE2E) {
    addCandidate(out, 'e2e', { cmd: `${runner} ${rootE2E}`, source: cite(rootE2E), from: 'node' });
  } else {
    const s = scopePkgs.find(({ wpkg }) => pickScript(wpkg.scripts || {}, SCRIPT_ALIASES.e2e));
    if (s) {
      const n = pickScript(s.wpkg.scripts, SCRIPT_ALIASES.e2e);
      addCandidate(out, 'e2e', { cmd: scopeRun(pm, n, s.wpkg.name, s.dir), source: sourceRef(root, join(root, s.dir, 'package.json'), null), from: 'node-scope' });
    }
  }

  // test_single — from the root test runner, else a scope's test runner
  // test_single — from the root test runner, else a scope's test runner. For a
  // scoped runner, `cd` into the workspace dir: `npx vitest run X -w pkg` is WRONG
  // (-w is vitest's --watch, jest's --maxWorkers — not a workspace selector).
  const testName = pickScript(scripts, SCRIPT_ALIASES.test);
  let tr = testName ? testRunnerOf(scripts[testName]) : null;
  let trDir = null;
  if (!tr) {
    const s = scopePkgs.find(({ wpkg }) => {
      const tn = pickScript(wpkg.scripts || {}, SCRIPT_ALIASES.test);
      return tn && testRunnerOf(wpkg.scripts[tn]);
    });
    if (s) {
      trDir = s.dir;
      tr = testRunnerOf(s.wpkg.scripts[pickScript(s.wpkg.scripts, SCRIPT_ALIASES.test)]);
    }
  }
  const single = (bare) => (trDir ? `(cd ${trDir} && ${bare})` : bare);
  if (tr === 'vitest') addCandidate(out, 'test_single', { cmd: single('npx vitest run <file>'), source: 'test runner: vitest', from: 'node' });
  else if (tr === 'jest') addCandidate(out, 'test_single', { cmd: single('npx jest <file>'), source: 'test runner: jest', from: 'node' });
  else if (tr === 'mocha') addCandidate(out, 'test_single', { cmd: single('npx mocha <file>'), source: 'test runner: mocha', from: 'node' });
  else if (testName) addCandidate(out, 'test_single', { cmd: `${runner} ${testName} -- <file>`, source: cite(testName), from: 'node' });

  // has_ui — aggregate deps across root + every scope, plus any e2e signal
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const { wpkg } of scopePkgs) Object.assign(allDeps, wpkg.dependencies || {}, wpkg.devDependencies || {});
  const hasUiDep = UI_DEP_SIGNALS.some((d) => d in allDeps);
  const hasE2E = E2E_DEP_SIGNALS.some((d) => d in allDeps) || !!(out._candidates.e2e && out._candidates.e2e.length);
  if (hasUiDep || hasE2E) out.has_ui = true;

  return true;
}

// ---------------------------------------------------------------------------
// Python detector (pyproject + Makefile + tool tables)
// ---------------------------------------------------------------------------

const MAKE_TARGET_ALIASES = {
  install: ['install', 'install-dev', 'setup', 'deps'],
  typecheck: ['typecheck', 'type-check', 'mypy', 'types'],
  lint: ['lint', 'check', 'ruff'],
  format: ['format-check', 'fmt-check', 'format', 'fmt'],
  test: ['test', 'test-unit', 'unit', 'pytest'],
  build: ['build', 'wheel', 'rust-build'],
  e2e: ['test-integration', 'integration', 'e2e', 'test-e2e'],
};

// Only frameworks whose PRESENCE implies a browser UI. Server frameworks
// (fastapi/flask/django) are deliberately excluded — an API-only backend must not
// get a screenshot gate. veriloop's LLM deep-scan phase may flip has_ui manually
// when a server app really renders templates.
const PY_UI_SIGNALS = ['streamlit', 'gradio', 'dash', 'reflex', 'nicegui', 'panel'];

function pyToolSrc(root, tool) {
  // choose a sensible src list for tools that take paths
  if (tool.src && Array.isArray(tool.src)) return tool.src.filter((d) => isDir(join(root, d))).join(' ') || tool.src.join(' ');
  const cands = ['src', 'tests', 'scripts'].filter((d) => isDir(join(root, d)));
  return cands.length ? cands.join(' ') : '.';
}

function detectPython(root, out) {
  const pyprojPath = join(root, 'pyproject.toml');
  const pyText = readText(pyprojPath);
  const hasPyproject = pyText != null;
  const hasSetup = exists(join(root, 'setup.py')) || exists(join(root, 'setup.cfg'));
  const makeText = readText(join(root, 'Makefile'));
  if (!hasPyproject && !hasSetup && !(makeText && /\b(pytest|ruff|mypy|python)\b/.test(makeText))) return false;

  out.stack.push('python');
  const toml = parseToml(pyText || '');
  const { pm, prefix } = detectPythonRunner(root);
  if (out.package_manager === null) out.package_manager = pm;

  const make = makeText ? parseMakefile(makeText) : { targets: {}, vars: {} };
  const makeCite = (line) => sourceRef(root, join(root, 'Makefile'), line);
  const pyCite = (needle) => sourceRef(root, pyprojPath, findLine(pyText, needle));

  // --- Makefile-first (explicit, high-confidence dev interface) ---
  for (const cat of ['install', 'typecheck', 'lint', 'format', 'test', 'build', 'e2e']) {
    for (const alias of MAKE_TARGET_ALIASES[cat]) {
      const t = make.targets[alias];
      if (!t) continue;
      const recipe = t.recipe.join(' ; ');
      // format target that only writes (no --check) is a formatter, not a gate
      const writesFmt = cat === 'format' && !/--check/.test(recipe);
      addCandidate(out, cat, {
        cmd: `make ${alias}`,
        source: makeCite(t.line),
        from: 'makefile',
        mutates: writesFmt || undefined,
        note: writesFmt ? `make ${alias} writes files (recipe: ${recipe.slice(0, 80)}); use as formatter, not gate` : undefined,
        recipe,
      });
      break; // first matching alias wins per category
    }
  }

  // --- tool-config fallbacks (used when no Makefile target exists) ---
  const tool = toml.tool || {};
  if (tool.ruff) {
    const src = pyToolSrc(root, tool.ruff);
    addCandidate(out, 'lint', { cmd: `${prefix}ruff check ${src}`.trim(), source: pyCite('[tool.ruff]'), from: 'pyproject' });
    addCandidate(out, 'format', { cmd: `${prefix}ruff format --check ${src}`.trim(), source: pyCite('[tool.ruff]'), from: 'pyproject' });
  }
  if (tool.mypy) {
    const src = isDir(join(root, 'src')) ? 'src' : '.';
    addCandidate(out, 'typecheck', { cmd: `${prefix}mypy ${src}`.trim(), source: pyCite('[tool.mypy]'), from: 'pyproject' });
  }
  if (tool.black && !tool.ruff) {
    addCandidate(out, 'format', { cmd: `${prefix}black --check .`.trim(), source: pyCite('[tool.black]'), from: 'pyproject' });
  }
  const pytestCfg = tool.pytest?.ini_options;
  if (pytestCfg || isDir(join(root, 'tests'))) {
    const paths = Array.isArray(pytestCfg?.testpaths) ? pytestCfg.testpaths.join(' ') : '';
    addCandidate(out, 'test', { cmd: `${prefix}pytest ${paths}`.trim(), source: pytestCfg ? pyCite('[tool.pytest.ini_options]') : 'tests/ directory', from: 'pyproject' });
    addCandidate(out, 'test_single', { cmd: `${prefix}pytest <path>::<test>`.trim(), source: 'pytest', from: 'pyproject' });
    // integration marker → e2e-tier suite
    const markers = pytestCfg?.markers || [];
    if (markers.some((m) => norm(m).startsWith('integration'))) {
      addCandidate(out, 'e2e', { cmd: `${prefix}pytest -m integration`.trim(), source: pyCite('integration:'), from: 'pyproject' });
    }
  }

  // install
  const optDeps = toml.project?.['optional-dependencies'] || {};
  const hasDev = 'dev' in optDeps;
  if (pm === 'uv') addCandidate(out, 'install', { cmd: 'uv sync', source: 'uv.lock', from: 'python' });
  else if (pm === 'poetry') addCandidate(out, 'install', { cmd: 'poetry install', source: 'poetry.lock', from: 'python' });
  else if (hasPyproject) addCandidate(out, 'install', { cmd: hasDev ? 'python -m pip install -e ".[dev]"' : 'python -m pip install -e .', source: hasDev ? pyCite('[project.optional-dependencies]') : pyCite('[project]'), from: 'python' });
  else if (exists(join(root, 'requirements.txt'))) addCandidate(out, 'install', { cmd: 'python -m pip install -r requirements.txt', source: 'requirements.txt', from: 'python' });

  // build (maturin / build backend)
  const backend = toml['build-system']?.['build-backend'];
  if (tool.maturin || (backend && backend.includes('maturin'))) {
    addCandidate(out, 'build', { cmd: 'maturin develop --release', source: pyCite('[tool.maturin]') || pyCite('build-backend'), from: 'python' });
    out.polyglot.push('rust (maturin extension crate — detectRust emits the cargo fmt/clippy/test/check surface alongside this build)');
  } else if (backend && !backend.includes('maturin')) {
    addCandidate(out, 'build', { cmd: 'python -m build', source: pyCite('build-backend'), from: 'python' });
  }

  // has_ui (conservative: only real web/app UI, not headless pygame/tk desktop)
  const deps = [...(toml.project?.dependencies || []), ...Object.values(optDeps).flat()].map((d) => norm(String(d)));
  const depBase = (d) => d.split(/[\s\[<>=!~;(]/)[0]; // exact package name, not startsWith
  if (deps.some((d) => PY_UI_SIGNALS.includes(depBase(d)))) out.has_ui = true;

  return true;
}

// ---------------------------------------------------------------------------
// Rust detector (Cargo.toml + .config/nextest.toml + rust-toolchain.toml + Makefile)
// ---------------------------------------------------------------------------

function detectRust(root, out) {
  const cargoPath = join(root, 'Cargo.toml');
  const cargoText = readText(cargoPath);
  if (cargoText == null) return false;
  const cargo = parseToml(cargoText);
  // Gate: a real crate/workspace manifest carries [package] or [workspace].
  // (workspace `members` scope emission is out of scope — single crate + one-level
  // workspace only; justfile/xtask are documented-only, no parser.)
  if (!cargo.package && !cargo.workspace) return false;

  out.stack.push('rust');
  if (out.package_manager === null) out.package_manager = 'cargo';

  const anchor = cargo.workspace ? '[workspace]' : '[package]';
  const cargoCite = () => sourceRef(root, cargoPath, findLine(cargoText, anchor));

  // rust-toolchain.toml: if clippy/rustfmt are pinned as components, cite that file
  // as the lint/format source (evidence the repo ships those components).
  const toolchainPath = join(root, 'rust-toolchain.toml');
  const toolchainText = readText(toolchainPath);
  const components = (toolchainText ? parseToml(toolchainText).toolchain?.components : null) || [];
  const comps = components.map((c) => norm(String(c)));
  const toolchainCite = () => sourceRef(root, toolchainPath, findLine(toolchainText, 'components'));
  const lintSrc = comps.includes('clippy') ? toolchainCite() : cargoCite();
  const fmtSrc = comps.includes('rustfmt') ? toolchainCite() : cargoCite();

  // --- Makefile-first (explicit, high-confidence dev interface). Only recipes that
  //     drive `cargo` are ours; dedupe by exact cmd so we never double-register a
  //     make candidate detectPython already added (maturin repos run both). ---
  const makeText = readText(join(root, 'Makefile'));
  if (makeText) {
    const make = parseMakefile(makeText);
    const makeCite = (line) => sourceRef(root, join(root, 'Makefile'), line);
    // Known edge, documented not fixed: MAKE_TARGET_ALIASES.lint includes 'check'
    // (Python heritage — `make check` commonly means lint there), but in cargo repos
    // `make check` conventionally runs `cargo check` (typecheck), not lint. No
    // fixture exercises this collision and fixing it is a behavior change, so it
    // stays out of scope here.
    for (const cat of ['typecheck', 'lint', 'format', 'test', 'bench']) {
      const aliases = cat === 'bench' ? ['bench'] : MAKE_TARGET_ALIASES[cat];
      for (const alias of aliases) {
        const t = make.targets[alias];
        if (!t) continue;
        const recipe = t.recipe.join(' ; ');
        if (!/\bcargo\b/.test(recipe)) continue; // not a cargo-driven target
        const cmd = `make ${alias}`;
        if ((out._candidates[cat] || []).some((c) => c.cmd === cmd)) break; // python added it
        const writesFmt = cat === 'format' && !/--check/.test(recipe);
        addCandidate(out, cat, {
          cmd,
          source: makeCite(t.line),
          from: 'makefile',
          mutates: writesFmt || undefined,
          note: writesFmt ? `make ${alias} writes files (recipe: ${recipe.slice(0, 80)}); use as formatter, not gate` : undefined,
          recipe,
        });
        break; // first matching alias wins per category
      }
    }
  }

  // --- intrinsic cargo candidates (per the §2 category map) ---
  addCandidate(out, 'typecheck', { cmd: 'cargo check', source: cargoCite(), from: 'rust' });
  addCandidate(out, 'lint', { cmd: 'cargo clippy --all-targets -- -D warnings', source: lintSrc, from: 'rust' });
  // detectRust's own format default always carries --check (a gate, never a mutator).
  addCandidate(out, 'format', { cmd: 'cargo fmt --all --check', source: fmtSrc, from: 'rust' });

  // test — nextest if a .config/nextest.toml is present, else cargo test. parseToml
  // never returns null (worst case an empty {} for empty/corrupted input), so any
  // present nextest.toml — including empty/corrupted — routes to `cargo nextest run`.
  const nextestPath = join(root, '.config', 'nextest.toml');
  const nextestText = readText(nextestPath);
  const usesNextest = nextestText != null;
  if (usesNextest) {
    addCandidate(out, 'test', { cmd: 'cargo nextest run', source: sourceRef(root, nextestPath, 1), from: 'rust' });
    addCandidate(out, 'test_single', { cmd: "cargo nextest run -E '<filter>'", source: sourceRef(root, nextestPath, 1), from: 'rust' });
  } else {
    addCandidate(out, 'test', { cmd: 'cargo test', source: cargoCite(), from: 'rust' });
    addCandidate(out, 'test_single', { cmd: 'cargo test -p <crate> -- <name>', source: cargoCite(), from: 'rust' });
  }
  // A local `bench` candidate IS possible — the Makefile loop above registers one
  // when a `bench` target's recipe drives cargo. CI-only bench is separately picked
  // up via CI-command adoption (reconcile step 0). Either way, safety stays 'never':
  // bench is detected + cited but never auto-run.
  // No local install/build candidate: a maturin repo's build stays the python
  // `maturin develop` surface; pure-rust build is covered by typecheck=cargo check.

  return true;
}

// ---------------------------------------------------------------------------
// Candidate bookkeeping + CI reconciliation
// ---------------------------------------------------------------------------

function addCandidate(out, category, cand) {
  if (!out._candidates[category]) out._candidates[category] = [];
  out._candidates[category].push(cand);
}

/** Choose one command per category, preferring CI-verified forms. */
function reconcile(out, ci) {
  const ciCmds = ci.commands;
  out.ci_commands = ciCmds.map((c) => ({ cmd: c.cmd, source: `${c.file}:${c.line}` }));

  for (const category of CATEGORIES) {
    const cands = out._candidates[category] || [];

    // Which CI run-lines match this category?
    let ciMatches = ciCmds.filter((c) => matchesCategory(c.cmd, category));
    // an integration/e2e run-line must never fill the plain `test` slot
    if (category === 'test') ciMatches = ciMatches.filter((c) => !matchesCategory(c.cmd, 'e2e'));

    // Mark a candidate CI-verified if a CI run-line invokes the same script/
    // target/tool. Two match modes: literal containment, or category-signature.
    const isCiVerified = (cmd) =>
      ciMatches.some((c) => {
        const a = norm(c.cmd);
        const b = norm(cmd);
        return a === b || a.includes(b) || (b.startsWith('make ') && a.includes(b)) || (b.includes('run ') && a.includes(b));
      }) || (cands.length === 0 ? false : ciMatches.length > 0 && matchesCategory(cmd, category) && ciMatches.some((c) => sharesTool(c.cmd, cmd, category)));

    let chosen = null;
    let verified_by_ci = false;

    // 0. exact CI ground truth: if a CI run-line for this category is a clean,
    //    reproducible entrypoint (`make X` / `npm run X` / a bare tool call),
    //    run EXACTLY that — "CI = ground truth, run exactly this". A local
    //    candidate that is literally that same invocation is preferred (keeps
    //    its richer source citation).
    const cleanCi = ciMatches.find((c) => isCleanInvocation(c.cmd));
    if (cleanCi) {
      const localSame = cands.find((c) => norm(c.cmd) === norm(cleanCi.cmd));
      chosen = localSame || { cmd: cleanCi.cmd, source: `${cleanCi.file}:${cleanCi.line} (CI)`, from: 'ci' };
      const localNote = cands.find((c) => c.note && sharesTool(cleanCi.cmd, c.cmd, category));
      if (localNote && !chosen.note) chosen = { ...chosen, note: localNote.note };
      verified_by_ci = true;
    }
    // 1. else a local candidate that CI provably runs (shares tool/target)
    if (!chosen) {
      chosen = cands.find((c) => isCiVerified(c.cmd)) || null;
      if (chosen) verified_by_ci = true;
    }
    // 2. else the first local candidate (Makefile > pyproject/node script order)
    if (!chosen && cands.length) {
      chosen = cands[0];
      verified_by_ci = ciMatches.some((c) => sharesTool(c.cmd, chosen.cmd, category));
    }
    // 3. else adopt a CI-only command (ground truth) — but ONLY a clean,
    //    reproducible entrypoint. Never adopt compound/substituting shell from a
    //    workflow file: adopted commands can end up auto-run by verify.mjs.
    //    NOTE: this block is currently unreachable — its guard recomputes the
    //    exact `ciMatches.find(isCleanInvocation)` from step 0 (`ciMatches` is
    //    never reassigned between them), so a clean CI-only line is already
    //    adopted at step 0 via `localSame || {…from:'ci'}`. Kept as a defensive/
    //    documented fallback: if step 0's adoption arm is ever refactored away,
    //    this preserves CI-only adoption. Covered by the ci-adopt selftest
    //    (e2e = clean CI-only) which exercises the step-0 arm.
    if (!chosen && ciMatches.length) {
      const c = ciMatches.find((x) => isCleanInvocation(x.cmd));
      if (c) {
        chosen = { cmd: c.cmd, source: `${c.file}:${c.line} (CI)`, from: 'ci' };
        verified_by_ci = true;
      }
    }
    if (!chosen) continue;

    out.commands[category] = {
      cmd: chosen.cmd,
      cwd: '.',
      source: chosen.source,
      from: chosen.from,
      safety: DEFAULT_SAFETY[category],
      verified_by_ci,
      verified: null, // filled by verify.mjs (phase 2)
      ...(chosen.mutates ? { mutates: true } : {}),
      ...(chosen.note ? { note: chosen.note } : {}),
    };
  }
}

const TOOL_FAMILIES = {
  typecheck: ['mypy', 'tsc', 'pyright', 'typecheck', 'cargo check'],
  lint: ['ruff', 'eslint', 'flake8', 'pylint', 'lint', 'clippy'],
  format: ['prettier', 'ruff format', 'black', 'format', 'cargo fmt'],
  test: ['pytest', 'vitest', 'jest', 'mocha', 'test', 'nextest'],
  e2e: ['playwright', 'cypress', 'integration'],
  build: ['build', 'maturin', 'next build', 'tsc -p'],
  install: ['install', 'npm ci', 'sync'],
  bench: ['cargo bench'],
};

function sharesTool(ciCmd, chosenCmd, category) {
  const fams = TOOL_FAMILIES[category] || [];
  const a = norm(ciCmd);
  const b = norm(chosenCmd);
  return fams.some((f) => a.includes(f) && (b.includes(f) || b.startsWith('make ') || b.includes('run ')));
}

/**
 * Is a CI command a clean, reproducible entrypoint we should adopt verbatim?
 * Accept `make <t>`, `<pm> run <s>` / bare pm invocations, and single bare tool
 * calls (`pytest ...`, `mypy ...`) — but NOT compound shell (`&&`, pipes, `cd`),
 * env-prefixed, or noisy inline commands.
 */
function isCleanInvocation(cmd) {
  const c = cmd.trim();
  if (/[|&;<>]|\bcd\b|\bexport\b/.test(c)) return false; // compound shell / redirects
  if (/[$`]/.test(c)) return false; // command substitution / env expansion / backticks
  if (/\n/.test(cmd)) return false; // multi-line
  if (/^\s*\w+=\S/.test(c)) return false; // leading VAR=val env prefix
  if (/^make\s+[\w.\-]+/.test(c)) return true;
  if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?[\w:.\-]+/.test(c)) return true;
  if (/^(npx|pipx)\s+\S+/.test(c)) return true;
  if (/^(pytest|mypy|ruff|black|eslint|tsc|pyright|flake8|pylint|vitest|jest|maturin|cargo|go)\b/.test(c)) return true;
  if (/^python\s+-m\s+\S+/.test(c)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

/** Detect the full command surface of the repo at `root`. Never throws. */
export function detectCommands(root) {
  const out = {
    veriloop_schema: 1,
    generated_by: 'veriloop/scripts/detect.mjs (phase 1)',
    repo_root: '.', // portable — resolved by agents via $CLAUDE_PROJECT_DIR / git toplevel
    package_manager: null,
    stack: [],
    polyglot: [],
    has_ui: false,
    warnings: [],
    commands: {},
    scopes: [],
    ci_commands: [],
    ci_files: [],
    _candidates: {}, // internal, stripped before write
  };

  detectNode(root, out);
  detectPython(root, out);
  detectRust(root, out);

  const ci = extractCiCommands(root);
  out.ci_files = ci.files;
  reconcile(out, ci);

  if (out.package_manager === null) out.package_manager = 'unknown';
  if (!out.stack.length) out.stack.push('unknown');
  delete out._candidates;
  return out;
}
