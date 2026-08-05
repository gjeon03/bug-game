import * as THREE from 'three';

/**
 * The cockroach, built once and animated as a rigid hierarchy.
 *
 * WHY NOT A SkinnedMesh. Skinning exists to deform continuous soft surfaces across a joint. A
 * cockroach is the opposite: a chitinous animal made of hard plates and rigid leg segments joined
 * by hinges. Rotating rigid parts is not an approximation of its anatomy — it *is* its anatomy, it
 * costs no skinning weights, no bone texture and no per-vertex work, and it cannot produce the
 * candy-wrapper pinch a badly weighted joint gives you.
 *
 * WHY NOT POSE SWAPPING (what this replaces). The proof scene first built ten discrete gait poses
 * per roach and toggled visibility. Measured on an Apple M1 at 1920x1080: **2,743 geometries and
 * 965 draw calls** for a scene with twenty props and five roaches, because every pose was a full
 * mesh tree and nothing was shared. It held 60 fps only because the scene was tiny; the brief
 * requires dozens of workers. Here every roach shares ONE set of part geometries and ONE set of
 * materials, so geometry count is constant no matter how large the colony grows.
 *
 * Everything is modelled in real millimetres through the one scale anchor, exactly as the prop
 * library is. Proportions are Blattella germanica — the species that actually lives in Korean
 * apartment kitchens — scaled to a heroic 35 mm adult.
 */

/** Millimetres per world unit. Mirrors `tools/bake/lib/units.mjs`; the scout is 26 units = 35 mm. */
const MM_PER_UNIT = 35 / 26;
const mm = (millimetres: number): number => millimetres / MM_PER_UNIT;

/** Reference body length every dimension below is quoted against. */
const REFERENCE_BODY_MM = 35;

/*
 * MEASURED CORRECTION (proof-03).
 *
 * Limb thickness was first taken from anatomy: a real femur on a 35 mm roach is under a millimetre
 * across, so the mesh came out 0.29 world units in radius. At the gameplay camera that is
 * **0.7 pixels wide** — every leg and both antennae were antialiased out of existence and the roach
 * rendered as a bare brown oval, which is the first item on the banned list.
 *
 * These are therefore READABILITY dimensions, not anatomical ones, chosen so the thinnest limb
 * survives at roughly three pixels at the framing the game is actually played at. Body proportions
 * stay honest; only the sticks are exaggerated, which is the same bargain every stylized insect
 * makes. If the camera framing changes, re-derive these — do not tweak them by eye.
 */
const LEG_THICK_MM = 1.35;
const TIBIA_THICK_MM = 1.0;
const ANTENNA_THICK_MM = 1.05;

export type RoachPalette = 'scout' | 'workerDark' | 'workerPale' | 'nymph';

const PALETTES: Record<RoachPalette, { shell: number; dark: number; limb: number }> = {
  scout: { shell: 0x8a5524, dark: 0x4a2b11, limb: 0x6d431c },
  workerDark: { shell: 0x6b3f18, dark: 0x331d09, limb: 0x53331a },
  workerPale: { shell: 0x9c6a34, dark: 0x5a3616, limb: 0x7a5228 },
  nymph: { shell: 0x6d4a24, dark: 0x3a2410, limb: 0x55381b },
};

/**
 * Leg plan, front to back.
 *
 * Real cockroach legs lengthen toward the rear — the hind pair is the propulsion pair and is nearly
 * twice the front pair. Getting this wrong is what makes an insect read as a spider (uniform legs)
 * or a tick (stubby legs). `splayDeg` is the resting azimuth of the foot away from straight out to
 * the side; positive aims forward, negative aims backward.
 */
interface LegPlan {
  /** Hip attachment along the body axis, mm forward of body centre. */
  readonly hipZ: number;
  /** Hip attachment out from the midline, mm. */
  readonly hipX: number;
  readonly femurMm: number;
  readonly tibiaMm: number;
  readonly splayDeg: number;
  /** Stride length along the body axis, mm. */
  readonly strideMm: number;
}

const LEG_PLAN: readonly LegPlan[] = [
  { hipZ: 6.5, hipX: 4.2, femurMm: 6.5, tibiaMm: 6.0, splayDeg: 38, strideMm: 5.5 },
  { hipZ: 1.5, hipX: 4.8, femurMm: 8.5, tibiaMm: 8.0, splayDeg: 2, strideMm: 7.0 },
  { hipZ: -3.5, hipX: 4.6, femurMm: 10.5, tibiaMm: 12.0, splayDeg: -34, strideMm: 8.5 },
];

