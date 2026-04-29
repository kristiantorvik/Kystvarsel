# Kystvarsel

A privacy-first Norwegian coastal conditions alert app. Users save private coastal spots, define condition-based alerts (wind, current, sea temperature, tide level/direction, wave height, rain, time of day), and receive **local** notifications when forecast conditions match.

**No accounts. No backend. No cloud sync. All spots and alerts stay on the device.**

Built for divers, freedivers, spearfishers, crab fishers, surfers, sailors, kayakers, and other Norwegian sea users.

---

## Stack

- **React Native + Expo (managed)** — TypeScript
- **expo-sqlite** for local storage (with simple migrations)
- **expo-notifications** for local notifications
- **expo-background-task** + **expo-task-manager** for best-effort 12-hour background checks (Android: WorkManager-backed)
- **react-native-svg** for forecast line charts (custom rendering, no chart library)
- **react-native-webview** + Leaflet + Kartverket WMTS tiles for the map-based spot picker and the all-spots map view (no Google API key, no auth)
- **@react-navigation/\*** for tab + stack navigation

## Data sources

All forecast data is fetched directly from public APIs at runtime — no proxy server.

| Source | Endpoint | Used for |
| --- | --- | --- |
| MET Norway Locationforecast 2.0 | `https://api.met.no/weatherapi/locationforecast/2.0/compact` | Air temperature, wind, precipitation, weather symbol |
| MET Norway Oceanforecast 2.0 | `https://api.met.no/weatherapi/oceanforecast/2.0/complete` | Sea water temperature, waves, current |
| Kartverket "Se havnivå" | `https://vannstand.kartverket.no/tideapi.php` | Tidal water level (relative to chart datum CD) |
| Kartverket WMTS — Sjøkart | `https://cache.kartverket.no/v1/wmts/1.0.0/sjokartraster/...` | Sea-chart tiles (default map layer) |
| Kartverket WMTS — Topo | `https://cache.kartverket.no/v1/wmts/1.0.0/topo/...` | Topographic tiles (alternate map layer) |

Attribution is shown in the **Settings → Datakilder** screen and in the forecast view footer.

The TypeScript clients in `src/api/` mirror the Python reference logic with one important fix: the tide query uses `datatype=pre` (predicted hourly samples on hour boundaries) rather than the Python script's `datatype=TAB`, which Kartverket now interprets as "tabular high/low extremes" — sparse data that doesn't merge cleanly with the hourly weather/ocean axis.

---

## Configure the MET User-Agent contact

MET Norway requires a meaningful `User-Agent` identifying the app and a contact email.

The contact email lives in `app.json` under `expo.extra.metContactEmail`. The default is `kristiantorvik@gmail.com`. The `User-Agent` is computed at runtime as:

```
<appIdentifier>/<version> <metContactEmail>
```

To change it before publishing, edit `app.json`:

```json
"extra": {
  "metContactEmail": "your@email.example",
  "appIdentifier": "kystvarsel"
}
```

**If you fork this repo, please change `metContactEmail` to your own address.** MET Norway uses the contact to reach the maintainer if your traffic causes problems; leaving the original author's email in your fork would route those messages to the wrong person.

**Do not commit private secrets.** No tokens are needed for the MET / Kartverket providers — BarentsWatch (which would require OAuth credentials) is intentionally **not** wired up; see `src/api/barentswatch.ts` for the placeholder.

---

## Maps — Kartverket / Norgeskart

