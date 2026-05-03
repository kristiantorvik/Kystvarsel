import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  buildLeafletHtml,
  type LeafletLayer,
  type LeafletOptions,
  type PaintLayerData,
  type PaintTool,
  type SpotMarkerData,
} from './leafletHtml';
import { rememberedMapState } from './mapState';

export interface PaintBatch {
  layerId: string;
  splats: Array<{ lat: number; lon: number; radiusM: number }>;
}
export interface EraseBatch {
  layerId: string;
  erasers: Array<{ lat: number; lon: number; radiusM: number }>;
}

interface PickProps extends Extract<LeafletOptions, { mode: 'pick' }> {
  onPick: (coord: { lat: number; lon: number }) => void;
  onSpotTap?: never;
  onPaintBatch?: never;
  onEraseBatch?: never;
}

interface SpotsProps extends Extract<LeafletOptions, { mode: 'spots' }> {
  onSpotTap: (spotId: string) => void;
  onPick?: never;
  onPaintBatch?: never;
  onEraseBatch?: never;
}

interface PaintProps extends Extract<LeafletOptions, { mode: 'paint' }> {
  onPaintBatch: (batch: PaintBatch) => void;
  onEraseBatch: (batch: EraseBatch) => void;
  onPick?: never;
  onSpotTap?: never;
}

type Props = PickProps | SpotsProps | PaintProps;

/**
 * Wraps a WebView containing a Leaflet map with Kartverket tiles.
 *
 * The HTML is built once on mount; subsequent prop changes are pushed in
 * place via injectJavaScript so the user's pan/zoom and paint state survive.
 *
 * Three modes:
 *  - 'pick'  — single draggable pin
 *  - 'spots' — saved-spot markers, tapping navigates
 *  - 'paint' — single layer being edited; touch handlers paint or erase
 */
export function MapWebView(props: Props) {
  const ref = useRef<WebView>(null);

  // Build initial HTML only once — pan/zoom state should survive prop updates.
  const initialHtml = useMemo(() => {
    const opts = stripCallbacks(props) as LeafletOptions;
    return buildLeafletHtml(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spots mode: re-render markers when list changes.
  const spotsKey = props.mode === 'spots' ? spotsListKey(props.spots) : null;
  useEffect(() => {
    if (props.mode !== 'spots') return;
    const json = JSON.stringify(props.spots).replace(/</g, '\\u003c');
    ref.current?.injectJavaScript(
      `try { if (window.updateSpots) updateSpots(${json}); } catch(e) {} true;`,
    );
  }, [spotsKey, props.mode]);

  // Painted layers (read-only): re-render when membership or splats change.
  // Used by all three modes — pick, spots, and paint all accept `layers?`.
  const layersKey = layersStableKey(props.layers);
  useEffect(() => {
    const json = JSON.stringify(props.layers ?? []).replace(/</g, '\\u003c');
    ref.current?.injectJavaScript(
      `try { if (window.updatePaintLayers) updatePaintLayers(${json}); } catch(e) {} true;`,
    );
  }, [layersKey]);

  // Paint mode: tool changes get pushed in place.
  const paintTool = props.mode === 'paint' ? props.tool : null;
  useEffect(() => {
    if (props.mode !== 'paint') return;
    ref.current?.injectJavaScript(
      `try { if (window.setPaintTool) setPaintTool(${JSON.stringify(paintTool)}); } catch(e) {} true;`,
    );
  }, [paintTool, props.mode]);

  const onMessage = (event: WebViewMessageEvent) => {
    let parsed: any;
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (parsed?.type === 'mapState') {
      // All modes report this. Updates the module-level cache so the next
      // map screen we mount opens at the same position/zoom/basemap.
      rememberedMapState.update({
        lat: typeof parsed.lat === 'number' ? parsed.lat : undefined,
        lon: typeof parsed.lon === 'number' ? parsed.lon : undefined,
        zoom: typeof parsed.zoom === 'number' ? parsed.zoom : undefined,
        layer: typeof parsed.layer === 'string' ? (parsed.layer as LeafletLayer) : undefined,
      });
      return;
    }
    if (
      parsed?.type === 'pick' &&
      props.mode === 'pick' &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lon === 'number'
    ) {
      props.onPick({ lat: parsed.lat, lon: parsed.lon });
    } else if (
      parsed?.type === 'spotTap' &&
      props.mode === 'spots' &&
      typeof parsed.spotId === 'string'
    ) {
      props.onSpotTap(parsed.spotId);
    } else if (
      parsed?.type === 'paintBatch' &&
      props.mode === 'paint' &&
      typeof parsed.layerId === 'string' &&
      Array.isArray(parsed.splats)
    ) {
      props.onPaintBatch({ layerId: parsed.layerId, splats: parsed.splats });
    } else if (
      parsed?.type === 'eraseBatch' &&
      props.mode === 'paint' &&
      typeof parsed.layerId === 'string' &&
      Array.isArray(parsed.erasers)
    ) {
      props.onEraseBatch({ layerId: parsed.layerId, erasers: parsed.erasers });
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: initialHtml }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        onMessage={onMessage}
        mixedContentMode="always"
        androidLayerType="hardware"
      />
    </View>
  );
}

/** Drop the callback props before serialising into the WebView's init JSON. */
function stripCallbacks(p: Props): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'function') continue;
    out[k] = v;
  }
  return out;
}

function spotsListKey(spots: SpotMarkerData[]): string {
  return spots
    .map((s) => `${s.id}:${s.status}:${s.lat.toFixed(5)},${s.lon.toFixed(5)}`)
    .join('|');
}

/**
 * Stable key for the layers prop. Includes splat count and last splat coord
 * per layer so we re-inject when paint/erase changes membership without
 * exploding the size of the key for big layers.
 */
function layersStableKey(layers: PaintLayerData[] | undefined): string {
  if (!layers) return '';
  return layers
    .map((l) => {
      const last = l.splats[l.splats.length - 1];
      const lastFp = last
        ? `${last.lat.toFixed(5)},${last.lon.toFixed(5)},${last.radiusM.toFixed(0)}`
        : '';
      return `${l.id}:${l.colorHex}:${l.visible ? 1 : 0}:${l.splats.length}:${lastFp}`;
    })
    .join('|');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8ECF0' },
  webview: { flex: 1, backgroundColor: '#E8ECF0' },
});
