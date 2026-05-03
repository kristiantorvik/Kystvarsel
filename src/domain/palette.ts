/**
 * Fixed palette for painted map layers. **Layers store the opaque ID** (`c1`,
 * `c2`, …); both the hex and the display label live in a single lookup table
 * here. To swap a colour that blends into the map (e.g. blue against the
 * ocean), edit a single entry — saved layers continue to point at the same
 * ID and pick up the new appearance automatically.
 *
 * Adding a new colour: append to `PALETTE` *and* `COLOR_IDS`. Do not renumber
 * existing IDs — they are stable references.
 */
export type ColorId = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6';

export interface PaletteEntry {
  hex: string;
  /** Display label, Norwegian Bokmål. */
  label: string;
}

export const PALETTE: Record<ColorId, PaletteEntry> = {
  c1: { hex: '#D8281A', label: 'Rød' },
  c2: { hex: '#E2872D', label: 'Oransje' },
  c3: { hex: '#E5C72D', label: 'Gul' },
  c4: { hex: '#2E7D32', label: 'Grønn' },
  c5: { hex: '#3070C0', label: 'Blå' },
  c6: { hex: '#7A4FB0', label: 'Lilla' },
};

export const COLOR_IDS: ColorId[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

export function paletteHex(id: ColorId): string {
  return (PALETTE[id] ?? PALETTE.c1).hex;
}

export function paletteLabel(id: ColorId): string {
  return (PALETTE[id] ?? PALETTE.c1).label;
}

export function isColorId(v: unknown): v is ColorId {
  return typeof v === 'string' && (COLOR_IDS as readonly string[]).includes(v);
}
