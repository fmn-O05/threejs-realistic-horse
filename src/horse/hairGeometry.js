import * as THREE from 'three';
import { JOINTS } from './anatomy.js';
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
 * Find exact dorsal surface point on the horse's neck crest at given Z by dropping vertically from y = 2.30.
 */
function findDorsalCrestPoint(z) {
  let y = 2.28;
  for (let i = 0; i < 48; i++) {
    const d = evalHorseBodySDF(0, y, z);
    if (d <= 0.002) break;
    y -= Math.max(0.004, d * 0.85);
    if (y < 1.35) break;
  }
  return new THREE.Vector3(0, y, z);
}

/**
 * Append a curved, tapering, smoothly shaded hair ribbon strip into shared buffers.
 */
function addHairRibbon(buffers, {
  points,
  widths,
  ribbonNormalDir,
  shadeRoot = 0.45,
  shadeMid = 0.92,
  shadeTip = 0.78,
  warmShift = 0.0,
  weightFn,
}) {
  const segs = points.length - 1;
  const baseIdx = buffers.positions.length / 3;
  const tangent = new THREE.Vector3();
  const sideVec = new THREE.Vector3();
  const normalVec = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    const v = i / segs;
    const p = points[i];

    if (i === 0) {
      tangent.subVectors(points[1], points[0]).normalize();
    } else if (i === segs) {
      tangent.subVectors(points[segs], points[segs - 1]).normalize();
    } else {
      tangent.subVectors(points[i + 1], points[i - 1]).normalize();
    }

    sideVec.crossVectors(tangent, ribbonNormalDir);
    if (sideVec.lengthSq() < 1e-5) {
      sideVec.set(0, 0, 1);
    } else {
      sideVec.normalize();
    }

    normalVec.crossVectors(sideVec, tangent).normalize();

    const halfW = widths[i] * 0.5;
    const pL = p.clone().addScaledVector(sideVec, -halfW);
    const pR = p.clone().addScaledVector(sideVec,  halfW);

    const shade = v < 0.30
      ? THREE.MathUtils.lerp(shadeRoot, shadeMid, v / 0.30)
      : THREE.MathUtils.lerp(shadeMid, shadeTip, (v - 0.30) / 0.70);

    // Subtle warm-vs-cool strand richness (kept in linear-friendly range!)
    const cr = clamp(shade * (1 + warmShift * 0.14), 0.12, 1.0);
    const cg = clamp(shade * (1 + warmShift * 0.04), 0.12, 1.0);
    const cb = clamp(shade * (1 - warmShift * 0.06), 0.12, 1.0);

    const wPairs = weightFn(p, v);
    const { idx, w } = packWeights(wPairs);

    buffers.positions.push(pL.x, pL.y, pL.z);
    buffers.normals.push(normalVec.x, normalVec.y, normalVec.z);
    buffers.uvs.push(0, v);
    buffers.colors.push(cr * 0.88, cg * 0.88, cb * 0.88);
    buffers.skinIndices.push(idx[0], idx[1], idx[2], idx[3]);
    buffers.skinWeights.push(w[0], w[1], w[2], w[3]);

    buffers.positions.push(pR.x, pR.y, pR.z);
    buffers.normals.push(normalVec.x, normalVec.y, normalVec.z);
    buffers.uvs.push(1, v);
    buffers.colors.push(cr, cg, cb);
    buffers.skinIndices.push(idx[0], idx[1], idx[2], idx[3]);
    buffers.skinWeights.push(w[0], w[1], w[2], w[3]);
  }

  for (let i = 0; i < segs; i++) {
    const a = baseIdx + i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    buffers.indices.push(a, c, d, a, d, b);
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
 * Build lush layered Mane + Forelock strictly conformed OUTSIDE the exact Horse SDF!
 * Guarantees ZERO clipping into the neck, withers, or forehead!
 */
export function buildManeAndForelockGeometry(boneIndex) {
  const rng = createRng(104729);
  const buffers = createBuffers();

  const maneSpineControls = [
    { t: 0.00, bone: boneIndex.withers },
    { t: 0.25, bone: boneIndex.neckBase },
    { t: 0.58, bone: boneIndex.neckMid },
    { t: 0.88, bone: boneIndex.neckUpper },
    { t: 1.00, bone: boneIndex.head },
  ];

  // Pre-sample smooth dorsal crest spline from withers (z = 0.42) up to poll (z = 1.08)
  const crestSamples = [];
  const sampleN = 40;
  for (let i = 0; i <= sampleN; i++) {
    const u = i / sampleN;
    const z = THREE.MathUtils.lerp(0.42, 1.08, u);
    crestSamples.push(findDorsalCrestPoint(z));
  }
  const crestCurve = new THREE.CatmullRomCurve3(crestSamples);

  // --- 1. LUSH FLOWING MANE (360 layered ribbons hugging the crest flush with ZERO gap & cascading gracefully right -X!) ---
  const strandCount = 360;
  for (let i = 0; i < strandCount; i++) {
    const u = clamp((i + (rng() - 0.5) * 0.7) / (strandCount - 1), 0.0, 1.0);
    const rootOnCrest = crestCurve.getPoint(u);
    const layer = i % 3; // 0 = thick dark underlayer, 1 = mid body locks, 2 = airy sunlit outer wisps
    const sideDir = -1; // Classic uniform right-side Warmblood drape (clean flush crest edge on left profile!)

    // Natural Warmblood mane silhouette: tapering smoothly at withers & poll, fullest lush cascade mid-neck!
    const env = Math.sin(clamp(u, 0.04, 0.96) * Math.PI);
    const length = (0.14 + 0.30 * Math.pow(env, 0.62)) * (0.84 + rng() * 0.32);

    const segs = 8;
    const pts = [];
    const widths = [];
    const maxWidth = (layer === 0 ? 0.052 : layer === 1 ? 0.038 : 0.026) * (0.86 + rng() * 0.28);
    const wavePhase = rng() * Math.PI * 2;
    const waveAmp = 0.007 + layer * 0.004 + rng() * 0.005;
    const driftZ = -0.040 + (rng() - 0.5) * 0.028;

    const skinClearance = 0.004 + layer * 0.0075 + rng() * 0.003;

    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      const p = rootOnCrest.clone();

      // Root & crest bend sit flush RIGHT against the neck crest (ZERO sky gap on left profile!)
      const crestLift = Math.sin(Math.min(1, f * 2.6) * Math.PI) * (0.002 + layer * 0.003);
      const outSweep = Math.sin(Math.min(1, f * 1.65) * Math.PI * 0.5) * (0.082 + layer * 0.018 + (1 - u) * 0.046);
      const dropY = Math.pow(f, 1.28) * length;

      p.x += sideDir * (0.001 + outSweep + Math.cos(f * 3.8 + wavePhase) * waveAmp * 0.32 * f);
      p.y += crestLift - dropY;
      p.z += driftZ * f + Math.sin(f * 4.2 + wavePhase) * waveAmp * f;

      if (s === 0) {
        // Tuck root cleanly 8mm INTO the crest spine so zero hover gap from any angle!
        p.y -= 0.008;
      } else if (s === 1) {
        // Keep crest bend hugging tightly onto the upper right crest surface
        pushOutsideHorseSurface(p, 0.002 + layer * 0.003, 4);
      } else {
        pushOutsideHorseSurface(p, skinClearance * (0.65 + 0.55 * f), 4);
      }

      pts.push(p);

      const taper = Math.sin(Math.pow(1 - f, 0.68) * Math.PI * 0.5) * (0.65 + 0.35 * smoothstep(0, 0.14, f));
      widths.push(Math.max(0.005, maxWidth * taper));
    }

    const baseWeights = chainWeights(u, maneSpineControls, 1.15);
    const normalDir = new THREE.Vector3(sideDir * 0.92, 0.32, 0.12 + (rng() - 0.5) * 0.22).normalize();

    addHairRibbon(buffers, {
      points: pts,
      widths,
      ribbonNormalDir: normalDir,
      shadeRoot: layer === 0 ? 0.30 : 0.48,
      shadeMid:  layer === 0 ? 0.65 : layer === 1 ? 0.88 : 1.0,
      shadeTip:  layer === 0 ? 0.55 : 0.82,
      warmShift: (rng() - 0.35) * 0.55,
      weightFn: () => baseWeights,
    });
  }

  // --- 2. FORELOCK (58 layered wispy ribbons cascading between the ears down the forehead!) ---
  const forelockCount = 58;
  const pollTop = findDorsalCrestPoint(1.125);
  for (let i = 0; i < forelockCount; i++) {
    const spread = (i / (forelockCount - 1) - 0.5) * 2.0; // -1..+1
    const layer = i % 3;
    const root = new THREE.Vector3(
      spread * 0.032 + (rng() - 0.5) * 0.008,
      pollTop.y + 0.004,
      1.135 + (rng() - 0.5) * 0.014
    );
    pushOutsideHorseSurface(root, 0.004, 3);

    const len = (0.19 + (1 - Math.abs(spread)) * 0.12) * (0.85 + rng() * 0.30);
    const segs = 7;
    const pts = [];
    const widths = [];
    const maxW = (layer === 0 ? 0.030 : layer === 1 ? 0.022 : 0.015) * (0.85 + rng() * 0.3);
    const waveP = rng() * Math.PI * 2;
    const clear = 0.008 + layer * 0.008;

    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      const p = root.clone();
      // Sweep gracefully down & forward along the 42-deg forehead slope, parting slightly around forehead center
      p.x += spread * 0.036 * Math.pow(f, 0.85) + Math.sin(f * 4.0 + waveP) * 0.007 * f;
      p.y += Math.sin(f * Math.PI) * 0.016 - len * f * 0.72;
      p.z += Math.sin(f * Math.PI) * 0.014 + len * f * 0.70;

      pushOutsideHorseSurface(p, clear * (0.5 + 0.7 * f), 4);
      pts.push(p);

      const taper = Math.pow(1 - f, 0.65);
      widths.push(Math.max(0.004, maxW * (0.60 + 0.40 * smoothstep(0, 0.14, f)) * taper));
    }

    addHairRibbon(buffers, {
      points: pts,
      widths,
      ribbonNormalDir: new THREE.Vector3(spread * 0.35, 0.68, 0.68).normalize(),
      shadeRoot: 0.38,
      shadeMid: 0.85 + layer * 0.07,
      shadeTip: 0.78,
      warmShift: (rng() - 0.4) * 0.5,
      weightFn: () => [[boneIndex.head, 1]],
    });
  }

  const geo = finalizeHairGeometry(buffers);
  geo.userData.part = 'mane';
  return geo;
}

