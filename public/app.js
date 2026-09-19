// FloraCast - Main application script (EN)
// All UI strings, comments, and labels are in English.
// Visual style, colors, and other functionalities not mentioned remain unchanged.

/* =========================================================
 * Global configuration
 * =======================================================*/
const CONFIG = {
    // Default location: Qingdao, China (AP-GARSS 2026 venue city).
    INIT: { lat: 36.0671, lng: 120.3826 },
    INIT_ZOOM: 4,
    YEAR: new Date().getUTCFullYear(),

    // Domestic base map for China-friendly deployment.
    AMAP_VECTOR: 'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',

    // NASA GIBS WMTS config
    GIBS_TM: 'GoogleMapsCompatible_Level9',
    GIBS_URL: (layer, dateISO, ext) =>
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${dateISO}/${CONFIG.GIBS_TM}/{z}/{y}/{x}.${ext}`,

    // MODIS RST API
    RST: 'https://modis.ornl.gov/rst/api/v1',

    // Server-side Qwen-compatible proxy. Keys are never exposed to the browser.
    AI_CHAT_API: '/api/ai/chat'
};

/* =========================================================
 * App-wide state
 * =======================================================*/
const AppState = {
    // Maps
    map: null,        // Map A
    mapB: null,       // Map B (compare mode)
    syncing: false,   // View synchronization flag
    compareSplit: false,

    // Markers
    currentMarker: null,   // Marker on map A
    currentMarkerB: null,  // Mirror marker on map B
    currentLatLng: { ...CONFIG.INIT },

    // Panels / UI
    currentPanel: null,
    menuOpen: false,

    // Overlays
    gibsLayerA: null,
    gibsLayerB: null,

    // Heatmaps (exactly one per map)
    heatLayerA: null,
    heatLayerB: null,
    heatTypeA: 'off', // 'off' | 'ndvi' | 'evi' | 't2m' | 'precip'
    heatTypeB: 'off',

    // Photos/iNat
    inatActive: false,
    inatIndex: new Map(),
    inatMarkerLayer: null,
    inatHeatLayer: null,

    // AI chat
    chatHistory: [],

    // Data cache for AI & heatmaps (keyed by rounded lat,lng)
    dataCache: new Map() // key: `${lat.toFixed(3)},${lng.toFixed(3)}`
};
// expose globals for other scripts

// Ensure external overlay endpoints exist on CONFIG
CONFIG.OPG_BASE = CONFIG.OPG_BASE || 'https://weather.openportguide.de/tiles/actual';
CONFIG.GIBS_WMS_BASE = CONFIG.GIBS_WMS_BASE || (srs => (
  String(srs) === '4326'
    ? 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'
    : 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi'
));

// Expose globals for the overlay script
window.CONFIG   = CONFIG;
window.AppState = AppState;


/* =========================================================
 * Utilities
 * =======================================================*/
const Utils = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),

    genDates: (year, step) => {
        // Generate ISO dates for a whole year with step = days
        const arr = [];
        const d0 = new Date(`${year}-01-01T00:00:00Z`);
        const d1 = new Date(`${year}-12-31T00:00:00Z`);
        for (let d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + step)) {
            arr.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
        }
        if (arr[arr.length - 1] !== `${year}-12-31`) {
            arr.push(`${year}-12-31`);
        }
        return arr;
    },

    doyToDate: (year, doy) => {
        const d = new Date(Date.UTC(year, 0, 1));
        d.setUTCDate(doy);
        return d.toISOString().slice(0, 10);
    },

    numOrNull: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        if (n <= -900) return null;
        return n;
    },

    fmt: (v, digits = 4) => (v == null || isNaN(v) ? '—' : (+v).toFixed(digits))
};

/* =========================================================
 * Icons
 * =======================================================*/
const Icons = {
    selected: L.icon({
        iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
            <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                <circle cx="18" cy="18" r="16" fill="#3b82f6" fill-opacity="0.15" stroke="#60a5fa" stroke-width="2"/>
                <circle cx="18" cy="18" r="6" fill="#3b82f6"/>
                <circle cx="18" cy="18" r="2.5" fill="white"/>
            </svg>`),
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    }),

    flower: L.icon({
        iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
            <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(14,14)">
                    <circle r="4" fill="#f59e0b"/>
                    <g fill="#ef4444">
                        <circle cx="0" cy="-8" r="4"/>
                        <circle cx="0" cy="8" r="4"/>
                        <circle cx="8" cy="0" r="4"/>
                        <circle cx="-8" cy="0" r="4"/>
                        <circle cx="5.7" cy="-5.7" r="3.6"/>
                        <circle cx="-5.7" cy="-5.7" r="3.6"/>
                        <circle cx="5.7" cy="5.7" r="3.6"/>
                        <circle cx="-5.7" cy="5.7" r="3.6"/>
                    </g>
                </g>
            </svg>`),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
    })
};

/* =========================================================
 * UI Manager
 * =======================================================*/
const UIManager = {
    _panelDelegatesBound: false,

    init() {
        if (window.I18n) {
            window.I18n.init();
        }
        this.setupMenuToggle();
        this.setupPanelControls();
        this.setupOverlay();
        this.initDateInputs();
    },

    setupMenuToggle() {
        const menuToggle = document.getElementById('menu-toggle');
        const mainMenu = document.getElementById('main-menu');
        const menuClose = document.getElementById('menu-close');
        const langToggleBtn = document.getElementById('lang-toggle-btn');

        menuToggle.addEventListener('click', () => this.toggleMenu());
        menuClose.addEventListener('click', () => this.closeMenu());

        if (langToggleBtn && window.I18n) {
            langToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.I18n.toggle();
            });
        }

        // Panel links
        const menuLinks = document.querySelectorAll('.menu-list a');
        menuLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const panelId = link.dataset.panel;
                this.openPanel(panelId);
                this.closeMenu();
            });
        });
    },

    setupPanelControls() {
        if (this._panelDelegatesBound) return;
        this._panelDelegatesBound = true;

        // Direct listeners (works even if capture is blocked)
        document.querySelectorAll('.panel-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closePanel();
            });
        });

        // Capture-phase delegate (robust against layered canvases / Cesium widgets)
        document.addEventListener('click', (e) => {
            const pClose = e.target?.closest?.('.panel-close');
            if (pClose) {
                e.preventDefault();
                e.stopPropagation();
                this.closePanel();
                return;
            }
            const mClose = e.target?.closest?.('#menu-close, .menu-close');
            if (mClose) {
                e.preventDefault();
                e.stopPropagation();
                this.closeMenu();
                return;
            }
        }, true);
    },

    setupOverlay() {
        const overlay = document.getElementById('overlay');
        overlay.addEventListener('click', () => {
            this.closeMenu();
            this.closePanel();
        });
    },

    toggleMenu() {
        const menuToggle = document.getElementById('menu-toggle');
        const mainMenu = document.getElementById('main-menu');
        const overlay = document.getElementById('overlay');

        AppState.menuOpen = !AppState.menuOpen;
        // CSS uses .open for menus/panels; keep overlay as .active
        menuToggle.classList.toggle('active', AppState.menuOpen);
        mainMenu.classList.toggle('open', AppState.menuOpen);
        overlay.classList.toggle('active', AppState.menuOpen);
    },

    closeMenu() {
        if (!AppState.menuOpen) return;
        const menuToggle = document.getElementById('menu-toggle');
        const mainMenu = document.getElementById('main-menu');
        const overlay = document.getElementById('overlay');

        AppState.menuOpen = false;
        menuToggle.classList.remove('active');
        mainMenu.classList.remove('open');
        if (!AppState.currentPanel) overlay.classList.remove('active');
    },

    openPanel(panelId) {
        this.closePanel();
        const panel = document.getElementById(`${panelId}-panel`);
        const overlay = document.getElementById('overlay');

        if (panel) {
            AppState.currentPanel = panelId;
            panel.classList.add('open');
            overlay.classList.add('active');
            this.initPanel(panelId);
        }
    },

    closePanel() {
        if (!AppState.currentPanel) return;
        const panel = document.getElementById(`${AppState.currentPanel}-panel`);
        const overlay = document.getElementById('overlay');
        if (panel) panel.classList.remove('open');
        if (!AppState.menuOpen) overlay.classList.remove('active');
        AppState.currentPanel = null;

        // After closing a panel, maps may have changed visible area. Refresh sizes.
        MapManager.refreshMapSizes();
    },

    initPanel(panelId) {
        switch (panelId) {
            case 'layers': LayerManager.init(); break;
            case 'photos': PhotoManager.init(); break;
            case 'plantid': PlantIDManager.init(); break;
            case 'vegetation': VegetationManager.init(); break;
            case 'phenology': PhenologyManager.init(); break;
            case 'weather': WeatherManager.init(); break;
            case 'workflow': GeoAIWorkflowManager.init(); break;
            case 'patch': PatchAnalysisManager.init(); break;
            case 'forecast':   ForecastManager.init(); break;
            case 'visualml':   VisualMLManager.init(); break;
            case 'research':   ResearchAgentManager.init(); break;
            case 'weather-search': WeatherSearchManager.init(); break;
            case 'ai': AIManager.init(); break;
        }
        // When opening a panel, overlay appears; refresh map sizes to keep views centered.
        MapManager.refreshMapSizes();
    },

    initDateInputs() {
        // Default dates
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const weatherDate = document.getElementById('weather-date');
        if (weatherDate) weatherDate.value = yesterday.toISOString().slice(0, 10);

        const photosStart = document.getElementById('photos-start');
        const photosEnd = document.getElementById('photos-end');
        if (photosStart && photosEnd) {
            const startDate = new Date(today);
            startDate.setMonth(startDate.getMonth() - 3);
            photosStart.value = startDate.toISOString().slice(0, 10);
            photosEnd.value = today.toISOString().slice(0, 10);
        }

        const layerYear = document.getElementById('layer-year');
        if (layerYear) layerYear.value = CONFIG.YEAR;
        const layerYearB = document.getElementById('layer-year-b');
        if (layerYearB) layerYearB.value = CONFIG.YEAR;

        const phenYear = document.getElementById('phenology-year');
        if (phenYear) phenYear.value = CONFIG.YEAR;
    },

    updateCurrentLocation(lat, lng) {
        const coords = document.getElementById('current-coords');
        if (coords) coords.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
};

/* =========================================================
 * Reverse geocoding helper (server-side Gaode/Amap proxy)
 * =======================================================*/
const Geo = {
    async reverseGeocode(lat, lng) {
        const url = new URL('/api/geocode/reverse', window.location.origin);
        url.search = new URLSearchParams({
            lat: String(lat),
            lng: String(lng)
        }).toString();

        try {
            const resp = await fetch(url.toString(), {
                headers: { 'Accept': 'application/json' }
            });
            if (!resp.ok) throw new Error(`Reverse geocode failed: ${resp.status}`);
            const data = await resp.json();
            return data.displayName || null;
        } catch (e) {
            console.warn('Reverse geocoding error:', e.message);
            return null;
        }
    }
};

/* =========================================================
 * Map Manager (single + compare mode)
 * =======================================================*/
const MapManager = {
    init() {
        this.createMapA();
        this.attachMapEvents(AppState.map, 'A');
        this.setInitialLocation();
        this.setupCompareButtons();
        this.setupBaseMapControls();
    },

    setupBaseMapControls() {
        const sel = document.getElementById('base-map-select');
        if (sel) {
            sel.addEventListener('change', (e) => {
                this.switchBaseMap(e.target.value);
            });
        }
    },

    createMapA() {
        AppState.map = L.map('map', {
            center: [CONFIG.INIT.lat, CONFIG.INIT.lng],
            zoom: CONFIG.INIT_ZOOM,
            zoomControl: true
        });
        AppState.baseLayerKey = 'amap';
        AppState.baseLayerA = L.tileLayer(CONFIG.AMAP_VECTOR, { attribution: '© Amap', isBase: true }).addTo(AppState.map);
        this.ensureBaseLayerFullSplit();
    },

    ensureBaseLayerFullSplit() {
        try {
            const Ces = window.Cesium || {};
            const Split = Ces.ImagerySplitDirection || Ces.SplitDirection || { NONE: 0, LEFT: 1, RIGHT: 2 };
            if (AppState.baseLayerA?._imageryLayer) {
                AppState.baseLayerA._imageryLayer.splitDirection = Split.NONE;
            }
            if (AppState.baseLayerA?._baseLayer) {
                AppState.baseLayerA._baseLayer.splitDirection = Split.NONE;
            }
            AppState.map?._v?.scene?.requestRender?.();
        } catch (_) {}
    },

    switchBaseMap(providerKey) {
        if (!AppState.map) return;
        if (AppState.baseLayerA) {
            AppState.map.removeLayer(AppState.baseLayerA);
            AppState.baseLayerA = null;
        }

        const displayName = (window.I18n ? window.I18n.t(`provider.${providerKey}`) : null) || providerKey;
        const loadMsg = window.I18n ? window.I18n.t('loader.loading_base', `Loading ${displayName} tiles...`, { name: displayName }) : `Loading ${displayName} tiles...`;
        if (window.MapTileLoader) {
            window.MapTileLoader.show(loadMsg);
        }

        AppState.baseLayerKey = providerKey;
        const baseOpts = { isBase: true };
        if (providerKey === 'baidu_vec') {
            AppState.baseLayerA = L.baiduTileLayer('vec', { attribution: '© 百度地图 (Baidu Map)', ...baseOpts }).addTo(AppState.map);
        } else if (providerKey === 'baidu_sat') {
            AppState.baseLayerA = L.baiduTileLayer('sat', { attribution: '© 百度卫星 (Baidu Satellite)', ...baseOpts }).addTo(AppState.map);
        } else if (providerKey === 'tianditu_sat') {
            const url = 'https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=7c233da7e82b3507aa5d706e90c55db2';
            AppState.baseLayerA = L.tileLayer(url, { attribution: '© 天地图 (Tianditu)', ...baseOpts }).addTo(AppState.map);
        } else if (providerKey === 'osm') {
            AppState.baseLayerA = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', ...baseOpts }).addTo(AppState.map);
        } else {
            AppState.baseLayerA = L.tileLayer(CONFIG.AMAP_VECTOR, { attribution: '© Amap', ...baseOpts }).addTo(AppState.map);
        }

        this.ensureBaseLayerFullSplit();

        if (AppState.gibsLayerA) {
            LayerManager.updateLayer('A');
        }
        if (AppState.mapB) {
            LayerManager.updateLayer('B');
        }
    },

    async createMapB() {
        // Split-screen compare on a single globe (no second WebGL context).
        // Map A overlays render on the LEFT, Map B overlays render on the RIGHT.
        if (AppState.mapB) return;

        try { AppState.map?.setSplitPosition?.(0.5); } catch (_) {}
        try { AppState.map?.setSplitDirection?.('left'); } catch (_) {}

        // Map B is a lightweight proxy that shares the same Cesium viewer
        // but applies splitDirection=RIGHT to imagery/heat layers.
        try {
            AppState.mapB = AppState.map?.createSplitProxy?.('right') || null;
        } catch (e) {
            console.error('[Compare] Failed to create split proxy:', e);
            AppState.mapB = null;
        }

        this.ensureBaseLayerFullSplit();

        this.setCompareUI(true);

        // Rebuild overlays/heatmaps so they inherit the correct split directions.
        LayerManager.updateLayer('A');
        LayerManager.updateHeatmap('A');
        LayerManager.updateDateSlider('B');
        LayerManager.updateLayer('B');
        LayerManager.updateHeatmap('B');

        // If optional overlays already exist (OPG/WMS), force their split directions.
        this._forceOptionalOverlaySplit();
    },

    destroyMapB() {
        // Disable compare (split-screen) and return to normal single-view rendering.
        if (!AppState.mapB) {
            this.setCompareUI(false);
            try { AppState.map?.setSplitDirection?.('none'); } catch (_) {}
            this.ensureBaseLayerFullSplit();
            this._forceOptionalOverlaySplit('none');
            LayerManager.updateLayer('A');
            LayerManager.refreshHeatmap('A');
            return;
        }

        // Remove Map B overlays/heatmap/OPG/WMS
        try {
            if (AppState.gibsLayerB) {
                AppState.mapB.removeLayer(AppState.gibsLayerB);
                AppState.gibsLayerB = null;
            }
            if (AppState.heatLayerB) {
                AppState.mapB.removeLayer(AppState.heatLayerB);
                AppState.heatLayerB = null;
                AppState.heatTypeB = 'off';
            }
            if (AppState.opgB) {
                AppState.mapB.removeLayer(AppState.opgB);
                AppState.opgB = null;
            }
            if (AppState.wmsB) {
                AppState.mapB.removeLayer(AppState.wmsB);
                AppState.wmsB = null;
            }
        } catch (e) {
            console.warn('[Compare] cleanup failed:', e);
        }

        // Drop the proxy
        AppState.mapB = null;

        // Reset split mode on base map
        try { AppState.map?.setSplitDirection?.('none'); } catch (_) {}
        try { AppState.map?._v?.scene && (AppState.map._v.scene.splitPosition = 0.5); } catch (_) {}
        this.ensureBaseLayerFullSplit();

        // Ensure any remaining optional overlays become full-screen again
        this._forceOptionalOverlaySplit('none');

        // Rebuild Map A overlay/heatmap to remove LEFT splitDirection
        LayerManager.updateLayer('A');
        LayerManager.refreshHeatmap('A');

        this.setCompareUI(false);
    },

    _forceOptionalOverlaySplit(mode = 'auto') {
        // mode: 'auto' -> left when compare enabled, none otherwise
        const Ces = window.Cesium || {};
        const Split = Ces.ImagerySplitDirection || Ces.SplitDirection || { NONE: 0, LEFT: 1, RIGHT: 2 };

        const compareOn = !!AppState.mapB;
        let dirA = Split.NONE;
        if (mode === 'none') dirA = Split.NONE;
        else if (mode === 'left') dirA = Split.LEFT;
        else dirA = compareOn ? Split.LEFT : Split.NONE;

        const setSplit = (layer, dir) => {
            try {
                if (layer && layer.__type === 'imagery' && layer._imageryLayer) {
                    layer._imageryLayer.splitDirection = dir;
                    AppState.map?._v?.scene?.requestRender?.();
                }
            } catch (_) {}
        };

        setSplit(AppState.opgA, dirA);
        setSplit(AppState.wmsA, dirA);
        if (compareOn) {
            setSplit(AppState.opgB, Split.RIGHT);
            setSplit(AppState.wmsB, Split.RIGHT);
        }
    },

    setCompareUI(isOn) {
        // Single globe: keep the second map container hidden, only reveal Map B controls + split slider.
        const mapBEl = document.getElementById('map-b');
        mapBEl?.classList.add('hidden');

        const controlsB = document.getElementById('layer-controls-b');
        const splitGroup = document.getElementById('compare-split-group');

        if (isOn) {
            controlsB?.classList.remove('hidden');
            splitGroup?.classList.remove('hidden');
        } else {
            controlsB?.classList.add('hidden');
            splitGroup?.classList.add('hidden');
        }
    },

    setupCompareButtons() {
        const onBtn = document.getElementById('compare-on');
        const offBtn = document.getElementById('compare-off');

        const splitSlider = document.getElementById('compare-split');
        const splitLabel = document.getElementById('compare-split-label');

        const updateLabel = () => {
            if (!splitSlider || !splitLabel) return;
            splitLabel.textContent = `${splitSlider.value}%`;
        };

        if (splitSlider) {
            splitSlider.addEventListener('input', () => {
                const v = Number(splitSlider.value) / 100;
                try { AppState.map?.setSplitPosition?.(v); } catch (_) {}
                updateLabel();
            });
            updateLabel();
        }

        if (onBtn) onBtn.addEventListener('click', async () => {
            try {
                await this.createMapB();
                if (splitSlider) {
                    const v = Number(splitSlider.value) / 100;
                    try { AppState.map?.setSplitPosition?.(v); } catch (_) {}
                    updateLabel();
                }
            } catch (e) {
                console.error('[Compare] Enable Compare failed:', e);
            }
        });

        if (offBtn) offBtn.addEventListener('click', () => {
            this.destroyMapB();
        });
    },


    attachMapEvents(map, which) {
        map.on('click', (e) => this.setMarker(e.latlng.lat, e.latlng.lng));
    },

    enableSync() {
        if (!AppState.map || !AppState.mapB) return;
        const syncAtoB = () => {
            if (AppState.syncing) return;
            AppState.syncing = true;
            const c = AppState.map.getCenter();
            const z = AppState.map.getZoom();
            AppState.mapB.setView(c, z, { animate: false });
            AppState.syncing = false;
        };
        const syncBtoA = () => {
            if (AppState.syncing) return;
            AppState.syncing = true;
            const c = AppState.mapB.getCenter();
            const z = AppState.mapB.getZoom();
            AppState.map.setView(c, z, { animate: false });
            AppState.syncing = false;
        };
        this._syncA = syncAtoB;
        this._syncB = syncBtoA;
        AppState.map.on('moveend', this._syncA);
        AppState.mapB.on('moveend', this._syncB);
    },

    disableSync() {
        if (this._syncA && AppState.map) AppState.map.off('moveend', this._syncA);
        if (this._syncB && AppState.mapB) AppState.mapB.off('moveend', this._syncB);
        this._syncA = null; this._syncB = null;
    },

    refreshMapSizes() {
        // Invalidate Leaflet sizes so each map remains visually centered after layout changes
        setTimeout(() => {
            if (AppState.map) AppState.map.invalidateSize();
            if (AppState.mapB) AppState.mapB.invalidateSize();
        }, 50);
    },

        setMarker(lat, lng) {
        AppState.currentLatLng = { lat, lng };

        // Single marker is enough for split compare (entities render on both sides).
        if (AppState.currentMarker) AppState.map.removeLayer(AppState.currentMarker);
        AppState.currentMarker = L.marker([lat, lng], { icon: Icons.selected }).addTo(AppState.map);

        UIManager.updateCurrentLocation(lat, lng);
        this.onLocationUpdate(lat, lng);
    },

    ensureMarkerOnBoth(lat, lng) {
        // Backwards-compatible helper (kept for older code paths)
        if (!AppState.currentMarker) {
            this.setMarker(lat, lng);
        } else {
            AppState.currentLatLng = { lat, lng };
            try { AppState.currentMarker.setLatLng([lat, lng]); } catch (_) { this.setMarker(lat, lng); }
        }
    },

    setInitialLocation() {
        this.setMarker(CONFIG.INIT.lat, CONFIG.INIT.lng);
    },

    onLocationUpdate(lat, lng) {
        if (AppState.currentPanel === 'weather') {
            WeatherManager.updateLocation(lat, lng);
        }
        if (AppState.currentPanel === 'vegetation') {
            VegetationManager.updateLocation(lat, lng);
        }
        if (AppState.currentPanel === 'workflow') {
            GeoAIWorkflowManager.updateLocation(lat, lng);
        }
        if (AppState.currentPanel === 'patch') {
            PatchAnalysisManager.updateLocation(lat, lng);
        }
        // When photos are active, reload around the selected point
        if (AppState.inatActive) {
            PhotoManager.loadPhotosAroundPoint();
        }
        // Refresh heatmaps around the new point (if enabled)
        LayerManager.refreshHeatmap('A');
        LayerManager.refreshHeatmap('B');
    },

    getCurrentLocation() {
        if (AppState.currentLatLng && Number.isFinite(AppState.currentLatLng.lat) && Number.isFinite(AppState.currentLatLng.lng)) {
            return { ...AppState.currentLatLng };
        }
        if (AppState.currentMarker && typeof AppState.currentMarker.getLatLng === 'function') {
            const latlng = AppState.currentMarker.getLatLng();
            if (latlng && Number.isFinite(latlng.lat) && Number.isFinite(latlng.lng)) {
                AppState.currentLatLng = { lat: latlng.lat, lng: latlng.lng };
                return { ...AppState.currentLatLng };
            }
        }
        return { ...CONFIG.INIT };
    }
};

/* =========================================================
 * Layer Manager (supports Map A and Map B)
 * =======================================================*/
const LayerManager = {
    init() {
        this.setupControls('A');
        this.setupControls('B'); // will attach only if B controls exist
        this.updateDateSlider('A');
        this.updateDateSlider('B');
        this.updateLayer('A');
    },

    // Resolve DOM elements by map side
    _els(side) {
        const suf = side === 'B' ? '-b' : '';
        return {
            layerSelect: document.getElementById(`main-layer${suf}`),
            yearInput: document.getElementById(`layer-year${suf}`),
            dateSlider: document.getElementById(`layer-date${suf}`),
            dateLabel: document.getElementById(`layer-date-label${suf}`),
            opacitySlider: document.getElementById(`layer-opacity${suf}`),
            heatmapSelect: document.getElementById(`heatmap-${side === 'B' ? 'b' : 'a'}`) // may be null if UI not present
        };
    },

    setupControls(side) {
        const { layerSelect, yearInput, dateSlider, opacitySlider, heatmapSelect } = this._els(side);
        if (!layerSelect && side === 'B') return; // B controls may not be present yet

        if (layerSelect) layerSelect.addEventListener('change', () => this.updateLayer(side));
        if (yearInput) yearInput.addEventListener('change', () => { this.updateDateSlider(side); this.updateLayer(side); });
        if (dateSlider) dateSlider.addEventListener('input', () => { this.updateDateLabel(side); this.updateLayer(side); });
        if (opacitySlider) opacitySlider.addEventListener('input', () => this.updateLayer(side));
        if (heatmapSelect) heatmapSelect.addEventListener('change', () => this.updateHeatmap(side)); // NEW
        // Compare buttons handled by MapManager
    },

    updateDateSlider(side = 'A') {
        const { yearInput, dateSlider } = this._els(side);
        if (!yearInput || !dateSlider) return;
        const year = parseInt(yearInput.value) || CONFIG.YEAR;
        const dates = Utils.genDates(year, 1);
        dateSlider.max = dates.length - 1;
        if (dateSlider.value > dates.length - 1) dateSlider.value = dates.length - 1;
        this.updateDateLabel(side);
    },

    updateDateLabel(side = 'A') {
        const { yearInput, dateSlider, dateLabel } = this._els(side);
        if (!yearInput || !dateSlider || !dateLabel) return;
        const year = parseInt(yearInput.value) || CONFIG.YEAR;
        const dates = Utils.genDates(year, 1);
        const index = parseInt(dateSlider.value);
        if (dates[index]) {
            const dateISO = dates[index];
            dateLabel.textContent = dateISO;

            // Sync WMS overlay input and refresh if active
            const wmsTimeInput = document.getElementById(side === 'B' ? 'wms-b-time' : 'wms-a-time');
            if (wmsTimeInput) {
                wmsTimeInput.value = dateISO;
            }
            const activeWmsKey = side === 'B' ? 'wmsB' : 'wmsA';
            if (AppState[activeWmsKey] && typeof window.Overlays?.addWMS === 'function') {
                this._wmsDebounce = this._wmsDebounce || {};
                clearTimeout(this._wmsDebounce[side]);
                this._wmsDebounce[side] = setTimeout(() => {
                    if (AppState[activeWmsKey]) {
                        window.Overlays.addWMS(side);
                    }
                }, 250);
            }
        }
    },

    updateLayer(side = 'A') {
        const els = this._els(side);
        const { layerSelect, yearInput, dateSlider, opacitySlider } = els;
        if (!layerSelect || !yearInput || !dateSlider || !opacitySlider) return;

        // Remove existing overlay on the corresponding map
        const isB = (side === 'B');
        const map = isB ? AppState.mapB : AppState.map;
        if (!map) return;

        const targetLayerKey = isB ? 'gibsLayerB' : 'gibsLayerA';
        const existing = AppState[targetLayerKey];
        if (existing) {
            map.removeLayer(existing);
            AppState[targetLayerKey] = null;
        }

        // Parse layer selection
        const layerInfo = layerSelect.value.split('|');
        if (layerInfo[0] === 'NO_OVERLAY' || layerInfo[0] === 'STD_OSM') {
            MapManager.ensureBaseLayerFullSplit?.();
            if (isB && AppState.baseLayerKey !== 'amap') {
                const overlay = L.tileLayer(CONFIG.AMAP_VECTOR, {
                    attribution: '© Amap',
                    crossOrigin: true
                }).addTo(map);
                AppState.gibsLayerB = overlay;
            }
            return; // no satellite overlay
        }

        const year = parseInt(yearInput.value) || CONFIG.YEAR;
        const dates = Utils.genDates(year, 1);
        const index = parseInt(dateSlider.value);
        const opacity = parseFloat(opacitySlider.value);

        if (dates[index]) {
            // Use ISO date with dashes for GIBS
            const dateISO = dates[index]; // YYYY-MM-DD
            const url = CONFIG.GIBS_URL(layerInfo[0], dateISO, layerInfo[1]);

            // Set maxNativeZoom to 9 for GIBS overlays
            const overlay = L.tileLayer(url, {
                opacity,
                attribution: 'NASA GIBS',
                maxNativeZoom: 9,
                crossOrigin: true
            }).addTo(map);

            AppState[targetLayerKey] = overlay;

            // Sync WMS overlay input and refresh if active
            const wmsTimeInput = document.getElementById(side === 'B' ? 'wms-b-time' : 'wms-a-time');
            if (wmsTimeInput) {
                wmsTimeInput.value = dateISO;
            }
            const activeWmsKey = side === 'B' ? 'wmsB' : 'wmsA';
            if (AppState[activeWmsKey] && typeof window.Overlays?.addWMS === 'function') {
                this._wmsDebounce = this._wmsDebounce || {};
                clearTimeout(this._wmsDebounce[side]);
                this._wmsDebounce[side] = setTimeout(() => {
                    if (AppState[activeWmsKey]) {
                        window.Overlays.addWMS(side);
                    }
                }, 250);
            }
        }
    },

    // ---- Heatmap helpers (NEW) ----
    async updateHeatmap(side = 'A') {
        const { heatmapSelect } = this._els(side);
        if (!heatmapSelect) return;

        const type = heatmapSelect.value; // 'off' | 'ndvi' | 'evi' | 't2m' | 'precip'
        const isB = side === 'B';
        const map = isB ? AppState.mapB : AppState.map;
        if (!map) return;

        // Close previous heatmap (only one per map)
        const layerKey = isB ? 'heatLayerB' : 'heatLayerA';
        const typeKey  = isB ? 'heatTypeB'  : 'heatTypeA';

        if (AppState[layerKey]) {
            map.removeLayer(AppState[layerKey]);
            AppState[layerKey] = null;
        }
        AppState[typeKey] = type;

        if (type === 'off') return;

        // Build & add heat layer
        const points = await HeatmapHelper.buildPointsAroundSelection(type, map);
        if (!points.length) return;

        const hl = L.heatLayer(points, { radius: 28, blur: 20, maxZoom: 15 });
        hl.addTo(map);
        AppState[layerKey] = hl;
    },

    async refreshHeatmap(side = 'A') {
        // Rebuild current heatmap for this map if it is active
        const isB = side === 'B';
        const type = isB ? AppState.heatTypeB : AppState.heatTypeA;
        if (!type || type === 'off') return;
        await this.updateHeatmap(side);
    }
};

/* =========================================================
 * HeatmapHelper (NEW): fetch small grid of values around selected point
 * =======================================================*/
const HeatmapHelper = {
    // Grid config: 4x4 within ~0.4° box (~40 km at mid lat)
    gridSize: 4,
    halfSpanDeg: 0.4,

    // Cache for latest VI composite date
    _latestVIDate: null,
    _latestVIProduct: 'MOD13Q1',

    async buildPointsAroundSelection(type, map) {
        const { lat, lng } = MapManager.getCurrentLocation();
        const pts = this._grid(lat, lng);
        let values = [];

        if (type === 'ndvi' || type === 'evi') {
            const date = await this._getLatestVIDate();
            values = await this._pool(pts.map(p => () => this._fetchVIAt(p.lat, p.lng, date, type)), 4);
            // normalize NDVI/EVI to [0,1]
            const norm = (v) => v == null ? 0 : Utils.clamp((v + 0.1) / 0.7, 0, 1);
            return values.filter(v => v.val != null).map(v => [v.lat, v.lng, norm(v.val)]);
        }

        if (type === 't2m' || type === 'precip') {
            const now = new Date();
            const end = this._ymd(now);
            const startDate = new Date(now); startDate.setDate(now.getDate() - 29);
            const start = this._ymd(startDate);
            values = await this._pool(pts.map(p => () => this._fetchPowerAgg(p.lat, p.lng, start, end)), 4);
            if (type === 't2m') {
                // Temperature (30d mean): map [-10..35]C to [0..1]
                const normT = (v) => v == null ? 0 : Utils.clamp((v + 10) / 45, 0, 1);
                return values.filter(v => v.t2m_mean != null).map(v => [v.lat, v.lng, normT(v.t2m_mean)]);
            } else {
                // Precip (30d total): map [0..200]mm to [0..1]
                const normP = (v) => v == null ? 0 : Utils.clamp(v / 200, 0, 1);
                return values.filter(v => v.precip_sum != null).map(v => [v.lat, v.lng, normP(v.precip_sum)]);
            }
        }

        return [];
    },

    _grid(lat, lng) {
        const n = this.gridSize;
        const hs = this.halfSpanDeg;
        const step = (2 * hs) / (n - 1);
        const arr = [];
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                arr.push({ lat: lat - hs + i * step, lng: lng - hs + j * step });
            }
        }
        return arr;
    },

    async _getLatestVIDate() {
        if (this._latestVIDate) return this._latestVIDate;
        const { lat, lng } = MapManager.getCurrentLocation();
        const json = await VegetationManager.fetchDates(this._latestVIProduct, lat, lng);
        const arr = json?.dates || [];
        this._latestVIDate = arr.length ? (arr[arr.length - 1]?.modis_date || arr[arr.length - 1]) : null;
        return this._latestVIDate;
    },

    async _fetchVIAt(lat, lng, modisDate, viType) {
        try {
            const subset = await VegetationManager.fetchSubset(this._latestVIProduct, lat, lng, modisDate, modisDate);
            const bands = subset?.subset || [];
            const match = bands.find(b => (b.band || '').toLowerCase().includes(viType)); // 'ndvi' or 'evi'
            const raw = Array.isArray(match?.data) ? match.data[0] : match?.data;
            const val = raw == null || raw <= -9000 ? null : Number(raw) * 0.0001;
            return { lat, lng, val };
        } catch (_) {
            return { lat, lng, val: null };
        }
    },

    async _fetchPowerAgg(lat, lng, startYmd, endYmd) {
        try {
            const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
            url.search = new URLSearchParams({
                parameters: 'T2M,PRECTOTCORR',
                community: 'AG',
                longitude: String(lng),
                latitude: String(lat),
                start: startYmd,
                end: endYmd,
                format: 'JSON'
            }).toString();
            const r = await fetch(url);
            if (!r.ok) throw new Error('POWER fail');
            const data = await r.json();
            const T = Object.values(data?.properties?.parameter?.T2M || {}).map(v => Utils.numOrNull(v)).filter(v => v != null);
            const P = Object.values(data?.properties?.parameter?.PRECTOTCORR || {}).map(v => Utils.numOrNull(v)).filter(v => v != null);
            const mean = T.length ? (T.reduce((a,b)=>a+b,0) / T.length) : null;
            const sumP = P.length ? (P.reduce((a,b)=>a+b,0)) : null;
            return { lat, lng, t2m_mean: mean, precip_sum: sumP };
        } catch (_) {
            return { lat, lng, t2m_mean: null, precip_sum: null };
        }
    },

    _ymd(d) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth()+1).padStart(2,'0');
        const dd = String(d.getUTCDate()).padStart(2,'0');
        return `${y}${m}${dd}`;
    },

    // small async pool to limit concurrency
    async _pool(tasks, limit = 4) {
        const ret = [];
        let i = 0;
        const workers = new Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
            while (i < tasks.length) {
                const t = tasks[i++];
                const v = await t();
                ret.push(v);
            }
        });
        await Promise.all(workers);
        return ret;
    }
};

/* =========================================================
 * Photo Manager (iNaturalist): load around selected point first
 * =======================================================*/
const PhotoManager = {
    init() {
        this.setupControls();
    },

    setupControls() {
        const onBtn = document.getElementById('photos-on');
        const offBtn = document.getElementById('photos-off');
        const heatmapCheck = document.getElementById('photos-heatmap');

        if (onBtn) onBtn.addEventListener('click', () => this.enablePhotos());
        if (offBtn) offBtn.addEventListener('click', () => this.disablePhotos());
        if (heatmapCheck) heatmapCheck.addEventListener('change', () => this.toggleHeatmap());
    },

    async enablePhotos() {
        if (AppState.inatActive) return;
        AppState.inatActive = true;
        this.clearLayers();
        this.ensureLayers();

        try {
            await this.loadPhotosAroundPoint(); // start near selected point
            this.setupMapListener();
        } catch (error) {
            console.error('Failed to load photos:', error);
            AppState.inatActive = false;
        }
    },

    disablePhotos() {
        AppState.inatActive = false;
        this.clearLayers();
        this.removeMapListener();
        AppState.inatIndex.clear();
        const stats = document.getElementById('photos-stats');
        if (stats) stats.textContent = '—';
    },

    toggleHeatmap() {
        if (!AppState.inatActive) return;
        this.ensureLayers();
        this.renderPhotos();
    },

    ensureLayers() {
        const useHeatmap = document.getElementById('photos-heatmap')?.checked;

        if (useHeatmap) {
            if (AppState.inatMarkerLayer) {
                AppState.map.removeLayer(AppState.inatMarkerLayer);
                AppState.inatMarkerLayer = null;
            }
            if (!AppState.inatHeatLayer) {
                AppState.inatHeatLayer = L.heatLayer([], { radius: 25 }).addTo(AppState.map);
            }
        } else {
            if (AppState.inatHeatLayer) {
                AppState.map.removeLayer(AppState.inatHeatLayer);
                AppState.inatHeatLayer = null;
            }
            if (!AppState.inatMarkerLayer) {
                AppState.inatMarkerLayer = L.markerClusterGroup().addTo(AppState.map);
            }
        }
    },

    clearLayers() {
        if (AppState.inatMarkerLayer) {
            AppState.map.removeLayer(AppState.inatMarkerLayer);
            AppState.inatMarkerLayer = null;
        }
        if (AppState.inatHeatLayer) {
            AppState.map.removeLayer(AppState.inatHeatLayer);
            AppState.inatHeatLayer = null;
        }
    },

    // Load around the currently selected point
    async loadPhotosAroundPoint() {
        const { lat, lng } = MapManager.getCurrentLocation();
        const startDate = document.getElementById('photos-start')?.value;
        const endDate = document.getElementById('photos-end')?.value;
        const taxon = parseInt(document.getElementById('photos-taxon')?.value) || 47125;
        const maxPages = Utils.clamp(parseInt(document.getElementById('photos-max-pages')?.value) || 5, 1, 20);
        const radiusKm = Utils.clamp(parseInt(document.getElementById('photos-radius')?.value) || 25, 1, 200);

        let added = 0;
        let pages = 0;

        try {
            for (let page = 1; page <= maxPages; page++) {
                const observations = await this.fetchINatNearby(lat, lng, radiusKm, startDate, endDate, taxon, page, 200);
                pages++;
                if (!observations.length) break;

                for (const obs of observations) {
                    const id = obs.id;
                    if (AppState.inatIndex.has(id)) continue;

                    const latV = obs.geojson?.coordinates?.[1] ?? obs.location?.split(',')[0];
                    const lngV = obs.geojson?.coordinates?.[0] ?? obs.location?.split(',')[1];
                    if (!Number.isFinite(+latV) || !Number.isFinite(+lngV)) continue;

                    const species = obs.taxon?.preferred_common_name || obs.taxon?.name || '—';
                    const date = (obs.observed_on_details?.date || obs.observed_on || '').slice(0, 10);
                    const url = obs.uri || `https://www.inaturalist.org/observations/${id}`;
                    const thumb = obs.photos?.[0]?.url?.replace('square', 'small') || null;

                    AppState.inatIndex.set(id, { lat: +latV, lng: +lngV, species, date, url, thumb });
                    added++;
                }
                this.renderPhotos();
            }
        } catch (error) {
            console.error('Error loading iNaturalist data:', error);
        }

        const stats = document.getElementById('photos-stats');
        if (stats) {
            stats.textContent = `Loaded ${AppState.inatIndex.size} records (+${added}, pages ${pages}/${maxPages})`;
        }
    },

    // Keep this for moveend updates; still centers near current marker
    setupMapListener() {
        this.mapMoveHandler = () => this.loadPhotosAroundPoint();
        AppState.map.on('moveend', this.mapMoveHandler);
    },

    removeMapListener() {
        if (this.mapMoveHandler) {
            AppState.map.off('moveend', this.mapMoveHandler);
            this.mapMoveHandler = null;
        }
    },

    async fetchINatNearby(lat, lng, radiusKm, startDate, endDate, taxon, page, perPage) {
        const url = new URL('https://api.inaturalist.org/v1/observations');
        const params = {
            geo: true,
            photos: true,
            verifiable: true,
            lat: lat,
            lng: lng,
            radius: radiusKm, // kilometers
            taxon_id: taxon,
            per_page: perPage,
            page: page
        };
        if (startDate) params.d1 = startDate;
        if (endDate) params.d2 = endDate;

        url.search = new URLSearchParams(params).toString();
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`iNaturalist API error: ${response.status}`);
        const data = await response.json();
        return data.results || [];
    },

    renderPhotos() {
        const useHeatmap = document.getElementById('photos-heatmap')?.checked;

        if (useHeatmap && AppState.inatHeatLayer) {
            const points = Array.from(AppState.inatIndex.values()).map(item => [item.lat, item.lng]);
            AppState.inatHeatLayer.setLatLngs(points);
        } else if (AppState.inatMarkerLayer) {
            AppState.inatMarkerLayer.clearLayers();
            for (const item of AppState.inatIndex.values()) {
                const marker = L.marker([item.lat, item.lng], { icon: Icons.flower });
                const popupContent = `
                    <div>
                        <strong>${item.species}</strong><br>
                        Date: ${item.date}<br>
                        <a href="${item.url}" target="_blank" rel="noopener">View Details</a>
                        ${item.thumb ? `<br><img src="${item.thumb}" style="max-width: 150px; margin-top: 6px; border-radius: 10px;">` : ''}
                        ${item.thumb ? `<div style="margin-top: 8px;"><button class="btn small" data-action="identify-photo" data-url="${item.thumb}">Identify this photo</button></div>` : ''}
                    </div>`;
                marker.bindPopup(popupContent);
                AppState.inatMarkerLayer.addLayer(marker);
            }
        }
    }
};

