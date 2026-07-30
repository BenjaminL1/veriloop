#!/usr/bin/env bash
# Re-execute every command in gate-record.md and diff the OBSERVED exit code against
# the RECORDED one. Exit 0 iff all match.
#
#   bash docs/demo/replay.sh [demo-dir]        # default: ../veriloop-demo
#
# This is the honest analogue of a screen recording: instead of asking you to watch a
# video of a run, it reproduces the run and fails loudly if reality has moved. A
# recording can only be trusted; this can be checked.
#
# Exit codes are read directly from each command with no pipe in between. `$?` after
# `cmd | tail` is TAIL's status, so a crashed command would record exit=0 — which is
# exactly the class of false green this demo exists to disprove.

set -uo pipefail

DEMO="${1:-../veriloop-demo}"

if [ ! -d "$DEMO" ]; then
  echo "no demo repo at $DEMO" >&2
  echo "generate it first:  bash docs/demo/make-demo.sh $DEMO" >&2
  exit 2
fi

cd "$DEMO" || exit 2

# name|recorded exit|command...
CASES=(
  "test|1|node --test src"
  "typecheck|1|npx --yes --package=typescript tsc --noEmit"
  "lint|1|npx --yes --package=eslint@9 eslint src"
)

fail=0
skip=0
printf '%-11s %-9s %-9s %s\n' "CHECK" "RECORDED" "OBSERVED" "RESULT"

for case in "${CASES[@]}"; do
  IFS='|' read -r name recorded cmd <<< "$case"

  # network-dependent checks: report SKIP rather than a bogus mismatch
  if [ "$name" != "test" ] && ! npx --yes --package=typescript tsc --version >/dev/null 2>&1; then
    printf '%-11s %-9s %-9s %s\n' "$name" "$recorded" "-" "SKIP (no network)"
    skip=$((skip + 1))
    continue
  fi

  # shellcheck disable=SC2086
  out="$(eval "$cmd" 2>&1)"
  observed=$?

  if [ "$observed" = "$recorded" ]; then
    printf '%-11s %-9s %-9s %s\n' "$name" "$recorded" "$observed" "MATCH"
  else
    printf '%-11s %-9s %-9s %s\n' "$name" "$recorded" "$observed" "MISMATCH"
    echo "--- observed output for $name ---"
    printf '%s\n' "$out" | head -20
    fail=$((fail + 1))
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "replay OK — every reproduced exit code matches gate-record.md${skip:+ (${skip} skipped)}"
  exit 0
fi
echo "replay FAILED — $fail check(s) no longer reproduce the recorded exit code."
echo "Either the demo changed or gate-record.md is stale. Fix the record; do not fix the number."
exit 1
