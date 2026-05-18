import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert as RNAlert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { spotsRepository } from '../data/spotsRepository';
import { buildSpotMarkers, type SpotMarker } from '../data/spotStatus';
import { layersRepository } from '../data/layersRepository';
import { tagsRepository } from '../data/tagsRepository';
import type { Spot } from '../domain/alertTypes';
import type { MapLayer } from '../domain/layerTypes';
import type { TagWithCount } from '../domain/tagTypes';
import { paletteHex } from '../domain/palette';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { MapWebView } from '../components/maps/MapWebView';
import type { LeafletLayer, PaintLayerData } from '../components/maps/leafletHtml';
import { rememberedMapState } from '../components/maps/mapState';
import {
  rememberedSpotFilter,
  applySpotFilter,
  type SpotFilterState,
} from '../components/spotFilterState';
import { TagChipRow, type TagChipItem } from '../components/TagChipRow';
import { useShowCrosshair } from '../hooks/useShowCrosshair';
import { runAlertCheck } from '../notifications/backgroundCheck';
import { fmtCoord } from '../utils/format';
import { strings } from '../i18n';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'SpotsList'>;
type ViewMode = 'list' | 'map' | 'tags' | 'layers';

interface LayerRowState extends MapLayer {
  splatCount: number;
}

