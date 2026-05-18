import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { layersRepository } from '../data/layersRepository';
import type { MapLayer, Splat } from '../domain/layerTypes';
import { paletteHex } from '../domain/palette';
import {
  MapWebView,
  type EraseBatch,
  type PaintBatch,
} from '../components/maps/MapWebView';
import type { LeafletLayer, PaintLayerData, PaintTool } from '../components/maps/leafletHtml';
import { rememberedMapState } from '../components/maps/mapState';
import { useShowCrosshair } from '../hooks/useShowCrosshair';
import { ErrorState } from '../components/ErrorState';
import { strings } from '../i18n';
import type { SpotsStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<SpotsStackParamList, 'MapPaint'>;
type Rt = RouteProp<SpotsStackParamList, 'MapPaint'>;

/** Layer-level alpha for painted regions when rendered on the map. */
const LAYER_OPACITY = 0.4;
/** Brush size as a fraction of min(screenWidth, screenHeight). */
const BRUSH_FRACTION = 0.056; // 25% smaller than the original 0.075 after device testing.
// Above is RADIUS, so brush diameter ~11% of min screen dimension. Tweak here
// if the brush feels too small / too big in real-world use.

interface LayerWithSplats {
  layer: MapLayer;
  splats: Splat[];
}

/**
 * The last paint or erase action, kept around so the user can undo it.
 * Only the most recent action is undoable — multi-step undo / redo is out
 * of scope for v0.1.0 (see ROADMAP).
 *
 *   paint: we know the IDs of the rows we inserted; undo deletes those.
 *   erase: we know the rows we deleted (so undo can re-insert them) AND
 *     the IDs of any subdivision-replacement rows we inserted (so undo
 *     can delete those).
 */
type UndoAction =
  | { kind: 'paint'; insertedIds: number[] }
  | {
      kind: 'erase';
      removed: Array<{ lat: number; lon: number; radiusM: number }>;
      insertedIds: number[];
    };

/**
 * Full-screen painting screen for one map layer.
 *
 * Lifecycle:
 *   1. Load the editing layer + all visible layers (so other paintwork is
 *      shown for context, but greyed-in / read-only).
 *   2. Pass them to the WebView with `mode: 'paint'`. Our layer is marked
 *      `editingLayerId`; the WebView always renders it even if hidden.
 *   3. Touch events in the WebView produce paintBatch / eraseBatch messages.
 *      RN persists, then re-reads the editing layer's splats and pushes them
 *      back to the WebView. This keeps RN authoritative without stalling the
 *      drag visual.
 */
export function MapPaintScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const s = strings();
  const { layerId } = route.params;
  const { width, height } = useWindowDimensions();
  const showCrosshair = useShowCrosshair();

  const [editing, setEditing] = useState<LayerWithSplats | null>(null);
  const [otherLayers, setOtherLayers] = useState<LayerWithSplats[]>([]);
  const [tool, setTool] = useState<PaintTool>('navigate');
  const [error, setError] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);

  /**
   * Strict serialisation of all DB writes. Prevents back-to-back strokes
   * from issuing concurrent transactions on the single SQLite connection,
   * which previously surfaced as "cannot rollback - no transaction is
   * active" when the second BEGIN raced an in-flight COMMIT.
   */
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueWrite = useCallback((fn: () => Promise<void>): void => {
    writeQueueRef.current = writeQueueRef.current
      .catch(() => {}) // swallow prior errors so the queue keeps moving
      .then(fn);
  }, []);

  const loadAll = useCallback(async () => {
    const all = await layersRepository.list();
    const ed = all.find((l) => l.id === layerId);
    if (!ed) {
      setError('Layer not found');
      return;
    }
    // One SELECT for everything we need to render — editing layer + all
    // visible others, no N+1.
    const others = all.filter((l) => l.id !== ed.id && l.visible);
    const ids = [ed.id, ...others.map((l) => l.id)];
    const splatsByLayer = await layersRepository.listSplatsForLayers(ids);
    setEditing({ layer: ed, splats: splatsByLayer.get(ed.id) ?? [] });
    setOtherLayers(
      others.map((l) => ({ layer: l, splats: splatsByLayer.get(l.id) ?? [] })),
    );
  }, [layerId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    nav.setOptions({ title: editing?.layer.name ?? s.layers.paintTitle });
  }, [editing, nav, s.layers.paintTitle]);

  // Note: there's no per-stroke `reloadEditing` anymore. Local state is
  // updated from each write's diff (see onPaintBatch / onEraseBatch below)
  // so the screen never needs to re-read the whole layer on the hot path.
  // The initial mount-time `loadAll` is the only DB read for splats.

  /**
   * Apply a paint stroke locally instead of re-reading the whole layer from
   * the DB after every commit. The screen's editing state is treated as
   * authoritative for the active session — the DB is updated as a side
   * effect, but its read-back isn't on the critical path. This is the
   * single biggest perf win for long strokes / heavy layers.
   */
  const onPaintBatch = useCallback(
    (batch: PaintBatch) => {
      enqueueWrite(async () => {
        try {
          const insertedIds = await layersRepository.addSplats(
            batch.layerId,
            batch.splats,
          );
          // Construct full Splat records from the input + new IDs; append.
          const newSplats: Splat[] = batch.splats.map((s, i) => ({
            id: insertedIds[i],
            layerId: batch.layerId,
            lat: s.lat,
            lon: s.lon,
            radiusM: s.radiusM,
          }));
          setEditing((prev) =>
            prev ? { ...prev, splats: [...prev.splats, ...newSplats] } : prev,
          );
          setUndoAction({ kind: 'paint', insertedIds });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    },
    [enqueueWrite],
  );

  const onEraseBatch = useCallback(
    (batch: EraseBatch) => {
      enqueueWrite(async () => {
        try {
          const result = await layersRepository.eraseBatch(
            batch.layerId,
            batch.erasers,
          );
          if (result.deletedCount === 0 && result.insertedSplats.length === 0) {
            return; // stroke didn't touch anything
          }
          // Apply the diff locally: drop removed by id, append inserted.
          const removedIds = new Set(result.removedSplats.map((s) => s.id));
          setEditing((prev) =>
            prev
              ? {
                  ...prev,
                  splats: prev.splats
                    .filter((s) => !removedIds.has(s.id))
                    .concat(result.insertedSplats),
                }
              : prev,
          );
          setUndoAction({
            kind: 'erase',
            removed: result.removedSplats.map((s) => ({
              lat: s.lat,
              lon: s.lon,
              radiusM: s.radiusM,
            })),
            insertedIds: result.insertedSplats.map((s) => s.id),
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    },
    [enqueueWrite],
  );

  const onUndo = useCallback(() => {
    if (!undoAction) return;
    const action = undoAction;
    // Clear immediately so a double-tap doesn't apply twice.
    setUndoAction(null);
    enqueueWrite(async () => {
      try {
        if (action.kind === 'paint') {
          await layersRepository.removeSplatsByIds(layerId, action.insertedIds);
          // Drop the inserted IDs from local state.
          const removed = new Set(action.insertedIds);
          setEditing((prev) =>
            prev
              ? { ...prev, splats: prev.splats.filter((s) => !removed.has(s.id)) }
              : prev,
          );
        } else {
          // Erase undo: re-insert what we removed, drop what we inserted.
          // Re-inserting gets new IDs (the originals are gone) — undo doesn't
          // need to preserve the same row IDs to be visually correct.
          let reAddedIds: number[] = [];
          if (action.removed.length > 0) {
            reAddedIds = await layersRepository.addSplats(layerId, action.removed);
          }
          if (action.insertedIds.length > 0) {
            await layersRepository.removeSplatsByIds(layerId, action.insertedIds);
          }
          const droppedIds = new Set(action.insertedIds);
          const reAdded: Splat[] = action.removed.map((s, i) => ({
            id: reAddedIds[i],
            layerId,
            lat: s.lat,
            lon: s.lon,
            radiusM: s.radiusM,
          }));
          setEditing((prev) =>
            prev
              ? {
                  ...prev,
                  splats: prev.splats
                    .filter((s) => !droppedIds.has(s.id))
                    .concat(reAdded),
                }
              : prev,
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }, [enqueueWrite, layerId, undoAction]);

  const layersForMap: PaintLayerData[] = useMemo(() => {
    if (!editing) return [];
    const others = otherLayers.map<PaintLayerData>((l) => ({
      id: l.layer.id,
      colorHex: paletteHex(l.layer.colorId),
      visible: l.layer.visible,
      opacity: LAYER_OPACITY,
      splats: l.splats.map((sp) => ({ lat: sp.lat, lon: sp.lon, radiusM: sp.radiusM })),
    }));
    const ed: PaintLayerData = {
      id: editing.layer.id,
      colorHex: paletteHex(editing.layer.colorId),
      visible: editing.layer.visible,
      opacity: LAYER_OPACITY,
      splats: editing.splats.map((sp) => ({ lat: sp.lat, lon: sp.lon, radiusM: sp.radiusM })),
    };
    return [...others, ed]; // editing layer last → drawn on top
  }, [editing, otherLayers]);

  // Initial map state: prefer wherever the user was last looking on any other
  // map screen (so opening edit mode keeps the current view). Fall back to
  // the editing layer's splat centroid, then to Norway-wide.
  const initial = useMemo(() => {
    const remembered = rememberedMapState.get();
    if (remembered.lat != null && remembered.lon != null && remembered.zoom != null) {
      return {
        lat: remembered.lat,
        lon: remembered.lon,
        zoom: remembered.zoom,
        layer: remembered.layer,
      };
    }
    const all = layersForMap.flatMap((l) => l.splats);
    if (all.length === 0) {
      return {
        lat: undefined as number | undefined,
        lon: undefined as number | undefined,
        zoom: 6,
        layer: remembered.layer,
      };
    }
    let sumLat = 0;
    let sumLon = 0;
    for (const sp of all) {
      sumLat += sp.lat;
      sumLon += sp.lon;
    }
    return {
      lat: sumLat / all.length,
      lon: sumLon / all.length,
      zoom: 13,
      layer: remembered.layer,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing != null]); // recompute only when editing first loads

  const brushScreenPx = Math.round(BRUSH_FRACTION * Math.min(width, height));

  if (error) {
    return <ErrorState message={error} onRetry={loadAll} />;
  }
  if (!editing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const hint =
    tool === 'navigate'
      ? s.layers.paintHintNavigate
      : tool === 'paint'
      ? s.layers.paintHintPaint
      : s.layers.paintHintErase;

  return (
    <View style={styles.container}>
      <MapWebView
        mode="paint"
        defaultLayer={(initial.layer as LeafletLayer | undefined) ?? 'topo'}
        initialLat={initial.lat}
        initialLon={initial.lon}
        initialZoom={initial.zoom}
        layers={layersForMap}
        editingLayerId={editing.layer.id}
        tool={tool}
        brushScreenPx={brushScreenPx}
        showCrosshair={showCrosshair}
        onPaintBatch={onPaintBatch}
        onEraseBatch={onEraseBatch}
      />

      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>{hint}</Text>
      </View>

      <View style={styles.toolbar}>
        <ToolButton
          label={s.layers.toolNavigate}
          active={tool === 'navigate'}
          onPress={() => setTool('navigate')}
        />
        <ToolButton
          label={s.layers.toolPaint}
          active={tool === 'paint'}
          onPress={() => setTool('paint')}
          accent={paletteHex(editing.layer.colorId)}
        />
        <ToolButton
          label={s.layers.toolErase}
          active={tool === 'erase'}
          onPress={() => setTool('erase')}
        />
        <Pressable
          onPress={onUndo}
          disabled={!undoAction}
          style={[styles.undoButton, !undoAction && styles.undoButtonDisabled]}
        >
          <Text
            style={[styles.undoText, !undoAction && styles.undoTextDisabled]}
          >
            ↶ {s.layers.toolUndo}
          </Text>
        </Pressable>
        <View style={styles.toolbarSpacer} />
        <Pressable onPress={() => nav.goBack()} style={styles.doneButton}>
          <Text style={styles.doneText}>{s.layers.toolDone}</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface ToolButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
  accent?: string;
}
function ToolButton({ label, active, onPress, accent }: ToolButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.toolButton,
        active ? styles.toolButtonActive : null,
        active && accent ? { backgroundColor: accent, borderColor: accent } : null,
      ]}
    >
      <Text style={[styles.toolButtonText, active ? styles.toolButtonTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8ECF0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 110, // leave room for the layer-toggle stack on the right
    pointerEvents: 'none',
  },
  hintText: {
    fontSize: 12,
    color: '#0E3A5F',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
  toolbar: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  toolbarSpacer: { flex: 1 },
  toolButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CCD3DA',
  },
  toolButtonActive: { backgroundColor: '#0E3A5F', borderColor: '#0E3A5F' },
  toolButtonText: { color: '#0E3A5F', fontSize: 13, fontWeight: '500' },
  toolButtonTextActive: { color: '#fff', fontWeight: '600' },
  undoButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CCD3DA',
    backgroundColor: '#fff',
  },
  undoButtonDisabled: { opacity: 0.4 },
  undoText: { color: '#0E3A5F', fontSize: 13, fontWeight: '500' },
  undoTextDisabled: { color: '#999' },
  doneButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#DCF1DE',
    borderWidth: 1,
    borderColor: '#2E7D32',
  },
  doneText: { color: '#1B5C20', fontSize: 13, fontWeight: '600' },
});
