import * as THREE from 'three';

/**
 * Camera-aware occlusion fading.
 *
 * The rule this system exists to enforce: **a foreground object may never permanently hide the
 * player.** With a fixed diagonal camera that is not an edge case, it is the normal state of
 * affairs — every mug, bottle and cabinet between the camera and the scout will eventually stand in
 * the way.
 *
 * ## Why alpha hashing rather than transparency
 *
 * The obvious implementation — `transparent = true` and a lowered `opacity` — buys a whole class of
 * defects. Transparent meshes leave the opaque pass, get sorted by centroid distance, stop writing
 * depth, and start drawing through one another in the wrong order. With several blockers
 * overlapping that reads as a rendering fault rather than as an affordance, and the contract
 * explicitly forbids alpha-sorting artifacts.
 *
 * `Material.alphaHash` dithers coverage stochastically in the fragment shader instead. The material
 * stays opaque, stays in the opaque pass, keeps writing depth, and needs no sorting at all. Partial
 * coverage becomes a screen-space dither — exactly the "dithered alpha or an equivalent
 * depth-stable solution" the contract asks for.
 *
 * ## Why groups rather than meshes
 *
 * A cabinet whose door fades while its carcass stays solid does not read as "the game is helping me
 * see"; it reads as a bug. Fading is per logical prop. Materials are cloned on registration so two
 * instances of one prop fade independently and the shared library material is never mutated.
 *
 * ## Why a faded caster stops casting
 *
 * An object you can see through that still throws a hard, fully opaque shadow is the most reliable
 * way to make a correct fade look broken. Measured in this project at 0.22 coverage: the mug and the
 * plate stack read as glassware with painted-on shadows.
 */

/** Reduced coverage, not disappearance — the silhouette has to survive so depth is not destroyed. */
export const DEFAULT_FADE_FLOOR = 0.42;

/**
 * The lowest coverage any occluder may reach.
 *
 * Alpha hashing dithers stochastically, so coverage IS the fraction of pixels kept. Below about a
 * third, the result stops reading as "I can see through this" and starts reading as television
 * static — observed at 0.22 across a whole frame. Clamping here means an over-eager authored
 * `fadeFloor` cannot produce that.
 */
/*
 * Lowered from 0.34.
 *
 * The clamp was silently discarding authored intent: 31 of the 56 `fadeFloor` values across
 * `world/regions/*.ts` sat below it and shipped raised to exactly 0.34. The bathroom's largest
 * occluder is authored at 0.16 with the comment "the reason occlusion fading has to work here: the
 * scout crosses behind it on every water run". The level author had already asked for what the
 * player is now asking for.
 *
 * It is not lowered further because coverage IS the fraction of pixels kept under alpha hashing, so
 * a low floor on a large near object reads as the television static §7 bans — reproduced in a
 * control capture at 0.18. The heavier lifting is done by drawing the scout through the blocker
 * instead (see `roaches.ts`), which conveys position AND heading, neither of which any amount of
 * blocker opacity can supply.
 */
export const MIN_FADE_FLOOR = 0.22;

/** Seconds for a full fade in or out. The contract mandates 150–300 ms. */
export const DEFAULT_FADE_SECONDS = 0.22;

export interface OccluderOptions {
  /**
   * Lowest coverage this group may reach.
   *
   * Large architecture (a cabinet run) can afford to go further than a small prop, because there is
   * more silhouette left to read at the same fraction.
   */
  readonly floor?: number | undefined;
  /**
   * Which room this prop is in.
   *
   * The broadphase. `update()` only raycasts against occluders in the active region, because a
   * wardrobe in the bedroom cannot possibly be between the camera and a scout in the kitchen. An
   * audit of the previous single-room version measured the cost model as
   * O(focus x 5 probes x ALL occluders) with a full recursive `intersectObject` per pair and no
   * rejection of any kind — fine at ten occluders, ruinous at a five-region apartment's density.
   */
  readonly region?: string | undefined;
}

interface Occluder {
  readonly root: THREE.Object3D;
  readonly region: string;
  /** World-space bounding sphere, computed once, used to reject before raycasting. */
  readonly bounds: THREE.Sphere;
  readonly materials: THREE.Material[];
  readonly meshes: THREE.Mesh[];
  /** What each mesh's `castShadow` was before we touched it, so restoration is honest. */
  readonly castShadowWas: boolean[];
  readonly floor: number;
  /** 1 = fully opaque, `floor` = fully faded. Eased toward `target` every frame. */
  current: number;
  target: number;
}

export interface OcclusionStats {
  /** Whether anything currently stands between the camera and the scout. */
  readonly scoutHidden: boolean;
  readonly registered: number;
  /** Groups currently below full coverage — surfaced so a perf capture can record it. */
  readonly fading: number;
  /** Occluders the broadphase admitted last frame. */
  readonly candidates: number;
  /** Recursive mesh raycasts actually performed last frame — the number that costs. */
  readonly tests: number;
}

