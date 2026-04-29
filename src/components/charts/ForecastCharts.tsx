import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { LineChart, type ChartSeries } from './LineChart';
import type { HourlyForecast } from '../../domain/forecastTypes';
import { strings } from '../../i18n';

type Scale = 24 | 48 | 72;

const CHART_HEIGHT_BASE = 160;
const CHART_HEIGHT_DIRECTIONAL = 178;
const HORIZONTAL_PADDING = 24;
const DEFAULT_SCALE: Scale = 48;

interface Props {
  hours: HourlyForecast[];
}

/**
 * Scrollable, scale-aware chart stack for an hourly forecast.
 *
 * - Scale buttons (1 / 2 / 3 dager) control how many hours fit in the visible
 *   viewport. The full forecast (~72h) extends beyond the viewport when the
 *   scale is < 72; the user pans horizontally to explore.
 * - All charts live inside ONE horizontal ScrollView, so vertical alignment
 *   between Temperature / Wind / Wave / Current / Tide / Precipitation is
 *   guaranteed: scrolling moves every chart in lockstep.
 * - Trade-off: the y-axis labels live inside each chart and therefore scroll
 *   off-screen when panned right. Keeping a fixed-left y-axis would require
 *   synchronising N parallel ScrollViews; deferred until needed.
 */
