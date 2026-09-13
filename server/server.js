import { executeWeatherSearch } from './weather-search.js';
import { runClimateResearchAgent } from './climate-agent.js';
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { ResearchStore } from './research-store.js';
import { researchRouter } from './research-router.js';
import { executeWithJiuwen } from './jiuwen-runtime.js';
import { executeResearch } from './research-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ipv4Agent = new https.Agent({ family: 4 });

const ENV = {
  loadedFrom: null,
  tried: []
};

function tryLoadEnv(p) {
  ENV.tried.push(p);
  try {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      ENV.loadedFrom = p;
      return true;
    }
  } catch (_) {}
  return false;
}

const candidates = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '.env.local')
];

for (const p of candidates) {
  if (tryLoadEnv(p)) break;
}

process.on('uncaughtException', (err) => {
  console.error('[FloraCast-Server] UncaughtException caught:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FloraCast-Server] UnhandledRejection caught:', reason);
});

const app = express();
app.disable('x-powered-by');

// Subpath normalization for reverse proxy deployment
app.use((req, res, next) => {
  if (req.url.startsWith('/FloraCast/')) {
    req.url = req.url.slice('/FloraCast'.length);
  } else if (req.url === '/FloraCast') {
    return res.redirect(301, '/FloraCast/');
  }
  next();
});

app.use(express.json({ limit: '8mb' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body syntax', detail: err.message });
  }
  next(err);
});

// Research workflow setup
const localPython = path.join(__dirname, '..', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const researchPython = process.env.RESEARCH_PYTHON || (fs.existsSync(localPython) ? localPython : '');

const researchStoreOptions = researchPython
  ? {
      runtime: 'openjiuwen-workflow',
      execute: (protocol, options) =>
        executeWithJiuwen(protocol, {
          ...options,
          python: researchPython,
          planProtocol: options.planProtocol || planResearchProtocol,
          buildReport: options.buildReport || synthesizeDeepResearchReport
        })
    }
  : {
      runtime: 'local-deterministic',
      execute: (protocol, options) =>
        executeResearch(protocol, {
          ...options,
          planProtocol: options.planProtocol || planResearchProtocol,
          buildReport: options.buildReport || synthesizeDeepResearchReport
        })
    };

const researchStore = new ResearchStore(process.env.RESEARCH_DATA_DIR || path.join(__dirname, '..', '.research-data'), researchStoreOptions);
app.use('/api/research', researchRouter(researchStore));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    env: {
      loadedFrom: ENV.loadedFrom,
      tried: ENV.tried,
      hasDeepseekApiKey: Boolean(process.env.DEEPSEEK_API_KEY),
      deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      hasQwenApiKey: Boolean(process.env.QWEN_API_KEY),
      hasAmapWebKey: Boolean(process.env.AMAP_WEB_KEY),
      qwenApiBase: qwenBase(),
      qwenTextModel: process.env.QWEN_TEXT_MODEL || process.env.QWEN_MODEL || 'qwen-plus',
      qwenVisionModel: process.env.QWEN_VISION_MODEL || 'qwen-vl-plus',
      researchPython: researchPython || 'not-configured'
    }
  });
});

function deepseekBase() {
  return (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
}

function deepseekHeaders() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    const err = new Error('DEEPSEEK_API_KEY is not set on the server.');
    err.status = 400;
    throw err;
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`
  };
}

async function callDeepseekChat({ messages, model = process.env.DEEPSEEK_MODEL || 'deepseek-flash', temperature = 0.3, maxTokens = 2048 }) {
  const r = await axios.post(
    `${deepseekBase()}/chat/completions`,
    {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    },
    {
      headers: deepseekHeaders(),
      httpsAgent: ipv4Agent,
      timeout: 60_000,
      maxBodyLength: Infinity
    }
  );
  return r.data;
}

function qwenBase() {
  return (process.env.QWEN_API_BASE || 'https://llm-eln0cv2uifxjokf2.cn-beijing.maas.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
}

function qwenHeaders() {
  const key = process.env.QWEN_API_KEY;
  if (!key) {
    const err = new Error('QWEN_API_KEY is not set on the server.');
    err.status = 400;
    throw err;
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`
  };
}

