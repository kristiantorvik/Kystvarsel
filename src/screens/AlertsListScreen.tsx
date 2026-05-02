import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { alertsRepository } from '../data/alertsRepository';
import { spotsRepository } from '../data/spotsRepository';
import { buildAlertMatchMap } from '../data/alertStatus';
import type { Alert, Spot } from '../domain/alertTypes';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { strings } from '../i18n';
import type { AlertsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AlertsStackParamList, 'AlertsList'>;

export function AlertsListScreen() {
  const nav = useNavigation<Nav>();
  const s = strings();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [spots, setSpots] = useState<Map<string, Spot>>(new Map());
  const [matches, setMatches] = useState<Map<string, boolean>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [a, sp] = await Promise.all([alertsRepository.list(), spotsRepository.list()]);
    setAlerts(a);
    setSpots(new Map(sp.map((x) => [x.id, x])));
    // Match status is derived from cached forecasts (no network), so it's
    // cheap to recompute every time the screen gains focus.
    setMatches(await buildAlertMatchMap(a));
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const onToggle = async (alert: Alert) => {
    await alertsRepository.setEnabled(alert.id, !alert.enabled);
    reload();
  };

  if (loaded && alerts.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState message={s.alerts.empty} />
        <View style={styles.footer}>
          <PrimaryButton title={s.alerts.add} onPress={() => nav.navigate('AlertForm', {})} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => {
          const spot = spots.get(item.spotId);
          const summary = buildSummary(item);
          const matching = matches.get(item.id) === true;
          return (
            <Pressable
              style={[styles.row, matching ? styles.rowMatching : null]}
              onPress={() => nav.navigate('AlertDetail', { alertId: item.id })}
            >
              <View style={styles.headerRow}>
                <View style={styles.nameRow}>
                  {matching && <View style={styles.matchDot} />}
                  <Text style={styles.name}>{item.name}</Text>
                </View>
                <Switch value={item.enabled} onValueChange={() => onToggle(item)} />
              </View>
              <Text style={styles.spot}>{spot?.name ?? item.spotId}</Text>
              <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
              {summary ? <Text style={styles.summary}>{summary}</Text> : null}
              {matching && (
                <Text style={styles.matchLabel}>{s.alerts.matchingNow}</Text>
              )}
            </Pressable>
          );
        }}
      />
      <View style={styles.footer}>
        <PrimaryButton title={s.alerts.add} onPress={() => nav.navigate('AlertForm', {})} />
      </View>
    </View>
  );
}

function buildSummary(alert: Alert): string {
  const s = strings();
  const parts: string[] = [];
  const c = alert.criteria;
  const w = s.alerts.summary.wind(c.minWindSpeedMs, c.maxWindSpeedMs);
  const cu = s.alerts.summary.current(c.minCurrentSpeedMs, c.maxCurrentSpeedMs);
  const st = s.alerts.summary.seaTemp(c.minSeaTemperatureC, c.maxSeaTemperatureC);
  const ti = s.alerts.summary.tide(c.minTideLevelCm, c.maxTideLevelCm);
  const wa = s.alerts.summary.wave(c.minWaveHeightM, c.maxWaveHeightM);
  for (const p of [w, cu, st, ti, wa]) if (p) parts.push(p);
  if (c.tideDirection === 'rising') parts.push(s.alerts.tideDirRising);
  if (c.tideDirection === 'falling') parts.push(s.alerts.tideDirFalling);
  if (c.rainMode === 'no_rain') parts.push(s.alerts.rainNone);
  parts.push(`${alert.timeOfDayStart}–${alert.timeOfDayEnd}`);
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  rowMatching: {
    backgroundColor: '#F0F8F1',
    borderLeftColor: '#2E7D32',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  matchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2E7D32',
  },
  name: { fontSize: 16, fontWeight: '600', flex: 1 },
  spot: { fontSize: 12, color: '#666', marginTop: 2 },
  message: { fontSize: 13, color: '#444', marginTop: 4 },
  summary: { fontSize: 11, color: '#888', marginTop: 4 },
  matchLabel: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 4,
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#EEE' },
});