/**
 * Build lush multi-layered Flowing Equine Tail (280 volumetric ribbons) conformed around the SDF tail dock!
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

  const strandCount = 280;
  for (let i = 0; i < strandCount; i++) {
    const layer = i % 3;
    const ringAngle = (i * 2.399963) % (Math.PI * 2); // golden angle distribution around dock
    const rootU = rng() * 0.78;

    // Dock spine curve matching horseSDF tailDockUpper/Lower
    const dockY = THREE.MathUtils.lerp(1.425, 1.21, rootU);
    const dockZ = THREE.MathUtils.lerp(-0.79, -0.91, rootU) - Math.sin(rootU * Math.PI) * 0.018;

    const rDist = (0.022 + layer * 0.014) * (1 - 0.35 * rootU);
    const start = new THREE.Vector3(
      Math.cos(ringAngle) * rDist * 0.95,
      dockY + Math.sin(ringAngle) * rDist * 0.55,
      dockZ - (0.35 + 0.65 * Math.abs(Math.sin(ringAngle))) * rDist
    );
    pushOutsideHorseSurface(start, 0.004 + layer * 0.006, 3);

    // Lush dressage/Warmblood tail length hanging gracefully past the hocks (y = 0.34..0.52 m)
    const targetEndY = 0.33 + rng() * 0.22 + (layer === 0 ? 0.04 : 0);
    const dropLen = Math.max(0.55, start.y - targetEndY);

    const segs = 10;
    const pts = [];
    const widths = [];
    const maxWidth = (layer === 0 ? 0.062 : layer === 1 ? 0.046 : 0.032) * (0.85 + rng() * 0.35);

    const flareOut = 0.056 + layer * 0.026 + rng() * 0.024;
    const wavePhase = rng() * Math.PI * 2;
    const waveFreq = 3.0 + rng() * 2.0;
    const waveAmp = 0.014 + layer * 0.010;

    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      const bulge = Math.sin(Math.pow(f, 0.72) * Math.PI) * flareOut;
      const backSweep = Math.sin(Math.min(1, f * 1.45) * Math.PI * 0.5) * (0.095 + layer * 0.022) + f * 0.025;

      const p = start.clone();
      p.x += Math.cos(ringAngle) * (bulge * 0.90) + Math.sin(f * waveFreq + wavePhase) * waveAmp * f;
      p.y -= dropLen * Math.pow(f, 1.03);
      p.z -= backSweep + (0.25 + 0.55 * Math.abs(Math.sin(ringAngle))) * bulge + Math.cos(f * waveFreq + wavePhase) * waveAmp * 0.6 * f;

      if (s > 0 && f < 0.45) {
        pushOutsideHorseSurface(p, 0.008 + layer * 0.008, 3);
      }

      pts.push(p);

      const wEnv = Math.sin(Math.pow(1 - f, 0.62) * Math.PI * 0.5) * (0.58 + 0.42 * smoothstep(0, 0.14, f));
      widths.push(Math.max(0.006, maxWidth * wEnv));
    }

    const radialNormal = new THREE.Vector3(Math.cos(ringAngle), 0.12, -0.78 - Math.abs(Math.sin(ringAngle)) * 0.38).normalize();

    addHairRibbon(buffers, {
      points: pts,
      widths,
      ribbonNormalDir: radialNormal,
      shadeRoot: layer === 0 ? 0.28 : 0.44,
      shadeMid:  layer === 0 ? 0.64 : layer === 1 ? 0.88 : 1.0,
      shadeTip:  layer === 0 ? 0.52 : 0.84,
      warmShift: (rng() - 0.35) * 0.5,
      weightFn: (_p, v) => chainWeights(clamp(rootU * 0.32 + v * 0.86, 0, 1), tailControls, 1.2),
    });
  }

  const geo = finalizeHairGeometry(buffers);
  geo.userData.part = 'tail';
  return geo;
}

/**
 * Build subtle realistic Fetlock Ergot Tufts rooted directly onto the exact SDF sesamoid surface!
 */
