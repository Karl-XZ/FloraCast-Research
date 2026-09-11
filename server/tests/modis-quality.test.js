import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMod13Point, parseMod13Area } from '../modis-quality.js';
const bands = (value, qa) => [
  { band: '250m_16_days_NDVI', data: [value] }, { band: '250m_16_days_EVI', data: [5000] },
  { band: '250m_16_days_pixel_reliability', data: [qa] }
];
test('MOD13 scale and fill match product metadata', () => {
  assert.equal(parseMod13Point(bands(7810, 0), '2024-05-08').ndvi, 0.781);
  assert.equal(parseMod13Point(bands(-3000, 0), '2024-05-08').ndvi, null);
});
test('cloud, snow, marginal or missing QA is excluded but retains raw values', () => {
  for (const qa of [1, 2, 3, -1, null]) {
    const point = parseMod13Point(bands(7810, qa), '2024-05-08');
    assert.equal(point.ndvi, null);
    assert.equal(point.qaAccepted, false);
    assert.equal(point.raw.ndvi, 7810);
  }
});

test('area aggregation applies a circular mask and QA before averaging', () => {
  const subset = [
    { band: '1_km_16_days_NDVI', nrows: 3, ncols: 3, cellsize: 1000, data: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000] },
    { band: '1_km_16_days_EVI', nrows: 3, ncols: 3, cellsize: 1000, data: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000] },
    { band: '1_km_16_days_pixel_reliability', nrows: 3, ncols: 3, cellsize: 1000, data: [0, 0, 0, 0, 1, 0, 0, 0, 0] }
  ];
  const result = parseMod13Area(subset, '2024-05-08', 1, 1000);
  assert.equal(result.spatial.insidePixels, 5);
  assert.equal(result.spatial.goodQualityPixels, 4);
  assert.equal(result.ndvi, 0.5);
  assert.equal(result.qa.coverage, 0.8);
});
