const PREFIX = 'bbe.';

/**
 * localStorage access that degrades to in-memory defaults instead of throwing.
 *
 * Private-mode Safari and blocked-storage contexts throw on both read and write, and a game that
 * crashes on boot because a settings read failed is a real shipped failure mode.
 */
const memory = new Map<string, string>();
let available: boolean | null = null;

function storageAvailable(): boolean {
  if (available !== null) return available;
  try {
    const probe = `${PREFIX}__probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = storageAvailable()
      ? window.localStorage.getItem(PREFIX + key)
      : (memory.get(key) ?? null);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== typeof fallback) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    if (storageAvailable()) window.localStorage.setItem(PREFIX + key, raw);
    else memory.set(key, raw);
  } catch {
    /* storage is optional; never block gameplay on it */
  }
}
