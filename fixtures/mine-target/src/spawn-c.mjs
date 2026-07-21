// mine-target fixture — INPUT ONLY. mine.mjs reads this as TEXT and re-verifies
// it in process; it is never executed (scan-only / in-process covenant).
import { spawnSync } from 'node:child_process';

export function run_c(argv) {
  // Conforming witness of the invariant this fixture holds: an argv array is
  // spawned with the shell option false — never a synthesized shell string.
  return spawnSync(argv[0], argv.slice(1), { shell: false, encoding: 'utf8' });
}
