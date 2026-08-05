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

/** `mark` is the pale pronotal ground the scout's two dark stripes sit on. */
const PALETTES: Record<RoachPalette, { shell: number; dark: number; limb: number; mark: number }> = {
  scout: { shell: 0x8a5524, dark: 0x3d2209, limb: 0x6d431c, mark: 0xc09453 },
  workerDark: { shell: 0x6b3f18, dark: 0x331d09, limb: 0x53331a, mark: 0x8a6236 },
  workerPale: { shell: 0x9c6a34, dark: 0x5a3616, limb: 0x7a5228, mark: 0xb98d52 },
  nymph: { shell: 0x6d4a24, dark: 0x3a2410, limb: 0x55381b, mark: 0x9e7a45 },
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

/*
 * MEASURED CORRECTION (proof-09). The first plan splayed all three pairs close to straight out to
 * the side and gave the hind pair 22.5 mm of leg on a 35 mm body. Rendered, that reads as a SPIDER:
 * long limbs arranged radially around a compact body is the arachnid silhouette, and it fails the
 * "scout reads as a cockroach" gate no matter how good the carapace is.
 *
 * What separates the two shapes is sweep, not leg count. A cockroach's legs rake BACKWARD — the
 * front pair reaches forward past the head, the hind pair trails well behind the abdomen, and the
 * body is long rather than round. Sweeping the pairs apart and shortening the hind reach is what
 * turns the silhouette back into an insect.
 */
/*
 * MEASURED CORRECTION (proof-10, independent visual critique).
 *
 * Splaying the pairs apart was not enough. The critic's diagnosis was exact: "six thin rods
 * radiating from the WIDEST part of the body" is the arachnid read, and on one roach "the legs
 * cluster across the abdomen with none at the head end, which is anatomically backwards for any
 * insect."
 *
 * All six legs of an insect attach to the THORAX — the front third, under the pronotum — never to
 * the abdomen. Moving the coxae forward is what makes the abdomen trail behind the leg cluster
 * instead of sitting in the middle of it, and that is the single strongest blattid cue.
 */
const LEG_PLAN: readonly LegPlan[] = [
  { hipZ: 9.0, hipX: 3.6, femurMm: 6.0, tibiaMm: 5.6, splayDeg: 58, strideMm: 5.0 },
  { hipZ: 5.2, hipX: 4.2, femurMm: 7.6, tibiaMm: 7.0, splayDeg: -4, strideMm: 6.4 },
  { hipZ: 1.2, hipX: 4.0, femurMm: 9.0, tibiaMm: 9.6, splayDeg: -56, strideMm: 7.6 },
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
  readonly carapace: THREE.BufferGeometry;
  readonly pronotum: THREE.BufferGeometry;
  readonly seam: THREE.BufferGeometry;
  readonly head: THREE.BufferGeometry;
  readonly segment: THREE.BufferGeometry;
  readonly cargo: THREE.BufferGeometry;
}

/** Overall body dimensions for the 35 mm reference adult, in millimetres. */
const BODY_LENGTH_MM = 35;
const BODY_WIDTH_MM = 12.4;
const BODY_HEIGHT_MM = 4.6;

/**
 * Half-width of the body at normalised position `t` along its axis (0 = rear, 1 = snout).
 *
 * MEASURED CORRECTION (proof-11). The first profile was a single ellipse centred at t = 0.35, which
 * evaluates to 0.88 at t = 0 and 0.48 at t = 1 — it never reaches zero. But the sphere's pole
 * vertices ARE collapsed onto the axis, so the mesh jumped from a point to 88 % width in one ring
 * and the body rendered with **squared-off ends like a plank**. A closed body needs a profile that
 * vanishes where the geometry vanishes.
 *
 * Two arcs joined at the widest point: a rounded rear, and a longer taper to the snout. The
 * fractional exponents keep both ends full rather than pointed, which is what stops a cockroach
 * reading as a grain of rice.
 */
function widthProfile(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped < 0.38) {
    return Math.pow(Math.sin((Math.PI / 2) * (clamped / 0.38)), 0.62);
  }
  return Math.pow(Math.cos((Math.PI / 2) * ((clamped - 0.38) / 0.62)), 0.5);
}

