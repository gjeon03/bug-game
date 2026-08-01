import { readJson, writeJson } from '../core/storage.ts';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  reducedShake: boolean;
  reducedFlash: boolean;
  highContrast: boolean;
  showPerf: boolean;
  seenOnboarding: boolean;
}

export interface BestRun {
  won: boolean;
  seconds: number;
  population: number;
  suspicionPeak: number;
  deliveries: number;
}

const DEFAULTS: Settings = {
  master: 0.8,
  music: 0.7,
  sfx: 0.9,
  muted: false,
  reducedShake: false,
  reducedFlash: false,
  highContrast: false,
  showPerf: false,
  seenOnboarding: false,
};

/** Only presentation preferences and a best-run record ever touch storage — never gameplay state. */
export function loadSettings(): Settings {
  const raw = readJson<Partial<Settings>>('settings', {});
  return {
    master: clamp01(num(raw.master, DEFAULTS.master)),
    music: clamp01(num(raw.music, DEFAULTS.music)),
    sfx: clamp01(num(raw.sfx, DEFAULTS.sfx)),
    muted: bool(raw.muted, DEFAULTS.muted),
    reducedShake: bool(raw.reducedShake, DEFAULTS.reducedShake),
    reducedFlash: bool(raw.reducedFlash, DEFAULTS.reducedFlash),
    highContrast: bool(raw.highContrast, DEFAULTS.highContrast),
    showPerf: bool(raw.showPerf, DEFAULTS.showPerf),
    seenOnboarding: bool(raw.seenOnboarding, DEFAULTS.seenOnboarding),
  };
}

export function saveSettings(s: Settings): void {
  writeJson('settings', s);
}

export function loadBestRun(): BestRun | null {
  const raw = readJson<Partial<BestRun> | null>('best', null);
  if (!raw || typeof raw.seconds !== 'number') return null;
  return {
    won: !!raw.won,
    seconds: raw.seconds,
    population: num(raw.population, 0),
    suspicionPeak: num(raw.suspicionPeak, 0),
    deliveries: num(raw.deliveries, 0),
  };
}

export function saveBestRun(run: BestRun): void {
  const prev = loadBestRun();
  // A win always beats a loss; between two wins, the larger colony wins.
  if (prev && prev.won && (!run.won || run.population <= prev.population)) return;
  writeJson('best', run);
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
function bool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
