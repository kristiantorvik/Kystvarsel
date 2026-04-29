import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spotsRepository } from '../data/spotsRepository';
import { getForecastForSpot } from '../api/forecastService';
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

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const sp = await spotsRepository.get(spotId);
      if (!sp) throw new Error('Spot not found');
      setSpot(sp);
      nav.setOptions({ title: sp.name });
      const b = await getForecastForSpot(sp.latitude, sp.longitude, { force });
      setBundle(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [nav, spotId]);

  useEffect(() => {
    load(false);
  }, [load]);

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
    return <ErrorState message={`${s.forecast.error}\n${error}`} onRetry={() => load(true)} />;
  }

  if (!bundle || bundle.hours.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState message={s.forecast.empty} />
        <View style={styles.footer}>
          <PrimaryButton title={s.forecast.refresh} onPress={() => load(true)} />
        </View>
      </View>
    );
  }

  const missingSources: string[] = [];
  if (bundle.hours.every((h) => h.sourceStatus.ocean !== 'ok')) missingSources.push('hav');
  if (bundle.hours.every((h) => h.sourceStatus.tide !== 'ok')) missingSources.push('tidevann');

  const Header = () => (
    <View style={styles.header}>
      {spot && (
        <Text style={styles.coord}>
          {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
        </Text>
      )}
      <Text style={styles.cached}>
        {s.forecast.cachedAt} {osloLabel(bundle.fetchedAtUtc)}
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
          renderItem={({ item }) => <ForecastRow hour={item} />}
          ListHeaderComponent={Header}
          ListFooterComponent={Footer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(true)} />}
        />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(true)} />}
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
