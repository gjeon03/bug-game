import { clamp01 } from '../core/math.ts';
import { WORLD_H, WORLD_W } from './constants.ts';
import type { World } from './world.ts';

/**
 * Regional evidence.
 *
 * The old design carried one global suspicion scalar, so the household could learn *that* it had a
 * problem but never *where*. Traps could not be aimed at the player's choices, cleaning could not
 * punish a corridor, and route geometry had no persistent consequence — which is most of why attacks
 * felt arbitrary.
 *
 * This grid is the household's memory of place. Everything the colony does deposits into the cell it
 * happened in; the director reads the grid to decide where to look, wipe, trap and spray.
 */

export const HEAT_COLS = 12;
export const HEAT_ROWS = 9;
export const HEAT_CELL_W = WORLD_W / HEAT_COLS;
export const HEAT_CELL_H = WORLD_H / HEAT_ROWS;
export const HEAT_CELLS = HEAT_COLS * HEAT_ROWS;

/** A cell at or above this reads as "the household knows about this place". */
export const HEAT_KNOWN = 0.42;
/** Per-second decay of live heat toward the cell's own floor. */
export const HEAT_DECAY = 0.021;
/**
 * Evidence is not erasable. A cell never falls below this fraction of the worst it ever was, so a
 * corridor the player hammered stays a known corridor for the rest of the run even after they stop
 * using it. This is what makes "abandon the compromised route" a real decision instead of a reset.
 */
export const HEAT_FLOOR_FRACTION = 0.45;

export interface HeatGrid {
  /** Live heat per cell, 0..1. */
  value: Float32Array;
  /** Highest value each cell has ever held, which sets its floor. */
  peak: Float32Array;
}

export function createHeatGrid(): HeatGrid {
  return { value: new Float32Array(HEAT_CELLS), peak: new Float32Array(HEAT_CELLS) };
}

export function heatIndexAt(x: number, y: number): number {
  const cx = Math.min(HEAT_COLS - 1, Math.max(0, Math.floor(x / HEAT_CELL_W)));
  const cy = Math.min(HEAT_ROWS - 1, Math.max(0, Math.floor(y / HEAT_CELL_H)));
  return cy * HEAT_COLS + cx;
}

export function heatCellCentre(index: number): { x: number; y: number } {
  const cx = index % HEAT_COLS;
  const cy = Math.floor(index / HEAT_COLS);
  return { x: (cx + 0.5) * HEAT_CELL_W, y: (cy + 0.5) * HEAT_CELL_H };
}

export function depositHeat(world: World, x: number, y: number, amount: number): void {
  if (amount <= 0) return;
  const g = world.heat;
  const i = heatIndexAt(x, y);
  g.value[i] = clamp01(g.value[i] + amount);
  if (g.value[i] > g.peak[i]) g.peak[i] = g.value[i];
}

export function heatAt(world: World, x: number, y: number): number {
  return world.heat.value[heatIndexAt(x, y)];
}

export function updateHeat(world: World, dt: number): void {
  const g = world.heat;
  for (let i = 0; i < HEAT_CELLS; i++) {
    const floor = g.peak[i] * HEAT_FLOOR_FRACTION;
    if (g.value[i] > floor) g.value[i] = Math.max(floor, g.value[i] - HEAT_DECAY * dt);
  }
}

export interface HotCell {
  index: number;
  x: number;
  y: number;
  heat: number;
}

/**
 * The hottest cell the household has not recently acted on.
 *
 * `exclude` lets the director avoid stacking every response on the single worst corridor, so
 * pressure spreads across the map the way the player's traffic does.
 */
export function hottestCell(world: World, exclude: (index: number) => boolean): HotCell | null {
  const g = world.heat;
  let best = -1;
  let bestHeat = 0;
  for (let i = 0; i < HEAT_CELLS; i++) {
    if (g.value[i] <= bestHeat || exclude(i)) continue;
    bestHeat = g.value[i];
    best = i;
  }
  if (best < 0) return null;
  const c = heatCellCentre(best);
  return { index: best, x: c.x, y: c.y, heat: bestHeat };
}

/** Total live heat, used as the regional half of the household's alert level. */
export function totalHeat(world: World): number {
  const g = world.heat;
  let sum = 0;
  for (let i = 0; i < HEAT_CELLS; i++) sum += g.value[i];
  return sum;
}

/** How many cells the household would describe as "somewhere we have seen them". */
export function knownCellCount(world: World): number {
  const g = world.heat;
  let n = 0;
  for (let i = 0; i < HEAT_CELLS; i++) if (g.value[i] >= HEAT_KNOWN) n++;
  return n;
}