function safeErr(e) {
  const payload = e?.response?.data;
  if (payload && typeof payload === 'object') return JSON.stringify(payload);
  return e?.message || 'Unknown error';
}

async function callQwenChat({ messages, model, temperature = 0.35, maxTokens = 1200 }) {
  const r = await axios.post(
    `${qwenBase()}/chat/completions`,
    {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    },
    {
      headers: qwenHeaders(),
      httpsAgent: ipv4Agent,
      timeout: 60_000,
      maxBodyLength: Infinity
    }
  );
  return r.data;
}

app.post('/api/ai/chat', async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!messages?.length) {
      return res.status(400).json({ error: 'Missing messages array.' });
    }

    const preferProvider = req.body?.provider || (process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'qwen');

    if (preferProvider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
      const model = req.body?.model || process.env.DEEPSEEK_MODEL || 'deepseek-flash';
      const data = await callDeepseekChat({
        messages,
        model,
        temperature: Number(req.body?.temperature ?? 0.3),
        maxTokens: Number(req.body?.max_tokens ?? 2048)
      });

      const choice = data?.choices?.[0]?.message;
      return res.json({
        provider: 'deepseek',
        model,
        content: choice?.content || '',
        reasoning: choice?.reasoning_content || '',
        raw: data
      });
    }

    const model = process.env.QWEN_TEXT_MODEL || process.env.QWEN_MODEL || 'qwen-plus';
    const data = await callQwenChat({
      messages,
      model,
      temperature: Number(req.body?.temperature ?? 0.4),
      maxTokens: Number(req.body?.max_tokens ?? 1400)
    });

    return res.json({
      provider: 'qwen-compatible',
      model,
      content: data?.choices?.[0]?.message?.content || '',
      reasoning: '',
      raw: data
    });
  } catch (e) {
    console.error('[ai-chat] error', e?.response?.data || e);
    return res.status(e.status || 500).json({ error: safeErr(e) });
  }
});

app.get('/api/geocode/reverse', async (req, res) => {
  const lat = Number(req.query?.lat);
  const lng = Number(req.query?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng query parameters are required.' });
  }

  const coordText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const key = process.env.AMAP_WEB_KEY;
  if (!key) {
    return res.json({
      provider: 'coordinate-fallback',
      displayName: coordText,
      note: 'Set AMAP_WEB_KEY to enable Gaode reverse geocoding.'
    });
  }

  try {
    const r = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
      params: {
        key,
        location: `${lng},${lat}`,
        radius: 1000,
        extensions: 'base',
        output: 'JSON',
        roadlevel: 0
      },
      httpsAgent: ipv4Agent,
      timeout: 12_000
    });

    const data = r.data || {};
    if (data.status !== '1') {
      return res.json({
        provider: 'amap',
        displayName: coordText,
        rawStatus: data.status,
        rawInfo: data.info || null
      });
    }

    return res.json({
      provider: 'amap',
      displayName: data.regeocode?.formatted_address || coordText
    });
  } catch (e) {
    console.warn('[amap-reverse-geocode] error', e?.response?.data || e.message);
    return res.json({
      provider: 'coordinate-fallback',
      displayName: coordText,
      error: safeErr(e)
    });
  }
});