export function SpotsListScreen() {
  const nav = useNavigation<Nav>();
  const s = strings();
  const showCrosshair = useShowCrosshair();

  const [spots, setSpots] = useState<Spot[]>([]);
  const [markers, setMarkers] = useState<SpotMarker[]>([]);
  const [paintLayers, setPaintLayers] = useState<PaintLayerData[]>([]);
  const [layerRows, setLayerRows] = useState<LayerRowState[]>([]);
  const [tagRows, setTagRows] = useState<TagWithCount[]>([]);
  // spotId → tagIds, used both to render per-row chips and to apply the
  // active filter. One bulk SELECT instead of N+1.
  const [tagIdsBySpot, setTagIdsBySpot] = useState<Map<string, string[]>>(new Map());

  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<ViewMode>('list');
  const [checking, setChecking] = useState(false);

  // Filter state — sourced from the module singleton on mount so the user's
  // chip selection survives navigation away and back. Local copy keeps
  // re-renders cheap; we push back to the singleton on every change.
  const [filter, setFilter] = useState<SpotFilterState>(() => rememberedSpotFilter.get());

  const updateFilter = useCallback((next: SpotFilterState) => {
    setFilter(next);
    rememberedSpotFilter.set(next);
  }, []);

  const reload = useCallback(async () => {
    const [rows, mrk, allLayers, allTags] = await Promise.all([
      spotsRepository.list(),
      buildSpotMarkers(),
      layersRepository.list(),
      tagsRepository.listWithCounts(),
    ]);
    setSpots(rows);
    setMarkers(mrk);
    setTagRows(allTags);

    // Hidden layers are still passed so the WebView's layer registry stays
    // consistent across visibility toggles — render is gated on `visible`.
    // Splats fetched in a single SELECT (was N+1 before).
    const splatsByLayer = await layersRepository.listSplatsForLayers(
      allLayers.map((l) => l.id),
    );
    const layerData: PaintLayerData[] = allLayers.map((l) => ({
      id: l.id,
      colorHex: paletteHex(l.colorId),
      visible: l.visible,
      splats: (splatsByLayer.get(l.id) ?? []).map((sp) => ({
        lat: sp.lat,
        lon: sp.lon,
        radiusM: sp.radiusM,
      })),
    }));
    setPaintLayers(layerData);

    // Splat counts for the layer-management view rows. Same N+1 caveat as
    // splats — could be batched with a GROUP BY query if it ever bites.
    const layerRowsWithCounts: LayerRowState[] = await Promise.all(
      allLayers.map(async (l) => ({ ...l, splatCount: await layersRepository.countSplats(l.id) })),
    );
    setLayerRows(layerRowsWithCounts);

    // Bulk-load tag attachments for all spots in one query.
    const byId = await tagsRepository.listTagIdsForSpots(rows.map((r) => r.id));
    setTagIdsBySpot(byId);

    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      reload().catch(() => {
        if (active) setLoaded(true);
      });
      return () => {
        active = false;
      };
    }, [reload]),
  );

  const onCheckNow = async () => {
    setChecking(true);
    try {
      await runAlertCheck({ manual: true });
      await reload();
    } catch (e) {
      RNAlert.alert(s.errors.fetchFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  // Filtered slices used by both list and map views. Memoised so the
  // markers prop reference is stable when the underlying state hasn't
  // changed — keeps the WebView from re-injecting markers needlessly.
  const filteredSpots = useMemo(
    () => applySpotFilter(spots, tagIdsBySpot, filter),
    [spots, tagIdsBySpot, filter],
  );
  const filteredMarkers = useMemo(
    () => applySpotFilter(markers, tagIdsBySpot, filter),
    [markers, tagIdsBySpot, filter],
  );

  // Tag chip items for the filter row. Counts come from the unfiltered
  // tag list so users can see "fishing (12)" even while another filter is
  // narrowing the list.
  const tagChipItems = useMemo<TagChipItem[]>(
    () =>
      tagRows.map((t) => ({
        id: t.id,
        name: t.name,
        colorId: t.colorId,
        count: t.spotCount,
      })),
    [tagRows],
  );

  const toggleTagFilter = useCallback(
    (id: string) => {
      const next: SpotFilterState = {
        selectedTagIds: new Set(filter.selectedTagIds),
        untaggedOnly: filter.untaggedOnly,
      };
      if (next.selectedTagIds.has(id)) next.selectedTagIds.delete(id);
      else next.selectedTagIds.add(id);
      updateFilter(next);
    },
    [filter, updateFilter],
  );

  const toggleUntagged = useCallback(() => {
    updateFilter({
      selectedTagIds: filter.selectedTagIds,
      untaggedOnly: !filter.untaggedOnly,
    });
  }, [filter, updateFilter]);

  const clearFilter = useCallback(() => {
    updateFilter({ selectedTagIds: new Set(), untaggedOnly: false });
  }, [updateFilter]);

  const onToggleLayerVisible = async (layer: LayerRowState) => {
    setLayerRows((prev) =>
      prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l)),
    );
    await layersRepository.setVisible(layer.id, !layer.visible);
    // Also update the WebView-bound paintLayers so re-mounting the map
    // immediately reflects the new visibility.
    setPaintLayers((prev) =>
      prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l)),
    );
  };

  // ============================================================
  //  Sub-views
  // ============================================================

  const ToggleBar = () => (
    <View style={styles.toggleRow}>
      {(
        [
          { key: 'list' as const, label: s.spots.viewList },
          { key: 'map' as const, label: s.spots.viewMap },
          { key: 'tags' as const, label: s.spots.viewTags },
          { key: 'layers' as const, label: s.spots.viewLayers },
        ]
      ).map((opt) => {
        const active = view === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => setView(opt.key)}
            style={[styles.toggle, active ? styles.toggleActive : null]}
          >
            <Text style={active ? styles.toggleTextActive : styles.toggleText}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Filter chip row: only visible in list/map mode (it filters spots, so
  // it's irrelevant in tag/layer management).
  const showFilter = (view === 'list' || view === 'map') && tagChipItems.length > 0;

  // ----- LIST view body -----
  const renderListBody = () => {
    if (loaded && spots.length === 0) {
      return <EmptyState message={s.spots.empty} />;
    }
    if (loaded && filteredSpots.length === 0) {
      return <EmptyState message={s.spots.emptyFiltered} />;
    }
    return (
      <FlatList
        data={filteredSpots}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => {
          const tagIds = tagIdsBySpot.get(item.id) ?? [];
          const itemTagDots = tagIds
            .map((id) => tagRows.find((t) => t.id === id))
            .filter((t): t is TagWithCount => !!t);
          return (
            <Pressable
              onPress={() => nav.navigate('SpotForecast', { spotId: item.id })}
              style={styles.row}
            >
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.coords}>{fmtCoord(item.latitude, item.longitude)}</Text>
              {item.comment ? (
                <Text style={styles.comment} numberOfLines={2}>
                  {item.comment}
                </Text>
              ) : null}
              {itemTagDots.length > 0 && (
                <View style={styles.spotTagRow}>
                  {itemTagDots.map((t) => (
                    <View key={t.id} style={styles.spotTagChip}>
                      <View style={[styles.spotTagDot, { backgroundColor: paletteHex(t.colorId) }]} />
                      <Text style={styles.spotTagLabel}>{t.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
          );
        }}
      />
    );
  };

  // ----- MAP view body -----
  const renderMapBody = () => (
    <View style={styles.mapWrap}>
      <MapWebView
        mode="spots"
        defaultLayer={(rememberedMapState.get().layer as LeafletLayer | undefined) ?? 'topo'}
        initialLat={rememberedMapState.get().lat}
        initialLon={rememberedMapState.get().lon}
        initialZoom={rememberedMapState.get().zoom}
        spots={filteredMarkers}
        layers={paintLayers}
        showCrosshair={showCrosshair}
        legendLabels={{
          matching: s.spots.mapLegendMatching,
          alert: s.spots.mapLegendAlert,
          plain: s.spots.mapLegendPlain,
        }}
        onSpotTap={(id) => nav.navigate('SpotForecast', { spotId: id })}
      />
      <View style={styles.checkButtonWrap} pointerEvents="box-none">
        <PrimaryButton
          title={checking ? s.spots.mapCheckRunning : s.spots.mapCheckNow}
          onPress={onCheckNow}
          loading={checking}
          variant="secondary"
          style={styles.checkButton}
        />
      </View>
    </View>
  );

  // ----- TAGS management body -----
  const renderTagsBody = () => {
    if (loaded && tagRows.length === 0) {
      return <EmptyState message={s.tags.empty} />;
    }
    return (
      <FlatList
        data={tagRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.managementRow}
            onPress={() => nav.navigate('TagForm', { tagId: item.id })}
          >
            <View style={[styles.swatch, { backgroundColor: paletteHex(item.colorId) }]} />
            <View style={styles.managementBody}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{s.tags.spotCount(item.spotCount)}</Text>
            </View>
          </Pressable>
        )}
      />
    );
  };

  // ----- LAYERS management body -----
  const renderLayersBody = () => {
    if (loaded && layerRows.length === 0) {
      return <EmptyState message={s.layers.empty} />;
    }
    return (
      <FlatList
        data={layerRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.managementRow}
            onPress={() => nav.navigate('LayerForm', { layerId: item.id })}
          >
            <View style={[styles.swatch, { backgroundColor: paletteHex(item.colorId) }]} />
            <View style={styles.managementBody}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{s.layers.splatCount(item.splatCount)}</Text>
            </View>
            <Switch value={item.visible} onValueChange={() => onToggleLayerVisible(item)} />
          </Pressable>
        )}
      />
    );
  };

  // ----- footer (mode-aware "+") -----
  const footerAction = useMemo(() => {
    switch (view) {
      case 'list':
      case 'map':
        return { title: s.spots.add, onPress: () => nav.navigate('SpotForm', {}) };
      case 'tags':
        return { title: s.tags.add, onPress: () => nav.navigate('TagForm', {}) };
      case 'layers':
        return { title: s.layers.add, onPress: () => nav.navigate('LayerForm', {}) };
    }
  }, [view, nav, s.spots.add, s.tags.add, s.layers.add]);

  return (
    <View style={styles.container}>
      <ToggleBar />
      {showFilter && (
        <View style={styles.filterRow}>
          <TagChipRow
            tags={tagChipItems}
            selected={filter.selectedTagIds}
            onToggle={toggleTagFilter}
            onClear={clearFilter}
            untaggedSelected={filter.untaggedOnly}
            onToggleUntagged={toggleUntagged}
            clearLabel={s.spots.filterAll}
            untaggedLabel={s.spots.filterUntagged}
          />
        </View>
      )}

      {view === 'list' && renderListBody()}
      {view === 'map' && renderMapBody()}
      {view === 'tags' && renderTagsBody()}
      {view === 'layers' && renderLayersBody()}

      <View style={styles.footer}>
        <PrimaryButton title={footerAction.title} onPress={footerAction.onPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
  },
  toggle: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CCD3DA',
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: '#0E3A5F', borderColor: '#0E3A5F' },
  toggleText: { color: '#0E3A5F', fontSize: 12, fontWeight: '500' },
  toggleTextActive: { color: '#fff', fontSize: 12, fontWeight: '600' },

  filterRow: {
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
  },

  // Spot list rows
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
  },
  name: { fontSize: 16, fontWeight: '600' },
  coords: { fontSize: 12, color: '#666', marginTop: 2 },
  comment: { fontSize: 13, color: '#444', marginTop: 4 },
  spotTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  spotTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F4F6F8',
    gap: 5,
  },
  spotTagDot: { width: 7, height: 7, borderRadius: 3.5 },
  spotTagLabel: { fontSize: 11, color: '#0E3A5F', fontWeight: '500' },

  // Map view
  mapWrap: { flex: 1 },
  checkButtonWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    alignItems: 'flex-start',
  },
  checkButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },

  // Tag/layer management rows (shared visual)
  managementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomColor: '#EEE',
    borderBottomWidth: 1,
    gap: 12,
  },
  managementBody: { flex: 1 },
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
  meta: { fontSize: 12, color: '#666', marginTop: 2 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#EEE' },
});
