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

`.env*` is never staged and never read into an artifact. This is constitution rule 7.

### 5. Your files are not overwritten

Machine-owned files regenerate on every run. **Hand-owned files are preserved untouched** —
`scripts/generate.mjs:351 handOnce` — which covers `constitution.md`, every
`*.overrides.md`, and `specs/*`. With `--force` they are backed up first
(`scripts/generate.mjs:303 backup`). Inside shared files like `.gitignore`, only the marked block
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
reading `commands.json` is the mitigation); the two documented network paths in §3; and the
fact that a red gate can be overridden by a human waiver, which is by design and is
human-only.
