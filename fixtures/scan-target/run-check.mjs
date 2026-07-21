// scan-target fixture — INPUT ONLY. scan.mjs must classify this, never execute it.
import { spawnSync } from 'node:child_process';

export function runCheck(cmd) {
  // deliberate danger surface: a synthesized shell string
  return spawnSync(cmd, { shell: true, encoding: 'utf8' });
}
