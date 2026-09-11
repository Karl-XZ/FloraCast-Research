import crypto from 'crypto';
import axios from 'axios';
import { analyzePhenology } from './phenology.js';
import { parseMod13Area } from './modis-quality.js';
import { defaultResearchPlan, searchLiterature } from './literature.js';

export const RESEARCH_STAGES = Object.freeze([
  { id: 'protocol', role: 'Coordinator Agent', label: '研究协议', description: '冻结问题、区域、时期与验证规则' },
  { id: 'literature', role: 'Literature Agent', label: '文献检索', description: '检索背景、方法与数据产品依据' },
  { id: 'data', role: 'Data Steward Agent', label: '数据准备', description: '获取并登记气候与遥感数据' },
  { id: 'geo', role: 'Geospatial Agent', label: '空间分析', description: '执行 AOI、尺度与覆盖检查' },
  { id: 'statistics', role: 'Statistics Agent', label: '统计验证', description: '计算描述统计、基线与不确定性' },
  { id: 'evidence', role: 'Evidence Auditor Agent', label: '证据审查', description: '连接结论、来源、方法与限制' },
  { id: 'reproduce', role: 'Reproducer Agent', label: '独立复现', description: '核验输入哈希与确定性产物' },
  { id: 'report', role: 'Writing Agent', label: '研究报告', description: '只发布通过证据审查的表述' }
]);

const DEMO_POWER = [
  ['20240301', 5.1, 0.0], ['20240302', 6.0, 1.2], ['20240303', 7.4, 0.0],
  ['20240304', 8.2, 0.4], ['20240305', 9.0, 0.0], ['20240306', 10.3, 3.8],
  ['20240307', 11.1, 0.0], ['20240308', 9.8, 0.0], ['20240309', 12.0, 0.2],
  ['20240310', 13.2, 0.0], ['20240311', 14.0, 0.0], ['20240312', 12.8, 2.1]
];

const DEMO_VI = [
  { date: '2024-01-01', ndvi: 0.218, evi: 0.142 },
  { date: '2024-01-17', ndvi: 0.226, evi: 0.149 },
  { date: '2024-02-02', ndvi: 0.241, evi: 0.157 },
  { date: '2024-02-18', ndvi: 0.269, evi: 0.178 },
  { date: '2024-03-05', ndvi: 0.318, evi: 0.213 },
  { date: '2024-03-21', ndvi: 0.387, evi: 0.261 }
];

export class ProtocolError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ProtocolError';
    this.field = field;
    this.status = 400;
  }
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeProtocol(input = {}) {
  const question = String(input.question || '').trim();
  if (question.length < 12) throw new ProtocolError('研究问题至少需要 12 个字符。', 'question');

  const lat = finite(input.aoi?.lat ?? input.lat);
  const lng = finite(input.aoi?.lng ?? input.lng);
  if (lat == null || lat < -90 || lat > 90) throw new ProtocolError('纬度必须位于 -90 至 90。', 'lat');
  if (lng == null || lng < -180 || lng > 180) throw new ProtocolError('经度必须位于 -180 至 180。', 'lng');

  const radiusKm = finite(input.aoi?.radiusKm ?? input.radiusKm, 25);
  if (radiusKm < 1 || radiusKm > 25) throw new ProtocolError('研究半径必须位于 1 至 25 km，以控制 250 m MODIS 实时子集规模。', 'radiusKm');

  const startYear = Math.trunc(finite(input.period?.startYear ?? input.startYear, 2019));
  const endYear = Math.trunc(finite(input.period?.endYear ?? input.endYear, 2024));
  if (startYear < 1981 || endYear > new Date().getUTCFullYear() || endYear < startYear) {
    throw new ProtocolError('时间范围必须从 1981 年起，且结束年份不早于开始年份。', 'period');
  }
  if (endYear - startYear > 20) throw new ProtocolError('单次运行最多覆盖 21 年。', 'period');

  const mode = input.mode ?? 'live';
  if (!['live', 'demo'].includes(mode)) throw new ProtocolError('未知运行模式。', 'mode');
  const sources = Array.isArray(input.sources) && input.sources.length
    ? [...new Set(input.sources.map(String))]
    : ['NASA_POWER', 'MODIS_ORNL'];

  return {
    version: '1.0',
    question,
    aoi: {
      name: String(input.aoi?.name || input.locationName || '自定义研究区').trim().slice(0, 120),
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      radiusKm: Number(radiusKm.toFixed(1)),
      geometryType: 'PointBuffer'
    },
    period: { startYear, endYear },
    mode,
    sources,
    hypothesis: String(input.hypothesis || '升温与春季植被返青时间存在统计关联。').trim().slice(0, 500),
    validation: {
      temporalHoldout: endYear,
      baseline: 'seasonal-threshold',
      alpha: 0.05,
      causalClaimAllowed: false
    },
    frozenAt: input.frozenAt || new Date().toISOString()
  };
}

