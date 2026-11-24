import * as THREE from 'three';
import { evalHorseBodySDF, evalHorseSurfaceNormal, pushOutsideHorseSurface } from './horseSDF.js';
import { chainWeights, clamp, smoothstep } from './sculptUtils.js';

function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Find exact dorsal surface point on the horse's neck crest at given Z.
 */
function findDorsalCrestPoint(z) {
  let y = 2.32;
  for (let i = 0; i < 52; i++) {
    const d = evalHorseBodySDF(0, y, z);
    if (d <= 0.002) break;
    y -= Math.max(0.004, d * 0.85);
    if (y < 1.35) break;
  }
  return new THREE.Vector3(0, y, z);
}

/**
 * Append a VOLUMETRIC 3-column curved-ridge hair lock (left edge, raised central ridge, right edge)
 * with fanned normals so EVERY lock catches silky directional rim sunlight instead of reading as a flat cutout!
 */
function addVolumetricHairLock(buffers, {
  points,
  widths,
  ridgeLift = 0.006,
  ribbonNormalDir,
  shadeRoot = 0.36,
  shadeMid = 0.92,
  shadeTip = 0.78,
  warmShift = 0.0,
  weightFn,
}) {
  const segs = points.length - 1;
  const baseIdx = buffers.positions.length / 3;
  const tangent = new THREE.Vector3();
  const sideVec = new THREE.Vector3();
  const outNormal = new THREE.Vector3();
  const nLeft = new THREE.Vector3();
  const nRight = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    const v = i / segs;
    const p = points[i];

    if (i === 0) tangent.subVectors(points[1], points[0]).normalize();
    else if (i === segs) tangent.subVectors(points[segs], points[segs - 1]).normalize();
    else tangent.subVectors(points[i + 1], points[i - 1]).normalize();

    sideVec.crossVectors(tangent, ribbonNormalDir);
    if (sideVec.lengthSq() < 1e-5) sideVec.set(0, 0, 1);
    else sideVec.normalize();

    outNormal.crossVectors(sideVec, tangent).normalize();
    if (outNormal.dot(ribbonNormalDir) < 0) outNormal.negate();

    // Fanned normals across the curved V-ridge cross-section -> authentic glossy cylindrical strand reflection!
    nLeft.copy(outNormal).addScaledVector(sideVec, -0.58).normalize();
    nRight.copy(outNormal).addScaledVector(sideVec,  0.58).normalize();

    const halfW = widths[i] * 0.5;
    const lift = ridgeLift * Math.sin(clamp(1 - v * 0.65, 0.2, 1) * Math.PI * 0.5);

    const pL = p.clone().addScaledVector(sideVec, -halfW);
    const pC = p.clone().addScaledVector(outNormal, lift);
    const pR = p.clone().addScaledVector(sideVec,  halfW);

    const shade = v < 0.28
      ? THREE.MathUtils.lerp(shadeRoot, shadeMid, v / 0.28)
      : THREE.MathUtils.lerp(shadeMid, shadeTip, (v - 0.28) / 0.72);

    const cr = clamp(shade * (1 + warmShift * 0.16), 0.15, 1.0);
    const cg = clamp(shade * (1 + warmShift * 0.05), 0.14, 1.0);
    const cb = clamp(shade * (1 - warmShift * 0.06), 0.13, 1.0);

    const wPairs = weightFn(p, v);
    const { idx, w } = packWeights(wPairs);

    // 3 vertices per station: Left (u=0), Raised Center Ridge (u=0.5), Right (u=1)
    const row = [
      { pos: pL, norm: nLeft,     u: 0.0, mul: 0.80 },
      { pos: pC, norm: outNormal, u: 0.5, mul: 1.06 },
      { pos: pR, norm: nRight,    u: 1.0, mul: 0.84 },
    ];

    for (const vert of row) {
      buffers.positions.push(vert.pos.x, vert.pos.y, vert.pos.z);
      buffers.normals.push(vert.norm.x, vert.norm.y, vert.norm.z);
      buffers.uvs.push(vert.u, v);
      buffers.colors.push(
        clamp(cr * vert.mul, 0, 1),
        clamp(cg * vert.mul, 0, 1),
        clamp(cb * vert.mul, 0, 1)
      );
      buffers.skinIndices.push(idx[0], idx[1], idx[2], idx[3]);
      buffers.skinWeights.push(w[0], w[1], w[2], w[3]);
    }
  }

  for (let i = 0; i < segs; i++) {
    const r0 = baseIdx + i * 3;
    const r1 = baseIdx + (i + 1) * 3;
    // Left half strip
    buffers.indices.push(r0 + 0, r1 + 0, r1 + 1, r0 + 0, r1 + 1, r0 + 1);
    // Right half strip
    buffers.indices.push(r0 + 1, r1 + 1, r1 + 2, r0 + 1, r1 + 2, r0 + 2);
  }
}