/**
 * Tripod gait grouping.
 *
 * An insect walks on an alternating tripod: front-left, mid-right and hind-left carry while
 * front-right, mid-left and hind-right swing. Three points of contact means it is statically stable
 * at every instant, which is why a cockroach can stop dead mid-stride without falling. Encoding it
 * as a half-cycle phase offset per leg IS the whole walk cycle — there is no clip to author, and it
 * adapts to any speed for free.
 */
function legPhaseOffset(pairIndex: number, isRight: boolean): number {
  const tripodA = pairIndex === 1 ? isRight : !isRight;
  return tripodA ? 0 : 0.5;
}

export interface RoachOptions {
  /** Body length in millimetres. 35 = heroic adult scout, 27 = worker, 17 = nymph. */
  readonly bodyMm?: number;
  readonly palette?: RoachPalette;
  /**
   * Mark this roach as the player's scout.
   *
   * A restrained difference, per the brief: a paler dorsal stripe along the pronotum shield. Never
   * a glowing circle — that is on the banned list because it is a UI element pretending to be a
   * character.
   */
  readonly isScout?: boolean;
}

/** One animatable roach. Owns no geometry — everything is borrowed from its `RoachAssets`. */
export interface Roach {
  readonly root: THREE.Group;
  /**
   * Advance the walk cycle and pose the body.
   *
   * @param phase  Gait phase in cycles. Continuous — the caller integrates speed into it, which is
   *               what makes the legs move faster when the body does and stop when it stops.
   * @param effort 0 = idle, 1 = walking, >1 = sprinting. Drives stride length and body pitch.
   */
  readonly pose: (phase: number, effort: number) => void;
  /** Cargo is held at the mandibles, never a detached floating dot. */
  readonly setCargo: (visible: boolean) => void;
}

/** Geometry and materials shared by every roach in the scene. Build once, dispose on restart. */
export interface RoachAssets {
  readonly build: (options: RoachOptions) => Roach;
  /** Live counts, for the restart-leak gate. */
  readonly stats: () => { geometries: number; materials: number };
  readonly dispose: () => void;
}

interface Leg {
  readonly hip: THREE.Object3D;
  readonly knee: THREE.Object3D;
  readonly femurLength: number;
  readonly tibiaLength: number;
  readonly restDirection: THREE.Vector2;
  readonly stride: number;
  readonly phaseOffset: number;
}

/**
 * Analytic two-bone inverse kinematics in the leg's own plane.
 *
 * Placing the FOOT and solving for the joints, rather than keyframing joint angles, is what keeps a
 * stance leg planted while the body travels over it. Keyframed joints slide the foot along the
 * ground, and that skating is the single clearest tell of a cheap walk cycle.
 */
function solveLeg(leg: Leg, footLocal: THREE.Vector3): void {
  const a = leg.femurLength;
  const b = leg.tibiaLength;

  const planar = Math.hypot(footLocal.x, footLocal.z);
  const azimuth = Math.atan2(footLocal.x, footLocal.z);
  const drop = footLocal.y;
  const reach = Math.min(Math.hypot(planar, drop), (a + b) * 0.999);
  const safe = Math.max(reach, Math.abs(a - b) + 1e-4);

  // Law of cosines: the interior angle at the hip, and the angle between the two segments.
  const hipInterior = Math.acos(
    THREE.MathUtils.clamp((a * a + safe * safe - b * b) / (2 * a * safe), -1, 1),
  );
  const kneeInterior = Math.acos(
    THREE.MathUtils.clamp((a * a + b * b - safe * safe) / (2 * a * b), -1, 1),
  );

  const declination = Math.atan2(-drop, planar);

  /*
   * MEASURED CORRECTION (proof-05). The first form was `-(declination + hipInterior) + PI/2`, which
   * for the hind leg evaluates to +0.523 rad; `Rx(0.523)` maps the femur's rest direction (0,-1,0)
   * to (0,-0.866,-0.5) — pointing DOWN AND BACKWARD, i.e. folded underneath the body where nothing
   * can see it. Every roach therefore rendered as a legless brown oval, the first entry on the
   * banned list, and no amount of thickening was ever going to fix it.
   *
   * Derivation of the correct form: the femur sits `hipInterior` ABOVE the hip-to-foot line (an
   * insect's knee is the high point of the leg), so its angle below horizontal is
   * `psi = declination - hipInterior`. Solving `Rx(theta)(0,-1,0) = (0, -sin psi, cos psi)` gives
   * `cos theta = sin psi` and `sin theta = -cos psi`, hence `theta = psi - PI/2`.
   */
  const femurPitch = declination - hipInterior;
  leg.hip.rotation.set(femurPitch - Math.PI / 2, azimuth, 0, 'YXZ');
  // The knee folds the tibia back down toward the ground — the direction a real insect knee bends.
  leg.knee.rotation.set(Math.PI - kneeInterior, 0, 0);
}

