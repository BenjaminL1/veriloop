import { spawnSync } from 'node:child_process';
export const rd = () => spawnSync('git', ['status'], { shell: false });
