/**
 * BarentsWatch placeholder.
 *
 * The Python reference script does not currently call BarentsWatch — only MET Norway
 * (Locationforecast + Oceanforecast) and Kartverket. BarentsWatch APIs (e.g. fish-health,
 * AIS) require OAuth client credentials and are out of scope for the privacy-first MVP,
 * which deliberately keeps API access tokenless where possible.
 *
 * If we later add BarentsWatch:
 *   1. Add `BARENTSWATCH_CLIENT_ID` and `BARENTSWATCH_CLIENT_SECRET` to `app.json` `extra`
 *      (or via `expo-secure-store` for runtime-supplied tokens — never hardcode).
 *   2. Implement OAuth client-credentials token fetch + refresh here.
 *   3. Add a normalized field to `HourlyForecast` for the chosen dataset.
 */
export const _BARENTSWATCH_NOT_IMPLEMENTED = true;
