import React, { useEffect, useMemo, useState } from 'react';
import { Alert as RNAlert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { alertsRepository } from '../data/alertsRepository';
import { spotsRepository } from '../data/spotsRepository';
import type { Alert, AlertCriteria, RainMode, Spot, TideDirectionFilter } from '../domain/alertTypes';
import { TextField } from '../components/TextField';
import { NumberField } from '../components/NumberField';
import { PrimaryButton } from '../components/PrimaryButton';
import { strings } from '../i18n';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
} from '../notifications/localNotifications';
import type { AlertsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AlertsStackParamList, 'AlertForm'>;
type Rt = RouteProp<AlertsStackParamList, 'AlertForm'>;

const HHMM_RE = /^\d{1,2}:\d{2}$/;

export function AlertFormScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();
  const editingId = route.params?.alertId;

  const [existing, setExisting] = useState<Alert | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [spotId, setSpotId] = useState<string | undefined>(route.params?.defaultSpotId);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [start, setStart] = useState('06:00');
  const [end, setEnd] = useState('18:00');

  const [rainMode, setRainMode] = useState<RainMode>('any');
  const [maxPrecipitation, setMaxPrecipitation] = useState<number | undefined>(undefined);

  const [minWind, setMinWind] = useState<number | undefined>(undefined);
  const [maxWind, setMaxWind] = useState<number | undefined>(undefined);
  const [minCurrent, setMinCurrent] = useState<number | undefined>(undefined);
  const [maxCurrent, setMaxCurrent] = useState<number | undefined>(undefined);
  const [minSeaTemp, setMinSeaTemp] = useState<number | undefined>(undefined);
  const [maxSeaTemp, setMaxSeaTemp] = useState<number | undefined>(undefined);
  const [minWave, setMinWave] = useState<number | undefined>(undefined);
  const [maxWave, setMaxWave] = useState<number | undefined>(undefined);
  const [minTide, setMinTide] = useState<number | undefined>(undefined);
  const [maxTide, setMaxTide] = useState<number | undefined>(undefined);
  const [tideDirection, setTideDirection] = useState<TideDirectionFilter>('any');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    spotsRepository.list().then((rows) => {
      setSpots(rows);
      if (!editingId && !spotId && rows.length > 0) setSpotId(rows[0].id);
    });
  }, [editingId, spotId]);

  useEffect(() => {
    if (!editingId) return;
    alertsRepository.get(editingId).then((a) => {
      if (!a) return;
      setExisting(a);
      setSpotId(a.spotId);
      setName(a.name);
      setMessage(a.message);
      setEnabled(a.enabled);
      setStart(a.timeOfDayStart);
      setEnd(a.timeOfDayEnd);
      setRainMode(a.criteria.rainMode ?? 'any');
      setMaxPrecipitation(a.criteria.maxPrecipitationMm);
      setMinWind(a.criteria.minWindSpeedMs);
      setMaxWind(a.criteria.maxWindSpeedMs);
      setMinCurrent(a.criteria.minCurrentSpeedMs);
      setMaxCurrent(a.criteria.maxCurrentSpeedMs);
      setMinSeaTemp(a.criteria.minSeaTemperatureC);
      setMaxSeaTemp(a.criteria.maxSeaTemperatureC);
      setMinWave(a.criteria.minWaveHeightM);
      setMaxWave(a.criteria.maxWaveHeightM);
      setMinTide(a.criteria.minTideLevelCm);
      setMaxTide(a.criteria.maxTideLevelCm);
      setTideDirection(a.criteria.tideDirection ?? 'any');
      nav.setOptions({ title: s.alerts.edit });
    });
  }, [editingId, nav, s.alerts.edit]);

  const criteria: AlertCriteria = useMemo(
    () => ({
      rainMode,
      maxPrecipitationMm: rainMode === 'max_precipitation' ? maxPrecipitation : undefined,
      minWindSpeedMs: minWind,
      maxWindSpeedMs: maxWind,
      minCurrentSpeedMs: minCurrent,
      maxCurrentSpeedMs: maxCurrent,
      minSeaTemperatureC: minSeaTemp,
      maxSeaTemperatureC: maxSeaTemp,
      minWaveHeightM: minWave,
      maxWaveHeightM: maxWave,
      minTideLevelCm: minTide,
      maxTideLevelCm: maxTide,
      tideDirection,
    }),
    [
      rainMode, maxPrecipitation, minWind, maxWind, minCurrent, maxCurrent,
      minSeaTemp, maxSeaTemp, minWave, maxWave, minTide, maxTide, tideDirection,
    ],
  );

  const validate = (): string | null => {
    if (!spotId) return s.alerts.spot;
    if (!name.trim()) return s.alerts.name;
    if (!message.trim()) return s.alerts.message;
    if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) return s.alerts.timeWindow;
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
      // Per spec: ask for notification permission when the user enables their first alert.
      if (enabled) {
        const cur = await getNotificationPermissionState();
        if (cur === 'undetermined') {
          await requestNotificationPermission();
        }
      }

      if (existing) {
        await alertsRepository.update({
          ...existing,
          spotId: spotId!,
          name: name.trim(),
          message: message.trim(),
          enabled,
          timeOfDayStart: start,
          timeOfDayEnd: end,
          criteria,
        });
      } else {
        await alertsRepository.create({
          spotId: spotId!,
          name: name.trim(),
          message: message.trim(),
          enabled,
          timeOfDayStart: start,
          timeOfDayEnd: end,
          criteria,
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
    RNAlert.alert(s.alerts.delete, s.alerts.deleteConfirm, [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: s.common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await alertsRepository.remove(existing.id);
            nav.goBack();
          } catch (e) {
            RNAlert.alert(s.errors.deleteFailed, e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  if (spots.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.notice}>{s.spots.empty}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{s.alerts.spot}</Text>
      <View style={styles.chips}>
        {spots.map((sp) => (
          <Pressable
            key={sp.id}
            onPress={() => setSpotId(sp.id)}
            style={[styles.chip, spotId === sp.id ? styles.chipActive : null]}
          >
            <Text style={[styles.chipText, spotId === sp.id ? styles.chipTextActive : null]}>{sp.name}</Text>
          </Pressable>
        ))}
      </View>

      <TextField label={s.alerts.name} value={name} onChange={setName} autoCapitalize="sentences" />
      <TextField
        label={s.alerts.message}
        value={message}
        onChange={setMessage}
        placeholder={s.alerts.messagePlaceholder}
        multiline
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>{s.alerts.enabled}</Text>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>

      <Text style={styles.section}>{s.alerts.timeWindow}</Text>
      <View style={styles.timeRow}>
        <View style={styles.timeCol}>
          <TextField label={s.alerts.timeWindowFrom} value={start} onChange={setStart} placeholder="06:00" />
        </View>
        <View style={styles.timeCol}>
          <TextField label={s.alerts.timeWindowTo} value={end} onChange={setEnd} placeholder="18:00" />
        </View>
      </View>
      <Text style={styles.helper}>{s.alerts.timeWindowOvernight}</Text>

      <Text style={styles.section}>{s.alerts.rainSection}</Text>
      <View style={styles.chips}>
        {(['any', 'no_rain', 'max_precipitation'] as RainMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setRainMode(m)}
            style={[styles.chip, rainMode === m ? styles.chipActive : null]}
          >
            <Text style={[styles.chipText, rainMode === m ? styles.chipTextActive : null]}>
              {m === 'any' ? s.alerts.rainAny : m === 'no_rain' ? s.alerts.rainNone : s.alerts.rainMax}
            </Text>
          </Pressable>
        ))}
      </View>
      {rainMode === 'max_precipitation' && (
        <NumberField label={s.alerts.rainMax} value={maxPrecipitation} onChange={setMaxPrecipitation} />
      )}

      <Text style={styles.section}>{s.alerts.windSection}</Text>
      <View style={styles.row2}>
        <View style={styles.col}>
          <NumberField label={s.alerts.minLabel} value={minWind} onChange={setMinWind} />
        </View>
        <View style={styles.col}>
          <NumberField label={s.alerts.maxLabel} value={maxWind} onChange={setMaxWind} />
        </View>
      </View>

      <Text style={styles.section}>{s.alerts.currentSection}</Text>
      <View style={styles.row2}>
        <View style={styles.col}>
          <NumberField label={s.alerts.minLabel} value={minCurrent} onChange={setMinCurrent} />
        </View>
        <View style={styles.col}>
          <NumberField label={s.alerts.maxLabel} value={maxCurrent} onChange={setMaxCurrent} />
        </View>
      </View>

      <Text style={styles.section}>{s.alerts.seaTempSection}</Text>
      <View style={styles.row2}>
        <View style={styles.col}>
          <NumberField label={s.alerts.minLabel} value={minSeaTemp} onChange={setMinSeaTemp} />
        </View>
        <View style={styles.col}>
          <NumberField label={s.alerts.maxLabel} value={maxSeaTemp} onChange={setMaxSeaTemp} />
        </View>
      </View>

      <Text style={styles.section}>{s.alerts.waveSection}</Text>
      <View style={styles.row2}>
        <View style={styles.col}>
          <NumberField label={s.alerts.minLabel} value={minWave} onChange={setMinWave} />
        </View>
        <View style={styles.col}>
          <NumberField label={s.alerts.maxLabel} value={maxWave} onChange={setMaxWave} />
        </View>
      </View>

      <Text style={styles.section}>{s.alerts.tideSection}</Text>
      <View style={styles.row2}>
        <View style={styles.col}>
          <NumberField label={s.alerts.tideLevelMin} value={minTide} onChange={setMinTide} step="integer" />
        </View>
        <View style={styles.col}>
          <NumberField label={s.alerts.tideLevelMax} value={maxTide} onChange={setMaxTide} step="integer" />
        </View>
      </View>
      <Text style={styles.label}>{s.alerts.tideDirection}</Text>
      <View style={styles.chips}>
        {(['any', 'rising', 'falling'] as TideDirectionFilter[]).map((d) => (
          <Pressable
            key={d}
            onPress={() => setTideDirection(d)}
            style={[styles.chip, tideDirection === d ? styles.chipActive : null]}
          >
            <Text style={[styles.chipText, tideDirection === d ? styles.chipTextActive : null]}>
              {d === 'any' ? s.alerts.tideDirAny : d === 'rising' ? s.alerts.tideDirRising : s.alerts.tideDirFalling}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actions}>
        <PrimaryButton title={s.common.save} onPress={onSave} loading={saving} />
        {existing && (
          <PrimaryButton
            title={s.alerts.delete}
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
  notice: { padding: 24, color: '#666', textAlign: 'center' },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  section: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 8, color: '#0E3A5F' },
  helper: { fontSize: 11, color: '#888', marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },
  row2: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#CCD3DA' },
  chipActive: { backgroundColor: '#0E3A5F', borderColor: '#0E3A5F' },
  chipText: { color: '#0E3A5F', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  actions: { marginTop: 24 },
});
