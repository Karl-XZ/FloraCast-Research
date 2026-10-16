import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Start a separate local process; do not call external AI or data services.
const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const dataDir = await mkdtemp(path.join(tmpdir(), 'floracast-smoke-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, PORT: String(port), RESEARCH_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe']
});
let startupOutput = '';
child.stdout.on('data', chunk => { startupOutput += chunk; });
child.stderr.on('data', chunk => { startupOutput += chunk; });
let childError;
child.on('error', error => { childError = error; });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (childError) throw childError;
    if (child.exitCode !== null) throw new Error(`Server exited before ready: ${startupOutput}`);
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).ok === true) { ready = true; break; }
    } catch { /* Retry until the local process is ready. */ }
    await pause(100);
  }
  assert.ok(ready, 'Local server did not become ready within the startup deadline.');
  console.log('PASS /api/health');
  for (const endpoint of ['/FloraCast/api/health']) {
    const response = await fetch(`${base}${endpoint}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, endpoint);
    assert.equal((await response.json()).ok, true, endpoint);
    console.log(`PASS ${endpoint}`);
  }
  for (const [endpoint, pattern] of [
    ['/', /app\.js/], ['/FloraCast/', /app\.js/],
    ['/app.js', /ForecastManager/], ['/plantid.js', /identify/i],
    ['/research.html', /research\.js/]
  ]) {
    const response = await fetch(`${base}${endpoint}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, endpoint);
    assert.match(await response.text(), pattern, endpoint);
    console.log(`PASS ${endpoint}`);
  }
  console.log('7 local service checks passed. External services and browser rendering are checked separately.');
} finally {
  if (child.exitCode === null && !childError) {
    const stopped = once(child, 'exit');
    child.kill();
    await stopped;
  }
  await rm(dataDir, { recursive: true, force: true });
}
