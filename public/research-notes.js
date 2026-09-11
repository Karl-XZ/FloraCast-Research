const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const runId = new URLSearchParams(location.search).get('run');
if (runId) {
  $('#notes-back').href = `research.html?run=${encodeURIComponent(runId)}`;
  try {
    const response = await fetch(`/api/research/runs/${encodeURIComponent(runId)}`);
    const run = await response.json();
    if (!response.ok) throw new Error(run.error || `HTTP ${response.status}`);
    const result = run.result;
    const groups = [];
    const add = (title, items) => { const values = [...new Set((items || []).filter(Boolean).map(String))]; if (values.length) groups.push({ title, values }); };
    add('协议规则', [...(result?.planning?.decisionRules || []), ...(result?.planning?.cautions || [])]);
    add('数据与空间', [result?.datasets?.disclosure, result?.geo?.warning]);
    add('物候方法', [...(result?.summaries?.phenology?.limitations || []), ...(result?.summaries?.phenology?.years || []).flatMap((year) => year.reasons || [])]);
    add('证据审查', (result?.evidence?.claims || []).flatMap((claim) => claim.limits || []));
    add('文献', [result?.literature?.disclosure]);
    add('外部验证', [run.groundValidation?.disclosure]);
    $('#notes-content').innerHTML = `<p><code>${esc(run.id)}</code></p>${groups.map((group) => `<div class="notes-group"><h3>${esc(group.title)}</h3><ul>${group.values.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>`).join('')}`;
  } catch (error) { $('#notes-content').textContent = error.message; }
}
