import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets.generated';

/**
 * Builds a self-contained HTML page that renders a Leaflet map with
 * Kartverket WMTS tiles (Sjøkart + Topo) plus optional Esri aerial.
 *
 * Three modes:
 *   - 'pick'  — single draggable pin; coords posted back to RN.
 *   - 'spots' — saved spots as colour-coded circle markers.
 *   - 'paint' — edit one painted layer; tool toggle (navigate/paint/erase),
 *               touch-driven splat painting, batched commit on touchend.
 *
 * In all three modes, a list of read-only painted layers can be passed in
 * (`layers`) and they render under the spot markers / pick pin.
 *
 * Data is injected into a <script type="application/json"> block so it's
 * never parsed as JS; `<` is escaped to `<` so a `</script>` inside
 * user-supplied strings can't break out.
 */

export type LeafletLayer = 'sjokart' | 'topo' | 'gratone' | 'flyfoto';
export type SpotStatus = 'plain' | 'alert' | 'matching';

export interface SpotMarkerData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: SpotStatus;
}

/** Splat as understood by the WebView for rendering. */
export interface PaintSplatData {
  lat: number;
  lon: number;
  radiusM: number;
}

/** A painted layer rendered by the WebView. RN computes the hex from colorId. */
export interface PaintLayerData {
  id: string;
  colorHex: string;
  /** Layer-level alpha. 0..1; default 0.4 if omitted. */
  opacity?: number;
  visible: boolean;
  splats: PaintSplatData[];
}

export type PaintTool = 'navigate' | 'paint' | 'erase';

interface BaseOptions {
  defaultLayer?: LeafletLayer;
  initialLat?: number;
  initialLon?: number;
  initialZoom?: number;
  /** Read-only painted layers shown beneath the rest of the UI. */
  layers?: PaintLayerData[];
  /**
   * Show a stationary crosshair at the centre of the map. User setting,
   * applies to every map view. Toggled in place at runtime via
   * `window.setCrosshair(boolean)` so a setting change doesn't require
   * a WebView remount (preserving pan/zoom state).
   */
  showCrosshair?: boolean;
}

export interface PickOptions extends BaseOptions {
  mode: 'pick';
  picked?: { lat: number; lon: number };
}

export interface SpotsOptions extends BaseOptions {
  mode: 'spots';
  spots: SpotMarkerData[];
  legendLabels: { matching: string; alert: string; plain: string };
}

export interface PaintOptions extends BaseOptions {
  mode: 'paint';
  /** All visible layers, including the one being edited. */
  layers: PaintLayerData[];
  /** ID of the layer the user is editing. Always rendered, even if hidden. */
  editingLayerId: string;
  /** Active tool. Default 'navigate' to avoid accidental paint on entry. */
  tool: PaintTool;
  /** Brush size in CSS pixels — 15% of min(screen w, h). */
  brushScreenPx: number;
}

export type LeafletOptions = PickOptions | SpotsOptions | PaintOptions;

export function buildLeafletHtml(opts: LeafletOptions): string {
  const initJson = JSON.stringify(opts).replace(/</g, '\\u003c');
  const legendHtml =
    opts.mode === 'spots' ? buildLegend(opts.legendLabels) : '';
  // Leaflet's CSS/JS are inlined from the generated assets module rather
  // than fetched from a CDN — keeps the WebView self-contained, removes
  // a runtime dependency on unpkg.com, and ensures the map works offline.
  //
  // Function replacers (vs raw strings) avoid JavaScript's `$&` / `$1`
  // backreference interpretation in `String.replace`'s second argument,
  // which would otherwise mangle Leaflet's regex literals.
  return TEMPLATE
    .replace('__LEAFLET_CSS__', () => LEAFLET_CSS)
    .replace('__LEAFLET_JS__', () => LEAFLET_JS)
    .replace('__INIT_DATA__', () => initJson)
    .replace('__LEGEND__', () => legendHtml);
}

