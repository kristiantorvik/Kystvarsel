import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  buildLeafletHtml,
  type LeafletOptions,
  type SpotMarkerData,
} from './leafletHtml';

interface PickProps extends Extract<LeafletOptions, { mode: 'pick' }> {
  onPick: (coord: { lat: number; lon: number }) => void;
  onSpotTap?: never;
}

interface SpotsProps extends Extract<LeafletOptions, { mode: 'spots' }> {
  onSpotTap: (spotId: string) => void;
  onPick?: never;
}

type Props = PickProps | SpotsProps;

/**
 * Wraps a WebView containing a Leaflet map with Kartverket tiles.
 *
 * The HTML is built once on mount with the initial options. After that, only
 * the spots list updates trigger an in-place refresh via injectJavaScript so
 * the user's pan/zoom state is preserved when the alert-status colours change.
 */
export function MapWebView(props: Props) {
  const ref = useRef<WebView>(null);

  // Build initial HTML only once — pan/zoom state should survive prop updates.
  // Refs hold the latest data for the JS injection effect below.
  const initialHtml = useMemo(() => {
    if (props.mode === 'pick') {
      const { onPick: _onPick, ...rest } = props;
      return buildLeafletHtml(rest as LeafletOptions);
    }
    const { onSpotTap: _onSpotTap, ...rest } = props;
    return buildLeafletHtml(rest as LeafletOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // For 'spots' mode, push updates to the WebView in place when the list changes.
  const spotsKey = props.mode === 'spots' ? stableKey(props.spots) : null;
  useEffect(() => {
    if (props.mode !== 'spots') return;
    const json = JSON.stringify(props.spots).replace(/</g, '\\u003c');
    const js = `
      try {
        if (typeof updateSpots === 'function') {
          updateSpots(${json});
        }
      } catch (e) {}
      true;
    `;
    ref.current?.injectJavaScript(js);
  }, [spotsKey, props.mode]);

  const onMessage = (event: WebViewMessageEvent) => {
    let parsed: any;
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (parsed?.type === 'pick' && props.mode === 'pick' && typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
      props.onPick({ lat: parsed.lat, lon: parsed.lon });
    } else if (parsed?.type === 'spotTap' && props.mode === 'spots' && typeof parsed.spotId === 'string') {
      props.onSpotTap(parsed.spotId);
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
        // Allow remote content (Leaflet from unpkg, tiles from Kartverket).
        mixedContentMode="always"
        androidLayerType="hardware"
      />
    </View>
  );
}

/**
 * Compact stable key for a list of spots — used to detect when the markers
 * actually changed (status colour or membership) without triggering on every
 * re-render of the parent.
 */
function stableKey(spots: SpotMarkerData[]): string {
  return spots
    .map((s) => `${s.id}:${s.status}:${s.lat.toFixed(5)},${s.lon.toFixed(5)}`)
    .join('|');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8ECF0' },
  webview: { flex: 1, backgroundColor: '#E8ECF0' },
});
