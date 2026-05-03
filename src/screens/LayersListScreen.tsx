import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { layersRepository } from '../data/layersRepository';
import { paletteHex } from '../domain/palette';
import type { MapLayer } from '../domain/layerTypes';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { strings } from '../i18n';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'LayersList'>;

interface RowState extends MapLayer {
  splatCount: number;
}

export function LayersListScreen() {
  const nav = useNavigation<Nav>();
  const s = strings();
  const [layers, setLayers] = useState<RowState[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const list = await layersRepository.list();
    // Read splat counts in parallel so the UI shows useful info per row.
    const withCounts: RowState[] = await Promise.all(
      list.map(async (l) => ({
        ...l,
        splatCount: await layersRepository.countSplats(l.id),
      })),
    );
    setLayers(withCounts);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const onToggleVisible = async (layer: RowState) => {
    // Optimistic — flip in local state, then persist. Reload is a focus
    // effect; toggling shouldn't bounce the user out of the screen.
    setLayers((prev) =>
      prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l)),
    );
    await layersRepository.setVisible(layer.id, !layer.visible);
  };

  return (
    <View style={styles.container}>
      {loaded && layers.length === 0 ? (
        <EmptyState message={s.layers.empty} />
      ) : (
        <FlatList
          data={layers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => nav.navigate('LayerForm', { layerId: item.id })}
            >
              <View style={[styles.swatch, { backgroundColor: paletteHex(item.colorId) }]} />
              <View style={styles.body}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{s.layers.splatCount(item.splatCount)}</Text>
              </View>
              <Switch value={item.visible} onValueChange={() => onToggleVisible(item)} />
            </Pressable>
          )}
        />
      )}

      <View style={styles.footer}>
        <PrimaryButton title={s.layers.add} onPress={() => nav.navigate('LayerForm', {})} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
    gap: 12,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  body: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#EEE' },
});
