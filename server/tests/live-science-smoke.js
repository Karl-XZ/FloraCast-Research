// Explicit, optional network integration check. Never part of offline unit tests.
import fs from 'node:fs';
import { executeResearch } from '../research-core.js';
const result = await executeResearch({ question: '检验哈佛森林附近两年地表物候序列的覆盖与方法一致性',
  aoi: { name: 'Harvard Forest point', lat: 42.5378, lng: -72.1715, radiusKm: 1 },
  period: { startYear: 2023, endYear: 2024 }, mode: 'live' }, {
  notify: (event) => console.log(JSON.stringify({ stage: event.stageId, status: event.status }))
});
fs.mkdirSync(new URL('../../test-results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../test-results/live-science.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ manifests: result.datasets.manifests, phenology: result.summaries.phenology }));
if (!result.datasets.vegetation.some((r) => r.date.startsWith('2023')) || !result.datasets.vegetation.some((r) => r.date.startsWith('2024'))) process.exitCode = 1;