/**
 * Dorsal dome height at `t`.
 *
 * A low exponent on a sine makes the back a long flat plateau that rolls off at both ends, rather
 * than a dome. Flatness is the animal's defining feature and the reason it lives in cracks.
 */
function heightProfile(t: number): number {
  return Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.42);
}

/**
 * The carapace: ONE continuous flattened teardrop shell.
 *
 * MEASURED CORRECTION (proof-10, independent visual critique). The body was previously three
 * stacked ellipsoids — abdomen, wing case, pronotum — and the critic's verdict was unambiguous:
 * "the body is two separate ellipsoids joined at a visible waist… a two-lobe body with legs
 * radiating from the wide part is the canonical spider/tick read."
 *
 * A cockroach has no waist. It is a single flattened shield, and the abdomen is completely covered
 * by the tegmina, so the outline from head to tail is one unbroken curve. That is why a real roach
 * can vanish into a 3 mm crack and why its silhouette is unmistakable even in a photograph taken
 * from directly above.
 *
 * Built by deforming a sphere rather than by assembling parts, because any assembly of parts
 * reintroduces the seam this exists to remove. The cross-section is elliptical (flat), and the
 * underside is flatter still — a roach's belly is nearly planar, which is what lets it lie flush
 * against a surface.
 */
function buildCarapace(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 44, 26);
  const position = geometry.attributes.position as THREE.BufferAttribute;

  const halfLength = mm(BODY_LENGTH_MM) / 2;
  const halfWidth = mm(BODY_WIDTH_MM) / 2;
  const halfHeight = mm(BODY_HEIGHT_MM) / 2;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    // The sphere's own cross-section radius at this z; used to recover a unit direction.
    const ring = Math.hypot(x, y);
    const t = (z + 1) / 2;

    const w = widthProfile(t);
    const h = heightProfile(t);

    if (ring < 1e-6) {
      // Pole vertex: collapse it onto the axis at the profile's endpoint.
      position.setXYZ(i, 0, 0, z * halfLength);
      continue;
    }

    const nx = x / ring;
    const ny = y / ring;
    // The belly is nearly flat; only the back is domed.
    const vertical = ny < 0 ? 0.42 : 1;

    position.setXYZ(i, nx * w * halfWidth, ny * h * halfHeight * vertical, z * halfLength);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The pronotal shield.
 *
 * Sized and placed to hug the carapace it sits on, so it reads as a plate overlapping the animal's
 * shoulders rather than as a second body segment. It must overlap the head — from directly above a
 * cockroach you see shield and antennae, and barely any face at all.
 */
