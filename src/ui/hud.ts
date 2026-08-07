import { t } from '../i18n';
import { REGION_ORDER, type RegionId } from '../world/types';
import { storeCap } from '../colony/state';
import { adaptationOffers } from '../colony/progression';
import type { Run, RunEvent } from '../colony/types';

/**
 * The heads-up display.
 *
 * ## This is the only place player-facing text is produced
 *
 * Simulation state carries catalog keys and params. `t()` is called here and nowhere in
 * `src/colony/` or `src/world/`. That is a structural guarantee, not a convention: there is no
 * string in the simulation that *could* reach a player untranslated, which is the defect this
 * project shipped once before and detected only by opening a real browser.
 *
 * ## Why a dirty-diff rather than a framework
 *
 * The HUD updates every frame and almost nothing in it changes on most frames. Writing `innerHTML`
 * unconditionally at 60 Hz forces layout every time. Each slot caches the string it last wrote and
 * skips the DOM entirely when it is unchanged, which turns the HUD from a per-frame layout cost
 * into approximately nothing.
 */

const LOG_LINES = 6;

interface Slot {
  readonly node: HTMLElement;
  last: string;
}

function slot(node: HTMLElement): Slot {
  return { node, last: ' ' };
}

function write(target: Slot, html: string): void {
  if (target.last === html) return;
  target.last = html;
  target.node.innerHTML = html;
}

function toggle(node: HTMLElement, on: boolean, className = 'on'): void {
  if (node.classList.contains(className) === on) return;
  node.classList.toggle(className, on);
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape anything that reaches innerHTML. Catalog text is ours, but params may not be. */
function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * Resolve a param that is itself a catalog key.
 *
 * The simulation passes things like `{ region: 'region.kitchen' }`. A key looks like a dotted
 * lowercase identifier; anything else is a literal value (a count, a number).
 */
function resolveParams(params: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = typeof value === 'string' && /^[a-z][a-zA-Z0-9]*\./.test(value) ? t(value) : value;
  }
  return out;
}

export type CurtainKind = 'help' | 'pause' | 'won' | 'lost';

export interface PromptState {
  readonly key: string;
  readonly labelKey: string;
  readonly params?: Record<string, string | number>;
}

export interface Hud {
  update(run: Run, seenFraction: number, prompt: PromptState | null): void;
  showCurtain(kind: CurtainKind, run: Run): void;
  hideCurtain(): void;
  readonly curtain: CurtainKind | null;
  dispose(): void;
}

export function createHud(rootId = 'hud'): Hud {
  const root = document.getElementById(rootId);
  if (!root) throw new Error(`HUD root #${rootId} not found`);

  root.innerHTML = [
    '<div id="objective" class="panel"></div>',
    '<div id="seen"></div>',
    '<div id="down"></div>',
    '<div id="stores" class="panel"></div>',
    '<div id="routes" class="panel"></div>',
    '<div id="regions" class="panel"></div>',
    '<div id="prompt"></div>',
    '<div id="log"></div>',
  ].join('');

  const choice = document.createElement('div');
  choice.id = 'choice';
  choice.innerHTML = '<div class="cards"></div>';
  document.body.appendChild(choice);

  const curtainNode = document.createElement('div');
  curtainNode.id = 'curtain';
  curtainNode.innerHTML = '<div class="sheet panel"></div>';
  document.body.appendChild(curtainNode);

  const objective = slot(root.querySelector('#objective') as HTMLElement);
  const stores = slot(root.querySelector('#stores') as HTMLElement);
  const routes = slot(root.querySelector('#routes') as HTMLElement);
  const regions = slot(root.querySelector('#regions') as HTMLElement);
  const log = slot(root.querySelector('#log') as HTMLElement);
  const promptNode = root.querySelector('#prompt') as HTMLElement;
  const prompt = slot(promptNode);
  const seenNode = root.querySelector('#seen') as HTMLElement;
  const seen = slot(seenNode);
  const downNode = root.querySelector('#down') as HTMLElement;
  const downSlot = slot(downNode);
  const cards = slot(choice.querySelector('.cards') as HTMLElement);
  const sheet = slot(curtainNode.querySelector('.sheet') as HTMLElement);

  let curtain: CurtainKind | null = null;

  return {
    get curtain() {
      return curtain;
    },

    update(run, seenFraction, promptState) {
      renderObjective(objective, run);
      renderStores(stores, run);
      renderRoutes(routes, run);
      renderRegions(regions, run);
      renderLog(log, run.log);

      if (promptState) {
        const label = t(promptState.labelKey, resolveParams(promptState.params ?? {}));
        // An empty key means "this is a status line, not an action" — draw no chip. It used to
        // render an empty bordered box, which is what the player saw for the whole of the walk
        // between starting a route and sealing it.
        const chip = promptState.key ? `<span class="key">${esc(promptState.key)}</span>` : '';
        write(prompt, `${chip}${esc(label)}`);
      }
      toggle(promptNode, promptState !== null);

      /*
       * One meter, two meanings, and the more urgent one wins.
       *
       * `seen` is the slow question — is the household about to learn I exist. `caught` is the fast
       * one — is something about to land on me. They cannot both own the centre of the screen, and
       * when both are live the second is the only one the player can still do anything about, so it
       * takes the slot and says so with its own colour.
       *
       * Both stay hidden at rest. A permanent risk bar is wallpaper; one that fades in when the
       * light finds you is information.
       */
      const crushing = run.scout.caught > 0.02;
      const visible = crushing || seenFraction > 0.06;
      if (visible) {
        const fraction = crushing ? run.scout.caught : seenFraction;
        const pct = Math.round(fraction * 100);
        write(
          seen,
          `<div class="label">${esc(t(crushing ? 'hud.caught' : 'hud.seen'))}</div>` +
            `<div class="bar"><i style="width:${pct}%"></i></div>`,
        );
      }
      seenNode.classList.toggle('crush', crushing);
      toggle(seenNode, visible);

      // Losing the scout is the one moment the player has no body. Say so, or the dead controls
      // read as the game having frozen.
      const down = run.scout.downFor > 0;
      if (down) write(downSlot, esc(t('hud.down')));
      toggle(downNode, down);

      const offering = run.colony.adaptationPoints > 0;
      if (offering) renderChoices(cards, run);
      toggle(choice, offering);
    },

    showCurtain(kind, run) {
      curtain = kind;
      write(sheet, curtainHtml(kind, run));
      toggle(curtainNode, true);
    },

    hideCurtain() {
      curtain = null;
      toggle(curtainNode, false);
    },

    dispose() {
      root.innerHTML = '';
      choice.remove();
      curtainNode.remove();
    },
  };
}