/**
 * Probe offsets around a focus point, in world units.
 *
 * A single centre ray pops on and off as a thin object's silhouette crosses the scout's centre, and
 * popping is explicitly disallowed. Sampling a small volume makes the transition follow the actual
 * overlap instead of a knife-edge test.
 */
const PROBE_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 3, 0),
  new THREE.Vector3(13, 3, 0),
  new THREE.Vector3(-13, 3, 0),
  new THREE.Vector3(0, 3, 13),
  new THREE.Vector3(0, 3, -13),
];

export class OcclusionSystem {
  private readonly occluders: Occluder[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly probe = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly fadeSeconds: number;
  private lastCandidates = 0;
  private lastTests = 0;
  /** True while any occluder stands between the camera and the scout. Read by `roaches.ts`. */
  scoutHidden = false;

  constructor(fadeSeconds: number = DEFAULT_FADE_SECONDS) {
    this.fadeSeconds = fadeSeconds;
  }

  /**
   * Register a prop group as a fade candidate.
   *
   * Never register floors, the player, hazards or route feedback — the contract forbids fading any
   * of them, and a hazard you cannot see is worse than one you cannot see past.
   */
  register(root: THREE.Object3D, options: OccluderOptions = {}): void {
    const materials: THREE.Material[] = [];
    const meshes: THREE.Mesh[] = [];
    const castShadowWas: boolean[] = [];

    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;

      const cloned = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
      mesh.material = cloned;

      for (const m of Array.isArray(cloned) ? cloned : [cloned]) {
        // Opaque pass, depth written, no sorting — see the note at the top of this file.
        m.transparent = false;
        m.depthWrite = true;
        m.opacity = 1;
        m.alphaHash = false;
        materials.push(m);
      }

      meshes.push(mesh);
      castShadowWas.push(mesh.castShadow);
    });

    // Computed once at registration. Props do not move, and a per-frame bounds recomputation over
    // the whole flat would cost more than the raycasts it saves.
    const aabb = new THREE.Box3().setFromObject(root);
    const bounds = aabb.getBoundingSphere(new THREE.Sphere());

