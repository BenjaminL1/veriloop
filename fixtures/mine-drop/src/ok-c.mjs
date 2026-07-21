import { spawnSync } from 'node:child_process';
export const rc = () => spawnSync('git', ['status'], { shell: false });
