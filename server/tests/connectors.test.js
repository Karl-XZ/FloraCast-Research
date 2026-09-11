import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { executeResearch, summarizePower } from '../research-core.js';

test('live connector honors both years and retains missing climate values as missing', async () => {
  const original = axios.get;
  const requested = [];
  axios.get = async (url, options) => {
    requested.push({ url, ...options.params });
    if (url.includes('api.openalex.org')) return { data: { results: [], meta: { count: 0 } } };
    if (url.includes('/daily/point')) return { data: { properties: { parameter: {
      T2M: { '20230101': -999, '20240101': 10 }, PRECTOTCORR: { '20230101': 1, '20240101': -999 }
    } } } };
    if (url.endsWith('/dates')) return { data: { dates: [
      { calendar_date: '2022-01-01', modis_date: 'A2022001' },
      { calendar_date: '2023-01-01', modis_date: 'A2023001' },
      { calendar_date: '2024-01-01', modis_date: 'A2024001' }
    ] } };
    return { data: { subset: [
      { band: '250m_16_days_NDVI', data: [5000] }, { band: '250m_16_days_EVI', data: [3000] },
      { band: '250m_16_days_pixel_reliability', data: [0] }
    ] } };
  };
  try {
    const result = await executeResearch({ question: '检查所选择的两个年份是否都被纳入研究数据', lat: 40, lng: -70, startYear: 2023, endYear: 2024, mode: 'live' });
    const powerRequest = requested.find((request) => request.url.includes('/daily/point'));
    assert.equal(powerRequest.start, '20230101');
    assert.equal(powerRequest.end, '20241231');
    assert.deepEqual(result.datasets.vegetation.map((r) => r.date), ['2023-01-01', '2024-01-01']);
    assert.equal(result.datasets.power[0].t2m, null);
    assert.equal(result.datasets.power[0].precip, 1);
    assert.equal(result.datasets.power[1].precip, null);
    assert.equal(result.summaries.phenology.years.length, 2);
  } finally { axios.get = original; }
});

test('GDD accumulation resets at a calendar-year boundary', () => {
  const summary = summarizePower([{ date: '20231231', t2m: 20, precip: 0 }, { date: '20240101', t2m: 10, precip: 0 }]);
  assert.equal(summary.gddBase5, 5);
  assert.equal(summary.gddYear, '2024');
});
