// Minimal, dependency-free TOML reader — scoped to the subset `pyproject.toml`
// actually uses (tables, arrays-of-tables, strings/ints/bools, single- and
// multi-line arrays, inline tables, dotted keys). NOT a spec-complete parser;
// it exists so detectors can read tool tables without a third-party dep on
// Node 20 (which ships no TOML support). Returns a plain nested object.
//
// Deliberately lenient: on anything it can't parse it skips the line rather
// than throwing, because a detector must degrade gracefully on odd input.

/** Strip a trailing `#` comment that is not inside a quoted string. */
function stripComment(line) {
  let inS = false;
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inS) {
      if (c === '\\' && q === '"') { i++; continue; } // skip escaped char in basic strings
      if (c === q) inS = false;
    } else if (c === '"' || c === "'") {
      inS = true;
      q = c;
    } else if (c === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  // basic / literal strings (single line)
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1);
  }
  if (/^[+-]?\d+$/.test(s)) return parseInt(s, 10);
  if (/^[+-]?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s; // dates, unquoted — keep raw
}

/** Split the inside of an array/inline-table on top-level commas. */
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let inS = false;
  let q = '';
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inS) {
      cur += c;
      if (c === q) inS = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inS = true;
      q = c;
      cur += c;
      continue;
    }
    if (c === '[' || c === '{') depth++;
    if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function parseValue(raw) {
  const s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner).map((x) => parseValue(x));
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1).trim();
    const obj = {};
    if (inner === '') return obj;
    for (const part of splitTopLevel(inner)) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      obj[part.slice(0, eq).trim().replace(/^["']|["']$/g, '')] = parseValue(part.slice(eq + 1));
    }
    return obj;
  }
  return parseScalar(s);
}

function dottedKeys(key) {
  // split a dotted key on top-level dots (respecting quotes)
  const out = [];
  let inS = false;
  let q = '';
  let cur = '';
  for (let i = 0; i < key.length; i++) {
    const c = key[i];
    if (inS) {
      if (c === q) inS = false;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      inS = true;
      q = c;
      continue;
    }
    if (c === '.') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out.map((k) => k.replace(/^["']|["']$/g, ''));
}

function ensurePath(root, keys) {
  let node = root;
  for (const k of keys) {
    if (!(k in node) || typeof node[k] !== 'object' || node[k] === null || Array.isArray(node[k])) {
      node[k] = {};
    }
    node = node[k];
  }
  return node;
}

/** Parse TOML text into a nested plain object. Best-effort; never throws. */
export function parseToml(text) {
  const root = {};
  if (!text) return root;
  const rawLines = text.split('\n');
  let cur = root;

  for (let i = 0; i < rawLines.length; i++) {
    let line = stripComment(rawLines[i]).trim();
    if (line === '') continue;

    // array of tables [[a.b]]
    let m = line.match(/^\[\[(.+)\]\]$/);
    if (m) {
      const keys = dottedKeys(m[1].trim());
      const parent = ensurePath(root, keys.slice(0, -1));
      const last = keys[keys.length - 1];
      if (!Array.isArray(parent[last])) parent[last] = [];
      const entry = {};
      parent[last].push(entry);
      cur = entry;
      continue;
    }
    // table [a.b]
    m = line.match(/^\[(.+)\]$/);
    if (m) {
      cur = ensurePath(root, dottedKeys(m[1].trim()));
      continue;
    }

    // key = value  (value may be a multi-line array/inline-table)
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let valRaw = line.slice(eq + 1).trim();

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

    // consume continuation lines for unbalanced [ ] or { }
    const needsMore = (s) => {
      let depth = 0;
      let inS = false;
      let q = '';
      for (let j = 0; j < s.length; j++) {
        const c = s[j];
        if (inS) {
          if (c === q) inS = false;
          continue;
        }
        if (c === '"' || c === "'") {
          inS = true;
          q = c;
          continue;
        }
        if (c === '[' || c === '{') depth++;
        if (c === ']' || c === '}') depth--;
      }
      return depth > 0;
    };
    while (needsMore(valRaw) && i + 1 < rawLines.length) {
      i++;
      valRaw += '\n' + stripComment(rawLines[i]).trim();
    }
    valRaw = valRaw.replace(/\n/g, ' ');

    const keys = dottedKeys(key);
    const target = keys.length > 1 ? ensurePath(cur, keys.slice(0, -1)) : cur;
    target[keys[keys.length - 1]] = parseValue(valRaw);
  }
  return root;
}
