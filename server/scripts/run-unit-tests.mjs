import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const server = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.js')).sort().map(name => `tests/${name}`);
if (!files.length) throw new Error('No unit tests found.');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: server, stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
