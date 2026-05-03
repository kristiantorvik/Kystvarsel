import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert as RNAlert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spotsRepository } from '../data/spotsRepository';
import { tagsRepository } from '../data/tagsRepository';
import type { Spot } from '../domain/alertTypes';
import type { Tag } from '../domain/tagTypes';
import { TextField } from '../components/TextField';
import { NumberField } from '../components/NumberField';
import { PrimaryButton } from '../components/PrimaryButton';
import { TagChipRow, type TagChipItem } from '../components/TagChipRow';
import { strings } from '../i18n';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'SpotForm'>;
type Rt = RouteProp<SpotsStackParamList, 'SpotForm'>;

export function SpotFormScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();
  const editingId = route.params?.spotId;

  const [name, setName] = useState('');
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lon, setLon] = useState<number | undefined>(undefined);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<Spot | null>(null);
  // Tag selection. `availableTags` is reloaded on focus so freshly created
  // tags (created via the Tagger tab while this form was already mounted —
  // e.g. user opened SpotForm then realised they need a new tag, navigated
  // away, made the tag, came back) appear without requiring a remount.
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!editingId) return;
    spotsRepository.get(editingId).then((spot) => {
      if (!spot) return;
      setExisting(spot);
      setName(spot.name);
      setLat(spot.latitude);
      setLon(spot.longitude);
      setComment(spot.comment ?? '');
      nav.setOptions({ title: s.spots.edit });
    });
    tagsRepository.listTagIdsForSpot(editingId).then((ids) => {
      setSelectedTagIds(new Set(ids));
    });
  }, [editingId, nav, s.spots.edit]);

  // Load tag list both on mount and on focus (so a freshly-created tag
  // appears when returning from TagForm).
  useFocusEffect(
    useCallback(() => {
      tagsRepository.list().then(setAvailableTags);
    }, []),
  );

  const tagChipItems = useMemo<TagChipItem[]>(
    () => availableTags.map((t) => ({ id: t.id, name: t.name, colorId: t.colorId })),
    [availableTags],
  );

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Pick up coordinates returned from the map picker. nav.navigate from there
  // merges params into our route, so we just react to the change here.
  const pickedLat = route.params?.pickedLat;
  const pickedLon = route.params?.pickedLon;
  useEffect(() => {
    if (pickedLat != null && pickedLon != null) {
      setLat(pickedLat);
      setLon(pickedLon);
      // Clear so re-renders don't keep applying the same pick.
      nav.setParams({ pickedLat: undefined, pickedLon: undefined });
    }
  }, [pickedLat, pickedLon, nav]);

  const validate = (): string | null => {
    if (!name.trim()) return s.spots.name;
    if (lat == null || lon == null) return s.spots.invalidCoordinates;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return s.spots.invalidCoordinates;
    return null;
  };

  const onSave = async () => {
    const err = validate();
    if (err) {
      RNAlert.alert(s.errors.invalid, err);
      return;
    }
    setSaving(true);
    try {
      let savedId: string;
      if (existing) {
        await spotsRepository.update({
          ...existing,
          name: name.trim(),
          latitude: lat!,
          longitude: lon!,
          comment: comment.trim() || undefined,
        });
        savedId = existing.id;
      } else {
        const created = await spotsRepository.create({
          name: name.trim(),
          latitude: lat!,
          longitude: lon!,
          comment: comment.trim() || undefined,
        });
        savedId = created.id;
      }
      // Tag attachments are diff-applied in a single transaction by the
      // repo; safe even if the selection is unchanged.
      await tagsRepository.setTagsForSpot(savedId, Array.from(selectedTagIds));
      nav.goBack();
    } catch (e) {
      RNAlert.alert(s.errors.saveFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    RNAlert.alert(s.spots.delete, s.spots.deleteConfirm, [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: s.common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await spotsRepository.remove(existing.id);
            // Skip past SpotForecast (which would crash on the just-deleted
            // spot) and land on the spots list directly.
            nav.popTo('SpotsList');
          } catch (e) {
            RNAlert.alert(s.errors.deleteFailed, e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TextField label={s.spots.name} value={name} onChange={setName} placeholder="Sommarøy" autoCapitalize="words" />
      <NumberField label={s.spots.latitude} value={lat} onChange={setLat} placeholder="60.18484" />
      <NumberField label={s.spots.longitude} value={lon} onChange={setLon} placeholder="5.02019" />
      <PrimaryButton
        title={s.spots.pickOnMap}
        variant="secondary"
        onPress={() => nav.navigate('SpotMapPicker', { initialLat: lat, initialLon: lon })}
        style={{ marginBottom: 12 }}
      />
      <TextField
        label={s.spots.comment}
        value={comment}
        onChange={setComment}
        placeholder={s.spots.commentPlaceholder}
        multiline
      />

      <Text style={styles.tagSectionLabel}>{s.spots.tagsSection}</Text>
      {tagChipItems.length === 0 ? (
        <Text style={styles.tagEmpty}>{s.spots.tagsSectionEmpty}</Text>
      ) : (
        <View style={styles.tagChipWrap}>
          <TagChipRow
            tags={tagChipItems}
            selected={selectedTagIds}
            onToggle={toggleTag}
            variant="form"
          />
        </View>
      )}

      <View style={styles.actions}>
        <PrimaryButton title={s.common.save} onPress={onSave} loading={saving} />
        {existing && (
          <PrimaryButton
            title={s.spots.delete}
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
  actions: { marginTop: 16 },
  tagSectionLabel: { fontSize: 12, color: '#666', marginTop: 16, marginBottom: 4 },
  tagEmpty: { fontSize: 13, color: '#888', fontStyle: 'italic', marginTop: 4 },
  // Negative horizontal margin makes the chip row go edge-to-edge inside
  // the otherwise-padded ScrollView, matching the visual rhythm of a
  // segmented control.
  tagChipWrap: { marginHorizontal: -16 },
});
