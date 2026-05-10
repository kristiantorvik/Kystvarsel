import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert as RNAlert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spotsRepository } from '../data/spotsRepository';
import {
  getForecastForSpot,
  FRESH_ON_ENTRY_MS,
  PartialFetchError,
} from '../api/forecastService';
import type { ForecastBundle } from '../domain/forecastTypes';
import type { Spot } from '../domain/alertTypes';
import { ForecastRow } from '../components/ForecastRow';
import { ForecastCharts } from '../components/charts/ForecastCharts';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { strings } from '../i18n';
import { osloLabel } from '../utils/time';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'SpotForecast'>;
type Rt = RouteProp<SpotsStackParamList, 'SpotForecast'>;

type ViewMode = 'list' | 'chart';

export function SpotForecastScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();
  const { spotId } = route.params;

  const [spot, setSpot] = useState<Spot | null>(null);
  const [bundle, setBundle] = useState<ForecastBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('list');

  const load = useCallback(async (mode: 'entry' | 'refresh') => {
    setLoading(true);
    setError(null);
    try {
      const sp = await spotsRepository.get(spotId);
      if (!sp) throw new Error('Spot not found');
      setSpot(sp);
      nav.setOptions({ title: sp.name });
      // 'refresh' (pull-to-refresh button) bypasses cache.
      // 'entry' tightens the staleness window to 15 min — fresher than the
      // default 1 h TTL but still avoids a network call when the user
      // navigates back-and-forth quickly.
      const opts =
        mode === 'refresh'
          ? { force: true }
          : { maxAge: FRESH_ON_ENTRY_MS };
      const b = await getForecastForSpot(sp.latitude, sp.longitude, opts);
      setBundle(b);
    } catch (e) {
      // Partial fetch (e.g. airplane mode pull-to-refresh where some
      // providers serve from network cache and others 100% fail): keep
      // showing the cached bundle that came back as the fallback, and
      // tell the user we couldn't refresh. Only show the alert on
      // explicit refresh — silent on focus-effect 'entry' loads so the
      // user isn't bombarded by alerts when navigating around.
      if (e instanceof PartialFetchError) {
        if (e.fallbackBundle) {
          setBundle(e.fallbackBundle);
        }
        if (mode === 'refresh') {
          RNAlert.alert(s.errors.refreshFailedTitle, s.errors.refreshFailedBody);
        }
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [nav, spotId, s.errors.refreshFailedTitle, s.errors.refreshFailedBody]);

  // useFocusEffect (not useEffect) so we re-read the spot whenever the
  // screen regains focus — e.g. after returning from SpotForm where the
  // user may have changed the name, coordinates, or comment. The forecast
  // refetch underneath uses the cache (FRESH_ON_ENTRY_MS = 15 min), so
  // unchanged coords don't trigger a network call. Changed coords flow
  // naturally through the cache key and re-fetch.
  useFocusEffect(
    useCallback(() => {
      load('entry');
    }, [load]),
  );

  // Keep an Edit button in the header so the user can reach the spot form
  // (which is also where delete lives). useLayoutEffect avoids a one-frame
  // flash of the header without the button.
  useLayoutEffect(() => {
    if (!spot) return;
    nav.setOptions({
      title: spot.name,
      headerRight: () => (
        <Pressable
          onPress={() => nav.navigate('SpotForm', { spotId: spot.id })}
          hitSlop={8}
        >
          <Text style={styles.editBtn}>{s.common.edit}</Text>
        </Pressable>
      ),
    });
  }, [nav, spot, s.common.edit]);

  if (loading && !bundle) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loading}>{s.forecast.loading}</Text>
      </View>
    );
  }

  if (error && !bundle) {
    return <ErrorState message={`${s.forecast.error}\n${error}`} onRetry={() => load('refresh')} />;
  }

  if (!bundle || bundle.hours.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState message={s.forecast.empty} />
        <View style={styles.footer}>
          <PrimaryButton title={s.forecast.refresh} onPress={() => load('refresh')} />
        </View>
      </View>
    );
  }

  const missingSources: string[] = [];
  if (bundle.hours.every((h) => h.sourceStatus.ocean !== 'ok')) missingSources.push('hav');
  if (bundle.hours.every((h) => h.sourceStatus.tide !== 'ok')) missingSources.push('tidevann');

  // Find the bucket whose hour contains "now" — used to draw the
  // accent strip + Nå badge on that row. Recomputed each render; cheap.
  const nowMs = Date.now();
  const nowHourTimeUtc =
    bundle.hours.find((h) => {
      const startMs = Date.parse(h.timeUtc);
      return nowMs >= startMs && nowMs < startMs + 3600_000;
    })?.timeUtc;

  const cacheAgeMin = Math.max(
    0,
    Math.floor((nowMs - Date.parse(bundle.fetchedAtUtc)) / 60_000),
  );

  const Header = () => (
    <View style={styles.header}>
      {spot && (
        <Text style={styles.coord}>
          {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
        </Text>
      )}
      <Text style={styles.cached}>
        {s.forecast.cachedAt} {osloLabel(bundle.fetchedAtUtc)}{' '}
        <Text style={styles.cachedRel}>
          ({s.forecast.cachedRelative(cacheAgeMin)})
        </Text>
      </Text>
      {missingSources.length > 0 && (
        <Text style={styles.missing}>
          {s.forecast.sourceMissing} {missingSources.join(', ')}
        </Text>
      )}
    </View>
  );

  const Footer = () => (
    <View style={styles.attribution}>
      <Text style={styles.attrText}>{s.forecast.sources.weather}</Text>
      <Text style={styles.attrText}>{s.forecast.sources.ocean}</Text>
      <Text style={styles.attrText}>{s.forecast.sources.tide}</Text>
    </View>
  );

  const Toggle = () => (
    <View style={styles.toggleRow}>
      <Pressable
        onPress={() => setView('list')}
        style={[styles.toggle, view === 'list' ? styles.toggleActive : null]}
      >
        <Text style={view === 'list' ? styles.toggleTextActive : styles.toggleText}>
          {s.forecast.viewList}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setView('chart')}
        style={[styles.toggle, view === 'chart' ? styles.toggleActive : null]}
      >
        <Text style={view === 'chart' ? styles.toggleTextActive : styles.toggleText}>
          {s.forecast.viewChart}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <Toggle />
      {view === 'list' ? (
        <FlatList
          data={bundle.hours}
          keyExtractor={(h) => h.timeUtc}
          renderItem={({ item }) => (
            <ForecastRow hour={item} isNow={item.timeUtc === nowHourTimeUtc} />
          )}
          ListHeaderComponent={Header}
          ListFooterComponent={Footer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load('refresh')} />}
        />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load('refresh')} />}
        >
          <Header />
          <ForecastCharts hours={bundle.hours} />
          <Footer />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: 12, color: '#666' },
  header: { padding: 16 },
  coord: { fontSize: 13, color: '#666' },
  cached: { fontSize: 12, color: '#888', marginTop: 4 },
  cachedRel: { color: '#0E3A5F', fontWeight: '600' },
  missing: { fontSize: 12, color: '#A04040', marginTop: 4 },
  attribution: { padding: 16, borderTopWidth: 1, borderTopColor: '#EEE' },
  attrText: { fontSize: 11, color: '#888', marginBottom: 2 },
  footer: { padding: 16 },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
  },
  toggle: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CCD3DA',
  },
  toggleActive: { backgroundColor: '#0E3A5F', borderColor: '#0E3A5F' },
  toggleText: { color: '#0E3A5F', fontSize: 13, fontWeight: '500' },
  toggleTextActive: { color: '#fff', fontSize: 13, fontWeight: '600' },
  editBtn: { color: '#0E3A5F', fontWeight: '600', paddingHorizontal: 8 },
});
