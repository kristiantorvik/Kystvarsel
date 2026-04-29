export function fmtNum(v: number | undefined, digits = 1, suffix = ''): string {
  if (v == null || isNaN(v)) return '–';
  return `${v.toFixed(digits)}${suffix}`;
}

export function fmtCoord(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function fmtCompass(deg: number | undefined): string {
  if (deg == null || isNaN(deg)) return '–';
  const dirs = ['N', 'NNØ', 'NØ', 'ØNØ', 'Ø', 'ØSØ', 'SØ', 'SSØ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
  const ix = Math.round(((deg % 360) / 22.5)) % 16;
  return `${dirs[ix]} (${Math.round(deg)}°)`;
}