interface BodyGeometries {
  readonly head: THREE.BufferGeometry;
  readonly pronotum: THREE.BufferGeometry;
  readonly abdomen: THREE.BufferGeometry;
  readonly wing: THREE.BufferGeometry;
  readonly segment: THREE.BufferGeometry;
  readonly cargo: THREE.BufferGeometry;
}

function buildBodyGeometries(): BodyGeometries {
  /*
   * Flattened spheres. A cockroach is dorsoventrally compressed, and that flatness is the most
   * recognizable thing about its silhouette — it is why the animal can live in a 3 mm crack.
   *
   * MEASURED CORRECTION (proof-05): the pronotum was a sphere with a 0.34 y-scale, giving it 2.8
   * units of height on a body only 2.6 units tall. It rendered as a dark DOME sitting on the back,
   * so the animal read as two beans stuck together rather than as one flat body. A pronotum is a
   * shield: wider than it is long, and barely raised at all.
   */
  const head = new THREE.SphereGeometry(mm(2.4), 14, 10);
  head.scale(1.0, 0.55, 0.9);

  const pronotum = new THREE.SphereGeometry(mm(5.6), 20, 12);
  pronotum.scale(1.05, 0.2, 0.78);

  const abdomen = new THREE.SphereGeometry(mm(6.0), 20, 14);
  abdomen.scale(1.0, 0.26, 1.45);

  // Tegmina — the leathery forewings lying flat over the abdomen, which give the back its seam.
  const wing = new THREE.SphereGeometry(mm(5.4), 18, 12);
  wing.scale(0.92, 0.22, 1.5);

  // One tapered unit segment, reused for every femur, tibia and antenna joint. It hangs downward
  // from its origin so a joint can simply rotate it.
  const segment = new THREE.CylinderGeometry(0.34, 0.62, 1, 7, 1, false);
  segment.translate(0, -0.5, 0);

  const cargo = new THREE.SphereGeometry(mm(2.1), 10, 8);
  cargo.scale(1.1, 0.85, 1.0);

  return { head, pronotum, abdomen, wing, segment, cargo };
}

/**
 * Create the shared asset set. Call once per scene; dispose on restart.
 *
 * Restart leakage is a tracked completion gate, and shared assets are exactly the kind of thing
 * that survives a world rebuild unnoticed — hence an explicit `dispose` and a `stats` seam a test
 * can assert against.
 */
