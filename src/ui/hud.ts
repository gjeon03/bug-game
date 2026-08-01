import { clamp01 } from '../core/math.ts';
import {
  MAX_ROUTES,
  RESERVE_MAX,
  SCOUT_STAMINA_MAX,
  SUSPICION_MAX,
  TIER_THRESHOLDS,
} from '../sim/constants.ts';
import { interactTarget } from '../sim/colony.ts';
import { scoutStruggleProgress } from '../sim/scout.ts';
import { CAUSE_LABELS, tierName } from '../sim/suspicion.ts';
import type { World } from '../sim/world.ts';
import { ICONS } from './icons.ts';

/**
 * The HUD is a DOM overlay with `pointer-events: none`, so it can never eat gameplay input.
 *
 * It answers, at a glance: what do I have, how obvious am I, what is coming, and what should I do
 * next. Values are written only when they change, so a 60 Hz update loop does not thrash layout.
 */
export class Hud {
  private root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private last: Record<string, string> = {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="corner tl">
        <div class="panel">
          ${meter('food', 'Food', ICONS.food, 'f-food')}
          ${meter('water', 'Moisture', ICONS.water, 'f-water')}
          ${meter('pop', 'Colony', ICONS.pop, 'f-pop')}
          ${meter('brood', 'Brood', ICONS.brood, 'f-brood')}
        </div>
      </div>

      <div class="corner tr">
        <div class="panel" id="suspicion">
          <div class="head">
            ${ICONS.eye}
            <span class="tier-name" data-el="tierName">Unnoticed</span>
            <span class="pips">
              <span class="pip" data-el="pip0"></span><span class="pip" data-el="pip1"></span
              ><span class="pip" data-el="pip2"></span><span class="pip" data-el="pip3"></span>
            </span>
          </div>
          <div class="track">
            <div class="fill" data-el="suspFill" style="width:0%"></div>
            <div class="ticks">${TIER_THRESHOLDS.map(
              (t) => `<span class="tick" style="left:${(t / SUSPICION_MAX) * 100}%"></span>`,
            ).join('')}</div>
            <div class="floor" data-el="suspFloor" style="left:0%"></div>
          </div>
          <div class="cause" data-el="cause">No evidence yet.</div>
          <div class="next" data-el="next">Nobody has noticed anything yet.</div>
        </div>
      </div>

      <div class="corner bl">
        <div class="panel">
          ${meter('stam', 'Sprint', ICONS.stamina, 'f-stam')}
          ${meter('pher', 'Pheromone', ICONS.pheromone, 'f-pher')}
          <div class="statusline" data-el="scoutState">Scout ready</div>
        </div>
      </div>

      <div class="corner bc">
        <div id="tutorial" class="hidden"></div>
        <div id="toast" class="hidden"></div>
        <div id="prompt" class="hidden"></div>
        <div class="panel" id="objective-wrap"><div id="objective">…</div></div>
      </div>

      <div class="corner br">
        <div class="panel" id="phase">
          <div class="night" data-el="night">Night 1 — Establish</div>
          <div class="clock" data-el="clock">0:00</div>
          <div id="perf" class="hidden" data-el="perf"></div>
        </div>
      </div>
    `;
    this.root.querySelectorAll<HTMLElement>('[data-el]').forEach((n) => {
      this.el[n.dataset.el as string] = n;
    });
    this.el.tutorial = this.root.querySelector('#tutorial') as HTMLElement;
    this.el.toast = this.root.querySelector('#toast') as HTMLElement;
    this.el.prompt = this.root.querySelector('#prompt') as HTMLElement;
    this.el.objective = this.root.querySelector('#objective') as HTMLElement;
    this.el.suspicionPanel = this.root.querySelector('#suspicion') as HTMLElement;
    this.el.foodMeter = this.root.querySelector('.f-food') as HTMLElement;
    this.el.waterMeter = this.root.querySelector('.f-water') as HTMLElement;
  }

  private set(key: string, value: string): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    const node = this.el[key];
    if (node) node.textContent = value;
  }

  private width(key: string, fraction: number): void {
    const pct = `${(clamp01(fraction) * 100).toFixed(1)}%`;
    if (this.last[`w:${key}`] === pct) return;
    this.last[`w:${key}`] = pct;
    const node = this.el[key];
    if (node) node.style.width = pct;
  }

  private toggle(key: string, on: boolean, text?: string): void {
    const node = this.el[key];
    if (!node) return;
    if (text !== undefined && node.textContent !== text) node.innerHTML = text;
    const hidden = node.classList.contains('hidden');
    if (on === hidden) node.classList.toggle('hidden', !on);
  }

  update(world: World, fps: number, showPerf: boolean, perfLine: string): void {
    const c = world.colony;

    this.width('foodFill', c.food / c.foodCap);
    this.set('foodNum', `${Math.floor(c.food)}/${c.foodCap}`);
    this.width('waterFill', c.water / c.waterCap);
    this.set('waterNum', `${Math.floor(c.water)}/${c.waterCap}`);
    this.width('popFill', c.capacity > 0 ? c.population / c.capacity : 0);
    this.set('popNum', `${c.population}/${c.capacity}`);
    this.width('broodFill', c.brood);
    this.set('broodNum', `${Math.floor(c.brood * 100)}%`);

    const s = world.scout;
    this.width('stamFill', s.stamina / SCOUT_STAMINA_MAX);
    this.set('stamNum', `${Math.floor(s.stamina)}`);
    this.width('pherFill', world.reserve / RESERVE_MAX);
    const linkedRoutes = world.routes.filter((r) => r.linked).length;
    this.set('pherNum', `${Math.floor(world.reserve)} · ${linkedRoutes}/${MAX_ROUTES}`);

    // A shortage is escalated on the meter itself, not only in the objective line.
    this.el.foodMeter?.classList.toggle('critical', world.shortage === 'food');
    this.el.waterMeter?.classList.toggle('critical', world.shortage === 'water');

    let state = 'Scout ready';
    if (!s.alive) state = `Scout lost — replacement in ${Math.max(0, s.respawnTimer).toFixed(1)}s`;
    else if (s.trapId >= 0)
      state = `STUCK — mash SHIFT and a direction · ${Math.round(scoutStruggleProgress(world) * 100)}%`;
    else if (s.spotted > 0.55) state = 'SEEN — get to cover';
    else if (s.exposure > 0.55) state = 'Exposed — in the light';
    else if (s.laying) state = 'Laying pheromone';
    this.set('scoutState', state);

    const susp = world.suspicion;
    this.width('suspFill', susp.value / SUSPICION_MAX);
    const floorNode = this.el.suspFloor;
    if (floorNode) floorNode.style.left = `${(susp.floor / SUSPICION_MAX) * 100}%`;
    this.set('tierName', `${tierName(susp.tier)} · ${Math.round(susp.value)}`);
    for (let i = 0; i < 4; i++) {
      const pip = this.el[`pip${i}`];
      if (pip) pip.classList.toggle('on', susp.tier > i);
    }
    const panel = this.el.suspicionPanel;
    if (panel) {
      const cls = `t${susp.tier}`;
      if (this.last.suspClass !== cls) {
        panel.className = `panel ${cls}`;
        this.last.suspClass = cls;
      }
    }
    this.setHtml(
      'cause',
      susp.lastCause
        ? `<span class="rowicon">◂</span><span>${CAUSE_LABELS[susp.lastCause]}</span>`
        : `<span class="rowicon">◂</span><span>No evidence yet.</span>`,
    );
    this.setHtml(
      'next',
      `<span class="rowicon">▸</span><span>${world.nextResponse.replace(/^Next: /, '')}</span>`,
    );

    this.set('objective', world.objective);

    // ── Bottom-centre arbitration. Four independently-mounted pills used to stack, twice saying the
    // same thing about the same crumbs, against a contract that specifies one line. Priority is:
    // transient feedback (a toast the player just caused) > contextual prompt > onboarding.
    const target = interactTarget(world);
    const showToast = world.hint.length > 0;
    const showPrompt = !!target && world.status === 'playing';
    const showTutorial = world.tutorial.length > 0 && !showToast && !showPrompt;

    this.toggle('tutorial', showTutorial);
    if (showTutorial) this.setHtml('tutorial', world.tutorial);

    this.toggle('toast', showToast);
    if (showToast) this.setHtml('toast', world.hint);

    if (showPrompt && target) {
      const label =
        target.kind === 'nest'
          ? `<kbd>E</kbd> Claim ${target.label} — ${target.costFood} food, ${target.costWater} moisture`
          : target.kind === 'escape'
            ? `<kbd>E</kbd> ${target.label}`
            : target.kind === 'sealed'
              ? `<kbd>E</kbd> ${target.label}`
              : `<kbd>E</kbd> Inspect ${target.label}`;
      this.setHtml('prompt', label);
      this.toggle('prompt', true);
      this.el.prompt?.classList.toggle('blocked', !target.affordable);
    } else {
      this.toggle('prompt', false);
    }

    const names = ['', 'Establish', 'Expand', 'Infest'];
    this.set('night', `Night ${world.night} — ${names[world.night]}`);
    const left = Math.max(0, world.nightLength - world.nightTime);
    const m = Math.floor(left / 60);
    const sec = Math.floor(left % 60);
    this.set('clock', `${m}:${sec.toString().padStart(2, '0')}`);
    this.el.clock?.classList.toggle('warn', world.finalResponse || left < 30);

    this.toggle('perf', showPerf);
    if (showPerf) this.set('perf', `${fps.toFixed(0)} fps · ${perfLine}`);
  }

  private setHtml(key: string, html: string): void {
    if (this.last[`h:${key}`] === html) return;
    this.last[`h:${key}`] = html;
    const node = this.el[key];
    if (node) node.innerHTML = html;
  }
}

function meter(id: string, label: string, icon: string, cls: string): string {
  return `<div class="meter ${cls}">
      ${icon}
      <span class="label">${label}</span>
      <span class="track"><span class="fill" data-el="${id}Fill" style="width:0%"></span></span>
      <span class="num" data-el="${id}Num">0</span>
    </div>`;
}
