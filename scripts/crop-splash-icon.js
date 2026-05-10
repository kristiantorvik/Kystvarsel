/* eslint-disable */
/**
 * One-off helper: crops the full-bleed splash.png down to a tight square
 * around the lighthouse logo and writes assets/splash-icon.png.
 *
 * Why this exists:
 *   Android 12+ uses a system splash-screen API that draws the image as
 *   a small centred icon (~192dp by default), not a full-bleed image.
 *   Our splash.png is 1242×2436 with the logo occupying ~30% of the
 *   centre, so when the OS scales it to its icon slot the lighthouse
 *   ends up tiny. expo-splash-screen wants an icon-style asset; this
 *   script produces one without losing splash.png (which we keep around
 *   in case we want a full-bleed splash for any iOS-only path later).
 *
 * Usage: `node scripts/crop-splash-icon.js`
 *
 * Idempotent — safe to re-run after splash.png changes.
 */
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'splash.png');
const OUT = path.join(ROOT, 'assets', 'splash-icon.png');

async function main() {
  const img = sharp(SRC);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Could not read splash.png dimensions');
  }
  console.log(`[crop-splash-icon] source ${meta.width}×${meta.height}`);

  // Use sharp's `trim` with the splash background colour to remove the
  // surrounding blue padding automatically. `threshold: 30` accepts
  // small antialiasing variations near the edges of the logo.
  // `.png()` ensures the intermediate buffer is decoded properly when
  // we re-pipe it through sharp for the resize step below.
  const trimmedPng = await img
    .trim({ background: { r: 0x0e, g: 0x3a, b: 0x5f }, threshold: 30 })
    .png()
    .toBuffer({ resolveWithObject: true });

  console.log(
    `[crop-splash-icon] after trim ${trimmedPng.info.width}×${trimmedPng.info.height}`,
  );

  // Pad to a square so the icon doesn't get distorted at any aspect
  // ratio. A small buffer (10% of the longer side) keeps the logo from
  // touching the edge of the OS-rendered icon slot.
  const longer = Math.max(trimmedPng.info.width, trimmedPng.info.height);
  const buffer = Math.round(longer * 0.1);
  const square = longer + buffer * 2;

  // Re-open the trimmed PNG buffer as a fresh sharp pipeline; sharp
  // decodes the PNG header so we don't need to pass `raw` info.
  await sharp(trimmedPng.data)
    .resize({
      width: square,
      height: square,
      fit: 'contain',
      // Pad with the splash background colour (not transparent) so the
      // PNG itself looks complete even if a renderer ignores
      // backgroundColor — Android 12+ icon mask sometimes does this.
      background: { r: 0x0e, g: 0x3a, b: 0x5f, alpha: 1 },
    })
    .png()
    .toFile(OUT);

  console.log(`[crop-splash-icon] wrote ${OUT} at ${square}×${square}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