The map-based spot picker (`SpotMapPickerScreen`) and the all-spots map (`SpotsListScreen` → Kart toggle) use a WebView running [Leaflet](https://leafletjs.com/) with public Kartverket WMTS tiles. Two layers are wired up:

- **Sjøkart** (default) — official Norwegian nautical charts. Best for divers, sailors, and anyone who needs depths and hazards.
- **Topo** — Kartverket's standard topographic.

A toggle in the top-right corner of the map switches between them. No API key, no Google billing, no signup — Kartverket exposes these tiles publicly. They are credited as **© Kartverket** in the map's bottom-right attribution control.

The Leaflet library itself is loaded from `unpkg.com` at runtime; tiles come from `cache.kartverket.no`. The map needs an internet connection on first open.

> **TODO — aerial photo (Flyfoto / Norge i bilder):** the WMTS endpoint for Norge i bilder lives on a different host than `cache.kartverket.no`, and the right URL pattern needs to be confirmed against Kartverket's current docs. The toggle currently ships only Sjøkart + Topo; aerial can be added by appending one tile layer to `src/components/maps/leafletHtml.ts`.

### All-spots map (Liste/Kart toggle)

The Steder tab has a Liste/Kart toggle. The Kart view renders a circle marker per saved spot, colour-coded:

- **Green** — spot has at least one **enabled** alert that **matches** the cached forecast.
- **Blue** — spot has enabled alerts but no current match (or the forecast cache is empty for that spot).
- **Gray** — no enabled alerts.

The status is computed from the local forecast cache only — **no automatic network fetch on map open**. Press the **Sjekk nå** button (top-left) to refresh forecasts for all spots with alerts and re-evaluate matches; pin colours update in place without resetting your pan/zoom.

Tapping a marker opens that spot's forecast view.

---

## Run on Android (development)

The app uses native modules (`expo-sqlite`, `expo-notifications`, `expo-background-task`) that aren't available in Expo Go. You need a **development build**.

### One-time setup

```bash
npm install
```

### First run — generate the dev build

```bash
npx expo prebuild        # generates the android/ folder
npx expo run:android     # builds + installs on a connected device or emulator
```

After this, you can run `npx expo start` for the JS bundler and reload the dev client.

### Day-to-day

```bash
npx expo start
# press `a` to open on Android
```

### iOS (best-effort)

```bash
npx expo run:ios
```

iOS works for foreground use, but background-task scheduling is unreliable on iOS — see *Background task limitations* below.

---

## Run tests

The alert matching engine has Jest unit tests covering thresholds, missing data, rain modes, tide direction, time-of-day windows (incl. overnight), the duplicate-notification hash, and the example "crab" alert.

```bash
npm test
```

---

## Build a Android release (Google Play)

The recommended path is **EAS Build**:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile production
```

This produces an `.aab` you can upload to Google Play Console.

For a local release without EAS:

```bash
npx expo prebuild
cd android
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

You'll need a release keystore (`android/app/keystore.properties`). See [Expo's signing docs](https://docs.expo.dev/deploy/build-project/) for details. **Never commit your keystore.**

Before publishing, change `android.package` and `ios.bundleIdentifier` in `app.json` away from the placeholder `com.example.kystvarsel`.

---

## Project structure

```
src/
  api/                    HTTP clients + forecast service
    metLocationForecast.ts
    metOceanForecast.ts
    tideApi.ts
    forecastService.ts    Orchestrates the three providers + caching + dedup
    userAgent.ts          MET User-Agent builder
    barentswatch.ts       Placeholder (not wired)
  data/                   SQLite + repos
    db.ts                 Migrations
    spotsRepository.ts
    alertsRepository.ts
    forecastCacheRepository.ts
    settingsRepository.ts
  domain/                 Pure logic, no React
    forecastTypes.ts
    alertTypes.ts
    normalizeForecast.ts  Merge providers by UTC hour, derive tide direction
    evaluateAlert.ts      Match an alert against forecast hours
    __tests__/            Jest tests
  notifications/
    localNotifications.ts
    backgroundCheck.ts    Task definition + runAlertCheck()
  screens/
    SpotsListScreen.tsx
    SpotFormScreen.tsx
    SpotForecastScreen.tsx
    AlertsListScreen.tsx
    AlertFormScreen.tsx
    AlertDetailScreen.tsx
    SettingsScreen.tsx
  components/             Small shared UI pieces
  navigation/             React Navigation setup
  i18n/                   Centralized strings (nb.ts is the default)
  utils/                  Time, formatting, UUID
```

**Layer rules:** `domain/` has no React or platform imports. `api/` does not depend on `data/` (forecast service writes through to cache via repository). Screens depend on everything; nothing depends on screens.

---

## How alerts work

1. **Storage.** Each alert is bound to a saved spot and has a `criteria` object (min/max thresholds, rain mode, tide direction, time-of-day window). All stored locally in SQLite.
2. **Evaluation.** `evaluateAlert()` walks every hourly forecast and asks: do all enabled criteria pass for this hour? Missing required data is treated conservatively as "does not match" (with a reason string for the UI).
3. **Notification dedup.** A `windowHash` is computed from the alert id + first/last matching UTC hour + matching dates. If the new hash equals `lastTriggeredWindowHash`, no notification is sent. Updating the window (or matching a different slice tomorrow) produces a new hash.
4. **Manual check.** The Settings → "Sjekk varsler nå" button runs the same pipeline as the background task.
5. **Background check.** `expo-background-task` registers a task at a 12-hour minimum interval. Android executes this via WorkManager when system conditions allow.

---

## Background task limitations

> Mobile background execution is **never** guaranteed. The UI says so:
> *«Varsler sjekkes automatisk når telefonen tillater det. Åpne appen for å oppdatere manuelt.»*

- **Android.** WorkManager respects Doze mode and battery-optimization settings. On phones with aggressive battery savers (Xiaomi, Huawei, Samsung), background execution may be skipped indefinitely until the user disables battery optimization for the app. The Settings screen explains this.
- **iOS.** `BGTaskScheduler` may schedule tasks rarely or not at all, especially on devices that aren't in Low Power Mode but haven't been used recently. Treat it as a bonus.
- The **manual "Sjekk nå"** button always works while the app is foregrounded.
- Alerts are **also** evaluated on app open (the Settings screen exposes the manual trigger; you can wire `runAlertCheck()` into `App.tsx` startup if you want auto-check on every cold launch).

---

## Privacy

- Spots, alerts, and forecast cache all live in a single SQLite database on the device.
- The only network traffic is direct calls to `api.met.no` and `vannstand.kartverket.no`.
- The `User-Agent` includes only the configured contact email — no device identifier, no install id.
- No analytics SDK, no crash reporter, no third-party libraries that phone home.

To remove all data: uninstall the app.

---

## Renaming the app

The display name is centralized:

- **`app.json`** → `expo.name` (display name) and `expo.slug` (Expo project slug).
- **`src/i18n/nb.ts`** → `appName`.
- **`app.json`** → `android.package` and `ios.bundleIdentifier` for store identifiers.

A search-and-replace of "Kystvarsel" should hit only those locations (and the README/header comments).

---

## Known limitations / TODOs

- **No map UI yet.** Spots are entered as decimal coordinates. Adding `react-native-maps` is the obvious next step but adds a heavy native dep.
- **Tide stations.** Kartverket returns the nearest tide station, which can be far from the spot. The station name isn't currently surfaced in the UI (it's available in `tideApi.ts` if you want to add it).
- **No background-check status visibility.** Settings shows the last successful check time but not "task last scheduled" / "task last failed".
- **Tide direction at first hour.** The first hourly entry has no previous tide value, so it falls back to comparing against the next hour. This is documented in `normalizeForecast.ts`.
- **No iOS background entitlements wiring beyond `UIBackgroundModes`** in `app.json`. EAS prebuild handles registering `BGTaskScheduler` task identifiers; if you go bare-iOS you'll need to register the task identifier manually.
- **No accessibility labels yet.** Form fields have visible labels but no explicit `accessibilityLabel`/`accessibilityHint` props.
- **English translation not provided** — the i18n system is in place; add `src/i18n/en.ts` with the same shape and switch via `setLanguage`.
- **Forecast cache eviction.** Entries grow indefinitely (one row per unique coord). For an MVP this is fine; add a cleanup query if you scale.
- **Alert criteria don't yet support a "between sunrise and sunset" mode** — only HH:MM windows.
- **BarentsWatch** is not implemented (would require OAuth client credentials). See the placeholder file for notes if you add it later.

