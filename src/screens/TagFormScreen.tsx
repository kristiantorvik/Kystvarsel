import React, { useEffect, useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { tagsRepository, DuplicateTagNameError } from '../data/tagsRepository';
import { COLOR_IDS, PALETTE, type ColorId } from '../domain/palette';
import type { Tag } from '../domain/tagTypes';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { strings } from '../i18n';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'TagForm'>;
type Rt = RouteProp<SpotsStackParamList, 'TagForm'>;

export function TagFormScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();
  const editingId = route.params?.tagId;

  const [name, setName] = useState('');
  const [colorId, setColorId] = useState<ColorId>('c1');
  const [existing, setExisting] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editingId) {
      nav.setOptions({ title: s.tags.add });
      return;
    }
    tagsRepository.get(editingId).then((tag) => {
      if (!tag) return;
      setExisting(tag);
      setName(tag.name);
      setColorId(tag.colorId);
      nav.setOptions({ title: s.tags.edit });
    });
  }, [editingId, nav, s.tags.add, s.tags.edit]);

  const onSave = async () => {
    if (!name.trim()) {
      RNAlert.alert(s.errors.invalid, s.tags.nameRequired);
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await tagsRepository.update({ ...existing, name: name.trim(), colorId });
      } else {
        await tagsRepository.create({ name: name.trim(), colorId });
      }
      nav.goBack();
    } catch (e) {
      // Surface the duplicate-name case with a friendly message; everything
      // else funnels through the generic save-failed alert.
      if (e instanceof DuplicateTagNameError) {
        RNAlert.alert(s.errors.saveFailed, s.tags.nameDuplicate);
      } else {
        RNAlert.alert(s.errors.saveFailed, e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    RNAlert.alert(s.tags.delete, s.tags.deleteConfirm, [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: s.common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await tagsRepository.remove(existing.id);
            nav.goBack();
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
        label={s.tags.name}
        value={name}
        onChange={setName}
        placeholder={s.tags.namePlaceholder}
        autoCapitalize="sentences"
      />

      <Text style={styles.sectionLabel}>{s.tags.color}</Text>
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
          <PrimaryButton
            title={s.tags.delete}
            onPress={onDelete}
            variant="danger"
            style={{ marginTop: 12 }}
          />
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
