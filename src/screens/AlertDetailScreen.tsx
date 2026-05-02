import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { alertsRepository } from '../data/alertsRepository';
import { spotsRepository } from '../data/spotsRepository';
import { getForecastForSpot } from '../api/forecastService';
import { evaluateAlert, type HourEvaluation } from '../domain/evaluateAlert';
import type { Alert, Spot } from '../domain/alertTypes';
import { ForecastRow } from '../components/ForecastRow';
import { ErrorState } from '../components/ErrorState';
import { strings } from '../i18n';
import { osloLabel } from '../utils/time';
import type { AlertsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<AlertsStackParamList, 'AlertDetail'>;
type Rt = RouteProp<AlertsStackParamList, 'AlertDetail'>;

export function AlertDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();
  const { alertId } = route.params;

  const [alert, setAlert] = useState<Alert | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [evaluations, setEvaluations] = useState<HourEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const a = await alertsRepository.get(alertId);
      if (!a) throw new Error('Alert not found');
      setAlert(a);
      const sp = await spotsRepository.get(a.spotId);
      if (!sp) throw new Error('Spot not found');
      setSpot(sp);
      const bundle = await getForecastForSpot(sp.latitude, sp.longitude);
      const r = evaluateAlert(a, bundle.hours);
      setEvaluations(r.evaluations);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [alertId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!alert) return;
    nav.setOptions({
      title: alert.name,
      headerRight: () => (
        <Pressable onPress={() => nav.navigate('AlertForm', { alertId: alert.id })}>
          <Text style={styles.editBtn}>{s.common.edit}</Text>
        </Pressable>
      ),
    });
  }, [alert, nav, s.common.edit]);

  // Hooks must run on every render — keep these above the early-return
  // guards below. The values they produce are only meaningful once
  // `evaluations` has been populated, but reading the empty initial state
  // is harmless.
  const firstMatchIndex = useMemo(
    () => evaluations.findIndex((e) => e.matches),
    [evaluations],
  );
  const listRef = useRef<FlatList<HourEvaluation>>(null);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (error) {
    return <ErrorState message={`${s.forecast.error}\n${error}`} onRetry={load} />;
  }
  if (!alert || !spot) return null;

  const matchingCount = evaluations.filter((e) => e.matches).length;
  // Only worth showing the jump button if the first match isn't already on
  // screen — at index 0 or 1 the user would see it without scrolling anyway.
  const showJumpButton = firstMatchIndex > 1;

  const jumpToFirstMatch = () => {
    if (firstMatchIndex < 0) return;
    listRef.current?.scrollToIndex({
      index: firstMatchIndex,
      animated: true,
      viewPosition: 0, // align the matching row to the top of the visible area
    });
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={evaluations}
        keyExtractor={(e) => e.hour.timeUtc}
        renderItem={({ item }) => (
          <ForecastRow
            hour={item.hour}
            matchesAlert={item.matches}
            failedReasons={item.matches ? undefined : item.failedReasons}
          />
        )}
        // Rows have variable height (extra "failed reasons" line on
        // non-matching hours). When scrollToIndex can't measure the target
        // ahead of time, fall back to a measured estimate then retry.
        onScrollToIndexFailed={(info) => {
          const offset = info.averageItemLength * info.index;
          listRef.current?.scrollToOffset({ offset, animated: true });
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0,
            });
          }, 80);
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.spotName}>{spot.name}</Text>
            <Text style={styles.message}>{alert.message}</Text>
            <Text style={styles.meta}>
              {alert.timeOfDayStart}–{alert.timeOfDayEnd} · {alert.enabled ? s.common.enabled : s.common.disabled}
            </Text>
            <Text style={styles.meta}>
              {alert.lastTriggeredAt
                ? `${s.alerts.triggeredAt} ${osloLabel(alert.lastTriggeredAt)}`
                : s.alerts.notTriggered}
            </Text>
            <Text style={styles.summaryHeader}>
              {matchingCount > 0
                ? `${matchingCount} ${matchingCount === 1 ? 'time' : 'timer'} matcher.`
                : s.alerts.detail.noMatches}
            </Text>
            <Text style={styles.note}>{s.alerts.detail.missingDataNote}</Text>
            {showJumpButton && (
              <Pressable onPress={jumpToFirstMatch} style={styles.jumpButton}>
                <Text style={styles.jumpButtonText}>
                  ↓  {s.alerts.detail.jumpToFirstMatch}
                </Text>
              </Pressable>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: 16, borderBottomColor: '#EEE', borderBottomWidth: 1 },
  spotName: { fontSize: 18, fontWeight: '600', color: '#0E3A5F' },
  message: { fontSize: 14, marginTop: 4 },
  meta: { fontSize: 12, color: '#666', marginTop: 4 },
  summaryHeader: { fontSize: 13, color: '#2E7D32', marginTop: 8, fontWeight: '600' },
  note: { fontSize: 11, color: '#888', marginTop: 4 },
  editBtn: { color: '#0E3A5F', fontWeight: '600', paddingHorizontal: 8 },
  jumpButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#DCF1DE',
    borderWidth: 1,
    borderColor: '#2E7D32',
  },
  jumpButtonText: { color: '#1B5C20', fontSize: 13, fontWeight: '600' },
});
