# Security

veriloop is a code generator that **reads other people's repositories, runs commands from
them, and writes files into them.** That is an unusual amount of trust for a dev tool, so
this document states exactly what it does, what it refuses to do, and where the real
exposure is. Claims here cite the enforcing line; if a citation does not resolve, that is a
bug — please report it.

Every claim below was checked against the tree at v0.5.0.

## Threat model

The three boundaries that matter:

1. **CI text is untrusted input.** veriloop parses `.github/workflows/*.yml` from the target
   repo and treats CI `run:` lines as ground truth for what that repo's real commands are.
   That text was written by whoever can open a PR against the repo.
2. **veriloop executes some of what it finds.** Phase 2 (`scripts/verify.mjs`) smoke-runs
   detected commands to confirm they work. Anything it runs is a command from the repo.
3. **veriloop writes into your repo.** It emits a bundle under `.claude/`, and it maintains
   one marked block inside `.gitignore` / `.prettierignore`.

### 1. Adopting a command from CI

A command containing **command substitution, backticks, or environment expansion is never
adopted** — `isCleanInvocation`, `scripts/lib/detectors.mjs:627`:

```js
if (/[$`]/.test(c)) return false;   // command substitution / env expansion / backticks
```

`fixtures/hostile-ci/` exists to hold deliberately malformed CI text, and **nothing in it is
ever executed** — a scan-only covenant asserted by the self-test
(`scripts/selftest.mjs:6`, `scripts/selftest.mjs:66`). This is constitution rules 4 and 5.

**Known limitation, stated plainly.** The category matcher that decides *which* slot a CI
command fills uses word-boundary tool-name patterns, and `isCleanInvocation` accepts any
`npx <package>` form. A CI line invoking a look-alike package name (for example an
`eslint`-adjacent typosquat) can therefore be adopted as that repo's `lint` command. veriloop
would then run it during Phase 2 for a `safe`-tier category. **Read the generated
`.claude/veriloop/commands.json` before trusting a bundle generated against a repo whose CI
you do not control.** Every command carries a `source` citation naming the file and line it
came from, precisely so this is auditable.

### 2. What veriloop will and will not run

Safety tiers, enforced in `scripts/verify.mjs:54`:

| tier | behavior |
|---|---|
| `safe` | auto-run during verify (typecheck, lint) |
| `ask` | skipped unless explicitly included (`--include test`) |
| `never` | **never** auto-run — e2e, deploy, integration, bench (real side effects) |
| `mutates` | refused — a formatter without `--check` would rewrite your tree |

```js
if (c.mutates) return { run: false, reason: 'mutates working tree (formatter without --check)' };
if (c.safety === 'never') return { run: false, reason: `safety=never (real side effects) — never auto-run` };
```

Commands run with `CI=1` for determinism. This is constitution rule 6.

**veriloop never suggests `--dangerously-skip-permissions`**, and no emitted artifact
contains it.

**New in 0.5.0: the bundle registers a `SessionStart` hook, which is an execution surface.**
Through 0.4.x nothing veriloop emitted ran on its own. Now `.claude/settings.json` wires one
command that Claude Code runs at session start, so it is stated here rather than left to be
discovered:

- **What runs.** `node "${CLAUDE_PROJECT_DIR}/.claude/veriloop/session-start.mjs"` — one
  repo-local, dependency-free script of about twenty lines. Read it; that is the whole
  program. It reads exactly one file (`.claude/veriloop/session-routing.md`) and writes its
  contents to stdout inside the documented `SessionStart` envelope. It makes **no network
  call**, spawns no subprocess, writes no file, and reads no environment variable other than
  `CLAUDE_PROJECT_DIR`. With the payload absent it prints nothing and exits 0.
- **When it runs.** On `startup` and `clear` only — the two `SessionStart` sources that begin
  a session with no task in flight. `resume` and `compact` are deliberately **not** wired:
  both fire in the middle of live work (`claude --continue`/`--resume`, and an
  auto-compaction), and re-injecting "route FIRST, then work" into a session that is already
  executing `/dev-loop` is an instruction to re-enter the command it is running.
- **What it does to the session.** It injects prose that **biases** the model toward
  `/advise`, `/dev-plan` and `/dev-loop`. It is a prompt, not a control: it cannot compel a
  route, and the commands are invocable by hand with or without it. The payload opens with a
  `<SUBAGENT-STOP>` guard so subagents — council seats, review lenses, `/dev-loop`
  implementers — do not inherit the routing, and an `<ALREADY-ROUTED>` clause so a main
  session already inside a veriloop command continues the task in flight instead of
  re-entering it.
- **veriloop never rewrites your `settings.json` — except under `--force`.** Preserve-or-write:
  absent → written; present → left byte-for-byte alone, and a complete settings.json carrying
  nothing but the hook entry is printed to stderr for you to **merge** the `SessionStart` entry
  out of (it is a whole document, not a fragment: if your file already has a top-level `hooks`
  key, copy the array into it rather than pasting a second `hooks` key). There is no JSON-aware
  merge and none is planned; a corrupted `settings.json` breaks your whole Claude Code config,
  not just veriloop. **The residual, stated rather than papered over:** `settings.json` is
  hand-owned, and `--force` overwrites every hand-owned file (`scripts/generate.mjs:351
  handOnce`) — so `generate --force` replaces yours wholesale with the 15-line hooks-only file,
  backing the original up to `.claude/veriloop/.backups/` first. Nothing narrows `--force` to
  spare it. A settings.json that is **not byte-identical to the file veriloop emits** is
  excluded from `lint-bundle`'s content scans — including the merged one you get by following
  the instruction above, which is the point: from the moment you merge, the file is yours, and
  it may legitimately contain absolute paths (`statusLine.command`, `env`,
  `permissions.additionalDirectories`) or secrets that the linter would otherwise fail your
  gate over and print 80 characters of into the log. The scan tests bytes, not "does it wire
  veriloop's hook" — that test flips true the moment you merge, which is exactly backwards.
- **Turning it off.** Delete the `SessionStart` entry from `.claude/settings.json`. That
  removes routing for all three commands at once — there is no partial disable. Deleting
  `.claude/settings.json` outright works too and is supported (`lint` warns, it does not
  fail). Deleting `session-routing.md` is **not** a disable: it is machine-owned, so the next
  `/veriloop` run rewrites it and routing resumes.
- **The boundary this creates for people who clone YOUR repo.** veriloop bundles are
  committed, `.claude/settings.json` included. From 0.5.0 on, cloning a repo that ships a
  veriloop bundle and opening Claude Code executes that repo's `.claude/veriloop/session-start.mjs`
  and injects that repo's `.claude/veriloop/session-routing.md` into the top of the session
  under `<EXTREMELY-IMPORTANT>` framing. Both are plain repo text that any PR author can edit,
  and the script reads whatever is at that path **at run time** — the renderer is fully static,
  so nothing untrusted reaches it when the bundle is generated. **`lint-bundle` check 8 does
  re-check the payload afterwards:** `session-routing.md` is machine-owned and
  `renderSessionRouting()` takes no arguments, so its text is canonical, and any difference —
  an appended block included — FAILs the gate at exit 1 rather than being vouched for by a
  green "routing hook wired" line. That is a byte comparison against the version of veriloop
  doing the linting, so it catches tampering and stale bundles alike; it is **not** a
  signature, and it only helps someone who actually runs the gate. This is the same warning
  §1 already carries for `commands.json`, pointed at a higher-privilege sink: **read both
  files before trusting a bundle from a repo whose contributors you do not control.** They are
  two short plain-text files, and they are in the diff of the PR that changed them.
- **Known limit, stated as one:** if another skill pack injects its own `SessionStart`
  block, both are injected at full strength and nothing arbitrates a disagreement between
  them.

### 3. Network, exfiltration, telemetry

There is **no telemetry, no analytics, and no phone-home** anywhere in the repo. veriloop
does not know you installed it. That statement is still exactly true — but as of **0.5.0
it is no longer the whole picture, and the part it leaves out is yours, not ours: your
machine now makes outbound requests during setup.** Read the third path below.

_(Through 0.4.x this section opened by claiming the deterministic scripts make no network
calls at all, proved by a `fetch(`-count across `scripts/`. That count is still zero. The
sentence is deleted anyway, because veriloop's **setup** now performs network I/O through a
subagent it spawns, and a claim that survives only on where the bytes live is the kind of
technically-true framing this project's claims discipline exists to prevent.)_

Subprocess use in the scripts is limited to three things:

- `node --check` on an emitted file, to syntax-check it (`scripts/lint-bundle.mjs:81`)
- `git rev-parse HEAD`, to stamp the manifest (`scripts/generate.mjs:56 repoSha`)
- your own detected commands, under the safety tiers above (`scripts/verify.mjs:64`)

**Three deliberate network paths exist, and you should know about all three:**

1. **`/advise` is granted `WebSearch` and `WebFetch`** (`.claude/commands/advise.md`
   frontmatter). This is intentional — it lets the command verify a claim against a primary
   source instead of guessing. It is read-only and cannot edit files. **As of 0.5.0 this
   path is wider than it was, in two ways you should know about:**
   - Before it chooses what to fetch, `/advise` now reads the reference library
     (`.claude/veriloop/domain/references.json`), whose `url`, `title` and `rationale` are
     **third-party data**. That is the same untrusted-prose-steers-a-URL-choice chain
     path 3 documents for SETUP time, now also firing at CONSULT time — and with **no host
     allowlist**, because `hostAllowed` (`scripts/lib/domain.mjs:485`) is a generate-time
     check that never runs inside `/advise`. The mitigations that do apply are narrower and
     stated as such: the command labels those three fields as data and never as
     instructions, and it holds no `Write`, no `Edit` and no unscoped `Bash`, so a fetched
     response cannot reach disk or run.
   - It can **emit** a paste-ready library entry for a source found mid-consult. It cannot
     write one — staging is by emission, and the owner is the one who pastes it into
     `domain.json`. That is deliberate (a human is in the loop), but it does mean a consult
     can propose content that later becomes stored library data.
2. **The cross-model second opinion sends your diff to another CLI.** When
   `cross_model` is enabled (default) **and** a change is triaged `high` tier, the loop
   invokes the OpenAI Codex CLI as an independent reviewer and passes it the worktree diff
   (`.claude/workflows/<repo>-dev-loop.js`, `runXModel`). If `codex` is not installed the
   step reports `skipped` and does not fail the gate. **If you do not want your diffs
   leaving the machine, set `cross_model: false` in `.claude/veriloop/interview.json` and
   regenerate.**
3. **The domain reference library fetches sources at SETUP time, and its queries are
   derived from your private repo.** This one is materially different from the other two,
   so read it carefully. It fires during installation (`SKILL.md` Phase 7.5), not during a
   consult, and it is not opt-in per use — building the bundle is what triggers it. The
   sources it checks are chosen by a model that has just read your repo's code, README and
   docs, so **what leaves your machine is influenced by the contents of a private
   codebase.** Constraints, all structural rather than promissory:
   - **Host allowlist.** Only `arxiv.org`, `api.semanticscholar.org`, `api.github.com` and
     `doi.org` can yield a verified entry. The list is a literal in
     `scripts/lib/domain.mjs`, and a URL on any other host is stored `UNVERIFIED` no matter
     what the audit claims about it.
   - **Fetch and write are in different contexts.** Only a spawned subagent holds
     `WebFetch`; it returns `{url, status, title}`. The parent that holds `Write` never
     fetches. This is the mitigation for the injection chain in §5 — untrusted repo prose
     steering a URL choice whose response then reaches disk.
   - **Offline is not a failure.** With no network, a valid `references.json` is still
     written with `reachable: false` and every entry `UNVERIFIED`, the install does not
     block, and the emitted persona says the library could not be verified instead of
     citing anything as checked.
   - **To avoid it: tell the installing agent to skip Phase 7.5.** Be precise here, because
     the obvious guess is backwards. `generate.mjs` never fetches — there is no `fetch()`
     anywhere in `scripts/`. The fetch is **Phase 7.5 of the skill**, and `SKILL.md` gates
     it on the *absence* of `.claude/veriloop/domain.json`: it runs on a first install
     (when that file cannot exist yet) and when you ask for `/veriloop --refresh`, and it
     is skipped on any re-run where the file is already present. **Deleting `domain.json`
     therefore re-arms the fetch rather than disabling it.** There is no switch today —
     `parseArgs` has no suppress flag and the interview has no domain toggle — so the
     opt-out is an instruction to the agent, which is prose and can be ignored; this
     document does not claim otherwise. What *is* structural: once `domain.json` exists, a
     bare `node generate.mjs` re-emits `domain/` from it byte-identically and reaches no
     network.

   **Known weaknesses, stated as weaknesses.** Three, and none of them is a defense:

   - Each stored source carries a free-text `rationale`. It is capped at 200 characters,
     stripped of newlines, scanned for secret-shaped content, and labelled third-party data
     in the emitted persona — and that is **not** a sanitizer. A hostile string that
     survives the cap is stored and read by every later consult — and as of 0.5.0 that
     later consult holds `WebSearch` and `WebFetch` with no host allowlist of its own
     (path 1 above), so the read is one link in a chain rather than the end of it. Treat
     the field as untrusted input, because it is.
   - Verification is **existence-level, not claim-level**: a `VERIFIED` entry resolved over
     the network; it is not evidence that the source says what the rationale says.
   - The status recomputation is narrower than "the entry's claim is never trusted" sounds.
     The claimed `status` is discarded and recomputed as `host_allowed && http_status ===
     200` — but `http_status` and `attempted_at` are **reported by the verification
     subagent**, and since nothing in `scripts/` fetches, no deterministic component can
     re-check them. An entry on an allowlisted host reporting 200 is verified on that
     report. `references.json` carries an `attempted_at_note` saying exactly this, so the
     stamp cannot be mistaken for a script-recorded instant.

None of the three is on by accident, but none of them is a "no network" guarantee, so this
document does not make one. veriloop still learns nothing about you — but **your** egress
posture changed in 0.5.0, and that is a fact about your machine, not about ours.

### 4. Emitted artifacts

`scripts/lint-bundle.mjs` fails the build on:

- absolute paths in any emitted file (`ABS`, `scripts/lint-bundle.mjs:94`) — bundles must be
  portable, resolving the repo root at run time via `$CLAUDE_PROJECT_DIR` with a
  `git rev-parse --show-toplevel` fallback
- harness-forbidden APIs in an emitted workflow (`FORBIDDEN`,
  `scripts/lint-bundle.mjs:124`)
- secret-shaped lines in a committed attestation record, or in an emitted
  `.claude/veriloop/domain/` artifact (`SECRET_PATTERNS`) — the domain bundle quotes
  dependency version strings and third-party source metadata, both of which carry
  credentials in the wild; they are scrubbed at the source in `scripts/lib/domain.mjs`
  and this is the backstop
- a gate that disagrees with the manifest (`scripts/lint-bundle.mjs:177`)
- a `session-routing.md` that is not byte-identical to what `renderSessionRouting()` emits —
  it is machine-owned and its entire text is injected into every session verbatim, so a hand
  edit there is an injection into every session; a routing payload missing its
  `<SUBAGENT-STOP>` guard, its `<ALREADY-ROUTED>` clause, or one of the three routes; a
  payload routing the session to a command veriloop does not emit; or a missing hook script.
  **These payload checks run whether or not the hook is wired**, because the payload is
  emitted either way and goes live the moment you merge the entry (or wire it in
  `settings.local.json`, which `lint-bundle` never sees). Whether the hook is *wired* is a
  separate, softer verdict: everything an adopter is entitled to do — keeping their own
  unmerged settings.json, wiring their own `SessionStart` hook instead, or deleting the file
  veriloop added — WARNs, exit 0. "veriloop's own" hook is decided by the exact script path
  veriloop writes, so a settings.json wiring *your* hook is never mistaken for it. See §2.

`.env*` is never staged and never read into an artifact. This is constitution rule 7.

### 5. Your files are not overwritten

Machine-owned files regenerate on every run. **Hand-owned files are preserved untouched** —
`scripts/generate.mjs:351 handOnce` — which covers `constitution.md`, every
`*.overrides.md`, `specs/*`, and (new in 0.5.0) `.claude/settings.json`. With `--force` they are
overwritten, backed up first (`scripts/generate.mjs:303 backup`) — including `settings.json`,
which is why §2's preserve-or-write guarantee is stated as holding absent `--force`. Inside shared files like `.gitignore`, only the marked block
is rewritten; your lines outside it are preserved byte for byte.

Note the consequence: because hand-owned files are *preserved* rather than merged, a
constitution you have edited will not pick up later generator improvements. That is
deliberate — your edits win — but it means there is no merge.

## Pinning a release

Releases are tagged **`veriloop-vX.Y.Z`**. The version in `.claude-plugin/plugin.json` is
canonical; `package.json`, both `.claude-plugin/marketplace.json` fields, the
`VERILOOP_VERSION` constant in `scripts/generate.mjs`, and the top `CHANGELOG.md` heading
are kept in lockstep and their agreement is machine-enforced by the self-test.

For a reproducible install, pin by tag or by commit SHA rather than tracking a branch:

```bash
npx skills add BenjaminL1/veriloop#veriloop-v0.5.0
```

Tagging currently lags the version stamps — see the CHANGELOG for the authoritative version.

### Refreshing veriloop's own CI action pins

`.github/workflows/ci.yml` pins its GitHub Actions by full commit SHA, not by moving tag, so
a compromised or repointed tag cannot silently change what runs. Pins are refreshed by hand:

```bash
git ls-remote https://github.com/actions/checkout   refs/tags/v4
git ls-remote https://github.com/actions/setup-node refs/tags/v4
```

There is deliberately no Dependabot configuration: a stale pin fails *safe* (it keeps
running exactly the code that was reviewed), so an automated write-capable actor is not
worth adding for this.

## Reporting a vulnerability

Please report privately rather than opening a public issue:

- **Email:** bbl35@cornell.edu
- Or use GitHub's private vulnerability reporting on
  <https://github.com/BenjaminL1/veriloop>

Include the version (or commit SHA), what you ran, and what happened. A reproduction against
a fixture is ideal but not required. I will acknowledge as soon as I can; this is a
single-maintainer project, so please do not expect a same-day response.

**In scope:** command adoption or execution that escapes the safety tiers; anything that
makes veriloop write outside the target repo or clobber a hand-owned file; secrets reaching
an emitted artifact or an attestation record; a path that makes the gate report a pass it did
not earn.

**Out of scope:** the documented `npx` look-alike limitation above (it is disclosed, and
reading `commands.json` is the mitigation); the three documented network paths in §3; and the
fact that a red gate can be overridden by a human waiver, which is by design and is
human-only.
