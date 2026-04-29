export type SourceStatus = 'ok' | 'missing' | 'error';

export interface HourlyForecast {
  /** ISO 8601 in UTC, e.g. "2026-04-27T14:00:00Z" — used as the merge key. */
  timeUtc: string;
  /** Pre-formatted Europe/Oslo local time, e.g. "2026-04-27T16:00" (no zone suffix). */
  timeLocal: string;

  airTemperatureC?: number;
  windSpeedMs?: number;
  /** Direction the wind comes FROM, in degrees. */
  windDirectionDeg?: number;
  precipitationMm?: number;
  /** MET Norway symbol_code, e.g. "partlycloudy_day". */
  weatherSymbol?: string;

  seaWaterTemperatureC?: number;
  waveHeightM?: number;
  /** Direction waves come FROM, in degrees. */
  waveDirectionDeg?: number;
  currentSpeedMs?: number;
  /** Direction current flows TO, in degrees. */
  currentDirectionDeg?: number;

  /** Tide level relative to chart datum (CD), in cm. */
  tideLevelCm?: number;
  tideDirection?: 'rising' | 'falling' | 'unknown';

  sourceStatus: {
    weather?: SourceStatus;
    ocean?: SourceStatus;
    tide?: SourceStatus;
  };
}

export interface RawWeatherEntry {
  air_temp_c?: number | null;
  wind_speed_ms?: number | null;
  wind_from_deg?: number | null;
  humidity_pct?: number | null;
  pressure_hpa?: number | null;
  cloud_pct?: number | null;
  precip_mm_1h?: number | null;
  symbol?: string | null;
}

export interface RawOceanEntry {
  sst_c?: number | null;
  wave_height_m?: number | null;
  wave_from_deg?: number | null;
  current_speed_ms?: number | null;
  current_to_deg?: number | null;
}

export interface RawTideEntry {
  water_level_cm?: number | null;
}

export interface ForecastBundle {
  fetchedAtUtc: string;
  hours: HourlyForecast[];
  attribution: {
    weather: string;
    ocean: string;
    tide: string;
  };
}
