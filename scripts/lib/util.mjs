// veriloop shared utilities — deterministic filesystem + citation helpers.
// Scripts own facts: every detected command must carry a `source` citation
// (file:line) so the generated bundle is auditable and never guesses.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

/** Read a file as UTF-8, or return null if it does not exist / can't be read. */
export function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Parse a JSON file, or return null on missing/invalid. */
export function readJson(path) {
  const t = readText(path);
  if (t == null) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function exists(path) {
  return existsSync(path);
}

/** List files in a directory (non-recursive), or [] if the dir is absent. */
export function listDir(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 1-based line number of the first line containing `needle` in `text`,
 * or null. Used to cite where a detected command actually lives.
 */
export function findLine(text, needle) {
  if (text == null) return null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return null;
}

/**
 * Build a "relpath:line" citation. `absFile` is an absolute path; it is made
 * relative to `root` so citations are portable across machines.
 */
export function sourceRef(root, absFile, line) {
  let rel = absFile;
  if (isAbsolute(absFile)) rel = relative(root, absFile) || absFile;
  return line != null ? `${rel}:${line}` : rel;
}

/** Convenience: absolute path join under a repo root. */
export function underRoot(root, ...parts) {
  return join(root, ...parts);
}

/** Make an absolute path repo-relative (portable). Leaves relative paths as-is. */
export function toRel(root, path) {
  if (!path) return path;
  return isAbsolute(path) ? relative(root, path) || '.' : path;
}

/**
 * `resolve-clean-observation-period.md` D7, axis 1 — the CONFIRM SENSOR'S WORDING HASH.
 *
 * sha256 over every `veriloop:confirmprompt` region of `source`, concatenated in file order.
 * There is more than one region because the pieces the confirm prompt is built from are not
 * adjacent in the template; hashing one span across the code between them would report an
 * edit to an unrelated prompt as a sensor change, and the window key must mean exactly one
 * thing. Only the bytes BETWEEN the markers are hashed, so the marker lines themselves and
 * the doc comments above them can be re-worded without restarting the observation window.
 *
 * THROWS on an unbalanced or absent marker pair. `generate.mjs` lets that fail the BUILD and
 * `lint-bundle.mjs` lets it fail the bundle: a hash taken over the wrong bytes would silently
 * pool runs from two different sensors, which is the one thing this key exists to prevent.
 *
 * It lives HERE, not in `generate.mjs`, because `lint-bundle` must recompute it over the
 * EMITTED workflow — the markers survive the splice — and comparing two stored copies of a
 * number can never catch a hand-edit that made both copies stale (rule 9: one source of truth).
 */
export function confirmPromptHash(source, label = 'source') {
  const S = '// <<< veriloop:confirmprompt:start >>>';
  const E = '// <<< veriloop:confirmprompt:end >>>';
  // The scan walks EVERY marker occurrence in file order and requires strict alternation
  // S,E,S,E,… Anchoring on `indexOf(S)` and jumping straight to the next `:end` — the first
  // implementation — READ as balanced but was not, in the two shapes that matter most:
  //   (a) an orphan `:end` BEFORE the first `:start` was never seen at all (the scan began at
  //       the first `:start`, and the trailing-orphan check only looked past the last consumed
  //       `:end`), so everything between that orphan and the real `:start` was silently LEFT
  //       OUT of the hash — precisely the "a piece outside the region can be reworded without
  //       moving the key" failure the markers exist to prevent; and
  //   (b) a duplicated `:start` (`S … S … E`) hashed the OUTER span, inner marker line
  //       included, yielding a digest different from the intended region with no error raised.
  // Both produced a hash. `generate.mjs` and `lint-bundle` share this implementation, so both
  // copies agreed on the wrong bytes and the recompute check stayed green — nothing caught it.
  const parts = [];
  let i = 0;
  let expectStart = true;
  let spanStart = -1;
  for (;;) {
    const s = source.indexOf(S, i);
    const e = source.indexOf(E, i);
    if (s === -1 && e === -1) break;
    const isStart = s !== -1 && (e === -1 || s < e);
    const at = isStart ? s : e;
    if (isStart !== expectStart) {
      throw new Error(expectStart
        ? `${label}: a veriloop:confirmprompt:end marker has no matching :start`
        : `${label}: a veriloop:confirmprompt:start marker has no matching :end`);
    }
    if (isStart) spanStart = at + S.length;
    else parts.push(source.slice(spanStart, at));
    expectStart = !expectStart;
    i = at + (isStart ? S.length : E.length);
  }
  if (!expectStart) throw new Error(`${label}: a veriloop:confirmprompt:start marker has no matching :end`);
  if (!parts.length) throw new Error(`${label}: no veriloop:confirmprompt region found — the D7 window key cannot be computed`);
  return createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
}

/**
 * `resolve-clean-observation-period.md` D6/D7 — THE TWO-AXIS COUNTABILITY PREDICATE, and the
 * ONE implementation of it (constitution rule 9).
 *
 * Returns the window-key axes a record FAILS to record, in record-key spelling, so both callers
 * name the same thing to the owner. Empty ⇒ the record has a sensor identity and can be placed
 * in a segment.
 *
 * `lint-bundle` FAILS a countable-class record with a non-empty result and `count-window`
 * EXCLUDES it. Those two decisions must be the same decision: they were written twice, and a
 * mutation probe showed the copies were already free to drift — relaxing the counter's copy
 * left the whole gate green while manufacturing an `undefined` sensor segment out of a truthy
 * but empty `routing: {}`, which is precisely the "unknown is not a sensor" pooling D7 forbids.
 *
 * A NON-NULL VALUE, not mere key presence: `attestationFrom` writes an explicit
 * `confirmPromptHash: null` / `routing: null` when the run recorded no sensor, so a
 * key-presence test would pass the real shape of a sensorless run. `routing.review` is checked
 * for TRUTHINESS for the same reason — `routing: {}` and `routing: { review: '' }` carry a
 * `routing` object and no route.
 */
export function missingWindowKeyAxes(rec) {
  const missing = [];
  if (!rec || rec.confirmPromptHash == null) missing.push('confirmPromptHash');
  if (!rec || !(rec.routing && rec.routing.review)) missing.push('routing.review');
  return missing;
}
