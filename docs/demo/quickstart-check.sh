#!/usr/bin/env bash
# Time veriloop's DETERMINISTIC spine on a fresh clone, against a target repo.
# Records ⟨quickstart-clone-result⟩ for docs/plans/m5-plan.md exit criterion 4.
#
#   bash docs/demo/quickstart-check.sh <target-repo> [workdir]
#
# WHAT THIS PROVES, AND WHAT IT DOES NOT.
#
# It proves: from a clean clone of veriloop, phases 1/2/6/7/8 (detect -> verify ->
# generate -> wire gate -> lint) run end to end against a real repo and produce a
# wired dev-loop workflow, and veriloop's own gate is green in that clone.
#
# It does NOT prove the README's quickstart. The README's first instruction is
# `/veriloop`, which drives LLM phases 3-5 (deep scan, constitution mining,
# interview). Those are NOT executed here. So the five-minute claim is measured for
# the scripted half and unproven end to end. Do not report this as "proven".
#
# Exit codes are read with no pipe in between; `$?` after a pipeline is the last
# command's status.

set -uo pipefail

TARGET="${1:-}"
WORK="${2:-/tmp/vl-quickstart}"

if [ -z "$TARGET" ] || [ ! -d "$TARGET" ]; then
  echo "usage: bash docs/demo/quickstart-check.sh <target-repo> [workdir]" >&2
  echo "  <target-repo> should be a repo you did NOT author, to avoid a rigged run." >&2
  exit 2
fi

veriloop_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
target_abs="$(cd "$TARGET" && pwd -P)"
sha="$(git -C "$veriloop_root" rev-parse --short HEAD)"

echo "veriloop      : $veriloop_root @ $sha"
echo "target repo   : $target_abs"
echo "workdir       : $WORK"
echo

rm -rf "$WORK"
mkdir -p "$WORK"

start=$(date +%s)

# --- clean clone of veriloop ------------------------------------------------
echo "==> [1/6] clean clone"
git clone -q "$veriloop_root" "$WORK/veriloop" || { echo "clone FAILED"; exit 1; }
cd "$WORK/veriloop"
echo "    cloned $(git rev-parse --short HEAD)"

# --- veriloop's own gate, in the clone -------------------------------------
echo "==> [2/6] veriloop's own gate in the clone"
npm run lint --silent >/dev/null 2>&1; lint_code=$?
npm test --silent >/dev/null 2>&1; test_code=$?
echo "    npm run lint -> $lint_code    npm test -> $test_code"

# --- copy the target so we never mutate the original -----------------------
# The basename is PRESERVED: veriloop derives the emitted workflow's filename from
# the repo directory name, so copying to a dir called "target" would silently rename
# the artifact and make the m5:290 observable unrecognizable.
echo "==> [3/6] copy the target repo (never mutate the original)"
target_name="$(basename "$target_abs")"
sandbox="$WORK/$target_name"
# node_modules and .git are excluded for speed; neither is a detection input
# (detection reads package.json / Makefile / pyproject / CI files).
rsync -a --exclude node_modules --exclude .git --exclude .claude \
      "$target_abs"/ "$sandbox"/ 2>/dev/null \
  || { mkdir -p "$sandbox" && cp -R "$target_abs"/. "$sandbox"/ && rm -rf "$sandbox/.git" "$sandbox/node_modules" "$sandbox/.claude"; }
echo "    $sandbox ($target_name)"

# --- phase 1: detect --------------------------------------------------------
echo "==> [4/6] detect"
node scripts/detect.mjs --repo "$sandbox" --out "$WORK/commands.json" >/dev/null 2>&1
detect_code=$?
echo "    detect -> $detect_code"

# --- phase 2: verify (safe tier only; nothing from a foreign repo is auto-run
#     beyond its safe-list, and we deliberately do NOT --include anything) ----
echo "==> [5/6] verify (safe tier only — no --include on a foreign repo)"
node scripts/verify.mjs --repo "$sandbox" --commands "$WORK/commands.json" >/dev/null 2>&1
verify_code=$?
echo "    verify -> $verify_code"

# --- phases 6/7/8: generate + lint the bundle ------------------------------
echo "==> [6/6] generate + lint-bundle"
node scripts/generate.mjs --repo "$sandbox" --commands "$WORK/commands.json" >/dev/null 2>&1
gen_code=$?
node scripts/lint-bundle.mjs --bundle "$sandbox" >/dev/null 2>&1
lintb_code=$?
echo "    generate -> $gen_code    lint-bundle -> $lintb_code"

end=$(date +%s)
elapsed=$((end - start))

# --- the observable m5:290 actually names ----------------------------------
wf=$(ls "$sandbox/.claude/workflows/"*-dev-loop.js 2>/dev/null | head -1)

echo
echo "======================================================================"
echo "  veriloop SHA          : $sha"
echo "  target                : $target_name"
echo "  wall clock            : ${elapsed}s"
echo "  clone lint / test     : $lint_code / $test_code"
echo "  detect / verify       : $detect_code / $verify_code"
echo "  generate / lint-bundle: $gen_code / $lintb_code"
if [ -n "$wf" ]; then
  echo "  emitted workflow      : ${wf#$sandbox/}  ($(wc -l < "$wf" | tr -d ' ') lines)"
else
  echo "  emitted workflow      : MISSING"
fi
echo "======================================================================"

if [ -n "$wf" ] && [ "$lint_code" -eq 0 ] && [ "$test_code" -eq 0 ] \
   && [ "$detect_code" -eq 0 ] && [ "$gen_code" -eq 0 ] && [ "$lintb_code" -eq 0 ]; then
  echo "RESULT: PASS (deterministic spine, ${elapsed}s) · NOT VERIFIED (LLM phases 3-5)"
  exit 0
fi
ngate=$(python3 -c "
import json,sys
try:
    c=json.load(open('$WORK/commands.json'))
    print(len([k for k,v in c['commands'].items() if isinstance(v,dict) and k in ('typecheck','lint','format','test')]))
except Exception: print(0)
")
if [ "${ngate:-0}" -eq 0 ]; then
  echo "RESULT: NO COMMAND SURFACE — the target declares no typecheck/lint/format/test command,"
  echo "        so the gate is empty and lint-bundle fails CLOSED (an unwired gate cannot pass)."
  echo "        That is correct behavior, not a spine failure. Pick a target with a real"
  echo "        command surface to exercise the success path."
  exit 3
fi
echo "RESULT: FAIL — see the non-zero code above"
exit 1
