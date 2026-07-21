# scan-target fixture — notes (INPUT only)

The run-check helper historically used `shell: true` in its spawn call. This mention
is **prose in a .md doc**, NOT a spawn site — the scanner's code-pattern matchers are
scoped to code files, so this line is signal-free noise the scanner MUST ignore (it
must cite the real code hit in `run-check.mjs`, never this documentation). Same reason
a `process.env.SECRET_KEY` mention here must not be cited as a secret surface.
