#!/usr/bin/env node
// veriloop phase 4 benchmark — bench-score (the SCORER; the gold RUN is owner-gated).
// Scores how many GOLD constitution rules a mining run recovered. Given a gold
// constitution markdown and a mined.json (the shape mine.mjs emits), it reports a
// per-rule recovered/missed table and EXITS 0 iff recovered ≥ threshold (default
// 0.8 = 12/14 on the real gold), else nonzero.
//
// IN-PROCESS-ONLY COVENANT (same as scan/mine): this script imports node:fs + node:path
// ONLY (plus the URL global + import.meta for the entry guard — no node:url import). It reads
// the two files it is GIVEN as TEXT and spawns NOTHING — no LLM, no network, no git. It is
// compiler-side (sibling of mine.mjs), NOT emitted into any target bundle.
//
// SCOPE FENCE: this is the SCORER + its fixture selftest. The actual held-out gold
// benchmark RUN (scoring the frozen Torevan gold, publishing the ≥12/14 result and
// the methodology doc's real numbers) is OWNER-GATED — this tool never reaches into
// Torevan. At RUN time the owner pipes `git show 4d0e114:docs/constitution.md` into
// --gold; the scorer just reads the file it is handed.
//
// THE MATCHER (deterministic, reproducible — NO LLM). A gold rule is RECOVERED iff
// SOME mined candidate (1) NAMES THE SAME INVARIANT and (2) carries ≥1 well-formed
// `path:line` citation:
//   1. Normalize each rule's text → a Set of CONTENT tokens: lowercase; strip a
//      trailing `_(owner: <key>)_` governance tag; strip markdown markup; split on
//      every non-alphanumeric run; drop stopwords + modal/imperative words
//      (must/never/always — constant across ALL rules, so NON-discriminative), pure
//      digits, and tokens shorter than 3 chars; dedupe.
//   2. Overlap = the CONTAINMENT (overlap) coefficient |G ∩ C| / min(|G|, |C|).
//      Containment — not Jaccard — because a mined candidate is typically TERSER
//      than the verbose gold prose; containment asks "is the candidate's content a
//      subset of the gold invariant", which Jaccard would over-penalize on the
//      length gap. A candidate MATCHES a gold rule iff overlap ≥ MATCH_THRESHOLD
//      (0.5) AND both token sets have ≥2 tokens (guards a 1-token coincidence).
//   3. CITATION IS REQUIRED, not just a text match. A candidate that names the same
//      invariant but has NO well-formed citation leaves the gold rule MISSED. A
//      citation is well-formed iff it is `<path>:<line>` with a non-empty,
//      whitespace-free path and a positive integer line. The scorer checks
//      well-formedness ONLY — it is NOT given the corpus root and stays in-process;
//      mine.mjs already emitted citations for REAL conforming sites it witnessed.
//
// Usage:
//   node bench-score.mjs --gold <gold-constitution.md> --mined <mined.json> [--threshold 0.8]

import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

// --- CLI ---------------------------------------------------------------------
function reqVal(argv, i, flag) {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) {
    console.error(`missing value for ${flag}`);
    process.exit(2);
  }
  return v;
}

function parseArgs(argv) {
  const args = { gold: null, mined: null, threshold: 0.8, expectRules: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--gold') args.gold = resolve(reqVal(argv, ++i, '--gold'));
    else if (a === '--mined') args.mined = resolve(reqVal(argv, ++i, '--mined'));
    else if (a === '--threshold') args.threshold = Number(reqVal(argv, ++i, '--threshold'));
    else if (a === '--expect-rules') args.expectRules = Number(reqVal(argv, ++i, '--expect-rules'));
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

// --- Normalization -----------------------------------------------------------
// Modal/imperative words are treated as stopwords: EVERY rule says must/never/
// always, so they carry no discriminating signal and would inflate overlap
// between UNRELATED rules. The discriminative signal is the content nouns/verbs.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'be', 'been', 'being',
  'was', 'were', 'with', 'for', 'on', 'at', 'by', 'it', 'its', 'that', 'this', 'these',
  'those', 'any', 'all', 'from', 'into', 'out', 'as', 'if', 'so', 'than', 'then',
  'every', 'each', 'which', 'who', 'whom', 'whose', 'we', 'our', 'you', 'your', 'they',
  'their', 'will', 'would', 'can', 'could', 'cannot', 'may', 'might', 'should', 'shall',
  'do', 'does', 'done', 'has', 'have', 'had', 'but', 'only', 'ever', 'must', 'never',
  'always', 'not', 'no', 'without', 'before', 'after', 'when', 'while', 'via', 'per',
  'up', 'off', 'onto', 'over', 'under', 'again', 'once', 'here', 'there', 'other', 'same',
]);