/* ------------------------------------------------------------------ panels */

function renderObjective(target: Slot, run: Run): void {
  const o = run.objective;
  const body = t(o.bodyKey, resolveParams(o.params));
  const blocker = o.blockerKey ? t(o.blockerKey, resolveParams(o.blockerParams)) : '';
  const progress = Math.round(o.progress * 100);

  write(
    target,
    `<div class="chapter">${esc(t(o.titleKey))}</div>` +
      `<div class="body">${esc(body)}</div>` +
      (blocker ? `<div class="blocker">${esc(blocker)}</div>` : '') +
      (progress > 0 ? `<div class="progress"><i style="width:${progress}%"></i></div>` : ''),
  );
}

function bar(value: number, max: number): string {
  const pct = Math.round(Math.min(1, value / Math.max(1, max)) * 100);
  return `<div class="bar"><i style="width:${pct}%"></i></div>`;
}

function renderStores(target: Slot, run: Run): void {
  const cap = storeCap(run);
  const c = run.colony;
  const atCap = c.food >= cap - 0.5 || c.moisture >= cap - 0.5;

  write(
    target,
    `<div class="stat food"><span class="label">${esc(t('hud.food'))}</span>` +
      `${bar(c.food, cap)}<span class="value">${Math.floor(c.food)}</span></div>` +
      `<div class="stat moisture"><span class="label">${esc(t('hud.moisture'))}</span>` +
      `${bar(c.moisture, cap)}<span class="value">${Math.floor(c.moisture)}</span></div>` +
      `<div class="stat population"><span class="label">${esc(t('hud.population'))}</span>` +
      `${bar(c.population, Math.max(1, c.capacity))}` +
      `<span class="value">${c.population}/${c.capacity}</span></div>` +
      (atCap ? `<div class="blocker">${esc(t('hud.stores'))}</div>` : '') +
      (c.broodHold ? `<div class="blocker">${esc(t('hud.broodHold'))}</div>` : ''),
  );
}

/**
 * Every live route and what is wrong with it.
 *
 * The catalog has carried seven route-health sentences since the localization pass and nothing
 * rendered any of them — an independent critic found all seven referenced only by `src/i18n/`. A
 * route that has silently stopped delivering is the single most confusing state in the game, and
 * the game already knew exactly why in every case.
 */
function renderRoutes(target: Slot, run: Run): void {
  if (run.routes.length === 0) {
    write(target, '');
    return;
  }
  const rows = run.routes.slice(0, 6).map((route) => {
    const site = run.house.resources.get(route.target);
    const name = site ? t(site.labelKey) : route.target;
    const health = t(`hud.routeHealth.${route.health}`);
    const workers = route.assigned;
    return (
      `<div class="route" data-health="${route.health}">` +
      `<span class="name">${esc(name)}</span>` +
      `<span class="carry">${workers}</span>` +
      `<span class="state">${esc(health)}</span></div>`
    );
  });
  write(target, `<div class="title">${esc(t('hud.routes'))}</div>${rows.join('')}`);
}

