import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_FADE_FLOOR, MIN_FADE_FLOOR, OcclusionSystem } from '../../src/view/occlusion';

/**
 * Occlusion is tested against a synthetic scene rather than against the game's prop layout.
 *
 * A sweep of the whole worktop in the real proof scene found a maximum of ONE simultaneous blocker —
 * with that arrangement, no two registered props ever line up. Waiting for a layout to produce the
 * multi-blocker case by coincidence is not a test, and the contract requires the behaviour to be
 * demonstrated rather than assumed. Building the geometry here makes every listed case
 * deterministic: one small blocker, one large blocker, several at once, moving behind and out,
 * rapid reversal, restart, and no blocker at all.
 *
 * No WebGL is involved. Raycasting, `Object3D` transforms and `Material.clone()` are all pure CPU,
 * so this runs in the same `node` environment as the rest of the unit suite.
 */

/** The camera sits on +Z looking back at the origin, so a blocker is anything with z between. */
function makeCamera(): THREE.Camera {
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 1, 4000);
  camera.position.set(0, 200, 600);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * Height of the camera-to-origin ray at a given z.
 *
 * The camera sits at (0, 200, 600) looking at the origin, so the sight line descends as it
 * approaches the scout. A blocker placed at a fixed height is only *sometimes* on that line — the
 * first version of the multi-blocker test put three boxes at y = 60 and the furthest one missed,
 * because at z = 320 the ray is already at y = 107. That was a fault in the test's geometry, not in
 * the system, and it is exactly the kind of thing that gets misread as a product bug.
 */
function rayHeightAt(z: number): number {
  return 200 * (z / 600);
}

function makeBlocker(size: number, z: number, x = 0, y = rayHeightAt(z)): THREE.Object3D {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, 8),
    new THREE.MeshStandardMaterial(),
  );
  mesh.castShadow = true;
  group.add(mesh);
  group.position.set(x, y, z);
  group.updateMatrixWorld(true);
  return group;
}

/** Advance in real-sized steps so easing behaves the way it does in a frame loop. */
function settle(system: OcclusionSystem, camera: THREE.Camera, focus: THREE.Vector3): void {
  for (let i = 0; i < 40; i++) system.update(1 / 60, camera, [focus]);
}

function coverageOf(root: THREE.Object3D): number {
  let opacity = 1;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.Material;
    opacity = material.opacity;
  });
  return opacity;
}

function castsShadow(root: THREE.Object3D): boolean {
  let casts = false;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh.castShadow) casts = true;
  });
  return casts;
}

