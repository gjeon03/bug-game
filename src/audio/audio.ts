/**
 * All game audio, synthesised in WebAudio. No sample files exist (see DECISIONS.md D5).
 *
 * Design constraints made explicit in code:
 *  - one `AudioContext`, created lazily on the first user gesture (autoplay policy);
 *  - four buses (master / music / sfx / ui) so the settings map to something real;
 *  - a hard voice cap and per-sound cooldowns, so 90 skittering roaches cannot become noise or leak
 *    nodes;
 *  - every scheduled node self-disposes via `onended`, which is what keeps a 15-minute run flat in
 *    memory.
 */

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

const MAX_VOICES = 24;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private hum: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private chitter: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private hiss: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private water: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private roomTone: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private humFilter: BiquadFilterNode | null = null;

  private cooldowns = new Map<string, number>();
  voices = 0;
  started = false;

  settings: AudioSettings = { master: 0.8, music: 0.7, sfx: 0.9, muted: false };

  /** Must be called from a user gesture. Safe to call repeatedly. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    type Ctor = typeof AudioContext;
    const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.uiBus.connect(this.master);

    // One shared noise buffer for every noise-based voice.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 0;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s / 0x3fffffff - 1) * 0.9;
    }
    this.noise = buf;

    this.applySettings();
    this.startAmbience();
    this.started = true;
  }

  applySettings(): void {
    if (!this.master || !this.musicBus || !this.sfxBus || !this.uiBus) return;
    const m = this.settings.muted ? 0 : this.settings.master;
    this.master.gain.value = m;
    this.musicBus.gain.value = this.settings.music;
    this.sfxBus.gain.value = this.settings.sfx;
    this.uiBus.gain.value = this.settings.sfx;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private gate(key: string, seconds: number): boolean {
    const t = this.now;
    const next = this.cooldowns.get(key) ?? 0;
    if (t < next) return false;
    this.cooldowns.set(key, t + seconds);
    return true;
  }

  private takeVoice(): boolean {
    if (this.voices >= MAX_VOICES) return false;
    this.voices++;
    return true;
  }

  private release = (): void => {
    this.voices = Math.max(0, this.voices - 1);
  };

  // ── Primitives ────────────────────────────────────────────────────────────

  private noiseVoice(
    bus: GainNode,
    dur: number,
    filter: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
    pan: number,
    attack = 0.002,
    sweepTo?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.takeVoice()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;

    const biq = ctx.createBiquadFilter();
    biq.type = filter;
    biq.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined)
      biq.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    biq.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));

    src.connect(biq).connect(g).connect(p).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = this.release;
  }

  private toneVoice(
    bus: GainNode,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    pan = 0,
    attack = 0.006,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.takeVoice()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));

    osc.connect(g).connect(p).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = this.release;
  }

  // ── Ambience ──────────────────────────────────────────────────────────────

  private startAmbience(): void {
    const ctx = this.ctx;
    const musicBus = this.musicBus;
    const sfxBus = this.sfxBus;
    if (!ctx || !musicBus || !sfxBus || !this.noise) return;

    // Fridge hum: two detuned saws through a low-pass, plus a slow LFO on the cutoff.
    const g = ctx.createGain();
    g.gain.value = 0.055;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 190;
    lp.Q.value = 3;
    const oscs: OscillatorNode[] = [];
    for (const f of [49.5, 50.4, 101]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      oscs.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 36;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    oscs.push(lfo);
    lp.connect(g).connect(musicBus);
    this.hum = { osc: oscs, gain: g };
    this.humFilter = lp;

    // Room tone: a very quiet band of noise under everything.
    const tone = ctx.createBufferSource();
    tone.buffer = this.noise;
    tone.loop = true;
    const toneF = ctx.createBiquadFilter();
    toneF.type = 'bandpass';
    toneF.frequency.value = 420;
    toneF.Q.value = 0.7;
    const toneG = ctx.createGain();
    toneG.gain.value = 0.014;
    tone.connect(toneF).connect(toneG).connect(musicBus);
    tone.start();

    // Colony chitter bed: gain is driven every frame from the live population.
    const ch = ctx.createBufferSource();
    ch.buffer = this.noise;
    ch.loop = true;
    ch.playbackRate.value = 1.7;
    const chF = ctx.createBiquadFilter();
    chF.type = 'bandpass';
    chF.frequency.value = 2900;
    chF.Q.value = 1.4;
    const chG = ctx.createGain();
    chG.gain.value = 0;
    ch.connect(chF).connect(chG).connect(musicBus);
    ch.start();
    this.chitter = { src: ch, gain: chG };

    // Spray hiss loop, silent until a cloud exists.
    const hs = ctx.createBufferSource();
    hs.buffer = this.noise;
    hs.loop = true;
    const hsF = ctx.createBiquadFilter();
    hsF.type = 'highpass';
    hsF.frequency.value = 3400;
    const hsG = ctx.createGain();
    hsG.gain.value = 0;
    hs.connect(hsF).connect(hsG).connect(sfxBus);
    hs.start();
    this.hiss = { src: hs, gain: hsG };

    // Running water: filtered noise, only audible while somebody is washing up.
    const ws = ctx.createBufferSource();
    ws.buffer = this.noise;
    ws.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 1900;
    wf.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    ws.connect(wf).connect(wg).connect(sfxBus);
    ws.start();
    this.water = { src: ws, gain: wg };

    // The room's own noise floor. It rises with the household's alert level, which is the cheapest
    // possible way to make "they are awake now" audible without saying it.
    const rs = ctx.createBufferSource();
    rs.buffer = this.noise;
    rs.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 620;
    const rg = ctx.createGain();
    rg.gain.value = 0.012;
    rs.connect(rf).connect(rg).connect(musicBus);
    rs.start();
    this.roomTone = { src: rs, gain: rg };
  }

  /**
   * Continuous mix updates, called once per rendered frame.
   *
   * The house is a bed, not a backdrop. Three layers move against each other: the colony's own
   * chitter (rises with population), the appliance hum (swells when the fridge is open), and running
   * water (only while somebody is at the sink). Between them the room sounds occupied even when the
   * screen shows nothing but floor.
   */
  updateBeds(
    population: number,
    sprayActive: boolean,
    dt: number,
    house: { fridgeOpen: number; water: number; alert: number } = {
      fridgeOpen: 0,
      water: 0,
      alert: 0,
    },
  ): void {
    if (!this.ctx) return;
    const k = Math.min(1, dt * 2.2);
    if (this.chitter) {
      const target = Math.min(0.075, population * 0.0016);
      const g = this.chitter.gain.gain;
      g.value += (target - g.value) * k;
    }
    if (this.hiss) {
      const target = sprayActive ? 0.05 : 0;
      const g = this.hiss.gain.gain;
      g.value += (target - g.value) * Math.min(1, dt * 4);
    }
    if (this.hum) {
      // An open fridge is louder and brighter than a closed one — the compressor and the door alarm
      // are how the player hears the snack routine before they can see it.
      const target = 0.055 + house.fridgeOpen * 0.05;
      const g = this.hum.gain.gain;
      g.value += (target - g.value) * k;
      if (this.humFilter) {
        const f = 220 + house.fridgeOpen * 340;
        this.humFilter.frequency.value += (f - this.humFilter.frequency.value) * k;
      }
    }
    if (this.water) {
      const target = house.water * 0.07;
      const g = this.water.gain.gain;
      g.value += (target - g.value) * Math.min(1, dt * 3);
    }
    // Alert raises the noise floor of the whole room: at high tiers the house is awake.
    if (this.roomTone) {
      const target = 0.012 + house.alert * 0.03;
      const g = this.roomTone.gain.gain;
      g.value += (target - g.value) * Math.min(1, dt * 0.9);
    }
  }

  // ── Household routines ────────────────────────────────────────────────────

  /** Anticipation: footsteps in the hall, a tap being turned, a bin lid. */
  routineWarn(kind: 'snack' | 'dishes' | 'trash', pan: number): void {
    if (!this.sfxBus) return;
    if (kind === 'snack') {
      // Two soft floor impacts through the wall.
      for (let i = 0; i < 3; i++) {
        this.noiseVoice(this.sfxBus, 0.16, 'lowpass', 170, 1.1, 0.16 - i * 0.03, pan, 0.01);
      }
    } else if (kind === 'dishes') {
      this.toneVoice(this.sfxBus, 'sine', 320, 210, 0.5, 0.06, pan, 0.05);
      this.noiseVoice(this.sfxBus, 0.6, 'bandpass', 1600, 2.2, 0.05, pan, 0.12);
    } else {
      this.noiseVoice(this.sfxBus, 0.24, 'bandpass', 900, 3, 0.14, pan, 0.004);
      this.toneVoice(this.sfxBus, 'triangle', 180, 120, 0.3, 0.05, pan);
    }
  }

  /** Impact: the door opens, the water hits the basin, the bag lands. */
  routineStart(kind: 'snack' | 'dishes' | 'trash', pan: number): void {
    if (!this.sfxBus) return;
    if (kind === 'snack') {
      this.noiseVoice(this.sfxBus, 0.5, 'lowpass', 420, 0.9, 0.16, pan, 0.02);
      this.toneVoice(this.sfxBus, 'sine', 90, 62, 0.7, 0.08, pan, 0.03);
    } else if (kind === 'dishes') {
      this.noiseVoice(this.sfxBus, 0.9, 'highpass', 900, 0.8, 0.11, pan, 0.2);
    } else {
      this.noiseVoice(this.sfxBus, 0.4, 'lowpass', 300, 1.2, 0.2, pan, 0.01);
    }
  }


  routineEnd(pan: number): void {
    if (!this.sfxBus) return;
    this.toneVoice(this.sfxBus, 'sine', 260, 150, 0.4, 0.05, pan, 0.03);
  }

  /** The cloth starts moving. Deliberately dry and close — this one takes your map away. */
  sweepWarn(pan: number): void {
    if (!this.sfxBus) return;
    this.noiseVoice(this.sfxBus, 0.5, 'bandpass', 700, 1.4, 0.1, pan, 0.06);
  }

  sweepPass(pan: number): void {
    if (!this.sfxBus || !this.gate('sweep', 0.28)) return;
    this.noiseVoice(this.sfxBus, 0.42, 'bandpass', 1150, 1.1, 0.09, pan, 0.09);
  }

  // ── Growth ────────────────────────────────────────────────────────────────

  /** An adaptation is taken. Each family has its own colour so the choice is audible. */
  adapt(family: 'brood' | 'forage' | 'shadow'): void {
    if (!this.uiBus) return;
    const root = family === 'brood' ? 196 : family === 'forage' ? 233 : 165;
    this.toneVoice(this.uiBus, 'triangle', root, root * 1.5, 0.5, 0.1, 0, 0.01);
    this.toneVoice(this.uiBus, 'sine', root * 2, root * 3, 0.65, 0.07, 0, 0.02);
    this.toneVoice(this.uiBus, 'sine', root * 3, root * 4, 0.4, 0.04, 0, 0.03);
  }

  /** A foothold is fitted out: a low structural thud plus the colony answering. */
  fitOut(pan: number): void {
    if (!this.sfxBus) return;
    this.toneVoice(this.sfxBus, 'sine', 120, 76, 0.55, 0.11, pan, 0.01);
    this.noiseVoice(this.sfxBus, 0.35, 'bandpass', 640, 2.4, 0.08, pan, 0.02);
  }

  repair(pan: number): void {
    if (!this.sfxBus) return;
    this.noiseVoice(this.sfxBus, 0.3, 'lowpass', 520, 1.4, 0.07, pan, 0.02);
  }

  /** A region comes under the colony's control. */
  zoneHeld(): void {
    if (!this.uiBus) return;
    this.toneVoice(this.uiBus, 'sine', 330, 495, 0.4, 0.08, 0, 0.01);
    this.toneVoice(this.uiBus, 'sine', 495, 660, 0.5, 0.05, 0, 0.03);
  }

  zoneLost(): void {
    if (!this.uiBus) return;
    this.toneVoice(this.uiBus, 'sine', 330, 220, 0.4, 0.07, 0, 0.02);
  }


  /** The household commits to extermination. */
  finalResponse(): void {
    if (!this.musicBus) return;
    this.toneVoice(this.musicBus, 'sawtooth', 70, 46, 2.4, 0.09, 0, 0.4);
    this.toneVoice(this.musicBus, 'sine', 140, 92, 2.0, 0.06, 0, 0.3);
  }

  // ── Game sounds ───────────────────────────────────────────────────────────

  skitter(pan: number, speed: number): void {
    if (!this.sfxBus || !this.gate('skitter', 0.055)) return;
    this.noiseVoice(
      this.sfxBus,
      0.035,
      'bandpass',
      1800 + speed * 1400,
      5,
      0.05 + speed * 0.05,
      pan,
      0.001,
    );
  }

  workerSkitter(pan: number): void {
    if (!this.sfxBus || !this.gate('wskitter', 0.11)) return;
    this.noiseVoice(
      this.sfxBus,
      0.03,
      'bandpass',
      2600 + Math.random() * 1600,
      6,
      0.022,
      pan,
      0.001,
    );
  }

  sprint(pan: number): void {
    if (!this.sfxBus || !this.gate('sprint', 0.5)) return;
    this.noiseVoice(this.sfxBus, 0.34, 'bandpass', 900, 1.2, 0.09, pan, 0.02, 2600);
  }

  layTick(pan: number): void {
    if (!this.sfxBus || !this.gate('lay', 0.075)) return;
    this.toneVoice(
      this.sfxBus,
      'triangle',
      880 + Math.random() * 90,
      760,
      0.045,
      0.045,
      pan,
      0.002,
    );
  }

  routeLinked(pan: number): void {
    if (!this.uiBus) return;
    this.toneVoice(this.uiBus, 'sine', 660, 660, 0.28, 0.08, pan, 0.02);
    this.toneVoice(this.uiBus, 'sine', 990, 990, 0.34, 0.055, pan, 0.04);
  }

  routeLost(pan: number): void {
    if (!this.uiBus || !this.gate('routeLost', 0.4)) return;
    this.toneVoice(this.uiBus, 'sine', 520, 300, 0.3, 0.06, pan, 0.01);
  }

  pickup(pan: number): void {
    if (!this.sfxBus || !this.gate('pickup', 0.09)) return;
    this.noiseVoice(this.sfxBus, 0.04, 'bandpass', 3200, 4, 0.05, pan, 0.001);
    this.toneVoice(this.sfxBus, 'sine', 1180, 1500, 0.07, 0.035, pan);
  }

  deliver(pan: number, fill: number): void {
    if (!this.sfxBus || !this.gate('deliver', 0.07)) return;
    const base = 420 + fill * 260;
    this.toneVoice(this.sfxBus, 'triangle', base, base * 1.5, 0.16, 0.07, pan, 0.006);
    this.toneVoice(this.sfxBus, 'sine', base * 2, base * 2.4, 0.11, 0.032, pan, 0.006);
  }

  hatch(pan: number): void {
    if (!this.sfxBus || !this.gate('hatch', 0.12)) return;
    this.noiseVoice(this.sfxBus, 0.05, 'lowpass', 900, 1, 0.06, pan, 0.001);
    this.toneVoice(this.sfxBus, 'sine', 300, 720, 0.2, 0.05, pan, 0.01);
  }


  footWarn(pan: number, distance: number): void {
    if (!this.sfxBus || !this.gate('footWarn', 0.2)) return;
    const near = Math.max(0.15, 1 - distance / 1400);
    this.noiseVoice(this.sfxBus, 0.5, 'lowpass', 220, 1, 0.05 * near, pan, 0.08, 90);
  }

  footHit(pan: number, distance: number): void {
    if (!this.sfxBus) return;
    const near = Math.max(0.12, 1 - distance / 1600);
    this.toneVoice(this.sfxBus, 'sine', 62, 26, 0.5, 0.34 * near, pan, 0.003);
    this.noiseVoice(this.sfxBus, 0.16, 'lowpass', 520, 0.8, 0.18 * near, pan, 0.001, 120);
    // Dish rattle: two short bright partials.
    if (near > 0.4) {
      this.toneVoice(this.sfxBus, 'triangle', 2400, 2200, 0.12, 0.02 * near, pan, 0.004);
      this.toneVoice(this.sfxBus, 'triangle', 3100, 2900, 0.09, 0.014 * near, pan * -1, 0.004);
    }
  }

  lightOn(): void {
    if (!this.sfxBus) return;
    this.noiseVoice(this.sfxBus, 0.05, 'bandpass', 2200, 8, 0.14, 0, 0.001);
    this.toneVoice(this.sfxBus, 'sine', 120, 120, 0.9, 0.035, 0, 0.25);
  }

  trapSnap(pan: number): void {
    if (!this.sfxBus || !this.gate('trap', 0.12)) return;
    this.noiseVoice(this.sfxBus, 0.07, 'bandpass', 1500, 2.5, 0.16, pan, 0.001, 400);
  }

  sprayStart(pan: number): void {
    if (!this.sfxBus) return;
    this.noiseVoice(this.sfxBus, 1.4, 'highpass', 2600, 0.7, 0.13, pan, 0.05, 5200);
  }

  scoutHurt(pan: number): void {
    if (!this.sfxBus || !this.gate('hurt', 0.3)) return;
    this.toneVoice(this.sfxBus, 'sawtooth', 320, 120, 0.22, 0.09, pan, 0.002);
  }

  scoutDied(pan: number): void {
    if (!this.sfxBus) return;
    this.noiseVoice(this.sfxBus, 0.2, 'lowpass', 1400, 1, 0.2, pan, 0.001, 200);
    this.toneVoice(this.sfxBus, 'sawtooth', 420, 60, 0.7, 0.13, pan, 0.004);
  }

  workerDied(pan: number): void {
    if (!this.sfxBus || !this.gate('wdead', 0.14)) return;
    this.noiseVoice(this.sfxBus, 0.07, 'bandpass', 900, 2, 0.05, pan, 0.001, 300);
  }

  suspicionUp(): void {
    if (!this.uiBus || !this.gate('susp', 0.9)) return;
    this.toneVoice(this.uiBus, 'sine', 240, 200, 0.32, 0.045, 0, 0.02);
  }


  uiTick(): void {
    if (!this.uiBus || !this.gate('ui', 0.04)) return;
    this.toneVoice(this.uiBus, 'square', 1300, 1300, 0.03, 0.03, 0, 0.001);
  }

  victory(): void {
    if (!this.musicBus) return;
    const notes = [131, 165, 196, 262, 330];
    notes.forEach((f, i) => {
      window.setTimeout(
        () => this.toneVoice(this.musicBus!, 'triangle', f, f, 2.4, 0.07, 0, 0.2),
        i * 170,
      );
    });
    if (this.chitter) this.chitter.gain.gain.value = 0.12;
  }

  defeat(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.uiBus) return;
    // Everything ducks to a single ringing tone in 40 ms.
    const t = ctx.currentTime;
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(0.02, t + 0.04);
    }
    if (this.sfxBus) {
      this.sfxBus.gain.cancelScheduledValues(t);
      this.sfxBus.gain.setValueAtTime(this.sfxBus.gain.value, t);
      this.sfxBus.gain.linearRampToValueAtTime(0.05, t + 0.04);
    }
    this.toneVoice(this.uiBus, 'sine', 2000, 1960, 2.6, 0.06, 0, 0.01);
  }

  /** Restores buses after a defeat duck. */
  resetMix(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.musicBus) this.musicBus.gain.setValueAtTime(this.settings.music, ctx.currentTime);
    if (this.sfxBus) this.sfxBus.gain.setValueAtTime(this.settings.sfx, ctx.currentTime);
    if (this.chitter) this.chitter.gain.gain.value = 0;
    this.cooldowns.clear();
  }
}
