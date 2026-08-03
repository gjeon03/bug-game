import { t } from '../i18n/index.ts';
import { specById } from '../sim/adaptations.ts';
import { operationSpec } from '../sim/operations.ts';
import { CAUSE_LABELS, tierName, topCause } from '../sim/suspicion.ts';
import { ZONES } from '../sim/territory.ts';
import type { DeathCause } from '../sim/types.ts';

/** Plain-language cause of death for the debrief. */
const DEATH_LABELS: Record<DeathCause, string> = {
  foot: t('outcome.death.foot'),
  trap: t('outcome.death.trap'),
  spray: t('outcome.death.spray'),
  bait: t('outcome.death.bait'),
  starve: t('outcome.death.starve'),
  thirst: t('outcome.death.thirst'),
};
import type { World } from '../sim/world.ts';
import { loadBestRun, type Settings } from './settings.ts';

export type OverlayKind = 'none' | 'pause' | 'operation' | 'win' | 'lose' | 'help';

export interface OverlayCallbacks {
  resume: () => void;
  restart: () => void;
  skipInterlude: () => void;
  settingsChanged: () => void;
}

const CONTROLS: [string, string][] = [
  ['W A S D', t('control.move')],
  // The key-cap column is legends, not prose — except these two, which carry the English word
  // "Hold". The catalog has no key for them yet; `t()` flags them in MISSING_KEYS until it does.
  [t('control.key.lay'), t('control.lay')],
  [t('control.key.erase'), t('control.erase')],
  ['E', t('control.interact')],
  ['SHIFT', t('control.sprint')],
  ['ESC / P', t('control.pause')],
  ['R', t('control.restart')],
];

/**
 * Every full-screen card: pause + settings, the between-night household reaction, and the two end
 * states. All of them are one keypress from playing again.
 */
export class Overlays {
  kind: OverlayKind = 'none';
  private root: HTMLElement;

  constructor(
    root: HTMLElement,
    private settings: Settings,
    private cb: OverlayCallbacks,
  ) {
    this.root = root;
  }

  get visible(): boolean {
    return this.kind !== 'none';
  }

  hide(): void {
    this.kind = 'none';
    this.root.classList.remove('on');
    this.root.innerHTML = '';
  }

  private show(kind: OverlayKind, html: string): void {
    this.kind = kind;
    this.root.innerHTML = html;
    this.root.classList.add('on');
    this.bind();
    const primary = this.root.querySelector<HTMLButtonElement>('button.primary');
    primary?.focus();
  }

