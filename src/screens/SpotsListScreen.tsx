import React, { useCallback, useState } from 'react';
import {
  Alert as RNAlert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spotsRepository } from '../data/spotsRepository';
import { buildSpotMarkers, type SpotMarker } from '../data/spotStatus';
import { layersRepository } from '../data/layersRepository';
import type { Spot } from '../domain/alertTypes';
import { paletteHex } from '../domain/palette';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { MapWebView } from '../components/maps/MapWebView';
import type { LeafletLayer, PaintLayerData } from '../components/maps/leafletHtml';
import { rememberedMapState } from '../components/maps/mapState';
import { runAlertCheck } from '../notifications/backgroundCheck';
import { fmtCoord } from '../utils/format';
import { strings } from '../i18n';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'SpotsList'>;
type ViewMode = 'list' | 'map';

export function SpotsListScreen() {
  const nav = useNavigation<Nav>();
  const s = strings();
  const [spots, setSpots] = useState<Spot[]>([]);
  const [markers, setMarkers] = useState<SpotMarker[]>([]);
  const [paintLayers, setPaintLayers] = useState<PaintLayerData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [checking, setChecking] = useState(false);

  const reload = useCallback(async () => {
    const [rows, mrk, allLayers] = await Promise.all([
      spotsRepository.list(),
      buildSpotMarkers(),
      layersRepository.list(),
    ]);
    setSpots(rows);
    setMarkers(mrk);
    // Hidden layers are still passed so the WebView's layer registry stays
    // consistent across visibility toggles — render is gated on `visible`.
    // Splats fetched in a single SELECT (was N+1 before).
    const splatsByLayer = await layersRepository.listSplatsForLayers(
      allLayers.map((l) => l.id),
    );
    const layerData: PaintLayerData[] = allLayers.map((l) => ({
      id: l.id,
      colorHex: paletteHex(l.colorId),
      visible: l.visible,
      splats: (splatsByLayer.get(l.id) ?? []).map((sp) => ({
        lat: sp.lat,
        lon: sp.lon,
        radiusM: sp.radiusM,
      })),
    }));
    setPaintLayers(layerData);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      reload().catch(() => {
        if (active) setLoaded(true);
      });
      return () => {
        active = false;
      };
    }, [reload]),
  );

  const onCheckNow = async () => {
    setChecking(true);
    try {
      await runAlertCheck();
      await reload();
    } catch (e) {
      RNAlert.alert(s.errors.fetchFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const Toggle = () => (
    <View style={styles.toggleRow}>
      <Pressable
        onPress={() => setView('list')}
        style={[styles.toggle, view === 'list' ? styles.toggleActive : null]}
      >
        <Text style={view === 'list' ? styles.toggleTextActive : styles.toggleText}>
          {s.spots.viewList}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setView('map')}
        style={[styles.toggle, view === 'map' ? styles.toggleActive : null]}
      >
        <Text style={view === 'map' ? styles.toggleTextActive : styles.toggleText}>
          {s.spots.viewMap}
        </Text>
      </Pressable>
      {/* Lag (layers) is only relevant when looking at the map. Hidden in
          list mode so the row stays uncluttered. */}
      {view === 'map' && (
        <Pressable
          onPress={() => nav.navigate('LayersList')}
          style={[styles.toggle, styles.layersPill]}
        >
          <Text style={styles.layersPillText}>{s.layers.open}</Text>
        </Pressable>
      )}
    </View>
  );

  if (loaded && spots.length === 0) {
    return (
      <View style={styles.container}>
        <Toggle />
        <EmptyState message={s.spots.empty} />
        <View style={styles.footer}>
          <PrimaryButton title={s.spots.add} onPress={() => nav.navigate('SpotForm', {})} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Toggle />

      {view === 'list' ? (
        <FlatList
          data={spots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => nav.navigate('SpotForecast', { spotId: item.id })}
              style={styles.row}
            >
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.coords}>{fmtCoord(item.latitude, item.longitude)}</Text>
              {item.comment ? (
                <Text style={styles.comment} numberOfLines={2}>
                  {item.comment}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      ) : (
        <View style={styles.mapWrap}>
          <MapWebView
            mode="spots"
            defaultLayer={(rememberedMapState.get().layer as LeafletLayer | undefined) ?? 'topo'}
            initialLat={rememberedMapState.get().lat}
            initialLon={rememberedMapState.get().lon}
            initialZoom={rememberedMapState.get().zoom}
            spots={markers}
            layers={paintLayers}
            legendLabels={{
              matching: s.spots.mapLegendMatching,
              alert: s.spots.mapLegendAlert,
              plain: s.spots.mapLegendPlain,
            }}
            onSpotTap={(id) => nav.navigate('SpotForecast', { spotId: id })}
          />
          <View style={styles.checkButtonWrap} pointerEvents="box-none">
            <PrimaryButton
              title={checking ? s.spots.mapCheckRunning : s.spots.mapCheckNow}
              onPress={onCheckNow}
              loading={checking}
              variant="secondary"
              style={styles.checkButton}
            />
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <PrimaryButton title={s.spots.add} onPress={() => nav.navigate('SpotForm', {})} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
  },
  toggle: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CCD3DA',
  },
  toggleActive: { backgroundColor: '#0E3A5F', borderColor: '#0E3A5F' },
  toggleText: { color: '#0E3A5F', fontSize: 13, fontWeight: '500' },
  toggleTextActive: { color: '#fff', fontSize: 13, fontWeight: '600' },
  // Pushed to the right edge of the row so it visually separates from the
  // List/Kart toggle pair on the left.
  layersPill: { marginLeft: 'auto' },
  layersPillText: { color: '#0E3A5F', fontSize: 13, fontWeight: '500' },

  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
  },
  name: { fontSize: 16, fontWeight: '600' },
  coords: { fontSize: 12, color: '#666', marginTop: 2 },
  comment: { fontSize: 13, color: '#444', marginTop: 4 },

  mapWrap: { flex: 1 },
  checkButtonWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    alignItems: 'flex-start',
  },
  checkButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#EEE' },
});
