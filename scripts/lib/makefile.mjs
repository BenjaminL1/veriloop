// Makefile target parser — a Makefile is an explicit, high-confidence developer
// command interface (catan_rl_v2 drives lint/typecheck/test through `make`).
// Extracts each target's recipe commands with line numbers, expands simple
// `$(VAR)` references defined via `VAR = x` / `VAR ?= x`, and ignores
// pattern/special targets. Best-effort; never throws.

/** Returns { targets: {name: {line, recipe: [str]}}, vars: {NAME: value} } */
export function parseMakefile(text) {
  const result = { targets: {}, vars: {} };
  if (!text) return result;
  const lines = text.split('\n');

  // First pass: variable definitions (VAR = val / VAR ?= val / VAR := val)
  for (const raw of lines) {
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|\?=|::?=|=)\s*(.*)$/);
    if (m && !raw.startsWith('\t')) {
      if (m[2] === '+=') result.vars[m[1]] = ((result.vars[m[1]] || '') + ' ' + m[3].trim()).trim();
      else result.vars[m[1]] = m[3].trim();
    }
  }

  const expand = (s) => {
    let out = s;
    // expand a couple of passes so nested $(A)->$(B) resolves
    for (let pass = 0; pass < 3; pass++) {
      out = out.replace(/\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g, (full, name) =>
        name in result.vars ? result.vars[name] : full,
      );
    }
    return out;
  };

  // Second pass: targets + their tab-indented recipe lines
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.startsWith('\t')) {
      if (current) {
        let cmd = raw.slice(1).trim();
        // strip leading recipe modifiers (@ silences, - ignores errors, + always)
        cmd = cmd.replace(/^[@\-+]+/, '').trim();
        if (cmd) current.recipe.push(expand(cmd));
      }
      continue;
    }
    // target line: `name: deps` (not a variable assignment, not a comment)
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
    current = null;
  }
  return result;
}