  private bind(): void {
    this.root
      .querySelector('[data-act="resume"]')
      ?.addEventListener('click', () => this.cb.resume());
    this.root
      .querySelector('[data-act="restart"]')
      ?.addEventListener('click', () => this.cb.restart());
    this.root
      .querySelector('[data-act="continue"]')
      ?.addEventListener('click', () => this.cb.skipInterlude());
    this.root.querySelector('[data-act="help"]')?.addEventListener('click', () => this.showHelp());

    this.root.querySelectorAll<HTMLInputElement>('[data-set]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.set as keyof Settings;
        if (input.type === 'checkbox') {
          (this.settings[key] as boolean) = input.checked;
        } else {
          (this.settings[key] as number) = Number(input.value) / 100;
          const out = input.parentElement?.querySelector('.val');
          if (out) out.textContent = `${input.value}%`;
        }
        this.cb.settingsChanged();
      });
    });
  }

  showPause(world: World): void {
    this.show(
      'pause',
      `<div class="card">
        <h2>${t('pause.heading')}</h2>
        <h1>${t('pause.wordmark')}</h1>
        <p class="lede">${t('pause.lede', {
          operation: world.hud.operation,
          tier: tierName(world.suspicion.tier),
          population: world.colony.population,
        })}</p>
        ${this.settingsHtml()}
        <h2 style="margin-top:22px">${t('pause.controlsHeading')}</h2>
        <div class="keys">${CONTROLS.map(([k, d]) => `<div><kbd>${k}</kbd><span class="d">${d}</span></div>`).join('')}</div>
        <div class="row">
          <button class="primary" data-act="resume">${t('pause.resume')}</button>
          <button data-act="restart">${t('pause.restart')}</button>
        </div>
      </div>`,
    );
  }

  showHelp(): void {
    this.show(
      'help',
      `<div class="card">
        <h2>${t('pause.help.heading')}</h2>
        <h1>${t('pause.help.title')}</h1>
        <p class="lede">${t('pause.help.lede')}</p>
        <p>${t('pause.help.linking')}</p>
        <p>${t('pause.help.evidence')}</p>
        <div class="keys">${CONTROLS.map(([k, d]) => `<div><kbd>${k}</kbd><span class="d">${d}</span></div>`).join('')}</div>
        <div class="row"><button class="primary" data-act="resume">${t('pause.help.back')}</button></div>
      </div>`,
    );
  }

  /**
   * The operation card.
   *
   * Replaces the old between-nights interlude. It fires when the player *finishes* something, so it
   * is a reward beat rather than an interruption, and it names the next objective rather than the
   * next stretch of clock.
   */
  showOperationCard(world: World): void {
    const spec = operationSpec(world.operation);
    const c = world.colony;
    this.show(
      'operation',
      `<div class="card">
        <h2>${t('op.cardTitle', { index: spec.index })}</h2>
        <h1>${spec.title}</h1>
        <p class="lede">${spec.brief}</p>
        <ul class="criteria">
          ${spec.gates.map((g: { label: string }) => `<li class="pending"><span class="mark">▸</span>${g.label}</li>`).join('')}
        </ul>
        <p>${world.hud.forecast}</p>
        ${statsHtml([
          [t('op.card.stat.colony'), `${c.population}`],
          [t('op.card.stat.food'), `${Math.floor(c.food)}/${c.foodCap}`],
          [t('op.card.stat.water'), `${Math.floor(c.water)}/${c.waterCap}`],
          [t('op.card.stat.adaptations'), `${world.adaptations.taken.length}`],
          [t('op.card.stat.deliveries'), `${world.stats.deliveries}`],
          [t('op.card.stat.lost'), `${world.stats.workersLost}`],
        ])}
        <div class="row"><button class="primary" data-act="continue">${t('op.card.continue')}</button></div>
      </div>`,
    );
  }

  showEnd(world: World): void {
    const won = world.status === 'won';
    const c = world.colony;
    const top = topCause(world);
    const cause = world.loseCause;
    const title = won
      ? t('outcome.win.title')
      : cause === 'collapse'
        ? t('outcome.lose.collapse.title')
        : cause === 'nestDestroyed'
          ? t('outcome.lose.nestDestroyed.title')
          : t('outcome.lose.exterminated.title');
    const held = world.finalTally?.zones ?? [];
    const lede = won
      ? t('outcome.win.lede', {
          zones: held.length > 0 ? t('outcome.win.ledeZones', { zones: held.join(', ') }) : '',
        })
      : cause === 'collapse'
        ? t('outcome.lose.collapse.lede')
        : cause === 'nestDestroyed'
          ? t('outcome.lose.nestDestroyed.lede')
          : t('outcome.lose.exterminated.lede');

    const best = loadBestRun();
    const tally = world.finalTally ?? {
      population: c.population,
      food: c.food,
      water: c.water,
      hatched: c.hatched,
      lost: c.lost,
      deliveries: world.stats.deliveries,
      peakSuspicion: Math.round(world.suspicion.peak),
      topCause: null,
      topDeath: null,
      runSeconds: world.stats.runSeconds,
      operations: world.operation,
      zones: [],
      adaptations: world.adaptations.taken.length,
    };
    this.show(
      won ? 'win' : 'lose',
      `<div class="card ${won ? 'win' : 'lose'}">
        <h2>${t('outcome.subheading', {
          heading: won ? t('outcome.win.heading') : t('outcome.lose.heading'),
          operation: tally.operations,
        })}</h2>
        <h1>${title}</h1>
        <p class="lede">${lede}</p>
        ${
          !won
            ? `<p>${
                tally.topDeath
                  ? t('outcome.killedBy', {
                      cause:
                        DEATH_LABELS[tally.topDeath.cause as DeathCause] ?? tally.topDeath.cause,
                      count: tally.topDeath.count,
                    })
                  : t('outcome.killedByNothing')
              }${
                top
                  ? t('outcome.topEvidence', {
                      cause: CAUSE_LABELS[top.cause],
                      amount: Math.round(top.amount),
                    })
                  : ''
              }</p>`
            : ''
        }
        <ul class="criteria">
          ${[...world.zones]
            .sort((a, b) => b.hold - a.hold)
            .slice(0, 4)
            .map((st) => {
              const z = ZONES.find((zz: { id: string; name: string }) => zz.id === st.id);
              const pct = Math.round(st.hold * 100);
              return critLine(
                pct >= 80,
                t('outcome.zoneLine', { zone: z ? z.name : st.id }),
                `${pct}%`,
              );
            })
            .join('')}
        </ul>
        ${
          world.adaptations.taken.length > 0
            ? `<p>${t('outcome.became', {
                list: world.adaptations.taken.map((id) => specById(id)?.name ?? id).join(' · '),
              })}</p>`
            : `<p>${t('outcome.neverSpecialised')}</p>`
        }
        ${statsHtml([
          [t('outcome.stat.runTime'), formatTime(world.stats.runSeconds)],
          [t('outcome.stat.deliveries'), `${world.stats.deliveries}`],
          [t('outcome.stat.hatched'), `${c.hatched}`],
          [t('outcome.stat.lost'), `${world.stats.workersLost}`],
          [t('outcome.stat.scoutDeaths'), `${world.stats.scoutDeaths}`],
          [t('outcome.stat.peakSuspicion'), `${Math.round(world.suspicion.peak)}`],
          [t('outcome.stat.trapsSprung'), `${world.stats.trapsSprung}`],
          [t('outcome.stat.peakColony'), `${world.stats.peakPopulation}`],
        ])}
        ${
          best
            ? `<p style="color:var(--text-dim);font-size:12.5px">${t('outcome.best', {
                result: best.won ? t('outcome.best.survived') : t('outcome.best.lost'),
                population: best.population,
                time: formatTime(best.seconds),
              })}</p>`
            : ''
        }
        <div class="row">
          <button class="primary" data-act="restart">${t('outcome.restart')} <kbd>R</kbd></button>
          <button data-act="help">${t('outcome.help')}</button>
        </div>
      </div>`,
    );
  }

  private settingsHtml(): string {
    const s = this.settings;
    const slider = (key: keyof Settings, label: string): string =>
      `<label class="setting"><span>${label}</span>
        <input type="range" min="0" max="100" value="${Math.round((s[key] as number) * 100)}" data-set="${key}" />
        <span class="val">${Math.round((s[key] as number) * 100)}%</span></label>`;
    const toggle = (key: keyof Settings, label: string): string =>
      `<label class="toggle"><input type="checkbox" data-set="${key}" ${s[key] ? 'checked' : ''} /> ${label}</label>`;
    return `<div class="settings">
        ${slider('master', t('settings.master'))}
        ${slider('music', t('settings.music'))}
        ${slider('sfx', t('settings.sfx'))}
        ${toggle('muted', t('settings.muted'))}
        ${toggle('reducedShake', t('settings.reducedShake'))}
        ${toggle('reducedFlash', t('settings.reducedFlash'))}
        ${toggle('highContrast', t('settings.highContrast'))}
        ${toggle('showPerf', t('settings.showPerf'))}
      </div>`;
  }
}

function critLine(ok: boolean, label: string, value: string): string {
  return `<li class="${ok ? 'ok' : 'no'}"><span class="mark"></span><span>${label}</span><span style="margin-left:auto;font-family:var(--mono)">${value}</span></li>`;
}

function statsHtml(rows: [string, string][]): string {
  return `<div class="stats">${rows
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`)
    .join('')}</div>`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
