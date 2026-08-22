#!/usr/bin/env node
// veriloop — the resolve=clean OBSERVATION WINDOW counter.
//
// Spec: `.claude/veriloop/specs/resolve-clean-observation-period.md`, D5 (countability and
// the sole home), D6 (the pre-registered numbers) and D7 (the two-axis window key), owner-
// ratified 2026-08-21. READ-ONLY: it reads committed records and prints. It writes nothing,
// commits nothing, and is deliberately NOT wired into `commands.json` or the gate — it is
// hand-run at the arming evaluation and exercised by the selftest against synthetic records.
//
// WHAT IT IS AND IS NOT (constitution rule 2, and R4 of the spec): every number here is
// "what the records say". Records are agent-written — redacted, schema-checked and
// provenance-gated, but still agent-reported, because the emitted workflow cannot run git.
// Nothing printed below is a measurement of what actually happened in a run.
//
// Usage:
//   node scripts/count-window.mjs [--repo <path>] [--main <ref>] [--json]
//     --repo  git repo whose history/ is counted (default: cwd)
//     --main  the SOLE countable home (default: `main`) — D5
//     --json  emit the whole report as JSON instead of prose

import { spawnSync } from 'node:child_process';
import { missingWindowKeyAxes } from './lib/util.mjs';

const HISTORY_DIR = '.claude/veriloop/history';
// D5 — a countable run is a machine emit or a hand-driven re-gate. `probe` records (D10/D11)
// are sensor characterization and are NEVER countable, in either direction.
const COUNTABLE_CLASSES = ['loop', 'regate'];
// D5 — "reached a gate verdict", which includes park-terminal-after-verdict: a PARK-TERMINAL
// record keeps the GATE's verdict at top level and reports `terminalState` beside it, so it
// counts. A park BEFORE the gate never produced a verdict and cannot appear here.
const VERDICTS = ['PASS', 'CONCERNS', 'WAIVED', 'FAIL'];
// D6 — the owner's pre-registered numbers, fixed BEFORE the data. Never move them to fit a
// result; D9 makes re-opening the question a new dated ratification, not an edit here.
const MIN_N = 10;
const PASS_THRESHOLD = 0.70;