function buildPronotum(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 30, 16);
  const position = geometry.attributes.position as THREE.BufferAttribute;

  const halfLength = mm(9.5) / 2;
  const halfWidth = mm(11.6) / 2;
  const halfHeight = mm(2.6) / 2;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const ring = Math.hypot(x, y);
    const t = (z + 1) / 2;
    // Trapezoidal: narrow at the front, broad at the shoulders.
    const w = 0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.1));

    if (ring < 1e-6) {
      position.setXYZ(i, 0, 0, z * halfLength);
      continue;
    }
    const nx = x / ring;
    const ny = y / ring;
    position.setXYZ(i, nx * w * halfWidth, ny * halfHeight * (ny < 0 ? 0.3 : 1), z * halfLength);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function buildBodyGeometries(): BodyGeometries {
  const carapace = buildCarapace();
  const pronotum = buildPronotum();

  /*
   * The tegminal seam — where the two forewings meet down the animal's back.
   *
   * A thin dark wedge rather than a painted line, so it catches the key light along one edge and
   * actually reads at gameplay distance. Without it the back is a blank dome and the eye has
   * nothing to identify the wing cases by.
   */
  const seam = new THREE.BoxGeometry(mm(0.7), mm(0.5), mm(19));

  // Mostly hidden under the shield; only the front margin and the mouthparts show from above.
  const head = new THREE.SphereGeometry(mm(2.3), 14, 10);
  head.scale(1.0, 0.5, 0.85);

  /*
   * One tapered unit segment, reused for every femur, tibia and antenna joint. It hangs downward
   * from its origin so a joint can simply rotate it.
   *
   * MEASURED CORRECTION (proof-11): the radii were `(0.34, 0.62)` — top thin, bottom thick — so
   * every limb got FATTER toward the joint below it. A femur is thick where it meets the body and
   * narrows to the knee; reversed, the legs read as blunt slabs rather than as limbs.
   */
  const segment = new THREE.CylinderGeometry(0.62, 0.34, 1, 8, 1, false);
  segment.translate(0, -0.5, 0);

  const cargo = new THREE.SphereGeometry(mm(2.1), 10, 8);
  cargo.scale(1.1, 0.85, 1.0);

  return { carapace, pronotum, seam, head, segment, cargo };
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
    const mark = material(`${paletteName}-mark`, palette.mark, 0.42, 0.08);
    const cargoMat = material('cargo', 0xc09a5e, 0.86, 0.0);

    const root = new THREE.Group();
    const body = new THREE.Group();
    // The carapace belly sits ~1 mm below the body origin; this clears it off the floor.
    const bodyRestY = mm(1.3) * scale;
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

    // One continuous shell from snout to tail. No waist, no stacked lobes — see buildCarapace.
    const carapace = addMesh(geo.carapace, shell, body);
    carapace.scale.setScalar(scale);

    // The tegminal seam sits a hair proud of the back so it catches the key light along one edge.
    const seam = addMesh(geo.seam, dark, body);
    seam.position.set(0, mm(2.28) * scale, mm(-4.5) * scale);
    seam.scale.setScalar(scale);

    /*
     * Pronotum, and the player's identifier.
     *
     * Blattella germanica — the species that actually lives in Korean apartment kitchens — carries
     * two dark longitudinal stripes on a PALE pronotum. Giving that real marking to the scout and a
     * plain dark shield to the workers is both anatomically honest and the most readable
     * differentiator available: a large high-contrast area rather than an outline.
     *
     * MEASURED CORRECTION (proof-10, independent critique): the previous tell resolved to "a 1–2
     * pixel outline against a dark brown body on a mid-blue ground — invisible… the player cannot
     * find themselves." Size alone cannot carry it either, because perspective makes a nearer
     * worker just as large on screen as the scout.
     */
    const pronotum = addMesh(geo.pronotum, options.isScout ? mark : dark, body);
    pronotum.position.set(0, mm(0.9) * scale, mm(10.0) * scale);
    pronotum.scale.setScalar(scale);

    if (options.isScout) {
      for (const side of [-1, 1]) {
        const stripe = addMesh(geo.seam, dark, body);
        stripe.position.set(mm(1.8) * side * scale, mm(2.1) * scale, mm(10.0) * scale);
        stripe.scale.set(scale * 1.2, scale, scale * 0.42);
      }
    }

    // Tucked low and mostly under the leading edge of the shield, which is where a cockroach
    // actually carries its head — from above you see pronotum and antennae, barely any face.
    // MEASURED CORRECTION (proof-11): at z = 15.4 mm the head protruded past the tapering snout as
    // a dark bulb. A cockroach's head hangs UNDER the shield and points down at the floor.
    const head = addMesh(geo.head, dark, body);
    head.position.set(0, mm(-0.8) * scale, mm(13.2) * scale);
    head.scale.setScalar(scale * 0.86);

    const cargo = addMesh(geo.cargo, cargoMat, body);
    cargo.position.set(0, mm(-0.9) * scale, mm(16.6) * scale);
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
          // At the head, not the shoulders — antennae emerge beside the mouthparts.
          joint.position.set(mm(1.6) * side * scale, mm(0.4) * scale, mm(16.2) * scale);
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

        // How far out the foot rests, as a fraction of total leg length. Near 1.0 the leg locks
        // straight and stops reacting; too low and the knee towers over the body. 0.58 keeps the
        // feet tucked close the way a resting cockroach holds them — 0.72 read as a spider.
        const spread = (leg.femurLength + leg.tibiaLength) * 0.58;
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
