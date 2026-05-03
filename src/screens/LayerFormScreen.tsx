import React, { useEffect, useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { layersRepository } from '../data/layersRepository';
import { COLOR_IDS, PALETTE, type ColorId } from '../domain/palette';
import type { MapLayer } from '../domain/layerTypes';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { strings } from '../i18n';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'LayerForm'>;
type Rt = RouteProp<SpotsStackParamList, 'LayerForm'>;

export function LayerFormScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();
  const editingId = route.params?.layerId;

  const [name, setName] = useState('');
  const [colorId, setColorId] = useState<ColorId>('c1');
  const [existing, setExisting] = useState<MapLayer | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editingId) {
      // Suggest a default name like "Nytt lag 1", "Nytt lag 2" so users can
      // hit save without typing if they don't care about the name.
      (async () => {
        const list = await layersRepository.list();
        setName(s.layers.nameDefault(list.length + 1));
      })();
      nav.setOptions({ title: s.layers.add });
      return;
    }
    layersRepository.get(editingId).then((layer) => {
      if (!layer) return;
      setExisting(layer);
      setName(layer.name);
      setColorId(layer.colorId);
      nav.setOptions({ title: s.layers.edit });
    });
  }, [editingId, nav, s.layers.add, s.layers.edit, s.layers]);

  const onSave = async () => {
    if (!name.trim()) {
      RNAlert.alert(s.errors.invalid, s.layers.name);
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await layersRepository.update({ ...existing, name: name.trim(), colorId });
      } else {
        await layersRepository.create({ name: name.trim(), colorId });
      }
      nav.goBack();
    } catch (e) {
      RNAlert.alert(s.errors.saveFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    RNAlert.alert(s.layers.delete, s.layers.deleteConfirm, [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: s.common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await layersRepository.remove(existing.id);
            nav.popTo('LayersList');
          } catch (e) {
            RNAlert.alert(s.errors.deleteFailed, e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TextField
        label={s.layers.name}
        value={name}
        onChange={setName}
        autoCapitalize="sentences"
      />

      <Text style={styles.sectionLabel}>{s.layers.color}</Text>
      <View style={styles.swatches}>
        {COLOR_IDS.map((id) => {
          const isActive = colorId === id;
          return (
            <Pressable
              key={id}
              onPress={() => setColorId(id)}
              style={[
                styles.swatchButton,
                { backgroundColor: PALETTE[id].hex },
                isActive ? styles.swatchActive : null,
              ]}
              accessibilityLabel={PALETTE[id].label}
            />
          );
        })}
      </View>
      <Text style={styles.swatchLabel}>{PALETTE[colorId].label}</Text>

      <View style={styles.actions}>
        <PrimaryButton title={s.common.save} onPress={onSave} loading={saving} />
        {existing && (
          <>
            <PrimaryButton
              title={s.layers.editOnMap}
              variant="secondary"
              onPress={() => nav.navigate('MapPaint', { layerId: existing.id })}
              style={{ marginTop: 12 }}
            />
            <PrimaryButton
              title={s.layers.delete}
              onPress={onDelete}
              variant="danger"
              style={{ marginTop: 12 }}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  sectionLabel: { fontSize: 12, color: '#666', marginTop: 8, marginBottom: 8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: '#0E3A5F' },
  swatchLabel: { fontSize: 12, color: '#666', marginTop: 8 },
  actions: { marginTop: 24 },
});
