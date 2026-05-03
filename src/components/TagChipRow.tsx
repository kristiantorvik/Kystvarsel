import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ColorId } from '../domain/palette';
import { paletteHex } from '../domain/palette';

export interface TagChipItem {
  id: string;
  name: string;
  colorId: ColorId;
  /** Optional small count shown in parens after the name. */
  count?: number;
}

interface Props {
  tags: TagChipItem[];
  /** IDs currently selected (for filter mode) or attached (for form mode). */
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /**
   * Optional leading "Alle" pseudo-chip. When tapped, calls `onClear`.
   * Visually active (filled with the brand colour) when the selection set
   * is empty.
   */
  onClear?: () => void;
  /** Optional trailing "Uten tagg" sentinel chip. Tapping toggles via `onToggleUntagged`. */
  untaggedSelected?: boolean;
  onToggleUntagged?: () => void;
  clearLabel?: string;
  untaggedLabel?: string;
  /** Emptier visual variant for the SpotForm context (no border on inactive chips). */
  variant?: 'filter' | 'form';
}

/**
 * Horizontal scrollable strip of colour-coded tag chips. Used in two modes:
 *
 *   - filter mode (SpotsListScreen): leading "Alle" clears, trailing
 *     "Uten tagg" filters to spots with zero attachments.
 *   - form mode (SpotFormScreen): no leading/trailing pseudo-chips, just
 *     the tag list with toggleable selection state representing what's
 *     attached to the spot being edited.
 *
 * Selection state is owned by the parent — this component is presentational.
 */
export function TagChipRow({
  tags,
  selected,
  onToggle,
  onClear,
  untaggedSelected,
  onToggleUntagged,
  clearLabel = 'Alle',
  untaggedLabel = 'Uten tagg',
  variant = 'filter',
}: Props) {
  const allCleared = selected.size === 0 && !untaggedSelected;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // Disable nested scroll bounce inside lists — keeps the chip row from
      // rubber-banding when the user pans the list below it.
      bounces={false}
    >
      {onClear && (
        <Pressable
          onPress={onClear}
          style={[styles.chip, allCleared ? styles.chipBrandActive : styles.chipNeutral]}
        >
          <Text style={allCleared ? styles.chipTextActive : styles.chipText}>
            {clearLabel}
          </Text>
        </Pressable>
      )}

      {tags.map((t) => {
        const active = selected.has(t.id);
        // Active chip: use the tag colour as the fill so the chip itself
        // visually "is" the tag. Inactive: just a small swatch + label so
        // the row stays scannable when many tags are present.
        const chipStyle = active
          ? [styles.chip, { backgroundColor: paletteHex(t.colorId), borderColor: paletteHex(t.colorId) }]
          : variant === 'form'
            ? [styles.chip, styles.chipFormInactive]
            : [styles.chip, styles.chipNeutral];
        const labelStyle = active ? styles.chipTextOnColor : styles.chipText;
        return (
          <Pressable key={t.id} onPress={() => onToggle(t.id)} style={chipStyle}>
            {!active && <View style={[styles.dot, { backgroundColor: paletteHex(t.colorId) }]} />}
            <Text style={labelStyle}>
              {t.name}
              {t.count != null ? ` (${t.count})` : ''}
            </Text>
          </Pressable>
        );
      })}

      {onToggleUntagged && (
        <Pressable
          onPress={onToggleUntagged}
          style={[styles.chip, untaggedSelected ? styles.chipBrandActive : styles.chipNeutral]}
        >
          <Text style={untaggedSelected ? styles.chipTextActive : styles.chipText}>
            {untaggedLabel}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  chipNeutral: { borderColor: '#CCD3DA', backgroundColor: '#F4F6F8' },
  chipFormInactive: { borderColor: '#CCD3DA', backgroundColor: '#fff' },
  chipBrandActive: { borderColor: '#0E3A5F', backgroundColor: '#0E3A5F' },
  chipText: { color: '#0E3A5F', fontSize: 12, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontSize: 12, fontWeight: '600' },
  chipTextOnColor: { color: '#fff', fontSize: 12, fontWeight: '600' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
