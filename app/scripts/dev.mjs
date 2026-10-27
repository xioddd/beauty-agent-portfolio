import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const apiPath = fileURLToPath(new URL('server.mjs', root));
const vitePath = fileURLToPath(new URL('node_modules/vite/bin/vite.js', root));
const children = [
  spawn(process.execPath, ['--env-file=.env', apiPath], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [vitePath, '--host', '127.0.0.1'], { stdio: 'inherit', env: process.env }),
];

function stop() {
  for (const child of children) if (!child.killed) child.kill();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stop();
  process.exit(0);
});

for (const child of children) child.on('exit', code => {
  if (code && code !== 0) process.exitCode = code;
  stop();
});
