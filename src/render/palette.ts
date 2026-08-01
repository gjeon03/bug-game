/** The restrained palette from ART_BIBLE.md. Every colour in the game comes from here. */
export const PAL = {
  ink: '#05070b',
  slate: '#131c24',
  steel: '#26323c',
  chalk: '#3d4c58',
  amber: '#c07a34',
  umber: '#6b3f18',
  warm: '#ffbb66',
  cold: '#7fa9c8',
  danger: '#ff6b4a',
  toxin: '#b9f27c',
  bone: '#e8f0ff',
} as const;

export const AMBIENT_DARK = { r: 26, g: 36, b: 48 };

/** Roach colour sets. Scout is brighter and warmer so it never gets lost in a crowd. */
export interface RoachPalette {
  bodyLo: string;
  bodyHi: string;
  shell: string;
  shellHi: string;
  head: string;
  leg: string;
  rim: string;
  spec: string;
}

export const SCOUT_PAL: RoachPalette = {
  bodyLo: '#4a2a0e',
  bodyHi: '#a4652a',
  shell: '#5e3512',
  shellHi: '#d08a3e',
  head: '#3a220c',
  leg: '#2a1808',
  rim: '#150c04',
  spec: '#f0c07a',
};

export const WORKER_PAL: RoachPalette = {
  bodyLo: '#38200b',
  bodyHi: '#7a4a1f',
  shell: '#472909',
  shellHi: '#9c6128',
  head: '#2a1808',
  leg: '#1e1206',
  rim: '#100a03',
  spec: '#c08a4a',
};

export const NYMPH_PAL: RoachPalette = {
  bodyLo: '#6a5540',
  bodyHi: '#c9ab86',
  shell: '#7d6448',
  shellHi: '#d8bd9a',
  head: '#5a4632',
  leg: '#4a3826',
  rim: '#2e2418',
  spec: '#f2e2c8',
};

export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * Two extra worker colourings.
 *
 * A colony drawn from a single sprite reads as a chain of stamped decals however well the individual
 * sprite is drawn — a critic counted nine roaches around the nest in identical poses and called them
 * exactly that. Three bakes cost two extra atlas rows and nothing at runtime, and they are the
 * cheapest possible way to make a crowd look like animals rather than like a pattern.
 */
export const WORKER_PAL_DARK: RoachPalette = {
  bodyLo: '#2a1806',
  bodyHi: '#5e3714',
  shell: '#341d05',
  shellHi: '#7b4a1c',
  head: '#1e1105',
  leg: '#160c04',
  rim: '#0b0602',
  spec: '#9a6c36',
};

export const WORKER_PAL_PALE: RoachPalette = {
  bodyLo: '#4a2f14',
  bodyHi: '#96613a',
  shell: '#5b3a15',
  shellHi: '#b87f45',
  head: '#3a2410',
  leg: '#2a1a0b',
  rim: '#180e05',
  spec: '#dcac6c',
};
