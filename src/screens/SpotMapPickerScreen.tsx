import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { MapWebView } from '../components/maps/MapWebView';
import { PrimaryButton } from '../components/PrimaryButton';
import { layersRepository } from '../data/layersRepository';
import { paletteHex } from '../domain/palette';
import { strings } from '../i18n';
import { fmtCoord } from '../utils/format';
import type { LeafletLayer, PaintLayerData } from '../components/maps/leafletHtml';
import { rememberedMapState } from '../components/maps/mapState';
import { useShowCrosshair } from '../hooks/useShowCrosshair';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'SpotMapPicker'>;
type Rt = RouteProp<SpotsStackParamList, 'SpotMapPicker'>;

export function SpotMapPickerScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();

  const initialLat = route.params?.initialLat;
  const initialLon = route.params?.initialLon;
  const showCrosshair = useShowCrosshair();

  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(
    initialLat != null && initialLon != null
      ? { lat: initialLat, lon: initialLon }
      : null,
  );

  // Read painted layers once on mount — they're context for picking, not
  // editable here, so we don't need to track changes.
  const [paintLayers, setPaintLayers] = useState<PaintLayerData[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      const all = await layersRepository.list();
      const splatsByLayer = await layersRepository.listSplatsForLayers(
        all.map((l) => l.id),
      );
      const data: PaintLayerData[] = all.map((l) => ({
        id: l.id,
        colorHex: paletteHex(l.colorId),
        visible: l.visible,
        splats: (splatsByLayer.get(l.id) ?? []).map((sp) => ({
          lat: sp.lat,
          lon: sp.lon,
          radiusM: sp.radiusM,
        })),
      }));
      if (active) setPaintLayers(data);
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleConfirm = () => {
    if (!picked) return;
    // popTo (rather than navigate with merge:true) reliably pops back to the
    // existing SpotForm instead of pushing a fresh one — so the name field
    // and other form state survive the round-trip through the picker.
    nav.popTo(
      'SpotForm',
      { pickedLat: picked.lat, pickedLon: picked.lon },
      { merge: true },
    );
  };

  return (
    <View style={styles.container}>
      <MapWebView
        mode="pick"
        // Coords passed from SpotForm win (the user is intentionally
        // editing this spot), otherwise drop in wherever the user was last
        // looking on any other map screen.
        defaultLayer={(rememberedMapState.get().layer as LeafletLayer | undefined) ?? 'topo'}
        initialLat={initialLat ?? rememberedMapState.get().lat}
        initialLon={initialLon ?? rememberedMapState.get().lon}
        initialZoom={initialLat != null ? undefined : rememberedMapState.get().zoom}
        picked={picked ?? undefined}
        layers={paintLayers}
        showCrosshair={showCrosshair}
        onPick={setPicked}
      />

      <View style={styles.hud}>
        {picked ? (
          <Text style={styles.coords}>{fmtCoord(picked.lat, picked.lon)}</Text>
        ) : (
          <Text style={styles.hint}>{s.spots.mapPickerHint}</Text>
        )}
        <PrimaryButton
          title={s.common.save}
          onPress={handleConfirm}
          disabled={!picked}
          style={{ marginTop: 8 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hud: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopColor: '#EEE',
    borderTopWidth: 1,
    backgroundColor: '#fff',
  },
  coords: { fontSize: 14, fontWeight: '500', color: '#0E3A5F' },
  hint: { fontSize: 13, color: '#666' },
});
