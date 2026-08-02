#!/usr/bin/env node
// veriloop SessionStart hook — prints the documented SessionStart envelope so Claude Code
// injects the routing payload as additional context. The payload itself is plain markdown
// at .claude/veriloop/session-routing.md — read it and diff it; this script only carries it. That file is
// MACHINE-OWNED: it is rewritten on every re-run, so hand edits to it do not survive.
//
// FAIL-OPEN by design: no routing doc → print nothing and exit 0. A hook that errors on
// every session start is worse than an inert one.
//
// Disable by deleting the SessionStart entry from .claude/settings.json (that takes
// BOTH routes with it — there is no partial disable).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const doc = join(root, '.claude/veriloop/session-routing.md');
if (!existsSync(doc)) process.exit(0);
const additionalContext = readFileSync(doc, 'utf8');
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }));
