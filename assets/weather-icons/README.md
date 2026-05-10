# Weather icons

This directory bundles MET Norway's official weather symbol set. The
`WeatherIcon` component (`src/components/WeatherIcon.tsx`) maps API
symbol codes (e.g. `partlycloudy_night`) to PNG files here.

## Source

- Repository: https://github.com/metno/weathericons
- License: MIT (free to bundle, no attribution required)
- Spec: https://api.met.no/weatherapi/weathericon/2.0/documentation

## How to populate this directory (one-time setup)

1. Clone or download the metno/weathericons repository:
   ```
   git clone https://github.com/metno/weathericons.git
   ```
2. Inside the repo, find the `png/` directory. There are several size
   variants (e.g. `100/`, `200/`); the **100×100** size is a good fit for
   the forecast row at 32–48 dp display.
3. Copy every `*.png` file from that directory into THIS directory
   (`assets/weather-icons/`). The filenames must be preserved exactly —
   the `WeatherIcon` lookup map keys on them.

The full set is roughly 60 files, totalling around 200 KB.

## Adding a new icon

If MET adds a new symbol code in a future API version:

1. Drop the new PNG here.
2. Add an entry to `ICONS` in `src/components/WeatherIcon.tsx`.
3. Optionally, add a Bokmål label under
   `nb.forecast.weatherSymbols.<code>` in `src/i18n/nb.ts`.

Unknown codes render as an empty layout slot (no broken image),
so the app stays functional if MET ships a code we haven't mapped yet.
