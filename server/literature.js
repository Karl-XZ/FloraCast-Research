import axios from 'axios';

function abstractFromIndex(index) {
  if (!index || typeof index !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words[position] = word;
  return words.filter(Boolean).join(' ').slice(0, 1600) || null;
}

export function normalizeOpenAlex(work) {
  const doi = work.doi?.replace(/^https?:\/\/doi\.org\//, '') || null;
  return {
    id: work.id || null,
    title: work.title || work.display_name || 'Untitled',
    year: work.publication_year || null,
    authors: (work.authorships || []).slice(0, 8).map((item) => item.author?.display_name).filter(Boolean),
    doi,
    url: doi ? `https://doi.org/${doi}` : work.primary_location?.landing_page_url || work.id || null,
    venue: work.primary_location?.source?.display_name || null,
    openAccess: Boolean(work.open_access?.is_oa),
    citedByCount: Number(work.cited_by_count || 0),
    abstract: abstractFromIndex(work.abstract_inverted_index),
    source: 'OpenAlex'
  };
}

export async function searchLiterature(protocol, options = {}) {
  if (protocol.mode === 'demo') return {
    status: 'fixture', query: 'land surface phenology vegetation index climate',
    records: [
      { id: 'doi:10.1016/j.rse.2006.09.013', title: 'A generalized model for simulating vegetation phenology in response to temperature and photoperiod', year: 2007, authors: ['M. A. White et al.'], doi: '10.1016/j.rse.2006.09.013', url: 'https://doi.org/10.1016/j.rse.2006.09.013', source: 'Curated fixture', openAccess: false },
      { id: 'MOD13-C61-guide', title: 'MODIS Vegetation Index User’s Guide (MOD13 Series), Collection 6.1', year: 2019, authors: ['K. Didan et al.'], doi: null, url: 'https://lpdaac.usgs.gov/documents/621/MOD13_User_Guide_V61.pdf', source: 'LP DAAC guide', openAccess: true }
    ],
    disclosure: '固定文献样例用于验证引用流程；元数据需要在正式报告前再次核验。'
  };
  const query = options.query || `${protocol.question} land surface phenology vegetation index climate`;
  try {
    const response = await axios.get('https://api.openalex.org/works', {
      params: { search: query, per_page: 8, select: 'id,doi,title,display_name,publication_year,authorships,primary_location,open_access,cited_by_count,abstract_inverted_index' },
      headers: { 'User-Agent': 'FloraCastResearch/1.0 (open-source research workflow)' }, timeout: 30_000
    });
    return {
      status: 'retrieved', query, records: (response.data?.results || []).map(normalizeOpenAlex),
      meta: { count: response.data?.meta?.count || 0, retrievedAt: new Date().toISOString(), provider: 'OpenAlex' },
      disclosure: '检索结果用于方法与背景线索；引用元数据和论断需由证据审查 Agent 核对原文。'
    };
  } catch (error) {
    return {
      status: 'unavailable', query, records: [], meta: { provider: 'OpenAlex', httpStatus: error.response?.status || null, retrievedAt: new Date().toISOString() },
      disclosure: 'OpenAlex 本次不可用；数据与计算阶段继续执行，但报告不会伪造文献记录。'
    };
  }
}

export function defaultResearchPlan(protocol) {
  return {
    version: 'research-plan/1.0', generatedBy: 'deterministic-template',
    objective: protocol.question,
    estimand: '所选点位、年份和有效观测上的地表植被指数季节变化与候选绿起日期',
    tasks: ['核对时空范围和数据可用性', '检索方法文献', '获取并质量筛选气候与植被数据', '运行两种物候方法', '审查结论与限制', '冻结数据复算'],
    decisionRules: ['无有效数据不生成结论', '质量状态未知时不声称通过 QA', '方法不一致时保留差异', '无独立观测时不声称外部验证', '不允许因果措辞'],
    expectedOutputs: ['数据清单', '逐年方法结果', '证据图', '可复算研究包', 'Notebook 与报告']
  };
}
