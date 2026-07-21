import { spawnSync } from 'node:child_process';
export const rb = () => spawnSync('git', ['status'], { shell: false });