function renderRegions(target: Slot, run: Run): void {
  const rows: string[] = [];
  for (const id of REGION_ORDER) {
    const state = run.regions.get(id as RegionId);
    if (!state) continue;
    const heat = Math.round(Math.min(1, state.evidence) * 100);
    rows.push(
      `<div class="region${state.unlocked ? '' : ' locked'}" data-alert="${state.alert}">` +
        `<span class="name">${esc(t(`region.${id}`))}</span>` +
        `<div class="heat"><i style="width:${heat}%"></i></div>` +
        `<span class="level">${esc(t(`alert.${state.alert}`))}</span></div>`,
    );
  }
  write(target, rows.join(''));
}

function renderLog(target: Slot, entries: readonly RunEvent[]): void {
  const lines = entries.slice(0, LOG_LINES).map((entry) => {
    const text = t(entry.key, resolveParams(entry.params));
    return `<div class="entry ${entry.severity}">${esc(text)}</div>`;
  });
  write(target, lines.join(''));
}

function renderChoices(target: Slot, run: Run): void {
  const cards = adaptationOffers(run).map((offer, index) => {
    const spent = !offer.available;
    return (
      `<div class="card panel${spent ? ' spent' : ''}">` +
      `<div class="key">${index + 1}</div>` +
      `<div class="name">${esc(t(offer.labelKey))}</div>` +
      `<div class="desc">${esc(t(offer.bodyKey))}</div></div>`
    );
  });
  write(target, cards.join(''));
}

/* ------------------------------------------------------------------ curtain */

const HELP_LINES: readonly string[] = [
  'help.move',
  'help.sprint',
  'help.route',
  'help.erase',
  'help.interact',
  'help.traverse',
  'help.adapt',
  'help.broodHold',
  'help.pause',
  'help.restart',
];

function curtainHtml(kind: CurtainKind, run: Run): string {
  if (kind === 'help') {
    const lines = HELP_LINES.map((key) => `<li>${esc(t(key))}</li>`).join('');
    return (
      `<h1>${esc(t('help.title'))}</h1>` +
      `<p>${esc(t('help.intro'))}</p>` +
      `<ul>${lines}</ul>` +
      `<div class="foot">${esc(t('help.dismiss'))}</div>`
    );
  }

  if (kind === 'pause') {
    /*
     * The pause card carries the full control list, because the help card cannot be reopened.
     *
     * `input.ts` pushes a `dismiss` on every keydown and `showCurtain('help', …)` has exactly one
     * call site — at boot. So the ten control lines are on screen until the player's first keypress
     * and then gone for the rest of the session, including across restarts. Four of those bindings
     * (F, G, H, Shift) appear nowhere else in the game, and two of them are the pheromone keys.
     *
     * Esc already pauses, so the recovery path exists; it just had nothing on it.
     */
    // Esc and R are already the two lines framing this card, so they are dropped from the list
    // rather than printed twice.
    const lines = HELP_LINES.filter((key) => key !== 'help.pause' && key !== 'help.restart')
      .map((key) => `<li>${esc(t(key))}</li>`)
      .join('');
    return (
      `<h1>${esc(t('pause.title'))}</h1>` +
      `<p>${esc(t('pause.resume'))}</p>` +
      `<ul>${lines}</ul>` +
      `<div class="foot">${esc(t('pause.restart'))}</div>`
    );
  }

  const won = kind === 'won';
  const minutes = Math.floor(run.time / 60);
  const seconds = Math.floor(run.time % 60);
  const stats = [
    t('result.time', { minutes, seconds }),
    t('result.deliveries', { count: run.stats.deliveries }),
    t('result.peak', { count: run.stats.peakPopulation }),
    t('result.sightings', { count: run.stats.sightings }),
    t('result.lost.workers', { count: run.stats.workersLost }),
    /*
     * Was `result.regions` — "연 구역 {count}곳", regions opened.
     *
     * `regionsOpened` starts at 1 and is only ever incremented by `openGate`, and no gate ships, so
     * the run summary closed with a line that read "opened 1 region" on every run that has ever been
     * played on this branch. A number that cannot change is not a result.
     *
     * Scouts lost is the one it should have been: it is the only stat on this card that is about the
     * player's own body rather than the colony's, and until this round it was always zero because
     * nothing in the game could kill them.
     */
    t('result.scoutsLost', { count: run.stats.scoutsLost }),
  ]
    .map((line) => `<div>${esc(line)}</div>`)
    .join('');

  return (
    `<h1>${esc(t(won ? 'result.won.title' : 'result.lost.title'))}</h1>` +
    `<p>${esc(t(won ? 'result.won.body' : 'result.lost.body'))}</p>` +
    `<div class="stats">${stats}</div>` +
    `<div class="foot">${esc(t('result.restart'))}</div>`
  );
}
