import type { LeafletLayer } from './leafletHtml';

/**
 * Module-level cache of the user's last map state — center, zoom, and
 * active basemap. Updated whenever any `MapWebView` posts a `mapState`
 * event (panend / zoomend / layer toggle). Read by every screen that
 * mounts a fresh `MapWebView` so the user's view follows them across
 * navigation: pan to a spot in the spots Kart, open Lag → "Rediger på
 * kart", and the paint screen opens at the same place.
 *
 * Deliberately a plain in-memory module — no persistence. App relaunch
 * goes back to the saved-spot centroid (or Norway-wide for empty state).
 */
export interface RememberedMapState {
  lat?: number;
  lon?: number;
  zoom?: number;
  layer?: LeafletLayer;
}

let cached: RememberedMapState = {};

export const rememberedMapState = {
  get(): RememberedMapState {
    return cached;
  },
  update(patch: Partial<RememberedMapState>): void {
    cached = { ...cached, ...patch };
  },
  /** Test/dev hook — wipe everything. Not used by app code. */
  reset(): void {
    cached = {};
  },
};