export function ForecastCharts({ hours }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const [scale, setScale] = useState<Scale>(DEFAULT_SCALE);
  const scrollRef = useRef<ScrollView>(null);
  const s = strings();

  const visibleChartWidth = Math.max(240, screenWidth - HORIZONTAL_PADDING);
  const totalHours = Math.max(1, hours.length);
  // Don't make the chart wider than the data range; if scale > totalHours we
  // just render at viewport width with no horizontal overflow.
  const effectiveScale = Math.min(scale, totalHours);
  const chartWidth = (visibleChartWidth / effectiveScale) * totalHours;

  // Reset to the start (the "now" edge) whenever the scale changes — keeping
  // an old pixel offset across scale changes leads to confusing jumps.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [scale]);

  // Tick interval in hours: denser at narrower scales, sparser at wider ones.
  const tickStepHours = scale <= 24 ? 3 : scale <= 48 ? 6 : 12;
  const xTicks = useMemo(
    () => computeXTicks(hours, tickStepHours),
    [hours, tickStepHours],
  );

  // Direction conversions for arrow rendering. Wind/wave use "from" so we
  // flip 180° to point the arrow where they're going. Current is already "to".
  const windArrows = useMemo(
    () =>
      hours.map((h) =>
        h.windDirectionDeg != null ? (h.windDirectionDeg + 180) % 360 : undefined,
      ),
    [hours],
  );
  const waveArrows = useMemo(
    () =>
      hours.map((h) =>
        h.waveDirectionDeg != null ? (h.waveDirectionDeg + 180) % 360 : undefined,
      ),
    [hours],
  );
  const currentArrows = useMemo(
    () => hours.map((h) => h.currentDirectionDeg),
    [hours],
  );

  const tempSeries: ChartSeries[] = [
    {
      data: hours.map((h) => h.airTemperatureC),
      color: '#D85040',
      label: s.charts.airTemp,
    },
    {
      data: hours.map((h) => h.seaWaterTemperatureC),
      color: '#3070C0',
      label: s.charts.seaTemp,
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.scaleRow}>
        <Text style={styles.scaleLabel}>{s.charts.scaleLabel}</Text>
        {([24, 48, 72] as Scale[]).map((h) => (
          <Pressable
            key={h}
            onPress={() => setScale(h)}
            style={[styles.scaleBtn, scale === h ? styles.scaleBtnActive : null]}
          >
            <Text style={scale === h ? styles.scaleBtnTextActive : styles.scaleBtnText}>
              {scaleLabel(h, s)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator
        bounces={false}
        // Allow the parent vertical ScrollView to capture vertical drags
        // while we capture horizontal ones.
        directionalLockEnabled
      >
        <View>
          <LineChart
            title={s.charts.tempTitle}
            yUnit="°C"
            width={chartWidth}
            height={CHART_HEIGHT_BASE}
            series={tempSeries}
            xTicks={xTicks}
          />
          <LineChart
            title={s.charts.windTitle}
            yUnit="m/s"
            width={chartWidth}
            height={CHART_HEIGHT_DIRECTIONAL}
            zeroBaseline
            series={[
              {
                data: hours.map((h) => h.windSpeedMs),
                color: '#E2872D',
                label: s.charts.windTitle,
              },
            ]}
            directions={windArrows}
            xTicks={xTicks}
          />
          <LineChart
            title={s.charts.precipitationTitle}
            yUnit="mm"
            width={chartWidth}
            height={CHART_HEIGHT_BASE}
            zeroBaseline
            series={[
              {
                data: hours.map((h) => h.precipitationMm),
                color: '#3070C0',
                label: s.charts.precipitationTitle,
              },
            ]}
            xTicks={xTicks}
          />
          <LineChart
            title={s.charts.waveTitle}
            yUnit="m"
            width={chartWidth}
            height={CHART_HEIGHT_DIRECTIONAL}
            zeroBaseline
            series={[
              {
                data: hours.map((h) => h.waveHeightM),
                color: '#1F8A86',
                label: s.charts.waveTitle,
              },
            ]}
            directions={waveArrows}
            xTicks={xTicks}
          />
          <LineChart
            title={s.charts.currentTitle}
            yUnit="m/s"
            width={chartWidth}
            height={CHART_HEIGHT_DIRECTIONAL}
            zeroBaseline
            series={[
              {
                data: hours.map((h) => h.currentSpeedMs),
                color: '#7A4FB0',
                label: s.charts.currentTitle,
              },
            ]}
            directions={currentArrows}
            xTicks={xTicks}
          />
          <LineChart
            title={s.charts.tideTitle}
            yUnit="cm"
            width={chartWidth}
            height={CHART_HEIGHT_BASE}
            series={[
              {
                data: hours.map((h) => h.tideLevelCm),
                color: '#2E7D32',
                label: s.charts.tideTitle,
              },
            ]}
            xTicks={xTicks}
          />
        </View>
      </ScrollView>

      <Text style={styles.hint}>{s.charts.arrowsHint}</Text>
    </View>
  );
}

function scaleLabel(h: Scale, s: ReturnType<typeof strings>): string {
  if (h === 24) return s.charts.scale1Day;
  if (h === 48) return s.charts.scale2Days;
  return s.charts.scale3Days;
}

function computeXTicks(
  hours: HourlyForecast[],
  stepHours: number,
): { x: number; label: string }[] {
  if (hours.length === 0) return [];
  const ticks: { x: number; label: string }[] = [];
  for (let i = 0; i < hours.length; i += stepHours) {
    ticks.push({ x: i, label: shortLabel(hours[i].timeUtc) });
  }
  if (ticks.length === 0 || ticks[ticks.length - 1].x !== hours.length - 1) {
    ticks.push({
      x: hours.length - 1,
      label: shortLabel(hours[hours.length - 1].timeUtc),
    });
  }
  return ticks;
}

const dayFmt = new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo',
  weekday: 'short',
});
const hourFmt = new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo',
  hour: '2-digit',
  hour12: false,
});

function shortLabel(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return '';
  const day = dayFmt.format(d).replace(/\.+$/, '');
  const hour = hourFmt.format(d);
  return `${day} ${hour}`;
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  scaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  scaleLabel: { fontSize: 12, color: '#666', marginRight: 4 },
  scaleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CCD3DA',
  },
  scaleBtnActive: { backgroundColor: '#0E3A5F', borderColor: '#0E3A5F' },
  scaleBtnText: { color: '#0E3A5F', fontSize: 12, fontWeight: '500' },
  scaleBtnTextActive: { color: '#fff', fontSize: 12, fontWeight: '600' },
  hint: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});
