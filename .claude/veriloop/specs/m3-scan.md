# Spec: M3 §1 — `scripts/scan.mjs` (phase 3 deep scan)

> BINDING. Extracted from `docs/plans/m3-plan.md` §1 (the plan-stable M3 doc; that
> section is the authority — read it). First buildable slice of M3; its output
> `scan-notes.md` is what `mine.mjs` (§2) will consume next. **This slice does NOT
> mine, score, or run any nominated check — it scans and stops.**

## What
A new **deterministic** compiler-side script `scripts/scan.mjs` (sibling of
`detect.mjs`/`generate.mjs`; NOT emitted into target bundles). It walks a repo's danger
surfaces and emits `scan-notes.md`, then STOPS for owner review. **Scripts own facts**
(a deterministic pattern catalog + `file:line` evidence); **the owner owns judgment**
(confirming the classifications at the halt). No LLM inside `scan.mjs` itself — that is
the constitution-rule-2 discipline this milestone must not weaken.

## Output — `scan-notes.md` schema (machine-readable; §2 will parse it)
Per surface:
```
## surface: <name>
- evidence: <path>:<line>          # ≥1 per surface, each a REAL file:line
- nominates: expert=<key> | rule="<one-line candidate rule>"
```
Resumability cursor in frontmatter:
```
---
scanned_paths:
  - <path already scanned>
---
```

## Danger-surface catalog (deterministic; v1 scope, extensible)
A hardcoded catalog: each entry = `{ name, matcher (regex/path-glob, in-process),
nominated expert key }`. The expert key MUST be one of `SPECIALIST_DEFAULTS`
(`security|drift|ux`, `generate.mjs:170`) so a nomination maps 1:1 onto `applyRosterAdd`
(`generate.mjs:179-210`). Minimum catalog:
- shell-string execution (`shell:\s*true`, `child_process` + backtick/`exec(`, `eval(`) → **security**
- secret/env handling (`process.env`, `*_KEY`, `SERVICE_ROLE`, `server-only`) → **security**
- DB / SQL / RLS access (`.sql` files, `SECURITY DEFINER`, `supabase`, `migrations/`) → **security**
- untrusted-input → sink (request `body`/`query`/`params` flowing to a command/query) → **security**
- filesystem writes / machine-owned emission (`writeFile`, `rm`, splice markers) → **drift**
- parity / golden-fixture surfaces (`*.fixture.json`, `conformance`, `parity`) → **drift**
- UI surfaces rendering user data (only if the stack has a UI) → **ux**

The catalog must find veriloop's OWN known surfaces when pointed at itself (e.g.
`verify.mjs:64` `shell:true`; `fixtures/hostile-ci/`; splice markers) — that is the
smoke test the selftest encodes.

## Behavior
1. Walk the tree; skip `node_modules`, `.git`, `.claude/veriloop/.backups`.
2. For each catalog surface with ≥1 hit, emit a `## surface:` block with real
   `file:line` evidence + the nominated expert + a candidate-rule string.
3. **Classification-confirm halt:** write `scan-notes.md` and EXIT 0. NEVER chain into
   mining, NEVER run/compile any nominated check. Print `review scan-notes.md, then run
   mine.mjs` — mirrors the loop's write-then-stop plan-halt (`constitution.md:3`).
4. **Bounded:** `--max <N>` cap on surfaces per invocation (default 12).
5. **Resumable:** persist scanned paths in the frontmatter cursor; a re-run skips
   completed paths and adds NO duplicate `## surface:` headers.
6. **Scan-only covenant (rule 4 spirit, load-bearing):** `scan.mjs` NEVER executes
   anything from the scanned repo — it reads files as text. Critical because a scanned
   repo may contain `fixtures/hostile-ci/`. If it spawns `git`, argv-array only,
   `shell:false` (rule 5 / M3 §3(a) discipline, applied early).

## Selftest (constitution rule 3)
Add `fixtures/scan-target/` with ≥2 known danger surfaces (a `shell: true` line; a
`process.env.FOO_KEY`; a `*.fixture.json`). Assert `scan.mjs`:
(a) emits `scan-notes.md` with the expected `## surface:` blocks;
(b) each nomination cites a real `file:line` and the correct expert key;
(c) a second run adds NO duplicate surface headers (resumability);
(d) it never executes fixture content — the fixture supplies **INPUT**, the assertion
interrogates `scan`'s **DECISION** (the rule-3 fixture-must-not-supply-the-evidence
distinction, exactly as `ci-adopt` handles it).
Assertion count must GROW from the run-time baseline (currently **212**).

## Non-goals (binding)
- NO mining, candidate re-verification, or conformance ratios (§2 / `mine.mjs`).
- NO running or compiling any nominated check (the §3 execution contract — a later slice).
- NO benchmark, NO scoring (§6).
- NO git-history mining (§2).
- NO changes to `detect`/`verify`/`generate`/`lint-bundle` behavior.
- NO LLM inside `scan.mjs`.

## Version + acceptance
- Bump `VERILOOP_VERSION` (`generate.mjs:24`; currently `0.3.7`) one patch → `0.3.8`;
  the six version stamps must agree (the `0.4.0` milestone stamp lands only when ALL of
  M3's exit criteria are met, §7).
- `npm test` green, count > 212.
- `node scripts/scan.mjs --repo fixtures/scan-target --out /tmp/sn.md` → exit 0; schema
  present with `:line` citations; a second run produces no duplicate headers.
- Self-host bundle unaffected (`scan.mjs` is compiler-side, not emitted); `lint-bundle`
  still exit 0.