export function summarizePower(rows) {
  const valid = rows.filter((row) => Number.isFinite(row.t2m));
  const rain = rows.filter((row) => Number.isFinite(row.precip));
  const meanTemp = valid.length ? valid.reduce((sum, row) => sum + row.t2m, 0) / valid.length : null;
  const precipitation = rain.length ? rain.reduce((sum, row) => sum + row.precip, 0) : null;
  const base = 5;
  let gdd = 0;
  let thresholdDate = null;
  let currentYear = null;
  for (const row of valid) {
    const year = String(row.date).slice(0, 4);
    if (year !== currentYear) { gdd = 0; thresholdDate = null; currentYear = year; }
    gdd += Math.max(0, row.t2m - base);
    if (!thresholdDate && gdd >= 80) thresholdDate = row.date;
  }
  return {
    observations: rows.length,
    validTemperatureDays: valid.length,
    meanTemperatureC: meanTemp == null ? null : Number(meanTemp.toFixed(3)),
    precipitationMm: precipitation == null ? null : Number(precipitation.toFixed(3)),
    gddBase5: Number(gdd.toFixed(3)),
    gddYear: currentYear,
    gdd80Date: thresholdDate,
    completeness: rows.length ? Number((valid.length / rows.length).toFixed(3)) : 0
  };
}

export function summarizeVegetation(series) {
  const valid = series.filter((item) => Number.isFinite(item.ndvi));
  if (!valid.length) return { observations: 0, latest: null, change: null, greenupCandidate: null };
  const first = valid[0];
  const latest = valid[valid.length - 1];
  const range = Math.max(...valid.map((row) => row.ndvi)) - Math.min(...valid.map((row) => row.ndvi));
  const threshold = Math.min(...valid.map((row) => row.ndvi)) + range * 0.2;
  const candidate = valid.find((row, index) => index > 0 && row.ndvi >= threshold && row.ndvi > valid[index - 1].ndvi);
  return {
    observations: valid.length,
    latest: { date: latest.date, ndvi: latest.ndvi, evi: latest.evi ?? null },
    change: Number((latest.ndvi - first.ndvi).toFixed(4)),
    threshold: Number(threshold.toFixed(4)),
    greenupCandidate: candidate?.date || null,
    caveat: '遥感地表返青候选日期不等同于物种开花日期。'
  };
}

function demoDatasets(protocol) {
  const power = DEMO_POWER.map(([date, t2m, precip]) => ({ date, t2m, precip }));
  return {
    power,
    vegetation: DEMO_VI,
    manifests: [
      {
        id: 'data-power-demo', source: 'NASA_POWER', role: 'fixture', status: 'demo',
        coverage: { start: power[0].date, end: power[power.length - 1].date },
        license: 'MIT synthetic test fixture; not NASA observations',
        checksum: sha256(power)
      },
      {
        id: 'data-modis-demo', source: 'MODIS_ORNL', role: 'fixture', status: 'demo',
        coverage: { start: DEMO_VI[0].date, end: DEMO_VI[DEMO_VI.length - 1].date },
        license: 'MIT synthetic test fixture; not NASA observations',
        checksum: sha256(DEMO_VI)
      }
    ],
    disclosure: `演示模式使用内置固定样例，不代表 ${protocol.aoi.name} 的实测结果。`
  };
}

async function fetchPower(protocol) {
  const { lat, lng } = protocol.aoi;
  const start = `${protocol.period.startYear}0101`;
  const end = `${protocol.period.endYear}1231`;
  const response = await axios.get('https://power.larc.nasa.gov/api/temporal/daily/point', {
    params: {
      parameters: 'T2M,PRECTOTCORR', community: 'AG', longitude: lng, latitude: lat,
      start, end, format: 'JSON'
    },
    timeout: 45_000
  });
  const parameters = response.data?.properties?.parameter || {};
  const dates = Object.keys(parameters.T2M || {}).sort();
  const rows = dates.map((date) => ({
    date,
    t2m: finite(parameters.T2M?.[date]) > -900 ? finite(parameters.T2M?.[date]) : null,
    precip: finite(parameters.PRECTOTCORR?.[date]) >= 0 ? finite(parameters.PRECTOTCORR?.[date]) : null
  }));
  return {
    rows,
    manifest: {
      id: 'data-power-live', source: 'NASA_POWER', role: 'climate', status: 'retrieved',
      url: response.config?.url || 'https://power.larc.nasa.gov/',
      requested: { start, end, lat, lng },
      coverage: { start: rows[0]?.date || null, end: rows[rows.length - 1]?.date || null },
      license: 'NASA POWER data policy', checksum: sha256(rows)
    }
  };
}