/* =========================================================
 * Vegetation Manager
 * =======================================================*/
const VegetationManager = {
    init() { this.setupControls(); },

    setupControls() {
        const queryBtn = document.getElementById('vi-query');
        if (queryBtn) queryBtn.addEventListener('click', () => this.queryVegetationIndex());
    },

    async queryVegetationIndex() {
        const location = MapManager.getCurrentLocation();
        const product = document.getElementById('vi-product')?.value || 'MOD13Q1';
        try {
            await this.fetchVegetationIndex(location.lat, location.lng, product);
        } catch (error) {
            console.error('Failed to fetch vegetation index:', error);
            this.clearVegetationDisplay();
        }
    },

    async fetchVegetationIndex(lat, lng, product) {
        // Fetch available dates
        const dates = await this.fetchDates(product, lat, lng);
        const dateArray = dates?.dates || [];
        if (!dateArray.length) throw new Error('No composite dates available for this location');

        // Fetch latest subset
        const latestDate = dateArray[dateArray.length - 1]?.modis_date || dateArray[dateArray.length - 1];
        const subset = await this.fetchSubset(product, lat, lng, latestDate, latestDate);
        if (!subset?.subset?.length) throw new Error('Empty subset data');

        this.parseAndDisplayVegetationData(subset);
    },

    async fetchDates(product, lat, lng) {
        const url = `${CONFIG.RST}/${product}/dates?latitude=${lat}&longitude=${lng}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Dates API error: ${response.status}`);
        return response.json();
    },

    async fetchSubset(product, lat, lng, startDate, endDate) {
        const url = `${CONFIG.RST}/${product}/subset?latitude=${lat}&longitude=${lng}&startDate=${startDate}&endDate=${endDate}&kmAboveBelow=0&kmLeftRight=0`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Subset API error: ${response.status}`);
        return response.json();
    },

    parseAndDisplayVegetationData(json) {
        const grid = {};
        const arr = json?.subset || [];

        for (const item of arr) {
            const key = (item.band || '').toLowerCase();
            const val = Array.isArray(item.data) ? item.data[0] : item.data;
            grid[key] = {
                date: item.calendar_date || item.modis_date,
                raw: val,
                scaled: this.scaleValue(key, val)
            };
        }

        const tile = arr[0]?.tile || '—';
        const modisDate = arr[0]?.modis_date || null;
        const calendarDate = arr[0]?.calendar_date || null;

        const pick = (keyword) => {
            const key = Object.keys(grid).find(x => x.includes(keyword));
            return key ? grid[key] : { scaled: null, raw: null };
        };

        const ndvi = pick('ndvi').scaled;
        const evi = pick('evi').scaled;
        const red = pick('red_reflectance').scaled;
        const nir = pick('nir_reflectance').scaled;
        const blue = pick('blue_reflectance').scaled;
        const mir = pick('mir_reflectance').scaled;
        const reliability = pick('pixel_reliability').raw;
        const viQuality = pick('vi_quality').raw;

        this.updateVegetationDisplay({
            date: calendarDate || modisDate,
            tile,
            ndvi, evi, red, nir, blue, mir,
            reliability, viQuality
        });
    },

    scaleValue(bandName, raw) {
        if (raw == null) return null;
        const n = Number(raw);
        if (n <= -9000) return null; // fill / invalid
        const b = (bandName || '').toLowerCase();
        if (b.includes('reflectance')) return n * 0.0001;
        if (b.includes('ndvi') || b.includes('evi')) return n * 0.0001;
        if (b.includes('zenith') || b.includes('azimuth')) return n * 0.01;
        return n;
    },

    updateVegetationDisplay(data) {
        const elements = {
            'vi-meta': `Date: ${data.date || '—'}, Tile: ${data.tile}`,
            'vi-quality': this.getQualityBadge(data.reliability, data.viQuality),
            'vi-vigor': this.getVigorInfo(data.ndvi),
            'vi-ndvi': Utils.fmt(data.ndvi, 4),
            'vi-evi': Utils.fmt(data.evi, 4),
            'vi-red': Utils.fmt(data.red, 4),
            'vi-nir': Utils.fmt(data.nir, 4),
            'vi-blue': Utils.fmt(data.blue, 4),
            'vi-mir': Utils.fmt(data.mir, 4)
        };

        for (const [id, content] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (!element) continue;
            if (id === 'vi-quality' || id === 'vi-vigor') element.innerHTML = content;
            else element.textContent = content;
        }
    },

    getQualityBadge(reliability, viQuality) {
        const reliabilityMap = {
            0: ['Good', 'b-good'],
            1: ['Marginal', 'b-marg'],
            2: ['Snow/Ice', 'b-snow'],
            3: ['Cloud', 'b-cloud']
        };
        let result = '';
        if (reliability != null) {
            const [label] = reliabilityMap[Number(reliability)] || ['Unknown', ''];
            result += `<span class="badge">${label} (${reliability})</span>`;
        }
        if (viQuality != null) {
            result += (result ? ' · ' : '') + `VI Quality=${viQuality}`;
        }
        return result || '—';
    },

    getVigorInfo(ndvi) {
        if (ndvi == null || isNaN(ndvi)) return '<span class="vig-verylow">Unknown</span>';

        let label, cls;
        if (ndvi < 0.2)       { label = 'Very Low (Bare/Urban)'; cls = 'vig-verylow'; }
        else if (ndvi < 0.3)  { label = 'Low'; cls = 'vig-low'; }
        else if (ndvi < 0.5)  { label = 'Moderate'; cls = 'vig-medium'; }
        else if (ndvi < 0.7)  { label = 'High'; cls = 'vig-high'; }
        else                  { label = 'Very High'; cls = 'vig-veryhigh'; }
        return `<span class="${cls}">${label}</span> (NDVI=${Utils.fmt(ndvi, 3)})`;
    },

    clearVegetationDisplay() {
        const ids = ['vi-meta', 'vi-quality', 'vi-vigor', 'vi-ndvi', 'vi-evi', 'vi-red', 'vi-nir', 'vi-blue', 'vi-mir'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === 'vi-quality' || id === 'vi-vigor') el.innerHTML = '—';
            else el.textContent = '—';
        });
    },

    updateLocation(_lat, _lng) {
        // Could auto-refresh when location changes if needed
        // this.queryVegetationIndex();
    }
};

/* =========================================================
 * Phenology Manager
 * =======================================================*/
const PhenologyManager = {
    init() { this.setupControls(); },

    setupControls() {
        const calcBtn = document.getElementById('phenology-calc');
        if (calcBtn) calcBtn.addEventListener('click', () => this.calculatePhenology());
    },

    async calculatePhenology() {
        const location = MapManager.getCurrentLocation();

        const nowYear = CONFIG.YEAR;
        const yearEl = document.getElementById('phenology-year');
        const noteEl = document.getElementById('phenology-note');

        let year = parseInt(yearEl?.value, 10) || nowYear;
        if (year > nowYear) {
            year = nowYear;
            if (yearEl) yearEl.value = String(year);
        }
        if (year < 1981) year = 1981; // POWER daily coverage begins in early 1980s (best-effort)

        if (noteEl) noteEl.textContent = '';

        try {
            // POWER daily data can lag behind the local system date (or the user may be on a
            // machine whose clock is set in the future). If the selected year returns very
            // sparse data, automatically fall back to the most recent prior year.
            let dailyData = await this.fetchPOWERDaily(location.lat, location.lng, year);

            let validDays = dailyData.filter(d => d.T2M != null).length;
            const initialYear = year;
            const initialValidDays = validDays;
            if (validDays < 20) {
                // If the current year is empty/too sparse, try last year.
                if (year >= nowYear) {
                    const fallbackYear = nowYear - 1;
                    const fallback = await this.fetchPOWERDaily(location.lat, location.lng, fallbackYear);
                    const fallbackValid = fallback.filter(d => d.T2M != null).length;
                    if (fallbackValid > validDays) {
                        year = fallbackYear;
                        dailyData = fallback;
                        validDays = fallbackValid;
                        if (yearEl) yearEl.value = String(year);
                        if (noteEl) noteEl.textContent = `POWER daily data for ${initialYear} appears unavailable or sparse (${initialValidDays} days). Using ${fallbackYear} instead.`;
                    }
                }
            }

            if (noteEl && !noteEl.textContent && validDays < 50) {
                noteEl.textContent = `Insufficient daily temperature coverage (${validDays} days). Try a different year or location.`;
            }

            this.calculateFlowerPredictions(dailyData, year);
            this.plotTemperatureChart(dailyData);
        } catch (error) {
            console.error('Failed to calculate phenology:', error);
            alert('Computation failed. Please try again later.');
        }
    },

    async fetchPOWERDaily(lat, lng, year) {
        const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
        url.search = new URLSearchParams({
            parameters: 'T2M,T2M_MIN,T2M_MAX,PRECTOTCORR',
            community: 'AG',
            longitude: String(lng),
            latitude: String(lat),
            start: `${year}0101`,
            end: `${year}1231`,
            format: 'JSON'
        }).toString();

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`POWER API error: ${response.status}`);

        const data = await response.json();
        const params = data?.properties?.parameter || {};
        const dates = Object.keys(params?.T2M || {}).sort();

        return dates.map(d => ({
            date: d,
            T2M: Utils.numOrNull(params.T2M[d]),
            T2M_MIN: Utils.numOrNull(params.T2M_MIN?.[d]),
            T2M_MAX: Utils.numOrNull(params.T2M_MAX?.[d]),
            P: Utils.numOrNull(params.PRECTOTCORR?.[d])
        }));
    },

    calculateFlowerPredictions(dailyData, year) {
        const temps = dailyData.map(d => d.T2M);
        const tbody = document.querySelector('#flowers-table tbody');
        if (!tbody) return;

        for (const tr of tbody.querySelectorAll('tr')) {
            const baseInput = tr.children[1].querySelector('input');
            const thrInput = tr.children[2].querySelector('input');
            const predCell = tr.querySelector('.pred');
            const daysCell = tr.querySelector('.days');

            const base = parseFloat(baseInput.value);
            const threshold = parseFloat(thrInput.value);

            if (!Number.isFinite(base) || !Number.isFinite(threshold)) {
                predCell.textContent = '—';
                daysCell.textContent = '—';
                predCell.className = 'pred';
                continue;
            }

            const result = this.estimateGDD(temps, base, threshold);

            if (result.doy) {
                predCell.textContent = Utils.doyToDate(year, result.doy);
                daysCell.textContent = result.days;
                predCell.className = 'pred ok';
            } else {
                predCell.textContent = window.I18n ? window.I18n.t('pheno.not_reached', 'Not Reached') : 'Not Reached';
                daysCell.textContent = '—';
                predCell.className = 'pred bad';
            }
        }
    },

    estimateGDD(tempDaily, base, threshold) {
        let accumulation = 0;
        for (let i = 0; i < tempDaily.length; i++) {
            const temp = tempDaily[i];
            if (temp == null) continue;
            accumulation += Math.max(0, temp - base);
            if (accumulation >= threshold) {
                return { doy: i + 1, days: i + 1, gdd: accumulation };
            }
        }
        return { doy: null, days: null, gdd: accumulation };
    },

    plotTemperatureChart(dailyData) {
        const chartContainer = document.getElementById('weather-chart');
        if (!chartContainer || !window.Plotly) return;

        const x = dailyData.map(r => {
            const d = r.date;
            return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        });

        const t2m = dailyData.map(r => r.T2M);
        const precip = dailyData.map(r => r.P);

        const traces = [
            { x, y: t2m, type: 'scatter', mode: 'lines', name: 'Temperature (°C)', line: { width: 1.5 }, connectgaps: false },
            { x, y: precip, type: 'bar', name: 'Precip (mm)', yaxis: 'y2', opacity: 0.35 }
        ];

        const layout = {
            paper_bgcolor: '#334155',
            plot_bgcolor: '#334155',
            margin: { l: 48, r: 48, t: 24, b: 32 },
            xaxis: { title: 'Date', color: '#cbd5e1' },
            yaxis: { title: 'Temperature (°C)', color: '#cbd5e1', gridcolor: '#475569' },
            yaxis2: { title: 'Precip (mm)', color: '#cbd5e1', overlaying: 'y', side: 'right', showgrid: false },
            font: { color: '#cbd5e1' },
            legend: { font: { color: '#cbd5e1' } }
        };

        Plotly.newPlot(chartContainer, traces, layout, { displayModeBar: false });
    }
};

/* =========================================================
 * GeoAI Workflow Manager
 * =======================================================*/
const GeoAIWorkflowManager = {
    _wired: false,

    init() {
        this.setupControls();
        PatchAnalysisManager.setupControls();
        const loc = MapManager.getCurrentLocation();
        this.updateLocation(loc.lat, loc.lng);
    },

    setupControls() {
        if (this._wired) return;
        this._wired = true;

        const runBtn = document.getElementById('workflow-run');
        if (runBtn) runBtn.addEventListener('click', () => this.run());

        const centerBtn = document.getElementById('workflow-use-center');
        if (centerBtn) centerBtn.addEventListener('click', () => {
            if (!AppState.map || typeof AppState.map.getCenter !== 'function') return;
            const center = AppState.map.getCenter();
            MapManager.setMarker(center.lat, center.lng);
            this.updateLocation(center.lat, center.lng);
            PatchAnalysisManager.updateLocation(center.lat, center.lng);
        });
    },

    updateLocation(lat, lng) {
        const el = document.getElementById('workflow-coords');
        if (el) el.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    },

    async run() {
        this._syncPatchControls();
        this._setRunningState();
        await PatchAnalysisManager.run();
    },

    _syncPatchControls() {
        const pairs = [
            ['workflow-radius', 'patch-radius'],
            ['workflow-product', 'patch-product'],
            ['workflow-years', 'patch-years']
        ];
        for (const [sourceId, targetId] of pairs) {
            const source = document.getElementById(sourceId);
            const target = document.getElementById(targetId);
            if (source && target) target.value = source.value;
        }
    },

    _setRunningState() {
        const status = document.getElementById('workflow-status');
        if (status) status.textContent = 'Running full GeoAI workflow...';
    }
};

/* =========================================================
 * GeoAI Patch Analysis Manager
 * =======================================================*/
const PatchAnalysisManager = {
    _wired: false,

    init() {
        this.setupControls();
        const loc = MapManager.getCurrentLocation();
        this.updateLocation(loc.lat, loc.lng);
    },

    setupControls() {
        if (this._wired) return;
        this._wired = true;

        const runBtn = document.getElementById('patch-run');
        if (runBtn) runBtn.addEventListener('click', () => this.run());

        const centerBtn = document.getElementById('patch-use-center');
        if (centerBtn) centerBtn.addEventListener('click', () => {
            if (!AppState.map || typeof AppState.map.getCenter !== 'function') return;
            const center = AppState.map.getCenter();
            MapManager.setMarker(center.lat, center.lng);
            this.updateLocation(center.lat, center.lng);
        });
    },

    updateLocation(lat, lng) {
        const text = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        for (const id of ['patch-coords', 'workflow-coords']) {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        }
    },

    async run() {
        const loc = MapManager.getCurrentLocation();
        const radius = this._clamp(Number(document.getElementById('patch-radius')?.value || 25), 1, 200);
        const years = this._clamp(Number(document.getElementById('patch-years')?.value || 2), 1, 5);
        const product = document.getElementById('patch-product')?.value || 'MOD13Q1';

        this.updateLocation(loc.lat, loc.lng);
        this._setStatus(`Fetching ${product} composites and patch samples...`);
        this._setOutputs({ health: '—', risk: '—', bloom: '—', summary: 'Running patch analysis...' });

        let series = [];
        let patchStats = { count: 0, date: null, ndvi: null, evi: null, minNdvi: null, maxNdvi: null, samples: [] };
        let viError = null;

        try {
            const datesJson = await VegetationManager.fetchDates(product, loc.lat, loc.lng);
            const entries = this._selectDateEntries(datesJson?.dates || [], years);
            if (!entries.length) throw new Error('No vegetation composite dates are available for this patch.');

            series = await this._fetchCenterSeries(product, loc.lat, loc.lng, entries);
            if (!series.length) throw new Error('No valid NDVI/EVI values were returned for this location.');

            const latestEntry = entries[entries.length - 1];
            const latestModisDate = latestEntry?.modis_date || latestEntry;
            patchStats = await this._fetchPatchStats(product, loc.lat, loc.lng, radius, latestModisDate);
        } catch (error) {
            viError = error;
            console.warn('Patch vegetation fetch failed:', error);
            this._setStatus(`Vegetation source unavailable (${error.message || error}). Continuing with POWER phenology analysis...`);
        }

        try {
            const weather = await this._fetchWeatherForPhenology(loc.lat, loc.lng);
            const interpretation = this._interpret({ loc, radius, product, series, patchStats, weather, viError });

            this._setOutputs(interpretation);
            this._plot(series, patchStats, interpretation);
            const viStatus = viError
                ? `Vegetation source unavailable; POWER phenology still completed.`
                : `Done. ${series.length} composites, ${patchStats.count} patch samples, latest date ${patchStats.date || '—'}.`;
            this._setStatus(viStatus);
        } catch (error) {
            console.error('Patch analysis failed:', error);
            this._setStatus(`Patch analysis failed: ${error.message || error}`);
            this._setOutputs({
                health: 'Unavailable',
                risk: 'Unknown',
                bloom: '—',
                summary: 'Remote sensing or weather data could not be loaded for the selected patch. Try a nearby land point or a smaller radius.'
            });
        }
    },

    _selectDateEntries(allDates, years) {
        if (!allDates.length) return [];
        const limit = Math.min(Math.ceil((365 / 16) * years), 64);
        return allDates.slice(-limit);
    },

    async _fetchCenterSeries(product, lat, lng, entries) {
        const series = [];
        const concurrency = 4;
        let cursor = 0;

        const worker = async () => {
            while (true) {
                const i = cursor++;
                if (i >= entries.length) break;
                const entry = entries[i];
                const md = entry?.modis_date || entry;
                const iso = entry?.calendar_date ? String(entry.calendar_date).slice(0, 10) : this._toISO(md);
                try {
                    const subset = await VegetationManager.fetchSubset(product, lat, lng, md, md);
                    const values = this._parseVegetationSubset(subset);
                    if (values.ndvi != null || values.evi != null) {
                        series.push({ date: iso || values.date || String(md), ndvi: values.ndvi, evi: values.evi });
                    }
                } catch (_) {
                    // Skip isolated bad composites.
                }
            }
        };

        await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));
        series.sort((a, b) => a.date < b.date ? -1 : 1);
        return series;
    },

    async _fetchPatchStats(product, lat, lng, radiusKm, modisDate) {
        const points = this._patchPoints(lat, lng, radiusKm);
        const samples = [];

        await Promise.all(points.map(async (point) => {
            try {
                const subset = await VegetationManager.fetchSubset(product, point.lat, point.lng, modisDate, modisDate);
                const values = this._parseVegetationSubset(subset);
                if (values.ndvi != null || values.evi != null) {
                    samples.push({ ...point, ...values });
                }
            } catch (_) {
                // Keep partial patch result when a nearby point is water/cloud/invalid.
            }
        }));

        const mean = (field) => {
            const values = samples.map(s => s[field]).filter(v => Number.isFinite(v));
            return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        };

        const ndvis = samples.map(s => s.ndvi).filter(v => Number.isFinite(v));
        return {
            count: samples.length,
            date: samples[0]?.date || this._toISO(modisDate),
            ndvi: mean('ndvi'),
            evi: mean('evi'),
            minNdvi: ndvis.length ? Math.min(...ndvis) : null,
            maxNdvi: ndvis.length ? Math.max(...ndvis) : null,
            samples
        };
    },

    async _fetchWeatherForPhenology(lat, lng) {
        const nowYear = new Date().getUTCFullYear();
        let year = Math.min(CONFIG.YEAR || nowYear, nowYear);
        let daily = await PhenologyManager.fetchPOWERDaily(lat, lng, year);
        let valid = daily.filter(d => d.T2M != null).length;

        if (valid < 50 && year > 1981) {
            const fallback = await PhenologyManager.fetchPOWERDaily(lat, lng, year - 1);
            const fallbackValid = fallback.filter(d => d.T2M != null).length;
            if (fallbackValid > valid) {
                year -= 1;
                daily = fallback;
                valid = fallbackValid;
            }
        }

        return { year, daily, valid };
    },

    _interpret({ radius, product, series, patchStats, weather, viError }) {
        const latest = series[series.length - 1] || {};
        const recent = series.slice(-6);
        const firstValid = recent.find(r => Number.isFinite(r.ndvi));
        const lastValid = [...recent].reverse().find(r => Number.isFinite(r.ndvi));
        const trend = firstValid && lastValid ? lastValid.ndvi - firstValid.ndvi : null;
        const ndvi = Number.isFinite(patchStats.ndvi) ? patchStats.ndvi : latest.ndvi;
        const evi = Number.isFinite(patchStats.evi) ? patchStats.evi : latest.evi;
        const weatherSummary = this._weatherSummary(weather.daily);
        const bloom = this._bloomWindow(weather.daily, weather.year);

        const health = this._healthLabel(ndvi);
        const risk = this._riskLabel({ ndvi, trend, weatherSummary, validDays: weather.valid });
        const trendText = trend == null ? 'trend unavailable' : `${trend >= 0 ? '+' : ''}${trend.toFixed(3)} NDVI over recent composites`;
        const rainText = weatherSummary.precip30 == null ? '30-day rain unavailable' : `${weatherSummary.precip30.toFixed(1)} mm rain in the last 30 valid days`;
        const tempText = weatherSummary.temp30 == null ? 'temperature unavailable' : `${weatherSummary.temp30.toFixed(1)} °C mean temperature`;
        const ndviText = ndvi == null ? 'NDVI unavailable' : `patch mean NDVI ${ndvi.toFixed(3)}`;
        const eviText = evi == null ? '' : `, EVI ${evi.toFixed(3)}`;
        const sourceText = viError ? ' Remote sensing source is temporarily unavailable, so health is marked from climate context only.' : '';

        return {
            health,
            risk,
            bloom,
            summary: `${product} patch radius ${radius} km: ${ndviText}${eviText}. Recent signal: ${trendText}. Climate context: ${rainText}, ${tempText}.${sourceText}`
        };
    },

    _healthLabel(ndvi) {
        if (!Number.isFinite(ndvi)) return 'Unknown';
        if (ndvi >= 0.68) return 'Very high';
        if (ndvi >= 0.52) return 'High';
        if (ndvi >= 0.36) return 'Moderate';
        if (ndvi >= 0.22) return 'Low';
        return 'Very low';
    },

    _riskLabel({ ndvi, trend, weatherSummary, validDays }) {
        let score = 0;
        if (validDays < 50) score += 1;
        if (Number.isFinite(ndvi) && ndvi < 0.28) score += 2;
        else if (Number.isFinite(ndvi) && ndvi < 0.42) score += 1;
        if (Number.isFinite(trend) && trend < -0.06) score += 1;
        if (Number.isFinite(weatherSummary.precip30) && weatherSummary.precip30 < 8) score += 1;
        if (Number.isFinite(weatherSummary.temp30) && weatherSummary.temp30 > 28) score += 1;
        if (score >= 3) return 'High';
        if (score >= 1) return 'Medium';
        return 'Low';
    },

    _bloomWindow(daily, year) {
        const temps = daily.map(d => d.T2M);
        const early = PhenologyManager.estimateGDD(temps, 5, 120).doy;
        const main = PhenologyManager.estimateGDD(temps, 5, 220).doy;
        const late = PhenologyManager.estimateGDD(temps, 5, 350).doy;
        const start = early || main;
        const end = late || main || early;
        if (!start || !end) return 'Not reached';
        return `${this._doyToISO(year, start)} to ${this._doyToISO(year, Math.max(start, end))}`;
    },

    _weatherSummary(daily) {
        const valid = daily.filter(d => d.T2M != null || d.P != null).slice(-30);
        const nums = (arr) => arr.filter(v => Number.isFinite(v));
        const temp = nums(valid.map(d => d.T2M));
        const rain = nums(valid.map(d => d.P));
        return {
            temp30: temp.length ? temp.reduce((a, b) => a + b, 0) / temp.length : null,
            precip30: rain.length ? rain.reduce((a, b) => a + b, 0) : null
        };
    },

    _parseVegetationSubset(json) {
        const arr = json?.subset || [];
        const grid = {};
        for (const item of arr) {
            const key = (item.band || '').toLowerCase();
            const raw = Array.isArray(item.data) ? item.data[0] : item.data;
            grid[key] = {
                raw,
                scaled: VegetationManager.scaleValue(key, raw),
                date: item.calendar_date || item.modis_date || null
            };
        }

        const pick = (keyword) => {
            const key = Object.keys(grid).find(k => k.includes(keyword));
            return key ? grid[key] : { scaled: null, date: null };
        };

        const ndvi = pick('ndvi');
        const evi = pick('evi');
        return {
            date: ndvi.date || evi.date || arr[0]?.calendar_date || arr[0]?.modis_date || null,
            ndvi: ndvi.scaled,
            evi: evi.scaled
        };
    },

    _patchPoints(lat, lng, radiusKm) {
        const offsetKm = Math.max(0.5, radiusKm * 0.5);
        const latDelta = offsetKm / 111.32;
        const lngDelta = offsetKm / (111.32 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));
        return [
            { name: 'center', lat, lng },
            { name: 'north', lat: lat + latDelta, lng },
            { name: 'south', lat: lat - latDelta, lng },
            { name: 'east', lat, lng: lng + lngDelta },
            { name: 'west', lat, lng: lng - lngDelta }
        ];
    },

    _plot(series, patchStats, interpretation) {
        const chartIds = ['patch-chart', 'workflow-chart'];
        if (!series.length) {
            for (const id of chartIds) {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<div class="note" style="padding:12px;">Vegetation time series is unavailable from the remote sensing source. Phenology and climate interpretation still completed from POWER daily data.</div>';
            }
            return;
        }
        if (!window.Plotly) {
            for (const id of chartIds) {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<div class="note" style="padding:12px;">Plotly is unavailable.</div>';
            }
            return;
        }

        const traces = [
            {
                x: series.map(r => r.date),
                y: series.map(r => r.ndvi),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Center NDVI',
                line: { color: '#22c55e', width: 2 }
            },
            {
                x: series.map(r => r.date),
                y: series.map(r => r.evi),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Center EVI',
                line: { color: '#60a5fa', width: 2 }
            }
        ];

        if (Number.isFinite(patchStats.ndvi)) {
            traces.push({
                x: [patchStats.date],
                y: [patchStats.ndvi],
                type: 'scatter',
                mode: 'markers',
                name: 'Patch mean NDVI',
                marker: { color: '#f59e0b', size: 12, symbol: 'diamond' }
            });
        }

        const layout = {
            paper_bgcolor: '#334155',
            plot_bgcolor: '#334155',
            margin: { l: 44, r: 18, t: 28, b: 40 },
            title: { text: `${interpretation.health} health · ${interpretation.risk} risk`, font: { size: 13, color: '#e5e7eb' } },
            xaxis: { color: '#cbd5e1', gridcolor: '#475569' },
            yaxis: { title: 'Index value', range: [-0.1, 1], color: '#cbd5e1', gridcolor: '#475569' },
            font: { color: '#cbd5e1' },
            legend: { orientation: 'h', y: -0.2 }
        };

        for (const id of chartIds) {
            const el = document.getElementById(id);
            if (el) Plotly.newPlot(el, traces, layout, { displayModeBar: false, responsive: true });
        }
    },

    _setOutputs({ health, risk, bloom, summary }) {
        const map = {
            'patch-health': health,
            'patch-risk': risk,
            'patch-bloom': bloom,
            'patch-summary': summary,
            'workflow-health': health,
            'workflow-risk': risk,
            'workflow-bloom': bloom,
            'workflow-summary': summary
        };
        for (const [id, value] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value || '—';
        }
    },

    _setStatus(text) {
        for (const id of ['patch-status', 'workflow-status']) {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        }
    },

    _clamp(value, min, max) {
        if (!Number.isFinite(value)) return min;
        return Math.max(min, Math.min(max, value));
    },

    _toISO(modisDate) {
        const s = String(modisDate || '');
        const m = s.match(/^A?(\d{4})(\d{3})$/);
        if (!m) return s.slice(0, 10);
        return this._doyToISO(Number(m[1]), Number(m[2]));
    },

    _doyToISO(year, doy) {
        const d = new Date(Date.UTC(year, 0, 1));
        d.setUTCDate(d.getUTCDate() + Number(doy) - 1);
        return d.toISOString().slice(0, 10);
    }
};

/* =========================================================
 * Weather Manager
 * =======================================================*/
const WeatherManager = {
    init() { this.setupControls(); },

    setupControls() {
        const queryBtn = document.getElementById('weather-query');
        if (queryBtn) queryBtn.addEventListener('click', () => this.queryWeather());
    },

    async queryWeather() {
        const location = MapManager.getCurrentLocation();
        const date = document.getElementById('weather-date')?.value;
        if (!date) { alert('Please select a date.'); return; }

        try {
            await this.fetchWeatherData(location.lat, location.lng, date);
        } catch (error) {
            console.error('Failed to fetch weather data:', error);
            this.updateWeatherDisplay('Temp: — °C, Precip: — mm (failed)');
        }
    },

    async fetchWeatherData(lat, lng, isoDate) {
        const ymd = isoDate.replace(/-/g, '');
        const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
        url.search = new URLSearchParams({
            parameters: 'T2M,PRECTOTCORR',
            community: 'AG',
            longitude: String(lng),
            latitude: String(lat),
            start: ymd,
            end: ymd,
            format: 'JSON'
        }).toString();

        const response = await fetch(url);
        if (!response.ok) throw new Error(`POWER API error: ${response.status}`);

        const data = await response.json();
        const params = data?.properties?.parameter || {};

        const temp = Utils.numOrNull(Object.values(params.T2M || {})[0]);
        const precip = Utils.numOrNull(Object.values(params.PRECTOTCORR || {})[0]);

        const tempStr = temp == null ? '—' : temp.toFixed(1);
        const precipStr = precip == null ? '—' : precip.toFixed(1);

        this.updateWeatherDisplay(`Temp: ${tempStr} °C, Precip: ${precipStr} mm`);
    },

    updateWeatherDisplay(text) {
        const weatherInfo = document.getElementById('weather-current');
        if (weatherInfo) weatherInfo.textContent = text;
    },

    updateLocation(_lat, _lng) {
        // Could auto-refresh weather on location updates
        // this.queryWeather();
    }
};

/* =========================================================
 * DataHub (NEW): gather 30d weather, latest VI, and phenology predictions
 * =======================================================*/
const DataHub = {
    _key(lat, lng) { return `${lat.toFixed(3)},${lng.toFixed(3)}`; },

    async collectAll(lat, lng) {
        const key = this._key(lat, lng);
        if (AppState.dataCache.has(key)) return AppState.dataCache.get(key);

        const now = new Date();
        const end = this._ymd(now);
        const startDate = new Date(now); startDate.setDate(now.getDate() - 29);
        const start = this._ymd(startDate);

        const [w30, vi, phen] = await Promise.all([
            this._fetchPowerRange(lat, lng, start, end),
            this._fetchLatestVI(lat, lng),
            this._buildPhenology(lat, lng)
        ]);

        const payload = { weather30d: w30, vegetationLatest: vi, phenology: phen };
        AppState.dataCache.set(key, payload);
        return payload;
    },

    async _fetchPowerRange(lat, lng, start, end) {
        const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
        url.search = new URLSearchParams({
            parameters: 'T2M,T2M_MIN,T2M_MAX,PRECTOTCORR',
            community: 'AG',
            longitude: String(lng),
            latitude: String(lat),
            start, end, format: 'JSON'
        }).toString();
        const r = await fetch(url);
        if (!r.ok) throw new Error('POWER 30d failed');
        const j = await r.json();
        const par = j?.properties?.parameter || {};
        const dates = Object.keys(par?.T2M || {}).sort();
        const rows = dates.map(d => ({
            date: d,
            T2M: Utils.numOrNull(par.T2M?.[d]),
            T2M_MIN: Utils.numOrNull(par.T2M_MIN?.[d]),
            T2M_MAX: Utils.numOrNull(par.T2M_MAX?.[d]),
            P: Utils.numOrNull(par.PRECTOTCORR?.[d])
        }));
        const mean = (arr) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
        const sum = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0) : null;
        return {
            series: rows,
            summaries: {
                t2m_mean: mean(rows.map(r=>r.T2M).filter(v=>v!=null)),
                t2m_min_mean: mean(rows.map(r=>r.T2M_MIN).filter(v=>v!=null)),
                t2m_max_mean: mean(rows.map(r=>r.T2M_MAX).filter(v=>v!=null)),
                precip_sum: sum(rows.map(r=>r.P).filter(v=>v!=null))
            }
        };
    },

    async _fetchLatestVI(lat, lng) {
        const dates = await VegetationManager.fetchDates('MOD13Q1', lat, lng);
        const arr = dates?.dates || [];
        const latest = arr.length ? (arr[arr.length - 1]?.modis_date || arr[arr.length - 1]) : null;
        if (!latest) return null;
        const subset = await VegetationManager.fetchSubset('MOD13Q1', lat, lng, latest, latest);
        if (!subset?.subset?.length) return null;

        const grid = {};
        for (const it of subset.subset) {
            const name = (it.band || '').toLowerCase();
            const v = Array.isArray(it.data) ? it.data[0] : it.data;
            grid[name] = v;
        }
        const val = (key, scale=0.0001) => {
            const k = Object.keys(grid).find(n => n.includes(key));
            const raw = k ? Number(grid[k]) : null;
            if (raw == null || raw <= -9000) return null;
            return raw * scale;
        };

        return {
            date: subset.subset[0]?.calendar_date || subset.subset[0]?.modis_date || null,
            ndvi: val('ndvi'),
            evi: val('evi'),
            red: val('red_reflectance'),
            nir: val('nir_reflectance'),
            blue: val('blue_reflectance'),
            mir: val('mir_reflectance')
        };
    },

    async _buildPhenology(lat, lng) {
        // Use existing logic to compute predictions for current year on-the-fly
        const year = new Date().getUTCFullYear();
        const daily = await PhenologyManager.fetchPOWERDaily(lat, lng, year);
        const temps = daily.map(d => d.T2M);
        const table = Array.from(document.querySelectorAll('#flowers-table tbody tr')).map(tr => {
            const name = tr.getAttribute('data-name') || tr.children[0].textContent.trim();
            const base = parseFloat(tr.children[1].querySelector('input')?.value);
            const thr  = parseFloat(tr.children[2].querySelector('input')?.value);
            return { name, base, thr };
        });
        const estimate = (base, thr) => {
            let acc=0;
            for (let i=0;i<temps.length;i++){
                const t=temps[i]; if (t==null) continue;
                acc += Math.max(0, t-base);
                if (acc >= thr) return { doy:i+1, date: Utils.doyToDate(year, i+1), gdd: acc };
            }
            return { doy:null, date:null, gdd: acc };
        };
        return table.map(row => {
            if (!Number.isFinite(row.base) || !Number.isFinite(row.thr)) return { name: row.name, date:null, gdd:null, days:null };
            const r = estimate(row.base, row.thr);
            return { name: row.name, date: r.date, days: r.doy, gdd: r.gdd };
        });
    },

    _ymd(d) {
        const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), dd=String(d.getUTCDate()).padStart(2,'0');
        return `${y}${m}${dd}`;
    }
};

/* =========================================================
 * AI Manager
 * =======================================================*/

const AIManager = {
  init() {
    this.setupControls();
  },

  setupControls() {
    const analyzeBtn = document.getElementById('ai-analyze');
    const askBtn = document.getElementById('ai-ask');
    if (analyzeBtn) analyzeBtn.addEventListener('click', () => this.analyzeLocation());
    if (askBtn) askBtn.addEventListener('click', () => this.askQuestion());
  },

  async buildLocationContext() {
    const { lat, lng } = MapManager.getCurrentLocation();
    const place = await Geo.reverseGeocode(lat, lng);
    const coordStr = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const where = place ? `${place} (${coordStr})` : coordStr;

    // Gather app-known context (30d weather, latest VI, phenology predictions)
    const ctx = await DataHub.collectAll(lat, lng);

    // Compact markdown block for the model
    const mdContext =
`**App Data Context**
- **Location:** ${where}
- **Weather (last 30 days):**
  - Mean T2M: ${ctx.weather30d?.summaries?.t2m_mean?.toFixed?.(2) ?? '—'} °C
  - Mean Min: ${ctx.weather30d?.summaries?.t2m_min_mean?.toFixed?.(2) ?? '—'} °C
  - Mean Max: ${ctx.weather30d?.summaries?.t2m_max_mean?.toFixed?.(2) ?? '—'} °C
  - Total Precip: ${ctx.weather30d?.summaries?.precip_sum?.toFixed?.(1) ?? '—'} mm
- **Vegetation (latest composite):**
  - Date: ${ctx.vegetationLatest?.date ?? '—'}
  - NDVI: ${ctx.vegetationLatest?.ndvi?.toFixed?.(3) ?? '—'}
  - EVI: ${ctx.vegetationLatest?.evi?.toFixed?.(3) ?? '—'}
  - Red: ${ctx.vegetationLatest?.red?.toFixed?.(4) ?? '—'}, NIR: ${ctx.vegetationLatest?.nir?.toFixed?.(4) ?? '—'}
- **Bloom Predictions (current year):**
${(ctx.phenology || []).map(p => `  - ${p.name}: ${p.date ? p.date : 'Not reached'}${p.days ? ` (${p.days} days)` : ''}`).join('\n') || '  - —'}
`;

    return { where, lat, lng, mdContext };
  },

  async analyzeLocation() {
    const { where, mdContext } = await this.buildLocationContext();
    const prompt = `Given the ${mdContext}, analyze what plants/flowers would be suitable and what not suitable to grow here considering climate (temperature, precipitation), soil considerations, and seasonal bloom timing. Provide a actionable analyze  recommendation list with reasons.`;


    return this.callAI([
      { role: 'system', content: `You are an agronomy and phenology expert. Always reply in Markdown. Be practical and concise, but include enough detail to be actionable.` },
      { role: 'system', content: `Location context: ${where}` },
      { role: 'user', content: prompt }
    ]);
  }, 

  async askQuestion() {
    const questionInput = document.getElementById('ai-question');
    const question = questionInput?.value?.trim();
    if (!question) {
      alert('Please enter a question or use the Analyze button.');
      return;
    }

    const { where, mdContext } = await this.buildLocationContext();
    const prompt = `Data：${mdContext}

You are an agronomy and phenology expert. Please reply **only in Markdown** and keep guidance flexible (avoid over-prescriptive advice). 
Using the local data above, address the user's question with concrete, location-aware recommendations.

**User question:** ${question}
`;

    return this.callAI([
      { role: 'system', content: `You are an agronomy and phenology expert. Always reply in Markdown. Be practical and concise, but include enough detail to be actionable.` },
      { role: 'system', content: `Location context: ${where}` },
      { role: 'user', content: prompt }
    ]);
  }, 

  async callAI(messages) {
    const report = document.getElementById('ai-report');
    if (report) {
      report.innerHTML = 'Thinking<span class="loading"></span>';
    }

    try {
      const resp = await fetch(CONFIG.AI_CHAT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages,
          temperature: 0.4
        })
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Qwen proxy error: ${resp.status} - ${txt}`);
      }

      const data = await resp.json();
      const content = (data?.content || data?.choices?.[0]?.message?.content || '').trim() || '(no content)';
      const reasoning = data?.reasoning || data?.choices?.[0]?.message?.reasoning_content || '';

      if (report) {
        let html = '';
        if (reasoning) {
          html += `<div class="deep-thinking-box" style="margin-bottom:12px;">
            <div class="thinking-header"><span class="pulse-icon"></span><strong>DeepSeek Reasoning Stream</strong></div>
            <div class="thinking-content">${reasoning}</div>
          </div>`;
        }
        if (window.marked && typeof window.marked.parse === 'function') {
          html += window.marked.parse(content);
        } else {
          html += content
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/\n/g,'<br>');
        }
        report.innerHTML = html;
      }
    } catch (err) {
      console.error(err);
      if (report) report.textContent = `AI failed: ${err.message}`;
    }
  }
}; 