describe('occlusion fading', () => {
  it('leaves everything opaque when nothing is in the way', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const blocker = makeBlocker(60, -400); // behind the scout, not between
    system.register(blocker);

    settle(system, camera, new THREE.Vector3(0, 0, 0));

    expect(coverageOf(blocker)).toBe(1);
    expect(system.stats().fading).toBe(0);
    expect(castsShadow(blocker)).toBe(true);
  });

  it('fades a small blocker that stands between the camera and the scout', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const blocker = makeBlocker(60, 260);
    system.register(blocker);

    settle(system, camera, new THREE.Vector3(0, 0, 0));

    expect(coverageOf(blocker)).toBeCloseTo(DEFAULT_FADE_FLOOR, 5);
    expect(system.stats().fading).toBe(1);
  });

  it('fades a large blocker further than a small one when asked to', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const cabinet = makeBlocker(400, 260);
    const mug = makeBlocker(60, 260);
    system.register(cabinet, { floor: 0.38 });
    system.register(mug, { floor: 0.7 });

    settle(system, camera, new THREE.Vector3(0, 0, 0));

    expect(coverageOf(cabinet)).toBeCloseTo(0.38, 5);
    expect(coverageOf(mug)).toBeCloseTo(0.7, 5);
    expect(coverageOf(cabinet)).toBeLessThan(coverageOf(mug));
  });

  it('refuses to fade anything into television static', () => {
    /*
     * Alpha hashing dithers stochastically, so coverage IS the fraction of pixels kept. Below about
     * a third it stops reading as transparency and starts reading as noise — observed at 0.22
     * across a whole frame during a real-browser capture. An authored floor below the clamp is an
     * authoring error, and the system must not honour it.
     */
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const wall = makeBlocker(400, 260);
    system.register(wall, { floor: 0.05 });

    settle(system, camera, new THREE.Vector3(0, 0, 0));

    expect(coverageOf(wall)).toBeCloseTo(MIN_FADE_FLOOR, 5);
  });

  it('fades several simultaneous blockers, not just the nearest', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const near = makeBlocker(70, 320);
    const mid = makeBlocker(70, 220);
    const far = makeBlocker(70, 120);
    for (const b of [near, mid, far]) system.register(b);

    settle(system, camera, new THREE.Vector3(0, 0, 0));

    expect(system.stats().fading).toBe(3);
    for (const b of [near, mid, far]) {
      expect(coverageOf(b)).toBeCloseTo(DEFAULT_FADE_FLOOR, 5);
    }
  });

  it('restores opacity and shadow casting when the scout moves out from behind', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const blocker = makeBlocker(60, 260);
    system.register(blocker);

    settle(system, camera, new THREE.Vector3(0, 0, 0));
    expect(coverageOf(blocker)).toBeCloseTo(DEFAULT_FADE_FLOOR, 5);
    // A faded caster must stop casting — a see-through object with a solid shadow reads as a bug.
    expect(castsShadow(blocker)).toBe(false);

    settle(system, camera, new THREE.Vector3(600, 0, 0));
    expect(coverageOf(blocker)).toBe(1);
    expect(castsShadow(blocker)).toBe(true);
  });

  it('never pops: a single frame cannot move coverage more than one frame of the fade', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const blocker = makeBlocker(60, 260);
    system.register(blocker);

    const focus = new THREE.Vector3(0, 0, 0);
    let previous = coverageOf(blocker);
    // Rapid reversal — behind, clear, behind, clear — is where a naive implementation snaps.
    for (let i = 0; i < 24; i++) {
      focus.x = i % 2 === 0 ? 0 : 600;
      system.update(1 / 60, camera, [focus]);
      const now = coverageOf(blocker);
      // 1/60 s of a 0.22 s fade is 0.0758; allow a small epsilon for float error.
      expect(Math.abs(now - previous)).toBeLessThanOrEqual(1 / 60 / 0.22 + 1e-6);
      previous = now;
    }
  });

  it('keeps depth writing on and transparency off, so blockers cannot mis-sort', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const blocker = makeBlocker(60, 260);
    system.register(blocker);

    settle(system, camera, new THREE.Vector3(0, 0, 0));

    blocker.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.Material;
      expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(true);
      // Coverage below 1 has to be carried by alpha hashing, not by the transparent queue.
      expect(material.alphaHash).toBe(true);
    });
  });

  it('reset snaps back to opaque, so a restart cannot inherit a half-faded prop', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const blocker = makeBlocker(60, 260);
    system.register(blocker);

    settle(system, camera, new THREE.Vector3(0, 0, 0));
    expect(coverageOf(blocker)).toBeLessThan(1);

    system.reset();

    expect(coverageOf(blocker)).toBe(1);
    expect(system.stats().fading).toBe(0);
    expect(castsShadow(blocker)).toBe(true);
  });

  it('clones materials, so two instances of one prop fade independently', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const shared = new THREE.MeshStandardMaterial();

    const build = (x: number): THREE.Object3D => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(60, 60, 8), shared);
      group.add(mesh);
      group.position.set(x, 60, 260);
      group.updateMatrixWorld(true);
      return group;
    };

    const blocking = build(0);
    const clear = build(600);
    system.register(blocking);
    system.register(clear);

    settle(system, camera, new THREE.Vector3(0, 0, 0));

    expect(coverageOf(blocking)).toBeCloseTo(DEFAULT_FADE_FLOOR, 5);
    expect(coverageOf(clear)).toBe(1);
    // The library material itself must never be touched.
    expect(shared.opacity).toBe(1);
    expect(shared.alphaHash).toBe(false);
  });

  it('unregister restores the prop it drops', () => {
    const system = new OcclusionSystem();
    const camera = makeCamera();
    const blocker = makeBlocker(60, 260);
    system.register(blocker);

    settle(system, camera, new THREE.Vector3(0, 0, 0));
    expect(coverageOf(blocker)).toBeLessThan(1);

    system.unregister(blocker);

    expect(coverageOf(blocker)).toBe(1);
    expect(castsShadow(blocker)).toBe(true);
    expect(system.stats().registered).toBe(0);
  });
});
