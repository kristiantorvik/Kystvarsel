import type { RawTideEntry } from '../domain/forecastTypes';

const ENDPOINT = 'https://vannstand.kartverket.no/tideapi.php';

export interface TideStation {
  name: string | null;
  code: string | null;
  lat: number | null;
  lon: number | null;
}

export interface TideResult {
  station: TideStation;
  series: Record<string, RawTideEntry>;
}

/**
 * Fetch tidal water-level series from Kartverket "Se havnivå".
 *
 * Note on datatype: the Python reference uses datatype=TAB which (as the API
 * behaves now) returns only the high/low extremes — sparse and unhelpful for
 * hourly merging. We use datatype=pre to get predicted hourly samples on
 * exact hour boundaries (flag="pre" in the response).
 *
 * Parses the XML with regex rather than a generic XML library — Kartverket's
 * schema is small and stable, attribute-only, and the regex is more tolerant
 * of minor format drift (whitespace, self-closing vs not, attribute ordering).
 *
 * The API ignores dst=0 and responds in CET (+01:00). canonicalUtcHour in
 * normalizeForecast handles the offset via Date.parse so merge keys still
 * align with the UTC-Z timestamps from MET.
 */
const ATTR_RE = /(\w+)="([^"]*)"/g;
const WATERLEVEL_RE = /<waterlevel\b([^>]*?)\/?>/gi;
const LOCATION_RE = /<location\b([^>]*?)\/?>/i;

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  // RegExp with /g flag has stateful lastIndex — reset per call.
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(s)) !== null) out[m[1]] = m[2];
  return out;
}

export async function fetchTides(
  lat: number,
  lon: number,
  days: number,
  signal?: AbortSignal,
): Promise<TideResult> {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const fromtime = formatNaive(now);
  const totime = formatNaive(new Date(now.getTime() + days * 24 * 3600_000));

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    fromtime,
    totime,
    datatype: 'pre',
    refcode: 'CD',
    lang: 'en',
    interval: '60',
    dst: '0',
    tide_request: 'locationdata',
  });

  const url = `${ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Kartverket HTTP ${res.status}`);
  const text = await res.text();

  const locMatch = LOCATION_RE.exec(text);
  let station: TideStation = { name: null, code: null, lat: null, lon: null };
  if (locMatch) {
    const a = parseAttrs(locMatch[1]);
    station = {
      name: a.name ?? null,
      code: a.code ?? null,
      lat: a.latitude ? parseFloat(a.latitude) : null,
      lon: a.longitude ? parseFloat(a.longitude) : null,
    };
  }

  const series: Record<string, RawTideEntry> = {};
  WATERLEVEL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WATERLEVEL_RE.exec(text)) !== null) {
    const a = parseAttrs(m[1]);
    if (!a.time || a.value == null) continue;
    const v = parseFloat(a.value);
    if (isNaN(v)) continue;
    let t = a.time.trim();
    if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) t = t + 'Z';
    series[t] = { water_level_cm: v };
  }

  if (Object.keys(series).length === 0) {
    // Surface a diagnostic so we can see what came back instead of silently
    // showing "no tide data". Visible in Metro/`npx expo start` console.
    console.warn(
      '[kystvarsel] Kartverket returned no <waterlevel> entries.',
      `url=${url}`,
      `status=${res.status}`,
      `bodyLen=${text.length}`,
      `preview=${text.slice(0, 400).replace(/\s+/g, ' ')}`,
    );
  }

  return { station, series };
}

function formatNaive(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}