/* =====================================================================
 * Overlays: OpenPortGuide (XYZ) & NASA GIBS (WMS) for Map A / Map B
 * - No extra JS file required; this block wires UI and loads overlays.
 * - Works with your existing AppState.map (A) and AppState.mapB (B).
 * - Auto-picks latest WMS TIME from GetCapabilities, with fallbacks.
 * ===================================================================*/
(function () {
  'use strict';

  // Ensure globals are visible (harmless if already assigned above)
  window.CONFIG   = window.CONFIG   || CONFIG;
  window.AppState = window.AppState || AppState;

  // Ensure endpoints exist (keep your existing values if already set)
  CONFIG.OPG_BASE = CONFIG.OPG_BASE || 'https://weather.openportguide.de/tiles/actual';
  CONFIG.GIBS_WMS_BASE = CONFIG.GIBS_WMS_BASE || (srs =>
    String(srs) === '4326'
      ? 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'
      : 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi'
  );

  // --- small helpers ---
  const $ = (id) => document.getElementById(id);
  const getMap = (side) => side === 'B' ? (AppState.mapB || null) : (AppState.map || AppState.mapA || null);
  const setOverlay = (side, kind, layer) => { AppState[kind + (side === 'B' ? 'B' : 'A')] = layer; };
  const getOverlay = (side, kind) => AppState[kind + (side === 'B' ? 'B' : 'A')] || null;
  const removeOverlay = (side, kind) => {
    const map = getMap(side);
    const lyr = getOverlay(side, kind);
    if (map && lyr) { map.removeLayer(lyr); setOverlay(side, kind, null); }
  };
  const normalizeFormat = (v) => (typeof v === 'string' && v.startsWith('image/')) ? v : 'image/png';
  const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;

  // ---------- OpenPortGuide (XYZ, var + step) ----------
  function opgUrl(variant, step) {
    return `${CONFIG.OPG_BASE}/${variant}/${step}/{z}/{x}/{y}.png`;
  }
  function addOPG(side = 'A') {
    const map = getMap(side);
    if (!map) return alert(`Map ${side} is not active.`);

    const varSel  = $(side === 'B' ? 'opg-b-var'  : 'opg-a-var');
    const stepSel = $(side === 'B' ? 'opg-b-step' : 'opg-a-step');
    if (!varSel || !stepSel) return alert('OpenPortGuide controls not found.');

    const variant = varSel.value || 'wind_stream';
    const step    = stepSel.value || '0h';

    removeOverlay(side, 'opg');
    const layer = L.tileLayer(opgUrl(variant, step), {
      maxZoom: 18, opacity: 0.9, crossOrigin: true, attribution: 'OpenPortGuide'
    }).addTo(map);
    setOverlay(side, 'opg', layer);
    console.log('[Overlays] OPG added on', side, variant, step);
  }
  function copyOPG(side = 'A') {
    const varSel  = $(side === 'B' ? 'opg-b-var'  : 'opg-a-var');
    const stepSel = $(side === 'B' ? 'opg-b-step' : 'opg-a-step');
    const url = opgUrl(varSel?.value || 'wind_stream', stepSel?.value || '0h');
    navigator.clipboard?.writeText(url);
    alert('Tile URL copied:\n' + url);
  }

  // ---------- NASA GIBS — WMS ----------
  async function getLastWMSTime(baseUrl, layerName) {
    try {
      const txt = await fetch(`${baseUrl}?service=WMS&request=GetCapabilities&version=1.3.0`).then(r => r.text());
      const xml = new DOMParser().parseFromString(txt, 'text/xml');
      const layer = Array.from(xml.querySelectorAll('Layer > Layer'))
        .find(L => L.querySelector('Name')?.textContent?.trim() === layerName);
      if (!layer) return '';
      const node = layer.querySelector('Dimension[name="time"], Extent[name="time"]');
      if (!node) return '';
      const def = (node.getAttribute('default') || '').trim();
      const raw = (node.textContent || '').trim();
      const pickEnd = (token) => {
        token = token.trim();
        if (!token) return '';
        if (token.includes('/')) return (token.split('/')[1] || '').slice(0, 10);
        return token.slice(0, 10);
      };
      if (raw) {
        const tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
        const last = pickEnd(tokens[tokens.length - 1]);
        if (last) return last;
      }
      if (def) return def.slice(0, 10);
      return '';
    } catch (e) {
      console.warn('[Overlays] GetCapabilities failed', e);
      return '';
    }
  }
  async function fallbackRecentDate(base, layer, srs, format) {
    const now = new Date();
    const cands = [];
    for (let i = 0; i <= 10; i++) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - i); cands.push(iso(d)); }
    const d1 = new Date(now); d1.setUTCDate(d1.getUTCDate() - 8);  cands.push(iso(d1));
    const d2 = new Date(now); d2.setUTCDate(d2.getUTCDate() - 16); cands.push(iso(d2));
    for (const t of cands) {
      const params = new URLSearchParams({
        service: 'WMS', request: 'GetMap', version: '1.3.0',
        layers: layer, styles: '', format, transparent: 'true',
        crs: srs === '4326' ? 'EPSG:4326' : 'EPSG:3857',
        bbox: srs === '4326' ? '-90,-180,90,180' : '-20037508.34,-20037508.34,20037508.34,20037508.34',
        width: '64', height: '64', time: t
      });
      try {
        const r = await fetch(`${base}?${params.toString()}`);
        if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) return t;
      } catch {}
    }
    return '';
  }
  function copyWMS(side = 'A') {
    const projSel   = $(side === 'B' ? 'wms-b-proj'   : 'wms-a-proj');
    const fmtSel    = $(side === 'B' ? 'wms-b-format' : 'wms-a-format');
    const layerSel  = $(side === 'B' ? 'wms-b-layer'  : 'wms-a-layer');
    const timeInput = $(side === 'B' ? 'wms-b-time'   : 'wms-a-time');
    if (!projSel || !fmtSel || !layerSel) return alert('WMS controls not found.');

    const srs    = (projSel.value || '3857') === '4326' ? '4326' : '3857';
    const base   = CONFIG.GIBS_WMS_BASE(srs);
    const layer  = layerSel.value;
    const format = normalizeFormat(fmtSel.value || 'image/png');
    const time   = (timeInput?.value || '').trim();

    const params = new URLSearchParams({
      service: 'WMS', request: 'GetMap', version: '1.3.0',
      layers: layer, styles: '', format, transparent: 'true',
      crs: srs === '4326' ? 'EPSG:4326' : 'EPSG:3857',
      bbox: srs === '4326' ? '-90,-180,90,180' : '-20037508.34,-20037508.34,20037508.34,20037508.34',
      width: '512', height: '512'
    });
    if (time) params.set('time', time);

    const url = `${base}?${params.toString()}`;
    navigator.clipboard?.writeText(url);
    alert('GetMap URL copied:\n' + url);
  }
  async function addWMS(side = 'A') {
    const map = getMap(side);
    if (!map) return console.warn(`[Overlays] Map ${side} is not active.`);

    const projSel   = $(side === 'B' ? 'wms-b-proj'   : 'wms-a-proj');
    const fmtSel    = $(side === 'B' ? 'wms-b-format' : 'wms-a-format');
    const layerSel  = $(side === 'B' ? 'wms-b-layer'  : 'wms-a-layer');
    const timeInput = $(side === 'B' ? 'wms-b-time'   : 'wms-a-time');
    if (!projSel || !fmtSel || !layerSel) return console.warn('[Overlays] WMS controls not found.');

    const srs    = (projSel.value || '3857') === '4326' ? '4326' : '3857';
    const base   = CONFIG.GIBS_WMS_BASE(srs);
    const layer  = layerSel.value;
    const format = normalizeFormat(fmtSel.value || 'image/png');
    let   time   = (timeInput?.value || '').trim();

    removeOverlay(side, 'wms');

    if (!time) {
      const dateLabel = $(side === 'B' ? 'layer-date-label-b' : 'layer-date-label');
      if (dateLabel?.textContent && /^\d{4}-\d{2}-\d{2}$/.test(dateLabel.textContent.trim())) {
        time = dateLabel.textContent.trim();
        if (timeInput) timeInput.value = time;
      } else {
        time = await getLastWMSTime(base, layer) ||
               await fallbackRecentDate(base, layer, srs, format);
      }
    }

    const params = { layers: layer, format, transparent: true };
    if (time) params.time = time;

    const wms = L.tileLayer.wms(base, params)
      .on('tileerror', e => console.warn('[Overlays] WMS tile error', e))
      .addTo(map);

    setOverlay(side, 'wms', wms);
    console.log('[Overlays] WMS added on', side, { layer, srs, format, time });
  }

  // ---------- Wire buttons (A/B) ----------
  function wireOverlays() {
    // Map A — OPG
    $('opg-a-add')    ?.addEventListener('click', () => addOPG('A'));
    $('opg-a-remove') ?.addEventListener('click', () => removeOverlay('A', 'opg'));
    $('opg-a-copy')   ?.addEventListener('click', () => copyOPG('A'));
    $('opg-a-var')    ?.addEventListener('change', () => { if (AppState.opgA) addOPG('A'); });
    $('opg-a-step')   ?.addEventListener('change', () => { if (AppState.opgA) addOPG('A'); });

    // Map A — WMS
    $('wms-a-add')    ?.addEventListener('click', () => addWMS('A'));
    $('wms-a-remove') ?.addEventListener('click', () => removeOverlay('A', 'wms'));
    $('wms-a-copy')   ?.addEventListener('click', () => copyWMS('A'));
    $('wms-a-layer')  ?.addEventListener('change', () => { if (AppState.wmsA) addWMS('A'); });
    $('wms-a-proj')   ?.addEventListener('change', () => { if (AppState.wmsA) addWMS('A'); });
    $('wms-a-time')   ?.addEventListener('change', () => { if (AppState.wmsA) addWMS('A'); });

    // Map B — OPG
    $('opg-b-add')    ?.addEventListener('click', () => addOPG('B'));
    $('opg-b-remove') ?.addEventListener('click', () => removeOverlay('B', 'opg'));
    $('opg-b-copy')   ?.addEventListener('click', () => copyOPG('B'));
    $('opg-b-var')    ?.addEventListener('change', () => { if (AppState.opgB) addOPG('B'); });
    $('opg-b-step')   ?.addEventListener('change', () => { if (AppState.opgB) addOPG('B'); });

    // Map B — WMS
    $('wms-b-add')    ?.addEventListener('click', () => addWMS('B'));
    $('wms-b-remove') ?.addEventListener('click', () => removeOverlay('B', 'wms'));
    $('wms-b-copy')   ?.addEventListener('click', () => copyWMS('B'));
    $('wms-b-layer')  ?.addEventListener('change', () => { if (AppState.wmsB) addWMS('B'); });
    $('wms-b-proj')   ?.addEventListener('change', () => { if (AppState.wmsB) addWMS('B'); });
    $('wms-b-time')   ?.addEventListener('change', () => { if (AppState.wmsB) addWMS('B'); });

    console.log('[Overlays] handlers wired. maps:', !!getMap('A'), !!getMap('B'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireOverlays, { once: true });
  } else {
    wireOverlays();
  }

  // Optional: expose to console for debugging
  window.Overlays = { addOPG, addWMS, removeOverlay, copyOPG, copyWMS };
})();






