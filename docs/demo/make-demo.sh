#!/usr/bin/env bash
# Materialize veriloop's demo repo: a tiny TS app with seeded defects that a gate
# catches, each on a DIFFERENT signal. Trust-pack item DA1 (docs/plans/m5-plan.md).
#
#   bash docs/demo/make-demo.sh [target-dir]        # default: ../veriloop-demo
#
# The demo repo is built OUTSIDE the veriloop tree on purpose: it is demo data, not
# veriloop source, and a repo whose `npm test` fails must never sit inside a repo
# whose entire pitch is a green gate. It gets a real `git init` and real commits, but
# NO remote and it is never pushed.
#
# Exit codes are captured with ${PIPESTATUS[0]} / no-pipe invocation, never `$?`
# after a pipeline — `cmd | tail` reports tail's status, so a crashed command would
# record exit=0. That is the failure mode this whole demo exists to disprove.

set -uo pipefail

TARGET="${1:-../veriloop-demo}"

# Refuse to build inside veriloop, however the path is spelled.
here_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
mkdir -p "$TARGET"
target_abs="$(cd "$TARGET" && pwd -P)"
case "$target_abs" in
  "$here_root"|"$here_root"/*)
    echo "REFUSING: $target_abs is inside the veriloop tree ($here_root)." >&2
    echo "The demo repo is demo data, not veriloop source. Pick a path outside." >&2
    exit 2
    ;;
esac

echo "==> building the demo repo at $target_abs"
rm -rf "$target_abs"
mkdir -p "$target_abs/src"
cd "$target_abs"

cat > package.json <<'JSON'
{
  "name": "veriloop-demo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "A deliberately broken tiny app. Each defect trips a DIFFERENT gate signal.",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "node --test src"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "eslint": "^9.0.0"
  }
}
JSON

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "target": "ES2022",
    "module": "node16",
    "allowJs": true,
    "checkJs": false
  },
  "include": ["src"]
}
JSON

# `document` is declared as a browser global on purpose. Without it, no-undef fires on
# src/render.js and the LINT check would go red — which would defeat defect 4's entire
# point. Defect 4 has to be genuinely invisible to every exit-code check, or the demo
# cannot honestly show the difference between what a command proves and what a reviewer
# has to notice. (Caught while building this: the first version DID trip lint, for the
# wrong reason.)
cat > eslint.config.js <<'JS'
export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { document: 'readonly' },
    },
    rules: { 'no-unused-vars': 'error', 'no-undef': 'error' },
  },
];
JS

# ---------------------------------------------------------------- DEFECT 1
# A failing unit test. Dependency-free and offline-unconditional: `node --test`
# is built into node >=18, so this class is capturable on any machine with no
# install step and no network. At least one defect had to be like this.
cat > src/total.js <<'JS'
export function total(items) {
  // BUG (seeded): starts at 1, so every total is off by one.
  return items.reduce((sum, n) => sum + n, 1);
}
JS

cat > src/total.test.js <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { total } from './total.js';

test('total sums an empty cart to zero', () => {
  assert.equal(total([]), 0);
});

test('total sums a cart', () => {
  assert.equal(total([2, 3]), 5);
});
JS

# ---------------------------------------------------------------- DEFECT 2
# A type error. Trips `typecheck`, not `test` — a different exit code from a
# different tool. Needs `npx tsc`, so it is install-dependent.
cat > src/price.ts <<'TS'
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// BUG (seeded): passing a string where a number is required.
export const label: string = formatPrice('1999');
TS

# ---------------------------------------------------------------- DEFECT 3
# A lint violation: an unused binding. Trips `lint` only.
cat > src/cart.js <<'JS'
export function itemCount(items) {
  // BUG (seeded): `discount` is assigned and never used -> no-unused-vars.
  const discount = 0.1;
  return items.length;
}
JS

# ---------------------------------------------------------------- DEFECT 4
# The lens-only footgun. Every exit-code check above PASSES over this file:
# it is valid JS, it is used, and no test covers it. Only a reviewing lens
# reading for danger surfaces would flag interpolating user input into HTML.
#
# NOTE: seeded as a lens-layer target. No lens has been run against it here.
cat > src/render.js <<'JS'
export function renderBio(userSuppliedBio) {
  // FOOTGUN (seeded): user input interpolated straight into innerHTML.
  const el = document.createElement('div');
  el.innerHTML = `<p>${userSuppliedBio}</p>`;
  return el;
}
JS

cat > README.md <<'MD'
# veriloop-demo

A deliberately broken tiny app, generated by `docs/demo/make-demo.sh` in the veriloop
repo. Four seeded defects, each tripping a different signal:

| # | file | defect | signal |
|---|------|--------|--------|
| 1 | `src/total.js` | off-by-one in `total()` | `test` (offline, no install) |
| 2 | `src/price.ts` | string passed as `number` | `typecheck` |
| 3 | `src/cart.js` | unused `discount` binding | `lint` |
| 4 | `src/render.js` | user input into `innerHTML` | none — lens-layer only |

Defect 4 passes every exit-code check by design. It is there to show the difference
between what a command can prove and what a reviewer has to notice.
MD

git init -q
git add -A
git -c user.name=veriloop-demo -c user.email=demo@example.invalid \
    commit -q -m "seed a tiny app with four deliberate defects"
echo "==> git initialized, 1 commit, no remote (never pushed)"

# ---------------------------------------------------------------- capture
# Each command is run WITHOUT a pipe so $? is genuinely that command's status.
echo
echo "==> running the checks and capturing REAL exit codes"
printf '%-11s %-24s %s\n' "CHECK" "COMMAND" "EXIT"

run_check () {
  local name="$1"; shift
  local out
  out="$("$@" 2>&1)"
  local code=$?
  printf '%-11s %-24s %s\n' "$name" "$*" "$code"
  printf '%s\n' "$out" > ".demo-${name}.log"
  return 0
}

run_check test node --test src

# `--package=` is explicit on purpose. Bare `npx tsc` resolves the `tsc` package,
# which is NOT typescript — newer npm refuses it for exactly that reason. That is a
# live instance of the look-alike hazard SECURITY.md documents, met while writing this
# demo. eslint is pinned to 9 because 10 requires node ^20.19/^22.13/>=24.
if npx --yes --package=typescript tsc --version >/dev/null 2>&1; then
  run_check typecheck npx --yes --package=typescript tsc --noEmit
  run_check lint npx --yes --package=eslint@9 eslint src
else
  printf '%-11s %-24s %s\n' "typecheck" "tsc --noEmit" "NOT CAPTURED (no network)"
  printf '%-11s %-24s %s\n' "lint" "eslint src" "NOT CAPTURED (no network)"
fi

echo
echo "==> per-check output is in $target_abs/.demo-*.log"
echo "==> defect 4 (src/render.js) is seeded as a lens-layer target;"
echo "    no lens has been run against it, and every check above passes over it."