---

## Contributing notes (for future you)

- Run `npm run lint` (just `tsc --noEmit`) before commits.
- Don't put logic in screens — keep `domain/` pure so it stays trivially testable.
- New criteria fields go in: `alertTypes.ts` → `AlertCriteria`, `evaluateAlert.ts`, `AlertFormScreen.tsx`, `AlertsListScreen.tsx` (summary), `i18n/nb.ts`, and a new test in `__tests__/evaluateAlert.test.ts`.
- New forecast fields go in: `forecastTypes.ts` → `HourlyForecast`, `normalizeForecast.ts`, the relevant `api/*.ts` client, and `ForecastRow.tsx`.
- Migrations are append-only — never edit a shipped migration in `db.ts`.

---

## Cloning this repo

```bash
git clone https://github.com/<your-fork>/kystvarsel.git
cd kystvarsel
npm install                # postinstall runs patch-package automatically
npx expo prebuild          # regenerates android/ from app.json
npx expo run:android       # build + install on connected device/emulator
```

The `android/` and `ios/` folders are intentionally **not** committed — they're regenerated from `app.json` by `expo prebuild`. Manual native edits don't survive a clean rebuild; if you need to patch a node module (as we do for `@react-native/gradle-plugin`'s foojay version), use `patch-package` and commit the resulting file under `patches/`.

---

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, ship your own version. The only ask: change the `metContactEmail` in `app.json` to your own address before you do (see *Configure the MET User-Agent contact* above).

The forecast and tide data this app displays is © MET Norway and © Kartverket respectively, used under their public-data licenses (CC BY 4.0 / NLOD 2.0). The MIT license here covers only the source code in this repository, not the data.