function packWeights(pairs) {
  const sorted = pairs.filter((p) => p[1] > 1e-5).sort((a, b) => b[1] - a[1]).slice(0, 4);
  let sum = 0;
  for (const p of sorted) sum += p[1];
  const idx = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  if (sum <= 0) {
    w[0] = 1;
    return { idx, w };
  }
  for (let i = 0; i < sorted.length; i++) {
    idx[i] = sorted[i][0];
    w[i] = sorted[i][1] / sum;
  }
  return { idx, w };
}

function createBuffers() {
  return {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    skinIndices: [],
    skinWeights: [],
    indices: [],
  };
}

function finalizeHairGeometry(buffers) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(buffers.skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(buffers.skinWeights, 4));
  geo.setIndex(buffers.indices);
  return geo;
}

/**
 * Build lush, volumetric, multi-layered Mane & graceful Side-Swept Forelock!
 * V5 Fixes:
 *   - Curved 3D V-ridge locks catch silky directional sunlight (NEVER a flat dead black sheet!)
 *   - Smooth continuous plush dorsal crest rise (~2 cm) so the horse looks regal & full-maned from BOTH Left and Right sides!
 *   - Side-swept parted forelock tapering organically across the brow (NO spiky comb bangs!)
 */
export function buildManeAndForelockGeometry(boneIndex) {
  const rng = createRng(104729);
  const buffers = createBuffers();

  const maneSpineControls = [
    { t: 0.00, bone: boneIndex.withers },
    { t: 0.25, bone: boneIndex.neckBase },
    { t: 0.56, bone: boneIndex.neckMid },
    { t: 0.86, bone: boneIndex.neckUpper },
    { t: 1.00, bone: boneIndex.head },
  ];

  const crestSamples = [];
  const sampleN = 44;
  for (let i = 0; i <= sampleN; i++) {
    const u = i / sampleN;
    const z = THREE.MathUtils.lerp(0.45, 1.08, u);
    crestSamples.push(findDorsalCrestPoint(z));
  }
  const crestCurve = new THREE.CatmullRomCurve3(crestSamples);

  // --- 1. LUSH VOLUMETRIC MANE (240 sculpted 3D locks cascading gracefully right -X with continuous soft crest volume!) ---
  const strandCount = 240;
  for (let i = 0; i < strandCount; i++) {
    const u = clamp((i + (rng() - 0.5) * 0.55) / (strandCount - 1), 0.0, 1.0);
    const rootOnCrest = crestCurve.getPoint(u);
    const layer = i % 3;

    // Smooth tapered feathering into withers (u -> 0) and poll (u -> 1) -> zero squared edge step!
    const env = Math.pow(Math.sin(clamp(u, 0.01, 0.99) * Math.PI), 0.78);
    const length = (0.09 + 0.32 * env) * (0.86 + rng() * 0.26);

    const segs = 9;
    const pts = [];
    const widths = [];
    const maxWidth = (layer === 0 ? 0.052 : layer === 1 ? 0.038 : 0.026) * (0.65 + 0.35 * env) * (0.88 + rng() * 0.24);
    const wavePhase = u * 11.0 + rng() * 2.2;
    const waveAmp = 0.008 + layer * 0.005;
    const driftZ = -0.050 - u * 0.025 + (rng() - 0.5) * 0.022;
    // Extra generous clearance near lower shoulder base so ZERO stray tip ever pokes inside shoulder skin!
    const shoulderBoost = (1 - smoothstep(0.0, 0.35, u)) * 0.012;
    const skinClearance = 0.008 + layer * 0.010 + shoulderBoost + rng() * 0.004;

    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      const p = rootOnCrest.clone();

      const crestArch = Math.sin(Math.min(1, f * 2.3) * Math.PI) * (0.014 + layer * 0.007) * (0.45 + 0.55 * env);
      const outSweep = Math.sin(Math.min(1, f * 1.55) * Math.PI * 0.5) * (0.080 + layer * 0.022 + (1 - u) * 0.050);
      const dropY = Math.pow(f, 1.32) * length;

      const startX = THREE.MathUtils.lerp(0.008, -outSweep, smoothstep(0.0, 0.28, f));

      p.x += startX - Math.cos(f * 3.6 + wavePhase) * waveAmp * 0.35 * f;
      p.y += crestArch - dropY;
      p.z += driftZ * f + Math.sin(f * 4.0 + wavePhase) * waveAmp * f;

      if (s === 0) {
        p.y -= 0.006;
      } else if (s === 1) {
        pushOutsideHorseSurface(p, 0.008 + layer * 0.006, 4);
      } else {
        pushOutsideHorseSurface(p, skinClearance * (0.75 + 0.50 * f), 5);
      }

      pts.push(p);

      const taper = Math.sin(Math.pow(1 - f, 0.66) * Math.PI * 0.5) * (0.62 + 0.38 * smoothstep(0, 0.14, f));
      widths.push(Math.max(0.005, maxWidth * taper));
    }

    const baseWeights = chainWeights(u, maneSpineControls, 1.15);
    const normalDir = new THREE.Vector3(-0.88, 0.42, 0.15 + (rng() - 0.5) * 0.2).normalize();

    addVolumetricHairLock(buffers, {
      points: pts,
      widths,
      ridgeLift: layer === 0 ? 0.005 : 0.009,
      ribbonNormalDir: normalDir,
      shadeRoot: layer === 0 ? 0.28 : 0.44,
      shadeMid:  layer === 0 ? 0.66 : layer === 1 ? 0.90 : 1.0,
      shadeTip:  layer === 0 ? 0.54 : 0.84,
      warmShift: (rng() - 0.25) * 0.8,
      weightFn: () => baseWeights,
    });
  }

  // --- 2. GRACEFUL SIDE-SWEPT SILKY FORELOCK (34 volumetric curved locks sweeping diagonally over brow — NO comb bangs!) ---
  const forelockCount = 34;
  const pollTop = findDorsalCrestPoint(1.115);
  for (let i = 0; i < forelockCount; i++) {
    const spread = (i / (forelockCount - 1) - 0.5) * 2.0; // -1..+1
    const layer = i % 3;
    const root = new THREE.Vector3(
      spread * 0.024 + (rng() - 0.5) * 0.006,
      pollTop.y - 0.004,
      1.125 + (rng() - 0.5) * 0.012
    );

    // Taper smoothly to a soft graceful teardrop lock sweeping naturally right (-X) across forehead
    const centerFull = 1.0 - Math.abs(spread) * 0.65;
    const len = (0.16 + centerFull * 0.11) * (0.88 + rng() * 0.24);
    const segs = 7;
    const pts = [];
    const widths = [];
    const maxW = (layer === 0 ? 0.032 : layer === 1 ? 0.024 : 0.016) * (0.88 + rng() * 0.24);
    const waveP = spread * 2.2 + rng() * 1.4;
    const clear = 0.007 + layer * 0.007;

    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      const p = root.clone();
      // Converge gracefully toward a natural diagonal sweep (-X) instead of straight flat comb teeth!
      const sweepX = -0.042 * Math.pow(f, 1.15) + spread * 0.016 * (1 - f * 0.65);
      p.x += sweepX + Math.sin(f * 3.5 + waveP) * 0.005 * f;
      p.y += Math.sin(f * Math.PI) * (0.014 + layer * 0.005) - len * f * 0.72;
      p.z += Math.sin(f * Math.PI) * 0.012 + len * f * 0.68;

      if (s === 0) {
        p.y -= 0.004;
      } else {
        pushOutsideHorseSurface(p, clear * (0.55 + 0.65 * f), 4);
      }
      pts.push(p);

      const taper = Math.pow(1 - f, 0.72);
      widths.push(Math.max(0.004, maxW * (0.55 + 0.45 * smoothstep(0, 0.16, f)) * taper));
    }

    addVolumetricHairLock(buffers, {
      points: pts,
      widths,
      ridgeLift: 0.006,
      ribbonNormalDir: new THREE.Vector3(-0.22 + spread * 0.2, 0.68, 0.70).normalize(),
      shadeRoot: 0.34,
      shadeMid: 0.86 + layer * 0.07,
      shadeTip: 0.78,
      warmShift: (rng() - 0.3) * 0.7,
      weightFn: () => [[boneIndex.head, 1]],
    });
  }

  const geo = finalizeHairGeometry(buffers);
  geo.userData.part = 'mane';
  return geo;
}

