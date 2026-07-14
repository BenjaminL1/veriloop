// veriloop roster detection — proposes the AI reviewer "experts" for a repo.
//
// Algorithm (spine, deterministic; phase 3/4 LLM refines it later):
//   • ALWAYS one baseline reviewer (correctness / conventions / types).
//   • Scan for danger surfaces; each nominates ONE specialist with evidence:
//       user-facing UI            → UX / visual expert
//       auth / db / secrets / IO  → security expert
//       oracle / parity / golden  → drift sentinel
//   • Cap at 4 (baseline + up to 3). Only opposed mandates survive.
// Every proposed expert carries the evidence that nominated it, so veriloop can
// present the roster at a confirmation pause before generating.

import { join } from 'node:path';
import { readText, exists, isDir, listDir } from './util.mjs';

const SEC_DEP_SIGNALS = [
  '@supabase/', 'next-auth', 'passport', 'jsonwebtoken', 'bcrypt', 'argon2', 'stripe',
  'django', 'flask', 'fastapi', 'flask-login', 'authlib', 'pyjwt', 'oauthlib', 'boto3',
];
const SEC_PATHS = ['supabase', '.env.example', '.env.sample'];
const SEC_KEYWORDS = /\b(auth|rls|secret|token|password|payment|oauth|jwt|rbac|permission|credential|api key|service.role)\b/i;

const DRIFT_FILE_RE = /(conform|parity|golden|oracle|fixture|snapshot)/i;
const DRIFT_KEYWORDS = /\b(oracle|byte.?parity|source of truth|conformance|golden|reference implementation|must (stay|remain) .*compatible)\b/i;

// The standard title + tiers each specialist gets when IT is elected. Exported so
// the interview's `roster_add` (generate.mjs) can default an owner-confirmed add to
// the exact same shape the detector would have used — one source of truth.
export const SPECIALIST_DEFAULTS = {
  security: { title: 'Security & Data Reviewer', tiers: ['high'] },
  drift: { title: 'Drift Sentinel', tiers: ['standard', 'high'] },
  ux: { title: 'UX / Visual Reviewer', tiers: ['standard', 'high'] },
};

/** Bounded filename search — shallow, capped, skips heavy dirs. */
function findFiles(root, re, { maxDepth = 4, limit = 40 } = {}) {
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', '__pycache__', '.venv', 'venv', 'coverage']);
  const hits = [];
  const walk = (dir, depth, rel) => {
    if (depth > maxDepth || hits.length >= limit) return;
    for (const name of listDir(dir)) {
      if (skip.has(name) || name.startsWith('.git')) continue;
      const abs = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (isDir(abs)) walk(abs, depth + 1, relPath);
      else if (re.test(name)) hits.push(relPath);
      if (hits.length >= limit) return;
    }
  };
  walk(root, 0, '');
  return hits;
}

function readDocs(root) {
  return ['CLAUDE.md', 'README.md', 'AGENTS.md'].map((f) => readText(join(root, f)) || '').join('\n');
}

function collectDeps(root) {
  const deps = [];
  const pkg = readText(join(root, 'package.json'));
  if (pkg) {
    try {
      const j = JSON.parse(pkg);
      deps.push(...Object.keys({ ...(j.dependencies || {}), ...(j.devDependencies || {}) }));
    } catch { /* ignore */ }
  }
  const py = readText(join(root, 'pyproject.toml'));
  if (py) deps.push(...(py.match(/^\s*"?([A-Za-z0-9_.\-]+)/gm) || []).map((s) => s.trim().replace(/"/g, '')));
  return deps.map((d) => d.toLowerCase());
}

/**
 * @returns { experts: [{key,title,tiers,evidence:[...]}], notes: [...] }
 */
export function detectRoster(root, commandsJson) {
  const experts = [];
  const notes = [];
  const docs = readDocs(root);
  const deps = collectDeps(root);

  // 1. baseline — always
  experts.push({
    key: 'code-review',
    title: 'Baseline Reviewer',
    tiers: ['trivial', 'standard', 'high'],
    evidence: ['always included — correctness, conventions, type-safety, test integrity'],
  });

  // 2. security — require a CONCRETE surface (a real DB/auth/secret artifact or
  //    dep). A lone doc keyword is too weak: it produces jobless experts (an RL
  //    repo's checkpoint-format `migrations.py` is not a security surface). Doc
  //    keywords only reinforce a concrete signal, never nominate alone.
  const secConcrete = [];
  for (const p of SEC_PATHS) if (exists(join(root, p))) secConcrete.push(`path: ${p}`);
  const sqlFiles = findFiles(root, /\.sql$/i, { limit: 3 });
  if (sqlFiles.length) secConcrete.push(`SQL schema/migrations: ${sqlFiles.slice(0, 3).join(', ')}`);
  for (const d of ['supabase/migrations', 'alembic', 'prisma', 'db/migrate']) if (isDir(join(root, d))) secConcrete.push(`db dir: ${d}`);
  const secDeps = deps.filter((d) => SEC_DEP_SIGNALS.some((s) => d.includes(s.replace('/', ''))));
  if (secDeps.length) secConcrete.push(`deps: ${[...new Set(secDeps)].slice(0, 4).join(', ')}`);
  if (secConcrete.length) {
    const secEvidence = [...secConcrete];
    if (SEC_KEYWORDS.test(docs)) secEvidence.push('docs also mention auth/secrets/permissions');
    experts.push({ key: 'security', ...SPECIALIST_DEFAULTS.security, evidence: secEvidence });
  } else {
    notes.push('security expert NOT added — no concrete auth/db/secret surface detected (avoids a jobless expert)');
  }

  // 3. drift sentinel
  const driftEvidence = [];
  const driftFiles = findFiles(root, DRIFT_FILE_RE, { limit: 8 });
  if (driftFiles.length) driftEvidence.push(`parity/golden files: ${driftFiles.slice(0, 3).join(', ')}`);
  if (DRIFT_KEYWORDS.test(docs)) driftEvidence.push('docs describe an oracle / source-of-truth / byte-parity contract');
  if (driftEvidence.length) {
    experts.push({ key: 'drift', ...SPECIALIST_DEFAULTS.drift, evidence: driftEvidence });
  }

  // 4. UX / visual
  if (commandsJson.has_ui) {
    const ux = ['repo has a user-facing UI (framework/e2e signals in commands.json)'];
    if (commandsJson.commands.e2e) ux.push(`e2e: ${commandsJson.commands.e2e.cmd}`);
    experts.push({ key: 'ux', ...SPECIALIST_DEFAULTS.ux, evidence: ux });
  }

  // cap at 4 (baseline + 3); drop lowest-evidence specialists if over
  if (experts.length > 4) {
    const baseline = experts[0];
    const rest = experts.slice(1).sort((x, y) => y.evidence.length - x.evidence.length).slice(0, 3);
    notes.push(`capped roster to 4 experts (dropped ${experts.length - 4} lowest-evidence specialist(s))`);
    return { experts: [baseline, ...rest], notes };
  }
  return { experts, notes };
}