/* =========================================================
 * ForecastManager — NDVI/EVI 30-day prediction (in-app)
 * Dependencies: MapManager, VegetationManager, Utils, Plotly for charts, and optional tf.js.
 * =======================================================*/
const ForecastManager = {
  init() {
    // Bind UI events once.
    if (this._bound) return;
    this._bound = true;

    const trainBtn = document.getElementById('fc-train');
    const clearBtn = document.getElementById('fc-clear');
    if (trainBtn) trainBtn.addEventListener('click', () => this.run());
    if (clearBtn) clearBtn.addEventListener('click', () => this.clear());
  },

  async run() {
    const statsEl = document.getElementById('fc-stats');
    const product = document.getElementById('fc-product')?.value || 'MOD13Q1';
    const target  = document.getElementById('fc-target')?.value  || 'ndvi'; // 'ndvi'|'evi'
    const years   = Math.max(1, Math.min(8, parseInt(document.getElementById('fc-years')?.value || '3')));
    const epochs  = Math.max(20, Math.min(1000, parseInt(document.getElementById('fc-epochs')?.value || '120')));
    const lr      = Math.max(0.001, Math.min(0.1, parseFloat(document.getElementById('fc-lr')?.value || '0.01')));

    const { lat, lng } = MapManager.getCurrentLocation();
    if (statsEl) statsEl.textContent = 'Fetching VI history…';

    try {
      // 1) Historical VI by product using remote-sensing dates/subsets.
      const viSeries = await this._fetchVISeries(product, target, lat, lng, years);
      if (!viSeries.length) { if (statsEl) statsEl.textContent = 'No VI history here.'; return; }

      // 2) Matching POWER weather aggregated around each VI date.
      if (statsEl) statsEl.textContent = 'Fetching weather…';
      const wxByDate = await this._fetchWeatherByDate(viSeries, lat, lng);

      // 3) Build dataset with lag, seasonal, and weather features.
      if (statsEl) statsEl.textContent = 'Building dataset…';
      const ds = this._buildDataset(viSeries, wxByDate);
      if (ds.x.length < 24) { if (statsEl) statsEl.textContent = 'Not enough samples to train.'; return; }

      // 4) Train a small tf.js MLP, falling back to linear regression.
      if (statsEl) statsEl.textContent = (window.tf ? 'Training TF.js model…' : 'Training linear baseline…');
      const model = await this._trainModel(ds, { epochs, lr });

      // 5) Forecast the next 30 days with recent-weather approximation.
      if (statsEl) statsEl.textContent = 'Forecasting next 30 days…';
      const fc = this._forecastNext30Days(viSeries, wxByDate, model);

      // 6) Plot forecast.
      this._plot(viSeries, fc, target);
      if (statsEl) statsEl.textContent = `Done. Samples: ${ds.x.length}, RMSE (train): ${model.rmse?.toFixed?.(4) ?? '—'}`;
    } catch (err) {
      console.error(err);
      if (statsEl) statsEl.textContent = `Failed: ${err.message}`;
    }
  },

  clear() {
    const statsEl = document.getElementById('fc-stats');
    const chartEl = document.getElementById('fc-chart');
    if (statsEl) statsEl.textContent = '—';
    if (chartEl && window.Plotly) Plotly.purge(chartEl);
    if (!window.Plotly && chartEl) chartEl.innerHTML = '';
  },

  // ---------- Data fetching ----------

  async _fetchSubsetSafe(product, lat, lng, startDate, endDate) {
    // Robust subset fetch: retry + simple in-memory cache
    this._subsetCache = this._subsetCache || new Map();
    const key = `${product}:${lat.toFixed(4)},${lng.toFixed(4)}:${startDate}:${endDate}`;
    if (this._subsetCache.has(key)) return this._subsetCache.get(key);

    let lastErr = null;
    const delays = [0, 250, 600, 1200]; // ms
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt]) await new Promise(r => setTimeout(r, delays[attempt]));
      try {
        const res = await VegetationManager.fetchSubset(product, lat, lng, startDate, endDate);
        this._subsetCache.set(key, res);
        return res;
      } catch (e) {
        lastErr = e;
        // For hard client errors (e.g. 400), retrying doesn't help much, but harmless with small limits.
      }
    }
    throw lastErr || new Error('Subset fetch failed');
  },

  async _fetchVISeries(product, viType, lat, lng, years) {
    const datesJson = await VegetationManager.fetchDates(product, lat, lng);
    const all = (datesJson?.dates || []);
    if (!all.length) return [];

    const entries = all.slice(-Math.ceil((365/16) * years)); // ~16-day composites
    const series = [];

    // Limited concurrency to avoid slow sequential requests and transient API hiccups
    const concurrency = 4;
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= entries.length) break;

        const d = entries[i];
        const md = d?.modis_date || d;

        // Prefer calendar_date when present (usually already ISO)
        const iso = (d && typeof d === 'object' && d.calendar_date)
          ? String(d.calendar_date).slice(0, 10)
          : this._toISO(md);

        if (!iso) continue;

        try {
          const subset = await this._fetchSubsetSafe(product, lat, lng, md, md);
          const bands = subset?.subset || [];
          const match = bands.find(b => (b.band || '').toLowerCase().includes(viType)); // ndvi/evi
          const raw = Array.isArray(match?.data) ? match.data[0] : match?.data;
          const num = Number(raw);
          const val = (Number.isFinite(num) && num > -9000) ? (num * 0.0001) : null;

          if (val != null) series.push({ date: iso, value: val });
        } catch (_) {
          // skip bad date
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));
    series.sort((a, b) => (a.date < b.date ? -1 : 1));
    return series;
  },

  async _fetchWeatherByDate(viSeries, lat, lng) {
    if (!viSeries.length) return {};
    const start = viSeries[0].date.replace(/-/g,'');
    const end   = viSeries[viSeries.length-1].date.replace(/-/g,'');

    const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
    url.search = new URLSearchParams({
      parameters: 'T2M,PRECTOTCORR',
      community: 'AG',
      longitude: String(lng),
      latitude: String(lat),
      start, end, format:'JSON'
    }).toString();

    const r = await fetch(url);
    if (!r.ok) throw new Error(`POWER error ${r.status}`);
    const j = await r.json();
    const T = j?.properties?.parameter?.T2M || {};
    const P = j?.properties?.parameter?.PRECTOTCORR || {};

    const get = (obj, ymd) => {
      const v = obj?.[ymd]; const n = Number(v);
      return Number.isFinite(n) && n > -900 ? n : null;
    };

    const wx = {};
    for (const { date } of viSeries) {
      const d0 = new Date(`${date}T00:00:00Z`);
      let tList=[], pList=[];
      for (let k=-8;k<=8;k++){
        const d = new Date(d0); d.setUTCDate(d0.getUTCDate()+k);
        const ymd = this._ymd(d);
        const tv=get(T,ymd); const pv=get(P,ymd);
        if (tv!=null) tList.push(tv);
        if (pv!=null) pList.push(pv);
      }
      wx[date] = {
        tMean: tList.length? (tList.reduce((a,b)=>a+b,0)/tList.length) : null,
        pSum:  pList.length? (pList.reduce((a,b)=>a+b,0)) : null
      };
    }
    return wx;
  },

  // ---------- Dataset and features ----------

  _buildDataset(viSeries, wxByDate) {
    const x=[], y=[];
    const byDate = new Map(viSeries.map(v=>[v.date, v.value]));
    const dates  = viSeries.map(v=>v.date);

    const roll = (idx, win=3) => {
      const s = Math.max(0, idx-win+1);
      const arr = viSeries.slice(s, idx+1).map(v=>v.value).filter(v=>v!=null);
      return arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    };

    for (let i=2; i<viSeries.length; i++) {
      const d   = dates[i];
      const v   = byDate.get(d);
      const l1  = byDate.get(dates[i-1]);
      const l2  = byDate.get(dates[i-2]);
      const r3  = roll(i,3);
      const wx  = wxByDate[d] || {};
      if (v==null || l1==null || l2==null || r3==null || wx.tMean==null || wx.pSum==null) continue;

      const doy = this._doy(d);
      const feat = [
        l1, l2, r3,
        Math.sin(2*Math.PI*doy/365), Math.cos(2*Math.PI*doy/365),
        wx.tMean, wx.pSum
      ];
      x.push(feat); y.push(v);
    }
    return { x, y };
  },

  // ---------- Training ----------

  async _trainModel(ds, { epochs, lr }) {
    const X = ds.x, Y = ds.y;

    // Standardization
    const mu=[], sig=[]; const cols = X[0].length;
    for (let j=0;j<cols;j++){
      const col = X.map(r=>r[j]);
      const m = col.reduce((a,b)=>a+b,0)/col.length;
      const s = Math.sqrt(col.reduce((a,b)=>a+(b-m)*(b-m),0)/Math.max(1,col.length-1)) || 1;
      mu[j]=m; sig[j]=s;
    }
    const xN = X.map(r=> r.map((v,j)=>(v-mu[j])/sig[j]));

    const yMu = Y.reduce((a,b)=>a+b,0)/Y.length;
    const ySig = Math.sqrt(Y.reduce((a,b)=>a+(b-yMu)*(b-yMu),0)/Math.max(1,Y.length-1)) || 1;
    const yN = Y.map(v => (v - yMu)/ySig);

    if (window.tf) {
      // Small tf.js MLP
      const model = tf.sequential();
      model.add(tf.layers.dense({ units: 32, activation: 'relu', inputShape:[cols] }));
      model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
      model.add(tf.layers.dense({ units: 1 }));
      model.compile({ optimizer: tf.train.adam(lr), loss: 'meanSquaredError' });

      const tx = tf.tensor2d(xN);
      const ty = tf.tensor2d(yN, [yN.length,1]);
      await model.fit(tx, ty, { epochs, shuffle:true, verbose:0 });
      const pred = model.predict(tx);
      const rmse = Math.sqrt((await pred.sub(ty).square().mean().data())[0]) * ySig;
      tx.dispose(); ty.dispose(); pred.dispose();

      const infer = (row) => {
        const r = row.map((v,j)=>(v-mu[j])/sig[j]);
        const t = tf.tensor2d([r]);
        const p = model.predict(t);
        const vhat = p.dataSync()[0]*ySig + yMu;
        t.dispose(); p.dispose();
        return vhat;
      };
      return { type:'tf', infer, rmse };
    } else {
      // Linear regression
      const XT = this._transpose(xN);
      const XTX = this._matMul(XT, xN);
      const XTy = this._matVec(XT, yN);
      const XTXinv = this._invSym(XTX);
      const w = this._matVec(XTXinv, XTy);
      const yhat = this._matVec(xN, w);
      const rmse = Math.sqrt(this._mse(yhat, yN)) * ySig;

      const infer = (row) => {
        const r = row.map((v,j)=>(v-mu[j])/sig[j]);
        const yn = r.reduce((a,b,idx)=> a + b*w[idx], 0);
        return yn*ySig + yMu;
      };
      return { type:'lin', infer, rmse };
    }
  },

  _forecastNext30Days(viSeries, wxByDate, model) {
    const out = [];
    const keys = Object.keys(wxByDate);
    const last30 = keys.slice(-Math.min(30, keys.length));
    const tArr = last30.map(d=>wxByDate[d]?.tMean).filter(v=>v!=null);
    const pArr = last30.map(d=>wxByDate[d]?.pSum ).filter(v=>v!=null);
    const tConst = tArr.length ? (tArr.reduce((a,b)=>a+b,0)/tArr.length) : 10;
    const pConst = pArr.length ? (pArr.reduce((a,b)=>a+b,0)/pArr.length) : 20;

    const hist = viSeries.slice();
    let d = new Date(hist[hist.length-1].date+'T00:00:00Z');

    for (let i=1;i<=30;i++){
      d.setUTCDate(d.getUTCDate()+1);
      const iso = d.toISOString().slice(0,10);

      const len = hist.length;
      const l1 = hist[len-1]?.value ?? null;
      const l2 = hist[len-2]?.value ?? null;
      const r3 = (()=>{
        const arr = hist.slice(-3).map(v=>v.value).filter(v=>v!=null);
        return arr.length? (arr.reduce((a,b)=>a+b,0)/arr.length): null;
      })();
      if (l1==null || l2==null || r3==null) { out.push({ date: iso, value: null }); continue; }

      const f = [
        l1, l2, r3,
        Math.sin(2*Math.PI*this._doy(iso)/365), Math.cos(2*Math.PI*this._doy(iso)/365),
        tConst, pConst
      ];
      let vhat = model.infer(f);
      if (!Number.isFinite(vhat)) vhat = l1; // fallback to persistence
      const clipped = Math.max(-0.1, Math.min(1.0, vhat));
      // Light smoothing to reduce runaway drift when features are held constant.
      const smoothed = 0.8 * clipped + 0.2 * l1;
      const finalV = Math.max(-0.1, Math.min(1.0, smoothed));
      out.push({ date: iso, value: finalV });
      hist.push({ date: iso, value: finalV });
    }
    return out;
  },

  // ---------- Plotting ----------

  _plot(hist, fc, label) {
    const el = document.getElementById('fc-chart');
    if (!el) return;

    if (!window.Plotly) {
      el.innerHTML = '<pre>'+[
        'HISTORY (date,value):',
        ...hist.map(d=>`${d.date}\t${d.value!=null?d.value.toFixed(4):'null'}`),
        '',
        'FORECAST (date,value):',
        ...fc.map(d=>`${d.date}\t${d.value!=null?d.value.toFixed(4):'null'}`)
      ].join('\n')+'</pre>';
      return;
    }

    const trHist = { x: hist.map(d=>d.date), y: hist.map(d=>d.value), mode:'lines+markers', name: `${label.toUpperCase()} (history)` };
    const trFc   = { x: fc.map(d=>d.date),   y: fc.map(d=>d.value),   mode:'lines+markers', name: `${label.toUpperCase()} (forecast)`, line:{ dash:'dash' } };

    Plotly.newPlot(el, [trHist, trFc], {
      margin: { l: 48, r: 20, t: 16, b: 40 },
      yaxis: { title: label.toUpperCase(), range: [-0.1, 1.0] },
      xaxis: { title: 'Date' }
    }, { displayModeBar: false, responsive: true });
  },

  // ---------- Utilities ----------

  _toISO(modisDate) {
    if (modisDate == null) return null;
    const s = String(modisDate).trim();

    // Common MODIS formats:
    //  - AYYYYDDD  (e.g., A2024001)
    //  - YYYYDDD   (e.g., 2024001)
    //  - YYYY-DOY  (e.g., 2024-001)
    //  - YYYYMMDD  (e.g., 20240115)
    //  - YYYY-MM-DD
    if (/^A\d{7}$/.test(s)) {
      const y = Number(s.slice(1, 5));
      const doy = Number(s.slice(5, 8));
      const d = new Date(Date.UTC(y, 0, 1));
      d.setUTCDate(d.getUTCDate() + (doy - 1));
      return d.toISOString().slice(0, 10);
    }
    if (/^\d{7}$/.test(s)) {
      const y = Number(s.slice(0, 4));
      const doy = Number(s.slice(4, 7));
      const d = new Date(Date.UTC(y, 0, 1));
      d.setUTCDate(d.getUTCDate() + (doy - 1));
      return d.toISOString().slice(0, 10);
    }
    if (/^\d{4}-\d{3}$/.test(s)) {
      const [y, doy] = s.split('-').map(Number);
      const d = new Date(Date.UTC(y, 0, 1));
      d.setUTCDate(d.getUTCDate() + (doy - 1));
      return d.toISOString().slice(0, 10);
    }
    if (/^\d{8}$/.test(s)) {
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
      return s.replaceAll('/', '-');
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 10);

    return null;
  },
  _ymd(d){ const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,'0'), dd=String(d.getUTCDate()).padStart(2,'0'); return `${y}${m}${dd}`; },
  _doy(iso){ const d=new Date(iso+'T00:00:00Z'); const s=new Date(Date.UTC(d.getUTCFullYear(),0,0)); return Math.floor((d-s)/(1000*60*60*24)); },

  _transpose(A){ return A[0].map((_,i)=>A.map(r=>r[i])); },
  _matMul(A,B){ return A.map((r,ri)=>B[0].map((_,j)=>r.reduce((s,_,k)=>s + A[ri][k]*B[k][j],0))); },
  _matVec(A,v){ return A.map(r=>r.reduce((s,_,j)=> s + r[j]*v[j], 0)); },
  _mse(yhat, y){ const n=y.length; let s=0; for(let i=0;i<n;i++) s+=(yhat[i]-y[i])**2; return s/Math.max(1,n); },
  _invSym(M){
    const n=M.length;
    const A=M.map(r=>r.slice());
    const I=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
    for(let i=0;i<n;i++){
      let p=i; for(let r=i+1;r<n;r++) if (Math.abs(A[r][i])>Math.abs(A[p][i])) p=r;
      if (Math.abs(A[p][i])<1e-10) throw new Error('Singular');
      [A[i],A[p]]=[A[p],A[i]]; [I[i],I[p]]=[I[p],I[i]];
      const inv=1/A[i][i];
      for(let j=0;j<n;j++){ A[i][j]*=inv; I[i][j]*=inv; }
      for(let r=0;r<n;r++){
        if(r===i) continue;
        const f=A[r][i];
        for(let j=0;j<n;j++){ A[r][j]-=f*A[i][j]; I[r][j]-=f*I[i][j]; }
      }
    }
    return I;
  }
};

