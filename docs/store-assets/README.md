# Store assets

This folder is the staging area for everything the Play Store / App Store
listing needs. Drop files in the matching subfolder; they're not
referenced by app code, just by the store-listing process.

## Folder layout

```
docs/store-assets/
├── README.md                 ← you are here
├── screenshots/
│   ├── android/              ← Android Play Store screenshots
│   │   ├── 01-spots-list.png
│   │   ├── 02-spot-map.png
│   │   ├── 03-forecast.png
│   │   ├── 04-alert-detail.png
│   │   └── 05-paint.png
│   └── ios/                  ← iPhone App Store screenshots (when iOS lands)
├── feature-graphic/          ← 1024×500 hero image for the Play Store listing
└── icon-square/              ← 512×512 PNG of the app icon (Play Store needs this separately from in-app icon)
```

## Play Store specs

### Screenshots
- **Phone screenshots**: 16:9 or 9:16 aspect ratio
  - JPEG or 24-bit PNG (no alpha)
  - Min dimension: 320 px on the short side
  - Max dimension: 3840 px on the long side
  - Pixel 7 / Pixel 8 portrait (1080×2400) is a great default size
  - **Minimum 2, maximum 8** — Google recommends 4–6
- Use real-looking data, not Lorem Ipsum. Spots in Norwegian coastal
  locations make the app instantly relatable.

### Feature graphic (mandatory)
- **1024×500 px**, 24-bit PNG or JPEG, no alpha
- Shows on the Play Store listing card. Avoid putting critical text near
  the edges — the listing crops it on different screen sizes.

### App icon (mandatory)
- **512×512 px PNG**, 32-bit with alpha
- Different from the in-app icon (`assets/icon.png`). The Play Store icon
  is the marketing version.

### Optional: promo video
- A YouTube link to a 30 s gameplay/demo video. Skip for v1; add later
  if you want the listing to stand out.

## Recommended screenshot sequence

A good 5-screenshot flow (in this order — first one is the most
important; many users only see that):

1. **Hero shot**: Spots map view with several Norwegian coastal pins, a
   couple of them green ("matching"), Topo basemap visible.
2. **Forecast view**: A spot's hourly forecast with weather icons and the
   "Nå" line clearly visible.
3. **Alert detail**: Showing matching hours with criteria summary chips.
4. **Paint mode**: A painted region (e.g. labeled "Krabbeområder")
   overlayed on the map.
5. **Tag filter**: Chip row showing "Torsk", "Krabbe", "Dykking" with
   the spots filtered.

Add a one-line caption per screenshot in the Play Console — short,
descriptive, Norwegian Bokmål.

## Listing copy

### Short description (max 80 chars, Norwegian Bokmål)
> Vær- og havvarsel for kysten — uten konto, uten sky, alt på din egen
> telefon.
(75 chars — fits.)

### Long description (max 4000 chars, Norwegian Bokmål)
A draft is in `docs/store-assets/store-description.md` (create it when
ready). Cover:
- Who it's for (dykkere, fritidsfiskere, padlere, seilere, surfere)
- Privacy stance (no accounts, no cloud)
- Data sources (MET Norway, Kartverket — both authoritative)
- Key features (steder, varsler, tagger, malte kartlag, eksport)
- The reliability disclaimer ("ikke bruk som eneste kilde til
  beslutninger om sjø- og værforhold")

### Data Safety form
- Data collected: **None**
- Data shared with third parties: **None**
- Data stored on user's device: **Yes** (configuration)
- Encryption in transit: **Yes** (HTTPS only)
- User can request data deletion: **Yes** (uninstall the app)

### Privacy policy URL
Once `docs/PRIVACY.md` is published via GitHub Pages, paste the public
URL here. Required for submission.

### Content rating
IARC questionnaire will land at "Everyone / Alle" — no objectionable
content.

### Category
- Primary: **Weather** (most appropriate)
- Secondary: **Maps & Navigation** (optional)

## App Store specs (for later)

iOS screenshots have stricter rules — different sizes per device. When
iOS launches, populate `screenshots/ios/`:

- iPhone 6.7" display: 1290×2796
- iPhone 6.5" display: 1242×2688
- iPhone 5.5" display: 1242×2208 (older devices)

Apple requires at least one screenshot for each size you target.
