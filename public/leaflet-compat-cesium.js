
/*
  Leaflet Compatibility Layer for CesiumJS
  --------------------------------------------------------
  This file exposes a minimal subset of the Leaflet API used by FloraCast,
  but renders everything on a Cesium 3D globe.

  Supported:
  - L.map(...)
  - L.tileLayer(url, opts).addTo(map)
  - L.tileLayer.wms(baseUrl, params).addTo(map)
  - L.icon(opts)
  - L.marker([lat,lng], {icon}).addTo(map), marker.bindPopup(html)
  - L.heatLayer(points, opts).addTo(map), heat.setLatLngs(points)
  - L.markerClusterGroup().addTo(map), cluster.addLayer(marker), cluster.clearLayers()
*/

(() => {
  if (!window.Cesium) {
    console.error('[LeafletCompat] Cesium not found. Make sure Cesium is loaded before leaflet-compat-cesium.js');
    return;
  }

  const C = window.Cesium;
  const EARTH_RADIUS = 6378137;

  // Cesium split-direction enums differ across versions/builds. Some builds expose
  // `Cesium.ImagerySplitDirection`, others use `Cesium.SplitDirection`, and in rare
  // cases the enum isn't present at all.
  // FloraCast's dual-globe compare does not rely on split imagery, but parts of this
  // compat layer may still read/write `layer.splitDirection`. To avoid hard crashes
  // during initialization (e.g. "Cannot read properties of undefined (reading 'NONE')"),
  // we provide a safe fallback.
  const SplitDir = (C && (C.ImagerySplitDirection || C.SplitDirection)) || { NONE: 0, LEFT: 1, RIGHT: 2 };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  const CoordTransform = {
    PI: 3.1415926535897932384626,
    X_PI: (3.14159265358979324 * 3000.0) / 180.0,
    A: 6378245.0,
    EE: 0.00669342162296594323,

    outOfChina(lng, lat) {
      return (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271);
    },

    transformLat(x, y) {
      let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
      ret += (20.0 * Math.sin(6.0 * x * this.PI) + 20.0 * Math.sin(2.0 * x * this.PI)) * 2.0 / 3.0;
      ret += (20.0 * Math.sin(y * this.PI) + 40.0 * Math.sin(y / 3.0 * this.PI)) * 2.0 / 3.0;
      ret += (160.0 * Math.sin(y / 12.0 * this.PI) + 320 * Math.sin(y * this.PI / 30.0)) * 2.0 / 3.0;
      return ret;
    },

    transformLng(x, y) {
      let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
      ret += (20.0 * Math.sin(6.0 * x * this.PI) + 20.0 * Math.sin(2.0 * x * this.PI)) * 2.0 / 3.0;
      ret += (20.0 * Math.sin(x * this.PI) + 40.0 * Math.sin(x / 3.0 * this.PI)) * 2.0 / 3.0;
      ret += (150.0 * Math.sin(x / 12.0 * this.PI) + 300.0 * Math.sin(x / 30.0 * this.PI)) * 2.0 / 3.0;
      return ret;
    },

    wgs84ToGcj02(lng, lat) {
      if (this.outOfChina(lng, lat)) return [lng, lat];
      let dlat = this.transformLat(lng - 105.0, lat - 35.0);
      let dlng = this.transformLng(lng - 105.0, lat - 35.0);
      const radlat = (lat / 180.0) * this.PI;
      let magic = Math.sin(radlat);
      magic = 1 - this.EE * magic * magic;
      const sqrtmagic = Math.sqrt(magic);
      dlat = (dlat * 180.0) / (((this.A * (1 - this.EE)) / (magic * sqrtmagic)) * this.PI);
      dlng = (dlng * 180.0) / ((this.A / sqrtmagic) * Math.cos(radlat) * this.PI);
      return [lng + dlng, lat + dlat];
    },

    gcj02ToBd09(lng, lat) {
      const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * this.X_PI);
      const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * this.X_PI);
      return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
    },

    bd09ToGcj02(bd_lng, bd_lat) {
      const x = bd_lng - 0.0065;
      const y = bd_lat - 0.006;
      const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * this.X_PI);
      const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * this.X_PI);
      return [z * Math.cos(theta), z * Math.sin(theta)];
    },

    gcj02ToWgs84(lng, lat) {
      if (this.outOfChina(lng, lat)) return [lng, lat];
      let dlat = this.transformLat(lng - 105.0, lat - 35.0);
      let dlng = this.transformLng(lng - 105.0, lat - 35.0);
      const radlat = (lat / 180.0) * this.PI;
      let magic = Math.sin(radlat);
      magic = 1 - this.EE * magic * magic;
      const sqrtmagic = Math.sqrt(magic);
      dlat = (dlat * 180.0) / (((this.A * (1 - this.EE)) / (magic * sqrtmagic)) * this.PI);
      dlng = (dlng * 180.0) / ((this.A / sqrtmagic) * Math.cos(radlat) * this.PI);
      return [lng * 2 - (lng + dlng), lat * 2 - (lat + dlat)];
    },

    wgs84ToBd09(lng, lat) {
      const gcj = this.wgs84ToGcj02(lng, lat);
      return this.gcj02ToBd09(gcj[0], gcj[1]);
    },

    bd09ToWgs84(lng, lat) {
      const gcj = this.bd09ToGcj02(lng, lat);
      return this.gcj02ToWgs84(gcj[0], gcj[1]);
    }
  };
  window.CoordTransform = CoordTransform;

  function toDegreesLatLng(cartographic) {
    return {
      lat: C.Math.toDegrees(cartographic.latitude),
      lng: C.Math.toDegrees(cartographic.longitude)
    };
  }

  function centerToCartographic(viewer) {
    const canvas = viewer.scene.canvas;
    const center = new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const cart = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid);
    if (!cart) return null;
    return C.Cartographic.fromCartesian(cart);
  }

  function zoomFromHeight(heightMeters) {
    const h = clamp(heightMeters, 100, 2.5e7);
    const z = 1 + Math.log2(2.2e7 / h);
    return clamp(Math.round(z), 0, 20);
  }

  function heightFromZoom(zoom) {
    const z = clamp(zoom, 0, 20);
    const height = 2.2e7 / Math.pow(2, z - 1);
    return clamp(height, 150, 2.5e7);
  }

  function normalizeXYZUrl(url) {
    // Replace Leaflet subdomain placeholder
    if (url.includes('{s}')) url = url.replace('{s}', 'a');
    return url;
  }

  // --- Popup handling (simple) ---
  function ensurePopupHost() {
    let host = document.getElementById('cesium-popup-host');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'cesium-popup-host';
    host.style.position = 'absolute';
    host.style.left = '0';
    host.style.top = '0';
    host.style.pointerEvents = 'none';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.zIndex = '30';
    document.body.appendChild(host);
    return host;
  }

  // Map Tile Loader Helper
  const MapTileLoader = {
    _el: null,
    _textEl: null,
    _hideTimer: null,

    init() {
      this._el = document.getElementById('map-tile-loader');
      this._textEl = document.getElementById('map-tile-loader-text');
    },

    show(text = '底图资源加载中...') {
      if (!this._el) this.init();
      if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
      if (this._textEl && text) this._textEl.textContent = text;
      if (this._el) this._el.classList.add('active');
    },

    hide(delay = 400) {
      if (!this._el) this.init();
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        if (this._el) this._el.classList.remove('active');
        this._hideTimer = null;
      }, delay);
    }
  };
  window.MapTileLoader = MapTileLoader;

  class CesiumMap {
    constructor(containerId, options = {}) {
      const container = document.getElementById(containerId);
      if (!container) throw new Error(`[LeafletCompat] Container not found: ${containerId}`);

      // Make container be the stacking context for popups
      container.style.position = container.style.position || 'relative';

      this._containerId = containerId;
      this._container = container;
      this._events = { click: [], moveend: [], zoomend: [] };
      this._layers = new Set();      // imagery layers + datasources
      this._baseUrl = null;

      // Compare (imagery split) support.
      // When enabled, imagery layers added to this map will be assigned
      // a split direction (LEFT / RIGHT). Default is NONE.
      this._splitDirection = SplitDir.NONE;

      // Create viewer
      const viewer = new C.Viewer(containerId, {
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        baseLayerPicker: false,
        sceneModePicker: false,
        fullscreenButton: false,
        vrButton: false,
        infoBox: false,
        selectionIndicator: false,
        shouldAnimate: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        terrainProvider: new C.EllipsoidTerrainProvider(),
        imageryProvider: false
      });

      // Lighting / atmosphere
      // If you want a uniform brightness (no night-side shading), keep lighting OFF.
      try { viewer.scene.globe.enableLighting = false; } catch (_) {}
      try { viewer.scene.globe.dynamicAtmosphereLighting = false; } catch (_) {}
      try { viewer.scene.globe.dynamicAtmosphereLightingFromSun = false; } catch (_) {}

      // Avoid markers / billboards clipping into the globe or becoming hard to pick
      // when the camera is low.
      try { viewer.scene.globe.depthTestAgainstTerrain = false; } catch (_) {}

      // Atmosphere visuals & base styling
      // Disable ground atmosphere haze when lighting is off to keep high-contrast crisp tiles without white fog
      try { viewer.scene.globe.showGroundAtmosphere = false; } catch (_) {}
      try { viewer.scene.skyAtmosphere.show = true; } catch (_) {}

      // Never use default bright blue baseColor! Set to deep space/earth tone.
      try { viewer.scene.globe.baseColor = C.Color.fromCssColorString('#0b1227'); } catch (_) {}

      // Clamp camera orbital zoom so the globe stays nicely framed (8,500 km altitude)
      // and cannot shrink into an empty space void dot.
      try {
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 8.5e6;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 150;
      } catch (_) {}

      // Default split position (used only when any layer has splitDirection != NONE)
      try { viewer.scene.splitPosition = 0.5; } catch (_) {}

      // Remove any default layers if present
      try { viewer.imageryLayers.removeAll(); } catch (_) {}

      this._viewer = viewer;

      // Keep rendering alive even if Cesium throws during a frame.
      try {
        viewer.scene.renderError.addEventListener((scene, err) => {
          console.warn('[Cesium] renderError:', err);
          try { scene.requestRender(); } catch (_) {}
        });
      } catch (_) {}

      // Automatically re-render as tiles stream in from network and display loading indicator
      try {
        viewer.scene.globe.tileLoadProgressEvent.addEventListener((queueLength) => {
          try { viewer.scene.requestRender(); } catch (_) {}
          if (typeof queueLength === 'number') {
            if (queueLength > 0) {
              MapTileLoader.show(`底图资源加载中 (${queueLength})...`);
            } else {
              MapTileLoader.hide(450);
            }
          }
        });
      } catch (_) {}

      for (const delay of [100, 300, 600, 1200, 2000, 3500]) {
        setTimeout(() => {
          try { viewer.scene.requestRender(); } catch (_) {}
        }, delay);
      }

      // Default split position for compare mode (0..1). Safe to set even if unused.
      try { viewer.scene.splitPosition = 0.5; } catch (_) {}

      // Initial view
      const center = options.center || [0, 0];
      const zoom = (typeof options.zoom === 'number') ? options.zoom : 2;
      this.setView({ lat: center[0], lng: center[1] }, zoom, { animate: false });

      // Click handler -> Leaflet-like event
      const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement) => {
        const cart = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
        if (!cart) return;
        const carto = C.Cartographic.fromCartesian(cart);
        const ll = toDegreesLatLng(carto);
        this._fire('click', { latlng: { lat: ll.lat, lng: ll.lng } });
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      this._handler = handler;

      this._inMoveEnd = false;

      viewer.camera.moveEnd.addEventListener(() => {
        // Guard against accidental recursive camera updates that can overflow the stack
        if (this._inMoveEnd) return;
        this._inMoveEnd = true;
        try {
          this._fire('moveend', {});
          this._fire('zoomend', {});
        } finally {
          requestAnimationFrame(() => { this._inMoveEnd = false; });
        }
      });

      // Simple popup on entity click
      // Keep reference to the global outside-click handler so we can remove it safely.
      this._popup = { el: null, entity: null, hideFn: null };
      viewer.screenSpaceEventHandler.setInputAction((movement) => {
        const picked = viewer.scene.pick(movement.position);
        if (!picked || !picked.id) return;
        const entity = picked.id;
        if (!entity || !entity._compatPopupHtml) return;
        this._showPopup(entity, movement.position);
      }, C.ScreenSpaceEventType.LEFT_CLICK);

      window.addEventListener('resize', () => this.invalidateSize());
    }

    get _c() { return C; }
    get _v() { return this._viewer; }

    invalidateSize() {
      try { this._viewer.resize(); } catch (_) {}
      this._viewer.scene.requestRender();
    }

    remove() {
      try { this._handler?.destroy(); } catch (_) {}
      try { this._viewer?.destroy(); } catch (_) {}
    }

    on(evt, fn) {
      if (!this._events[evt]) this._events[evt] = [];
      this._events[evt].push(fn);
      return this;
    }

    off(evt, fn) {
      if (!this._events[evt]) return this;
      this._events[evt] = this._events[evt].filter(f => f !== fn);
      return this;
    }

    _fire(evt, payload) {
      (this._events[evt] || []).forEach(fn => {
        try { fn(payload); } catch (e) { console.warn('[LeafletCompat] handler error', e); }
      });
    }

    getCenter() {
      const carto = centerToCartographic(this._viewer);
      if (!carto) return { lat: 0, lng: 0 };
      const ll = toDegreesLatLng(carto);
      return { lat: ll.lat, lng: ll.lng };
    }

    getZoom() {
      const h = this._viewer.camera.positionCartographic.height;
      return zoomFromHeight(h);
    }

    setView(center, zoom, opts = {}) {
      const lat = center.lat ?? center[0];
      const lng = center.lng ?? center[1];
      const height = heightFromZoom(zoom);

      const dest = C.Cartesian3.fromDegrees(lng, lat, height);
      const duration = opts.animate === false ? 0 : 0.8;

      if (duration === 0) {
        this._viewer.camera.setView({
          destination: dest,
          orientation: {
            heading: 0,
            pitch: -C.Math.PI_OVER_TWO,
            roll: 0
          }
        });
      } else {
        this._viewer.camera.flyTo({
          destination: dest,
          orientation: {
            heading: 0,
            pitch: -C.Math.PI_OVER_TWO,
            roll: 0
          },
          duration
        });
      }
      this._viewer.scene.requestRender();
    }

    flyTo(lat, lng, zoom, duration = 1.2) {
      const height = heightFromZoom(zoom ?? this.getZoom());
      const dest = C.Cartesian3.fromDegrees(lng, lat, height);
      this._viewer.camera.flyTo({
        destination: dest,
        orientation: {
          heading: 0,
          pitch: -C.Math.PI_OVER_TWO,
          roll: 0
        },
        duration
      });
      this._viewer.scene.requestRender();
    }

    // --- Compare (imagery split) helpers ---
    setSplitDirection(direction) {
      // direction: 'left' | 'right' | 'none' | Cesium.ImagerySplitDirection
      const d = String(direction || '').toLowerCase();
      if (d === 'left') this._splitDirection = SplitDir.LEFT;
      else if (d === 'right') this._splitDirection = SplitDir.RIGHT;
      else if (d === 'none' || d === '') this._splitDirection = SplitDir.NONE;
      else if (typeof direction === 'number') this._splitDirection = direction;
      else this._splitDirection = SplitDir.NONE;
      return this;
    }

    setSplitPosition(pos) {
      const p = clamp(Number(pos), 0.0, 1.0);
      try { this._viewer.scene.splitPosition = p; } catch (_) {}
      this._viewer.scene.requestRender();
      return this;
    }

    getSplitPosition() {
      try { return Number(this._viewer.scene.splitPosition); } catch (_) { return 0.5; }
    }

    createSplitProxy(direction) {
      return new CesiumMapProxy(this, direction);
    }

    addLayer(layer) {
      // for symmetry; layers typically call addTo(map)
      return layer.addTo(this);
    }

    removeLayer(layer) {
      if (!layer) return;
      if (layer.__type === 'imagery') {
        try { this._viewer.imageryLayers.remove(layer._imageryLayer, true); } catch (_) {}
        if (layer._baseLayer) {
          try { this._viewer.imageryLayers.remove(layer._baseLayer, true); } catch (_) {}
          layer._baseLayer = null;
        }
        if (this._baseUrl === layer._url) this._baseUrl = null;
      } else if (layer.__type === 'datasource') {
        try { this._viewer.dataSources.remove(layer._dataSource, true); } catch (_) {}
      } else if (layer.__type === 'entity') {
        try { this._viewer.entities.remove(layer._entity); } catch (_) {}
      }
      this._layers.delete(layer);
      this._viewer.scene.requestRender();
    }

    _showPopup(entity, screenPos) {
      // Remove old popup + its outside-click handler
      if (this._popup.hideFn) {
        window.removeEventListener('pointerdown', this._popup.hideFn, true);
        this._popup.hideFn = null;
      }
      if (this._popup.el) {
        this._popup.el.remove();
        this._popup.el = null;
      }
      const host = ensurePopupHost();
      const el = createPopupEl(entity._compatPopupHtml);
      host.appendChild(el);

      // Position near cursor
      const rect = this._viewer.container.getBoundingClientRect();
      const x = rect.left + screenPos.x;
      const y = rect.top + screenPos.y;
      el.style.position = 'fixed';
      el.style.left = `${x + 12}px`;
      el.style.top = `${y + 12}px`;

      this._popup.el = el;
      this._popup.entity = entity;

      // Auto-hide when clicking outside the popup.
      // IMPORTANT: do NOT close on interactions *inside* the popup (links/buttons).
      const hide = (ev) => {
        const pel = this._popup.el;
        if (!pel) {
          window.removeEventListener('pointerdown', hide, true);
          this._popup.hideFn = null;
          return;
        }
        const t = ev && ev.target;
        if (t && (pel === t || pel.contains(t))) return; // allow clicking inside
        pel.remove();
        this._popup.el = null;
        this._popup.entity = null;
        window.removeEventListener('pointerdown', hide, true);
        this._popup.hideFn = null;
      };
      this._popup.hideFn = hide;
      window.addEventListener('pointerdown', hide, true);
    }
  }

  // A lightweight "Map" facade that shares the same Cesium viewer as a base map,
  // but carries a different split direction for imagery layers.
  // Used to implement compare mode without creating a second WebGL context.
  class CesiumMapProxy {
    constructor(baseMap, direction) {
      this._base = baseMap;
      this._viewer = baseMap._viewer;
      this._container = baseMap._container;
      this._events = baseMap._events; // share event bus
      this._layers = new Set();
      this._baseUrl = baseMap._baseUrl;
      this._splitDirection = SplitDir.NONE;
      this.setSplitDirection(direction);
    }

    get _c() { return C; }
    get _v() { return this._viewer; }

    invalidateSize() { return this._base.invalidateSize(); }
    on(evt, fn) { return this._base.on(evt, fn); }
    off(evt, fn) { return this._base.off(evt, fn); }
    getCenter() { return this._base.getCenter(); }
    getZoom() { return this._base.getZoom(); }
    setView(center, zoom, opts = {}) { return this._base.setView(center, zoom, opts); }
    flyTo(lat, lng, zoom, duration) { return this._base.flyTo(lat, lng, zoom, duration); }

    setSplitDirection(direction) {
      const d = String(direction || '').toLowerCase();
      if (d === 'left') this._splitDirection = SplitDir.LEFT;
      else if (d === 'right') this._splitDirection = SplitDir.RIGHT;
      else if (d === 'none' || d === '') this._splitDirection = SplitDir.NONE;
      else if (typeof direction === 'number') this._splitDirection = direction;
      else this._splitDirection = SplitDir.NONE;
      return this;
    }
    setSplitPosition(pos) { this._base.setSplitPosition(pos); return this; }
    getSplitPosition() { return this._base.getSplitPosition(); }

    addLayer(layer) { return layer.addTo(this); }

    removeLayer(layer) {
      if (!layer) return;
      if (layer.__type === 'imagery') {
        try { this._viewer.imageryLayers.remove(layer._imageryLayer, true); } catch (_) {}
        if (layer._baseLayer) {
          try { this._viewer.imageryLayers.remove(layer._baseLayer, true); } catch (_) {}
          layer._baseLayer = null;
        }
        if (this._baseUrl === layer._url) this._baseUrl = null;
      } else if (layer.__type === 'datasource') {
        try { this._viewer.dataSources.remove(layer._dataSource, true); } catch (_) {}
      } else if (layer.__type === 'entity') {
        try { this._viewer.entities.remove(layer._entity); } catch (_) {}
      }
      this._layers.delete(layer);
      this._viewer.scene.requestRender();
    }
  }

  class CesiumTileLayer {
    constructor(url, options = {}) {
      this.__type = 'imagery';
      this._url = url;
      this._opts = options || {};
      this._imageryLayer = null;
      this._provider = null;
      this._added = false;
      this._events = { tileerror: [] };
    }

    on(evt, fn) {
      if (!evt || typeof fn !== 'function') return this;
      const k = String(evt).toLowerCase();
      if (!this._events[k]) this._events[k] = [];
      this._events[k].push(fn);
      return this;
    }

    addTo(map) {
      if (this._added) return this;

      const url = normalizeXYZUrl(this._url);

      // Deduplicate the first base imagery layer.
      if (!map._baseUrl) {
        map._baseUrl = url;
      } else if (map._baseUrl && map._baseUrl === url) {
        this._added = true;
        return this;
      }

      const provider = new C.UrlTemplateImageryProvider({
        url,
        credit: this._opts.attribution || '',
        maximumLevel: this._opts.maxZoom ?? this._opts.maximumLevel ?? 19,
        tileWidth: 256,
        tileHeight: 256
      });
      this._provider = provider;

      // Forward Cesium provider errors to Leaflet-like `tileerror` listeners
      try {
        provider.errorEvent.addEventListener((err) => {
          (this._events.tileerror || []).forEach((fn) => {
            try { fn({ error: err }); } catch (_) {}
          });
        });
      } catch (_) {}

      const layer = map._v.imageryLayers.addImageryProvider(provider);
      layer.alpha = (typeof this._opts.opacity === 'number') ? this._opts.opacity : 1.0;
      try {
        layer.splitDirection = map._splitDirection ?? SplitDir.NONE;
      } catch (_) {}

      this._imageryLayer = layer;
      map._layers.add(this);
      this._added = true;
      map._v.scene.requestRender();
      return this;
    }

    setOpacity(opacity) {
      if (this._imageryLayer) this._imageryLayer.alpha = clamp(opacity, 0, 1);
      return this;
    }
  }

  class CesiumBaiduTileLayer {
    constructor(type = 'vec', options = {}) {
      this.__type = 'imagery';
      this._baiduType = type;
      this._opts = options || {};
      this._imageryLayer = null;
      this._baseLayer = null;
      this._provider = null;
      this._added = false;
      this._events = { tileerror: [] };
    }

    on(evt, fn) {
      if (!evt || typeof fn !== 'function') return this;
      const k = String(evt).toLowerCase();
      if (!this._events[k]) this._events[k] = [];
      this._events[k].push(fn);
      return this;
    }

    addTo(map) {
      if (this._added) return this;

      const isSat = (this._baiduType === 'sat' || this._baiduType === 'img');

      // 1. Add global base provider underneath Baidu to guarantee complete global coverage at all zoom levels
      const BaseProviderCls = window.AMapImageryProvider || (window.Cesium && window.Cesium.AMapImageryProvider);
      if (typeof BaseProviderCls === 'function') {
        try {
          const baseProvider = new BaseProviderCls({
            style: isSat ? 'img' : 'elec',
            crs: 'WGS84'
          });
          this._baseLayer = map._v.imageryLayers.addImageryProvider(baseProvider);
          if (this._baseLayer) {
            try {
              this._baseLayer.splitDirection = map._splitDirection ?? SplitDir.NONE;
            } catch (_) {}
          }
        } catch (e) {
          console.warn('[CesiumBaiduTileLayer] Base provider init fallback:', e);
        }
      }

      // 2. Add Baidu domestic imagery provider on top
      const ProviderCls = window.BaiduImageryProvider || (window.Cesium && window.Cesium.BaiduImageryProvider);

      let provider = null;
      if (typeof ProviderCls === 'function') {
        try {
          provider = new ProviderCls({
            style: isSat ? 'img' : 'vec',
            crs: 'WGS84'
          });
        } catch (e) {
          console.warn('[CesiumBaiduTileLayer] BaiduImageryProvider init failed:', e);
        }
      }

      if (!provider) {
        // High-reliability direct tile fallback
        const url = isSat
          ? 'http://shangetu{s}.map.bdimg.com/it/u=x={bx};y={by};z={z};v=009;type=sate&fm=46'
          : 'http://online{s}.map.bdimg.com/tile/?qt=tile&x={bx}&y={by}&z={z}&styles=sl&v=020';
        provider = new C.UrlTemplateImageryProvider({
          url: url,
          subdomains: ['0', '1', '2', '3'],
          customTags: {
            bx: (p, x, y, level) => x - Math.pow(2, level - 1),
            by: (p, x, y, level) => Math.pow(2, level - 1) - 1 - y
          },
          credit: this._opts.attribution || '© 百度地图 (Baidu Map)',
          maximumLevel: this._opts.maxZoom ?? 18,
          tileWidth: 256,
          tileHeight: 256
        });
      }

      this._provider = provider;
      const layer = map._v.imageryLayers.addImageryProvider(provider);
      layer.alpha = (typeof this._opts.opacity === 'number') ? this._opts.opacity : 1.0;
      try {
        layer.splitDirection = map._splitDirection ?? SplitDir.NONE;
      } catch (_) {}

      this._imageryLayer = layer;
      map._layers.add(this);
      this._added = true;
      map._v.scene.requestRender();
      return this;
    }

    setOpacity(opacity) {
      if (this._imageryLayer) this._imageryLayer.alpha = clamp(opacity, 0, 1);
      if (this._baseLayer) this._baseLayer.alpha = clamp(opacity, 0, 1);
      return this;
    }
  }

  class CesiumWMSLayer extends CesiumTileLayer {
    constructor(baseUrl, params = {}) {
      super(baseUrl, params);
      this._params = params || {};
    }

    addTo(map) {
      if (this._added) return this;
      const p = this._params || {};

      // Determine CRS/tiling scheme. NASA GIBS publishes both EPSG:3857 and EPSG:4326 endpoints.
      // Cesium's WMS provider needs a matching tiling scheme to request correct BBOX values.
      const is4326 = String(p.crs || p.CRS || p.srs || p.SRS || '').includes('4326')
        || String(this._url).includes('epsg4326');
      const tilingScheme = is4326 ? new C.GeographicTilingScheme() : new C.WebMercatorTilingScheme();
      const crsParam = is4326 ? 'EPSG:4326' : 'EPSG:3857';

      const provider = new C.WebMapServiceImageryProvider({
        url: this._url,
        layers: p.layers || p.LAYERS || '',
        tilingScheme,
        parameters: {
          service: 'WMS',
          version: p.version || p.VERSION || '1.3.0',
          request: 'GetMap',
          styles: p.styles || p.STYLES || '',
          format: p.format || p.FORMAT || 'image/png',
          transparent: (p.transparent ?? p.TRANSPARENT ?? true) ? true : false,
          time: p.time || p.TIME,
          // WMS 1.3 uses `CRS`, older servers use `SRS`. Setting both improves compatibility.
          crs: p.crs || p.CRS || crsParam,
          srs: p.srs || p.SRS || crsParam
        }
      });
      this._provider = provider;

      // Forward Cesium provider errors to Leaflet-like `tileerror` listeners
      try {
        provider.errorEvent.addEventListener((err) => {
          (this._events.tileerror || []).forEach((fn) => {
            try { fn({ error: err }); } catch (_) {}
          });
        });
      } catch (_) {}
      const layer = map._v.imageryLayers.addImageryProvider(provider);
      layer.alpha = (typeof p.opacity === 'number') ? p.opacity : 1.0;
      try {
        layer.splitDirection = map._splitDirection ?? SplitDir.NONE;
      } catch (_) {}

      this._imageryLayer = layer;
      map._layers.add(this);
      this._added = true;
      map._v.scene.requestRender();
      return this;
    }
  }

  class CesiumMarker {
    constructor(latlng, options = {}) {
      this.__type = 'entity';
      this._lat = latlng[0];
      this._lng = latlng[1];
      this._opts = options || {};
      this._entity = null;
      this._compatPopupHtml = null;
      this._added = false;
    }

    addTo(map) {
      if (this._added) return this;

      // Support both our lightweight icon objects and real Leaflet Icon instances
      // (which store data under `.options`).
      const icon = this._opts.icon || {};
      const iconUrl = icon.iconUrl || icon.options?.iconUrl || null;
      const iconSize = icon.iconSize || icon.options?.iconSize || null;
      const image = iconUrl || icon;

      const heightRef = C.HeightReference?.CLAMP_TO_GROUND;
      const e = map._v.entities.add({
        position: C.Cartesian3.fromDegrees(this._lng, this._lat),
        billboard: (typeof image === 'string' || image instanceof HTMLCanvasElement || image instanceof ImageBitmap) ? {
          image,
          width: (iconSize?.[0] || 28),
          height:(iconSize?.[1] || 28),
          // Put the icon *above* the surface so it doesn't clip into the globe.
          verticalOrigin: C.VerticalOrigin.BOTTOM,
          heightReference: heightRef,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        } : undefined,
        point: (!image || typeof image === 'object') ? {
          pixelSize: 10,
          color: C.Color.fromCssColorString('#60a5fa'),
          outlineColor: C.Color.WHITE,
          outlineWidth: 2,
          heightReference: heightRef,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        } : undefined
      });

      e._compatPopupHtml = this._compatPopupHtml;
      this._entity = e;
      map._layers.add(this);
      this._added = true;
      map._v.scene.requestRender();
      return this;
    }

    setLatLng(latlng) {
      this._lat = latlng[0];
      this._lng = latlng[1];
      if (this._entity) this._entity.position = C.Cartesian3.fromDegrees(this._lng, this._lat);
      return this;
    }

    getLatLng() {
      return { lat: this._lat, lng: this._lng };
    }

    bindPopup(html) {
      this._compatPopupHtml = html;
      if (this._entity) this._entity._compatPopupHtml = html;
      return this;
    }
  }

  // Heat layer: points -> colored discs
  class CesiumHeatLayer {
    constructor(points = [], opts = {}) {
      this.__type = 'datasource';
      this._opts = opts || {};
      this._dataSource = new C.CustomDataSource('heat');
      this._points = points;
      this._added = false;
      this._cache = new Map(); // bucket -> canvas
      this._splitDirection = SplitDir.NONE;
    }

    _colorRamp(t) {
      // simple blue->cyan->green->yellow->red
      const c = C.Color;
      const stops = [
        { t: 0.0, c: c.fromCssColorString('#2563eb') },
        { t: 0.25, c: c.fromCssColorString('#06b6d4') },
        { t: 0.5, c: c.fromCssColorString('#22c55e') },
        { t: 0.75, c: c.fromCssColorString('#f59e0b') },
        { t: 1.0, c: c.fromCssColorString('#ef4444') }
      ];
      t = clamp(t, 0, 1);
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (t >= a.t && t <= b.t) {
          const u = (t - a.t) / (b.t - a.t);
          return c.lerp(a.c, b.c, u, new c());
        }
      }
      return stops[stops.length - 1].c;
    }

    _discCanvas(bucket) {
      if (this._cache.has(bucket)) return this._cache.get(bucket);
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const t = bucket / 10;
      const col = this._colorRamp(t);
      const rgba = `rgba(${Math.round(col.red*255)},${Math.round(col.green*255)},${Math.round(col.blue*255)},`;
      const grd = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      grd.addColorStop(0, rgba + '0.70)');
      grd.addColorStop(0.5, rgba + '0.35)');
      grd.addColorStop(1, rgba + '0.00)');
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,size,size);
      this._cache.set(bucket, canvas);
      return canvas;
    }

    setLatLngs(points) {
      this._points = points || [];
      this._render();
      return this;
    }

    _render() {
      this._dataSource.entities.removeAll();
      const pts = this._points || [];
      // normalize values 0..1 if present
      let vals = pts.map(p => (p[2] ?? 1)).filter(v => typeof v === 'number' && isFinite(v));
      const min = vals.length ? Math.min(...vals) : 0;
      const max = vals.length ? Math.max(...vals) : 1;
      const denom = (max - min) || 1;

      for (const p of pts) {
        const lat = p[0], lng = p[1];
        const val = (p[2] ?? 1);
        const t = clamp((val - min) / denom, 0, 1);
        const bucket = Math.round(t * 10);
        const img = this._discCanvas(bucket);

        this._dataSource.entities.add({
          position: C.Cartesian3.fromDegrees(lng, lat),
          billboard: {
            image: img,
            width: 56,
            height: 56,
            verticalOrigin: C.VerticalOrigin.CENTER,
            splitDirection: this._splitDirection
          }
        });
      }
    }

    addTo(map) {
      if (this._added) return this;
      try { this._splitDirection = map._splitDirection ?? SplitDir.NONE; } catch (_) {}
      this._render();
      map._v.dataSources.add(this._dataSource);
      map._layers.add(this);
      this._added = true;
      map._v.scene.requestRender();
      return this;
    }
  }

  class CesiumMarkerClusterGroup {
    constructor(opts = {}) {
      this.__type = 'datasource';
      this._dataSource = new C.CustomDataSource('cluster');
      this._added = false;
      this._opts = opts || {};
      this._dataSource.clustering.enabled = true;
      this._dataSource.clustering.pixelRange = 45;
      this._dataSource.clustering.minimumClusterSize = 3;

      // Style clusters
      this._dataSource.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
        cluster.label.show = true;
        cluster.label.text = String(clusteredEntities.length);
        cluster.label.scale = 0.6;
        cluster.label.fillColor = C.Color.WHITE;
        cluster.billboard.show = true;
        cluster.billboard.image = this._clusterCanvas();
        cluster.billboard.verticalOrigin = C.VerticalOrigin.CENTER;
      });

      this._clusterCanvasCache = null;
    }

    _clusterCanvas() {
      if (this._clusterCanvasCache) return this._clusterCanvasCache;
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2-2, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(17,24,39,0.75)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      this._clusterCanvasCache = canvas;
      return canvas;
    }

    addTo(map) {
      if (this._added) return this;
      map._v.dataSources.add(this._dataSource);
      map._layers.add(this);
      this._added = true;
      map._v.scene.requestRender();
      return this;
    }

    addLayer(marker) {
      // marker may be a CesiumMarker (not added) or a plain object with lat/lng
      const lat = marker._lat ?? marker.lat ?? marker[0];
      const lng = marker._lng ?? marker.lng ?? marker[1];
      const icon = marker._opts?.icon || marker.icon || {};
      const iconUrl = icon.iconUrl || icon.options?.iconUrl || null;
      const iconSize = icon.iconSize || icon.options?.iconSize || null;
      const image = iconUrl || icon;
      const popup = marker._compatPopupHtml || marker.popupHtml || null;

      const heightRef = C.HeightReference?.CLAMP_TO_GROUND;
      const okImage = (typeof image === 'string' || image instanceof HTMLCanvasElement || image instanceof ImageBitmap);
      const e = this._dataSource.entities.add({
        position: C.Cartesian3.fromDegrees(lng, lat),
        billboard: okImage ? {
          image,
          width: (iconSize?.[0] || 28),
          height:(iconSize?.[1] || 28),
          verticalOrigin: C.VerticalOrigin.BOTTOM,
          heightReference: heightRef,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        } : {
          image: this._clusterCanvas(),
          width: 28,
          height: 28,
          verticalOrigin: C.VerticalOrigin.BOTTOM,
          heightReference: heightRef,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      e._compatPopupHtml = popup;
      return this;
    }

    clearLayers() {
      this._dataSource.entities.removeAll();
    }
  }

  // Expose a minimal Leaflet-like API
  function map(containerId, options) { return new CesiumMap(containerId, options); }

  function tileLayer(url, options) { return new CesiumTileLayer(url, options); }
  tileLayer.wms = function (baseUrl, params) { return new CesiumWMSLayer(baseUrl, params); };

  function marker(latlng, options) { return new CesiumMarker(latlng, options); }
  function heatLayer(points, options) { return new CesiumHeatLayer(points, options); }
  function markerClusterGroup(options) { return new CesiumMarkerClusterGroup(options); }
  function baiduTileLayer(type, options) { return new CesiumBaiduTileLayer(type, options); }
  function icon(opts) { return opts || {}; }

  window.L = { map, tileLayer, baiduTileLayer, marker, heatLayer, markerClusterGroup, icon, coordTransform: CoordTransform };
})();
