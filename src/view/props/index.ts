import type { PropRegistry } from './registry';
import { KITCHEN_PROPS } from './kitchen';
import { HALLWAY_PROPS } from './hallway';
import { LIVING_PROPS } from './living';
import { BATHROOM_PROPS } from './bathroom';
import { BEDROOM_PROPS } from './bedroom';

/**
 * Every buildable object in the apartment.
 *
 * Merged from five per-region files so no two regions can collide on a key — every kind is
 * namespaced by its room, and `scene.ts` reports anything the world asks for that is missing here
 * rather than quietly leaving a hole in the flat.
 */
export const PROPS: PropRegistry = {
  ...KITCHEN_PROPS,
  ...HALLWAY_PROPS,
  ...LIVING_PROPS,
  ...BATHROOM_PROPS,
  ...BEDROOM_PROPS,
};

export { missingBuilders, type PropBuilder, type PropRegistry } from './registry';
