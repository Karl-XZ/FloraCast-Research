// Deterministic methods shared by the service and exported reproduction process.
// Satellite land-surface phenology is not an individual-plant flowering observation.
const DAY = 86400000;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function calendarDate(value) {
  const raw = String(value || '');
  let match = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (date.getUTCFullYear() !== +match[1] || date.getUTCMonth() !== +match[2] - 1 || date.getUTCDate() !== +match[3]) return null;
  return date.toISOString().slice(0, 10);
}

const doy = (iso) => Math.round((Date.parse(iso) - Date.UTC(+iso.slice(0, 4), 0, 1)) / DAY) + 1;
const isoDay = (year, day) => new Date(Date.UTC(year, 0, Math.round(day))).toISOString().slice(0, 10);
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, x))));
function curve(t, p) {
  const [base, amplitude, spring, springRate, autumn, autumnRate] = p;
  return base + amplitude * (sigmoid((t - spring) / springRate) - sigmoid((t - autumn) / autumnRate));
}

export function fitDoubleLogistic(points) {
  if (points.length < 12) return null;
  const min = Math.min(...points.map((p) => p.y)), max = Math.max(...points.map((p) => p.y));
  const loss = (p) => mean(points.map(({ x, y }) => (y - curve(x, p)) ** 2));
  const bounds = [[-0.2, 0.9], [0.03, 1.1], [20, 200], [2, 60], [190, 360], [2, 60]];
  let best = null;
  for (const start of [75, 115, 155]) {
    let params = [min, max - min, start, 15, 285, 20];
    let score = loss(params);
    let steps = [0.05, 0.08, 25, 8, 25, 8];
    for (let round = 0; round < 100; round++) {
      let changed = false;
      for (let j = 0; j < params.length; j++) {
        for (const direction of [-1, 1]) {
          const candidate = [...params];
          candidate[j] = Math.min(bounds[j][1], Math.max(bounds[j][0], candidate[j] + direction * steps[j]));
          if (candidate[4] - candidate[2] < 60) continue;
          const error = loss(candidate);
          if (error < score) { params = candidate; score = error; changed = true; }
        }
      }
      if (!changed) steps = steps.map((step) => step * 0.5);
      if (Math.max(...steps) < 0.001) break;
    }
    if (!best || score < best.mse) best = { parameters: params, mse: score };
  }
  return { ...best, rmse: Math.sqrt(best.mse), predict: (day) => curve(day, best.parameters) };
}

function thresholdCrossing(points, fraction = 0.2) {
  const low = Math.min(...points.map((p) => p.y));
  const high = Math.max(...points.map((p) => p.y));
  const threshold = low + fraction * (high - low);
  const peak = points.findIndex((p) => p.y === high);
  for (let i = 1; i <= peak; i++) {
    const a = points[i - 1], b = points[i];
    if (a.y < threshold && b.y >= threshold && b.x - a.x <= 48) {
      return { day: a.x + (threshold - a.y) / (b.y - a.y) * (b.x - a.x), bracket: [a.x, b.x], threshold };
    }
  }
  return null;
}

export function analyzePhenology(series, protocol) {
  const years = [];
  for (let year = protocol.period.startYear; year <= protocol.period.endYear; year++) {
    const rows = series.map((row) => ({ ...row, iso: calendarDate(row.date) }))
      .filter((row) => row.iso?.startsWith(String(year)) && finite(row.ndvi) && row.ndvi >= -0.2 && row.ndvi <= 1 && row.qaAccepted !== false)
      .sort((a, b) => a.iso.localeCompare(b.iso));
    const unique = [...new Map(rows.map((row) => [row.iso, row])).values()];
    const points = unique.map((row) => ({ x: doy(row.iso), y: row.ndvi }));
    const reasons = [];
    if (protocol.aoi.lat < 0) reasons.push('当前方法按北半球历年生长季定义；南半球需要跨年季节协议。');
    if (points.length < 16) reasons.push('全年有效合成观测少于 16 个。');
    if (points.length && (points[0].x > 48 || points.at(-1).x < 320)) reasons.push('缺少冬季或年末观测，无法估计完整季节幅度。');
    if (points.some((p, i) => i > 0 && p.x - points[i - 1].x > 48)) reasons.push('有效序列存在超过 48 天的缺口。');
    const amplitude = points.length ? Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)) : null;
    if (amplitude !== null && amplitude < 0.1) reasons.push('植被季节幅度低于 0.1，不支持稳定绿起估计。');
    const qaStatus = unique.length && unique.every((row) => row.qaAccepted === true) ? 'screened' : 'unverified';
    const record = { year, observations: points.length, amplitude, qaStatus, status: reasons.length ? 'insufficient' : 'estimated', reasons, methods: [] };
    if (!reasons.length) {
      const smoothed = points.map((p, i) => ({ ...p, y: mean(points.slice(Math.max(0, i - 1), i + 2).map((v) => v.y)) }));
      const threshold = thresholdCrossing(smoothed);
      const fitted = fitDoubleLogistic(points);
      const dense = fitted ? Array.from({ length: 365 }, (_, i) => ({ x: i + 1, y: fitted.predict(i + 1) })) : [];
      const logistic = dense.length ? thresholdCrossing(dense) : null;
      for (const [name, estimate] of [['smoothed-threshold-20', threshold], ['double-logistic-threshold-20', logistic]]) {
        if (!estimate) continue;
        record.methods.push({ name, dayOfYear: +estimate.day.toFixed(2), date: isoDay(year, estimate.day),
          observationBracket: name.startsWith('smoothed') ? estimate.bracket.map((d) => isoDay(year, d)) : null,
          fittingRmse: name.startsWith('double') ? +fitted.rmse.toFixed(5) : null });
      }
      record.methodDifferenceDays = record.methods.length === 2 ? +Math.abs(record.methods[0].dayOfYear - record.methods[1].dayOfYear).toFixed(2) : null;
      if (!record.methods.length) { record.status = 'insufficient'; record.reasons.push('未识别到有效上升期阈值穿越。'); }
    }
    years.push(record);
  }
  return { version: 'phenology/1.0', definition: 'land-surface-greenup', years,
    limitations: ['方法差异与观测时间括区不是统计置信区间。', '拟合 RMSE 为拟合残差，不是独立地面观测误差。', '未提供独立地面观测时不能声称外部验证通过。'],
    independentValidation: { status: 'not-provided', samples: 0 } };
}
