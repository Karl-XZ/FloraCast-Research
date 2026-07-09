
/* =========================================================
 * PlantIDManager - Open model plant/flower recognition
 * =======================================================*/
const PlantIDManager = {
  _bound: false,
  _lastResult: null,

  init() {
    if (this._bound) return;
    this._bound = true;

    const runBtn = document.getElementById('plantid-run');
    const exportBtn = document.getElementById('plantid-export');

    if (runBtn) runBtn.addEventListener('click', () => this.identify());
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportJSON());

    const fileInput = document.getElementById('plantid-file');
    if (fileInput) fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (!f) return this._setPreviewUrl(null);
      const u = URL.createObjectURL(f);
      this._setPreviewUrl(u);
      // Revoke later to avoid leaks
      setTimeout(() => { try { URL.revokeObjectURL(u); } catch(_) {} }, 30000);
    });

    const providerSel = document.getElementById('plantid-provider');
    if (providerSel) providerSel.addEventListener('change', () => this._updateProviderHint());

    this._updateProviderHint();
  },

  _setStatus(msg, kind='') {

    const el = document.getElementById('plantid-status');
    if (!el) return;
    el.textContent = msg || '';
    el.dataset.kind = kind;
  },

  _setPreviewUrl(url) {
    const wrap = document.getElementById('plantid-preview-wrap');
    const img = document.getElementById('plantid-preview');
    if (!wrap || !img) return;
    if (!url) {
      wrap.classList.add('hidden');
      img.removeAttribute('src');
      return;
    }
    img.src = url;
    wrap.classList.remove('hidden');
  },

  _updateProviderHint() {
    const proj = document.getElementById('plantid-project');
    if (proj) proj.disabled = false;
  },

  async identify() {
    const fileInput = document.getElementById('plantid-file');
    const provider = document.getElementById('plantid-provider')?.value || 'qwen-vl';
    const organ = document.getElementById('plantid-organ')?.value || 'auto';
    const project = document.getElementById('plantid-project')?.value || 'all';

    const file = fileInput?.files?.[0];
    if (!file) {
      this._setStatus('Please choose an image file first.', 'warn');
      return;
    }

    try {
      const u = URL.createObjectURL(file);
      this._setPreviewUrl(u);
      setTimeout(() => { try { URL.revokeObjectURL(u); } catch(_) {} }, 30000);
    } catch (_) {}

    let loc = { lat: null, lng: null };
    try { loc = MapManager.getCurrentLocation?.() || loc; } catch (_) {}
    const payload = new FormData();
    payload.append('image', file);
    payload.append('provider', provider);
    payload.append('organ', organ);
    payload.append('project', project);
    if (loc?.lat != null && loc?.lng != null) {
      payload.append('lat', String(loc.lat));
      payload.append('lng', String(loc.lng));
    }

    this._setStatus('Uploading image & running Qwen-VL identification…', 'info');
    this._renderResults(null);

    try {
      const res = await fetch('/api/plant/identify', {
        method: 'POST',
        body: payload
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      this._lastResult = json;
      this._setStatus(`Done. Provider: ${json.provider}.`, 'ok');
      this._renderResults(json);
    } catch (e) {
      console.warn('[PlantID] error', e);
      this._setStatus(`Error: ${e?.message || e}`, 'danger');
    }
  },


  async identifyFromUrl(imageUrl) {
    const provider = document.getElementById('plantid-provider')?.value || 'qwen-vl';
    const organ = document.getElementById('plantid-organ')?.value || 'auto';
    const project = document.getElementById('plantid-project')?.value || 'all';

    if (!imageUrl) {
      this._setStatus('Missing image URL.', 'warn');
      return;
    }

    let loc = { lat: null, lng: null };
    try { loc = MapManager.getCurrentLocation?.() || loc; } catch (_) {}

    this._setPreviewUrl(imageUrl);

    this._setStatus('Sending selected photo for Qwen-VL identification…', 'info');
    this._renderResults(null);

    try {
      const res = await fetch('/api/plant/identify_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: imageUrl,
          provider,
          organ,
          project,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null
        })
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      this._lastResult = json;
      this._setStatus(`Done. Provider: ${json.provider}.`, 'ok');
      this._renderResults(json);
    } catch (e) {
      console.warn('[PlantID] identifyFromUrl error', e);
      this._setStatus(`Error: ${e?.message || e}`, 'danger');
    }
  },
  _renderResults(result) {
    const host = document.getElementById('plantid-results');
    if (!host) return;
    host.innerHTML = '';

    if (!result) return;
    const arr = result.results || [];
    if (!arr.length) {
      host.innerHTML = '<div class="note">No results returned. Try a clearer image or a different organ.</div>';
      return;
    }

    arr.slice(0, 8).forEach((r, idx) => {
      const div = document.createElement('div');
      div.className = 'result';

      const common = (r.commonNames && r.commonNames.length) ? ` — ${r.commonNames[0]}` : '';
      const title = `${idx+1}. ${r.scientificName || r.scientificNameWithoutAuthor || 'Unknown'}${common}`;

      const metaParts = [];
      if (typeof r.score === 'number') metaParts.push(`score: ${(r.score*100).toFixed(1)}%`);
      if (r.family) metaParts.push(`family: ${r.family}`);
      if (r.genus) metaParts.push(`genus: ${r.genus}`);
      if (r.gbifId) metaParts.push(`GBIF: ${r.gbifId}`);
      if (r.powoId) metaParts.push(`POWO: ${r.powoId}`);
      if (r.note) metaParts.push(r.note);

      div.innerHTML = `
        <div class="name">${escapeHtml(title)}</div>
        <div class="meta">${escapeHtml(metaParts.join(' · '))}</div>
        <div class="bar"><div style="width:${Math.max(2, Math.round((r.score||0)*100))}%"></div></div>
      `;
      host.appendChild(div);
    });

    const note = document.createElement('div');
    note.className = 'note';
    note.style.marginTop = '10px';
    note.textContent = result.raw?.caution || 'Tip: for better accuracy, crop the plant organ (flower/leaf) and avoid busy backgrounds.';
    host.appendChild(note);
  },

  exportJSON() {
    if (!this._lastResult) {
      this._setStatus('Nothing to export yet. Run an identification first.', 'warn');
      return;
    }

    const blob = new Blob([JSON.stringify(this._lastResult, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plant-id_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);

    this._setStatus('Exported JSON.', 'ok');
  }
};

// Allow quick identification from Flower Photos popups
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('[data-action="identify-photo"]');
  if (!btn) return;
  e.preventDefault();

  const url = btn.getAttribute('data-url');
  if (!url) return;

  // Open Plant ID panel
  try {
    if (window.UIManager && typeof window.UIManager.openPanel === 'function') {
      window.UIManager.openPanel('plantid');
    } else {
      // Fallback: open panel by toggling classes
      document.querySelectorAll('.panel.open').forEach(p => p.classList.remove('open'));
      const p = document.getElementById('plantid-panel');
      if (p) p.classList.add('open');
      const ov = document.getElementById('overlay');
      if (ov) ov.classList.add('active');
    }
  } catch (_) {}

  // Run identification (give the panel a moment to open & layout)
  setTimeout(() => {
    try { PlantIDManager.init(); } catch (_) {}
    try { PlantIDManager._setPreviewUrl?.(url); } catch (_) {}
    PlantIDManager.identifyFromUrl(url);
  }, 120);
});

// Small local util (avoid dependency)
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[ch]));
}