async function fetchVegetation(protocol) {
  const { lat, lng } = protocol.aoi;
  const product = 'MOD13Q1';
  const datesResponse = await axios.get(`https://modis.ornl.gov/rst/api/v1/${product}/dates`, {
    params: { latitude: lat, longitude: lng }, timeout: 45_000
  });
  const all = datesResponse.data?.dates || [];
  const selected = all.filter((entry) => {
    const value = String(entry.calendar_date || entry.modis_date || '');
    const year = Number(value.slice(value.startsWith('A') ? 1 : 0, value.startsWith('A') ? 5 : 4));
    return year >= protocol.period.startYear && year <= protocol.period.endYear;
  });
  const series = [];
  for (const entry of selected) {
    const modisDate = entry.modis_date || entry;
    try {
      const response = await axios.get(`https://modis.ornl.gov/rst/api/v1/${product}/subset`, {
        params: { latitude: lat, longitude: lng, startDate: modisDate, endDate: modisDate, kmAboveBelow: Math.ceil(protocol.aoi.radiusKm), kmLeftRight: Math.ceil(protocol.aoi.radiusKm) },
        timeout: 30_000
      });
      const subset = response.data?.subset || [];
      series.push(parseMod13Area(subset, String(entry.calendar_date || subset[0]?.calendar_date || modisDate).slice(0, 10), protocol.aoi.radiusKm, 250));
    } catch (_) {
      // Individual cloudy or unavailable composites remain visible as coverage gaps.
    }
  }
  return {
    series,
    manifest: {
      id: 'data-modis-live', source: 'MODIS_ORNL', role: 'vegetation', status: series.length ? 'retrieved' : 'unavailable',
      requested: { product, period: protocol.period, lat, lng, spatialMode: 'circular-buffer-mean', radiusKm: protocol.aoi.radiusKm },
      coverage: { start: series[0]?.date || null, end: series[series.length - 1]?.date || null },
      license: 'NASA EOSDIS data policy', checksum: sha256(series),
      quality: { policy: 'pixel reliability=0 before circular AOI aggregation', retrieved: series.length, accepted: series.filter((r) => r.qaAccepted && r.ndvi !== null).length, failedRequests: selected.length - series.length }
    }
  };
}

async function liveDatasets(protocol) {
  const results = await Promise.allSettled([fetchPower(protocol), fetchVegetation(protocol)]);
  const power = results[0].status === 'fulfilled' ? results[0].value : { rows: [], manifest: { id: 'data-power-live', source: 'NASA_POWER', status: 'failed', error: String(results[0].reason?.message || results[0].reason) } };
  const vegetation = results[1].status === 'fulfilled' ? results[1].value : { series: [], manifest: { id: 'data-modis-live', source: 'MODIS_ORNL', status: 'failed', error: String(results[1].reason?.message || results[1].reason) } };
  if (!power.rows.length && !vegetation.series.length) throw new Error('所有实时数据源均不可用，未生成科学结论。');
  return {
    power: power.rows,
    vegetation: vegetation.series,
    manifests: [power.manifest, vegetation.manifest],
    disclosure: '实时模式结果取自运行时外部数据接口，覆盖与失败状态记录于数据清单。'
  };
}

function claim(id, statement, status, supports, limits, scope) {
  return { id, statement, status, supports, limits, scope, reviewedBy: 'Evidence Auditor Agent' };
}