function buildLegend(labels: { matching: string; alert: string; plain: string }): string {
  return `
<div class="legend">
  <div><span class="dot" style="background:#2E7D32"></span>${escapeHtml(labels.matching)}</div>
  <div><span class="dot" style="background:#3070C0"></span>${escapeHtml(labels.alert)}</div>
  <div><span class="dot" style="background:#888888"></span>${escapeHtml(labels.plain)}</div>
</div>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style id="leaflet-css">__LEAFLET_CSS__</style>
<script>__LEAFLET_JS__</script>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #E8ECF0; }
  .layer-toggle {
    position: absolute; top: 10px; right: 10px; z-index: 1000;
    background: rgba(255,255,255,0.95); border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    display: flex; flex-direction: column; padding: 2px;
  }
  .layer-toggle button {
    border: none; background: none; padding: 6px 12px; font-size: 12px;
    color: #0E3A5F; font-weight: 500; text-align: left; cursor: pointer;
    border-radius: 4px;
  }
  .layer-toggle button.active { background: #0E3A5F; color: #fff; }
  .legend {
    position: absolute; bottom: 10px; left: 10px; z-index: 1000;
    background: rgba(255,255,255,0.95); border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    padding: 6px 10px; font-size: 11px; line-height: 1.7;
  }
  .legend .dot {
    display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    margin-right: 6px; vertical-align: middle; border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.15);
  }
  .leaflet-control-attribution { font-size: 9px; }
  /* Layer canvases never capture pointer events — touches go to the map. */
  .paint-layer-canvas { pointer-events: none; }
  /* In paint mode, lift the bottom-right zoom control above the RN-side
     edit toolbar so they don't overlap. The toolbar lives at bottom: 16
     plus its own height (~50px); 90px clears it on every screen size. */
  body.paint-mode .leaflet-bottom.leaflet-right { bottom: 90px; }

  /* Flyfoto explainer popup. Shown when the user taps the "Flyfoto"
     button — aerial imagery is not bundled in v1 (waiting on Kartverket's
     Norge i bilder access). The popup is a polite "coming soon" rather
     than silently disabling the button so users know it's planned. */
  .flyfoto-info {
    position: absolute; left: 12px; right: 12px; top: 60px; z-index: 1100;
    background: #fff; border-radius: 8px; padding: 14px 16px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
    font-size: 13px; line-height: 1.4; color: #333;
    display: none;
  }
  .flyfoto-info.show { display: block; }
  .flyfoto-info h4 { margin: 0 0 6px 0; font-size: 14px; color: #0E3A5F; }
  .flyfoto-info button {
    margin-top: 10px; border: none; background: #0E3A5F; color: #fff;
    padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer;
  }

  /* Stationary crosshair at the centre of the map. Controlled by a user
     setting; toggled in place via window.setCrosshair(). pointer-events
     stays 'none' so the SVG doesn't intercept taps meant for the map. */
  .map-crosshair {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 32px; height: 32px;
    z-index: 1100;
    pointer-events: none;
    display: none;
  }
  .map-crosshair.show { display: block; }
</style>
</head>
<body>
<div id="map"></div>
<div class="layer-toggle">
  <button data-layer="topo">Topo</button>
  <button data-layer="sjokart">Sjøkart</button>
  <button data-layer="gratone">Gråtone</button>
  <button data-layer="flyfoto">Flyfoto</button>
</div>
<div class="flyfoto-info" id="flyfoto-info">
  <h4>Flyfoto kommer snart</h4>
  <p style="margin:0;">Vi jobber med å gjøre Kartverkets «Norge i bilder» tilgjengelig direkte i appen. Det er ikke klart i denne versjonen, men kommer i en oppdatering.</p>
  <button id="flyfoto-info-close">OK</button>
</div>
<!-- Stationary crosshair (hidden by default; .show toggles visibility via JS). -->
<div class="map-crosshair" id="map-crosshair" aria-hidden="true">
  <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <g stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.95">
      <line x1="16" y1="2" x2="16" y2="11"/>
      <line x1="16" y1="21" x2="16" y2="30"/>
      <line x1="2" y1="16" x2="11" y2="16"/>
      <line x1="21" y1="16" x2="30" y2="16"/>
    </g>
    <g stroke="#0E3A5F" stroke-width="1.5" stroke-linecap="round">
      <line x1="16" y1="2" x2="16" y2="11"/>
      <line x1="16" y1="21" x2="16" y2="30"/>
      <line x1="2" y1="16" x2="11" y2="16"/>
      <line x1="21" y1="16" x2="30" y2="16"/>
    </g>
    <circle cx="16" cy="16" r="1.5" fill="#0E3A5F"/>
  </svg>
</div>
__LEGEND__
<script type="application/json" id="init-data">__INIT_DATA__</script>
<script>
(function() {
  var INIT;
  try {
    INIT = JSON.parse(document.getElementById('init-data').textContent);
  } catch (e) {
    INIT = {};
  }
  function post(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }

  var fallbackCenter = [64.5, 11.0];
  var center = (INIT.initialLat != null && INIT.initialLon != null)
    ? [INIT.initialLat, INIT.initialLon]
    : fallbackCenter;
  var zoom = INIT.initialZoom != null
    ? INIT.initialZoom
    : (INIT.initialLat != null ? 12 : 5);

  var map = L.map('map', { zoomControl: false }).setView(center, zoom);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  if (INIT.mode === 'paint') {
    document.body.classList.add('paint-mode');
  }

  var ATTR = '© <a href="https://www.kartverket.no/" target="_blank">Kartverket</a>';
  // Aerial photo intentionally not wired up in v1. Esri World Imagery is
  // not licensed for commercial use without a paid plan; Kartverket's
  // Norge i bilder requires a paid agreement (in progress). Tapping the
  // Flyfoto button surfaces an explainer modal instead of switching layers.
  //
  // Note on a previously-attempted "Nautisk bakgrunnskart" combo: the
  // visually-rich nautical layer on Norgeskart.no is served by Electronic
  // Chart Centre AS (tile.ecc.no / pmtiles.ecc.no), a commercial vendor
  // Kartverket has a paid agreement with — same parent organization that
  // distributes ENC charts via PRIMAR. Reproducing that look from
  // Kartverket's free dybdedata2 WMS doesn't match visually, and using
  // Norgeskart's API key would be unauthorized use of ECC's service.
  // Skipping until a Kartverket/ECC license is in place.
  var layers = {
    sjokart: L.tileLayer(
      'https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png',
      { attribution: ATTR, maxZoom: 18 }
    ),
    topo: L.tileLayer(
      'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
      { attribution: ATTR, maxZoom: 18 }
    ),
    gratone: L.tileLayer(
      'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png',
      { attribution: ATTR, maxZoom: 18 }
    ),
  };
  var current = null;
  var currentLayerName = null;
  function setLayer(name) {
    var next = layers[name] || layers.topo;
    if (next === current) return;
    if (current) map.removeLayer(current);
    next.addTo(map);
    current = next;
    currentLayerName = name;
    var btns = document.querySelectorAll('.layer-toggle button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.layer === name);
    }
    postMapState();
  }

  // Push the user's view back to RN so the next screen that mounts a fresh
  // WebView can open at the same place. RN keeps a module-level cache.
  function postMapState() {
    var c = map.getCenter();
    post({
      type: 'mapState',
      lat: c.lat,
      lon: c.lng,
      zoom: map.getZoom(),
      layer: currentLayerName,
    });
  }
  map.on('moveend zoomend', postMapState);
  // Flyfoto button intercepts to show the "coming soon" explainer instead
  // of switching layers. All other buttons fall through to setLayer.
  var infoEl = document.getElementById('flyfoto-info');
  var infoCloseEl = document.getElementById('flyfoto-info-close');
  if (infoCloseEl) {
    infoCloseEl.addEventListener('click', function() {
      if (infoEl) infoEl.classList.remove('show');
    });
  }
  var btns = document.querySelectorAll('.layer-toggle button');
  for (var i = 0; i < btns.length; i++) {
    (function(b) {
      b.addEventListener('click', function() {
        if (b.dataset.layer === 'flyfoto') {
          if (infoEl) infoEl.classList.add('show');
          return;
        }
        setLayer(b.dataset.layer);
      });
    })(btns[i]);
  }
  // Coerce any saved unsupported default to topo so users land on a
  // working layer instead of nothing. Includes 'flyfoto' (deferred until
  // a paid aerial license lands) and 'nautisk' (briefly added then
  // removed when we discovered it required ECC licensing).
  var initialLayer = (INIT.defaultLayer === 'flyfoto' || INIT.defaultLayer === 'nautisk')
    ? 'topo'
    : (INIT.defaultLayer || 'topo');
  setLayer(initialLayer);

  // ============================================================
  //  Painted-layer rendering (used by all three modes)
  // ============================================================
  // Each layer owns its own absolute-positioned <canvas>. Splats are drawn
  // at full alpha into the canvas; the canvas itself is rendered at a
  // single layer-level alpha so overlapping splats merge into one uniform
  // colour ("paint twice doesn't darken" once committed).

  // Render canvas extends beyond the viewport by this fraction in each
  // direction. Pans within that budget show pre-rendered content (no blank
  // reveal); we don't redraw mid-pan (that's Leaflet's vector renderer
  // approach too — the overlayPane transform during a pan moves the canvas
  // for free). Larger padding = more pan-budget but more canvas memory:
  // total canvas pixels = (1 + 2p)^2 × viewport pixels. 0.4 = ~3.2× pixels.
  var PAINT_LAYER_PADDING = 0.4;

  function PaintLayer(data, isEditing) {
    this._data = data;
    this._editing = !!isEditing;
    this._liveSplats = []; // in-progress drag, drawn but not yet committed
    this._liveMode = 'paint'; // 'paint' or 'erase' — affects compositing
    this._canvas = null;
    // Geographic anchor + zoom captured at last full render. Used by
    // _animateZoom to keep the canvas registered with tiles during pinch.
    this._center = null;
    this._zoom = null;
    // L.Bounds (in layer coords) of the canvas's render area. Larger than
    // the viewport thanks to padding.
    this._bounds = null;
  }
  PaintLayer.prototype.onAdd = function(m) {
    // Defensive: drop a stale canvas if onAdd is called twice without a
    // matching onRemove (shouldn't happen in normal flow, but cheap to guard).
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
      this._canvas = null;
    }
    this._map = m;
    var c = document.createElement('canvas');
    c.className = 'paint-layer-canvas';
    c.style.position = 'absolute';
    c.style.left = '0';
    c.style.top = '0';
    c.style.transformOrigin = '0 0'; // matches L.DomUtil.setTransform
    m.getPanes().overlayPane.appendChild(c);
    this._canvas = c;
    // moveend (not move) — Leaflet transforms the overlayPane during a pan
    // so the canvas already follows the map; we only need to repaint after
    // the pan settles. For zoom we bind BOTH events because they cover
    // different gestures:
    //   - zoomanim → wheel/keyboard zoom (an animated transition)
    //   - zoom    → pinch zoom (fires every frame during the pinch; the
    //               map's _move(...,{pinch:true}) call emits 'zoom' but
    //               not 'zoomanim'). Without this, pinch zoom leaves the
    //               canvas frozen at the pre-pinch scale.
    // L.GridLayer and L.Renderer both bind both for the same reason.
    m.on('moveend zoomend resize', this._reset, this);
    m.on('zoomanim', this._onAnimZoom, this);
    m.on('zoom', this._onZoom, this);
    this._reset();
  };
  PaintLayer.prototype.onRemove = function() {
    if (this._map) {
      this._map.off('moveend zoomend resize', this._reset, this);
      this._map.off('zoomanim', this._onAnimZoom, this);
      this._map.off('zoom', this._onZoom, this);
    }
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
  };
  /**
   * Transform the canvas to keep its content registered with the tiles
   * during a zoom in progress. Two entry points:
   *   - _onAnimZoom: called by 'zoomanim' (wheel/keyboard); event payload
   *     carries the *target* center + zoom mid-animation.
   *   - _onZoom: called by 'zoom' (pinch); the map's current center + zoom
   *     are already at the in-flight pinch state.
   *
   * Math copied from L.Renderer._updateTransform (the base for L.Canvas /
   * L.SVG): uses _center + _zoom snapshotted at the last full render to
   * compute where the canvas's already-drawn pixels need to land at the
   * new zoom.
   *
   * Without this, the painted region appears frozen during pinch-zoom
   * because the canvas's pixel content is calibrated to the old zoom.
   */
  PaintLayer.prototype._onAnimZoom = function(e) {
    this._updateTransform(e.center, e.zoom);
  };
  PaintLayer.prototype._onZoom = function() {
    if (!this._map) return;
    this._updateTransform(this._map.getCenter(), this._map.getZoom());
  };
  PaintLayer.prototype._updateTransform = function(center, zoom) {
    if (!this._map || !this._canvas || this._center == null || this._zoom == null) return;
    var scale = this._map.getZoomScale(zoom, this._zoom);
    // viewHalf must include the same padding the canvas was rendered with —
    // it positions the canvas's TOP-LEFT, not the viewport's top-left.
    var viewHalf = this._map.getSize().multiplyBy(0.5 + PAINT_LAYER_PADDING);
    var currentCenterPoint = this._map.project(this._center, zoom);
    var topLeftOffset = viewHalf
      .multiplyBy(-scale)
      .add(currentCenterPoint)
      .subtract(this._map._getNewPixelOrigin(center, zoom));
    L.DomUtil.setTransform(this._canvas, topLeftOffset, scale);
  };
  PaintLayer.prototype.setData = function(data) {
    this._data = data;
    // Drop any in-progress preview when canonical data updates. After undo
    // (or any external state change) the preview must not linger — paint
    // mode's destination-out preview would otherwise keep cutting holes
    // out of just-restored splats.
    this._liveSplats = [];
    this._reset();
  };
  PaintLayer.prototype.setLive = function(liveSplats, mode) {
    this._liveSplats = liveSplats || [];
    if (mode === 'erase' || mode === 'paint') this._liveMode = mode;
    this._reset();
  };
  PaintLayer.prototype._reset = function() {
    if (!this._map || !this._canvas) return;
    // Anchor for subsequent zoom animations — the next _animateZoom will
    // compute its transform relative to this center + zoom.
    this._center = this._map.getCenter();
    this._zoom = this._map.getZoom();

    // Padded bounds: the canvas covers viewport ± padding on each side.
    var size = this._map.getSize();
    var p = PAINT_LAYER_PADDING;
    var min = this._map.containerPointToLayerPoint(size.multiplyBy(-p)).round();
    var max = this._map.containerPointToLayerPoint(size.multiplyBy(1 + p)).round();
    this._bounds = L.bounds(min, max);
    var bSize = this._bounds.getSize();

    // setPosition (modern Leaflet uses setTransform internally with no scale
    // arg) clears any zoom-anim scale from the previous frame.
    L.DomUtil.setPosition(this._canvas, this._bounds.min);
    if (this._canvas.width !== bSize.x) this._canvas.width = bSize.x;
    if (this._canvas.height !== bSize.y) this._canvas.height = bSize.y;
    this._render();
  };
  PaintLayer.prototype._render = function() {
    var ctx = this._canvas.getContext('2d');
    var w = this._canvas.width;
    var h = this._canvas.height;
    ctx.clearRect(0, 0, w, h);

    // The editing layer always renders, even if its visible flag is false —
    // the user needs to see what they're working on.
    if (!this._data.visible && !this._editing) {
      this._canvas.style.opacity = 0;
      return;
    }
    this._canvas.style.opacity = String(
      this._data.opacity != null ? this._data.opacity : 0.4
    );
    ctx.fillStyle = this._data.colorHex;
    ctx.globalCompositeOperation = 'source-over';

    // Viewport culling: skip splats whose disc doesn't touch the canvas at
    // all. Painting tools never redraw what isn't visible — same trick.
    // Now uses LAYER POINTS (subtracting bounds.min) instead of container
    // points, because the canvas is bigger than the viewport — padding
    // means container (0,0) lives at canvas (padding × size, padding × size)
    // rather than (0, 0).
    var zoom = this._map.getZoom();
    var cullPad = 32;
    var boundsMin = this._bounds.min;

    var self = this;
    function draw(s) {
      var lp = self._map.latLngToLayerPoint([s.lat, s.lon]);
      var x = lp.x - boundsMin.x;
      var y = lp.y - boundsMin.y;
      var r = s.radiusM / metersPerPxAt(s.lat, zoom);
      if (r < 0.5) return;
      // Cheap AABB test against the canvas extent.
      if (x + r < -cullPad || x - r > w + cullPad) return;
      if (y + r < -cullPad || y - r > h + cullPad) return;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Committed splats are always additive — fill the canvas mask normally.
    var splats = this._data.splats || [];
    for (var i = 0; i < splats.length; i++) draw(splats[i]);

    // Live (mid-stroke) splats: paint adds, erase subtracts. Using
    // destination-out for erase makes the preview visually accurate — the
    // user sees the canvas being cleared as they drag, instead of a
    // confusing same-colour trail.
    if (this._liveSplats.length > 0) {
      if (this._liveMode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
      }
      for (var j = 0; j < this._liveSplats.length; j++) draw(this._liveSplats[j]);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  function metersPerPxAt(lat, z) {
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
  }

  // Active painted-layer instances, keyed by layer id.
  var paintLayers = {};
  function syncPaintLayers(layerList, editingId) {
    var seen = {};
    (layerList || []).forEach(function(data) {
      seen[data.id] = true;
      if (paintLayers[data.id]) {
        paintLayers[data.id].setData(data);
      } else {
        var pl = new PaintLayer(data, data.id === editingId);
        pl.onAdd(map);
        paintLayers[data.id] = pl;
      }
    });
    Object.keys(paintLayers).forEach(function(id) {
      if (!seen[id]) {
        paintLayers[id].onRemove();
        delete paintLayers[id];
      }
    });
  }

  // ============================================================
  //  Mode wiring
  // ============================================================

  if (INIT.layers && INIT.layers.length) {
    syncPaintLayers(INIT.layers, INIT.mode === 'paint' ? INIT.editingLayerId : null);
  }

  if (INIT.mode === 'pick') {
    // Custom pin icon. Leaflet's default L.marker() pulls marker-icon.png
    // and marker-shadow.png via relative URLs — since our WebView HTML
    // is injected as a string with no base URL, those resolve to nothing
    // and the user sees a generic broken-image glyph. Using an inline
    // SVG via L.divIcon sidesteps the asset problem entirely AND lets
    // us anchor the pin's tip exactly on the picked coordinate.
    var PICK_ICON_SVG =
      '<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="display:block;">' +
        '<path d="M15 1 C7.27 1 1 7.27 1 15 c0 11 14 26 14 26 s14-15 14-26 C29 7.27 22.73 1 15 1 z" ' +
          'fill="#D8281A" stroke="#fff" stroke-width="2"/>' +
        '<circle cx="15" cy="15" r="5" fill="#fff"/>' +
      '</svg>';
    var pickIcon = L.divIcon({
      className: 'pick-pin-icon',
      html: PICK_ICON_SVG,
      iconSize: [30, 42],
      // Anchor at the tip (bottom centre) so the pin "points at" the
      // lat/lon rather than centring on it.
      iconAnchor: [15, 41],
    });

    var marker = null;
    function placeMarker(lat, lon) {
      if (marker) {
        marker.setLatLng([lat, lon]);
      } else {
        marker = L.marker([lat, lon], { icon: pickIcon, draggable: true }).addTo(map);
        marker.on('dragend', function(e) {
          var p = e.target.getLatLng();
          post({ type: 'pick', lat: p.lat, lon: p.lng });
        });
      }
      post({ type: 'pick', lat: lat, lon: lon });
    }
    if (INIT.picked && INIT.picked.lat != null && INIT.picked.lon != null) {
      placeMarker(INIT.picked.lat, INIT.picked.lon);
    }
    map.on('click', function(e) { placeMarker(e.latlng.lat, e.latlng.lng); });
  } else if (INIT.mode === 'spots') {
    var COLOURS = { plain: '#888888', alert: '#3070C0', matching: '#2E7D32' };
    var spotMarkers = [];
    function addSpot(s) {
      var c = COLOURS[s.status] || COLOURS.plain;
      var m = L.circleMarker([s.lat, s.lon], {
        radius: 10, color: '#D8281A', weight: 3, fillColor: c, fillOpacity: 0.95
      });
      m.bindTooltip(s.name, { direction: 'top', offset: [0, -8] });
      m.on('click', function() { post({ type: 'spotTap', spotId: s.id }); });
      m.addTo(map);
      spotMarkers.push(m);
    }
    function renderSpots(list) {
      for (var i = 0; i < spotMarkers.length; i++) map.removeLayer(spotMarkers[i]);
      spotMarkers = [];
      (list || []).forEach(addSpot);
    }
    window.updateSpots = function(list) { renderSpots(list); };
    renderSpots(INIT.spots || []);
  } else if (INIT.mode === 'paint') {
    // ----- paint mode -----
    var editingId = INIT.editingLayerId;
    var brushScreenPx = INIT.brushScreenPx || 50;
    var tool = INIT.tool || 'navigate';
    var liveSplats = [];
    var inStroke = false;
    var lastSplat = null;
    var DEDUP_FRACTION = 0.3;

    function activeLayer() { return paintLayers[editingId]; }

    function applyTool(t) {
      tool = t;
      if (tool === 'navigate') {
        map.dragging.enable();
        if (map.tap) map.tap.enable();
      } else {
        // Disable 1-finger pan; pinch zoom (touchZoom) stays on so users
        // can still zoom during edits.
        map.dragging.disable();
        if (map.tap) map.tap.disable();
      }
    }
    applyTool(tool);

    function pointToLatLng(clientX, clientY) {
      var rect = map.getContainer().getBoundingClientRect();
      var x = clientX - rect.left;
      var y = clientY - rect.top;
      return map.containerPointToLatLng([x, y]);
    }

    function brushRadiusMAt(lat) {
      return brushScreenPx * metersPerPxAt(lat, map.getZoom());
    }

    /**
     * Add a touch sample to the in-progress stroke, interpolating between
     * this point and the previous one so spacing is uniform regardless of
     * finger speed. With dedup spacing at 30% of brush radius, a fast drag
     * that would have left visible gaps now gets filled in; a slow drag
     * still stays sparse because of the same threshold.
     */
    function addTouchSample(lat, lon) {
      if (!lastSplat) {
        liveSplats.push({ lat: lat, lon: lon, radiusM: brushRadiusMAt(lat) });
        lastSplat = { lat: lat, lon: lon };
        var pl0 = activeLayer();
        if (pl0) pl0.setLive(liveSplats, tool);
        return;
      }
      var pa = map.latLngToContainerPoint([lat, lon]);
      var pb = map.latLngToContainerPoint([lastSplat.lat, lastSplat.lon]);
      var dx = pa.x - pb.x, dy = pa.y - pb.y;
      var dPx = Math.sqrt(dx * dx + dy * dy);
      var stepPx = brushScreenPx * DEDUP_FRACTION;
      if (dPx < stepPx) return; // too close — dedup
      var steps = Math.max(1, Math.floor(dPx / stepPx));
      for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        var ix = pb.x + dx * t;
        var iy = pb.y + dy * t;
        var ll = map.containerPointToLatLng([ix, iy]);
        liveSplats.push({
          lat: ll.lat,
          lon: ll.lng,
          radiusM: brushRadiusMAt(ll.lat),
        });
      }
      lastSplat = { lat: lat, lon: lon };
      var pl = activeLayer();
      if (pl) pl.setLive(liveSplats, tool);
    }

    function commitStroke() {
      if (liveSplats.length === 0) return;
      if (tool === 'paint') {
        post({ type: 'paintBatch', layerId: editingId, splats: liveSplats });
        // For paint we leave the preview in place. RN's reconciliation
        // (persist + re-read + push back) takes a few ms; clearing here
        // would briefly remove what the user just painted. The next
        // touchstart resets liveSplats anyway.
      } else if (tool === 'erase') {
        post({ type: 'eraseBatch', layerId: editingId, erasers: liveSplats });
        // Erase preview uses destination-out, so it's already drawn as
        // "cut-outs". When RN sends fresh state without the erased splats,
        // the preview's destination-out targets pixels that are already
        // empty — no visible change. Leaving the preview is fine.
      }
      lastSplat = null;
    }

    function abortStroke() {
      liveSplats = [];
      lastSplat = null;
      var pl = activeLayer();
      if (pl) pl.setLive([], tool);
    }

    var container = map.getContainer();
    container.addEventListener('touchstart', function(e) {
      if (tool === 'navigate') return;
      if (e.touches.length !== 1) {
        if (inStroke) { inStroke = false; abortStroke(); }
        return;
      }
      e.preventDefault();
      // Fresh array per stroke so the previous stroke's preview gets dropped
      // (important especially for the eraser, where the trail would otherwise
      // linger until next pan/zoom).
      liveSplats = [];
      lastSplat = null;
      inStroke = true;
      var t = e.touches[0];
      var ll = pointToLatLng(t.clientX, t.clientY);
      addTouchSample(ll.lat, ll.lng);
    }, { passive: false });

    container.addEventListener('touchmove', function(e) {
      if (!inStroke) return;
      if (e.touches.length !== 1) {
        // 2nd finger landed mid-stroke — abandon, let leaflet zoom.
        inStroke = false;
        abortStroke();
        return;
      }
      e.preventDefault();
      var t = e.touches[0];
      var ll = pointToLatLng(t.clientX, t.clientY);
      addTouchSample(ll.lat, ll.lng);
    }, { passive: false });

    container.addEventListener('touchend', function() {
      if (!inStroke) return;
      inStroke = false;
      commitStroke();
    });

    container.addEventListener('touchcancel', function() {
      if (!inStroke) return;
      inStroke = false;
      abortStroke();
    });

    // RN imperative API for paint mode — called via injectJavaScript.
    window.setPaintTool = function(t) { applyTool(t); };
    window.setPaintLayers = function(list) {
      syncPaintLayers(list, editingId);
    };
  }

  // Universal hook for read-only updates of painted layers in any mode.
  window.updatePaintLayers = function(list) {
    syncPaintLayers(list, INIT.mode === 'paint' ? INIT.editingLayerId : null);
  };

  // Toggle the centre crosshair without rebuilding the WebView. Called
  // imperatively from RN via injectJavaScript whenever the underlying
  // setting changes, plus once at startup to honour the initial value.
  var crosshairEl = document.getElementById('map-crosshair');
  window.setCrosshair = function(on) {
    if (!crosshairEl) return;
    if (on) crosshairEl.classList.add('show');
    else crosshairEl.classList.remove('show');
  };
  // Apply the initial value from INIT (if RN pre-seeded it before the
  // first injectJavaScript call lands).
  if (INIT.showCrosshair) window.setCrosshair(true);
})();
</script>
</body>
</html>`;