/**
 * Build lush multi-layered Volumetric Flowing Equine Tail (220 3D curved-ridge locks)
 * cascading organically from the high-set tail dock down past the hocks!
 */
export function buildTailHairGeometry(boneIndex) {
  const rng = createRng(73856093);
  const buffers = createBuffers();

  const tailControls = [
    { t: 0.00, bone: boneIndex.tailBase },
    { t: 0.24, bone: boneIndex.tailMid },
    { t: 0.60, bone: boneIndex.tailLower },
    { t: 0.96, bone: boneIndex.tailTip },
  ];

  const strandCount = 220;
  for (let i = 0; i < strandCount; i++) {
    const layer = i % 3;
    const ringAngle = (i * 2.399963) % (Math.PI * 2);
    const rootU = rng() * 0.72;

    const dockY = THREE.MathUtils.lerp(1.455, 1.32, rootU);
    const dockZ = THREE.MathUtils.lerp(-0.78, -0.87, rootU) - Math.sin(rootU * Math.PI) * 0.015;

    const rDist = (0.020 + layer * 0.013) * (1 - 0.30 * rootU);
    const start = new THREE.Vector3(
      Math.cos(ringAngle) * rDist * 0.92,
      dockY + Math.sin(ringAngle) * rDist * 0.48,
      dockZ - (0.35 + 0.65 * Math.abs(Math.sin(ringAngle))) * rDist
    );
    pushOutsideHorseSurface(start, 0.004 + layer * 0.005, 3);

    const targetEndY = 0.34 + rng() * 0.22 + (layer === 0 ? 0.04 : 0);
    const dropLen = Math.max(0.58, start.y - targetEndY);

    const segs = 10;
    const pts = [];
    const widths = [];
    const maxWidth = (layer === 0 ? 0.064 : layer === 1 ? 0.046 : 0.032) * (0.86 + rng() * 0.32);

    const flareOut = 0.056 + layer * 0.025 + rng() * 0.022;
    const wavePhase = ringAngle * 1.5 + rng() * 2.0;
    const waveFreq = 2.8 + rng() * 1.8;
    const waveAmp = 0.014 + layer * 0.009;

    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      const bulge = Math.sin(Math.pow(f, 0.72) * Math.PI) * flareOut;
      const backSweep = Math.sin(Math.min(1, f * 1.45) * Math.PI * 0.5) * (0.095 + layer * 0.022) + f * 0.025;

      const p = start.clone();
      p.x += Math.cos(ringAngle) * (bulge * 0.88) + Math.sin(f * waveFreq + wavePhase) * waveAmp * f;
      p.y -= dropLen * Math.pow(f, 1.03);
      p.z -= backSweep + (0.25 + 0.55 * Math.abs(Math.sin(ringAngle))) * bulge + Math.cos(f * waveFreq + wavePhase) * waveAmp * 0.6 * f;

      if (s > 0 && f < 0.42) {
        pushOutsideHorseSurface(p, 0.008 + layer * 0.007, 3);
      }

      pts.push(p);

      const wEnv = Math.sin(Math.pow(1 - f, 0.62) * Math.PI * 0.5) * (0.58 + 0.42 * smoothstep(0, 0.14, f));
      widths.push(Math.max(0.006, maxWidth * wEnv));
    }

    const radialNormal = new THREE.Vector3(Math.cos(ringAngle) * 0.9, 0.16, -0.75 - Math.abs(Math.sin(ringAngle)) * 0.38).normalize();

    addVolumetricHairLock(buffers, {
      points: pts,
      widths,
      ridgeLift: layer === 0 ? 0.006 : 0.010,
      ribbonNormalDir: radialNormal,
      shadeRoot: layer === 0 ? 0.28 : 0.44,
      shadeMid:  layer === 0 ? 0.66 : layer === 1 ? 0.90 : 1.0,
      shadeTip:  layer === 0 ? 0.54 : 0.84,
      warmShift: (rng() - 0.3) * 0.7,
      weightFn: (_p, v) => chainWeights(clamp(rootU * 0.30 + v * 0.88, 0, 1), tailControls, 1.2),
    });
  }

  const geo = finalizeHairGeometry(buffers);
  geo.userData.part = 'tail';
  return geo;
}