export function buildEvidence(protocol, datasets, summaries, literature = { records: [] }) {
  const claims = [];
  const areaAggregated = datasets.vegetation.some((row) => row.spatial?.statistic === 'circular-aoi-mean');
  if (summaries.vegetation.observations >= 2) {
    claims.push(claim(
      'claim-vegetation-change',
      `在已获取的 ${summaries.vegetation.observations} 个植被指数观测中，首末 NDVI 差值为 ${summaries.vegetation.change}.`,
      'supported', ['data-modis-live', 'data-modis-demo'].filter((id) => datasets.manifests.some((item) => item.id === id)),
      ['仅描述首末观测差异，未控制季节性。', areaAggregated ? 'AOI 均值会掩盖内部空间异质性。' : '演示点序列不能代表整个缓冲区。'],
      { aoi: protocol.aoi, period: protocol.period }
    ));
  }
  if (summaries.power.validTemperatureDays) {
    claims.push(claim(
      'claim-climate-summary',
      `有效温度观测 ${summaries.power.validTemperatureDays} 天，平均温度为 ${summaries.power.meanTemperatureC} °C。`,
      'supported', ['data-power-live', 'data-power-demo'].filter((id) => datasets.manifests.some((item) => item.id === id)),
      ['这是描述统计，不构成气候趋势或因果证据。'],
      { aoi: protocol.aoi, period: protocol.period }
    ));
  }
  claims.push(claim(
    'claim-hypothesis', protocol.hypothesis, 'unresolved', [],
    ['当前单点运行不足以检验跨区域升温效应。', '需跨年序列、独立地面物候数据与空间留出验证。'],
    { requested: protocol.period, evaluated: 'descriptive-only' }
  ));
  for (const record of literature.records || []) {
    if (!record.url) continue;
    claims.push({ id: `literature-${sha256(record.url).slice(0, 10)}`, statement: `文献线索：${record.title}`, status: 'context', supports: [], limits: ['作为背景与方法线索；尚未据原文核验具体科研论断。'], scope: { url: record.url, doi: record.doi }, reviewedBy: 'Evidence Auditor Agent' });
  }
  return {
    claims,
    edges: claims.flatMap((item) => item.supports.map((source) => ({ from: source, to: item.id, relation: 'supports' }))),
    audit: {
      supported: claims.filter((item) => item.status === 'supported').length,
      unresolved: claims.filter((item) => item.status === 'unresolved').length,
      rejected: claims.filter((item) => item.status === 'rejected').length,
      contextual: claims.filter((item) => item.status === 'context').length,
      causalLanguageBlocked: true
    }
  };
}

export function buildReport(protocol, datasets, summaries, evidence, runtime, planning, literature) {
  const supported = evidence.claims.filter((item) => item.status === 'supported');
  const lines = [
    `# ${protocol.aoi.name} 生态与物候研究`, '',
    `研究问题：${protocol.question}`,
    `时段：${protocol.period.startYear}-${protocol.period.endYear}`,
    `AOI：${protocol.aoi.lat}, ${protocol.aoi.lng}; 半径 ${protocol.aoi.radiusKm} km`,
    `数据模式：${protocol.mode === 'demo' ? '固定测试数据' : '实时公开数据'}`,
    `执行器：${runtime}`, '', '## 结果', ''
  ];
  if (!supported.length) lines.push('支持状态结论：0');
  supported.forEach((item) => lines.push(`- ${item.statement} [${item.id}]`));
  lines.push('', '## 数据清单', '');
  datasets.manifests.forEach((item) => lines.push(`- ${item.source}: ${item.status}; ${item.coverage?.start || 'NA'} - ${item.coverage?.end || 'NA'}; checksum=${item.checksum || 'NA'}`));
  lines.push('', '## 地表物候', '');
  for (const year of summaries.phenology?.years || []) {
    lines.push(`### ${year.year}`, `有效观测：${year.observations}; QA：${year.qaStatus}; 状态：${year.status}`);
    for (const method of year.methods) lines.push(`- ${method.name}: ${method.date}; DOY ${method.dayOfYear}${method.fittingRmse !== null ? `; RMSE ${method.fittingRmse}` : ''}`);
  }
  lines.push('', '## 文献', '');
  for (const [index, record] of (literature?.records || []).entries()) lines.push(`[L${index + 1}] ${record.title}. ${record.authors?.join(', ') || ''} (${record.year || 'n.d.'}). ${record.doi ? `doi:${record.doi}` : record.url || ''}`);
  lines.push('', '## 复现', '', `inputHash: ${sha256({ protocol, manifests: datasets.manifests })}`);
  return lines.join('\n');
}

