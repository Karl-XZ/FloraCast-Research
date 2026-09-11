import crypto from 'node:crypto';
import { calendarDate } from './phenology.js';

const DAY = 86400000;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function validateGroundObservations(phenology, observations) {
  if (!Array.isArray(observations) || !observations.length) throw Object.assign(new Error('至少需要一条地面观测。'), { status: 400 });
  if (observations.length > 5000) throw Object.assign(new Error('单次最多验证 5000 条地面观测。'), { status: 400 });
  const clean = observations.map((row, index) => {
    const date = calendarDate(row?.date);
    if (!date) throw Object.assign(new Error(`第 ${index + 1} 条观测日期无效。`), { status: 400 });
    return {
      date, year: Number(date.slice(0, 4)), stage: String(row.stage || 'greenup').slice(0, 80),
      species: String(row.species || '').slice(0, 160), source: String(row.source || 'user-provided').slice(0, 240)
    };
  });
  const comparisons = [];
  for (const observation of clean) {
    const annual = phenology?.years?.find((item) => item.year === observation.year);
    for (const estimate of annual?.methods || []) {
      const signedErrorDays = Math.round((Date.parse(estimate.date) - Date.parse(observation.date)) / DAY * 100) / 100;
      comparisons.push({ observation, method: estimate.name, estimatedDate: estimate.date, signedErrorDays, absoluteErrorDays: Math.abs(signedErrorDays) });
    }
  }
  const methods = [...new Set(comparisons.map((item) => item.method))].map((method) => {
    const rows = comparisons.filter((item) => item.method === method);
    const errors = rows.map((item) => item.signedErrorDays);
    return { method, samples: rows.length, maeDays: +mean(errors.map(Math.abs)).toFixed(2), biasDays: +mean(errors).toFixed(2), rmseDays: +Math.sqrt(mean(errors.map((value) => value ** 2))).toFixed(2) };
  });
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(clean)).digest('hex');
  return {
    status: comparisons.length ? 'evaluated' : 'no-comparable-estimates', submitted: clean.length,
    comparablePairs: comparisons.length, observations: clean, comparisons, methods, checksum: fingerprint,
    disclosure: '用户提供的独立观测仅用于外部误差比较，不会改写原始研究结果或复现哈希。'
  };
}
