import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));

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
      hasQwenApiKey: Boolean(process.env.QWEN_API_KEY),
      hasAmapWebKey: Boolean(process.env.AMAP_WEB_KEY),
      qwenApiBase: qwenBase(),
      qwenTextModel: process.env.QWEN_TEXT_MODEL || process.env.QWEN_MODEL || 'qwen-plus',
      qwenVisionModel: process.env.QWEN_VISION_MODEL || 'qwen-vl-plus'
    }
  });
});

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
      raw: data
    });
  } catch (e) {
    console.error('[qwen-chat] error', e?.response?.data || e);
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

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT ? Number(process.env.PORT) : 5173;
app.listen(port, () => {
  console.log(`[FloraCast3D-GeoAI] server running on http://localhost:${port}`);
  if (ENV.loadedFrom) console.log(`[FloraCast3D-GeoAI] env loaded from: ${ENV.loadedFrom}`);
  else console.log('[FloraCast3D-GeoAI] no .env file found (checked common locations)');
});
