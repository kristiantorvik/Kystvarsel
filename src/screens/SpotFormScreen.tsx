import React, { useEffect, useState } from 'react';
import { Alert as RNAlert, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spotsRepository } from '../data/spotsRepository';
import type { Spot } from '../domain/alertTypes';
import { TextField } from '../components/TextField';
import { NumberField } from '../components/NumberField';
import { PrimaryButton } from '../components/PrimaryButton';
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
  }, [editingId, nav, s.spots.edit]);

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
      if (existing) {
        await spotsRepository.update({
          ...existing,
          name: name.trim(),
          latitude: lat!,
          longitude: lon!,
          comment: comment.trim() || undefined,
        });
      } else {
        await spotsRepository.create({
          name: name.trim(),
          latitude: lat!,
          longitude: lon!,
          comment: comment.trim() || undefined,
        });
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
    RNAlert.alert(s.spots.delete, s.spots.deleteConfirm, [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: s.common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await spotsRepository.remove(existing.id);
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
});
