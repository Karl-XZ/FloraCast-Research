import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeProtocol, executeResearch, summarizePower } from '../research-core.js';
import { ResearchStore } from '../research-store.js';

const input = { question: '研究该区域的春季植被变化与气候之间的关联', lat: 36, lng: 120, mode: 'demo', startYear: 2023, endYear: 2024 };
const waitFor = async (store, id) => {
  for (let n = 0; n < 200; n++) {
    const run = store.get(id);
    if (!['running', 'queued'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Run did not terminate');
};

test('missing coordinates and invalid modes must not silently become zero or synthetic data', () => {
  assert.throws(() => normalizeProtocol({ ...input, lat: null }), /纬度/);
  assert.throws(() => normalizeProtocol({ ...input, mode: 'unknown' }), /模式/);
  assert.equal(normalizeProtocol({ ...input, mode: undefined }).mode, 'live');
});

test('missing temperature is excluded and not interpreted as zero', () => {
  const result = summarizePower([{ date: '20240101', t2m: null, precip: 0 }, { date: '20240102', t2m: 10, precip: 1 }]);
  assert.equal(result.meanTemperatureC, 10);
  assert.equal(result.validTemperatureDays, 1);
});

test('synthetic execution leaves research hypothesis unresolved and records rather than asserts reproduction', async () => {
  const result = await executeResearch(input);
  assert.equal(result.reproduction.status, 'recorded');
  assert.equal(result.evidence.claims.find((claim) => claim.id === 'claim-hypothesis').status, 'unresolved');
  assert.match(result.datasets.manifests[0].license, /synthetic/);
  assert.equal(result.stages.length, 8);
});

test('snapshot reproduction matches frozen inputs and outputs and survives reload', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'floracast-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new ResearchStore(dir);
  const first = await waitFor(store, store.create(input).id);
  assert.equal(first.status, 'completed');
  const second = await waitFor(store, store.reproduce(first.id).id);
  assert.equal(second.reproductionComparison.inputsEqual, true);
  assert.equal(second.reproductionComparison.outputsEqual, true);
  const loaded = new ResearchStore(dir).get(second.id);
  assert.equal(loaded.status, 'completed');
  assert.deepEqual(loaded.events.map((event) => event.id), Array.from({ length: loaded.events.length }, (_, index) => index + 1));
});

test('queued cancellation does not produce a result', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'floracast-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new ResearchStore(dir);
  const run = store.create(input);
  store.cancel(run.id);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.get(run.id).status, 'cancelled');
  assert.equal(store.get(run.id).result, null);
});

test('running research pauses and resumes at a stage boundary', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'floracast-pause-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const result = { evidence: { audit: {} }, reproduction: { inputHash: 'a', outputHash: 'b' }, report: 'ok', stages: [] };
  const store = new ResearchStore(dir, { execute: async (_protocol, options) => {
    await options.beforeStage('one'); options.notify({ type: 'stage', stageId: 'one', status: 'running' });
    await new Promise((resolve) => setTimeout(resolve, 30)); options.notify({ type: 'stage', stageId: 'one', status: 'completed' });
    await options.beforeStage('two'); return result;
  } });
  const run = store.create(input);
  await new Promise((resolve) => setTimeout(resolve, 10));
  store.pause(run.id);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(store.get(run.id).status, 'paused');
  store.resume(run.id);
  assert.equal((await waitFor(store, run.id)).status, 'completed');
});

test('research queue enforces configured workflow concurrency', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'floracast-queue-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let active = 0, peak = 0;
  const result = { evidence: { audit: {} }, reproduction: {}, report: 'ok', stages: [] };
  const store = new ResearchStore(dir, { maxConcurrency: 1, execute: async () => {
    active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 25)); active -= 1; return result;
  } });
  const runs = [store.create(input), store.create(input), store.create(input)];
  await Promise.all(runs.map((run) => waitFor(store, run.id)));
  assert.equal(peak, 1);
});

test('standalone process reproduces frozen run and rejects modified observations', async () => {
  const result = await executeResearch(input);
  const snapshot = { id: 'standalone-test', protocol: result.protocol, result };
  // fileURLToPath preserves Windows paths containing non-ASCII characters.
  const good = spawnSync(process.execPath, [fileURLToPath(new URL('../reproduce.js', import.meta.url))], { input: JSON.stringify(snapshot), encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).outputsEqual, true);
  snapshot.result.datasets.power[0].t2m += 10;
  const bad = spawnSync(process.execPath, [fileURLToPath(new URL('../reproduce.js', import.meta.url))], { input: JSON.stringify(snapshot), encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /checksum mismatch/);
});
