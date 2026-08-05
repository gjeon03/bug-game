import type * as THREE from 'three';
import type { Kit } from '../shapes';

/**
 * The prop-builder contract.
 *
 * One function per authored object in the apartment, keyed by the `kind` string its `PropPlacement`
 * names. Builders are pure: they receive a kit and options and return an `Object3D` built around
 * its own origin, with the origin at the point the placement's `at` refers to — usually where the
 * object meets the surface it stands on.
 *
 * ## Why a registry and not a switch
 *
 * 175 props. A registry keyed by string means the world data and the geometry are validated against
 * each other at load (`missingBuilders` below), so a typo in a region file is a startup error
 * naming the offender rather than a silently absent object nobody notices until a critic does.
 */

export type PropOptions = Readonly<Record<string, number | string | boolean>>;

export type PropBuilder = (kit: Kit, options: PropOptions) => THREE.Object3D;

export type PropRegistry = Readonly<Record<string, PropBuilder>>;

/** Read a numeric option with a default. Non-numeric values fall back rather than producing NaN. */
export function num(options: PropOptions, key: string, fallback: number): number {
  const value = options[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function str(options: PropOptions, key: string, fallback: string): string {
  const value = options[key];
  return typeof value === 'string' ? value : fallback;
}

export function bool(options: PropOptions, key: string, fallback: boolean): boolean {
  const value = options[key];
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Which prop kinds the world asks for but no builder provides.
 *
 * Called at scene construction. An unbuilt prop is a hole in the apartment and, under the asset
 * contract, a completion blocker — so it is surfaced as data rather than left for someone to
 * notice in a screenshot.
 */
export function missingBuilders(registry: PropRegistry, kinds: Iterable<string>): readonly string[] {
  const missing = new Set<string>();
  for (const kind of kinds) {
    if (!(kind in registry)) missing.add(kind);
  }
  return [...missing].sort();
}