export async function executeResearch(protocolInput, options = {}) {
  const protocol = normalizeProtocol(protocolInput);
  const notify = options.notify || (() => {});
  const runtime = options.runtime || 'local-deterministic';
  const stages = [];
  const runStage = async (stageId, work) => {
    const definition = RESEARCH_STAGES.find((item) => item.id === stageId);
    if (options.beforeStage) await options.beforeStage(stageId);
    const startedAt = new Date().toISOString();
    notify({ type: 'stage', stageId, status: 'running', role: definition.role, label: definition.label, startedAt });
    const output = await work();
    const finishedAt = new Date().toISOString();
    const record = { ...definition, status: 'completed', startedAt, finishedAt, outputHash: sha256(output) };
    stages.push(record);
    notify({ type: 'stage', stageId, status: 'completed', role: definition.role, label: definition.label, finishedAt, outputHash: record.outputHash });
    if (options.afterStage) await options.afterStage(stageId, record.outputHash);
    return output;
  };

  const planning = await runStage('protocol', async () => options.planProtocol ? options.planProtocol(protocol, defaultResearchPlan(protocol)) : defaultResearchPlan(protocol));
  const literature = await runStage('literature', async () => options.literature || searchLiterature(protocol));
  const datasets = await runStage('data', async () => options.datasets || (protocol.mode === 'live' ? liveDatasets(protocol) : demoDatasets(protocol)));
  const geo = await runStage('geo', async () => ({
    geometryType: protocol.aoi.geometryType,
    center: [protocol.aoi.lng, protocol.aoi.lat],
    radiusKm: protocol.aoi.radiusKm,
    spatialSupport: datasets.vegetation.some((row) => row.spatial?.statistic === 'circular-aoi-mean') ? 'quality-screened-circular-aoi-mean' : datasets.vegetation.length ? 'fixture-point-series' : 'climate-point',
    warning: datasets.vegetation.some((row) => row.spatial?.statistic === 'circular-aoi-mean') ? '遥感值为圆形 AOI 内、可靠性 QA 通过像元的算术均值；它不等同于物种级地面观测。' : '演示数据是固定点序列，不代表缓冲区面积统计。'
  }));
  const summaries = await runStage('statistics', async () => ({
    power: summarizePower(datasets.power),
    vegetation: summarizeVegetation(datasets.vegetation),
    phenology: analyzePhenology(datasets.vegetation, protocol),
    method: { name: 'descriptive-plus-seasonal-threshold', version: '1.0', causal: false }
  }));
  const evidence = await runStage('evidence', async () => buildEvidence(protocol, datasets, summaries, literature));
  const reproduction = await runStage('reproduce', async () => {
    const inputHash = sha256({ protocol, manifests: datasets.manifests });
    const outputHash = sha256({ planning, literature, geo, summaries, evidence });
    return { inputHash, outputHash, deterministic: true, status: 'recorded', runtime,
      note: '哈希登记完成；独立复算需要新运行重新计算并比较产物。' };
  });
  const report = await runStage('report', async () => (options.buildReport ? options.buildReport(protocol, datasets, summaries, evidence, runtime, planning, literature) : buildReport(protocol, datasets, summaries, evidence, runtime, planning, literature)));
  return { protocol, runtime, stages, planning, literature, datasets, geo, summaries, evidence, reproduction, report };
}

export function buildNotebook(run) {
  const snapshot = JSON.stringify({ id: run.id, protocol: run.protocol, result: run.result });
  const content = [
    { cell_type: 'markdown', metadata: {}, source: [`# FloraCast Research Run ${run.id}\n`, `${run.protocol.question}\n\n`,
      '在已安装依赖的 FLORACAST 源码目录或子目录打开此 Notebook。需要 Node.js 18+。快照数据嵌入下方单元；算法使用 server/reproduce.js，与研究服务共享计算函数。合成样例不能作为实测科研结果。\n'] },
    { cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: [
      'import json, pathlib, subprocess\n',
      `snapshot = json.loads(${JSON.stringify(snapshot)})\n`,
      "root = next((p for p in [pathlib.Path.cwd(), *pathlib.Path.cwd().parents] if (p / 'server' / 'reproduce.js').exists()), None)\n",
      "assert root is not None, '请从 FLORACAST 源码目录或子目录运行 Notebook'\n",
      "process = subprocess.run(['node', str(root / 'server' / 'reproduce.js')], input=json.dumps(snapshot), text=True, encoding='utf-8', capture_output=True, check=True)\n",
      "verification = json.loads(process.stdout)\n",
      "assert verification['inputsEqual'] and verification['outputsEqual'], verification\n",
      "print(json.dumps(verification, ensure_ascii=False, indent=2))\n"
    ] },
    { cell_type: 'markdown', metadata: {}, source: [run.result?.report || '报告尚未生成。'] }
  ];
  return { cells: content, metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python', version: '3.11' }, floracast: { runId: run.id, inputHash: run.result?.reproduction?.inputHash || null } }, nbformat: 4, nbformat_minor: 5 };
}
