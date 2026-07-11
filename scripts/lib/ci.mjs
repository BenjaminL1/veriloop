// CI run-line extractor. CI is GROUND TRUTH: whatever a `run:` step executes is
// a command that provably works in a clean environment. We line-scan the YAML
// (no YAML dependency) and pull every command out of `run:` steps, handling both
// inline (`run: npm ci`) and block-scalar (`run: |`) forms. Each returned command
// carries its file:line so detected commands can cite CI as their source.

import { listDir, readText } from './util.mjs';
import { join } from 'node:path';

const WORKFLOW_DIRS = ['.github/workflows'];

/**
 * Returns { commands: [{cmd, file, line}], files: [relPaths] }.
 * `root` is the repo root (absolute).
 */
export function extractCiCommands(root) {
  const commands = [];
  const files = [];
  for (const dir of WORKFLOW_DIRS) {
    const abs = join(root, dir);
    for (const name of listDir(abs)) {
      if (!/\.(ya?ml)$/.test(name)) continue;
      const relFile = `${dir}/${name}`;
      const text = readText(join(abs, name));
      if (text == null) continue;
      files.push(relFile);
      commands.push(...scanRunSteps(text, relFile));
    }
  }
  return { commands, files };
}

function scanRunSteps(text, relFile) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // match `run:` possibly under `- ` and with leading indent
    const m = line.match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    const rest = m[2].trim();

    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-' || rest === '') {
      // block scalar: consume more-indented lines
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
    } else {
      // inline command (may be quoted)
      pushCmd(out, unquote(rest), relFile, i + 1);
    }
  }
  return out;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function pushCmd(out, cmd, file, line) {
  const c = cmd.trim();
  // skip YAML continuation / env-only / comment lines
  if (!c || c.startsWith('#') || c === '\\') return;
  out.push({ cmd: c, file, line });
}
