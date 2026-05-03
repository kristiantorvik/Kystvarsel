/**
 * Module-level cache of the active spot filter (selected tag IDs +
 * "untagged" sentinel). Lives outside the SpotsListScreen so the filter
 * survives navigation away from the screen — push to SpotForm, edit a
 * tag, come back; the same chips stay selected.
 *
 * Not persisted across app restarts (matches what the user asked for:
 * in-session only). To persist, swap the in-memory store for the
 * settingsRepository and serialize the Set.
 */
export interface SpotFilterState {
  /** Tag IDs the user wants to see. Empty + !untaggedOnly = "show all". */
  selectedTagIds: Set<string>;
  /** When true, restrict to spots with zero attached tags. */
  untaggedOnly: boolean;
}

let cached: SpotFilterState = {
  selectedTagIds: new Set(),
  untaggedOnly: false,
};

export const rememberedSpotFilter = {
  get(): SpotFilterState {
    // Defensive copy of the Set so external mutation doesn't reach the
    // singleton. Cheap — typical user has a handful of tags selected.
    return {
      selectedTagIds: new Set(cached.selectedTagIds),
      untaggedOnly: cached.untaggedOnly,
    };
  },
  set(next: SpotFilterState): void {
    cached = {
      selectedTagIds: new Set(next.selectedTagIds),
      untaggedOnly: next.untaggedOnly,
    };
  },
  reset(): void {
    cached = { selectedTagIds: new Set(), untaggedOnly: false };
  },
};

/**
 * Apply the filter to a list of spots. Pure function so the SpotsList
 * screen can call it on each render without juggling state.
 *
 *   - No tags selected and !untaggedOnly → return all spots.
 *   - Tags selected → keep spots whose tag set intersects the selection
 *     (OR semantics — "any of").
 *   - untaggedOnly → keep spots with zero attached tags. OR'd with the
 *     tag selection: a spot matches if it has any selected tag OR has no
 *     tags at all.
 */
export function applySpotFilter<T extends { id: string }>(
  spots: T[],
  tagIdsBySpot: Map<string, string[]>,
  filter: SpotFilterState,
): T[] {
  const { selectedTagIds, untaggedOnly } = filter;
  if (selectedTagIds.size === 0 && !untaggedOnly) return spots;
  return spots.filter((s) => {
    const ids = tagIdsBySpot.get(s.id) ?? [];
    if (untaggedOnly && ids.length === 0) return true;
    if (selectedTagIds.size > 0) {
      for (const id of ids) {
        if (selectedTagIds.has(id)) return true;
      }
    }
    return false;
  });
}