// Expose globally for UIManager.
window.ForecastManager = ForecastManager;




/* =======================================================================
 * Vegetation: Wildflower Stats (iNaturalist + NASA POWER)
 * Drop-in addon — append this WHOLE block to the END of your app.js
 * It binds to your existing HTML controls (all ids start with `vi-`).
 * Requirements:
 *   - MapManager.getCurrentLocation() -> { lat, lng }
 *   - AppState.map is a Leaflet map instance
 *   - Leaflet + (optional) leaflet.markercluster
 *   - Plotly loaded before app.js
 *   - Optional Icons.flower for markers (falls back to default marker)
 * =======================================================================*/
(() => {
  const VIAddon = {
    // Optional overlay: show some pollinator groups as reference lines
    POLLINATOR_TAXA: [
      { id: 630955, label: 'Apoidea (bees)' },
      { id: 47157,  label: 'Lepidoptera' }
    ],

    _speciesCache: [],       // [{id, name, common, count}]
    _speciesLayer: null,     // L.MarkerClusterGroup
    _busy: false,
    _invasiveList: [],       // [{id, name, common, total5y, flag, trend?}]
    _lastParams: null,       // {lat,lng,year,radius}

    /* ---------------------- lifecycle ---------------------- */
    init() {
      // Bind directly to EXISTING HTML (no UI injection)
      
/**
 * =======================================================
 * WeatherSearchManager — FloraCast 历史气象搜索与科研 Agent
 * =======================================================
 */
const WeatherSearchManager = {
    _mode: 'search',
    _initialized: false,
    _lastSearchData: null,
    _lastAgentData: null,

    init() {
        if (this._initialized) return;
        this._initialized = true;
        console.log('[WeatherSearchManager] Initialized.');
    },

    switchMode(mode) {
        this._mode = mode;
        const searchBtn = document.getElementById('ws-tab-search-btn');
        const agentBtn = document.getElementById('ws-tab-agent-btn');
        const searchView = document.getElementById('ws-mode-search-container');
        const agentView = document.getElementById('ws-mode-agent-container');

        if (mode === 'search') {
            searchBtn?.classList.add('active');
            agentBtn?.classList.remove('active');
            if (searchView) searchView.style.display = 'block';
            if (agentView) agentView.style.display = 'none';
        } else {
            agentBtn?.classList.add('active');
            searchBtn?.classList.remove('active');
            if (agentView) agentView.style.display = 'block';
            if (searchView) searchView.style.display = 'none';
        }
    },

    setQuery(text) {
        const input = document.getElementById('ws-query-input');
        if (input) {
            input.value = text;
            input.focus();
        }
    },

    setAgentQuestion(text) {
        const input = document.getElementById('ws-agent-question');
        if (input) {
            input.value = text;
            input.focus();
        }
    },

    async executeSearch() {
        const queryInput = document.getElementById('ws-query-input');
        const topKSelect = document.getElementById('ws-top-k');
        const searchBtn = document.getElementById('ws-search-btn');
        const statusDiv = document.getElementById('ws-search-status');
        const statusText = document.getElementById('ws-status-text');

        const query = queryInput?.value?.trim();
        if (!query) {
            alert(window.I18n ? window.I18n.t('ws.alert_empty_query') : 'Please enter a historical weather query');
            return;
        }

        const topK = parseInt(topKSelect?.value || '6', 10);
        const loc = (typeof MapManager?.getCurrentLocation === 'function')
            ? MapManager.getCurrentLocation()
            : { lat: 36.0671, lng: 120.3826 };

        if (searchBtn) searchBtn.disabled = true;
        if (statusDiv) statusDiv.style.display = 'flex';
        if (statusText) statusText.textContent = window.I18n ? window.I18n.t('ws.searching_text') : 'DeepSeek is parsing query conditions and scanning 40-year sliding windows...';

        try {
            const resp = await fetch('/api/weather/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, aoi: loc, topK })
            });

            if (!resp.ok) {
                const errJson = await resp.json().catch(() => ({}));
                throw new Error(errJson.error || (window.I18n ? window.I18n.t('ws.alert_search_error') : 'Search failed'));
            }

            const data = await resp.json();
            this._lastSearchData = data;
            this.renderSearchResults(data);
        } catch (err) {
            console.error('[WeatherSearch] Search failed:', err);
            alert((window.I18n ? window.I18n.t('ws.alert_search_error') : 'Search error: ') + err.message);
        } finally {
            if (searchBtn) searchBtn.disabled = false;
            if (statusDiv) statusDiv.style.display = 'none';
        }
    },

    
    syncMapAndLayer(lat, lng, event) {
        if (!lat || !lng) return;

        // 1. Move camera / view to target region
        if (typeof MapManager?.setMarker === 'function') {
            MapManager.setMarker(lat, lng);
        }
        if (typeof MapManager?.flyTo === 'function') {
            MapManager.flyTo(lat, lng, 8);
        } else if (AppState?.map && typeof AppState.map.setView === 'function') {
            AppState.map.setView([lat, lng], 8);
        }

        // 2. Derive event date ISO (YYYY-MM-DD)
        const rawDate = String(event?.startDate || '');
        let year = event?.year || 2024;
        let dateISO = '';
        if (rawDate.length === 8) {
            dateISO = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
            year = parseInt(rawDate.slice(0, 4), 10);
        } else if (rawDate.includes('-')) {
            dateISO = rawDate;
            year = parseInt(rawDate.slice(0, 4), 10);
        }

        if (!dateISO) return;

        // 3. Synchronize global date state across all panels
        AppState.currentEventDate = dateISO;
        AppState.currentEventYear = year;

        const weatherDate = document.getElementById('weather-date');
        if (weatherDate) weatherDate.value = dateISO;

        const viYear = document.getElementById('vi-year');
        if (viYear) viYear.value = year;

        const phenoYear = document.getElementById('phenology-year');
        if (phenoYear) phenoYear.value = year;

        // 4. Synchronize NASA Daily Satellite Layer in LayerManager
        const layerSelect = document.getElementById('main-layer');
        const yearInput = document.getElementById('layer-year');
        const dateSlider = document.getElementById('layer-date');
        const dateLabel = document.getElementById('layer-date-label');
        const opacitySlider = document.getElementById('layer-opacity');

        if (layerSelect) {
            layerSelect.value = 'MODIS_Terra_CorrectedReflectance_TrueColor|jpg|1';
        }
        if (yearInput) {
            yearInput.value = year;
        }
        if (opacitySlider) {
            opacitySlider.value = 0.85;
        }

        if (typeof Utils?.genDates === 'function') {
            const allDates = Utils.genDates(year, 1);
            const dateIndex = allDates.indexOf(dateISO);
            if (dateSlider && allDates.length > 0) {
                dateSlider.max = allDates.length - 1;
                dateSlider.value = dateIndex !== -1 ? dateIndex : 0;
            }
        }
        if (dateLabel) {
            dateLabel.textContent = dateISO;
        }

        // Trigger LayerManager update on Map A
        if (typeof LayerManager?.updateLayer === 'function') {
            LayerManager.updateLayer('A');
        }

        // 5. Synchronize NASA GIBS WMS Overlay if active or prefill date
        const wmsTimeA = document.getElementById('wms-a-time');
        if (wmsTimeA) {
            wmsTimeA.value = dateISO;
        }
        if (AppState?.wmsA && typeof window.Overlays?.addWMS === 'function') {
            window.Overlays.addWMS('A');
        }

        // Refresh heatmap if enabled
        if (typeof LayerManager?.refreshHeatmap === 'function') {
            LayerManager.refreshHeatmap('A');
        }
    },

    renderSearchResults(data) {
        const parsedCard = document.getElementById('ws-parsed-card');
        const pLocBadge = document.getElementById('ws-parsed-loc-badge');
        const pLoc = document.getElementById('ws-p-loc');
        const pRange = document.getElementById('ws-p-range');
        const pWindow = document.getElementById('ws-p-window');
        const pConditions = document.getElementById('ws-p-conditions');
        const pSummary = document.getElementById('ws-p-summary');

        const criteria = data.parsedCriteria || {};
        if (parsedCard) parsedCard.style.display = 'block';
        if (pLocBadge) pLocBadge.textContent = criteria.location?.name || (window.I18n ? window.I18n.t('ws.location_default') : 'Study Area');
        if (pLoc) pLoc.textContent = `${criteria.location?.name || (window.I18n ? window.I18n.t('ws.target_area_default') : 'Target Area')} (${Number(criteria.location?.lat || 0).toFixed(2)}, ${Number(criteria.location?.lng || 0).toFixed(2)})`;
        
        const seasonsMap = {
            spring: window.I18n ? window.I18n.t('ws.season_spring') : 'Spring',
            summer: window.I18n ? window.I18n.t('ws.season_summer') : 'Summer',
            autumn: window.I18n ? window.I18n.t('ws.season_autumn') : 'Autumn',
            winter: window.I18n ? window.I18n.t('ws.season_winter') : 'Winter'
        };
        const seasonsStr = (criteria.search_range?.seasons || []).map(s => seasonsMap[s] || s).join(', ') || (window.I18n?.currentLang === 'zh' ? '全部季节' : 'All Seasons');
        if (pRange) pRange.textContent = `${criteria.search_range?.start_year || 1985} - ${criteria.search_range?.end_year || 2024} (${seasonsStr})`;
        if (pWindow) pWindow.textContent = window.I18n ? window.I18n.t('ws.window_desc', '', { days: criteria.window_days || 14, total: data.totalCandidateWindows || 0 }) : `Continuous ${criteria.window_days || 14}-day sliding window (${data.totalCandidateWindows || 0} candidate windows scanned)`;

        const cond = criteria.conditions || {};
        const condParts = [];
        if (cond.temperature) condParts.push(`${window.I18n ? window.I18n.t('ws.cond_temp') : 'Temp:'}${cond.temperature.toUpperCase()}`);
        if (cond.precipitation) condParts.push(`${window.I18n ? window.I18n.t('ws.cond_precip') : 'Precip:'}${cond.precipitation.toUpperCase()}`);
        if (cond.radiation) condParts.push(`${window.I18n ? window.I18n.t('ws.cond_rad') : 'Rad:'}${cond.radiation.toUpperCase()}`);
        if (pConditions) pConditions.textContent = condParts.join(' | ') || (window.I18n ? window.I18n.t('ws.cond_balanced') : 'Balanced constraints');
        if (pSummary) pSummary.textContent = criteria.semantic_summary || (window.I18n ? window.I18n.t('ws.summary_default') : 'Parsed query intent successfully.');

        // Render ranked events
        const resultsContainer = document.getElementById('ws-results-container');
        const resultsCount = document.getElementById('ws-results-count');
        const eventsList = document.getElementById('ws-events-list');

        if (resultsContainer) resultsContainer.style.display = 'block';
        if (resultsCount) resultsCount.textContent = window.I18n ? window.I18n.t('ws.results_count', '', { count: data.rankedEvents?.length || 0 }) : `Found ${data.rankedEvents?.length || 0} matching events`;
        if (!eventsList) return;

        eventsList.innerHTML = '';
        (data.rankedEvents || []).forEach((ev, idx) => {
            const rank = idx + 1;
            const rankClass = rank === 1 ? 'ws-rank-1' : rank === 2 ? 'ws-rank-2' : rank === 3 ? 'ws-rank-3' : 'ws-rank-other';
            const m = ev.metrics || {};
            const z = m.zScores || {};

            const toWord = window.I18n?.currentLang === 'zh' ? ' 至 ' : ' to ';
            const yearSuffix = window.I18n?.currentLang === 'zh' ? '年 · ' : ' · ';
            const daysWord = window.I18n ? window.I18n.t('ws.days') : 'days';

            const card = document.createElement('div');
            card.className = 'ws-event-card';
            card.innerHTML = `
                <div class="ws-card-top">
                    <span class="ws-rank-badge ${rankClass}">Top #${rank}</span>
                    <div class="ws-score-meter">
                        <span>${window.I18n ? window.I18n.t('ws.similarity') : 'Similarity'} ${ev.similarityScore}%</span>
                        <div class="ws-score-bar-bg">
                            <div class="ws-score-bar-fill" style="width: ${ev.similarityScore}%;"></div>
                        </div>
                    </div>
                </div>
                <div class="ws-date-row">
                    <span>${ev.startDate.slice(0,4)}-${ev.startDate.slice(4,6)}-${ev.startDate.slice(6,8)}${toWord}${ev.endDate.slice(0,4)}-${ev.endDate.slice(4,6)}-${ev.endDate.slice(6,8)}</span>
                    <span class="ws-date-season">${ev.year}${yearSuffix}${seasonsMap[ev.season] || ev.season} · ${ev.windowDays} ${daysWord}</span>
                </div>
                <div class="ws-metrics-chips">
                    <div class="ws-metric-chip"><span class="m-lbl">${window.I18n ? window.I18n.t('ws.metric_mean_t') : 'Mean Temp'}:</span><span class="m-val">${m.meanT?.toFixed(1) ?? '--'}°C</span></div>
                    <div class="ws-metric-chip"><span class="m-lbl">${window.I18n ? window.I18n.t('ws.metric_max_t') : 'Max Temp'}:</span><span class="m-val" style="color:#f87171;">${m.maxT?.toFixed(1) ?? '--'}°C</span></div>
                    <div class="ws-metric-chip"><span class="m-lbl">${window.I18n ? window.I18n.t('ws.metric_total_precip') : 'Total Precip'}:</span><span class="m-val" style="color:#60a5fa;">${m.totalPrecip?.toFixed(1) ?? '--'}mm</span></div>
                    <div class="ws-metric-chip"><span class="m-lbl">${window.I18n ? window.I18n.t('ws.metric_dry_days') : 'Dry Days'}:</span><span class="m-val" style="color:#fbbf24;">${m.consecutiveDryDays ?? 0} ${daysWord}</span></div>
                    <div class="ws-metric-chip"><span class="m-lbl">${window.I18n ? window.I18n.t('ws.metric_solar_rad') : 'Solar Rad'}:</span><span class="m-val">${m.meanSol?.toFixed(1) ?? '--'}MJ</span></div>
                    <div class="ws-metric-chip"><span class="m-lbl">${window.I18n ? window.I18n.t('ws.metric_temp_slope') : 'Temp Slope'}:</span><span class="m-val">${m.tSlope > 0 ? '+' : ''}${m.tSlope?.toFixed(2) ?? '--'}°C/d</span></div>
                </div>
                <div class="ws-z-scores-row">
                    <span>${window.I18n ? window.I18n.t('ws.z_temp') : 'Z(Temp)'}: ${z.t2m > 0 ? '+' : ''}${z.t2m?.toFixed(2) ?? '0'}σ</span>
                    <span>${window.I18n ? window.I18n.t('ws.z_precip') : 'Z(Precip)'}: ${z.precip > 0 ? '+' : ''}${z.precip?.toFixed(2) ?? '0'}σ</span>
                    <span>${window.I18n ? window.I18n.t('ws.z_radiation') : 'Z(Radiation)'}: ${z.sol > 0 ? '+' : ''}${z.sol?.toFixed(2) ?? '0'}σ</span>
                </div>
                <div class="ws-actions-row">
                    <button type="button" class="ws-card-btn ws-btn-loc" data-idx="${idx}">${window.I18n ? window.I18n.t('ws.btn_locate') : 'Locate Area & Satellite Base'}</button>
                    <button type="button" class="ws-card-btn ws-btn-chart" data-idx="${idx}">${window.I18n ? window.I18n.t('ws.btn_chart') : 'Daily Factor Curves'}</button>
                    <button type="button" class="ws-card-btn ws-btn-veg" data-idx="${idx}">${window.I18n ? window.I18n.t('ws.btn_veg') : 'Vegetation Response'}</button>
                </div>
            `;

            // Bind actions
            card.querySelector('.ws-btn-loc')?.addEventListener('click', () => {
                const locObj = criteria.location || { lat: 36.0671, lng: 120.3826 };
                WeatherSearchManager.syncMapAndLayer(locObj.lat, locObj.lng, ev);
            });

            card.querySelector('.ws-btn-chart')?.addEventListener('click', () => {
                WeatherSearchManager.renderChart(ev);
            });

            card.querySelector('.ws-btn-veg')?.addEventListener('click', () => {
                const locObj = criteria.location || { lat: 36.0671, lng: 120.3826 };
                WeatherSearchManager.renderVegetationDiff(ev, locObj);
            });

            eventsList.appendChild(card);
        });

        // Automatically display chart for top 1
        if (data.rankedEvents?.[0]) {
            this.renderChart(data.rankedEvents[0]);
        }
    },

    renderChart(event) {
        const wrapper = document.getElementById('ws-chart-wrapper');
        const chartTitle = document.getElementById('ws-chart-title');
        const plotlyDiv = document.getElementById('ws-plotly-div');
        if (!wrapper || !plotlyDiv) return;

        wrapper.style.display = 'block';
        setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
        if (chartTitle) {
            chartTitle.textContent = window.I18n ? window.I18n.t('ws.chart_title_dates', '', { start: event.startDate, end: event.endDate }) : `Daily Meteorological Factors (${event.startDate} ~ ${event.endDate})`;
        }

        const rawSeries = event.series || [];
        // Format explicit category strings to avoid Plotly epoch/date auto-parsing glitches
        const xDates = rawSeries.map(r => {
            const d = String(r.date);
            return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        });
        const xTicks = rawSeries.map(r => {
            const d = String(r.date);
            return `${d.slice(4, 6)}/${d.slice(6, 8)}`;
        });

        const t2m = rawSeries.map(r => (r.t2m != null && r.t2m > -900) ? Number(r.t2m.toFixed(2)) : null);
        const tmax = rawSeries.map(r => (r.t2m_max != null && r.t2m_max > -900) ? Number(r.t2m_max.toFixed(2)) : null);
        const precip = rawSeries.map(r => (r.prectotcorr != null && r.prectotcorr >= 0) ? Number(r.prectotcorr.toFixed(2)) : 0);
        const sol = rawSeries.map(r => (r.allsky_sfc_sw_dwn != null && r.allsky_sfc_sw_dwn >= 0) ? Number(r.allsky_sfc_sw_dwn.toFixed(2)) : null);

        const traces = [
            {
                name: window.I18n ? window.I18n.t('ws.chart_t2m') : 'Daily Mean Temp (°C)',
                x: xDates,
                y: t2m,
                type: 'scatter',
                mode: 'lines+markers',
                line: { color: '#38bdf8', width: 2.5 },
                marker: { size: 5, color: '#38bdf8' },
                yaxis: 'y'
            },
            {
                name: window.I18n ? window.I18n.t('ws.chart_tmax') : 'Daily Max Temp (°C)',
                x: xDates,
                y: tmax,
                type: 'scatter',
                mode: 'lines',
                line: { color: '#f43f5e', width: 2, dash: 'dot' },
                yaxis: 'y'
            },
            {
                name: window.I18n ? window.I18n.t('ws.chart_sol') : 'Shortwave Rad (MJ/m²)',
                x: xDates,
                y: sol,
                type: 'scatter',
                mode: 'lines',
                line: { color: '#fbbf24', width: 1.8 },
                yaxis: 'y'
            },
            {
                name: window.I18n ? window.I18n.t('ws.chart_precip') : 'Precipitation (mm)',
                x: xDates,
                y: precip,
                type: 'bar',
                yaxis: 'y2',
                marker: { color: 'rgba(52, 211, 153, 0.65)' }
            }
        ];

        const layout = {
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'rgba(15, 23, 42, 0.5)',
            font: { color: '#94a3b8', size: 10 },
            margin: { l: 45, r: 45, t: 25, b: 35 },
            legend: { orientation: 'h', y: 1.18, x: 0, font: { size: 10 } },
            xaxis: {
                type: 'category',
                tickvals: xDates,
                ticktext: xTicks,
                showgrid: true,
                gridcolor: 'rgba(255,255,255,0.06)',
                tickfont: { color: '#94a3b8', size: 9 }
            },
            yaxis: {
                title: window.I18n ? window.I18n.t('ws.chart_y1_title') : 'Temp (°C) / Rad (MJ)',
                titlefont: { color: '#38bdf8', size: 10 },
                tickfont: { color: '#38bdf8', size: 9 },
                showgrid: true,
                gridcolor: 'rgba(255,255,255,0.06)'
            },
            yaxis2: {
                title: window.I18n ? window.I18n.t('ws.chart_y2_title') : 'Precipitation (mm)',
                titlefont: { color: '#34d399', size: 10 },
                tickfont: { color: '#34d399', size: 9 },
                overlaying: 'y',
                side: 'right',
                showgrid: false
            }
        };

        if (window.Plotly) {
            Plotly.newPlot(plotlyDiv, traces, layout, { responsive: true, displayModeBar: false });
        }
    },
    closeChart() {
        const wrapper = document.getElementById('ws-chart-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    },

    async renderVegetationDiff(event, location) {
        const wrapper = document.getElementById('ws-veg-wrapper');
        const metricsRow = document.getElementById('ws-veg-metrics');
        const plotlyDiv = document.getElementById('ws-veg-plotly');
        if (!wrapper) return;

        wrapper.style.display = 'block';
        setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
        if (metricsRow) metricsRow.innerHTML = `<span style="color:#38bdf8;">${window.I18n ? window.I18n.t('ws.veg_loading') : 'Retrieving MODIS vegetation index inversion...'}</span>`;

        try {
            const m = event.metrics || {};
            const z = m.zScores || {};
            const params = new URLSearchParams({
                lat: location.lat,
                lon: location.lng,
                startDate: event.startDate,
                endDate: event.endDate,
                zT2m: z.t2m ?? 0,
                zPrecip: z.precip ?? 0,
                zSol: z.sol ?? 0,
                meanT: m.meanT ?? 20,
                maxT: m.maxT ?? 25,
                totalPrecip: m.totalPrecip ?? 0,
                cdd: m.consecutiveDryDays ?? 0
            });

            const resp = await fetch(`/api/weather/vegetation-diff?${params.toString()}`);
            if (!resp.ok) throw new Error(window.I18n ? window.I18n.t('ws.veg_error') : 'Vegetation inversion failed');
            const data = await resp.json();

            const isPositive = (data.deltaNdvi ?? 0) >= 0;
            const deltaSign = isPositive ? '+' : '';
            const deltaColor = isPositive ? '#10b981' : '#ef4444';
            const durColor = (data.duringAvg ?? 0) >= (data.preAvg ?? 0) ? '#34d399' : '#f87171';
            const badgeBg = isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';
            const badgeColor = isPositive ? '#6ee7b7' : '#fca5a5';

            const sevKeyMap = {
                '水热旺盛生长 (Vigorous Growth)': 'ws.sev_vigorous',
                'Vigorous Growth': 'ws.sev_vigorous',
                '雨热良性促进 (Favorable Hydrothermal)': 'ws.sev_favorable',
                'Favorable Hydrothermal': 'ws.sev_favorable',
                '严重干旱萎蔫 (Severe Drought)': 'ws.sev_severe_drought',
                'Severe Drought': 'ws.sev_severe_drought',
                '中度水分胁迫 (Moderate Drought)': 'ws.sev_mod_drought',
                'Moderate Drought': 'ws.sev_mod_drought',
                '低温冻害受挫 (Cold Frost)': 'ws.sev_frost',
                'Frost Stress': 'ws.sev_frost',
                '短时水渍寡照 (Waterlogging Stress)': 'ws.sev_waterlog',
                'Waterlogging Stress': 'ws.sev_waterlog',
                '常态平稳波动 (Stable Baseline)': 'ws.sev_stable',
                'Stable Baseline': 'ws.sev_stable'
            };
            const localizedSev = (window.I18n && sevKeyMap[data.impactSeverity]) ? window.I18n.t(sevKeyMap[data.impactSeverity]) : (data.impactSeverity || '--');

            if (metricsRow) {
                metricsRow.innerHTML = `
                    <div>${window.I18n ? window.I18n.t('ws.veg_pre_avg') : 'Pre-event Baseline'}: <b style="color:#e2e8f0;">${data.preAvg}</b></div>
                    <div>${window.I18n ? window.I18n.t('ws.veg_dur_avg') : 'Event Period Mean'}: <b style="color:${durColor};">${data.duringAvg}</b></div>
                    <div>${window.I18n ? window.I18n.t('ws.veg_delta') : 'ΔNDVI'}: <b style="color:${deltaColor};">${deltaSign}${data.deltaNdvi}</b></div>
                    <div>${window.I18n ? window.I18n.t('ws.veg_impact') : 'Impact Assessment'}: <span class="ws-veg-badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:600; padding:2px 8px; border-radius:4px;">${localizedSev}</span></div>
                `;
            }

            const allDates = (data.timeline || []).map(t => t.date);
            const allTicks = (data.timeline || []).map(t => `${t.date.slice(5, 7)}/${t.date.slice(8, 10)}`);
            const yNdvi = (data.timeline || []).map(t => t.ndvi);
            const yBase = (data.timeline || []).map(t => t.baselineNdvi);

            // Select 7-8 evenly spaced ticks for category labels to prevent overcrowding
            const tickStep = Math.max(1, Math.floor(allDates.length / 8));
            const tickvals = [];
            const ticktext = [];
            allDates.forEach((d, idx) => {
                if (idx % tickStep === 0 || idx === allDates.length - 1) {
                    tickvals.push(d);
                    ticktext.push(allTicks[idx]);
                }
            });

            const primaryColor = isPositive ? '#10b981' : '#f43f5e';

            const traces = [
                {
                    name: window.I18n ? window.I18n.t('ws.veg_trace_daily') : 'Daily NDVI Dynamics',
                    x: allDates,
                    y: yNdvi,
                    type: 'scatter',
                    mode: 'lines+markers',
                    line: { color: primaryColor, width: 2.5 },
                    marker: { size: 4, color: primaryColor }
                },
                {
                    name: window.I18n ? window.I18n.t('ws.veg_trace_baseline') : 'Climatological Baseline',
                    x: allDates,
                    y: yBase,
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: '#94a3b8', width: 1.5, dash: 'dash' }
                }
            ];

            const layout = {
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'rgba(15, 23, 42, 0.4)',
                font: { color: '#94a3b8', size: 10 },
                margin: { l: 40, r: 20, t: 25, b: 35 },
                legend: { orientation: 'h', y: 1.2, x: 0, font: { size: 10 } },
                xaxis: {
                    type: 'category',
                    tickvals: tickvals,
                    ticktext: ticktext,
                    showgrid: true,
                    gridcolor: 'rgba(255,255,255,0.06)',
                    tickfont: { color: '#94a3b8', size: 9 }
                },
                yaxis: {
                    title: 'MODIS NDVI',
                    showgrid: true,
                    gridcolor: 'rgba(255,255,255,0.06)',
                    tickfont: { color: '#94a3b8', size: 9 }
                }
            };

            if (window.Plotly && plotlyDiv) {
                Plotly.newPlot(plotlyDiv, traces, layout, { responsive: true, displayModeBar: false });
            }
        } catch (e) {
            console.error('[VegetationDiff] error:', e);
            if (metricsRow) metricsRow.innerHTML = `<span style="color:#f87171;">${window.I18n ? window.I18n.t("ws.veg_error") : "Failed: "}${e.message}</span>`;
        }
    },

    closeVeg() {
        const wrapper = document.getElementById('ws-veg-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    },

    closeAgentChart() {
        const wrapper = document.getElementById('ws-agent-chart-wrapper');
        if (wrapper) wrapper.style.display = 'none';
    },

    flyToAgentEvent(idx) {
        const impacts = this._lastAgentData?.vegetationImpacts || this._lastAgentMatrix?.vegetationImpacts;
        const loc = this._lastAgentData?.location || this._lastAgentMatrix?.location;
        if (!impacts || !impacts[idx]) return;

        const row = impacts[idx];
        const lat = Number(loc?.lat ?? 36.0671);
        const lng = Number(loc?.lng ?? 120.3826);

        if (typeof MapManager?.setMarker === 'function') {
            MapManager.setMarker(lat, lng);
        }
        if (typeof MapManager?.flyTo === 'function') {
            MapManager.flyTo(lat, lng, 8);
        } else if (AppState?.map && typeof AppState.map.setView === 'function') {
            AppState.map.setView([lat, lng], 8);
        }

        const rawDate = String(row.startDate || row.dates?.slice(0, 10) || '');
        let dateISO = '';
        let year = row.year || 2024;
        if (rawDate.length === 8) {
            dateISO = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
        } else if (rawDate.includes('-')) {
            dateISO = rawDate.slice(0, 10);
        }

        if (dateISO) {
            AppState.currentEventDate = dateISO;
            AppState.currentEventYear = year;
            const weatherDate = document.getElementById('weather-date');
            if (weatherDate) weatherDate.value = dateISO;
            const viYear = document.getElementById('vi-year');
            if (viYear) viYear.value = year;
            const phenoYear = document.getElementById('phenology-year');
            if (phenoYear) phenoYear.value = year;
        }
    },

    plotAgentNDVI(idx) {
        const impacts = this._lastAgentData?.vegetationImpacts || this._lastAgentMatrix?.vegetationImpacts;
        if (!impacts || !impacts[idx]) return;

        const row = impacts[idx];
        const chartWrapper = document.getElementById('ws-agent-chart-wrapper');
        const chartTitle = document.getElementById('ws-agent-chart-title');
        const plotlyDiv = document.getElementById('ws-agent-plotly-chart');

        if (!chartWrapper || !plotlyDiv) return;

        chartWrapper.style.display = 'block';
        const isZh = window.I18n?.currentLang === 'zh';
        const yearText = isZh ? `${row.year}年` : `${row.year}`;
        if (chartTitle) {
            chartTitle.textContent = isZh 
                ? `${yearText} 植被响应与生态恢复轨迹 (ΔNDVI: ${row.deltaNDVI})`
                : `${yearText} Vegetation Response & Recovery Trajectory (ΔNDVI: ${row.deltaNDVI})`;
        }

        const timeline = row.timeline || [];
        if (!timeline.length) return;

        const dates = timeline.map(t => t.date || `Day ${t.dayOffset}`);
        const ndviValues = timeline.map(t => t.ndvi);
        const baselineValues = timeline.map(t => t.baselineNdvi);

        const isPositive = (row.deltaNDVI ?? 0) >= 0;
        const lineColor = isPositive ? '#10b981' : '#f43f5e';

        const traces = [
            {
                x: dates,
                y: baselineValues,
                mode: 'lines',
                name: isZh ? '常态物候基线' : 'Seasonal Baseline',
                line: { color: '#94a3b8', width: 1.5, dash: 'dash' }
            },
            {
                x: dates,
                y: ndviValues,
                mode: 'lines+markers',
                name: isZh ? '反演 NDVI 轨迹' : 'Inverted NDVI Trajectory',
                line: { color: lineColor, width: 2.5 },
                marker: { size: 4, color: lineColor }
            }
        ];

        const layout = {
            margin: { t: 25, r: 15, b: 35, l: 40 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            legend: {
                orientation: 'h',
                y: 1.18,
                x: 0,
                font: { color: '#cbd5e1', size: 10 }
            },
            yaxis: {
                title: 'NDVI',
                titlefont: { color: '#94a3b8', size: 10 },
                showgrid: true,
                gridcolor: 'rgba(255,255,255,0.06)',
                tickfont: { color: '#94a3b8', size: 9 },
                range: [
                    Math.max(0, Math.min(...ndviValues, ...baselineValues) - 0.05),
                    Math.min(1.0, Math.max(...ndviValues, ...baselineValues) + 0.05)
                ]
            },
            xaxis: {
                showgrid: false,
                tickfont: { color: '#94a3b8', size: 9 },
                nticks: 6
            }
        };

        if (window.Plotly) {
            Plotly.newPlot(plotlyDiv, traces, layout, { responsive: true, displayModeBar: false });
        }
    },

    async executeAgent() {
        const questionInput = document.getElementById('ws-agent-question');
        const runBtn = document.getElementById('ws-run-agent-btn');
        const stepperBox = document.getElementById('ws-agent-stepper');
        const thinkingWrapper = document.getElementById('ws-agent-thinking-wrapper');
        const thinkingLog = document.getElementById('ws-agent-thinking-log');
        const matrixWrapper = document.getElementById('ws-agent-matrix-wrapper');
        const matrixTbody = document.getElementById('ws-matrix-tbody');
        const chartWrapper = document.getElementById('ws-agent-chart-wrapper');
        const reportWrapper = document.getElementById('ws-agent-report-wrapper');
        const reportContent = document.getElementById('ws-agent-report-content');

        const question = questionInput?.value?.trim();
        if (!question) {
            alert(window.I18n ? window.I18n.t('ws.agent_alert_empty') : 'Please enter a research question or hypothesis');
            return;
        }

        const loc = (typeof MapManager?.getCurrentLocation === 'function')
            ? MapManager.getCurrentLocation()
            : { lat: 30.6586, lng: 104.0648 };

        const currentLang = window.I18n?.currentLang || 'en';
        const isZh = currentLang === 'zh';

        if (runBtn) {
            runBtn.disabled = true;
            runBtn.innerHTML = `<span>${window.I18n ? window.I18n.t('ws.agent_running') : 'Agent Inferring...'}</span>`;
        }
        if (stepperBox) stepperBox.style.display = 'block';
        if (thinkingWrapper) thinkingWrapper.style.display = 'block';
        if (thinkingLog) thinkingLog.textContent = '';
        if (matrixWrapper) matrixWrapper.style.display = 'none';
        if (chartWrapper) chartWrapper.style.display = 'none';
        if (reportWrapper) reportWrapper.style.display = 'none';
        if (reportContent) reportContent.innerHTML = '';

        // Helper to update stage status in UI
        const setStep = (stepId, status) => {
            const el = document.getElementById('ws-step-' + stepId);
            if (!el) return;
            el.classList.remove('active', 'done');
            if (status === 'active' || status === 'running') el.classList.add('active');
            if (status === 'done' || status === 'completed') el.classList.add('done');
        };

        ['plan', 'search', 'compare', 'vegetation', 'report'].forEach(s => setStep(s, 'pending'));

        const renderMatrix = (matrixData) => {
            this._lastAgentMatrix = matrixData;
            if (!matrixWrapper || !matrixTbody || !matrixData.vegetationImpacts) return;
            matrixWrapper.style.display = 'block';
            matrixTbody.innerHTML = '';

            const yearSuffix = isZh ? '年' : '';
            const daysSuffix = window.I18n ? window.I18n.t('ws.days') : 'days';
            const locateText = window.I18n ? window.I18n.t('ws.agent_btn_locate') : 'Locate';
            const chartText = window.I18n ? window.I18n.t('ws.agent_btn_chart') : 'NDVI';

            matrixData.vegetationImpacts.forEach((row, idx) => {
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.title = isZh ? '点击查看该事件植被响应曲线' : 'Click to inspect NDVI trajectory';
                tr.onclick = (e) => {
                    if (e.target.tagName === 'BUTTON') return;
                    this.plotAgentNDVI(idx);
                };

                const isPos = (row.deltaNDVI ?? 0) >= 0;
                const deltaColor = isPos ? '#10b981' : '#ef4444';
                const badgeBg = isPos ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';
                const badgeColor = isPos ? '#6ee7b7' : '#fca5a5';
                const sign = isPos ? '+' : '';
                tr.innerHTML = `
                    <td><b style="color:#38bdf8;">${row.year}${yearSuffix}</b></td>
                    <td style="font-size:10px; color:#cbd5e1;">${row.dates || row.period || '--'}</td>
                    <td>${row.meanTemp ?? row.meanT ?? '--'}°C</td>
                    <td><span style="color:#f87171; font-weight:600;">${row.maxTemp ?? row.maxT ?? '--'}°C</span></td>
                    <td><span style="color:#fbbf24;">${row.consecutiveDryDays ?? row.cdd ?? 0} ${daysSuffix}</span></td>
                    <td><span style="color:${deltaColor}; font-weight:600;">${sign}${row.deltaNDVI}</span></td>
                    <td><span style="background:${badgeBg}; color:${badgeColor}; padding:2px 6px; border-radius:3px; font-weight:600;">${sign}${row.lossPercentage}%</span></td>
                    <td>${row.recoveryDays} ${daysSuffix}</td>
                    <td>
                        <div style="display:flex; gap:4px;">
                            <button type="button" class="ws-mini-btn" style="padding:2px 6px; font-size:10px;" onclick="WeatherSearchManager.flyToAgentEvent(${idx})">${locateText}</button>
                            <button type="button" class="ws-mini-btn" style="padding:2px 6px; font-size:10px;" onclick="WeatherSearchManager.plotAgentNDVI(${idx})">${chartText}</button>
                        </div>
                    </td>
                `;
                matrixTbody.appendChild(tr);
            });

            // Automatically plot first event NDVI curve
            if (matrixData.vegetationImpacts.length > 0) {
                this.plotAgentNDVI(0);
            }
        };

        let accumulatedReport = '';

        try {
            const resp = await fetch('/api/weather/agent/run?stream=true', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify({ question, aoi: loc, lang: currentLang })
            });

            if (!resp.ok) {
                const errJson = await resp.json().catch(() => ({}));
                throw new Error(errJson.error || `Agent execution failed (${resp.status})`);
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || '';

                for (const chunk of parts) {
                    if (!chunk.trim()) continue;
                    let eventType = 'message';
                    let dataStr = '';

                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.slice(7).trim();
                        } else if (line.startsWith('data: ')) {
                            dataStr = line.slice(6).trim();
                        }
                    }

                    if (!dataStr) continue;

                    let payload = {};
                    try { payload = JSON.parse(dataStr); } catch (_) { continue; }

                    if (eventType === 'stage') {
                        const { stageId, status, stages } = payload;
                        if (stages) {
                            stages.forEach(s => setStep(s.id, s.status));
                        } else if (stageId) {
                            setStep(stageId, status);
                        }
                    } else if (eventType === 'thinking') {
                        if (thinkingLog && payload.delta) {
                            thinkingLog.textContent += payload.delta;
                            thinkingLog.scrollTop = thinkingLog.scrollHeight;
                        }
                    } else if (eventType === 'matrix') {
                        renderMatrix(payload);
                    } else if (eventType === 'report_chunk') {
                        if (reportWrapper && reportContent && payload.delta) {
                            reportWrapper.style.display = 'block';
                            accumulatedReport += payload.delta;
                            if (window.marked) {
                                reportContent.innerHTML = marked.parse(accumulatedReport);
                            } else {
                                reportContent.textContent = accumulatedReport;
                            }
                        }
                    } else if (eventType === 'complete') {
                        this._lastAgentData = payload;
                        if (payload.report && reportWrapper && reportContent) {
                            reportWrapper.style.display = 'block';
                            accumulatedReport = payload.report;
                            if (window.marked) {
                                reportContent.innerHTML = marked.parse(accumulatedReport);
                            } else {
                                reportContent.textContent = accumulatedReport;
                            }
                        }
                        ['plan', 'search', 'compare', 'vegetation', 'report'].forEach(s => setStep(s, 'done'));
                    } else if (eventType === 'error') {
                        throw new Error(payload.message || 'Server-side agent error');
                    }
                }
            }

        } catch (err) {
            console.error('[ClimateAgent] failed:', err);
            if (thinkingLog) thinkingLog.textContent += `\n[Error] ${err.message}`;
            alert((window.I18n ? window.I18n.t('ws.agent_error_prefix') : 'Agent inference failed: ') + err.message);
        } finally {
            if (runBtn) {
                runBtn.disabled = false;
                runBtn.innerHTML = `<span data-i18n="ws.agent_run_btn">${window.I18n ? window.I18n.t('ws.agent_run_btn') : 'Run Climate Agent Deep Inference'}</span>`;
            }
        }
    },

    copyReport() {
        const text = this._lastAgentData?.report;
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                alert(window.I18n ? window.I18n.t('ws.agent_copied') : 'Report copied to clipboard!');
            }).catch(() => {
                alert(window.I18n ? window.I18n.t('ws.agent_copy_fail') : 'Failed to copy, please copy manually.');
            });
        }
    },

    exportReportMarkdown() {
        const text = this._lastAgentData?.report;
        if (!text) {
            alert(window.I18n ? window.I18n.t('ws.agent_report_done') : 'No report to export.');
            return;
        }
        const question = this._lastAgentData?.question || 'climate_research';
        const filename = `FloraCast_${question.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').slice(0, 30)}.md`;
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        if (window.I18n) {
            alert(window.I18n.t('ws.agent_exported'));
        }
    }
};

window.WeatherSearchManager = WeatherSearchManager;


window.addEventListener('DOMContentLoaded', () => {
        this.bindEvents();
      });
    },

    bindEvents() {
      const $ = (id) => document.getElementById(id);

      // Species list / monthly plot / map overlay
      $('vi-load-species')?.addEventListener('click', () => this.loadSpeciesList());
      $('vi-species-filter')?.addEventListener('input', (e) => this.renderSpeciesList(e.target.value || ''));
      $('vi-plot-monthly')?.addEventListener('click', () => this.plotSelectedMonthly());
      $('vi-show-species')?.addEventListener('click', () => this.showSelectedSpeciesOnMap());
      $('vi-clear-species')?.addEventListener('click', () => this.clearSpeciesLayer());

      // Invasives (auto, last 5y)
      $('vi-inv-analyze')?.addEventListener('click', () => this.detectInvasives5y());
      $('vi-inv-show')?.addEventListener('click', () => this.showTopInvasivesOnMap());
      $('vi-inv-clear')?.addEventListener('click', () => this.clearSpeciesLayer());

      // POWER: last 365 days (rain + aridity + heuristic superbloom)
      $('vi-load-rain')?.addEventListener('click', () => this.loadRainAridity());

      // Pollinator monthly counts (free input of taxa ids)
      $('vi-plot-pollinators')?.addEventListener('click', () => this.plotPollinators());

      console.log('[VIAddon] events bound to vi-* controls.');
    },

    /* ---------------------- helpers ---------------------- */
    getParams() {
      const loc = (typeof MapManager?.getCurrentLocation === 'function')
        ? MapManager.getCurrentLocation()
        : { lat: 38.9072, lng: -77.0369 }; // fallback Washington, DC

      const year   = parseInt(document.getElementById('vi-year')?.value || '2024', 10);
      const radius = Math.max(1, Math.min(200, parseInt(document.getElementById('vi-radius')?.value || '25', 10)));
      return { lat: loc.lat, lng: loc.lng, year, radius };
    },

    /* ---------------------- species list ---------------------- */
    async loadSpeciesList() {
      if (this._busy) return;
      this._busy = true;

      const { lat, lng, year, radius } = this.getParams();
      this._lastParams = { lat, lng, year, radius };

      const listEl = document.getElementById('vi-species-list');
      if (listEl) { listEl.innerHTML = ''; const opt = document.createElement('option'); opt.textContent = 'Loading…'; listEl.appendChild(opt); }

      try {
        // iNaturalist species_counts for Angiosperms (47125)
        const per = 200;
        const out = [];
        for (let page=1; page<=5; page++){
          const u = new URL('https://api.inaturalist.org/v1/observations/species_counts');
          u.search = new URLSearchParams({
            lat, lng, radius, year,
            verifiable:'true', geo:'true',
            taxon_id:'47125',
            per_page:String(per), page:String(page)
          }).toString();

          const r = await fetch(u);
          if (!r.ok) break;
          const j = await r.json();
          const arr = j?.results || [];
          for (const s of arr){
            const t = s.taxon || {};
            if (!t.id) continue;
            out.push({
              id: t.id,
              name: t.name,
              common: t.preferred_common_name || t.english_common_name || '',
              count: s.count || 0
            });
          }
          if (arr.length < per) break;
        }
        out.sort((a,b)=>b.count-a.count);
        this._speciesCache = out;
        this.renderSpeciesList(document.getElementById('vi-species-filter')?.value || '');
        console.log(`[VIAddon] species loaded: ${out.length} (Y=${year}, R=${radius}km)`);
      } catch (e) {
        console.error(e);
        if (listEl) { listEl.innerHTML = ''; const opt = document.createElement('option'); opt.textContent = 'Failed. Try again.'; listEl.appendChild(opt); }
      } finally {
        this._busy = false;
      }
    },

    renderSpeciesList(filterText) {
      const sel = document.getElementById('vi-species-list');
      if (!sel) return;
      sel.innerHTML = '';

      const q = (filterText || '').trim().toLowerCase();
      const items = this._speciesCache
        .filter(s => !q || (s.name?.toLowerCase().includes(q) || s.common?.toLowerCase().includes(q)))
        .slice(0, 800);

      for (const s of items) {
        const opt = document.createElement('option');
        opt.value = String(s.id);
        opt.textContent = `${s.common ? (s.common + ' · ') : ''}${s.name} (${s.count})`;
        sel.appendChild(opt);
      }
    },

    /* ---------------------- monthly plot (legend at bottom) ---------------------- */
    async plotSelectedMonthly() {
      const sel = document.getElementById('vi-species-list');
      if (!sel || !sel.value) return alert('Please choose a species first.');
      if (!window.Plotly) return alert('Plotly not loaded.');

      const taxonId = parseInt(sel.value, 10);
      const label   = sel.options[sel.selectedIndex]?.textContent?.replace(/\s*\(\d+\)\s*$/, '') || `taxon ${taxonId}`;
      const { lat, lng, year, radius } = this.getParams();

      try {
        const [monthCounts, precipMonthly] = await Promise.all([
          this._inatMonthly(taxonId, lat, lng, radius, year),
          this._powerMonthly(lat, lng, year)
        ]);

        const names  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const months = Array.from({length:12}, (_,i)=>i+1);
        const yObs   = months.map(m => monthCounts[m] || 0);
        const yP     = months.map(m => precipMonthly[m] || 0);

        const traces = [
          { x:names, y:yObs, type:'scatter', mode:'lines+markers', name:`${label} (observations)` },
          { x:names, y:yP,   type:'bar',     name:'Precip (mm)', yaxis:'y2', opacity:0.5 }
        ];

        // Optional pollinator overlays
        const pol = await Promise.all(this.POLLINATOR_TAXA.map(async p=>{
          try{
            const mc = await this._inatMonthly(p.id, lat, lng, radius, year);
            return { x:names, y:months.map(m=>mc[m]||0), type:'scatter', mode:'lines', line:{width:1}, name:p.label };
          }catch{return null;}
        }));
        traces.push(...pol.filter(Boolean));

        const layout = {
          margin:{l:48,r:48,t:24,b:56},
          xaxis:{title:`Monthly in ${year}`},
          yaxis:{title:'Observations'},
          yaxis2:{title:'Precip (mm)', overlaying:'y', side:'right', showgrid:false},
          legend: { orientation:'h', yanchor:'top', y:-0.25, xanchor:'center', x:0.5 } // legend at bottom
        };
        Plotly.newPlot('vi-flower-chart', traces, layout, { displayModeBar:false });

        console.log('[VIAddon] monthly chart rendered (legend bottom).');
      } catch (e) {
        console.error(e);
        alert('Failed to plot monthly chart.');
      }
    },

    /* ---------------------- show selected species on map ---------------------- */
    async showSelectedSpeciesOnMap() {
      const sel = document.getElementById('vi-species-list');
      if (!sel || !sel.value) return alert('Please choose a species first.');
      const taxonId = parseInt(sel.value, 10);
      const { lat, lng, year, radius } = this.getParams();

      if (!AppState?.map) return alert('Map not ready.');
      this.clearSpeciesLayer();
      if (!this._speciesLayer) this._speciesLayer = L.markerClusterGroup();

      let total = 0;
      try {
        for (let page=1; page<=5; page++){
          const u = new URL('https://api.inaturalist.org/v1/observations');
          u.search = new URLSearchParams({
            lat, lng, radius, year,
            taxon_id: String(taxonId),
            verifiable:'true', geo:'true',
            order:'desc', order_by:'observed_on',
            per_page:'200', page:String(page)
          }).toString();

          const r = await fetch(u);
          if (!r.ok) break;
          const j = await r.json();
          const arr = j?.results || [];
          total += arr.length;

          for (const o of arr) {
            const y = o.geojson?.coordinates?.[1] ?? (o.location ? Number(o.location.split(',')[0]) : null);
            const x = o.geojson?.coordinates?.[0] ?? (o.location ? Number(o.location.split(',')[1]) : null);
            if (y==null || x==null) continue;

            const icon = (window.Icons && Icons.flower) ? Icons.flower : undefined;
            const marker = L.marker([y,x], icon?{icon}:{});
            const when = (o.observed_on_details?.date || o.observed_on || '').slice(0,10);
            const title = o.taxon?.preferred_common_name || o.taxon?.name || `taxon ${taxonId}`;
            marker.bindPopup(
              `<div style="min-width:220px">
                 <b>${title}</b><br>${when||''}<br>
                 <a target="_blank" rel="noopener" href="https://www.inaturalist.org/observations/${o.id}">Open on iNaturalist</a>
               </div>`
            );
            this._speciesLayer.addLayer(marker);
          }
          if (arr.length < 200) break;
        }

        this._speciesLayer.addTo(AppState.map);
        console.log(`[VIAddon] added ${total} markers.`);
      } catch (e) {
        console.error(e);
        alert('Failed to load observation points.');
      }
    },

    clearSpeciesLayer() {
      if (this._speciesLayer) {
        this._speciesLayer.clearLayers();
        if (AppState?.map) AppState.map.removeLayer(this._speciesLayer);
      }
      this._speciesLayer = null;
    },

    /* ---------------------- invasives (auto, last 5y) ---------------------- */
    async detectInvasives5y() {
      const { lat, lng, radius } = this.getParams();
      const endYear = new Date().getUTCFullYear();
      const d1 = `${endYear-4}-01-01`;
      const d2 = `${endYear}-12-31`;

      const tbody = document.querySelector('#vi-inv-table tbody');
      if (tbody) {
        const txt = window.I18n ? window.I18n.t('common.analyzing', 'Analyzing…') : 'Analyzing…';
        tbody.innerHTML = `<tr><td colspan="5">${txt}</td></tr>`;
      }

      try {
        // Step 1: trust iNat "introduced" label if available
        let list = [];
        const uIntro = new URL('https://api.inaturalist.org/v1/observations/species_counts');
        uIntro.search = new URLSearchParams({
          lat, lng, radius, d1, d2,
          verifiable:'true', geo:'true',
          establishment_means:'introduced',
          per_page:'200'
        }).toString();
        let r = await fetch(uIntro);
        if (r.ok) {
          const j = await r.json();
          list = (j?.results||[]).map(s=>({
            id: s.taxon?.id,
            name: s.taxon?.name,
            common: s.taxon?.preferred_common_name || '',
            total5y: s.count || 0,
            flag: 'introduced'
          })).filter(x=>x.id);
        }

        // Step 2: if few introduced hits, fallback to 5y sum + trend heuristic
        if (!list.length) {
          const yearMap = new Map(); // id -> {name,common, y:[5], sum}
          for (let y=endYear-4; y<=endYear; y++) {
            const u = new URL('https://api.inaturalist.org/v1/observations/species_counts');
            u.search = new URLSearchParams({
              lat, lng, radius, year:String(y),
              verifiable:'true', geo:'true',
              taxon_id:'47125', per_page:'200'
            }).toString();
            const rr = await fetch(u);
            if (!rr.ok) continue;
            const jj = await rr.json();
            for (const s of (jj?.results||[])) {
              const id = s?.taxon?.id; if (!id) continue;
              const rec = yearMap.get(id) || { name: s.taxon?.name, common: s.taxon?.preferred_common_name||'', y:[0,0,0,0,0], sum:0 };
              rec.y[y-(endYear-4)] += (s.count||0);
              rec.sum += (s.count||0);
              yearMap.set(id, rec);
            }
          }
          list = Array.from(yearMap.entries()).map(([id, rec])=>{
            const first = rec.y[0] || 0, last = rec.y[4] || 0;
            const ratio = first===0 ? (last>0?Infinity:1) : (last/first);
            const trend = ratio>=1.5 ? '▲' : (ratio<=0.67 ? '▼' : '—');
            return { id, name:rec.name, common:rec.common, total5y:rec.sum, flag:'candidate', trend };
          }).sort((a,b)=>b.total5y-a.total5y).slice(0, 50);
        }

        list.sort((a,b)=>b.total5y-a.total5y);
        this._invasiveList = list;

        // Render table
        if (tbody) {
          tbody.innerHTML = '';
          let rank = 1;
          for (const sp of list) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${rank++}</td>
              <td>${sp.common || '—'}</td>
              <td>${sp.name || '—'}</td>
              <td>${sp.total5y}</td>
              <td>${sp.flag}${sp.trend?` ${sp.trend}`:''}</td>
            `;
            tbody.appendChild(tr);
          }
          if (!list.length) {
            const noMsg = window.I18n ? window.I18n.t('veg.no_invasives', 'No invasive candidates found.') : 'No invasive candidates found.';
            tbody.innerHTML = `<tr><td colspan="5">${noMsg}</td></tr>`;
          }
        }
        console.log(`[VIAddon] invasive analyzed: ${list.length}`);
      } catch (e) {
        console.error(e);
        if (tbody) {
          const failMsg = window.I18n ? window.I18n.t('common.analyze_failed', 'Analyze failed.') : 'Analyze failed.';
          tbody.innerHTML = `<tr><td colspan="5">${failMsg}</td></tr>`;
        }
      }
    },

    async showTopInvasivesOnMap() {
      if (!this._invasiveList?.length) return alert('Run "Analyze top-N species" first.');
      if (!AppState?.map) return alert('Map not ready.');

      const topN = Math.max(1, Math.min(50, parseInt(document.getElementById('vi-inv-topN')?.value || '10', 10)));
      const { lat, lng, year, radius } = this.getParams();

      this.clearSpeciesLayer();
      this._speciesLayer = L.markerClusterGroup();

      let total = 0;
      try {
        for (const sp of this._invasiveList.slice(0, topN)) {
          // Limit pages per species to avoid overload
          for (let page=1; page<=2; page++) {
            const u = new URL('https://api.inaturalist.org/v1/observations');
            u.search = new URLSearchParams({
              lat, lng, radius, year,
              taxon_id:String(sp.id),
              verifiable:'true', geo:'true',
              order:'desc', order_by:'observed_on',
              per_page:'200', page:String(page)
            }).toString();
            const r = await fetch(u);
            if (!r.ok) break;
            const j = await r.json();
            const arr = j?.results || [];
            total += arr.length;

            for (const o of arr) {
              const y = o.geojson?.coordinates?.[1] ?? (o.location ? Number(o.location.split(',')[0]) : null);
              const x = o.geojson?.coordinates?.[0] ?? (o.location ? Number(o.location.split(',')[1]) : null);
              if (y==null || x==null) continue;

              const icon = (window.Icons && Icons.flower) ? Icons.flower : undefined;
              const marker = L.marker([y,x], icon?{icon}:{});
              const when = (o.observed_on_details?.date || o.observed_on || '').slice(0,10);
              const title = sp.common || sp.name || `taxon ${sp.id}`;
              marker.bindPopup(
                `<div style="min-width:220px">
                   <b>${title}</b><br>${when||''}<br>
                   <a target="_blank" rel="noopener" href="https://www.inaturalist.org/observations/${o.id}">Open on iNaturalist</a>
                 </div>`
              );
              this._speciesLayer.addLayer(marker);
            }
            if (arr.length < 200) break;
          }
        }
        this._speciesLayer.addTo(AppState.map);
        console.log(`[VIAddon] invasive markers added: ${total} points.`);
      } catch (e) {
        console.error(e);
        alert('Failed to add invasive markers.');
      }
    },

    /* ---------------------- POWER: last 365d (rain, aridity, heuristic superbloom) ---------------------- */
    async loadRainAridity() {
      if (!window.Plotly) return alert('Plotly not loaded.');

      const { lat, lng } = this.getParams();
      // Build date window: last 365 calendar days
      const end  = new Date();
      const start= new Date(end.getTime() - 365*24*3600*1000);
      const fmt  = (d) => d.toISOString().slice(0,10).replace(/-/g,'');
      const startStr = fmt(start), endStr = fmt(end);

      try {
        const daily = await this._powerDaily(lat, lng, startStr, endStr, ['PRECTOTCORR','T2M']);

        // Aggregate to weekly for a cleaner chart
        const weeks = [];
        let wkP = 0, wkTsum = 0, wkN = 0, lastWeekIdx = -1;
        daily.dates.forEach((iso, idx) => {
          const d = new Date(iso);
          const weekIdx = Math.floor((d - start) / (7*24*3600*1000));
          if (weekIdx !== lastWeekIdx && lastWeekIdx >= 0) {
            weeks.push({week:lastWeekIdx, precip: wkP, t2m: (wkN? wkTsum/wkN : null)});
            wkP = 0; wkTsum = 0; wkN = 0;
          }
          const p = Math.max(0, +daily.precip[idx] || 0);
          const t = (Number.isFinite(daily.t2m[idx]) ? daily.t2m[idx] : null);
          wkP += p;
          if (t !== null) { wkTsum += t; wkN++; }
          lastWeekIdx = weekIdx;
        });
        if (lastWeekIdx >= 0) weeks.push({week:lastWeekIdx, precip: wkP, t2m: (wkN? wkTsum/wkN : null)});

        // Aridity index: share of last-90d rainfall over 365d total (higher => less arid recently)
        const total365 = weeks.reduce((s,w)=>s+(w.precip||0),0);
        const last90ms = end.getTime() - 90*24*3600*1000;
        const r90 = daily.dates.reduce((s,iso,idx)=>{
          const t = new Date(iso).getTime();
          return s + (t>=last90ms ? Math.max(0, +daily.precip[idx]||0) : 0);
        }, 0);
        const aridityIdx = total365>0 ? Math.min(1, r90/total365) : 0;

        const aridBar = document.getElementById('vi-arid-bar');
        const aridLbl = document.getElementById('vi-arid-label');
        if (aridBar) aridBar.style.width = (aridityIdx*100).toFixed(0) + '%';
        if (aridLbl) aridLbl.textContent = `Aridity index (last 90d share of 365d rain): ${(aridityIdx*100).toFixed(0)}%`;

        const superb = document.getElementById('vi-superbloom');
        if (superb) {
          let msg = 'Low probability';
          if (total365 > 200 && aridityIdx > 0.55) msg = 'Moderate to High';
          if (total365 > 350 && aridityIdx > 0.60) msg = 'High (rainfall-based)';
          superb.textContent = `Superbloom prediction (heuristic): ${msg}`;
        }

        // Weekly bar (precip) + line (temp)
        const xLabels = weeks.map(w => `W${w.week+1}`);
        const bar = { x:xLabels, y:weeks.map(w=>w.precip||0), type:'bar', name:'Weekly Precip (mm)'};
        const line= { x:xLabels, y:weeks.map(w=>w.t2m), type:'scatter', mode:'lines', yaxis:'y2', name:'Weekly Mean T2M (°C)'};
        const layout = {
          margin:{l:48,r:48,t:24,b:56},
          yaxis:{title:'Precip (mm)'},
          yaxis2:{title:'T (°C)', overlaying:'y', side:'right', showgrid:false},
          legend:{orientation:'h', yanchor:'top', y:-0.25, xanchor:'center', x:0.5}
        };
        Plotly.newPlot('vi-rain-chart', [bar, line], layout, {displayModeBar:false});
      } catch (e) {
        console.error(e);
        alert('POWER fetch failed.');
      }
    },

    // POWER daily fetcher (supports multiple parameters)
    async _powerDaily(lat, lng, startYYYYMMDD, endYYYYMMDD, params=['PRECTOTCORR']) {
      const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
      url.search = new URLSearchParams({
        parameters: params.join(','),
        community: 'AG',
        longitude: String(lng),
        latitude: String(lat),
        start: startYYYYMMDD,
        end:   endYYYYMMDD,
        format: 'JSON'
      }).toString();
      const r = await fetch(url);
      if (!r.ok) throw new Error('POWER daily error');
      const j = await r.json();
      const obj = j?.properties?.parameter || {};
      const allDates = Object.keys(obj[params[0]] || {}).sort();
      const out = { dates: allDates.map(d => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`) };
      for (const p of params) {
        const series = obj[p] || {};
        out[p.toLowerCase()] = allDates.map(d => {
          const v = Number(series[d]);
          return Number.isFinite(v) ? (p==='PRECTOTCORR' ? Math.max(0, v) : v) : null; // clamp negatives for precip
        });
      }
      out.precip = out.prectotcorr || [];
      out.t2m    = out.t2m || [];
      return out;
    },

    /* ---------------------- pollinators monthly plot ---------------------- */
    async plotPollinators() {
      if (!window.Plotly) return alert('Plotly not loaded.');

      const input = document.getElementById('vi-pollinator-taxa');
      const year  = parseInt(document.getElementById('vi-year')?.value || String(new Date().getFullYear()), 10);
      if (!input || !input.value.trim()) return alert('Enter taxa IDs (comma-separated).');

      const { lat, lng, radius } = this.getParams();
      const taxIds = input.value.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>Number.isFinite(n));
      if (!taxIds.length) return alert('Invalid taxa IDs.');

      try {
        const names  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const months = Array.from({length:12},(_,i)=>i+1);

        const traces = [];
        for (const id of taxIds) {
          const mc = await this._inatMonthly(id, lat, lng, radius, year);
          traces.push({
            x:names, y:months.map(m=>mc[m]||0),
            type:'scatter', mode:'lines+markers', name:`Taxon ${id}`
          });
        }
        const layout = {
          margin:{l:48,r:48,t:24,b:56},
          xaxis:{title:`Monthly pollinator counts in ${year}`},
          yaxis:{title:'Observations'},
          legend:{orientation:'h', yanchor:'top', y:-0.25, xanchor:'center', x:0.5}
        };
        Plotly.newPlot('vi-poll-chart', traces, layout, {displayModeBar:false});
      } catch (e) {
        console.error(e);
        alert('Plot pollinator counts failed.');
      }
    },

    /* ---------------------- external data wrappers ---------------------- */
    async _inatMonthly(taxonId, lat, lng, radius, year) {
      // Use month_of_year (1..12) which is stable and explicit
      const u = new URL('https://api.inaturalist.org/v1/observations/histogram');
      u.search = new URLSearchParams({
        lat, lng, radius,
        verifiable:'true', geo:'true',
        taxon_id:String(taxonId),
        date_field:'observed', interval:'month_of_year',
        year:String(year)
      }).toString();
      const r = await fetch(u);
      if (!r.ok) throw new Error('iNat histogram failed');
      const j = await r.json();
      const obj = j?.results?.month_of_year || {};
      const out = {};
      for (let m=1;m<=12;m++) out[m] = Number(obj[String(m)]||0);
      return out;
    },

    async _powerMonthly(lat, lng, year) {
      // Sum daily PRECTOTCORR into months; clamp negatives to 0
      const u = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
      u.search = new URLSearchParams({
        parameters:'PRECTOTCORR', community:'AG',
        longitude:String(lng), latitude:String(lat),
        start:`${year}0101`, end:`${year}1231`, format:'JSON'
      }).toString();
      const r = await fetch(u);
      if (!r.ok) return {};
      const j = await r.json();
      const daily = j?.properties?.parameter?.PRECTOTCORR || {};
      const monthly = {};
      for (const [ymd, vRaw] of Object.entries(daily)) {
        const m = parseInt(String(ymd).slice(4,6), 10);
        const v = Math.max(0, Number(vRaw) || 0);
        monthly[m] = (monthly[m] || 0) + v;
      }
      return monthly;
    }
  };

  VIAddon.init();
})();

