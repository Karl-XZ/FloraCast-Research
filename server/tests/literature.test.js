import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { normalizeOpenAlex, defaultResearchPlan, searchLiterature } from '../literature.js';

test('OpenAlex metadata normalization reconstructs abstract and preserves DOI', () => {
  const record = normalizeOpenAlex({ id: 'W1', doi: 'https://doi.org/10.1/test', title: 'Phenology', publication_year: 2024,
    authorships: [{ author: { display_name: 'A. Author' } }], cited_by_count: 2, open_access: { is_oa: true },
    abstract_inverted_index: { Spring: [0], advances: [1] } });
  assert.equal(record.doi, '10.1/test');
  assert.equal(record.abstract, 'Spring advances');
  assert.equal(record.authors[0], 'A. Author');
});
test('demo literature and research plan are explicit, deterministic fixtures', async () => {
  const protocol = { question: '一个足够长的研究问题', mode: 'demo' };
  assert.equal((await searchLiterature(protocol)).status, 'fixture');
  const plan = defaultResearchPlan(protocol);
  assert.equal(plan.generatedBy, 'deterministic-template');
  assert.ok(plan.decisionRules.some((rule) => rule.includes('独立观测')));
});

test('literature outage is disclosed and does not abort scientific data work', async () => {
  const original = axios.get;
  axios.get = async () => { throw Object.assign(new Error('rate limited'), { response: { status: 429 } }); };
  try {
    const protocol = { mode: 'live', question: 'a sufficiently detailed live research question' };
    const result = await searchLiterature(protocol);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.records.length, 0);
    assert.equal(result.meta.httpStatus, 429);
  } finally { axios.get = original; }
});
