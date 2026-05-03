import type { ColorId } from './palette';

/**
 * A user-defined label that can be attached to any number of spots.
 * Many-to-many — a spot can have 0..N tags, a tag can be on 0..N spots.
 *
 * `name` is unique (case-sensitive) — collisions are rejected at write
 * time in the repository so the UI doesn't get into a state where two
 * tags look identical in the chip row but address different rows.
 */
export interface Tag {
  id: string;
  name: string;
  colorId: ColorId;
  createdAt: string;
  updatedAt: string;
}

/** Tag with the count of attached spots — used in management lists. */
export interface TagWithCount extends Tag {
  spotCount: number;
}
