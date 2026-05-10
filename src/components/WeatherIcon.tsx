import React from 'react';
import { Image, type ImageStyle, type StyleProp, View, StyleSheet } from 'react-native';

import { strings } from '../i18n';

/**
 * Renders MET Norway's official weather symbols as small icons. Maps the
 * `symbol_code` strings returned by Locationforecast 2.0 (e.g. "cloudy",
 * "partlycloudy_night", "lightrainshowers_polartwilight") to PNG assets
 * bundled in `assets/weather-icons/`.
 *
 * The asset files come from {@link https://github.com/metno/weathericons}
 * (MIT license — free to bundle, no attribution required).
 *
 * The map below is **hardcoded** because Metro requires `require()` paths
 * to be statically analyzable — dynamic `require()` of a computed string
 * doesn't work in production builds. To add a new symbol code, drop the
 * PNG into `assets/weather-icons/` and add the matching entry here.
 *
 * MET's complete symbol set is ~60 codes. Variants exist for `_day`,
 * `_night`, and `_polartwilight` suffixes. The official spec is at
 * https://api.met.no/weatherapi/weathericon/2.0/documentation
 *
 * Unknown codes render as a no-op (returns null) — the row layout
 * gracefully falls back to no symbol rather than a broken-image icon.
 */

// prettier-ignore
const ICONS: Record<string, ReturnType<typeof require>> = {
  // Clear sky
  clearsky_day: require('../../assets/weather-icons/clearsky_day.png'),
  clearsky_night: require('../../assets/weather-icons/clearsky_night.png'),
  clearsky_polartwilight: require('../../assets/weather-icons/clearsky_polartwilight.png'),
  // Fair (mostly clear)
  fair_day: require('../../assets/weather-icons/fair_day.png'),
  fair_night: require('../../assets/weather-icons/fair_night.png'),
  fair_polartwilight: require('../../assets/weather-icons/fair_polartwilight.png'),
  // Partly cloudy
  partlycloudy_day: require('../../assets/weather-icons/partlycloudy_day.png'),
  partlycloudy_night: require('../../assets/weather-icons/partlycloudy_night.png'),
  partlycloudy_polartwilight: require('../../assets/weather-icons/partlycloudy_polartwilight.png'),
  // Cloudy (no day/night variants — same icon for all)
  cloudy: require('../../assets/weather-icons/cloudy.png'),
  // Fog
  fog: require('../../assets/weather-icons/fog.png'),
  // Rain
  lightrain: require('../../assets/weather-icons/lightrain.png'),
  rain: require('../../assets/weather-icons/rain.png'),
  heavyrain: require('../../assets/weather-icons/heavyrain.png'),
  // Rain showers
  lightrainshowers_day: require('../../assets/weather-icons/lightrainshowers_day.png'),
  lightrainshowers_night: require('../../assets/weather-icons/lightrainshowers_night.png'),
  lightrainshowers_polartwilight: require('../../assets/weather-icons/lightrainshowers_polartwilight.png'),
  rainshowers_day: require('../../assets/weather-icons/rainshowers_day.png'),
  rainshowers_night: require('../../assets/weather-icons/rainshowers_night.png'),
  rainshowers_polartwilight: require('../../assets/weather-icons/rainshowers_polartwilight.png'),
  heavyrainshowers_day: require('../../assets/weather-icons/heavyrainshowers_day.png'),
  heavyrainshowers_night: require('../../assets/weather-icons/heavyrainshowers_night.png'),
  heavyrainshowers_polartwilight: require('../../assets/weather-icons/heavyrainshowers_polartwilight.png'),
  // Sleet
  lightsleet: require('../../assets/weather-icons/lightsleet.png'),
  sleet: require('../../assets/weather-icons/sleet.png'),
  heavysleet: require('../../assets/weather-icons/heavysleet.png'),
  // Sleet showers
  lightsleetshowers_day: require('../../assets/weather-icons/lightsleetshowers_day.png'),
  lightsleetshowers_night: require('../../assets/weather-icons/lightsleetshowers_night.png'),
  lightsleetshowers_polartwilight: require('../../assets/weather-icons/lightsleetshowers_polartwilight.png'),
  sleetshowers_day: require('../../assets/weather-icons/sleetshowers_day.png'),
  sleetshowers_night: require('../../assets/weather-icons/sleetshowers_night.png'),
  sleetshowers_polartwilight: require('../../assets/weather-icons/sleetshowers_polartwilight.png'),
  heavysleetshowers_day: require('../../assets/weather-icons/heavysleetshowers_day.png'),
  heavysleetshowers_night: require('../../assets/weather-icons/heavysleetshowers_night.png'),
  heavysleetshowers_polartwilight: require('../../assets/weather-icons/heavysleetshowers_polartwilight.png'),
  // Snow
  lightsnow: require('../../assets/weather-icons/lightsnow.png'),
  snow: require('../../assets/weather-icons/snow.png'),
  heavysnow: require('../../assets/weather-icons/heavysnow.png'),
  // Snow showers
  lightsnowshowers_day: require('../../assets/weather-icons/lightsnowshowers_day.png'),
  lightsnowshowers_night: require('../../assets/weather-icons/lightsnowshowers_night.png'),
  lightsnowshowers_polartwilight: require('../../assets/weather-icons/lightsnowshowers_polartwilight.png'),
  snowshowers_day: require('../../assets/weather-icons/snowshowers_day.png'),
  snowshowers_night: require('../../assets/weather-icons/snowshowers_night.png'),
  snowshowers_polartwilight: require('../../assets/weather-icons/snowshowers_polartwilight.png'),
  heavysnowshowers_day: require('../../assets/weather-icons/heavysnowshowers_day.png'),
  heavysnowshowers_night: require('../../assets/weather-icons/heavysnowshowers_night.png'),
  heavysnowshowers_polartwilight: require('../../assets/weather-icons/heavysnowshowers_polartwilight.png'),
  // Thunder variants
  rainandthunder: require('../../assets/weather-icons/rainandthunder.png'),
  lightrainandthunder: require('../../assets/weather-icons/lightrainandthunder.png'),
  heavyrainandthunder: require('../../assets/weather-icons/heavyrainandthunder.png'),
  sleetandthunder: require('../../assets/weather-icons/sleetandthunder.png'),
  lightsleetandthunder: require('../../assets/weather-icons/lightsleetandthunder.png'),
  heavysleetandthunder: require('../../assets/weather-icons/heavysleetandthunder.png'),
  snowandthunder: require('../../assets/weather-icons/snowandthunder.png'),
  lightsnowandthunder: require('../../assets/weather-icons/lightsnowandthunder.png'),
  heavysnowandthunder: require('../../assets/weather-icons/heavysnowandthunder.png'),
  // Thunder shower variants
  rainshowersandthunder_day: require('../../assets/weather-icons/rainshowersandthunder_day.png'),
  rainshowersandthunder_night: require('../../assets/weather-icons/rainshowersandthunder_night.png'),
  rainshowersandthunder_polartwilight: require('../../assets/weather-icons/rainshowersandthunder_polartwilight.png'),
  lightrainshowersandthunder_day: require('../../assets/weather-icons/lightrainshowersandthunder_day.png'),
  lightrainshowersandthunder_night: require('../../assets/weather-icons/lightrainshowersandthunder_night.png'),
  lightrainshowersandthunder_polartwilight: require('../../assets/weather-icons/lightrainshowersandthunder_polartwilight.png'),
  heavyrainshowersandthunder_day: require('../../assets/weather-icons/heavyrainshowersandthunder_day.png'),
  heavyrainshowersandthunder_night: require('../../assets/weather-icons/heavyrainshowersandthunder_night.png'),
  heavyrainshowersandthunder_polartwilight: require('../../assets/weather-icons/heavyrainshowersandthunder_polartwilight.png'),
  sleetshowersandthunder_day: require('../../assets/weather-icons/sleetshowersandthunder_day.png'),
  sleetshowersandthunder_night: require('../../assets/weather-icons/sleetshowersandthunder_night.png'),
  sleetshowersandthunder_polartwilight: require('../../assets/weather-icons/sleetshowersandthunder_polartwilight.png'),
  lightssleetshowersandthunder_day: require('../../assets/weather-icons/lightssleetshowersandthunder_day.png'),
  lightssleetshowersandthunder_night: require('../../assets/weather-icons/lightssleetshowersandthunder_night.png'),
  lightssleetshowersandthunder_polartwilight: require('../../assets/weather-icons/lightssleetshowersandthunder_polartwilight.png'),
  heavysleetshowersandthunder_day: require('../../assets/weather-icons/heavysleetshowersandthunder_day.png'),
  heavysleetshowersandthunder_night: require('../../assets/weather-icons/heavysleetshowersandthunder_night.png'),
  heavysleetshowersandthunder_polartwilight: require('../../assets/weather-icons/heavysleetshowersandthunder_polartwilight.png'),
  snowshowersandthunder_day: require('../../assets/weather-icons/snowshowersandthunder_day.png'),
  snowshowersandthunder_night: require('../../assets/weather-icons/snowshowersandthunder_night.png'),
  snowshowersandthunder_polartwilight: require('../../assets/weather-icons/snowshowersandthunder_polartwilight.png'),
  lightssnowshowersandthunder_day: require('../../assets/weather-icons/lightssnowshowersandthunder_day.png'),
  lightssnowshowersandthunder_night: require('../../assets/weather-icons/lightssnowshowersandthunder_night.png'),
  lightssnowshowersandthunder_polartwilight: require('../../assets/weather-icons/lightssnowshowersandthunder_polartwilight.png'),
  heavysnowshowersandthunder_day: require('../../assets/weather-icons/heavysnowshowersandthunder_day.png'),
  heavysnowshowersandthunder_night: require('../../assets/weather-icons/heavysnowshowersandthunder_night.png'),
  heavysnowshowersandthunder_polartwilight: require('../../assets/weather-icons/heavysnowshowersandthunder_polartwilight.png'),
};

interface Props {
  /** MET symbol code (e.g. "partlycloudy_night"). Unknown codes render nothing. */
  code: string | null | undefined;
  /** Display size in points/dp. Defaults to 32 — fits the forecast row header. */
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export function WeatherIcon({ code, size = 32, style }: Props) {
  if (!code) return null;
  const src = ICONS[code];
  if (!src) {
    // Reserve the layout slot even for unknown codes so row alignment is
    // stable across hours that have/don't have a recognised symbol.
    return <View style={{ width: size, height: size }} />;
  }
  const s = strings();
  const labels = (s.forecast.weatherSymbols ?? {}) as Record<string, string>;
  return (
    <Image
      source={src}
      style={StyleSheet.flatten([{ width: size, height: size }, style])}
      accessibilityLabel={labels[code] ?? code}
    />
  );
}
