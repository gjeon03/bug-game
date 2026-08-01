import { describe, expect, it } from 'vitest';
import { FixedClock, MAX_STEPS_PER_FRAME, SIM_DT } from '../../src/core/clock.ts';
import { Rng } from '../../src/core/rng.ts';
import { SpatialHash } from '../../src/core/spatial.ts';
import { angleDelta, clamp, damp, rotateToward, smoothstep } from '../../src/core/math.ts';

describe('fixed clock', () => {
  it('produces exactly the expected number of steps for a given elapsed time', () => {
    const c = new FixedClock();
    let steps = 0;
    for (let i = 0; i < 60; i++) steps += c.advance(SIM_DT);
    expect(steps).toBe(60);
    expect(c.accumulator).toBeLessThan(SIM_DT);
  });

  it('accumulates fractional frames without drifting', () => {
    const c = new FixedClock();
    let steps = 0;
    // 100 Hz display feeding a 60 Hz simulation.
    for (let i = 0; i < 1000; i++) steps += c.advance(0.01);
    expect(steps).toBe(Math.floor(10 / SIM_DT));
  });

  it('clamps a huge frame delta and counts the discarded time', () => {
    const c = new FixedClock();
    const steps = c.advance(10);
    expect(steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    expect(c.discardedTime).toBeGreaterThan(9);
    expect(c.overloadFrames).toBe(1);
  });

  it('never runs more than the step cap in one frame', () => {
    const c = new FixedClock();
    for (let i = 0; i < 20; i++) {
      expect(c.advance(0.25)).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    }
  });

  it('flush drops pending time so a resumed tab cannot fast-forward', () => {
    const c = new FixedClock();
    c.advance(0.01);
    expect(c.accumulator).toBeGreaterThan(0);
    c.flush();
    expect(c.accumulator).toBe(0);
  });
});

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 500; i++) expect(a.next()).toBe(b.next());
  });

  it('diverges for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 200; i++) if (a.next() === b.next()) same++;
    expect(same).toBeLessThan(3);
  });

  it('stays inside its documented ranges', () => {
    const r = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
      const s = r.signed();
      expect(Math.abs(s)).toBeLessThanOrEqual(1);
    }
  });

  it('round-trips its internal state', () => {
    const r = new Rng(99);
    for (let i = 0; i < 10; i++) r.next();
    const snap = r.snapshot();
    const expected = [r.next(), r.next(), r.next()];
    r.restore(snap);
    expect([r.next(), r.next(), r.next()]).toEqual(expected);
  });
});

describe('spatial hash', () => {
  it('matches a brute-force radius query on random data', () => {
    const rng = new Rng(5);
    const hash = new SpatialHash(1000, 800, 64);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 400; i++) pts.push({ x: rng.range(0, 1000), y: rng.range(0, 800) });
    for (let i = 0; i < pts.length; i++) hash.insert(i, pts[i].x, pts[i].y);

    for (let q = 0; q < 40; q++) {
      const qx = rng.range(0, 1000);
      const qy = rng.range(0, 800);
      const r = rng.range(10, 120);
      const found = new Set<number>();
      hash.query(qx, qy, r, (id) => {
        const p = pts[id];
        if (Math.hypot(p.x - qx, p.y - qy) <= r) found.add(id);
      });
      const brute = new Set<number>();
      pts.forEach((p, i) => {
        if (Math.hypot(p.x - qx, p.y - qy) <= r) brute.add(i);
      });
      expect([...found].sort()).toEqual([...brute].sort());
    }
  });

  it('clears without reallocating and stays usable', () => {
    const hash = new SpatialHash(200, 200, 32);
    hash.insert(1, 10, 10);
    hash.clear();
    let hits = 0;
    hash.query(10, 10, 40, () => hits++);
    expect(hits).toBe(0);
    hash.insert(2, 10, 10);
    hash.query(10, 10, 40, () => hits++);
    expect(hits).toBe(1);
  });
});

describe('math helpers', () => {
  it('clamp and smoothstep behave at the edges', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('angleDelta takes the short way round', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2, 6);
    expect(angleDelta(-3.1, 3.1)).toBeCloseTo(-0.0831853, 5);
  });

  it('rotateToward never overshoots', () => {
    expect(rotateToward(0, 1, 0.25)).toBeCloseTo(0.25, 6);
    expect(rotateToward(0, 0.1, 1)).toBeCloseTo(0.1, 6);
  });

  it('damp is frame-rate independent', () => {
    const oneBigStep = damp(100, 0, 0.01, 1);
    let stepped = 100;
    for (let i = 0; i < 60; i++) stepped = damp(stepped, 0, 0.01, 1 / 60);
    expect(stepped).toBeCloseTo(oneBigStep, 6);
  });
});
