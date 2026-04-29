import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';

import { strings } from '../../i18n';

export interface ChartSeries {
  data: (number | undefined)[];
  color: string;
  label: string;
}

export interface LineChartProps {
  width: number;
  height: number;
  series: ChartSeries[];
  /**
   * Direction in degrees per data point (0=N, 90=E). Pass `undefined` for hours
   * with no direction. Rendered as a strip of arrows under the x-axis, sampled
   * to ~8 across the chart width to avoid crowding.
   */
  directions?: (number | undefined)[];
  yUnit?: string;
  yMin?: number;
  yMax?: number;
  /** If true, force 0 to be inside the y-range (good for non-negative quantities). */
  zeroBaseline?: boolean;
  xTicks: { x: number; label: string }[];
  title: string;
}

const PAD = { top: 18, right: 14, bottom: 22, left: 38 };
const ARROW_STRIP_HEIGHT = 18;

export function LineChart({
  width,
  height,
  series,
  directions,
  yUnit,
  yMin,
  yMax,
  zeroBaseline,
  xTicks,
  title,
}: LineChartProps) {
  const hasArrows = !!directions && directions.some((d) => d != null);
  const bottomChrome = PAD.bottom + (hasArrows ? ARROW_STRIP_HEIGHT : 0);
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - bottomChrome;

  const allValues = series.flatMap((s) =>
    s.data.filter((v): v is number => v != null && !isNaN(v)),
  );
  const hasAny = allValues.length > 0;

  let yMinR = yMin ?? (hasAny ? Math.min(...allValues) : 0);
  let yMaxR = yMax ?? (hasAny ? Math.max(...allValues) : 1);
  if (zeroBaseline) yMinR = Math.min(yMinR, 0);
  if (yMin == null && yMax == null) {
    const span = yMaxR - yMinR || 1;
    yMinR -= span * 0.08;
    yMaxR += span * 0.08;
  }
  if (yMinR === yMaxR) yMaxR = yMinR + 1;

  const xMax = Math.max(0, ...series.map((s) => s.data.length - 1));
  const xScale = (x: number) => PAD.left + (xMax > 0 ? (x / xMax) * chartW : 0);
  const yScale = (y: number) =>
    PAD.top + chartH - ((y - yMinR) / (yMaxR - yMinR)) * chartH;

  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMinR + ((yMaxR - yMinR) * i) / 4);
  }

  // Target ~one arrow per 60px of chart width — keeps density readable when
  // the user widens the chart via the scale buttons (1d / 2d / 3d).
  const targetArrowCount = Math.max(6, Math.floor(chartW / 60));
  const arrowSamplingStep = directions
    ? Math.max(1, Math.round(directions.length / targetArrowCount))
    : 1;
  const arrowY = PAD.top + chartH + 12 + ARROW_STRIP_HEIGHT / 2;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {yUnit ? <Text style={styles.unit}>{yUnit}</Text> : null}
      </View>

      {!hasAny ? (
        <View style={[styles.empty, { height: height - 30 }]}>
          <Text style={styles.emptyText}>{strings().forecast.empty}</Text>
        </View>
      ) : (
        <Svg width={width} height={height}>
          {yTicks.map((t, i) => (
            <Line
              key={`g${i}`}
              x1={PAD.left}
              x2={PAD.left + chartW}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="#E8ECF0"
              strokeWidth={1}
            />
          ))}

          {yTicks.map((t, i) => (
            <SvgText
              key={`yl${i}`}
              x={PAD.left - 4}
              y={yScale(t) + 3}
              fontSize={10}
              textAnchor="end"
              fill="#888"
            >
              {Math.abs(t) >= 100 ? Math.round(t).toString() : t.toFixed(1)}
            </SvgText>
          ))}

          {series.map((s, i) => (
            <Path
              key={`s${i}`}
              d={buildPath(s.data, xScale, yScale)}
              stroke={s.color}
              strokeWidth={2}
              fill="none"
            />
          ))}

          {hasArrows &&
            directions!.map((dir, i) => {
              if (dir == null) return null;
              if (i % arrowSamplingStep !== 0) return null;
              return (
                <Arrow
                  key={`a${i}`}
                  cx={xScale(i)}
                  cy={arrowY}
                  angleDeg={dir}
                  size={6}
                />
              );
            })}

          <Line
            x1={PAD.left}
            x2={PAD.left + chartW}
            y1={PAD.top + chartH}
            y2={PAD.top + chartH}
            stroke="#888"
            strokeWidth={1}
          />

          {xTicks.map((tick, i) => (
            <SvgText
              key={`xl${i}`}
              x={xScale(tick.x)}
              y={height - 4}
              fontSize={10}
              textAnchor="middle"
              fill="#666"
            >
              {tick.label}
            </SvgText>
          ))}

          {series.length > 1 && (
            <G>
              {series.map((s, i) => (
                <G key={`leg${i}`}>
                  <Line
                    x1={PAD.left + i * 70}
                    x2={PAD.left + 12 + i * 70}
                    y1={PAD.top - 6}
                    y2={PAD.top - 6}
                    stroke={s.color}
                    strokeWidth={2.5}
                  />
                  <SvgText
                    x={PAD.left + 16 + i * 70}
                    y={PAD.top - 3}
                    fontSize={10}
                    fill="#666"
                  >
                    {s.label}
                  </SvgText>
                </G>
              ))}
            </G>
          )}
        </Svg>
      )}
    </View>
  );
}

function buildPath(
  data: (number | undefined)[],
  xScale: (x: number) => number,
  yScale: (y: number) => number,
): string {
  let path = '';
  let started = false;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v == null || isNaN(v)) {
      started = false;
      continue;
    }
    const cmd = started ? 'L' : 'M';
    path += `${cmd}${xScale(i).toFixed(2)},${yScale(v).toFixed(2)} `;
    started = true;
  }
  return path.trim();
}

interface ArrowProps {
  cx: number;
  cy: number;
  angleDeg: number;
  size: number;
}

/**
 * Draws a small arrow centered at (cx, cy) pointing in `angleDeg` (compass:
 * 0=N, 90=E). SVG y-axis is inverted, so we use sin/-cos.
 */
function Arrow({ cx, cy, angleDeg, size }: ArrowProps) {
  const rad = (angleDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const tipX = cx + sin * size;
  const tipY = cy - cos * size;
  const tailX = cx - sin * size;
  const tailY = cy + cos * size;
  const barbAngle = (35 * Math.PI) / 180;
  const b1 = rad + Math.PI - barbAngle;
  const b2 = rad + Math.PI + barbAngle;
  const barbLen = size * 0.55;
  const barb1X = tipX + Math.sin(b1) * barbLen;
  const barb1Y = tipY - Math.cos(b1) * barbLen;
  const barb2X = tipX + Math.sin(b2) * barbLen;
  const barb2Y = tipY - Math.cos(b2) * barbLen;
  return (
    <G>
      <Line
        x1={tailX}
        y1={tailY}
        x2={tipX}
        y2={tipY}
        stroke="#0E3A5F"
        strokeWidth={1.4}
      />
      <Polygon
        points={`${tipX},${tipY} ${barb1X},${barb1Y} ${barb2X},${barb2Y}`}
        fill="#0E3A5F"
      />
    </G>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingTop: 4,
    paddingBottom: 2,
    marginVertical: 6,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E8ECF0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 2,
    marginTop: 6,
  },
  title: { fontSize: 14, fontWeight: '600', color: '#0E3A5F' },
  unit: { fontSize: 11, color: '#888' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888', fontSize: 12 },
});
