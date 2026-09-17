import axios from 'axios';
import https from 'https';
const ipv4Agent = new https.Agent({ family: 4 });
import { getHistoricalWeather, buildClimatologicalBaseline } from './weather-data.js';
import { extractSlidingWindowEvents, scoreAndRankEvents } from './weather-features.js';

const CITY_COORDINATES = {
  '成都': { name: '成都市', lat: 30.6586, lng: 104.0648 },
  '成都市': { name: '成都市', lat: 30.6586, lng: 104.0648 },
  '青岛': { name: '青岛市', lat: 36.0671, lng: 120.3826 },
  '青岛市': { name: '青岛市', lat: 36.0671, lng: 120.3826 },
  '重庆': { name: '重庆市', lat: 29.5630, lng: 106.5516 },
  '重庆市': { name: '重庆市', lat: 29.5630, lng: 106.5516 },
  '北京': { name: '北京市', lat: 39.9042, lng: 116.4074 },
  '北京市': { name: '北京市', lat: 39.9042, lng: 116.4074 },
  '武汉': { name: '武汉市', lat: 30.5928, lng: 114.3055 },
  '武汉市': { name: '武汉市', lat: 30.5928, lng: 114.3055 },
  '上海': { name: '上海市', lat: 31.2304, lng: 121.4737 },
  '上海市': { name: '上海市', lat: 31.2304, lng: 121.4737 }
};

export async function parseQueryWithDeepSeek(queryText, currentAoi = null) {
  const prompt = `你是一位气象遥感与时空检索算法专家。请将用户的自然语言历史气象查询解析为严谨的 JSON 结构。

用户查询: "${queryText}"

当前地图中心位置（如用户未指定地点则默认以此处为准）:
${currentAoi ? JSON.stringify(currentAoi) : '经纬度: 36.0671, 120.3826 (青岛市)'}

请严格按如下 JSON 结构返回（不要包含任何 markdown 代码块外部的闲聊）:
{
  "location": {
    "name": "城市名或区域名",
    "lat": 纬度数字,
    "lng": 经度数字
  },
  "search_range": {
    "start_year": 1985至2024之间的年份,
    "end_year": 1985至2024之间的年份,
    "seasons": ["spring"|"summer"|"autumn"|"winter"中的一个或多个，若无指定留空数组],
    "months": [1至12的月份数组，若无特定月份留空数组]
  },
  "window_days": 持续时间天数(如7, 14, 30，两周则填14，默认14),
  "conditions": {
    "temperature": "high"|"low"|"normal",
    "precipitation": "high"|"low"|"normal",
    "radiation": "high"|"low"|"normal",
    "humidity": "high"|"low"|"normal",
    "weights": {
      "temp": 温度权重(0.0-1.0),
      "precip": 降水权重(0.0-1.0),
      "radiation": 辐射权重(0.0-1.0),
      "cdd": 连旱天数权重(0.0-1.0)
    }
  },
  "reference_event": {
    "has_reference": 布尔值(若用户提及'与2022年热浪相似'等基准参考则为true),
    "year": 年份或null,
    "month": 月份或null,
    "description": "参考事件描述"
  },
  "semantic_summary": "一句话结构化解读该查询"
}`;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured on the server.');
  }
  const apiBase = (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');

  try {
    const res = await axios.post(`${apiBase}/chat/completions`, {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.1,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: 'You are a precise JSON weather parser. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      httpsAgent: ipv4Agent,
      timeout: 30000
    });

    const raw = res.data?.choices?.[0]?.message?.content || '{}';
    const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.warn('[WeatherSearch] DeepSeek parsing error, using rule fallback:', err.message);
    
    // Fallback rule parsing
    let matchedCity = { name: '青岛市', lat: 36.0671, lng: 120.3826 };
    for (const [k, v] of Object.entries(CITY_COORDINATES)) {
      if (queryText.includes(k)) {
        matchedCity = v;
        break;
      }
    }

    const isHeat = queryText.includes('高温') || queryText.includes('热浪') || queryText.includes('暑');
    const isDry = queryText.includes('少雨') || queryText.includes('干旱') || queryText.includes('无雨');
    const isSpring = queryText.includes('春');
    const isSummer = queryText.includes('夏');

    let windowDays = 14;
    if (queryText.includes('一周') || queryText.includes('7天')) windowDays = 7;
    if (queryText.includes('一月') || queryText.includes('30天') || queryText.includes('四周')) windowDays = 30;

    return {
      location: currentAoi || matchedCity,
      search_range: {
        start_year: 1985,
        end_year: 2024,
        seasons: isSpring ? ['spring'] : (isSummer ? ['summer'] : []),
        months: []
      },
      window_days: windowDays,
      conditions: {
        temperature: isHeat ? 'high' : 'normal',
        precipitation: isDry ? 'low' : 'normal',
        radiation: isHeat ? 'high' : 'normal',
        humidity: isDry ? 'low' : 'normal',
        weights: { temp: 0.45, precip: 0.35, radiation: 0.1, cdd: 0.1 }
      },
      reference_event: queryText.includes('2022') ? { has_reference: true, year: 2022, month: 8, description: '2022年极端热浪' } : null,
      semantic_summary: `在 ${matchedCity.name} 检索历史气象库中符合条件的 ${windowDays} 天事件`
    };
  }
}

export async function executeWeatherSearch(queryText, options = {}) {
  const parsed = await parseQueryWithDeepSeek(queryText, options.currentAoi);
  const lat = parsed.location?.lat ?? 36.0671;
  const lng = parsed.location?.lng ?? 120.3826;
  const startYear = parsed.search_range?.start_year || 1985;
  const endYear = parsed.search_range?.end_year || 2024;

  const weatherRows = await getHistoricalWeather({ lat, lng, startYear, endYear });
  const baseline = buildClimatologicalBaseline(weatherRows);

  const events = extractSlidingWindowEvents(weatherRows, baseline, {
    windowDays: parsed.window_days || 14,
    startYear,
    endYear,
    seasons: parsed.search_range?.seasons,
    months: parsed.search_range?.months
  });

  const rankedEvents = scoreAndRankEvents(events, {
    conditions: parsed.conditions,
    reference_event: parsed.reference_event?.has_reference ? parsed.reference_event : null,
    topK: options.topK || 6
  });

  return {
    query: queryText,
    parsedCriteria: parsed,
    totalCandidateWindows: events.length,
    rankedEvents: rankedEvents.map(e => ({
      id: e.id,
      startDate: e.startDate,
      endDate: e.endDate,
      year: e.year,
      season: e.season,
      windowDays: e.windowDays,
      similarityScore: e.similarityScore,
      isExtreme: e.isExtreme,
      metrics: e.metrics,
      series: e.series
    }))
  };
}