/** Normalize a rule's text into a Set of discriminative content tokens. */
function contentTokens(text) {
  const stripped = String(text)
    .toLowerCase()
    // drop a trailing governance tag `_(owner: security)_` / `(owner: drift)`
    .replace(/_?\(\s*owner:[^)]*\)_?/g, ' ')
    // markdown markup → space (backticks, emphasis, headings, list/link syntax)
    .replace(/[`*_#>\[\]()]/g, ' ');
  const tokens = new Set();
  for (const raw of stripped.split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue; // drops "is", "be", single letters, most line refs
    if (/^\d+$/.test(raw)) continue; // pure digits (line numbers embedded in prose)
    if (STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

/** Containment (overlap) coefficient |G ∩ C| / min(|G|, |C|); 0 if either set < 2. */
function overlap(gTokens, cTokens) {
  if (gTokens.size < 2 || cTokens.size < 2) return 0;
  let inter = 0;
  const [small, big] = gTokens.size <= cTokens.size ? [gTokens, cTokens] : [cTokens, gTokens];
  for (const t of small) if (big.has(t)) inter++;
  return inter / small.size;
}
const MATCH_THRESHOLD = 0.5; // documented text-overlap bar for "names the same invariant"

// A citation is well-formed iff `<path>:<line>` — non-empty whitespace-free path,
// positive integer line. Split on the LAST colon so a path may itself contain one.
function isWellFormedCitation(c) {
  if (typeof c !== 'string') return false;
  const idx = c.lastIndexOf(':');
  if (idx <= 0 || idx === c.length - 1) return false;
  const path = c.slice(0, idx);
  const line = c.slice(idx + 1);
  if (/\s/.test(path)) return false;
  if (!/^\d+$/.test(line)) return false;
  return Number(line) >= 1;
}

// --- Parsing -----------------------------------------------------------------
/**
 * Parse the gold's numbered rules. A rule STARTS at a top-level ordered-list line
 * `^(\d+)\.\s` (column 0 — mirrors the plan's `grep -cE '^[0-9]+\.'` count of 14)
 * and RUNS until the next such line, a markdown heading, or a `---` rule / EOF.
 * Continuation lines (indented prose) are folded into the rule text.
 */
export function parseGoldRules(md) {
  const lines = String(md).split('\n');
  const rules = [];
  let cur = null;
  for (const line of lines) {
    const start = line.match(/^(\d+)\.\s+(.*)$/);
    if (start) {
      if (cur) rules.push(cur);
      cur = { n: Number(start[1]), text: start[2] };
      continue;
    }
    if (/^#{1,6}\s/.test(line) || /^---+\s*$/.test(line)) {
      // section boundary ends the current rule; the divider itself is not rule text
      if (cur) { rules.push(cur); cur = null; }
      continue;
    }
    if (cur) cur.text += ` ${line.trim()}`;
  }
  if (cur) rules.push(cur);
  return rules;
}

/** Read mined.json candidates → [{ rule, citations }]. Defensive about shape. */
function parseMinedCandidates(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.candidates)) return null;
  return obj.candidates.map((c) => ({
    rule: typeof c?.rule === 'string' ? c.rule : '',
    citations: Array.isArray(c?.citations) ? c.citations : [],
  }));
}

// --- Scoring -----------------------------------------------------------------
/**
 * Score gold-rule recovery. Pure + deterministic. Returns the per-rule verdicts,
 * the recovered count, and whether recovered/total ≥ threshold.
 * @param {string} goldMd  gold constitution markdown (text)
 * @param {{candidates: Array}} minedObj  parsed mined.json
 * @param {number} threshold  recovery ratio in (0, 1]
 */
export function scoreRecovery(goldMd, minedObj, threshold = 0.8) {
  const goldRules = parseGoldRules(goldMd).map((r) => ({ ...r, tokens: contentTokens(r.text) }));
  const candidates = (parseMinedCandidates(minedObj) || []).map((c) => ({
    rule: c.rule,
    tokens: contentTokens(c.rule),
    validCitations: c.citations.filter(isWellFormedCitation),
  }));

  const results = [];
  const consumed = new Set(); // 1:1 — a candidate recovers AT MOST ONE gold rule (no double-count)
  for (const g of goldRules) {
    const matching = candidates
      .map((c, i) => ({ c, i, ov: overlap(g.tokens, c.tokens) }))
      .filter((m) => m.ov >= MATCH_THRESHOLD)
      .sort((a, b) => b.ov - a.ov || a.i - b.i); // best overlap first, then stable by index
    if (matching.length === 0) {
      results.push({ n: g.n, recovered: false, reason: 'unmatched', candidate: null, citation: null });
      continue;
    }
    // 1:1 ASSIGNMENT — recover with the best-overlap matching candidate that has a valid citation
    // AND is not already claimed by an earlier rule. Without this, one terse generic candidate
    // (e.g. tokens {process, pass}) recovers several gold rules and inflates the headline number;
    // requiring a DISTINCT cited candidate per rule closes that gaming hole.
    const pick = matching.find((m) => m.c.validCitations.length >= 1 && !consumed.has(m.i));
    if (pick) {
      consumed.add(pick.i);
      results.push({ n: g.n, recovered: true, reason: 'recovered', candidate: pick.c.rule, citation: pick.c.validCitations[0] });
    } else {
      // A text match is NOT enough — a well-formed citation is required (mining's rule-2). Distinguish
      // "no cited candidate at all" from "its only cited candidate already recovered another rule".
      const citedButClaimed = matching.some((m) => m.c.validCitations.length >= 1);
      results.push({
        n: g.n,
        recovered: false,
        reason: citedButClaimed ? 'no-distinct-cited-candidate' : 'matched-without-valid-citation',
        candidate: matching[0].c.rule,
        citation: null,
      });
    }
  }

  const total = results.length;
  const recovered = results.filter((r) => r.recovered).length;
  const ratio = total > 0 ? recovered / total : 0;
  // epsilon guards the exact-boundary case (12/14 vs 0.8, 4/5 vs 0.8) against float drift.
  const pass = total > 0 && ratio >= threshold - 1e-9;
  return { total, recovered, ratio, threshold, pass, results };
}

// --- CLI entry ---------------------------------------------------------------
function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node bench-score.mjs --gold <gold-constitution.md> --mined <mined.json> [--threshold 0.8] [--expect-rules N]');
    return;
  }
  for (const [flag, val] of [['--gold', args.gold], ['--mined', args.mined]]) {
    if (!val) {
      console.error(`missing required ${flag}`);
      process.exit(2);
    }
  }
  if (!(Number.isFinite(args.threshold) && args.threshold > 0 && args.threshold <= 1)) {
    console.error(`--threshold must be a number in (0, 1]; got ${args.threshold}`);
    process.exit(2);
  }

  let goldMd;
  try {
    goldMd = readFileSync(args.gold, 'utf8');
  } catch (e) {
    console.error(`cannot read --gold ${args.gold}: ${e.message}`);
    process.exit(2);
  }
  let minedObj;
  try {
    minedObj = JSON.parse(readFileSync(args.mined, 'utf8'));
  } catch (e) {
    console.error(`cannot read/parse --mined ${args.mined}: ${e.message}`);
    process.exit(2);
  }
  if (!minedObj || typeof minedObj !== 'object' || !Array.isArray(minedObj.candidates)) {
    console.error(`--mined ${args.mined} has no candidates[] array (not a mine.mjs mined.json)`);
    process.exit(2);
  }

  const score = scoreRecovery(goldMd, minedObj, args.threshold);
  if (score.total === 0) {
    console.error(`no numbered rules parsed from --gold ${args.gold} (expected top-level \`N.\` list items)`);
    process.exit(2);
  }
  // Denominator integrity: the recovery ratio is N/total, so a mis-parsed gold silently shifts the
  // headline. --expect-rules pins the count (e.g. the frozen gold's `grep -cE '^[0-9]+\.'` = 14) so
  // a formatting drift fails the run LOUDLY instead of publishing "/13" or "/15".
  if (args.expectRules !== null && score.total !== args.expectRules) {
    console.error(`--gold parsed ${score.total} numbered rules but --expect-rules ${args.expectRules} was required — denominator mismatch (check the gold's ordered-list formatting)`);
    process.exit(2);
  }

  // per-rule table
  console.log(`veriloop bench-score — gold ${args.gold.split('/').slice(-1)[0]}`);
  for (const r of score.results) {
    if (r.recovered) {
      console.log(`  rule ${String(r.n).padEnd(3)} → recovered  ${truncate(r.candidate, 64)}  [cite ${r.citation}]`);
    } else if (r.reason === 'matched-without-valid-citation') {
      console.log(`  rule ${String(r.n).padEnd(3)} → missed     (matched candidate carried no well-formed file:line citation)`);
    } else if (r.reason === 'no-distinct-cited-candidate') {
      console.log(`  rule ${String(r.n).padEnd(3)} → missed     (its only cited candidate already recovered another rule — 1:1)`);
    } else {
      console.log(`  rule ${String(r.n).padEnd(3)} → missed     (no candidate names this invariant)`);
    }
  }
  const pct = (score.ratio * 100).toFixed(1);
  const thrPct = (score.threshold * 100).toFixed(1);
  console.log(`\n  recovered ${score.recovered}/${score.total} (${pct}%)  threshold ${thrPct}% → ${score.pass ? 'PASS' : 'FAIL'}`);
  process.exit(score.pass ? 0 : 1);
}

// Run only when invoked as the entry script — importing parseGoldRules/scoreRecovery
// (the fixture selftest) must NOT trigger a scoring run. REALPATH both sides so a
// symlinked invocation path (macOS /tmp→/private/tmp, symlinked plugin install) does
// not falsely skip main() — the same guard idiom as verify.mjs:145.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(decodeURIComponent(new URL(import.meta.url).pathname))) main();
