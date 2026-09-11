import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzePhenology, calendarDate, fitDoubleLogistic } from '../phenology.js';
const protocol = { aoi: { lat: 40 }, period: { startYear: 2023, endYear: 2024 } };
const logistic = (day) => 0.15 + 0.6 * (1 / (1 + Math.exp(-(day - 110) / 12)) - 1 / (1 + Math.exp(-(day - 280) / 18)));
const series = [2023, 2024].flatMap((year) => Array.from({ length: 23 }, (_, i) => ({
  date: new Date(Date.UTC(year, 0, 1 + i * 16)).toISOString().slice(0, 10), ndvi: logistic(1 + i * 16), qaAccepted: true
})));

test('date parser rejects impossible calendar days and supports POWER dates', () => {
  assert.equal(calendarDate('20240229'), '2024-02-29');
  assert.equal(calendarDate('20230229'), null);
  assert.equal(calendarDate('2024-13-02'), null);
});
test('double logistic recovers noiseless seasonal signal without using ground truth', () => {
  const points = Array.from({ length: 23 }, (_, i) => ({ x: 1 + i * 16, y: logistic(1 + i * 16) }));
  assert.ok(fitDoubleLogistic(points).rmse < 0.006);
});
test('two methods execute separately for every requested year', () => {
  const result = analyzePhenology(series, protocol);
  assert.equal(result.years.length, 2);
  for (const year of result.years) {
    assert.equal(year.methods.length, 2);
    assert.ok(Math.abs(year.methods[1].dayOfYear - (110 + 12 * Math.log(0.2 / 0.8))) < 3);
    assert.equal(year.qaStatus, 'screened');
  }
  assert.equal(result.independentValidation.status, 'not-provided');
});
test('sparse, flat or southern-hemisphere series does not invent a spring date', () => {
  assert.equal(analyzePhenology(series.slice(0, 5), protocol).years[0].methods.length, 0);
  assert.equal(analyzePhenology(series.map((r) => ({ ...r, ndvi: 0.3 })), protocol).years[0].methods.length, 0);
  assert.equal(analyzePhenology(series, { ...protocol, aoi: { lat: -40 } }).years[0].methods.length, 0);
});
test('QA rejection removes contaminated dates; missing years remain explicit', () => {
  const result = analyzePhenology(series.filter((r) => r.date.startsWith('2023')).map((r) => ({ ...r, qaAccepted: false })), protocol);
  assert.ok(result.years.every((y) => y.observations === 0 && y.status === 'insufficient'));
});