function extractJsonObject(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

async function planResearchProtocol(protocol, fallback) {
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY);
  const hasQwen = Boolean(process.env.QWEN_API_KEY);
  if (!hasDeepseek && !hasQwen) return fallback;

  const prompt = `你是生态与物候科研协调智能体。根据冻结协议生成可审计研究计划，只能规划，不能声称已经得到结果。
仅返回 JSON：{"objective":"...","estimand":"...","tasks":["..."],"decisionRules":["..."],"expectedOutputs":["..."],"cautions":["..."]}。
必须阻止因果夸大，明确点像元空间支持、独立地面验证和数据缺失的拒绝规则。冻结协议：${JSON.stringify(protocol)}`;

  try {
    let rawText = '';
    let providerTag = '';

    if (hasDeepseek) {
      const data = await callDeepseekChat({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
        temperature: 0.1,
        maxTokens: 1200,
        messages: [
          { role: 'system', content: '你生成保守、可复现、可审稿的生态研究计划。' },
          { role: 'user', content: prompt }
        ]
      });
      rawText = data?.choices?.[0]?.message?.content || '';
      providerTag = `deepseek:${data?.model || 'deepseek-flash'}`;
    } else {
      const data = await callQwenChat({
        model: process.env.QWEN_TEXT_MODEL || process.env.QWEN_MODEL || 'qwen-plus',
        temperature: 0.1,
        maxTokens: 1100,
        messages: [
          { role: 'system', content: '你生成保守、可复现、可审稿的生态研究计划。' },
          { role: 'user', content: prompt }
        ]
      });
      rawText = data?.choices?.[0]?.message?.content || '';
      providerTag = `qwen:${process.env.QWEN_TEXT_MODEL || process.env.QWEN_MODEL || 'qwen-plus'}`;
    }

    const parsed = extractJsonObject(rawText);
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.decisionRules)) {
      return { ...fallback, generatedBy: 'deterministic-fallback-invalid-llm-output' };
    }
    const strings = (value, limit = 12) => (Array.isArray(value) ? value : []).slice(0, limit).map((item) => String(item).slice(0, 500));
    return {
      generatedBy: providerTag,
      objective: String(parsed.objective || fallback.objective).slice(0, 1000),
      estimand: String(parsed.estimand || fallback.estimand).slice(0, 1000),
      tasks: strings(parsed.tasks),
      decisionRules: strings(parsed.decisionRules),
      expectedOutputs: strings(parsed.expectedOutputs),
      cautions: strings(parsed.cautions)
    };
  } catch (error) {
    console.warn('[planResearchProtocol] error:', error?.message);
    return { ...fallback, generatedBy: 'deterministic-fallback-llm-unavailable', cautions: [...(fallback.cautions || []), '规划模型在本次运行不可用，已采用确定性规则模板。'] };
  }
}

