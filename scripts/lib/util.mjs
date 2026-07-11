// veriloop shared utilities — deterministic filesystem + citation helpers.
// Scripts own facts: every detected command must carry a `source` citation
// (file:line) so the generated bundle is auditable and never guesses.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

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
