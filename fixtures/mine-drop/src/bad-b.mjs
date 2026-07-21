import { exec } from 'node:child_process';
export const badb = (cmd) => exec(cmd, { shell: true });
