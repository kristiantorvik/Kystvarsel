export type RainMode = 'any' | 'no_rain' | 'max_precipitation';
export type TideDirectionFilter = 'any' | 'rising' | 'falling';

export interface AlertCriteria {
  rainMode?: RainMode;
  /** Used only when rainMode === 'max_precipitation'. */
  maxPrecipitationMm?: number;

  minWindSpeedMs?: number;
  maxWindSpeedMs?: number;

  minCurrentSpeedMs?: number;
  maxCurrentSpeedMs?: number;

  minSeaTemperatureC?: number;
  maxSeaTemperatureC?: number;

  minTideLevelCm?: number;
  maxTideLevelCm?: number;
  tideDirection?: TideDirectionFilter;

  minWaveHeightM?: number;
  maxWaveHeightM?: number;
}

export interface Alert {
  id: string;
  spotId: string;
  name: string;
  message: string;
  enabled: boolean;
  /** "HH:MM" in Europe/Oslo local time, inclusive. */
  timeOfDayStart: string;
  /** "HH:MM" in Europe/Oslo local time, exclusive. Overnight windows allowed (e.g. start=22:00 end=04:00). */
  timeOfDayEnd: string;
  criteria: AlertCriteria;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
  lastTriggeredWindowHash?: string;
}

export interface Spot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}
