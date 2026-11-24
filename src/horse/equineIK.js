import * as THREE from 'three';
import { clamp } from './sculptUtils.js';

/**
 * Exact Sagittal-Plane (YZ) Bearing Angle for downward limb vectors in our right-handed frame
 * (+X left, +Y up, +Z forward), where positive rotation.x rotates +Y -> +Z and -Y -> -Z:
 *   psi(vy, vz) = atan2(-vz, -vy)
 *
 * Exact algebraic invariant:
 *   Rotating any vector with sagittal angle psi_0 by +phi around +X produces sagittal angle (psi_0 + phi)!
 *   - Straight down (0, -1, 0)       => psi =  0
 *   - Angled forward (0, -cos, +sin) => psi = -alpha
 *   - Angled backward (0, -cos, -sin)=> psi = +alpha
 */
export function sagittalAngle(vy, vz) {
  return Math.atan2(-vz, -vy);
}

/**
 * Convert a desired world sagittal angle `psi` and length `L` into a (vy, vz) displacement.
 */
export function sagittalVec(L, psi) {
  return {
    y: -L * Math.cos(psi),
    z: -L * Math.sin(psi),
  };
}

/**
 * Normalize angle to [-PI, PI] for smooth rotation differences.
 */
export function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/**
 * Precomputed exact rest lengths and sagittal rest angles for a 4-segment equine leg:
 *   Upper (Shoulder->Elbow or Hip->Stifle)
 *   Mid   (Elbow->Knee or Stifle->Hock)
 *   Lower (Knee->Fetlock or Hock->Fetlock)
 *   Pastern (Fetlock->Coronet)
 *   Hoof    (Coronet->HoofSole)
 */
export function measureLegChain(joints, prefix, tag) {
  const isFore = prefix === 'fore';
  const j0 = joints[isFore ? `shoulder${tag}` : `hip${tag}`];
  const j1 = joints[isFore ? `elbow${tag}` : `stifle${tag}`];
  const j2 = joints[isFore ? `knee${tag}` : `hock${tag}`];
  const j3 = joints[`${prefix}Fetlock${tag}`];
  const j4 = joints[`${prefix}Coronet${tag}`];
  const j5 = joints[`${prefix}Hoof${tag}`];

  const seg = (a, b) => {
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    return {
      len: Math.hypot(dy, dz),
      psiRest: sagittalAngle(dy, dz),
      dx: b[0] - a[0],
      dy,
      dz,
    };
  };

  return {
    isFore,
    upper: seg(j0, j1),
    mid: seg(j1, j2),
    lower: seg(j2, j3),
    pastern: seg(j3, j4),
    hoof: seg(j4, j5),
  };
}

/**
 * Solve EXACT Analytic 2-Bone Law-of-Cosines IK in the sagittal (YZ) plane!
 *
 * Given:
 *   - rootWorldPos: world (y, z) of the upper pivot (Elbow for foreleg, Stifle for hindleg)
 *   - targetWorldPos: world (y, z) of the end effector (Fetlock!)
 *   - L1: length of upper IK bone (Forearm or Gaskin)
 *   - L2: length of lower IK bone (Front Cannon or Hind Cannon)
 *   - bendDir:
 *       -1 for FORELEG KNEE (knee protrudes FORWARD +Z, cannon folds BACKWARD -Z!)
 *       +1 for HINDLEG HOCK (hock protrudes BACKWARD -Z, cannon angles FORWARD +Z!)
 *
 * Returns exact world sagittal angles { psi1, psi2, midY, midZ, reached }.
 */
export function solveSagittal2BoneIK(rootY, rootZ, targetY, targetZ, L1, L2, bendDir) {
  const dy = targetY - rootY;
  const dz = targetZ - rootZ;
  const rawDist = Math.hypot(dy, dz);

  // Soft-clamped reach to prevent harsh snapping/popping right at full extension
  const minD = Math.abs(L1 - L2) + 0.015;
  const maxD = L1 + L2 - 0.0025;
  let d = rawDist;
  if (d > maxD) {
    d = maxD;
  } else if (d < minD) {
    d = minD;
  }

  const psiD = sagittalAngle(dy, dz);

  // Law of Cosines for interior angle alpha1 between chord D and bone L1
  const cosA1 = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const alpha1 = Math.acos(cosA1);

  // Angle of upper bone L1
  const psi1 = psiD + bendDir * alpha1;

  // Exact world position of middle joint (Knee or Hock)
  const midY = rootY - L1 * Math.cos(psi1);
  const midZ = rootZ - L1 * Math.sin(psi1);

  // Exact angle of lower bone L2 pointing from middle joint to reachable target
  const targetEffY = rootY - d * Math.cos(psiD);
  const targetEffZ = rootZ - d * Math.sin(psiD);
  const psi2 = sagittalAngle(targetEffY - midY, targetEffZ - midZ);

  return {
    psi1,
    psi2,
    midY,
    midZ,
    reached: rawDist <= maxD + 0.005,
  };
}

/**
 * Critically/underdamped 2nd-order spring integrator for secondary physical inertia
 * (tail wind-drag & bounce lag, subtle neck/ear follow-through!).
 */
export class Spring1D {
  constructor(initial = 0, stiffness = 42, damping = 7.5) {
    this.value = initial;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  reset(val = 0) {
    this.value = val;
    this.velocity = 0;
  }

  step(target, dt, externalAccel = 0) {
    const h = Math.min(dt, 0.033);
    const force = (target - this.value) * this.stiffness - this.velocity * this.damping + externalAccel;
    this.velocity += force * h;
    this.value += this.velocity * h;
    return this.value;
  }
}