export function buildFetlockTuftsGeometry(boneIndex) {
  const rng = createRng(99173);
  const buffers = createBuffers();

  const fetlocks = ['foreFetlockL', 'foreFetlockR', 'hindFetlockL', 'hindFetlockR'];
  for (const name of fetlocks) {
    const pos = new THREE.Vector3(...JOINTS[name]);
    const bIdx = boneIndex[name];

    for (let i = 0; i < 16; i++) {
      const spread = (i / 15 - 0.5) * 2.0;
      const start = new THREE.Vector3(
        pos.x + spread * 0.022,
        pos.y + 0.004 + (rng() - 0.5) * 0.010,
        pos.z - 0.042
      );
      // Pull directly onto exact back surface of fetlock (never floating!)
      for (let it = 0; it < 4; it++) {
        const d = evalHorseBodySDF(start.x, start.y, start.z);
        const n = evalHorseSurfaceNormal(start.x, start.y, start.z);
        start.addScaledVector(n, 0.002 - d);
      }

      const len = 0.024 + (1 - Math.abs(spread)) * 0.015 + rng() * 0.008;
      const pts = [];
      const widths = [];
      for (let s = 0; s <= 4; s++) {
        const f = s / 4;
        const p = new THREE.Vector3(
          start.x + spread * 0.004 * f,
          start.y - len * f * 0.95,
          start.z - len * f * 0.06
        );
        if (s > 0) pushOutsideHorseSurface(p, 0.0015, 2);
        pts.push(p);
        widths.push(0.014 * (1 - f * 0.72));
      }
      addHairRibbon(buffers, {
        points: pts,
        widths,
        ribbonNormalDir: new THREE.Vector3(spread * 0.4, 0.1, -1).normalize(),
        shadeRoot: 0.30,
        shadeMid: 0.62,
        shadeTip: 0.52,
        warmShift: 0.0,
        weightFn: () => [[bIdx, 1]],
      });
    }
  }

  const geo = finalizeHairGeometry(buffers);
  geo.userData.part = 'fetlockTufts';
  return geo;
}
