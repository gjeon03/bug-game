import { specById } from '../sim/adaptations.ts';
import { operationSpec } from '../sim/operations.ts';
import { CAUSE_LABELS, tierName, topCause } from '../sim/suspicion.ts';
import { ZONES } from '../sim/territory.ts';
import type { DeathCause } from '../sim/types.ts';

/** Plain-language cause of death for the debrief. */
const DEATH_LABELS: Record<DeathCause, string> = {
  foot: 'crushed underfoot',
  trap: 'caught on sticky traps',
  spray: 'killed by spray',
  bait: 'poisoned by bait',
  starve: 'starved — the larder ran dry',
  thirst: 'died of thirst — no moisture reached them',
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
  ['W A S D', 'Move the scout'],
  ['Hold LMB / SPACE', 'Lay a pheromone trail'],
  ['Hold RMB / X', 'Rub out a trail · tap to recall'],
  ['E', 'Inspect · claim a crack'],
  ['SHIFT', 'Sprint (loud, and it shows)'],
  ['ESC / P', 'Pause'],
  ['R', 'Restart'],
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
        <h2>Paused</h2>
        <h1>Baseboard Empire</h1>
        <p class="lede">${world.hud.operation} · ${tierName(world.suspicion.tier)} · ${world.colony.population} roaches</p>
        ${this.settingsHtml()}
        <h2 style="margin-top:22px">Controls</h2>
        <div class="keys">${CONTROLS.map(([k, d]) => `<div><kbd>${k}</kbd><span class="d">${d}</span></div>`).join('')}</div>
        <div class="row">
          <button class="primary" data-act="resume">Resume</button>
          <button data-act="restart">Restart run</button>
        </div>
      </div>`,
    );
  }

  showHelp(): void {
    this.show(
      'help',
      `<div class="card">
        <h2>How this works</h2>
        <h1>You are the scout, not the swarm</h1>
        <p class="lede">Workers never take orders. They read the pheromone you secrete with your own body — so the only route they can use is a route you personally walked.</p>
        <p>Link a <strong>claimed nest</strong> at one end to <strong>food or moisture</strong> at the other and the colony starts hauling. Both ends pulse warm when a route is live.</p>
        <p>Every metre of open tile you route across is evidence. Evidence raises suspicion, suspicion brings feet, traps and finally spray. Suspicion never returns to zero — you are choosing how much risk to carry, not grinding it away.</p>
        <div class="keys">${CONTROLS.map(([k, d]) => `<div><kbd>${k}</kbd><span class="d">${d}</span></div>`).join('')}</div>
        <div class="row"><button class="primary" data-act="resume">Back</button></div>
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
        <h2>Operation ${spec.index}</h2>
        <h1>${spec.title}</h1>
        <p class="lede">${spec.brief}</p>
        <ul class="criteria">
          ${spec.gates.map((g: { label: string }) => `<li class="pending"><span class="mark">▸</span>${g.label}</li>`).join('')}
        </ul>
        <p>${world.hud.forecast}</p>
        ${statsHtml([
          ['Colony', `${c.population}`],
          ['Food', `${Math.floor(c.food)}/${c.foodCap}`],
          ['Moisture', `${Math.floor(c.water)}/${c.waterCap}`],
          ['Adaptations', `${world.adaptations.taken.length}`],
          ['Deliveries', `${world.stats.deliveries}`],
          ['Lost', `${world.stats.workersLost}`],
        ])}
        <div class="row"><button class="primary" data-act="continue">Get to work</button></div>
      </div>`,
    );
  }

  showEnd(world: World): void {
    const won = world.status === 'won';
    const c = world.colony;
    const top = topCause(world);
    const cause = world.loseCause;
    const title = won
      ? 'The kitchen is yours'
      : cause === 'collapse'
        ? 'Colony collapsed'
        : cause === 'nestDestroyed'
          ? 'Nest destroyed'
          : 'Exterminated';
    const held = world.finalTally?.zones ?? [];
    const lede = won
      ? `The can is empty and you are still here. ${held.length > 0 ? `You hold ${held.join(', ')}.` : ''} They will never get all of you now.`
      : cause === 'collapse'
        ? 'Nothing left to send out. The last of the brood died in the dark.'
        : cause === 'nestDestroyed'
          ? 'They found the home crack and emptied a can into it.'
          : 'The sweep finished, and it finished you. The kitchen is quiet.';

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
        <h2>${won ? 'Victory' : 'Run over'} · operation ${tally.operations} of 4</h2>
        <h1>${title}</h1>
        <p class="lede">${lede}</p>
        ${
          !won
            ? `<p>${
                tally.topDeath
                  ? `<strong>What killed them:</strong> ${DEATH_LABELS[tally.topDeath.cause as DeathCause] ?? tally.topDeath.cause} — ${tally.topDeath.count} roach${tally.topDeath.count === 1 ? '' : 'es'}.`
                  : '<strong>What killed them:</strong> nothing reached them — the colony simply ran out.'
              }${
                top
                  ? ` <strong>Biggest evidence source:</strong> ${CAUSE_LABELS[top.cause]} (${Math.round(top.amount)} suspicion).`
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
              return critLine(pct >= 80, `Hold ${z ? z.name : st.id}`, `${pct}%`);
            })
            .join('')}
        </ul>
        ${
          world.adaptations.taken.length > 0
            ? `<p><strong>This colony became:</strong> ${world.adaptations.taken
                .map((id) => specById(id)?.name ?? id)
                .join(' · ')}. A different set is a different run.</p>`
            : '<p>This colony never specialised. Adaptations open at 11, 17, 24 and 30 roaches.</p>'
        }
        ${statsHtml([
          ['Run time', formatTime(world.stats.runSeconds)],
          ['Deliveries', `${world.stats.deliveries}`],
          ['Hatched', `${c.hatched}`],
          ['Lost', `${world.stats.workersLost}`],
          ['Scout deaths', `${world.stats.scoutDeaths}`],
          ['Peak suspicion', `${Math.round(world.suspicion.peak)}`],
          ['Traps sprung', `${world.stats.trapsSprung}`],
          ['Peak colony', `${world.stats.peakPopulation}`],
        ])}
        ${best ? `<p style="color:var(--text-dim);font-size:12.5px">Best run: ${best.won ? 'survived' : 'lost'} · ${best.population} roaches · ${formatTime(best.seconds)}</p>` : ''}
        <div class="row">
          <button class="primary" data-act="restart">Run it again <kbd>R</kbd></button>
          <button data-act="help">How this works</button>
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
        ${slider('master', 'Master volume')}
        ${slider('music', 'Ambience')}
        ${slider('sfx', 'Effects')}
        ${toggle('muted', 'Mute everything')}
        ${toggle('reducedShake', 'Reduced screen shake')}
        ${toggle('reducedFlash', 'Reduced flashes')}
        ${toggle('highContrast', 'Brighter kitchen (readability)')}
        ${toggle('showPerf', 'Show performance readout')}
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
