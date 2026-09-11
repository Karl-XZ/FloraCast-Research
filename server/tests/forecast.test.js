import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const start = source.indexOf('const ForecastManager =');
const end = source.indexOf('window.ForecastManager = ForecastManager;', start);
const context = { window: {}, console, Date, Math };
vm.runInNewContext(source.slice(start, end) + '\nwindow.forecast = ForecastManager;', context);
const manager = context.window.forecast;
const rows = Array.from({ length: 10 }, (_, i) => ({ date: new Date(Date.UTC(2024, 0, 1 + i * 16)).toISOString().slice(0, 10), value: 0.1 + i * 0.02 }));
const wx = Object.fromEntries(rows.map((r) => [r.date, { tMean: 10, pSum: 3 }]));

test('forecast target and target-period weather never enter their own feature row', () => {
  const before = manager._buildDataset(rows, wx);
  const changed = rows.map((r, i) => i === 5 ? { ...r, value: 0.999 } : r);
  const weatherChanged = { ...wx, [rows[5].date]: { tMean: 900, pSum: 900 } };
  const after = manager._buildDataset(changed, weatherChanged);
  assert.deepEqual(before.x[3], after.x[3]);
  assert.notEqual(before.y[3], after.y[3]);
});

test('recursive projection preserves the composite timestep', () => {
  const result = manager._forecastNext30Days(rows, wx, { infer: (row) => row[0] });
  assert.equal(result.length, 2);
  assert.equal(Date.parse(result[0].date) - Date.parse(rows.at(-1).date), 16 * 86400000);
  assert.equal(Date.parse(result[1].date) - Date.parse(result[0].date), 16 * 86400000);
});
