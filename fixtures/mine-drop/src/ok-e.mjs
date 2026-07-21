import { spawnSync } from 'node:child_process';
export const re = () => spawnSync('git', ['status'], { shell: false });