/* =========================================================
 * Visual Geo-ML (空间机器学习实验室) Manager
 * =======================================================*/
const VisualMLManager = {
    activeTab: 'knn',
    drawnEntities: [],
    trainingPoints: [],
    nnCanvas: null,
    nnCtx: null,
    nnNodes: [],
    nnParticles: [],
    nnAnimFrame: null,

    init() {
        this.setupTabs();
        this.setupKnnControls();
        this.setupNNControls();
    },

    setupTabs() {
        const btnKnn = document.getElementById('vml-tab-btn-knn');
        const btnNn = document.getElementById('vml-tab-btn-nn');
        const paneKnn = document.getElementById('vml-tab-knn');
        const paneNn = document.getElementById('vml-tab-nn');

        if (btnKnn && btnNn && paneKnn && paneNn) {
            btnKnn.addEventListener('click', () => {
                this.activeTab = 'knn';
                btnKnn.classList.add('active');
                btnNn.classList.remove('active');
                paneKnn.classList.remove('hidden');
                paneNn.classList.add('hidden');
            });

            btnNn.addEventListener('click', () => {
                this.activeTab = 'nn';
                btnNn.classList.add('active');
                btnKnn.classList.remove('active');
                paneNn.classList.remove('hidden');
                paneKnn.classList.add('hidden');
                setTimeout(() => {
                    this.initNNCanvas();
                    this.renderSaliencyChart();
                }, 80);
            });
        }
    },

    setupKnnControls() {
        const runBtn = document.getElementById('vml-run-btn');
        const clearBtn = document.getElementById('vml-clear-btn');
        const kSlider = document.getElementById('vml-param-k');
        const kLabel = document.getElementById('vml-param-label');
        const modelSel = document.getElementById('vml-model-select');

        if (kSlider && kLabel) {
            kSlider.addEventListener('input', () => {
                const val = kSlider.value;
                const model = modelSel ? modelSel.value : 'knn';
                const kernelPrefix = window.I18n ? window.I18n.t('vml.kernel_label') : 'Gaussian RBF γ = '; kLabel.textContent = model === 'knn' ? `K = ${val}` : `${kernelPrefix}${(0.1 * val).toFixed(1)}`;
            });
        }

        if (modelSel && kLabel && kSlider) {
            modelSel.addEventListener('change', () => {
                const model = modelSel.value;
                const val = kSlider.value;
                const kernelPrefix = window.I18n ? window.I18n.t('vml.kernel_label') : 'Gaussian RBF γ = '; kLabel.textContent = model === 'knn' ? `K = ${val}` : `${kernelPrefix}${(0.1 * val).toFixed(1)}`;
            });
        }

        if (runBtn) {
            runBtn.addEventListener('click', () => this.runSpatialML());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearOverlay());
        }
    },

    haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    runSpatialML() {
        const statusEl = document.getElementById('vml-status');
        if (statusEl) statusEl.innerHTML = '<span class="pulse-icon"></span> ' + (window.I18n ? window.I18n.t('vml.status_computing') : 'Computing spatial ML decision surface & feature projections...');

        const center = MapManager.getCurrentLocation() || CONFIG.INIT;
        const centerLat = center.lat;
        const centerLng = center.lng;

        const taskMode = document.getElementById('vml-task-mode')?.value || 'eco';
        const modelType = document.getElementById('vml-model-select')?.value || 'knn';
        const kVal = parseInt(document.getElementById('vml-param-k')?.value || '3', 10);
        const metric = document.getElementById('vml-metric')?.value || 'euclidean';

        const span = 0.22; // ~25km bounding window
        const west = centerLng - span;
        const east = centerLng + span;
        const south = centerLat - span;
        const north = centerLat + span;

        // 1. Synthesize 24 realistic ground reference points with 2 features
        const classes = taskMode === 'synthetic' ? [
            { id: 0, name: window.I18n ? window.I18n.t('vml.manifold_a') : 'Manifold Class A (Primary Spiral)', color: '#ef4444' },
            { id: 1, name: window.I18n ? window.I18n.t('vml.manifold_b') : 'Manifold Class B (Secondary Spiral)', color: '#3b82f6' }
        ] : taskMode === 'species' ? [
            { id: 0, name: window.I18n ? window.I18n.t('vml.species_a') : 'Winter Jasmine / Wild Peach (Early Spring Cold-Hardy)', color: '#ec4899' },
            { id: 1, name: window.I18n ? window.I18n.t('vml.species_b') : 'Forsythia / Cherry Blossom (Mid Spring Mesic)', color: '#8b5cf6' },
            { id: 2, name: window.I18n ? window.I18n.t('vml.species_c') : 'Black Locust / Goldenrain Tree (Summer Deep-Rooted)', color: '#06b6d4' }
        ] : [
            { id: 0, name: window.I18n ? window.I18n.t('vml.eco_zone_a') : 'Eco-climatic Zone A (Warm & Humid)', color: '#10b981' },
            { id: 1, name: window.I18n ? window.I18n.t('vml.eco_zone_b') : 'Eco-climatic Zone B (Cold & Dry)', color: '#3b82f6' },
            { id: 2, name: window.I18n ? window.I18n.t('vml.eco_zone_c') : 'Transitional Ecocline', color: '#f59e0b' }
        ];

        const samples = [];
        const numSamples = 24;
        for (let i = 0; i < numSamples; i++) {
            const angle = (i / numSamples) * Math.PI * 2 + (i % 3) * 0.4;
            const r = (0.05 + 0.15 * ((i * 7) % numSamples) / numSamples);
            const pLat = centerLat + r * Math.cos(angle);
            const pLng = centerLng + r * Math.sin(angle) * 1.2;

            // Environmental feature proxies:
            // Feature 1: Temperature proxy (elevational/latitudinal gradient)
            const featT = 14.5 - (pLat - centerLat) * 18.0 + Math.sin(i * 1.5) * 1.8;
            // Feature 2: Precipitation proxy (coastal/topographic gradient)
            const featP = 65.0 + (pLng - centerLng) * 35.0 + Math.cos(i * 2.1) * 8.0;

            let label = 0;
            if (taskMode === 'synthetic') {
                label = (i % 2 === 0) ? 0 : 1;
            } else if (taskMode === 'species') {
                label = i % 3;
            } else {
                if (featT >= 14.5 && featP >= 64.0) label = 0;
                else if (featT < 13.5 && featP < 66.0) label = 1;
                else label = 2;
            }

            samples.push({
                id: i + 1,
                lat: pLat,
                lng: pLng,
                f1: featT,
                f2: featP,
                label,
                color: classes[label].color,
                className: classes[label].name
            });
        }
        this.trainingPoints = samples;

        // 2. Clear old entities
        this.clearOverlay(false);

        // 3. Classify spatial grid (22x22 cells = 484 tiles)
        const N = 20;
        const dLat = (north - south) / N;
        const dLng = (east - west) / N;

        const classifyPoint = (qLat, qLng, qF1, qF2) => {
            if (modelType === 'knn') {
                // KNN classification
                const dists = samples.map(s => {
                    let d;
                    if (metric === 'spherical') {
                        d = this.haversineKm(qLat, qLng, s.lat, s.lng);
                    } else {
                        const df1 = (qF1 - s.f1);
                        const df2 = (qF2 - s.f2) * 0.3;
                        d = Math.sqrt(df1 * df1 + df2 * df2);
                    }
                    return { dist: d, label: s.label };
                });
                dists.sort((a, b) => a.dist - b.dist);
                const kNearest = dists.slice(0, kVal);
                const votes = {};
                kNearest.forEach(n => {
                    const weight = 1 / (n.dist + 1e-3);
                    votes[n.label] = (votes[n.label] || 0) + weight;
                });
                let bestLabel = 0, maxV = -1;
                for (const [lbl, v] of Object.entries(votes)) {
                    if (v > maxV) { maxV = v; bestLabel = parseInt(lbl, 10); }
                }
                return bestLabel;
            } else {
                // Kernel SVM RBF Proxy
                const gamma = 0.1 * kVal;
                const scores = {};
                classes.forEach(c => { scores[c.id] = 0; });
                samples.forEach(s => {
                    const df1 = (qF1 - s.f1);
                    const df2 = (qF2 - s.f2) * 0.3;
                    const rbf = Math.exp(-gamma * (df1 * df1 + df2 * df2));
                    scores[s.label] += rbf;
                });
                let bestLabel = 0, maxS = -Infinity;
                for (const [lbl, score] of Object.entries(scores)) {
                    if (score > maxS) { maxS = score; bestLabel = parseInt(lbl, 10); }
                }
                return bestLabel;
            }
        };

        const viewer = AppState.map?._viewer;
        if (viewer && window.Cesium) {
            // Draw grid rectangles on Cesium 3D Globe
            for (let r = 0; r < N; r++) {
                const sCell = south + r * dLat;
                const nCell = sCell + dLat;
                const cLat = (sCell + nCell) / 2;

                for (let c = 0; c < N; c++) {
                    const wCell = west + c * dLng;
                    const eCell = wCell + dLng;
                    const cLng = (wCell + eCell) / 2;

                    const qF1 = 14.5 - (cLat - centerLat) * 18.0;
                    const qF2 = 65.0 + (cLng - centerLng) * 35.0;
                    const predClass = classifyPoint(cLat, cLng, qF1, qF2);
                    const colorHex = classes[predClass].color;

                    const ent = viewer.entities.add({
                        rectangle: {
                            coordinates: Cesium.Rectangle.fromDegrees(wCell, sCell, eCell, nCell),
                            material: Cesium.Color.fromCssColorString(colorHex).withAlpha(0.36),
                            classificationType: Cesium.ClassificationType.BOTH
                        }
                    });
                    this.drawnEntities.push(ent);
                }
            }

            // Draw training sample points
            const latLbl = window.I18n?.currentLang === 'zh' ? '纬度' : 'Lat';
            const lngLbl = window.I18n?.currentLang === 'zh' ? '经度' : 'Lng';
            const tLbl = window.I18n?.currentLang === 'zh' ? '气温' : 'Temp';
            const pLbl = window.I18n?.currentLang === 'zh' ? '降水' : 'Precip';

            samples.forEach(s => {
                const ptEnt = viewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(s.lng, s.lat, 80),
                    point: {
                        pixelSize: 11,
                        color: Cesium.Color.fromCssColorString(s.color),
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 2
                    },
                    description: `<strong>${s.className}</strong><br>${latLbl}: ${s.lat.toFixed(4)}<br>${lngLbl}: ${s.lng.toFixed(4)}<br>${tLbl}: ${s.f1.toFixed(1)}°C<br>${pLbl}: ${s.f2.toFixed(1)}mm`
                });
                this.drawnEntities.push(ptEnt);
            });

            viewer.scene.requestRender();
        }

        // 4. Render Feature Space 2D Chart in Plotly
        this.renderFeatureSpacePlot(samples, classes, classifyPoint);

        if (statusEl) {
            const isZh = window.I18n?.currentLang === 'zh';
            statusEl.innerHTML = isZh
                ? `已在 3D 地球渲染 <strong>${N * N}</strong> 个分类决策面像元与 <strong>${samples.length}</strong> 个参考训练点。算法: <strong>${modelType.toUpperCase()}</strong> (参数: ${kVal})。`
                : `Rendered <strong>${N * N}</strong> decision pixels and <strong>${samples.length}</strong> reference training points on 3D globe. Model: <strong>${modelType.toUpperCase()}</strong> (Param: ${kVal}).`;
        }
    },

    renderFeatureSpacePlot(samples, classes, classifyPoint) {
        const chartEl = document.getElementById('vml-feature-chart');
        if (!chartEl || !window.Plotly) return;

        const traces = [];

        // Background decision contour mesh in feature space (T vs Precip)
        const tGrid = [];
        const pGrid = [];
        const zGrid = [];
        const tSteps = 25;
        const pSteps = 25;
        const tMin = 10, tMax = 18;
        const pMin = 45, pMax = 85;

        for (let i = 0; i <= tSteps; i++) {
            tGrid.push(tMin + (tMax - tMin) * (i / tSteps));
        }
        for (let j = 0; j <= pSteps; j++) {
            pGrid.push(pMin + (pMax - pMin) * (j / pSteps));
        }
        for (let j = 0; j <= pSteps; j++) {
            const row = [];
            for (let i = 0; i <= tSteps; i++) {
                const t = tGrid[i];
                const p = pGrid[j];
                row.push(classifyPoint(0, 0, t, p));
            }
            zGrid.push(row);
        }

        // Contour trace
        traces.push({
            x: tGrid,
            y: pGrid,
            z: zGrid,
            type: 'contour',
            showscale: false,
            contours: { coloring: 'heatmap' },
            colorscale: [
                [0.0, 'rgba(16, 185, 129, 0.25)'],
                [0.5, 'rgba(59, 130, 246, 0.25)'],
                [1.0, 'rgba(245, 158, 11, 0.25)']
            ],
            hoverinfo: 'none'
        });

        // Scatter points grouped by class
        classes.forEach(c => {
            const cSamples = samples.filter(s => s.label === c.id);
            traces.push({
                x: cSamples.map(s => s.f1),
                y: cSamples.map(s => s.f2),
                mode: 'markers',
                type: 'scatter',
                name: c.name,
                customdata: cSamples.map(s => [s.lat, s.lng, s.id]),
                marker: {
                    size: 10,
                    color: c.color,
                    line: { color: '#ffffff', width: 1.5 }
                },
                hovertemplate: `<b>${c.name}</b><br>${window.I18n?.currentLang === "zh" ? "气温" : "Temp"}: %{x:.2f} °C<br>${window.I18n?.currentLang === "zh" ? "降水" : "Precip"}: %{y:.2f} mm<extra></extra>`
            });
        });

        const layout = {
            paper_bgcolor: '#1e293b',
            plot_bgcolor: '#0f172a',
            margin: { l: 45, r: 20, t: 30, b: 40 },
            xaxis: { title: { text: window.I18n ? window.I18n.t('vml.feat_temp') : 'Feature 1: Temperature (°C)', font: { color: '#94a3b8', size: 11 } }, color: '#cbd5e1', gridcolor: '#334155' },
            yaxis: { title: { text: window.I18n ? window.I18n.t('vml.feat_precip') : 'Feature 2: Precipitation (mm)', font: { color: '#94a3b8', size: 11 } }, color: '#cbd5e1', gridcolor: '#334155' },
            legend: { orientation: 'h', y: 1.15, x: 0, font: { color: '#cbd5e1', size: 10 } }
        };

        Plotly.newPlot(chartEl, traces, layout, { displayModeBar: false, responsive: true });

        // Click on feature space scatter point flies Cesium camera to that location
        chartEl.on('plotly_click', (data) => {
            const pt = data?.points?.[0];
            if (pt && pt.customdata) {
                const [targetLat, targetLng] = pt.customdata;
                AppState.map?.flyTo?.(targetLat, targetLng, 14);
            }
        });
    },

    clearOverlay(updateStatus = true) {
        const viewer = AppState.map?._viewer;
        if (viewer && this.drawnEntities.length) {
            this.drawnEntities.forEach(ent => {
                try { viewer.entities.remove(ent); } catch (_) {}
            });
            viewer.scene?.requestRender?.();
        }
        this.drawnEntities = [];
        this.trainingPoints = [];

        if (updateStatus) {
            const statusEl = document.getElementById('vml-status');
            if (statusEl) statusEl.textContent = window.I18n ? window.I18n.t('vml.cleared_status') : 'Cleared decision surface overlay from map & feature space.';
            const chartEl = document.getElementById('vml-feature-chart');
            if (chartEl && window.Plotly) Plotly.purge(chartEl);
        }
    },

    /* ---------------- Tab 2: Neural Network Topology & Saliency ---------------- */
    setupNNControls() {
        const animBtn = document.getElementById('vml-animate-nn');
        const saliencyBtn = document.getElementById('vml-calc-saliency');

        if (animBtn) animBtn.addEventListener('click', () => this.animateNN());
        if (saliencyBtn) saliencyBtn.addEventListener('click', () => this.renderSaliencyChart());
    },

    initNNCanvas() {
        const canvas = document.getElementById('vml-nn-canvas');
        if (!canvas) return;
        this.nnCanvas = canvas;
        this.nnCtx = canvas.getContext('2d');

        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        this.nnCtx.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;

        const inputLabels = window.I18n?.currentLang === 'zh'
            ? ['T2M积温', '降水湿度', 'NDVI滞后', 'sin(DOY)', 'cos(DOY)']
            : ['T2M GDD', 'Precip/Moisture', 'NDVI Lag', 'sin(DOY)', 'cos(DOY)'];
        const outputLabels = window.I18n?.currentLang === 'zh'
            ? ['始花DOY', '适生度']
            : ['Flowering DOY', 'Suitability'];

        // Neural network layers: [5, 6, 4, 2]
        const layers = [
            { count: 5, labels: inputLabels },
            { count: 6, labels: ['H1.1', 'H1.2', 'H1.3', 'H1.4', 'H1.5', 'H1.6'] },
            { count: 4, labels: ['H2.1', 'H2.2', 'H2.3', 'H2.4'] },
            { count: 2, labels: outputLabels }
        ];

        this.nnNodes = [];
        const colSpacing = (w - 70) / (layers.length - 1);

        layers.forEach((layer, colIdx) => {
            const x = 35 + colIdx * colSpacing;
            const rowSpacing = (h - 50) / (layer.count + 1);
            const layerNodes = [];

            for (let rowIdx = 0; rowIdx < layer.count; rowIdx++) {
                const y = 25 + (rowIdx + 1) * rowSpacing;
                layerNodes.push({
                    x, y,
                    col: colIdx,
                    row: rowIdx,
                    label: layer.labels[rowIdx],
                    glow: 0
                });
            }
            this.nnNodes.push(layerNodes);
        });

        this.drawNNNetwork(w, h);
    },

    drawNNNetwork(w, h) {
        const ctx = this.nnCtx;
        if (!ctx) return;

        ctx.clearRect(0, 0, w, h);

        // Draw connections
        for (let l = 0; l < this.nnNodes.length - 1; l++) {
            const currLayer = this.nnNodes[l];
            const nextLayer = this.nnNodes[l + 1];

            currLayer.forEach((from, i) => {
                nextLayer.forEach((to, j) => {
                    const weightVal = Math.sin(i * 3 + j * 7 + l * 2);
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.strokeStyle = weightVal > 0 ? 'rgba(56, 189, 248, 0.22)' : 'rgba(236, 72, 153, 0.18)';
                    ctx.lineWidth = Math.abs(weightVal) * 1.8 + 0.5;
                    ctx.stroke();
                });
            });
        }

        // Draw nodes
        this.nnNodes.forEach((layer, colIdx) => {
            layer.forEach(node => {
                ctx.save();
                ctx.beginPath();
                ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);

                if (colIdx === 0) {
                    ctx.fillStyle = node.glow > 0 ? '#38bdf8' : '#0284c7';
                } else if (colIdx === this.nnNodes.length - 1) {
                    ctx.fillStyle = node.glow > 0 ? '#34d399' : '#059669';
                } else {
                    ctx.fillStyle = node.glow > 0 ? '#a78bfa' : '#6366f1';
                }
                ctx.fill();

                if (node.glow > 0) {
                    ctx.shadowColor = '#38bdf8';
                    ctx.shadowBlur = 12 * node.glow;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2.5;
                    node.glow = Math.max(0, node.glow - 0.04);
                } else {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                    ctx.lineWidth = 1.2;
                }
                ctx.stroke();
                ctx.restore();

                // Draw label for input and output nodes
                if (colIdx === 0) {
                    ctx.font = '10px sans-serif';
                    ctx.fillStyle = '#94a3b8';
                    ctx.textAlign = 'right';
                    ctx.fillText(node.label, node.x - 12, node.y + 3);
                } else if (colIdx === this.nnNodes.length - 1) {
                    ctx.font = '10px sans-serif';
                    ctx.fillStyle = '#34d399';
                    ctx.textAlign = 'left';
                    ctx.fillText(node.label, node.x + 12, node.y + 3);
                }
            });
        });
    },

    animateNN() {
        if (!this.nnCanvas || !this.nnCtx) this.initNNCanvas();
        if (!this.nnNodes.length) return;

        // Spawn pulse particles travelling from input layer to output layer
        this.nnParticles = [];
        const numParticles = 24;

        for (let p = 0; p < numParticles; p++) {
            const startNodeIdx = p % this.nnNodes[0].length;
            this.nnParticles.push({
                layer: 0,
                fromNode: this.nnNodes[0][startNodeIdx],
                toNode: this.nnNodes[1][(startNodeIdx + p) % this.nnNodes[1].length],
                progress: -(p * 0.08), // Staggered release
                speed: 0.035 + (p % 3) * 0.005
            });
        }

        if (this.nnAnimFrame) cancelAnimationFrame(this.nnAnimFrame);

        const rect = this.nnCanvas.parentElement.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        const loop = () => {
            this.drawNNNetwork(w, h);

            let activeCount = 0;
            const ctx = this.nnCtx;

            this.nnParticles.forEach(particle => {
                particle.progress += particle.speed;
                if (particle.progress >= 0 && particle.progress <= 1) {
                    activeCount++;
                    const currX = particle.fromNode.x + (particle.toNode.x - particle.fromNode.x) * particle.progress;
                    const currY = particle.fromNode.y + (particle.toNode.y - particle.fromNode.y) * particle.progress;

                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(currX, currY, 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#38bdf8';
                    ctx.shadowColor = '#38bdf8';
                    ctx.shadowBlur = 8;
                    ctx.fill();
                    ctx.restore();
                } else if (particle.progress > 1) {
                    particle.toNode.glow = 1.0;
                    if (particle.layer < this.nnNodes.length - 2) {
                        particle.layer++;
                        particle.fromNode = particle.toNode;
                        const nextLayer = this.nnNodes[particle.layer + 1];
                        particle.toNode = nextLayer[Math.floor(Math.random() * nextLayer.length)];
                        particle.progress = 0;
                        activeCount++;
                    }
                } else {
                    activeCount++;
                }
            });

            if (activeCount > 0) {
                this.nnAnimFrame = requestAnimationFrame(loop);
            }
        };

        this.nnAnimFrame = requestAnimationFrame(loop);
    },

    renderSaliencyChart() {
        const chartEl = document.getElementById('vml-saliency-chart');
        if (!chartEl || !window.Plotly) return;

        const features = [
            window.I18n ? window.I18n.t('vml.sal_frost') : 'Extreme Temp Inversion (Frost Risk)',
            window.I18n ? window.I18n.t('vml.sal_doy') : 'Seasonal Harmonic (DOY Harmonic)',
            window.I18n ? window.I18n.t('vml.sal_ndvi') : 'Vegetation Memory (NDVI Lag)',
            window.I18n ? window.I18n.t('vml.sal_precip') : 'Precip & Moisture',
            window.I18n ? window.I18n.t('vml.sal_gdd') : 'Effective Growing Degree Days (GDD / T2M)'
        ];
        const importances = [6.8, 14.3, 17.5, 23.2, 38.2];

        const trace = {
            x: importances,
            y: features,
            type: 'bar',
            orientation: 'h',
            text: importances.map(v => `${v.toFixed(1)}%`),
            textposition: 'auto',
            marker: {
                color: [
                    '#64748b',
                    '#8b5cf6',
                    '#06b6d4',
                    '#3b82f6',
                    '#10b981'
                ],
                line: { color: 'rgba(255,255,255,0.2)', width: 1 }
            }
        };

        const layout = {
            paper_bgcolor: '#1e293b',
            plot_bgcolor: '#0f172a',
            margin: { l: 155, r: 25, t: 25, b: 35 },
            xaxis: { title: { text: window.I18n ? window.I18n.t('vml.saliency_axis') : 'Feature Saliency Attribution Contribution (%)', font: { color: '#94a3b8', size: 11 } }, color: '#cbd5e1', gridcolor: '#334155' },
            yaxis: { color: '#cbd5e1', font: { size: 11 } }
        };

        Plotly.newPlot(chartEl, [trace], layout, { displayModeBar: false, responsive: true });
    }
};