    this.occluders.push({
      root,
      region: options.region ?? '',
      bounds,
      materials,
      meshes,
      castShadowWas,
      floor: Math.max(MIN_FADE_FLOOR, options.floor ?? DEFAULT_FADE_FLOOR),
      current: 1,
      target: 1,
    });
  }

  /** Drop a group — used when a prop is removed from the world mid-run. */
  unregister(root: THREE.Object3D): void {
    const index = this.occluders.findIndex((o) => o.root === root);
    if (index < 0) return;
    const [removed] = this.occluders.splice(index, 1);
    if (removed) this.restore(removed);
  }

  /**
   * Snap every group back to opaque without animating.
   *
   * Called on restart and on camera teleport. Easing from whatever the previous run happened to be
   * showing is a visible seam, and a restart that inherits a half-faded cabinet is state leakage —
   * a tracked completion gate.
   */
  reset(): void {
    for (const o of this.occluders) {
      o.current = 1;
      o.target = 1;
      this.apply(o);
    }
  }

  /** Dispose the cloned materials. The caller still owns the geometry. */
  dispose(): void {
    for (const o of this.occluders) {
      for (const m of o.materials) m.dispose();
    }
    this.occluders.length = 0;
  }

  /** Per-occluder diagnostics: region, world bounds, and whether the broadphase admitted it. */
  debug(camera: THREE.Camera, focus: THREE.Vector3, activeRegions?: ReadonlySet<string>) {
    return this.occluders.slice(0, 6).map((o) => {
      const dir = focus.clone().sub(camera.position);
      const far = dir.length();
      this.raycaster.set(camera.position, dir.normalize());
      this.raycaster.far = far;
      return {
        name: o.root.name,
        region: o.region,
        admitted: !activeRegions || o.region === '' || activeRegions.has(o.region),
        centre: [
          Math.round(o.bounds.center.x),
          Math.round(o.bounds.center.y),
          Math.round(o.bounds.center.z),
        ],
        radius: Math.round(o.bounds.radius),
        sphereHit: this.raycaster.ray.intersectsSphere(o.bounds),
        meshHit: this.raycaster.intersectObject(o.root, true).length,
        meshes: o.meshes.length,
      };
    });
  }

  stats(): OcclusionStats {
    let fading = 0;
    for (const o of this.occluders) if (o.current < 0.999) fading++;
    return {
      registered: this.occluders.length,
      fading,
      candidates: this.lastCandidates,
      tests: this.lastTests,
      scoutHidden: this.scoutHidden,
    };
  }

  /**
   * Advance the fades.
   *
   * `focusPoints` is everything that must stay visible: the scout, the immediate actionable target,
   * and any route segment close enough to be being read right now. They are treated equally — a
   * route you are drawing is as load-bearing as the body drawing it.
   *
   * `activeRegions` is the broadphase. Only occluders in those rooms are considered; everything
   * else is eased back to opaque and never raycast.
   */
  update(
    dt: number,
    camera: THREE.Camera,
    focusPoints: readonly THREE.Vector3[],
    activeRegions?: ReadonlySet<string>,
  ): void {
    for (const o of this.occluders) o.target = 1;

    const candidates = activeRegions
      ? this.occluders.filter((o) => o.region === '' || activeRegions.has(o.region))
      : this.occluders;
    this.lastCandidates = candidates.length;
    let tests = 0;

    /*
     * The FIRST focus point is the scout, and whether it is hidden is reported separately.
     *
     * Reported as diagnostics only. It briefly also drove a scout silhouette drawn through the
     * blocker with `depthTest: false`, which did make the scout visible — and made it look like a
     * separate insect stuck to the cabinet DOOR, because a silhouette with no depth cue lands at the
     * scout's screen position rather than at its distance. A player described it as the scout
     * "떠다니고" (floating). Once occluders became genuinely translucent, the silhouette was solving
     * a problem that no longer existed, so it was removed and this flag stayed for triage.
     *
     * Reading it from the f === 0 pass is exact because nothing is condemned before that pass runs,
     * so a hit recorded there can only have come from the scout's own probes.
     */
    let scoutHidden = false;

    for (let f = 0; f < focusPoints.length; f++) {
      const focus = focusPoints[f]!;
      for (const offset of PROBE_OFFSETS) {
        this.probe.copy(focus).add(offset);
        this.direction.copy(this.probe).sub(camera.position);
        const distance = this.direction.length();
        if (distance < 1e-3) continue;

        this.raycaster.set(camera.position, this.direction.normalize());
        this.raycaster.far = distance;

        for (const o of candidates) {
          // Already condemned by an earlier probe — intersecting again cannot change the verdict.
          if (o.target < 1) continue;
          // Cheap sphere reject before the expensive recursive mesh test. A prop whose bounding
          // sphere the ray misses cannot contain a triangle the ray hits.
          if (!this.raycaster.ray.intersectsSphere(o.bounds)) continue;
          tests++;
          if (this.raycaster.intersectObject(o.root, true).length > 0) {
            o.target = o.floor;
            if (f === 0) scoutHidden = true;
          }
        }
      }
    }
    this.lastTests = tests;
    this.scoutHidden = scoutHidden;

    const step = dt / this.fadeSeconds;
    for (const o of this.occluders) {
      if (o.current === o.target) continue;
      o.current =
        o.current < o.target
          ? Math.min(o.target, o.current + step)
          : Math.max(o.target, o.current - step);
      this.apply(o);
    }
  }

  private apply(o: Occluder): void {
    const opaque = o.current >= 0.999;
    for (const m of o.materials) {
      m.opacity = o.current;
      /*
       * True alpha blending, with depth writing left ON.
       *
       * This used to be `alphaHash`, chosen because hashed alpha needs no sorting. It is a real
       * property and the reason the technique was picked — but under alpha hashing, coverage IS the
       * fraction of pixels kept, so a half-faded cabinet is literally a random half of its pixels.
       * Across a large near prop that reads as television static, which §7 bans by name, and it is
       * what a player reported after the fade floors were lowered. A side-by-side control capture at
       * the same camera and seed settles it: hashed alpha is salt-and-pepper noise, blending is
       * clean smoked glass.
       *
       * §3 permits "dithered alpha OR an equally depth-stable technique" and forbids alpha-sorting
       * artifacts. Keeping `depthWrite` true is what earns the second half: the prop still writes
       * depth, so it cannot mis-sort against itself or against other props, and the guard test that
       * pinned this behaviour still passes on the part that was actually load-bearing.
       *
       * Anything behind it stays visible because opaque geometry draws BEFORE the transparent queue
       * — the floor and the scout are already in the buffer when the cabinet blends over them.
       */
      m.alphaHash = false;
      m.transparent = !opaque;
      m.depthWrite = true;
      m.needsUpdate = true;
    }
    for (let i = 0; i < o.meshes.length; i++) {
      const mesh = o.meshes[i];
      if (mesh) mesh.castShadow = opaque && (o.castShadowWas[i] ?? false);
    }
  }

  private restore(o: Occluder): void {
    for (const m of o.materials) {
      m.opacity = 1;
      m.alphaHash = false;
      m.transparent = false;
      m.depthWrite = true;
      m.needsUpdate = true;
    }
    for (let i = 0; i < o.meshes.length; i++) {
      const mesh = o.meshes[i];
      if (mesh) mesh.castShadow = o.castShadowWas[i] ?? false;
    }
  }
}
