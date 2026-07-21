import { exec } from 'node:child_process';
export const badc = (cmd) => exec(cmd, { shell: true });