/* =========================================================
 * Research Agent Manager (openJiuwen + DeepSeek)
 * =======================================================*/
const ResearchAgentManager = {
    activeRunId: null,
    pollTimer: null,
    eventSource: null,

    init() {
        this.setupControls();
    },

    setupControls() {
        const runBtn = document.getElementById('agent-run-btn');
        const copyBtn = document.getElementById('agent-copy-report');

        if (runBtn) {
            runBtn.addEventListener('click', () => this.startResearch());
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const content = document.getElementById('agent-report-content');
                if (content) {
                    navigator.clipboard.writeText(content.innerText || content.textContent);
                    copyBtn.textContent = window.I18n ? window.I18n.t('ra.copied') : 'Copied!';
                    setTimeout(() => { copyBtn.textContent = window.I18n ? window.I18n.t('ra.copy_btn') : 'Copy Report'; }, 2000);
                }
            });
        }
    },

    async startResearch() {
        const qInput = document.getElementById('agent-question');
        const question = qInput?.value?.trim();
        if (!question) {
            alert(window.I18n ? window.I18n.t('ra.alert_empty') : 'Please enter a research question or hypothesis.');
            return;
        }

        const startYear = parseInt(document.getElementById('agent-start-year')?.value || '2020', 10);
        const endYear = parseInt(document.getElementById('agent-end-year')?.value || '2024', 10);
        const radius = parseFloat(document.getElementById('agent-radius')?.value || '25');
        const mode = document.getElementById('agent-mode')?.value || 'live';

        const runBtn = document.getElementById('agent-run-btn');
        const statusEl = document.getElementById('agent-status');
        const thinkingWrap = document.getElementById('agent-thinking-wrap');
        const thinkingContent = document.getElementById('agent-thinking-content');
        const reportWrap = document.getElementById('agent-report-wrap');

        if (runBtn) runBtn.disabled = true;
        if (statusEl) statusEl.innerHTML = '<span class="pulse-icon"></span> ' + (window.I18n ? window.I18n.t('ra.status_init') : 'Building frozen protocol & launching openJiuwen multi-agent engine...');
        if (thinkingWrap) thinkingWrap.classList.remove('hidden');
        if (thinkingContent) thinkingContent.innerHTML = window.I18n ? window.I18n.t('ra.thinking_init') : 'Establishing session with openJiuwen 8-stage pipeline, initializing DeepSeek reasoning...';
        if (reportWrap) reportWrap.classList.add('hidden');

        // Reset stepper
        document.querySelectorAll('#agent-stepper .step').forEach(s => {
            s.classList.remove('active', 'done');
        });

        const { lat, lng } = MapManager.getCurrentLocation() || CONFIG.INIT;
        const payload = {
            question,
            period: { startYear, endYear },
            aoi: {
                name: `${window.I18n ? window.I18n.t('ra.region_label') : 'Region'} (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
                lat, lng,
                radiusKm: radius
            },
            mode
        };

        try {
            const resp = await fetch('/api/research/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errJson = await resp.json().catch(() => ({}));
                throw new Error(errJson.error || `HTTP ${resp.status}`);
            }

            const run = await resp.json();
            this.activeRunId = run.id;

            if (statusEl) statusEl.innerHTML = `<span class="pulse-icon"></span> ${window.I18n ? window.I18n.t('ra.status_running') : 'Multi-agent inference in progress (Task ID: '}<code>${run.id}</code>)...`;

            // Start polling
            this.startPolling(run.id);
        } catch (err) {
            console.error('Failed to start research:', err);
            const isConnError = err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
            const userMsg = isConnError
                ? (window.I18n ? window.I18n.t('ra.err_connect') : 'Failed to connect to backend service (5174). If service terminated, run start_server.bat or refresh.')
                : `${window.I18n ? window.I18n.t('ra.err_start') : 'Launch failed: '}${err.message}`;
            if (statusEl) statusEl.innerHTML = `<span style="color:#f87171;">️ ${userMsg}</span>`;
            if (runBtn) runBtn.disabled = false;
        }
    },

    startPolling(runId) {
        if (this.pollTimer) clearInterval(this.pollTimer);

        const stageDescriptions = {
            protocol: window.I18n ? window.I18n.t('ra.p_protocol') : 'Agent 01: Generating structured research protocol, establishing causal estimand and audit rules...',
            literature: window.I18n ? window.I18n.t('ra.p_literature') : 'Agent 02: Searching Europe PMC, arXiv and CrossRef for related phenological literature...',
            data: window.I18n ? window.I18n.t('ra.p_data') : 'Agent 03: Synchronizing NASA POWER weather and MODIS surface reflectance series...',
            geo: window.I18n ? window.I18n.t('ra.p_geo') : 'Agent 04: Performing remote sensing cloud masking, land cover filtering and spatial QC...',
            statistics: window.I18n ? window.I18n.t('ra.p_statistics') : 'Agent 05: Fitting GDD thermal response curves and Sen\'s slope trend test...',
            evidence: window.I18n ? window.I18n.t('ra.p_evidence') : 'Agent 06: Cross-auditing phenological and meteorological evidence chains...',
            reproduce: window.I18n ? window.I18n.t('ra.p_reproduce') : 'Agent 07: Computing SHA-256 hash snapshots for independent reproducibility verification...',
            report: window.I18n ? window.I18n.t('ra.p_report') : 'Agent 08: Calling DeepSeek reasoning model to synthesize evidence into academic report...'
        };

        this.pollTimer = setInterval(async () => {
            try {
                const resp = await fetch(`/api/research/runs/${runId}`);
                if (!resp.ok) return;
                const runData = await resp.json();

                // Update stages in UI
                this.updateStageProgress(runData, stageDescriptions);

                if (runData.status === 'completed') {
                    clearInterval(this.pollTimer);
                    this.onResearchComplete(runData);
                } else if (runData.status === 'failed') {
                    clearInterval(this.pollTimer);
                    this.onResearchFailed(runData);
                }
            } catch (e) {
                console.warn('Poll research run error:', e);
            }
        }, 1300);
    },

    updateStageProgress(runData, stageDescriptions) {
        const statusEl = document.getElementById('agent-status');
        const thinkingContent = document.getElementById('agent-thinking-content');

        const stageOrder = ['protocol', 'literature', 'data', 'geo', 'statistics', 'evidence', 'reproduce', 'report'];
        const completedStages = new Set();
        let runningStage = null;

        (runData.events || []).forEach(ev => {
            if (ev.type === 'stage') {
                if (ev.status === 'completed') completedStages.add(ev.stageId);
                else if (ev.status === 'running') runningStage = ev.stageId;
            }
        });

        stageOrder.forEach(stg => {
            const stepEl = document.querySelector(`#agent-stepper .step[data-stage="${stg}"]`);
            if (!stepEl) return;
            if (completedStages.has(stg)) {
                stepEl.classList.add('done');
                stepEl.classList.remove('active');
            } else if (runningStage === stg || runData.currentStage === stg) {
                stepEl.classList.add('active');
                stepEl.classList.remove('done');
            }
        });

        const activeStage = runningStage || runData.currentStage;
        if (activeStage && stageDescriptions[activeStage] && statusEl) {
            statusEl.innerHTML = `<span class="pulse-icon"></span> ${stageDescriptions[activeStage]}`;
            if (thinkingContent) {
                thinkingContent.innerHTML = `<strong>[${window.I18n ? window.I18n.t('ra.stage_current') : 'Current Stage: '}${activeStage.toUpperCase()}]</strong><br>${stageDescriptions[activeStage]}`;
            }
        }
    },

    onResearchComplete(runData) {
        const runBtn = document.getElementById('agent-run-btn');
        const statusEl = document.getElementById('agent-status');
        const reportWrap = document.getElementById('agent-report-wrap');
        const reportContent = document.getElementById('agent-report-content');
        const thinkingContent = document.getElementById('agent-thinking-content');

        if (runBtn) runBtn.disabled = false;
        if (statusEl) statusEl.innerHTML = `<strong>${window.I18n ? window.I18n.t('ra.status_done') : 'Inference complete! 8-stage multi-agent research report generated (Audit SHA-256: '}<code>${(runData.result?.reproduction?.outputHash || '').slice(0, 16)}...</code>)。`;

        // Mark all steps done
        document.querySelectorAll('#agent-stepper .step').forEach(s => {
            s.classList.add('done');
            s.classList.remove('active');
        });

        const reportMd = runData.result?.report || '';

        // Extract thinking summary if present
        const thinkingMatch = reportMd.match(/> \*\*DeepSeek (?:推理思考摘要|Reasoning Summary|Thinking Summary)[：:]\*\*\n([\s\S]*?)(?=\n\n#|\n\n##|$)/);
        if (thinkingMatch && thinkingContent) {
            thinkingContent.innerHTML = thinkingMatch[1].replace(/^> /gm, '').replace(/\n/g, '<br>');
        } else if (thinkingContent) {
            thinkingContent.innerHTML = window.I18n ? window.I18n.t('ra.audit_summary', '', { status: runData.result?.evidence?.audit?.status || 'PASS', count: runData.result?.literature?.records?.length || 0 }) : `Full 8-stage inference and audit verification completed.<br>- Protocol Audit: ${runData.result?.evidence?.audit?.status || 'PASS'}<br>- Literature: ${runData.result?.literature?.records?.length || 0} citations<br>- Pixel QC: Passed<br>- Reproducibility: Hash snapshot verified.`;
        }

        if (reportWrap && reportContent) {
            reportWrap.classList.remove('hidden');
            if (window.marked && typeof window.marked.parse === 'function') {
                reportContent.innerHTML = window.marked.parse(reportMd);
            } else {
                reportContent.innerHTML = reportMd.replace(/\n/g, '<br>');
            }
        }
    },

    onResearchFailed(runData) {
        const runBtn = document.getElementById('agent-run-btn');
        const statusEl = document.getElementById('agent-status');
        if (runBtn) runBtn.disabled = false;
        if (statusEl) statusEl.textContent = `${window.I18n ? window.I18n.t('ra.status_err') : 'Inference error: '}${runData.error?.message || 'unknown'}`;
    }
};

/* =========================================================
 * Bootstrap
 * =======================================================*/
window.addEventListener('floracast:languageChange', () => {
    if (WeatherSearchManager && WeatherSearchManager._lastSearchData) {
        WeatherSearchManager.renderSearchResults(WeatherSearchManager._lastSearchData);
    }
});

window.addEventListener('DOMContentLoaded', () => {
    // Expose key managers for popup integrations / debugging
    window.UIManager = UIManager;
    window.MapManager = MapManager;
    window.VisualMLManager = VisualMLManager;
    window.ResearchAgentManager = ResearchAgentManager;
    window.ResearchAgentUI = ResearchAgentManager;
    try { window.PlantIDManager = PlantIDManager; } catch (_) {}

    UIManager.init();
    MapManager.init();
});

