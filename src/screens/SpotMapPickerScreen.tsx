import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { MapWebView } from '../components/maps/MapWebView';
import { PrimaryButton } from '../components/PrimaryButton';
import { strings } from '../i18n';
import { fmtCoord } from '../utils/format';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'SpotMapPicker'>;
type Rt = RouteProp<SpotsStackParamList, 'SpotMapPicker'>;

export function SpotMapPickerScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();

  const initialLat = route.params?.initialLat;
  const initialLon = route.params?.initialLon;

  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(
    initialLat != null && initialLon != null
      ? { lat: initialLat, lon: initialLon }
      : null,
  );

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
        defaultLayer="topo"
        initialLat={initialLat}
        initialLon={initialLon}
        picked={picked ?? undefined}
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