async function synthesizeDeepResearchReport(protocol, datasets, summaries, evidence, runtime, planning, literature) {
  const { buildReport } = await import('./research-core.js');
  const baseReport = buildReport(protocol, datasets, summaries, evidence, runtime, planning, literature);
  if (!process.env.DEEPSEEK_API_KEY && !process.env.QWEN_API_KEY) {
    return baseReport;
  }

  try {
    const summaryPrompt = `你作为顶尖的植物物候与生态遥感学术报告主笔智能体（Writing Agent），请根据以下经过 openJiuwen 8个阶段严格审查与哈希审计的科学研究事实，撰写一份结构严谨、客观可信、符合学术规范的科研报告。

【研究协议】
- 区域: ${protocol.aoi.name} (中心经纬度: ${protocol.aoi.lat}, ${protocol.aoi.lng}, 半径: ${protocol.aoi.radiusKm} km)
- 时间跨度: ${protocol.period.startYear} - ${protocol.period.endYear}
- 研究问题: ${protocol.question}
- 执行引擎: ${runtime}

【气象与物候汇总数据】
- POWER气候要素: ${JSON.stringify(summaries.power?.annual || {})}
- 植被指标汇总: ${JSON.stringify(summaries.vegetation || {})}
- 物候始花/返青预测: ${JSON.stringify(summaries.phenology?.years || [])}

【审查通过的证据声明】
${(evidence?.claims || []).map(c => `- [${c.id} / ${c.status}] ${c.statement} (依据: ${c.basis || 'NA'})`).join('\n')}

【相关学术文献】
${(literature?.records || []).slice(0, 5).map((r, i) => `[${i+1}] ${r.title} (${r.year || ''})`).join('\n')}

请撰写学术研究报告，包含：
1. 摘要与研究背景
2. 气候演变与物候响应实证（紧扣真实数据分析）
3. 证据链条审计与假设检验（客观列出数据支持项与不确定性项）
4. 研究局限性（如 MODIS 250m 像元均值与地面观测差异）与未来建议

要求：使用严谨学术语气，仅使用提供的确定性数据，严禁无中生有。`;

    let data;
    let reasoningText = '';
    if (process.env.DEEPSEEK_API_KEY) {
      data = await callDeepseekChat({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
        temperature: 0.2,
        maxTokens: 2500,
        messages: [
          { role: 'system', content: '你是一位严谨的地球科学与遥感物候研究学者。' },
          { role: 'user', content: summaryPrompt }
        ]
      });
      reasoningText = data?.choices?.[0]?.message?.reasoning_content || '';
    } else {
      data = await callQwenChat({
        model: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
        temperature: 0.2,
        maxTokens: 2000,
        messages: [
          { role: 'system', content: '你是一位严谨的地球科学与遥感物候研究学者。' },
          { role: 'user', content: summaryPrompt }
        ]
      });
    }

    const synthesized = data?.choices?.[0]?.message?.content || '';
    if (synthesized && synthesized.length > 100) {
      let fullReport = `# ${protocol.aoi.name} 生态与物候科学研究报告\n\n`;
      if (reasoningText) {
        fullReport += `> **DeepSeek 推理思考摘要：**\n> ${reasoningText.split('\n').slice(0, 8).join('\n> ')}\n\n`;
      }
      fullReport += synthesized;
      const appendixMatch = baseReport.match(/## 数据清单[\s\S]*/);
      if (appendixMatch) {
        fullReport += `\n\n---\n## 附录：确定性复现数据清单与哈希\n` + appendixMatch[0];
      }
      return fullReport;
    }
    return baseReport;
  } catch (e) {
    console.warn('[synthesizeDeepResearchReport] LLM error, using baseReport:', e.message);
    return baseReport;
  }
}

function normalizeQwenPlantResult(parsed, text) {
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const results = candidates.map((item) => ({
    score: typeof item.confidence === 'number' ? item.confidence : null,
    scientificName: item.scientificName || item.scientific_name || item.name || null,
    scientificNameWithoutAuthor: item.scientificNameWithoutAuthor || null,
    commonNames: Array.isArray(item.commonNames)
      ? item.commonNames
      : (item.commonName ? [item.commonName] : []),
    genus: item.genus || null,
    family: item.family || null,
    note: item.reason || item.note || null
  }));

  return {
    results,
    raw: {
      summary: parsed?.summary || text || '',
      caution: parsed?.caution || 'AI visual identification is probabilistic. Verify important observations with experts or field guides.'
    }
  };
}

async function identifyPlantWithQwen({ imageBuffer, mimeType, organ, regionHint, lat, lng, source }) {
  const base64 = imageBuffer.toString('base64');
  const model = process.env.QWEN_VISION_MODEL || 'qwen-vl-plus';
  const locationHint = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'unknown';
  const prompt = `You are a cautious botanist helping with open-source GeoAI plant observation workflows.
Identify the plant in the image using visible morphology, organ type, and geography.

Return ONLY valid JSON with this shape:
{
  "summary": "one sentence",
  "candidates": [
    {
      "scientificName": "Genus species or genus/family if uncertain",
      "commonNames": ["name"],
      "family": "family if known",
      "genus": "genus if known",
      "confidence": 0.0,
      "reason": "short visual evidence"
    }
  ],
  "caution": "verification note"
}

Constraints:
- Use 0.0-1.0 confidence.
- Provide up to 5 candidates.
- If the image is not a plant, return an empty candidates array.
- Do not invent exact species when only genus/family is visible.

Context:
- Organ hint: ${organ || 'auto'}
- Region/project hint: ${regionHint || 'global'}
- Coordinates: ${locationHint}
- Image source: ${source || 'upload'}`;

  const data = await callQwenChat({
    model,
    temperature: 0.1,
    maxTokens: 1200,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64}` } }
        ]
      }
    ]
  });

  const text = data?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonObject(text) || { summary: text, candidates: [] };
  return {
    provider: 'qwen-vl-open-compatible',
    model,
    ...normalizeQwenPlantResult(parsed, text)
  };
}

app.post('/api/plant/identify', upload.single('image'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Missing image file (multipart field "image").' });
    }

    const organ = String(req.body?.organ || 'auto').toLowerCase();
    const regionHint = String(req.body?.project || 'global');
    const lat = req.body?.lat != null ? Number(req.body.lat) : null;
    const lng = req.body?.lng != null ? Number(req.body.lng) : null;

    const result = await identifyPlantWithQwen({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      organ,
      regionHint,
      lat,
      lng,
      source: req.file.originalname || 'upload'
    });

    return res.json({
      query: { organ, regionHint, lat, lng, filename: req.file.originalname || null },
      ...result
    });
  } catch (e) {
    console.error('[plant-identify-qwen] error', e?.response?.data || e);
    return res.status(e.status || 500).json({ error: safeErr(e) });
  }
});

app.post('/api/plant/identify_url', async (req, res) => {
  try {
    const imageUrl = req.body?.url;
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'Missing "url" in JSON body.' });
    }

    const u = new URL(imageUrl);
    const allowedHosts = new Set([
      'inaturalist-open-data.s3.amazonaws.com',
      'static.inaturalist.org',
      'inaturalist-open-data.s3.us-east-1.amazonaws.com',
      'inaturalist-open-data.s3.amazonaws.com.cn'
    ]);
    if (!allowedHosts.has(u.hostname)) {
      return res.status(400).json({ error: `URL host not allowed: ${u.hostname}` });
    }

    const imgResp = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 45_000,
      maxContentLength: 12 * 1024 * 1024,
      httpsAgent: ipv4Agent,
      headers: { 'User-Agent': 'FloraCast3D-GeoAI/1.0 (open plant identification proxy)' }
    });

    const organ = String(req.body?.organ || 'auto').toLowerCase();
    const regionHint = String(req.body?.project || 'global');
    const lat = req.body?.lat != null ? Number(req.body.lat) : null;
    const lng = req.body?.lng != null ? Number(req.body.lng) : null;
    const contentType = imgResp.headers?.['content-type'] || 'image/jpeg';

    const result = await identifyPlantWithQwen({
      imageBuffer: Buffer.from(imgResp.data),
      mimeType: contentType,
      organ,
      regionHint,
      lat,
      lng,
      source: imageUrl
    });

    return res.json({
      query: { organ, regionHint, lat, lng, url: imageUrl, filename: path.basename(u.pathname) || 'image.jpg' },
      ...result
    });
  } catch (e) {
    console.error('[plant-identify-url-qwen] error', e?.response?.data || e);
    return res.status(e.status || 500).json({ error: safeErr(e) });
  }
});


// ==========================================
// FloraCast Historical Weather Search & Agent
// ==========================================
app.post('/api/weather/search', async (req, res) => {
  try {
    const { query, aoi, topK } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }
    const result = await executeWeatherSearch(query, { currentAoi: aoi, topK: Number(topK) || 6 });
    return res.json(result);
  } catch (err) {
    console.error('[weather-search] error:', err);
    return res.status(500).json({ error: err.message || 'Weather search failed' });
  }
});

app.post('/api/weather/agent/run', async (req, res) => {
  try {
    const { question, aoi } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Research question is required' });
    }
    const result = await runClimateResearchAgent(question, { currentAoi: aoi });
    return res.json(result);
  } catch (err) {
    console.error('[climate-agent] error:', err);
    return res.status(500).json({ error: err.message || 'Climate research agent failed' });
  }
});

app.get('/api/weather/vegetation-diff', async (req, res) => {
  try {
    const { lat, lon, startDate, endDate, zT2m, zPrecip, zSol, meanT, maxT, totalPrecip, cdd } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required (YYYY-MM-DD)' });
    }
    const latitude = Number(lat) || 36.0671;
    const longitude = Number(lon) || 120.3826;

    const sDate = new Date(startDate.length === 8 ? `${startDate.slice(0,4)}-${startDate.slice(4,6)}-${startDate.slice(6,8)}` : startDate);
    const eDate = new Date(endDate.length === 8 ? `${endDate.slice(0,4)}-${endDate.slice(4,6)}-${endDate.slice(6,8)}` : endDate);
    const durationDays = Math.max(1, Math.round((eDate - sDate) / 86400000) + 1);

    const zT = parseFloat(zT2m) || 0;
    const zP = parseFloat(zPrecip) || 0;
    const zS = parseFloat(zSol) || 0;
    const cDry = parseFloat(cdd) || 0;
    const totP = parseFloat(totalPrecip) || 0;

    // Biophysical response modeling
    let targetDelta = 0;
    let impactSeverity = '常态平稳 (Stable)';

    // Case 1: High Temp + High Rain (雨热同期 / 水热旺盛生长)
    if (zT > 0 && (zP > 0.2 || (totP > 35 && cDry <= 4))) {
      const heatFactor = Math.min(0.04, Math.max(0.01, zT * 0.02));
      const rainFactor = Math.min(0.05, Math.max(0.015, (zP > 0 ? zP : (totP / 60)) * 0.025));
      targetDelta = parseFloat((0.035 + heatFactor + rainFactor).toFixed(3));
      impactSeverity = targetDelta >= 0.06 ? '水热旺盛生长 (Vigorous Growth)' : '雨热良性促进 (Favorable Hydrothermal)';
    }
    // Case 2: High Temp + Drought (高温干旱 / 伏旱缺水胁迫)
    else if (zT > 0.4 && (zP < -0.3 || cDry >= 7 || totP < 10)) {
      const heatStress = Math.min(2, Math.max(0.5, zT));
      const dryStress = Math.min(2.5, Math.max(0.5, cDry / 5 + (zP < 0 ? Math.abs(zP) * 0.5 : 0)));
      targetDelta = -parseFloat((Math.min(0.18, 0.04 + heatStress * 0.025 + dryStress * 0.03)).toFixed(3));
      impactSeverity = targetDelta <= -0.09 ? '严重干旱萎蔫 (Severe Drought)' : '中度水分胁迫 (Moderate Drought)';
    }
    // Case 3: Cold / Frost (低温冷害 / 寒潮冻害)
    else if (zT < -1.0) {
      const coldStress = Math.abs(zT);
      targetDelta = -parseFloat((Math.min(0.14, 0.03 + coldStress * 0.035)).toFixed(3));
      impactSeverity = targetDelta <= -0.08 ? '严重低温冻害 (Severe Frost)' : '低温冷害受挫 (Cold Stress)';
    }
    // Case 4: Excessive Deluge + Overcast (持续暴雨渍涝 / 寡照抑制)
    else if (zP > 2.0 && (zS < -0.8 || totP > 150)) {
      targetDelta = -parseFloat((Math.min(0.08, 0.025 + (zP - 1.5) * 0.02)).toFixed(3));
      impactSeverity = '短时水渍寡照 (Waterlogging Stress)';
    }
    // Case 5: Moderate Rain
    else if (zP > 0.5) {
      targetDelta = parseFloat((Math.min(0.06, 0.02 + zP * 0.02)).toFixed(3));
      impactSeverity = '降水适度增润 (Moisture Surplus)';
    }
    // Case 6: Moderate Drought
    else if (zP < -0.5 || cDry >= 5) {
      targetDelta = -parseFloat((Math.min(0.06, 0.02 + Math.abs(zP) * 0.02)).toFixed(3));
      impactSeverity = '轻度干旱受抑 (Mild Drought)';
    }
    else {
      targetDelta = 0.008;
      impactSeverity = '常态平稳波动 (Stable Baseline)';
    }

    const preDays = 20;
    const postDays = 20;
    const timeline = [];
    const month = sDate.getMonth();
    // Climatological seasonal baseline
    const baseNdvi = 0.55 + 0.12 * Math.sin(((month - 3) / 12) * Math.PI * 2);

    for (let d = -preDays; d <= durationDays + postDays; d++) {
      const curDate = new Date(sDate.getTime() + d * 86400000);
      const dateStr = curDate.toISOString().slice(0, 10);
      let phase = 'pre';
      let ndviVal = baseNdvi + (Math.random() * 0.016 - 0.008);

      if (d >= 0 && d < durationDays) {
        phase = 'during';
        const progress = (d + 0.5) / durationDays;
        const curveShape = Math.sin(progress * Math.PI);
        ndviVal = baseNdvi + (targetDelta * curveShape) + (Math.random() * 0.014 - 0.007);
      } else if (d >= durationDays) {
        phase = 'post';
        const recov = (d - durationDays) / postDays;
        if (targetDelta >= 0) {
          // Positive greening persists and gradually normalizes
          ndviVal = baseNdvi + (targetDelta * Math.max(0, 1 - recov * 0.6)) + (Math.random() * 0.014 - 0.007);
        } else {
          // Negative stress gradually recovers
          ndviVal = (baseNdvi + targetDelta) + (Math.abs(targetDelta) * Math.min(1, recov * 1.1)) + (Math.random() * 0.014 - 0.007);
        }
      }

      ndviVal = Math.max(0.08, Math.min(0.92, ndviVal));

      timeline.push({
        date: dateStr,
        dayOffset: d,
        phase,
        ndvi: parseFloat(ndviVal.toFixed(3)),
        baselineNdvi: parseFloat(baseNdvi.toFixed(3))
      });
    }

    const preAvg = timeline.filter(t => t.phase === 'pre').reduce((s, t) => s + t.ndvi, 0) / preDays;
    const durAvg = timeline.filter(t => t.phase === 'during').reduce((s, t) => s + t.ndvi, 0) / durationDays;
    const postAvg = timeline.filter(t => t.phase === 'post').reduce((s, t) => s + t.ndvi, 0) / postDays;
    const deltaNdvi = parseFloat((durAvg - preAvg).toFixed(3));

    return res.json({
      location: { lat: latitude, lon: longitude },
      startDate: startDate.length === 8 ? `${startDate.slice(0,4)}-${startDate.slice(4,6)}-${startDate.slice(6,8)}` : startDate,
      endDate: endDate.length === 8 ? `${endDate.slice(0,4)}-${endDate.slice(4,6)}-${endDate.slice(6,8)}` : endDate,
      durationDays,
      preAvg: parseFloat(preAvg.toFixed(3)),
      duringAvg: parseFloat(durAvg.toFixed(3)),
      postAvg: parseFloat(postAvg.toFixed(3)),
      deltaNdvi,
      impactSeverity,
      timeline
    });
  } catch (err) {
    console.error('[vegetation-diff] error:', err);
    return res.status(500).json({ error: err.message || 'Vegetation diff calculation failed' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT ? Number(process.env.PORT) : 5173;
app.listen(port, () => {
  console.log(`[FloraCast3D-GeoAI] server running on http://localhost:${port}`);
  if (ENV.loadedFrom) console.log(`[FloraCast3D-GeoAI] env loaded from: ${ENV.loadedFrom}`);
  else console.log('[FloraCast3D-GeoAI] no .env file found (checked common locations)');
  console.log(`[FloraCast3D-GeoAI] research runtime: ${researchPython ? `openJiuwen (${researchPython})` : 'local-deterministic'}`);
  console.log(`[FloraCast3D-GeoAI] deepseek enabled: ${Boolean(process.env.DEEPSEEK_API_KEY)} (model: ${process.env.DEEPSEEK_MODEL || 'deepseek-flash'})`);
});
