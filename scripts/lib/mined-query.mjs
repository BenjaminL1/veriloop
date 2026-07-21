// veriloop M3 §3 — Mined-query EXECUTION CONTRACT (compiler-side, NOT emitted).
//
// mine.mjs (phase 4) proposes candidate constitution rules and re-verifies them
// IN PROCESS ONLY — it spawns nothing (its selftest asserts the source carries no
// child_process/spawn token). This module is the SEPARATE contract that governs IF
// and HOW a mined candidate may be compiled to a *runnable* (spawned) check.
//
// Candidate text originates from repo docs / git-history / CI — UNTRUSTED — so this
// is a NEW untrusted-text→execution surface. The contract locks it down (M3 §3):
//   (a) NEVER synthesize a shell string. argv-array spawn ONLY, shell option false.
//   (b) grep/AST checks run in-process OR via an argv spawn — never a string handed
//       to `sh -c` (so a shell-interpreter argv[0] is itself refused).
//   (c) Every compiled query passes the rule-6 tier gate and defaults READ-ONLY —
//       routed through verify.mjs's own plan() (safety=never/mutates → non-runnable).
//   (d) Every candidate carries a provenance tag; an untagged one cannot be gated.
//   (e) Provenance inside a scan-only fixture dir BARS compilation to a runnable
//       query FOREVER — the rule-4 laundering guard (cited, never compiled+run).
//
// The compiler is a PURE function (easy to red-team): compileMinedQuery(candidate)
// → { runnable: string[] | null, reason }. It returns null (scan-only / refused)
// and NEVER returns or synthesizes a string for a shell. runMinedQuery() spawns a
// non-null argv with the shell option false, read-only.

import { spawnSync } from 'node:child_process';
import { plan } from '../verify.mjs'; // (c) REUSE the rule-6 classification — do not reinvent.

// (e) Scan-only fixture dirs (rule 4): "Nothing from fixtures/hostile-ci/ is ever
// executed — scan-only, forever" (.claude/veriloop/constitution.md:28-29;
// scripts/selftest.mjs:5,60). Provenance pointing inside ANY of these is scan-only
// forever — extensible list, seeded with the constitution-named dir.
const SCAN_ONLY_DIRS = ['fixtures/hostile-ci/'];

// (b) ALLOWLIST — only a read-only inspector binary may run. A DENYLIST is the wrong posture:
// `env sh x`, `timeout 5 sh x`, `busybox sh x`, `curl …`, `node -r evil …`, `git -c … log`,
// `find … -exec … +`, `/tmp/evil` all have a NON-shell argv[0] yet still execute arbitrary
// code, and no denylist enumerates them. This mirrors the ALLOWLIST half of detectors.mjs's
// isCleanInvocation (an earlier draft mirrored only its denylist half — the hole the red-team
// found). `grep` is the spec's sole argv tool (§3(b)); AST/regex checks run IN-PROCESS.
const RUNNABLE_TOOLS = new Set(['grep']);

/**
 * (e) Is this provenance inside a scan-only fixture dir? Fail-closed: a scan-only
 * dir token anywhere in the provenance string bars compilation (the tag prefix —
 * docs:/git-history:/scan-surface: — is stripped so a `docs:fixtures/hostile-ci/…`
 * launder is caught too).
 */
function isScanOnlyProvenance(prov) {
  // Normalize before matching (fail-closed, bias to REFUSE): lower-case + backslashes→slashes,
  // and match the dir WITHOUT its trailing slash. So a bare-dir, a Capitalized path (Darwin has
  // a case-insensitive FS — same files), or a Windows backslash provenance cannot under-match
  // the rule-4 "scan-only FOREVER" crown-jewel guard, including a future git-history: form.
  const norm = (s) => s.replace(/\\/g, '/').toLowerCase();
  const p = norm(prov);
  const body = norm(prov.replace(/^(docs|git-history|scan-surface):/, ''));
  return SCAN_ONLY_DIRS.some((dir) => {
    const d = norm(dir).replace(/\/+$/, '');
    return p.includes(d) || body.includes(d);
  });
}

/**
 * (a) Does the command TEXT carry a shell metacharacter? Mirrors the refusal half
 * of the rule-5 CI-adoption filter (scripts/lib/detectors.mjs:626-629,
 * isCleanInvocation) — a DIFFERENT trust boundary, kept as an independent,
 * self-contained guard. A command carrying any of these cannot be safely tokenized
 * to an argv; the contract refuses it rather than ever building a shell string.
 */
