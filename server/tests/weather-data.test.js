import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import axios from 'axios';
import { getHistoricalWeather } from '../weather-data.js';

const options = { lat: 1.23, lng: 4.56, startYear: 1901, endYear: 1902 };
const cache = new URL('../../.weather-cache/nasa_power_1.23_4.56_1901_1902.json', import.meta.url);

test('live weather outage rejects instead of producing or caching synthetic observations', async (t) => {
  const original = axios.get;
  const previous = fs.existsSync(cache) ? fs.readFileSync(cache) : null;
  axios.get = async () => { throw new Error('fixture network outage'); };
  t.after(() => {
    axios.get = original;
    if (previous) fs.writeFileSync(cache, previous);
    else fs.rmSync(cache, { force: true });
  });
  // Legacy caches have no provenance and may contain earlier synthetic fallback.
  fs.writeFileSync(cache, JSON.stringify(Array.from({ length: 501 }, () => ({ t2m: 999 }))));
  const before = fs.readFileSync(cache, 'utf8');
  await assert.rejects(getHistoricalWeather(options), /NASA POWER daily data unavailable: fixture network outage/);
  assert.equal(fs.readFileSync(cache, 'utf8'), before);
});

test('missing rainfall stays missing and a new cache records the observed data source', async (t) => {
  const original = axios.get;
  const previous = fs.existsSync(cache) ? fs.readFileSync(cache) : null;
  axios.get = async () => ({ data: { properties: { parameter: {
    T2M: { '19010101': 10 }, T2M_MAX: { '19010101': 15 }, T2M_MIN: { '19010101': 5 },
    PRECTOTCORR: { '19010101': -999 }, RH2M: { '19010101': 60 },
    WS10M: { '19010101': 2 }, ALLSKY_SFC_SW_DWN: { '19010101': 15 }
  } } } });
  t.after(() => {
    axios.get = original;
    if (previous) fs.writeFileSync(cache, previous);
    else fs.rmSync(cache, { force: true });
  });
  const rows = await getHistoricalWeather({ ...options, forceLive: true });
  assert.equal(rows[0].prectotcorr, null);
  const saved = JSON.parse(fs.readFileSync(cache, 'utf8'));
  assert.equal(saved.source, 'NASA POWER');
  assert.equal(saved.schemaVersion, 2);
  assert.deepEqual(saved.rows, rows);
  axios.get = async () => { throw new Error('cache should be used'); };
  assert.deepEqual(await getHistoricalWeather(options), rows);
});
