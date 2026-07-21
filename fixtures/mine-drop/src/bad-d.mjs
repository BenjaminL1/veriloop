import { exec } from 'node:child_process';
export const badd = (cmd) => exec(cmd, { shell: true });
