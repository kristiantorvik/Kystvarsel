import type { ColorId } from './palette';

/**
 * A user-defined painted overlay on the map. Stores its colour as an opaque
 * palette ID; the hex + label are looked up at render time from `palette.ts`.
 */
export interface MapLayer {
  id: string;
  name: string;
  colorId: ColorId;
  visible: boolean;
  /** z-order — lower draws first. No drag-to-reorder UI in v0.1.0. */
  position: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A circular geographic stamp that makes up a layer's painted region.
 * Painted at a particular zoom; the meter radius captures the size so the
 * splat renders correctly at any later zoom.
 */
export interface Splat {
  /** SQLite auto-increment row id. Not exported — id is reassigned on import. */
  id: number;
  layerId: string;
  lat: number;
  lon: number;
  radiusM: number;
}

/** Splat as it appears in the export JSON — no row id, no layerId. */
export interface SerializedSplat {
  lat: number;
  lon: number;
  radiusM: number;
}