function hasShellMetacharacter(cmd) {
  if (/[|&;<>()]/.test(cmd)) return true; // pipe / and-or / sequence / redirect / subshell
  if (/[$`]/.test(cmd)) return true; // command substitution / env expansion / backticks
  if (/\n/.test(cmd)) return true; // multi-line
  if (/^\s*\w+=\S/.test(cmd)) return true; // leading VAR=val env prefix
  return false;
}

/**
 * Compile a mined candidate to a runnable argv, or refuse (runnable: null).
 *
 * A candidate is { provenance, command? }, where command is the UNTRUSTED proposed
 * check: { cmd: <string>, safety?: 'safe'|'ask'|'never', mutates?: boolean,
 * category?: <string> }. Absent command ⇒ in-process-only (the default regex scan
 * mine.mjs already runs needs no argv). This never synthesizes or returns a shell
 * string — the return is an argv ARRAY or null.
 *
 * @param {{provenance?: string, command?: {cmd?: string, safety?: string, mutates?: boolean, category?: string}}} candidate
 * @returns {{runnable: string[] | null, reason: string}}
 */
export function compileMinedQuery(candidate) {
  const cand = candidate || {};
  const prov = cand.provenance;

  // (d) provenance is mandatory — an untagged candidate cannot be gated → refuse.
  if (typeof prov !== 'string' || prov.trim() === '') {
    return { runnable: null, reason: 'refused (d): candidate has no provenance tag — cannot be gated' };
  }

  // (e) rule-4 laundering guard — scan-only provenance is scan-only FOREVER.
  if (isScanOnlyProvenance(prov)) {
    return { runnable: null, reason: `scan-only (e): provenance "${prov}" is inside a scan-only dir — cited, never compiled+run (rule-4 laundering guard)` };
  }

  const command = cand.command;
  // (b) in-process-first: no proposed command ⇒ nothing to spawn (the default
  // in-process regex scan is the read path; an argv is emitted only when needed).
  if (!command || typeof command.cmd !== 'string' || command.cmd.trim() === '') {
    return { runnable: null, reason: 'in-process only: no runnable command — the default regex scan runs in process (no argv needed)' };
  }
  const cmd = command.cmd.trim();

  // (a) NEVER synthesize a shell string: a command carrying any shell metacharacter
  // is refused outright (it cannot be safely argv-tokenized).
  if (hasShellMetacharacter(cmd)) {
    return { runnable: null, reason: 'refused (a): command text carries shell metacharacters — argv-only, never a shell string' };
  }

  // Metacharacter-free ⇒ whitespace-splitting into an argv ARRAY is unambiguous.
  // This is the OPPOSITE of synthesizing a shell string.
  const argv = cmd.split(/\s+/);

  // (b) ALLOWLIST the executable. argv[0] must be a bare PATH-resolved read-only inspector —
  // never a path form (/abs, ./rel, ../) and never anything but an allowlisted tool. This
  // refuses `env sh x`, `timeout 5 sh x`, `curl …`, `node -r …`, `git -c … log`, `rm …`,
  // `find … -exec … +`, `/tmp/evil`, `./evil` — every arbitrary-exec vector a shell-interpreter
  // denylist misses — while still permitting the spec's `grep`.
  const exe = argv[0];
  if (/[\\/]/.test(exe) || exe.startsWith('.')) {
    return { runnable: null, reason: `refused (b): argv[0] "${exe}" is a path form — only a bare PATH-resolved read-only tool may run` };
  }
  if (!RUNNABLE_TOOLS.has(exe)) {
    return { runnable: null, reason: `refused (b): argv[0] "${exe}" is not an allowlisted read-only inspector (${[...RUNNABLE_TOOLS].join(', ')}) — a candidate's self-declared safety is never trusted` };
  }

  // (c) rule-6 tier gate — route a SELF-DERIVED classification through verify.mjs's plan().
  // The candidate's own safety/mutates are UNTRUSTED (attacker-influenced text) and MUST NOT
  // decide this; an allowlisted tool is read-only safe-tier BY CONSTRUCTION, so we derive
  // {safe, non-mutating} and let plan() still apply rule-6 (incl. its <placeholder> guard).
  const decision = plan(command.category || 'mined', { cmd, safety: 'safe', mutates: false }, []);
  if (!decision.run) {
    return { runnable: null, reason: `refused (c): rule-6 tier gate — ${decision.reason}` };
  }

  return { runnable: argv, reason: `runnable: allowlisted read-only ${exe} (rule-6 safe-tier)` };
}

/**
 * Execute a compiled query. REFUSES anything the contract did not compile to an
 * argv (runnable === null) — it NEVER spawns on a refusal, and NEVER accepts or
 * passes a string to a shell. A non-null argv is spawned with the shell option
 * false (argv-array only), read-only.
 *
 * @param {{runnable: string[] | null, reason?: string}} compiled
 * @param {{cwd?: string, timeoutMs?: number}} [opts]
 */
export function runMinedQuery(compiled, opts = {}) {
  const runnable = compiled && compiled.runnable;
  if (!Array.isArray(runnable) || runnable.length === 0) {
    return { ran: false, refused: true, reason: (compiled && compiled.reason) || 'refused: no runnable argv' };
  }
  const [file, ...rest] = runnable;
  const res = spawnSync(file, rest, {
    cwd: opts.cwd || process.cwd(),
    shell: false, // (a) argv-array spawn ONLY — never a shell string
    encoding: 'utf8',
    timeout: opts.timeoutMs || 30000,
    maxBuffer: 16 * 1024 * 1024,
    killSignal: 'SIGKILL',
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  });
  return {
    ran: true,
    refused: false,
    argv: runnable.slice(),
    exit: res.error && res.error.code === 'ETIMEDOUT' ? null : res.status,
    ok: !res.error && res.status === 0,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}
