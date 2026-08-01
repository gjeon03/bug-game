/**
 * Hand-authored inline SVG icons — no icon font, no sprite fetch.
 *
 * Every HUD meter pairs an icon with a shape, a fill and a numeral so nothing is encoded by colour
 * alone (ART_BIBLE / accessibility rule).
 */
const wrap = (body: string, stroke = 'currentColor'): string =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  food: wrap(
    '<path d="M4 15c2-4 5-6 8-6s6 2 8 6"/><circle cx="8.5" cy="16.5" r="1.6"/><circle cx="14" cy="17" r="2.1"/><circle cx="18.5" cy="15.5" r="1.3"/>',
    '#c9a468',
  ),
  water: wrap(
    '<path d="M12 3.5c3.4 4.2 5.4 7 5.4 9.6A5.4 5.4 0 0 1 12 18.5a5.4 5.4 0 0 1-5.4-5.4C6.6 10.5 8.6 7.7 12 3.5Z"/>',
    '#7fa9c8',
  ),
  pop: wrap(
    '<ellipse cx="12" cy="14" rx="4.2" ry="6"/><ellipse cx="12" cy="9" rx="3.2" ry="2.6"/><path d="M9 5.5 6 3M15 5.5 18 3M8 12 4.5 10.5M8 16 4.5 17.5M16 12l3.5-1.5M16 16l3.5 1.5"/>',
    '#d08a3e',
  ),
  brood: wrap(
    '<ellipse cx="9" cy="13" rx="3" ry="4"/><ellipse cx="15.5" cy="15" rx="2.4" ry="3.2"/><ellipse cx="14" cy="8.5" rx="2.2" ry="2.9"/>',
    '#b8a0e8',
  ),
  stamina: wrap('<path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z"/>', '#cfe2f2'),
  pheromone: wrap(
    '<circle cx="5" cy="18" r="1.6"/><circle cx="10" cy="14" r="1.4"/><circle cx="14.5" cy="10.5" r="1.2"/><circle cx="18.5" cy="6.5" r="1"/><path d="M4 7c2.5 0 2.5 3 5 3" opacity=".55"/>',
    '#79e6d6',
  ),
  eye: wrap(
    '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    '#ff6b4a',
  ),
  warn: wrap(
    '<path d="M12 3.5 21.5 20H2.5L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.4" r=".9" fill="currentColor"/>',
    '#ff6b4a',
  ),
} as const;