function parseArgs(argv) {
  const args = { repo: process.cwd(), main: 'main', json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--repo') args.repo = argv[++i];
    else if (argv[i] === '--main') args.main = argv[++i];
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

// `-c core.quotePath=false` on EVERY invocation, because both path-listing readers below filter
// `--name-only` / `ls-tree` output with `.endsWith('.json')`. Git C-QUOTES a path holding
// non-ASCII bytes by default, so such a line arrives ending in `"` and is silently dropped — and
// dropping a path HERE is the worst direction available: a record missing from the all-refs walk
// reads as UNCOLLECTED 0, which is the condition D5 makes the arming evaluation conditional on.
// The gate that exists to REFUSE an evaluation would have performed one.
function git(repo, argv) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', '-C', repo, ...argv], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
}

/** Root-level record paths on a ref — `dry-runs/`, `parks/` and `probes/` are subdirectories and never listed. */
function recordsOnRef(repo, ref) {
  const r = git(repo, ['ls-tree', '--name-only', `${ref}:${HISTORY_DIR}`]);
  if (r.status !== 0) return null; // no such ref, or no history/ on it
  return r.out.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.json'));
}

/**
 * Every record path on a ref, RECURSIVELY — root records and subdirectory ones
 * (`probes/<ts>.json`) alike, each relative to `history/`. Used for the UNCOLLECTED set only;
 * `recordsOnRef` above remains the countable surface, because D5 makes main's history ROOT the
 * sole countable home and probe-class records are never countable in either direction.
 */
function allRecordsOnRef(repo, ref) {
  const r = git(repo, ['ls-tree', '-r', '--name-only', `${ref}:${HISTORY_DIR}`]);
  if (r.status !== 0) return null;
  return new Set(r.out.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.json')));
}

/**
 * Every record path ever ADDED anywhere in this repo's refs — local branches, tags and
 * remote-tracking refs. The completeness half of D5: a record that exists on some branch and
 * not on main is UNCOLLECTED, which WARNS and blocks the arming evaluation but never counts.
 *
 * SUBDIRECTORY RECORDS ARE ENUMERATED TOO. They are never COUNTABLE, but UNCOLLECTED is a
 * COMPLETENESS check, not a count — and `probes/` is a TRACKED subdirectory (D11: the replay
 * battery and the seeded probe commit there). Dropping subdirectory paths here made exactly
 * the stranded battery record this gate exists to surface invisible to it: a probe committed
 * on a branch and never collected onto main would have read as UNCOLLECTED 0, and the
 * deferred-disclosure corpus D10 commits at window close is the same shape. `dry-runs/` and
 * `parks/` are machine-ignored, so they never reach a commit and cannot appear here at all.
 *
 * HONEST LIMIT (spec R2): a DELETED ref is invisible here, and so is an uncommitted record
 * sitting in a worktree — deleting a branch before collecting its record UNBLOCKS arming by
 * destroying evidence. This is a tripwire over what remains, never enforcement.
 *
 * HONEST LIMIT (path parsing): `core.quotePath=false` stops git quoting non-ASCII names, but a
 * filename containing a NEWLINE, a double quote or a backslash is still C-quoted or split by
 * git regardless of that setting, and this line-based reader drops it. Such a record would be
 * invisible to UNCOLLECTED — the same FAIL-ward direction as a deleted ref. The emitted loop
 * only ever writes `<ts>.json`, so this is reachable only by a HAND-PLACED file, which is the
 * same class of trust the whole R4 caveat already names.
 */
function recordsOnAllRefs(repo) {
  const r = git(repo, ['log', '--all', '--diff-filter=A', '--format=', '--name-only', '--', `${HISTORY_DIR}/`]);
  if (r.status !== 0) return null;
  const out = new Set();
  for (const line of r.out.split('\n')) {
    const p = line.trim();
    if (!p.startsWith(`${HISTORY_DIR}/`) || !p.endsWith('.json')) continue;
    out.add(p.slice(HISTORY_DIR.length + 1));
  }
  return out;
}

function readRecord(repo, ref, name) {
  const r = git(repo, ['show', `${ref}:${HISTORY_DIR}/${name}`]);
  if (r.status !== 0) return null;
  try { return JSON.parse(r.out); } catch { return null; }
}

/**
 * D7 — the window key is BOTH axes, and there are NO substitution literals left. The key used
 * to fall back to `(no confirm_prompt_hash)` / `(no recorded review route)`, which read as
 * honest labelling and was the opposite: two records missing the same axis produced the same
 * placeholder string, so they POOLED into one segment — a segment whose members are exactly the
 * runs whose sensor nobody can identify. D7's rule is that runs under different sensors never
 * pool, and "unknown" is not a sensor. Keyless records are now excluded by `classify` before
 * they can reach this function, so both fields are present by construction here.
 */
const windowKey = (rec) => `${rec.confirmPromptHash} :: ${rec.routing.review}`;

// D6/D7 — the axes a record must record to be countable at all live in `lib/util.mjs`, imported
// above, because `lint-bundle`'s check 6a decides the SAME question at write time and rule 9
// allows exactly one implementation of it. Two copies drifted in a mutation probe: relaxing this
// side alone kept the whole gate green while pooling sensorless runs into an invented segment.

/**
 * D5's refutation rate: `(raw − confirmed − unverified) / (raw − unverified)`.
 *
 * `unverifiedConcerns` is an ARRAY in the record (the concern texts a dead confirm seat left
 * unchecked) while `rawConcerns` / `confirmedConcerns` are numbers — the shapes differ, so the
 * length is taken here rather than the value. Unverified concerns leave BOTH sides of the
 * ratio: a dead seat is not a refutation, and a spec that let it read as one would report a
 * broken sensor as a discriminating one.
 */
function refutationRate(agg) {
  const denom = agg.raw - agg.unverified;
  if (denom <= 0) return null;
  return (agg.raw - agg.confirmed - agg.unverified) / denom;
}

function classify(repo, ref) {
  const names = recordsOnRef(repo, ref);
  if (names === null) return { error: `no \`${HISTORY_DIR}\` on ref '${ref}'` };
  const countable = [];
  const excluded = [];
  const malformed = [];
  const keyless = [];
  for (const name of names.sort()) {
    const rec = readRecord(repo, ref, name);
    if (!rec) { malformed.push({ name, why: 'not readable as JSON' }); continue; }
    let why = null;
    if (!COUNTABLE_CLASSES.includes(rec.emittedBy)) why = `emittedBy ${JSON.stringify(rec.emittedBy ?? null)} (pre-instrumentation or probe-class)`;
    else if (rec.dryRun === true) why = 'dry run';
    else if (rec.resolveMode !== 'clean') why = `resolveMode ${JSON.stringify(rec.resolveMode ?? null)}`;
    else if (!VERDICTS.includes(rec.verdict)) why = `no gate verdict (${JSON.stringify(rec.verdict ?? null)})`;
    else {
      // D6/D7 — the LAST countability condition, and the one D6 states in its own words: the
      // window opens at "the FIRST record carrying `emittedBy` + the D7 window key". A record
      // that reached a verdict under resolve=clean but recorded no sensor identity is therefore
      // NON-COUNTABLE, not a countable run with a blank key. It is warned by name below and by
      // the missing key, so the gap is visible as a gap; check 6a fails such a record at write
      // time, so this branch is for records that predate the check or were hand-written.
      const missing = missingWindowKeyAxes(rec);
      if (missing.length) {
        why = `no D7 window key — missing ${missing.join(', ')}`;
        keyless.push({ name, missing });
      }
    }
    if (why) { excluded.push({ name, why }); continue; }
    countable.push({ name, rec });
  }
  return { countable, excluded, malformed, keyless };
}

function summarize(rows) {
  const agg = { n: rows.length, pass: 0, raw: 0, confirmed: 0, unverified: 0, unusable: [] };
  for (const { name, rec } of rows) {
    if (rec.verdict === 'PASS') agg.pass++;
    const raw = rec.rawConcerns;
    const confirmed = rec.confirmedConcerns;
    const unverified = Array.isArray(rec.unverifiedConcerns) ? rec.unverifiedConcerns.length : null;
    if (typeof raw !== 'number' || typeof confirmed !== 'number' || unverified === null) {
      // Counted in N (it reached a verdict) but excluded from the ratio: fail-closed, and
      // SAID, rather than silently coerced to zero. Check 6a fails a clean record missing
      // these, so this branch is for records that predate the check or were hand-written.
      agg.unusable.push(name);
      continue;
    }
    agg.raw += raw;
    agg.confirmed += confirmed;
    agg.unverified += unverified;
  }
  agg.passRate = agg.n ? agg.pass / agg.n : null;
  agg.refutationRate = refutationRate(agg);
  return agg;
}

function main() {
  const args = parseArgs(process.argv);
  const c = classify(args.repo, args.main);
  if (c.error) {
    console.error(`count-window: ${c.error}`);
    process.exit(2);
  }

  // D5 — UNCOLLECTED: reachable on some ref, absent from main. It WARNS, it never counts.
  // BOTH sides of the comparison are RECURSIVE, so a `probes/` record is compared against
  // main's `probes/`; taking main's side from `classify` (root-level only) while the all-refs
  // side listed subdirectories would report every collected probe as permanently uncollected
  // and block the arming evaluation forever.
  const allRefs = recordsOnAllRefs(args.repo);
  // No `||` fallback: `classify` above EXITED 2 when `main` has no `history/`, which is the only
  // way this recursive listing of the same ref can return null. A fallback here would have been
  // unreachable code standing in for a case that already terminated the process.
  const onMain = allRecordsOnRef(args.repo, args.main);
  const uncollected = allRefs === null ? null : [...allRefs].filter((n) => !onMain.has(n)).sort();

  const overall = summarize(c.countable);

  // D7 — A SEGMENT IS A RUN OF CONSECUTIVE EQUAL KEYS, NOT A KEY. Grouping by key identity
  // POOLED a returning sensor: A → B → A reported ONE row reading `[2]` for key A, over two runs
  // separated by a window restart — the exact pooling the printed heading forbids, and which the
  // live-window computation below already refused, so the two disagreed in the same report. D7
  // says a mid-window change to either axis RESTARTS the window; a sensor that comes back opens a
  // NEW window rather than re-opening the closed one, so it gets its own row. `opensAt` is carried
  // because two rows can now legitimately share a key and nothing else would tell them apart.
  const runs = [];
  for (const row of c.countable) {
    const key = windowKey(row.rec);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else runs.push({ key, rows: [row] });
  }
  const bySegment = runs.map(({ key, rows }) => ({ key, opensAt: rows[0].name, ...summarize(rows) }));

  // D7 — THE WINDOW IS A SEGMENT, NOT THE UNION. "A mid-window change to EITHER restarts the
  // window (runs under different sensors never pool)", so the current window is the TRAILING
  // CONTIGUOUS run of countable records sharing one window key, in record order. Records
  // before the last sensor change belong to a CLOSED window and can never be pooled into the
  // live one — not for N, not for the base rate. `overall` above is still reported, because
  // knowing how many runs exist in total is useful, but it is NOT a window statistic and D6's
  // `Minimum N` / `strict-PASS` are read from `window` below and from nothing else.
  //
  // Records are ordered by FILENAME (`classify` sorts them), which is the only order main
  // carries; a hand-committed record with a misleading filename therefore lands in the wrong
  // segment — the same self-reported-timestamp limit the backdating gate flags, not fixes.
  //
  // It is the LAST RUN computed above rather than a second trailing-run walk of its own: written
  // twice, the segment table and the live window were free to disagree about what a segment is,
  // and with key-identity grouping they did. The current window is now BY CONSTRUCTION the last
  // row of the printed table.
  const ordered = c.countable;
  const liveRun = runs.length ? runs[runs.length - 1] : null;
  const windowRows = liveRun ? liveRun.rows : [];
  const window = liveRun
    ? {
        key: liveRun.key,
        opensAt: windowRows[0].name,
        restarted: windowRows.length !== ordered.length,
        priorClosedRecords: ordered.length - windowRows.length,
        ...summarize(windowRows),
      }
    : null;

  // D5 — the arming evaluation is BLOCKED while UNCOLLECTED > 0. And even with zero, this
  // script never declares the dial armed: D6's second condition is the seeded floor (D8),
  // measured by a hand-run probe, which no record on main can tell us about.
  const arming = { evaluated: false, reason: null, minN: MIN_N, passThreshold: PASS_THRESHOLD, nMet: null, passMet: null, windowN: null, windowPassRate: null, pooledN: overall.n };
  if (uncollected === null) arming.reason = 'UNCOLLECTED could not be enumerated (this is not a git repo, or the ref walk failed) — completeness is unknown, so the evaluation is refused';
  else if (uncollected.length > 0) arming.reason = `REFUSED — ${uncollected.length} UNCOLLECTED record(s) exist on other refs. Triage-commit them to '${args.main}' first; a denominator missing its FAIL-ward runs arms on the wrong number`;
  else {
    arming.evaluated = true;
    // D6's numbers are WINDOW quantities (D7). Reading them off the union would let a sensor
    // change manufacture an N it never had under one sensor.
    arming.nMet = window !== null && window.n >= MIN_N;
    arming.passMet = window !== null && window.passRate !== null && window.passRate >= PASS_THRESHOLD;
    arming.windowN = window ? window.n : 0;
    arming.windowPassRate = window ? window.passRate : null;
    arming.reason = 'the record-side criteria only, read over the CURRENT WINDOW SEGMENT (D7) — the D8 seeded floor is a hand-run probe result and is NOT readable from main';
  }

  const report = {
    ref: args.main,
    countable: overall,
    countableRecords: c.countable.map((r) => r.name),
    excluded: c.excluded,
    keyless: c.keyless,
    malformed: c.malformed,
    segments: bySegment,
    window,
    uncollected,
    arming,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
  const L = [];
  L.push(`resolve=clean observation window — WHAT THE RECORDS ON '${args.main}' SAY (agent-written evidence, never a measurement of the runs themselves)`);
  L.push('');
  L.push(`  countable N            ${overall.n}   (emittedBy ∈ {${COUNTABLE_CLASSES.join(', ')}}, resolveMode=clean, non-dry, reached a verdict)`);
  L.push(`  strict-PASS base rate  ${pct(overall.passRate)}   (${overall.pass}/${overall.n})`);
  L.push(`  refutation rate        ${pct(overall.refutationRate)}   (raw ${overall.raw} − confirmed ${overall.confirmed} − unverified ${overall.unverified}) / (raw ${overall.raw} − unverified ${overall.unverified})`);
  if (overall.unusable.length) L.push(`  ⚠ excluded from the refutation ratio (missing D8 fields): ${overall.unusable.join(', ')}`);
  L.push('');
  L.push(`  WINDOW SEGMENTS — D7 key is (confirm_prompt_hash, recorded review route). Runs under different sensors NEVER pool.`);
  if (!bySegment.length) L.push('    (none — no countable records)');
  for (const s of bySegment) L.push(`    [${s.n}]  from ${s.opensAt}  PASS ${pct(s.passRate)}  refute ${pct(s.refutationRate)}   ${s.key}`);
  if (bySegment.length > 1) L.push(`    ⚠ ${bySegment.length} segments: the sensor MOVED. A statistic over the union of these is not a window statistic, and nothing below reads one.`);
  L.push('');
  if (!window) L.push('  CURRENT WINDOW — none (no countable records yet).');
  else {
    L.push(`  CURRENT WINDOW — the trailing segment under the live sensor; D6's numbers are read from HERE and nowhere else:`);
    L.push(`    opens at   ${window.opensAt}${window.restarted ? `   (RESTARTED — ${window.priorClosedRecords} earlier countable record(s) belong to a CLOSED window and never pool)` : ''}`);
    L.push(`    N          ${window.n}`);
    L.push(`    strict-PASS  ${pct(window.passRate)}   (${window.pass}/${window.n})`);
    L.push(`    refutation   ${pct(window.refutationRate)}`);
    L.push(`    sensor     ${window.key}`);
  }
  L.push('');
  if (c.excluded.length) {
    L.push(`  NOT COUNTABLE (${c.excluded.length}) — recorded, never counted:`);
    for (const e of c.excluded) L.push(`    ${e.name}  — ${e.why}`);
    L.push('');
  }
  if (c.keyless.length) {
    L.push(`  ⚠ NO D7 WINDOW KEY (${c.keyless.length}) — a clean run that reached a verdict but recorded no sensor identity. NON-COUNTABLE: an unknown sensor is not a sensor, and pooling these would merge runs D7 says never pool:`);
    for (const k of c.keyless) L.push(`    ${k.name}  — missing ${k.missing.join(', ')}`);
    L.push('');
  }
  if (c.malformed.length) {
    L.push(`  ⚠ UNREADABLE (${c.malformed.length}): ${c.malformed.map((m) => m.name).join(', ')}`);
    L.push('');
  }
  if (uncollected === null) L.push('  ⚠ UNCOLLECTED could not be enumerated — the ref walk failed, so completeness is UNKNOWN.');
  else if (uncollected.length) {
    L.push(`  ⚠ UNCOLLECTED (${uncollected.length}) — reachable on another ref, ABSENT from '${args.main}'. These never count. Triage-commit them:`);
    for (const u of uncollected) L.push(`    ${HISTORY_DIR}/${u}`);
    L.push('    (A DELETED branch is invisible to this walk, and so is an uncommitted record in a worktree — spec R2.)');
  } else L.push(`  UNCOLLECTED  0 — every record added on any ref is present on '${args.main}'.`);
  L.push('');
  if (!arming.evaluated) {
    L.push(`  ARMING EVALUATION: NOT PERFORMED — ${arming.reason}`);
  } else {
    L.push(`  ARMING EVALUATION (${arming.reason}):`);
    L.push(`    N ≥ ${MIN_N}                 ${arming.nMet ? 'MET' : 'NOT MET'}  (${window ? window.n : 0} in the current window; ${overall.n} pooled across all segments, which is NOT the criterion)`);
    L.push(`    strict-PASS ≥ ${pct(PASS_THRESHOLD)}      ${arming.passMet ? 'MET' : 'NOT MET'}  (${pct(window ? window.passRate : null)} in the current window)`);
    L.push(`    D8 seeded floor          NOT READABLE HERE — hand-run probe (D10), both arms, required before any reading is taken`);
    L.push(`    At n≈${MIN_N} the ${pct(PASS_THRESHOLD)} threshold is an anti-goalpost PRE-COMMITMENT, not a sharp discriminator (D6's own honesty rider).`);
  }
  console.log(L.join('\n'));
}

main();
