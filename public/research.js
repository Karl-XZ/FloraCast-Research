const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const labels = { queued: '等待执行', running: '执行中', paused: '已暂停', completed: '已完成', failed: '失败', interrupted: '已中断', cancelled: '已取消', supported: '有支持证据', unresolved: '待验证', context: '文献线索' };
const titles = { projects: ['RESEARCH PROJECTS', '研究项目'], map: ['AREA OF INTEREST', '研究区选择'], data: ['DATA MANIFEST', '数据来源与覆盖'], experiments: ['EXPERIMENT RESULTS', '计算结果与验证'], evidence: ['EVIDENCE REVIEW', '结论与来源'], report: ['REPORT & REPRODUCTION', '报告与复现'], runs: ['EXECUTION HISTORY', '执行阶段与日志'] };
let current = null, view = 'projects', stream = null, stages = [], researchMap = null, researchMarker = null, comparison = null;
async function api(path, options = {}) {
  const response = await fetch(`/api/research${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function notice(message = '') { $('#notice').hidden = !message; $('#notice').textContent = message; }
function badge(status) { return `<span class="badge ${esc(status)}">${esc(labels[status] || status)}</span>`; }
function ndviChart(series = []) {
  const values = series.filter((row) => Number.isFinite(row.ndvi));
  if (values.length < 2) return '<div class="empty">有效 NDVI 少于 2 个，无法绘制序列。</div>';
  const width = 900, height = 230, left = 54, top = 20, plotWidth = width - 76, plotHeight = height - 58;
  const min = Math.min(...values.map((row) => row.ndvi)), max = Math.max(...values.map((row) => row.ndvi)), span = Math.max(.05, max - min);
  const points = values.map((row, index) => `${left + index / (values.length - 1) * plotWidth},${top + (max - row.ndvi) / span * plotHeight}`).join(' ');
  return `<figure class="series-chart"><figcaption>质量筛选后的 NDVI 观测序列</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="NDVI 从 ${esc(values[0].date)} 到 ${esc(values.at(-1).date)} 的折线图"><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"/><line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}"/><polyline points="${points}"/><text x="8" y="${top + 8}">${max.toFixed(3)}</text><text x="8" y="${top + plotHeight}">${min.toFixed(3)}</text><text x="${left}" y="${height - 8}">${esc(values[0].date)}</text><text x="${left + plotWidth}" y="${height - 8}" text-anchor="end">${esc(values.at(-1).date)}</text></svg></figure>`;
}
function visibleReport(result, protocol) {
  const lines = [`# ${protocol.aoi.name} 生态与物候研究`, '', `研究问题：${protocol.question}`, `运行：${protocol.period.startYear}-${protocol.period.endYear} / ${protocol.mode === 'demo' ? '固定测试数据' : '实时公开数据'} / ${result.runtime}`, '', '## 结果', ''];
  const supported = result.evidence.claims.filter((claim) => claim.status === 'supported');
  supported.forEach((claim) => lines.push(`- ${claim.statement} [${claim.id}]`));
  if (!supported.length) lines.push('无支持状态结论。');
  lines.push('', '## 数据', '');
  result.datasets.manifests.forEach((item) => lines.push(`- ${item.source}: ${item.status}; ${item.coverage?.start || 'NA'} - ${item.coverage?.end || 'NA'}; checksum=${item.checksum || 'NA'}`));
  lines.push('', '## 地表物候', '');
  for (const year of result.summaries.phenology?.years || []) {
    lines.push(`### ${year.year}`, `有效观测：${year.observations}; QA：${year.qaStatus}; 状态：${year.status}`);
    for (const method of year.methods) lines.push(`- ${method.name}: ${method.date}; DOY ${method.dayOfYear}${method.fittingRmse !== null ? `; RMSE ${method.fittingRmse}` : ''}`);
  }
  lines.push('', '## 文献', '');
  for (const [index, record] of (result.literature?.records || []).entries()) lines.push(`[L${index + 1}] ${record.title}. ${record.authors?.join(', ') || ''} (${record.year || 'n.d.'}). ${record.doi ? `doi:${record.doi}` : record.url || ''}`);
  lines.push('', '## 复现', '', `inputHash: ${result.reproduction.inputHash}`, `outputHash: ${result.reproduction.outputHash}`);
  return lines.join('\n');
}
function selectView(next) {
  view = next;
  document.querySelectorAll('[data-view]').forEach((button) => { button.removeAttribute('aria-current'); if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); });
  $('#view-kicker').textContent = titles[view][0]; $('#view-title').textContent = titles[view][1];
  $('#projects-view').hidden = view !== 'projects'; $('#detail-view').hidden = view === 'projects';
  if (view !== 'projects') renderDetail();
}
async function refreshProjects() {
  const { runs } = await api('/runs');
  const visible = runs.slice(0, 12);
  $('#project-list').innerHTML = runs.length ? visible.map((run) => `<button class="project-row" data-run="${esc(run.id)}"><div><h3>${esc(run.protocol.aoi.name)}</h3><p>${esc(run.protocol.question)}</p><p>${esc(run.protocol.period.startYear)}–${esc(run.protocol.period.endYear)} · ${run.protocol.mode === 'demo' ? '固定测试数据' : '实时数据'} · ${esc(new Date(run.createdAt).toLocaleString('zh-CN'))}</p></div>${badge(run.status)}</button>`).join('') + (runs.length > visible.length ? `<p class="helper">最近 ${visible.length} / 全部 ${runs.length}</p>` : '') : '<div class="empty">无运行记录</div>';
}
async function openRun(id) {
  stream?.close();
  comparison = null;
  current = await api(`/runs/${encodeURIComponent(id)}`);
  $('#research-notes-link').href = `research-notes.html?run=${encodeURIComponent(id)}`;
  selectView('runs');
  if (['running', 'queued', 'paused'].includes(current.status)) {
    stream = new EventSource(`/api/research/runs/${encodeURIComponent(id)}/events`);
    stream.onmessage = async () => {
      if (current?.id !== id) return;
      try {
        const updated = await api(`/runs/${encodeURIComponent(id)}`);
        if (current?.id !== id) return;
        current = updated; renderDetail();
        if (!['running', 'queued', 'paused'].includes(current.status)) { stream?.close(); refreshProjects().catch((e) => notice(e.message)); }
      } catch (e) { notice(e.message); }
    };
  }
}
function renderDetail() {
  researchMap?.remove(); researchMap = null; researchMarker = null;
  $('#run-actions').hidden = !current;
  $('.run-banner').hidden = !current;
  if (!current && view !== 'map') { $('#detail-content').innerHTML = '<div class="empty">未选择运行</div>'; return; }
  if (view === 'map') {
    const lat = current?.protocol?.aoi?.lat ?? 36.0671, lng = current?.protocol?.aoi?.lng ?? 120.3826;
    $('#detail-content').innerHTML = `<div class="map-workspace"><div id="research-map" class="research-map" aria-label="可交互三维研究地图"></div><aside class="map-panel"><p class="eyebrow">AOI</p><h3>${current ? '研究区中心点' : '选择中心点'}</h3><p class="helper">点击地球表面设置坐标；半径在研究协议中设置。</p><p class="map-coordinates"><span id="map-lat">${lat.toFixed(5)}</span>° N<br><span id="map-lng">${lng.toFixed(5)}</span>° E</p><button class="primary" id="use-map-location">使用此坐标 →</button></aside></div>`;
    initialiseResearchMap(lat, lng);
    return;
  }
  const p = current.protocol, result = current.result;
  $('#run-id').textContent = current.id;
  $('#run-question').textContent = p.question;
  $('#run-scope').textContent = `${p.aoi.name} · ${p.aoi.lat}, ${p.aoi.lng} · ${p.period.startYear}–${p.period.endYear} · ${p.mode === 'demo' ? '固定测试数据' : '实时公开数据'} · ${current.runtime}`;
  $('#run-status').textContent = labels[current.status] || current.status;
  $('#run-status').className = `badge ${current.status}`;
  $('#pause-run').hidden = current.status !== 'running';
  $('#resume-run').hidden = current.status !== 'paused';
  $('#cancel-run').hidden = !['running', 'queued', 'paused'].includes(current.status);
  $('#reproduce-run').disabled = !result;
  $('#compare-run').disabled = !result;
  $('#export-run').href = `/api/research/runs/${current.id}/export`;
  $('#export-notebook').href = `/api/research/runs/${current.id}/export?format=notebook`;
  let html = '';
  if (view === 'runs') {
    html = result?.planning ? `<article class="claim"><span class="badge context">研究计划</span><p>${esc(result.planning.objective)}</p><p class="helper">估计目标：${esc(result.planning.estimand)}</p></article>` : '';
    html += `<div class="stages">${stages.map((stage, i) => { const events = (current.events || []).filter((e) => e.stageId === stage.id); const last = events.at(-1); return `<div class="stage"><span class="stage-index">${String(i + 1).padStart(2, '0')}</span><div>${esc(stage.label)}<small>${esc(stage.role)} · ${esc(stage.description)}</small></div>${badge(last?.status || '待执行')}</div>`; }).join('')}</div>`;
    if (current.error) html += `<p class="error">${esc(current.error.message)}</p>`;
  } else if (!result) html = '<div class="empty">结果待生成；进度见运行记录。</div>';
  else if (view === 'data') html = `<div class="table-scroll"><table><thead><tr><th>数据源</th><th>状态与覆盖</th><th>来源与完整性</th></tr></thead><tbody>${result.datasets.manifests.map((m) => `<tr><td>${esc(m.source)}<p>${esc(m.role)}</p></td><td>${esc(m.status)}<p>${esc(m.coverage?.start)} → ${esc(m.coverage?.end)}</p></td><td>${esc(m.license)}<p><code>${esc(m.checksum)}</code></p>${m.error ? `<p class="error">${esc(m.error)}</p>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  else if (view === 'experiments') {
    const { power, vegetation } = result.summaries;
    html = `<div class="metric-grid"><div class="metric"><small>有效温度观测</small><strong>${esc(power.validTemperatureDays)}</strong><span>天</span></div><div class="metric"><small>平均温度</small><strong>${esc(power.meanTemperatureC ?? '无数据')}</strong><span>°C</span></div><div class="metric"><small>首末 NDVI 变化</small><strong>${esc(vegetation.change ?? '无数据')}</strong></div></div>${ndviChart(result.datasets.vegetation)}<div class="table-scroll"><table><thead><tr><th>观测日期</th><th>NDVI</th><th>EVI</th></tr></thead><tbody>${result.datasets.vegetation.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.ndvi)}</td><td>${esc(r.evi)}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (view === 'evidence') html = result.evidence.claims.map((c) => `<article class="claim">${badge(c.status)}<p>${esc(c.statement)}</p><details><summary>证据来源</summary><p class="helper">${c.supports.map(esc).join('、') || '未登记'}</p><code>${esc(c.id)}</code></details></article>`).join('');
  else if (view === 'report') html = `${current.reproductionComparison ? `<p class="notice">冻结复算：输入${current.reproductionComparison.inputsEqual ? '一致' : '不一致'}，输出${current.reproductionComparison.outputsEqual ? '一致' : '不一致'}。</p>` : ''}<pre class="report-paper">${esc(visibleReport(result, p))}</pre>`;
  if (view === 'experiments' && result?.summaries?.phenology) {
    const phen = result.summaries.phenology;
    html += `<div class="section-heading"><h2>逐年地表物候 · 方法比较</h2></div><div class="table-scroll"><table><thead><tr><th>年份 / 有效观测</th><th>平滑阈值法</th><th>双逻辑拟合</th><th>QA / 状态</th></tr></thead><tbody>${phen.years.map((year) => `<tr><td>${year.year} / ${year.observations}</td><td>${esc(year.methods.find((m) => m.name.startsWith('smoothed'))?.date || '未估计')}</td><td>${esc(year.methods.find((m) => m.name.startsWith('double'))?.date || '未估计')}</td><td>${esc(year.qaStatus)} / ${esc(year.status)}${year.methodDifferenceDays !== null && year.methodDifferenceDays !== undefined ? `<p>方法差异 ${esc(year.methodDifferenceDays)} 天</p>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const validation = current.groundValidation;
    html += `<section class="validation-card"><div class="section-heading"><h2>地面观测验证</h2></div><p class="helper">CSV 字段：date,species,source。输出：各方法 MAE、偏差和 RMSE。</p><textarea id="ground-csv" rows="4" placeholder="date,species,source&#10;2024-03-22,Quercus robur,field campaign"></textarea><button class="quiet" id="validate-ground">导入并计算</button><p id="validation-error" class="error" hidden></p>${validation ? `<p class="notice">状态：${esc(validation.status)}；提交 ${validation.submitted} 条；可比较 ${validation.comparablePairs} 对；校验和 <code>${esc(validation.checksum)}</code></p>${validation.methods.length ? `<div class="table-scroll"><table><thead><tr><th>方法</th><th>样本</th><th>MAE / 偏差 / RMSE（天）</th></tr></thead><tbody>${validation.methods.map((m) => `<tr><td>${esc(m.method)}</td><td>${m.samples}</td><td>${m.maeDays} / ${m.biasDays} / ${m.rmseDays}</td></tr>`).join('')}</tbody></table></div>` : ''}` : ''}</section>`;
  }
  if (view === 'runs' && comparison) html += `<div class="section-heading"><h2>跨运行比较</h2></div><div class="table-scroll"><table><thead><tr><th>运行</th><th>AOI / 时段</th><th>均温</th><th>NDVI 首末差</th><th>可估计年份</th><th>输入是否同源</th></tr></thead><tbody>${comparison.rows.map((row) => `<tr><td>${row.isSelected ? '● ' : ''}${esc(row.id)}</td><td>${esc(row.aoi)} · ${esc(row.period)} · ${esc(row.mode)}</td><td>${esc(row.meanTemperatureC ?? '无数据')}</td><td>${esc(row.ndviChange ?? '无数据')}</td><td>${row.estimatedYears}</td><td>${row.inputHash === current.result.reproduction.inputHash ? '相同' : '不同'}</td></tr>`).join('')}</tbody></table></div>`;
  $('#detail-content').innerHTML = html;
  $('#validate-ground')?.addEventListener('click', submitGroundValidation);
}
async function submitGroundValidation() {
  const error = $('#validation-error'); error.hidden = true;
  try {
    const lines = $('#ground-csv').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines[0]?.toLowerCase().startsWith('date,')) lines.shift();
    const observations = lines.map((line) => { const [date, species = '', ...source] = line.split(','); return { date: date.trim(), species: species.trim(), source: source.join(',').trim() }; });
    await api(`/runs/${current.id}/validate`, { method: 'POST', body: JSON.stringify({ observations }) });
    current = await api(`/runs/${current.id}`); renderDetail();
  } catch (cause) { error.textContent = cause.message; error.hidden = false; }
}
function initialiseResearchMap(lat, lng) {
  const container = $('#research-map');
  if (!window.L || !window.Cesium) { container.innerHTML = '<div class="map-fallback">三维地图资源暂时不可用。仍可在创建研究时直接输入经纬度。</div>'; return; }
  try {
    researchMap = L.map('research-map', { center: [lat, lng], zoom: 4 });
    L.tileLayer('https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', { attribution: '© Amap' }).addTo(researchMap);
    researchMarker = L.marker([lat, lng]).addTo(researchMap).bindPopup('研究区中心点');
    researchMap.on('click', ({ latlng }) => {
      const nextLat = Math.max(-90, Math.min(90, latlng.lat));
      const nextLng = ((latlng.lng + 540) % 360) - 180;
      researchMarker.setLatLng([nextLat, nextLng]);
      $('#map-lat').textContent = nextLat.toFixed(5); $('#map-lng').textContent = nextLng.toFixed(5);
    });
    $('#use-map-location').addEventListener('click', () => {
      const form = $('#protocol-form');
      form.elements.lat.value = $('#map-lat').textContent; form.elements.lng.value = $('#map-lng').textContent;
      if (current) form.elements.locationName.value = current.protocol.aoi.name;
      $('#protocol-dialog').showModal();
    });
  } catch (error) { container.innerHTML = `<div class="map-fallback">地图初始化失败：${esc(error.message)}</div>`; }
}
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.view)));
['#new-project', '#start-project'].forEach((id) => $(id).addEventListener('click', () => $('#protocol-dialog').showModal()));
$('#close-dialog').addEventListener('click', () => $('#protocol-dialog').close());
$('#refresh').addEventListener('click', () => refreshProjects().catch((e) => notice(e.message)));
$('#project-list').addEventListener('click', (e) => { const row = e.target.closest('[data-run]'); if (row) openRun(row.dataset.run).catch((err) => notice(err.message)); });
$('#protocol-form').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#submit-protocol').disabled = true; $('#form-error').hidden = true;
  try { const input = Object.fromEntries(new FormData(e.target)); const run = await api('/runs', { method: 'POST', body: JSON.stringify(input) }); $('#protocol-dialog').close(); await refreshProjects(); await openRun(run.id); }
  catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
  finally { $('#submit-protocol').disabled = false; }
});
$('#cancel-run').addEventListener('click', async () => { try { await api(`/runs/${current.id}/actions`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) }); await openRun(current.id); } catch (e) { notice(e.message); } });
$('#pause-run').addEventListener('click', async () => { try { await api(`/runs/${current.id}/actions`, { method: 'POST', body: JSON.stringify({ action: 'pause' }) }); await openRun(current.id); } catch (e) { notice(e.message); } });
$('#resume-run').addEventListener('click', async () => { try { await api(`/runs/${current.id}/actions`, { method: 'POST', body: JSON.stringify({ action: 'resume' }) }); await openRun(current.id); } catch (e) { notice(e.message); } });
$('#compare-run').addEventListener('click', async () => { try { comparison = await api(`/runs/${current.id}/compare`); selectView('runs'); } catch (e) { notice(e.message); } });
$('#reproduce-run').addEventListener('click', async () => {
  $('#reproduce-run').disabled = true;
  $('#run-status').textContent = '正在创建复算任务';
  try { const run = await api(`/runs/${current.id}/reproduce`, { method: 'POST', body: '{}' }); await openRun(run.id); await refreshProjects(); }
  catch (e) { notice(e.message); renderDetail(); }
});
try { const capabilities = await api('/capabilities'); stages = capabilities.stages; $('#connection').textContent = '科研服务已连接'; await refreshProjects(); const requestedRun = new URLSearchParams(location.search).get('run'); if (requestedRun) await openRun(requestedRun); }
catch (error) { $('#connection').textContent = '科研服务未连接'; notice(error.message); }
