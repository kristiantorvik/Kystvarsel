/**
 * Great-circle distance between two points on Earth in meters, using the
 * haversine formula. Accurate enough for splat-erase distance checks (<1 m
 * error at typical brush radii) without dragging in a heavy geometry lib.
 */
const EARTH_RADIUS_M = 6371008.8;
const METERS_PER_LAT_DEG = 111_320;

export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const a =
    sinDLat * sinDLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface CircleSplat {
  lat: number;
  lon: number;
  radiusM: number;
}

/**
 * Hex-tile a disc with smaller discs of radius `childRadiusM`. Hex spacing
 * is 70% of childRadiusM — adjacent splats overlap by ~65% (linearly),
 * which makes the boundary scallops between leaves about 7% of leaf
 * radius. With spacing = childR (50% overlap) the scallops are visibly
 * bumpy at high zoom; at 0.7× they smooth into a continuous edge.
 *
 * The cost is ~50% more splats per parent, absorbed by the bulk INSERT
 * speedup in {@link bulkInsertSplats}.
 */
const HEX_SPACING_FRACTION = 0.7;

function hexTileInDisc(parent: CircleSplat, childRadiusM: number): CircleSplat[] {
  const result: CircleSplat[] = [];
  const spacing = childRadiusM * HEX_SPACING_FRACTION;
  const dLatDeg = spacing / METERS_PER_LAT_DEG;
  const dLonDeg =
    spacing /
    (METERS_PER_LAT_DEG * Math.max(0.05, Math.cos((parent.lat * Math.PI) / 180)));
  const rowOffsetDeg = dLatDeg * Math.sin(Math.PI / 3);

  const rows = Math.ceil(parent.radiusM / spacing) + 1;
  for (let r = -rows; r <= rows; r++) {
    const lat = parent.lat + r * rowOffsetDeg;
    const colShift = r % 2 === 0 ? 0 : 0.5;
    for (let c = -rows - 1; c <= rows + 1; c++) {
      const lon = parent.lon + (c + colShift) * dLonDeg;
      if (haversineDistanceM(lat, lon, parent.lat, parent.lon) > parent.radiusM) continue;
      result.push({ lat, lon, radiusM: childRadiusM });
    }
  }
  return result;
}

export interface SubdivideOptions {
  /** Stop subdividing when child radius reaches this. Defaults to eraser radius. */
  targetRadiusM?: number;
  /** Safety cap on output length per call. Default 800. */
  maxResults?: number;
}

/**
 * Recursively subdivide `source` around an eraser disc, replacing the
 * original splat with a pyramid of smaller splats: coarse far from the
 * eraser, fine near the cut.
 *
 * Algorithm at each level:
 *   - splat center inside eraser → drop (≥50% inside, treat as erased)
 *   - splat fully outside eraser → keep at this resolution (no subdivision)
 *   - splat at target granularity → keep (boundary splat — its center is
 *     outside the eraser, slight protrusion into the cut is acceptable)
 *   - otherwise → hex-tile into half-radius children, recurse on each
 *
 * Why recursive vs. flat tiling: the cut boundary needs many small splats
 * for a smooth edge, but the splat's interior far from the cut just needs
 * coverage — one big splat there is enough. Recursion gives boundary
 * detail and interior efficiency in one pass. Total splat count typically
 * lands well below a flat hex tiling at the boundary spacing.
 */
export function subdivideAroundEraser(
  source: CircleSplat,
  eraserLat: number,
  eraserLon: number,
  eraserRadiusM: number,
  options: SubdivideOptions = {},
): CircleSplat[] {
  const targetR = options.targetRadiusM ?? eraserRadiusM;
  const maxResults = options.maxResults ?? 800;
  const out: CircleSplat[] = [];

  function recurse(s: CircleSplat): void {
    if (out.length >= maxResults) return;
    const d = haversineDistanceM(s.lat, s.lon, eraserLat, eraserLon);

    // Center inside eraser → drop entirely.
    if (d <= eraserRadiusM) return;

    // Entire disc outside eraser → keep at this resolution.
    if (d >= eraserRadiusM + s.radiusM) {
      out.push(s);
      return;
    }

    // At target granularity → boundary splat, keep with slight protrusion.
    // The 1.5× tolerance avoids a final layer of splats only marginally
    // bigger than target, which would just be redundant work.
    if (s.radiusM <= targetR * 1.5) {
      out.push(s);
      return;
    }

    // Subdivide and recurse, clamping each child against the original
    // source disc so subdivision never extends paint past where the user
    // originally drew. Without this, level-1 children near the source
    // edge spill outward, and their descendants compound the spill.
    const childR = Math.max(targetR, s.radiusM / 2);
    const children = hexTileInDisc(s, childR);
    for (const candidate of children) {
      if (out.length >= maxResults) return;
      const dFromSource = haversineDistanceM(
        candidate.lat,
        candidate.lon,
        source.lat,
        source.lon,
      );
      if (dFromSource > source.radiusM) continue; // center outside source → skip
      // Shrink the disc so it fits inside the source boundary.
      const maxRadiusInSource = source.radiusM - dFromSource;
      if (maxRadiusInSource < 0.5) continue; // would be a sub-half-meter sliver; skip
      const child: CircleSplat =
        candidate.radiusM > maxRadiusInSource
          ? { lat: candidate.lat, lon: candidate.lon, radiusM: maxRadiusInSource }
          : candidate;
      recurse(child);
    }
  }

  if (source.radiusM > 0 && eraserRadiusM > 0) recurse(source);
  return out;
}
