# Spec: Attestation redaction hardening (fixes drive-#1 gate findings before merge)

> BINDING. Fixes the four SHOULD-FIX findings + 3 NITs from the gate run on
> `feat/attestation-auto-emission` (run `wf_9b81900a-7fe`). Owner decisions already made —
> encode them, do not relitigate: dry runs DO emit a record, locally, uncommitted, in a
> dry-run-specific directory; secret redaction is deterministic, never model-compliance.

## BASE BRANCH (binding, step 0)

This drive stacks ON the unmerged preview branch, NOT main:
create the worktree/branch FROM `feat/attestation-auto-emission` (pushed, v0.3.3), e.g.
`git -C $REPO worktree add <dir> -b feat/attestation-redaction-hardening feat/attestation-auto-emission`.
**Verify before any edit:** `grep -q attestationFrom scripts/templates/dev-loop.template.js`
in the worktree (the symbol exists ONLY on that branch; if absent you are on the wrong base
— stop and re-create the worktree).

## Deliverables

### 1. Deterministic secret redaction (security SHOULD-FIX; constitution rules 2 + 7)

In the template's redaction routine (marker-bounded region of
`scripts/templates/dev-loop.template.js`), in ADDITION to the existing absolute-path line-drop,
DROP any line of any free-text field matching ANY of (case-insensitive where marked):

- env-style secret assignment: `/\b[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*\s*[=:]/i`
- bearer tokens: `/\bbearer\s+[a-z0-9._~+\/=-]{8,}/i`
- AWS access key ids: `/\bAKIA[0-9A-Z]{16}\b/`
- private key blocks: **BLOCK drop, not line drop** — from a line matching
  `/-----BEGIN [A-Z ]*PRIVATE KEY-----/` through the matching
  `/-----END [A-Z ]*PRIVATE KEY-----/` inclusive (drop to end of the field if the END
  marker is missing). A header-only line-drop leaks the base64 body + footer.
  *(Amended 2026-07-15 with owner authority after gate run `wf_2df5505d-c2a` found the
  original line-drop letter leaked the key body — the code had implemented the spec
  faithfully; the spec was wrong.)*
- common token prefixes: `/\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/`, `/\bsk-[A-Za-z0-9]{20,}/`, `/\bxox[baprs]-/`

Whole-line drop (mirroring the path rule) — never partial masking. Keep the pattern list as a
single exported/testable array so the selftest and lint-bundle (below) use THE SAME source,
not a re-hardcoded copy (constitution rule 9).

### 2. Kill the `$REPO` re-expansion hazard (drift SHOULD-FIX)

`attestationFrom` currently substitutes the repo root with the literal `$REPO`, which a live
shell variable can re-expand during the write. Switch the sentinel to `%REPO%` (inert in
POSIX shells) everywhere the routine emits it, update the existing selftest asserts to
expect `%REPO%`, and add an assert that the written record contains NO `$REPO` literal and
no absolute path. Also harden the template's write instruction: the record must be written
via a non-interpolating method (single-quoted heredoc or file-write tool), stated explicitly.

### 3. Dry-run records (owner decision — supersedes the `!dryRun` carve-out)

Dry runs now DO emit: same redacted record, written to
`$REPO/.claude/veriloop/history/dry-runs/<ts>.json` instead of `history/<ts>.json`.
Dry-run records stay LOCAL: add `.claude/veriloop/history/dry-runs/` to the machine-owned
splice block veriloop maintains in the host repo's `.gitignore` (see the marker mechanism in
`scripts/generate.mjs` — the machine-owned block, never outside it). Real runs stay committed.
Redaction applies identically to both (defense does not depend on commit status).

### 4. Lint-bundle backstop (security NIT → real defense-in-depth)

Extend `scripts/lint-bundle.mjs` to scan committed `history/*.json` records (excluding
`dry-runs/`) with the ABS regex AND the shared secret-pattern array from Deliverable 1;
any hit fails the bundle. Then fix the now-false comment at `scripts/selftest.mjs:628` so it
truthfully describes this backstop (it currently claims a scan that doesn't exist).

### 5. Manifest + docs sync

- Regenerate the self-host bundle in the worktree (`node scripts/generate.mjs`) — this also
  restores the manifest to v0.3.3 with correct repo_sha (it was reverted to 0.3.2 by a
  reviewer's cleanup checkout; baseline SHOULD-FIX).
- Stale-doc NITs: update `docs/plans/m1-dogfood-report.md:86` (auto-emission now shipped in
  v0.3.3) and `docs/plans/roadmap-v1.md:133` (same) — one-line truth fixes, no rewrites.
- AMEND the existing 0.3.3 CHANGELOG entry (secret redaction, %REPO% sentinel, dry-run
  records, lint backstop). NO new version bump — this fix is part of the unmerged 0.3.3
  feature.

### 6. Selftest (constitution rule 3; extend the existing extract-and-execute block)

Poisoned-input asserts, one per secret class in Deliverable 1 (a synthetic tail containing
each pattern comes out with that line dropped); sentinel asserts per Deliverable 2; a
dry-run routing assert (extracted logic with dryRun=true writes under `dry-runs/`); a
lint-bundle backstop assert (a seeded record with a fake `API_KEY=x` fails the scan).
Count must GROW from the run-time baseline on this branch (131 — capture fresh, don't
hardcode). Fixtures/synthetic inputs must never supply the evidence under test.

## Non-goals (binding)

- No gate/lens/verdict changes; no history rotation policy; no Torevan/catan work.
- No new version bump; no merge (owner gate stands).
- No redaction of non-secret content beyond the listed patterns (debuggability matters).

## Acceptance

1. `npm test` green on the branch; count > baseline; every new assert binds to a decision.
2. `node scripts/lint-bundle.mjs` exit 0; a deliberately poisoned committed record makes it
   exit non-zero (proven by the selftest, not by narration).
3. Six version stamps still agree at 0.3.3; manifest says 0.3.3 with fresh repo_sha.
4. Branch pushed; base ancestry intact (`git merge-base --is-ancestor feat/attestation-auto-emission HEAD`).
