import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HourlyForecast } from '../domain/forecastTypes';
import { fmtCompass, fmtNum } from '../utils/format';
import { osloLabel } from '../utils/time';
import { strings } from '../i18n';
import { WeatherIcon } from './WeatherIcon';

interface Props {
  hour: HourlyForecast;
  matchesAlert?: boolean;
  failedReasons?: string[];
  /**
   * True when this row's hour bucket contains "now" — used to draw the
   * blue accent strip so the user can find the current hour at a glance.
   * Set by the screen, not by ForecastRow itself, so the same component
   * is reusable inside an alert detail view (which has no "now" semantics).
   */
  isNow?: boolean;
}

export function ForecastRow({ hour, matchesAlert, failedReasons, isNow }: Props) {
  const s = strings();
  const tideArrow =
    hour.tideDirection === 'rising' ? '↑' :
    hour.tideDirection === 'falling' ? '↓' : '·';

  return (
    <View
      style={[
        styles.card,
        matchesAlert ? styles.match : null,
        // The "now" highlight is intentionally a left accent strip rather
        // than a full background tint — it stays visible even when a row
        // also matches an alert (which already paints the background green).
        isNow ? styles.now : null,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.timeWrap}>
          {isNow && <Text style={styles.nowBadge}>{s.forecast.now}</Text>}
          <Text style={styles.time}>{osloLabel(hour.timeUtc)}</Text>
        </View>
        <WeatherIcon code={hour.weatherSymbol} size={32} />
        {matchesAlert && <Text style={styles.matchBadge}>{s.forecast.matchesAlert}</Text>}
      </View>

      <View style={styles.grid}>
        <Cell label={s.forecast.columns.airTemp} value={`${fmtNum(hour.airTemperatureC, 1)}${s.forecast.units.degC}`} />
        <Cell
          label={s.forecast.columns.wind}
          value={`${fmtNum(hour.windSpeedMs, 1)} ${s.forecast.units.ms}`}
          sub={fmtCompass(hour.windDirectionDeg)}
        />
        <Cell label={s.forecast.columns.precipitation} value={`${fmtNum(hour.precipitationMm, 1)} ${s.forecast.units.mm}`} />
        <Cell label={s.forecast.columns.seaTemp} value={`${fmtNum(hour.seaWaterTemperatureC, 1)}${s.forecast.units.degC}`} />
        <Cell
          label={s.forecast.columns.wave}
          value={`${fmtNum(hour.waveHeightM, 1)} ${s.forecast.units.m}`}
          sub={fmtCompass(hour.waveDirectionDeg)}
        />
        <Cell
          label={s.forecast.columns.current}
          value={`${fmtNum(hour.currentSpeedMs, 2)} ${s.forecast.units.ms}`}
          sub={fmtCompass(hour.currentDirectionDeg)}
        />
        <Cell
          label={s.forecast.columns.tide}
          value={`${fmtNum(hour.tideLevelCm, 0)} ${s.forecast.units.cm} ${tideArrow}`}
          sub={tideLabel(hour.tideDirection)}
        />
      </View>

      {failedReasons && failedReasons.length > 0 && (
        <Text style={styles.reasons}>{failedReasons.map((r) => reasonLabel(r)).join(' · ')}</Text>
      )}
    </View>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
      {sub && <Text style={styles.cellSub}>{sub}</Text>}
    </View>
  );
}

function tideLabel(d: HourlyForecast['tideDirection']): string {
  const s = strings();
  if (d === 'rising') return s.forecast.tideRising;
  if (d === 'falling') return s.forecast.tideFalling;
  return s.forecast.tideUnknown;
}

function reasonLabel(reason: string): string {
  const s = strings();
  return (s.reasons as Record<string, string>)[reason] ?? reason;
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    marginVertical: 4,
    marginHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F4F6F8',
  },
  match: {
    backgroundColor: '#DCF1DE',
    borderColor: '#2E7D32',
    borderWidth: 1,
  },
  now: {
    borderLeftWidth: 4,
    borderLeftColor: '#0E3A5F',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 14, fontWeight: '600', color: '#0E3A5F' },
  nowBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#0E3A5F',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  symbol: { fontSize: 12, color: '#666' },
  matchBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#2E7D32',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33%', paddingVertical: 4 },
  cellLabel: { fontSize: 11, color: '#666' },
  cellValue: { fontSize: 14, fontWeight: '500' },
  cellSub: { fontSize: 11, color: '#888' },
  reasons: { fontSize: 11, color: '#A04040', marginTop: 6 },
});
