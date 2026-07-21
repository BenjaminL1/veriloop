import { exec } from 'node:child_process';
export const bada = (cmd) => exec(cmd, { shell: true });
