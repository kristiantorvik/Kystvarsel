/**
 * Builds a self-contained HTML page that renders a Leaflet map with
 * Kartverket WMTS tiles (Sjøkart + Topo). Used inside a WebView.
 *
 * Two modes:
 *   - 'pick'  — user taps to drop a single draggable pin; coords are posted
 *               back to RN via window.ReactNativeWebView.postMessage.
 *   - 'spots' — renders a circle marker per saved spot, colour-coded by
 *               status (plain / alert / matching). Tapping a marker posts a
 *               { type: 'spotTap', spotId } message back to RN.
 *
 * The data is injected into a <script type="application/json"> block so it's
 * never parsed as JS — `<` chars in spot names are escaped to < so
 * a `</script>` in user-supplied data can't break out.
 */

export type LeafletLayer = 'sjokart' | 'topo';
export type SpotStatus = 'plain' | 'alert' | 'matching';

export interface SpotMarkerData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: SpotStatus;
}

interface BaseOptions {
  defaultLayer?: LeafletLayer;
  initialLat?: number;
  initialLon?: number;
  initialZoom?: number;
}

export interface PickOptions extends BaseOptions {
  mode: 'pick';
  /** Initial pin position, e.g. when editing an existing spot. */
  picked?: { lat: number; lon: number };
}

export interface SpotsOptions extends BaseOptions {
  mode: 'spots';
  spots: SpotMarkerData[];
  legendLabels: { matching: string; alert: string; plain: string };
}

export type LeafletOptions = PickOptions | SpotsOptions;

export function buildLeafletHtml(opts: LeafletOptions): string {
  const initJson = JSON.stringify(opts).replace(/</g, '\\u003c');
  const legendHtml =
    opts.mode === 'spots' ? buildLegend(opts.legendLabels) : '';
  return TEMPLATE
    .replace('__INIT_DATA__', initJson)
    .replace('__LEGEND__', legendHtml);
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
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
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
</style>
</head>
<body>
<div id="map"></div>
<div class="layer-toggle">
  <button data-layer="sjokart">Sjøkart</button>
  <button data-layer="topo">Topo</button>
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

  var ATTR = '© <a href="https://www.kartverket.no/" target="_blank">Kartverket</a>';
  var layers = {
    sjokart: L.tileLayer(
      'https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/default/webmercator/{z}/{y}/{x}.png',
      { attribution: ATTR, maxZoom: 18 }
    ),
    topo: L.tileLayer(
      'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
      { attribution: ATTR, maxZoom: 18 }
    )
  };
  var current = null;
  function setLayer(name) {
    var next = layers[name] || layers.sjokart;
    if (next === current) return;
    if (current) map.removeLayer(current);
    next.addTo(map);
    current = next;
    var btns = document.querySelectorAll('.layer-toggle button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.layer === name);
    }
  }
  var btns = document.querySelectorAll('.layer-toggle button');
  for (var i = 0; i < btns.length; i++) {
    (function(b) {
      b.addEventListener('click', function() { setLayer(b.dataset.layer); });
    })(btns[i]);
  }
  setLayer(INIT.defaultLayer || 'sjokart');

  if (INIT.mode === 'pick') {
    var marker = null;
    function placeMarker(lat, lon) {
      if (marker) {
        marker.setLatLng([lat, lon]);
      } else {
        marker = L.marker([lat, lon], { draggable: true }).addTo(map);
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
      for (var i = 0; i < spotMarkers.length; i++) {
        map.removeLayer(spotMarkers[i]);
      }
      spotMarkers = [];
      (list || []).forEach(addSpot);
    }
    window.updateSpots = function(list) { renderSpots(list); };
    renderSpots(INIT.spots || []);
  }
})();
</script>
</body>
</html>`;
