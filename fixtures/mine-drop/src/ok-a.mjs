import { spawnSync } from 'node:child_process';
export const ra = () => spawnSync('git', ['status'], { shell: false });