export function createRoachAssets(): RoachAssets {
  const geo = buildBodyGeometries();
  const geometries: THREE.BufferGeometry[] = Object.values(geo);
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();

  const material = (
    key: string,
    color: number,
    roughness: number,
    metalness: number,
  ): THREE.MeshStandardMaterial => {
    const existing = materialCache.get(key);
    if (existing) return existing;
    const made = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materialCache.set(key, made);
    return made;
  };

  function build(options: RoachOptions): Roach {
    const bodyMm = options.bodyMm ?? REFERENCE_BODY_MM;
    const paletteName = options.palette ?? 'scout';
    const palette = PALETTES[paletteName];
    const scale = bodyMm / REFERENCE_BODY_MM;

    // The shell highlight is the most important cue separating a living roach from a drawn oval, so
    // chitin keeps a little metalness and a tight roughness.
    const shell = material(`${paletteName}-shell`, palette.shell, 0.38, 0.12);
    const dark = material(`${paletteName}-dark`, palette.dark, 0.45, 0.1);
    const limb = material(`${paletteName}-limb`, palette.limb, 0.6, 0.05);
    const cargoMat = material('cargo', 0xc09a5e, 0.86, 0.0);

    const root = new THREE.Group();
    const body = new THREE.Group();
    const bodyRestY = mm(1.9) * scale;
    body.position.y = bodyRestY;
    root.add(body);

    const addMesh = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      parent: THREE.Object3D,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const abdomen = addMesh(geo.abdomen, shell, body);
    abdomen.position.z = mm(-4.0) * scale;
    abdomen.scale.setScalar(scale);

    const wing = addMesh(geo.wing, dark, body);
    wing.position.set(0, mm(0.9) * scale, mm(-3.5) * scale);
    wing.scale.setScalar(scale);

    const pronotum = addMesh(geo.pronotum, dark, body);
    pronotum.position.set(0, mm(0.6) * scale, mm(5.5) * scale);
    pronotum.scale.setScalar(scale);

    // The scout's one permitted tell: a paler stripe down the shield. Readable at gameplay distance
    // because it breaks the pronotum's specular highlight, not because it emits light.
    if (options.isScout) {
      // MEASURED CORRECTION (proof-07): at 0.34 width this read as a pale egg carried on the back
      // rather than as a marking on the shell. A dorsal stripe has to be narrow enough that the
      // dark shield still frames it on both sides.
      const stripe = addMesh(geo.pronotum, shell, body);
      stripe.position.set(0, mm(0.72) * scale, mm(5.2) * scale);
      stripe.scale.set(scale * 0.2, scale * 0.9, scale * 1.02);
    }

    // Tucked low and mostly under the leading edge of the shield, which is where a cockroach
    // actually carries its head — from above you see pronotum and antennae, barely any face.
    const head = addMesh(geo.head, dark, body);
    head.position.set(0, mm(-0.2) * scale, mm(9.4) * scale);
    head.scale.setScalar(scale);

    const cargo = addMesh(geo.cargo, cargoMat, body);
    cargo.position.set(0, mm(-0.5) * scale, mm(12.0) * scale);
    cargo.scale.setScalar(scale);
    cargo.visible = false;

    /* ------------------------------------------------------------------ legs */

    const legs: Leg[] = [];
    for (let pair = 0; pair < LEG_PLAN.length; pair++) {
      const plan = LEG_PLAN[pair]!;
      for (const side of [-1, 1]) {
        const hip = new THREE.Object3D();
        hip.position.set(mm(plan.hipX) * side * scale, 0, mm(plan.hipZ) * scale);
        body.add(hip);

        const femurLength = mm(plan.femurMm) * scale;
        const tibiaLength = mm(plan.tibiaMm) * scale;

        const femur = addMesh(geo.segment, limb, hip);
        femur.scale.set(mm(LEG_THICK_MM) * scale, femurLength, mm(LEG_THICK_MM) * scale);

        const knee = new THREE.Object3D();
        knee.position.y = -femurLength;
        hip.add(knee);

        const tibia = addMesh(geo.segment, limb, knee);
        tibia.scale.set(mm(TIBIA_THICK_MM) * scale, tibiaLength, mm(TIBIA_THICK_MM) * scale);

        const azimuth = THREE.MathUtils.degToRad(plan.splayDeg);
        legs.push({
          hip,
          knee,
          femurLength,
          tibiaLength,
          restDirection: new THREE.Vector2(Math.cos(azimuth) * side, Math.sin(azimuth)).normalize(),
          stride: mm(plan.strideMm) * scale,
          phaseOffset: legPhaseOffset(pair, side > 0),
        });
      }
    }

    /* -------------------------------------------------------------- antennae */

    const ANTENNA_JOINTS = 7;
    const ANTENNA_SEGMENT_MM = 5.2;
    const antennae: THREE.Object3D[][] = [];
    for (const side of [-1, 1]) {
      const chain: THREE.Object3D[] = [];
      let parent: THREE.Object3D = body;
      for (let i = 0; i < ANTENNA_JOINTS; i++) {
        const joint = new THREE.Object3D();
        if (i === 0) {
          joint.position.set(mm(1.5) * side * scale, mm(1.0) * scale, mm(9.6) * scale);
        } else {
          joint.position.y = -mm(ANTENNA_SEGMENT_MM) * scale;
        }
        parent.add(joint);

        const seg = addMesh(geo.segment, limb, joint);
        const taper = 1 - i / (ANTENNA_JOINTS + 2);
        seg.scale.set(
          mm(ANTENNA_THICK_MM) * taper * scale,
          mm(ANTENNA_SEGMENT_MM) * scale,
          mm(ANTENNA_THICK_MM) * taper * scale,
        );
        // Hair-thin: its shadow is noise, not information, and it doubles the shadow-caster count.
        seg.castShadow = false;

        chain.push(joint);
        parent = joint;
      }
      antennae.push(chain);
    }

    /* ------------------------------------------------------------------ pose */

    const footLocal = new THREE.Vector3();

    function pose(phase: number, effort: number): void {
      const drive = THREE.MathUtils.clamp(effort, 0, 2);

      for (const leg of legs) {
        const legPhase = (((phase + leg.phaseOffset) % 1) + 1) % 1;
        // Duty factor 0.6: a leg spends more of the cycle on the ground than in the air, which is
        // what keeps three feet planted at every instant.
        const inStance = legPhase < 0.6;
        const t = inStance ? legPhase / 0.6 : (legPhase - 0.6) / 0.4;

        // Stance sweeps the foot backward under the body; swing returns it forward and lifted.
        const along = inStance ? 0.5 - t : -0.5 + t;
        const lift = inStance ? 0 : Math.sin(t * Math.PI) * mm(2.6) * Math.max(drive, 0.35);

        // How far out the foot rests, as a fraction of total leg length. Below ~0.6 the leg folds
        // so tightly that the knee towers over the body; near 1.0 it locks straight and stops
        // reacting. 0.72 keeps a readable bend with the knee just clear of the carapace.
        const spread = (leg.femurLength + leg.tibiaLength) * 0.72;
        footLocal.set(
          leg.restDirection.x * spread,
          -bodyRestY + lift,
          leg.restDirection.y * spread + along * leg.stride * drive,
        );
        solveLeg(leg, footLocal);
      }

      // The body rides a little higher and pitches nose-down when sprinting, and rocks on the gait
      // cycle. Small numbers on purpose — a bouncing insect reads as a cartoon.
      const bob = Math.sin(phase * Math.PI * 4) * mm(0.22) * drive;
      body.position.y = bodyRestY + bob + mm(0.3) * Math.max(0, drive - 1);
      body.rotation.x =
        -0.05 * Math.max(0, drive - 1) + Math.sin(phase * Math.PI * 2) * 0.012 * drive;
      body.rotation.z = Math.sin(phase * Math.PI * 2) * 0.02 * drive;

      // Antennae sweep constantly, faster when moving. This never stops, even at rest — a still
      // antenna is the difference between a live insect and a model of one.
      for (let s = 0; s < antennae.length; s++) {
        const chain = antennae[s]!;
        const dir = s === 0 ? -1 : 1;
        for (let i = 0; i < chain.length; i++) {
          const joint = chain[i]!;
          const wave = Math.sin(phase * Math.PI * 2 * (1 + drive) + i * 0.5 + s * 1.7);
          if (i === 0) {
            /*
             * MEASURED CORRECTION (proof-06). This was `+PI * 0.46`, and `Rx(1.445)` maps the
             * segment's rest direction (0,-1,0) to (0,-0.125,-0.992) — straight BACKWARD, so both
             * antennae lay hidden underneath the abdomen and the roach rendered with none. The
             * same sign class of bug as the legs, found the same way: by evaluating the rotation
             * against the rest vector instead of eyeballing the number.
             *
             * Forward and slightly raised is (0, +0.2, +0.98), which solves to theta ~ -1.77 rad.
             */
            joint.rotation.set(-Math.PI * 0.56 + wave * 0.09, dir * (0.5 + wave * 0.14), 0);
          } else {
            // A gentle progressive droop so the antenna arcs instead of standing out like a wire.
            joint.rotation.set(0.11 + wave * 0.1, wave * 0.06, 0);
          }
        }
      }
    }

    pose(0, 0);

    return {
      root,
      pose,
      setCargo: (visible: boolean) => {
        cargo.visible = visible;
      },
    };
  }

  return {
    build,
    stats: () => ({ geometries: geometries.length, materials: materialCache.size }),
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materialCache.values()) m.dispose();
      materialCache.clear();
    },
  };
}
