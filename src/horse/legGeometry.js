import * as THREE from 'three';
import { JOINTS } from './anatomy.js';
import {
  buildCurveFrames,
  buildSculptedLoft,
  chainWeights,
  clamp,
  sampleTrack,
  smoothstep,
} from './sculptUtils.js';

/**
 * Foreleg anatomical cross-section profile from sculpted shoulder cap (t=0) down to coronary band (t=1).
 * ant = front radius (+up), post = back radius (-up), lat = lateral/outer width, med = medial/inner width.
 */
const FORELEG_STATIONS = [
  // t,    ant,    post,   lat,    med,    tendon, flatFront, sharpBack
  { t: 0.00, ant: 0.135, post: 0.135, lat: 0.072, med: 0.115, tendon: 0.00, flatFront: 0.00, sharpBack: 0.00 }, // Upper shoulder embedded into chest
  { t: 0.12, ant: 0.132, post: 0.128, lat: 0.088, med: 0.105, tendon: 0.00, flatFront: 0.05, sharpBack: 0.05 }, // Point of shoulder / deltoid
  { t: 0.25, ant: 0.108, post: 0.122, lat: 0.082, med: 0.085, tendon: 0.00, flatFront: 0.05, sharpBack: 0.22 }, // Triceps & elbow approach
  { t: 0.32, ant: 0.095, post: 0.118, lat: 0.077, med: 0.076, tendon: 0.00, flatFront: 0.06, sharpBack: 0.42 }, // Elbow / Olecranon point!
  { t: 0.44, ant: 0.078, post: 0.076, lat: 0.064, med: 0.062, tendon: 0.00, flatFront: 0.10, sharpBack: 0.10 }, // Muscular upper forearm
  { t: 0.56, ant: 0.054, post: 0.052, lat: 0.045, med: 0.045, tendon: 0.08, flatFront: 0.16, sharpBack: 0.10 }, // Tapered lower forearm
  { t: 0.63, ant: 0.056, post: 0.063, lat: 0.047, med: 0.047, tendon: 0.05, flatFront: 0.38, sharpBack: 0.34 }, // Knee (Carpus) + Pisiform back!
  { t: 0.71, ant: 0.042, post: 0.047, lat: 0.032, med: 0.032, tendon: 0.26, flatFront: 0.16, sharpBack: 0.18 }, // Upper cannon + flexor tendon
  { t: 0.82, ant: 0.039, post: 0.044, lat: 0.031, med: 0.031, tendon: 0.28, flatFront: 0.14, sharpBack: 0.20 }, // Lower cannon
  { t: 0.88, ant: 0.044, post: 0.058, lat: 0.040, med: 0.040, tendon: 0.06, flatFront: 0.12, sharpBack: 0.38 }, // Fetlock (bony sesamoid back!)
  { t: 0.94, ant: 0.036, post: 0.036, lat: 0.034, med: 0.034, tendon: 0.00, flatFront: 0.06, sharpBack: 0.06 }, // Slim sloping pastern waist
  { t: 1.00, ant: 0.052, post: 0.046, lat: 0.047, med: 0.047, tendon: 0.00, flatFront: 0.04, sharpBack: 0.00 }, // Coronary band swell
];

/**
 * Hindleg anatomical cross-section profile from muscular haunch/thigh (t=0) through Stifle, Gaskin, sharp Hock, Cannon, Fetlock, Pastern to Coronet (t=1).
 */
const HINDLEG_STATIONS = [
  // t,    ant,    post,   lat,    med,    tendon, flatFront, sharpBack
  { t: 0.00, ant: 0.185, post: 0.195, lat: 0.102, med: 0.145, tendon: 0.00, flatFront: 0.00, sharpBack: 0.00 }, // Haunch cap embedded into croup
  { t: 0.14, ant: 0.170, post: 0.185, lat: 0.104, med: 0.120, tendon: 0.00, flatFront: 0.00, sharpBack: 0.08 }, // Muscular thigh / biceps femoris
  { t: 0.27, ant: 0.128, post: 0.145, lat: 0.086, med: 0.090, tendon: 0.00, flatFront: 0.06, sharpBack: 0.24 }, // Stifle & rear hamstring sweep
  { t: 0.42, ant: 0.076, post: 0.098, lat: 0.061, med: 0.060, tendon: 0.16, flatFront: 0.10, sharpBack: 0.38 }, // Gaskin & taut Achilles tendon!
  { t: 0.54, ant: 0.054, post: 0.080, lat: 0.044, med: 0.044, tendon: 0.24, flatFront: 0.14, sharpBack: 0.48 }, // Hollow in front of Achilles
  { t: 0.61, ant: 0.056, post: 0.096, lat: 0.046, med: 0.046, tendon: 0.12, flatFront: 0.24, sharpBack: 0.62 }, // Sharp bony POINT OF HOCK (Calcaneus)!
  { t: 0.68, ant: 0.046, post: 0.054, lat: 0.036, med: 0.036, tendon: 0.24, flatFront: 0.16, sharpBack: 0.24 }, // Lower hock taper
  { t: 0.79, ant: 0.042, post: 0.047, lat: 0.032, med: 0.032, tendon: 0.28, flatFront: 0.14, sharpBack: 0.20 }, // Hind cannon + flexor tendons
  { t: 0.88, ant: 0.044, post: 0.058, lat: 0.040, med: 0.040, tendon: 0.06, flatFront: 0.12, sharpBack: 0.38 }, // Hind fetlock
  { t: 0.94, ant: 0.036, post: 0.036, lat: 0.034, med: 0.034, tendon: 0.00, flatFront: 0.06, sharpBack: 0.06 }, // Hind pastern waist
  { t: 1.00, ant: 0.050, post: 0.045, lat: 0.045, med: 0.045, tendon: 0.00, flatFront: 0.04, sharpBack: 0.00 }, // Hind coronary band
];

function evalLegCrossSection(stations, side, t, theta) {
  const ant = sampleTrack(stations, 'ant', t);
  const post = sampleTrack(stations, 'post', t);
  const lat = sampleTrack(stations, 'lat', t);
  const med = sampleTrack(stations, 'med', t);
  const tendon = sampleTrack(stations, 'tendon', t);
  const flatFront = sampleTrack(stations, 'flatFront', t);
  const sharpBack = sampleTrack(stations, 'sharpBack', t);

  const cosT = Math.cos(theta); // +1 anterior (+Z), -1 posterior (-Z)
  const sinT = Math.sin(theta); // +1 left (+X), -1 right (-X)

  // Determine lateral vs medial width depending on which side leg we're building
  const isLateral = sinT * side >= 0;
  let xR = isLateral ? lat : med;
  let yR = cosT >= 0 ? ant : post;

  // Flatten front of bony knee / hock
  if (cosT > 0.45 && flatFront > 0) {
    yR *= 1.0 - flatFront * 0.22 * Math.pow((cosT - 0.45) / 0.55, 2);
  }

  // Crisp narrower blade-like ridge on back of elbow, Achilles tendon, point of hock, and sesamoid fetlock
  if (cosT < -0.25 && sharpBack > 0) {
    const backPinch = smoothstep(-0.25, -1.0, cosT);
    xR *= 1.0 - sharpBack * 0.42 * backPinch;
  }

  let x = sinT * xR;
  let y = cosT * yR;

  // Longitudinal flexor tendon groove on lateral & medial sides of cannon & Achilles region!
  if (tendon > 0) {
    const grooveBand = Math.exp(-Math.pow((cosT + 0.30) / 0.22, 2)) * Math.pow(Math.abs(sinT), 1.6);
    x -= Math.sign(sinT) * xR * tendon * 0.38 * grooveBand;
  }

  return { x, y };
}

/**
 * Build Left (side = +1) or Right (side = -1) Foreleg continuous SkinnedMesh geometry.
 */
export function buildForelegGeometry(side, boneIndex) {
  const tag = side > 0 ? 'L' : 'R';
  const sx = side;

  const shoulder = new THREE.Vector3(...JOINTS[`shoulder${tag}`]);
  const elbow    = new THREE.Vector3(...JOINTS[`elbow${tag}`]);
  const knee     = new THREE.Vector3(...JOINTS[`knee${tag}`]);
  const fetlock  = new THREE.Vector3(...JOINTS[`foreFetlock${tag}`]);
  const coronet  = new THREE.Vector3(...JOINTS[`foreCoronet${tag}`]);

  // Smooth anatomical leg centerline starting high in the muscular shoulder & ending at the coronet
  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(sx * 0.175, 1.35, 0.65), // Top shoulder cap nestled smoothly into torso
      shoulder.clone().add(new THREE.Vector3(-sx * 0.005, -0.02, -0.01)),
      elbow.clone(),
      elbow.clone().lerp(knee, 0.52).add(new THREE.Vector3(0, 0, 0.006)),
      knee.clone(),
      knee.clone().lerp(fetlock, 0.50),
      fetlock.clone(),
      fetlock.clone().lerp(coronet, 0.52),
      coronet.clone(),
    ],
    false,
    'centripetal',
    0.45
  );

  const evalFrame = buildCurveFrames(curve, 120, new THREE.Vector3(0, 0, 1));

  // Map curve parameter t cleanly to bone weights (verified along arc length of curve!)
  const legControls = [
    { t: 0.00, bone: boneIndex.withers },
    { t: 0.16, bone: boneIndex[`shoulder${tag}`] },
    { t: 0.34, bone: boneIndex[`elbow${tag}`] },
    { t: 0.63, bone: boneIndex[`knee${tag}`] },
    { t: 0.88, bone: boneIndex[`foreFetlock${tag}`] },
    { t: 0.99, bone: boneIndex[`foreCoronet${tag}`] },
  ];

  const geo = buildSculptedLoft({
    rings: 76,
    segs: 36,
    capStart: true,
    capEnd: true,
    evalFrame,
    evalCrossSection: (t, theta) => evalLegCrossSection(FORELEG_STATIONS, side, t, theta),
    postDeform(pos, t) {
      // Smoothly tuck medial-top shoulder rim slightly inward into torso to guarantee zero gap
      if (t < 0.14) {
        const topBlend = 1.0 - smoothstep(0.0, 0.14, t);
        if (pos.x * side < 0.18) {
          pos.x -= side * 0.028 * topBlend;
        }
      }
    },
    evalWeights(_pos, t) {
      return chainWeights(t, legControls, 1.35);
    },
    evalUV(t, theta) {
      return [(theta / (Math.PI * 2)) * 0.9, t * 3.0];
    },
  });

  geo.userData.part = 'foreleg';
  geo.userData.side = side;
  return geo;
}

/**
 * Build Left (side = +1) or Right (side = -1) Hindleg continuous SkinnedMesh geometry.
 */
export function buildHindlegGeometry(side, boneIndex) {
  const tag = side > 0 ? 'L' : 'R';
  const sx = side;

  const hip     = new THREE.Vector3(...JOINTS[`hip${tag}`]);
  const stifle  = new THREE.Vector3(...JOINTS[`stifle${tag}`]);
  const hock    = new THREE.Vector3(...JOINTS[`hock${tag}`]);
  const fetlock = new THREE.Vector3(...JOINTS[`hindFetlock${tag}`]);
  const coronet = new THREE.Vector3(...JOINTS[`hindCoronet${tag}`]);

  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(sx * 0.175, 1.37, -0.52), // Upper haunch nestled seamlessly into croup
      hip.clone().lerp(stifle, 0.45).add(new THREE.Vector3(0, 0, -0.02)),
      stifle.clone(),
      stifle.clone().lerp(hock, 0.50).add(new THREE.Vector3(0, -0.01, -0.02)),
      hock.clone(),
      hock.clone().lerp(fetlock, 0.50),
      fetlock.clone(),
      fetlock.clone().lerp(coronet, 0.52),
      coronet.clone(),
    ],
    false,
    'centripetal',
    0.45
  );

  const evalFrame = buildCurveFrames(curve, 120, new THREE.Vector3(0, 0, 1));

  const legControls = [
    { t: 0.00, bone: boneIndex.pelvis },
    { t: 0.14, bone: boneIndex[`hip${tag}`] },
    { t: 0.30, bone: boneIndex[`stifle${tag}`] },
    { t: 0.61, bone: boneIndex[`hock${tag}`] },
    { t: 0.88, bone: boneIndex[`hindFetlock${tag}`] },
    { t: 0.99, bone: boneIndex[`hindCoronet${tag}`] },
  ];

  const geo = buildSculptedLoft({
    rings: 80,
    segs: 36,
    capStart: true,
    capEnd: true,
    evalFrame,
    evalCrossSection: (t, theta) => evalLegCrossSection(HINDLEG_STATIONS, side, t, theta),
    postDeform(pos, t) {
      if (t < 0.15) {
        const topBlend = 1.0 - smoothstep(0.0, 0.15, t);
        if (pos.x * side < 0.19) {
          pos.x -= side * 0.032 * topBlend;
        }
      }
    },
    evalWeights(_pos, t) {
      return chainWeights(t, legControls, 1.35);
    },
    evalUV(t, theta) {
      return [(theta / (Math.PI * 2)) * 0.9, t * 3.2];
    },
  });

  geo.userData.part = 'hindleg';
  geo.userData.side = side;
  return geo;
}

/**
 * Build a realistic sculpted Equine Hoof + forged steel Horseshoe SkinnedMesh geometry
 * anchored cleanly from the coronary band (y = 0.095 m) down to flat ground contact (y = 0.000 m).
 *
 * Fore hooves are subtly wider/rounder; hind hooves are subtly narrower and more oval-pointed!
 */
export function buildHoofAndShoeGeometries(legKey, boneIndex) {
  const isFore = legKey.startsWith('fore');
  const coronetName = `${legKey.replace('Hoof', 'Coronet')}`;
  const hoofBoneIdx = boneIndex[coronetName];
  const coronetPos = new THREE.Vector3(...JOINTS[coronetName]);

  const widthScale = isFore ? 1.0 : 0.93;
  const toeSlopeZ  = isFore ? 0.068 : 0.062; // ~53-55 deg dorsal hoof wall!
  const heelSlopeZ = isFore ? -0.012 : -0.014;

  // Build Hoof Horn Capsule from y = coronet.y + 0.008 down to y = 0.004 (shoe rests 0.000..0.007)
  const rings = 18;
  const segs = 36;
  const positions = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  for (let r = 0; r <= rings; r++) {
    const v = r / rings; // 0 = top coronary margin, 1 = ground-bearing sole rim

    // Coronary rim wraps smoothly downward toward the heels (real hooves are taller at toe than at heels!)
    const baseY = (1 - v) * (coronetPos.y + 0.006) + v * 0.004;

    // Hoof flares gently outward from coronet to ground
    const rx = (0.047 + v * 0.017) * widthScale;
    const rzFront = (0.052 + v * 0.022);
    const rzBack  = (0.044 + v * 0.008);

    // Subtle coronary band bevel right at top
    const coronetTuck = 1.0 - 0.08 * Math.exp(-Math.pow(v / 0.14, 2));

    for (let s = 0; s <= segs; s++) {
      const frac = s / segs;
      const theta = frac * Math.PI * 2; // 0 = front toe (+Z), PI/2 = +X, PI = rear heel (-Z)
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Heel height drops cleanly at back of coronet (real hooves slope down ~40% toward heels!)
      const heelDip = cosT < 0 ? (-cosT) * 0.036 * (1 - v) : 0;
      const y = Math.max(0.004, baseY - heelDip);

      // Front dorsal wall projects forward at ~53 deg as it descends!
      const zShift = cosT >= 0
        ? v * toeSlopeZ * Math.pow(cosT, 0.7)
        : v * heelSlopeZ * (-cosT);

      // Subtle central cleft between left & right heel bulbs at the very back
      let heelCleft = 0;
      if (cosT < -0.70) {
        const c = smoothstep(-0.70, -1.0, cosT);
        heelCleft = 0.011 * c * c * (0.4 + 0.6 * v);
      }

      const x = coronetPos.x + sinT * rx * coronetTuck;
      const z = coronetPos.z + (cosT >= 0 ? cosT * rzFront : cosT * rzBack) * coronetTuck + zShift + heelCleft;

      positions.push(x, y, z);
      uvs.push(frac, v);
      skinIndices.push(hoofBoneIdx, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    }
  }

  // Flat slightly-cupped dark sole cap at bottom (v = 1)
  const soleCenterIdx = positions.length / 3;
  positions.push(coronetPos.x, 0.012, coronetPos.z + toeSlopeZ * 0.32);
  uvs.push(0.5, 1.0);
  skinIndices.push(hoofBoneIdx, 0, 0, 0);
  skinWeights.push(1, 0, 0, 0);

  const stride = segs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = r * stride + s + 1;
      const d = (r + 1) * stride + s + 1;
      // Check winding: r goes DOWN (-Y), s goes from +Z toward +X.
      // (b - a) = (0, -1, 0), (c - a) = (+1, 0, 0) at theta=0 -> (b-a) x (c-a) = (0,0,+1) = OUTWARD (+Z)!
      indices.push(a, b, d, a, d, c);
    }
  }

  // Sole cap facing DOWN (-Y)
  const lastRow = rings * stride;
  for (let s = 0; s < segs; s++) {
    indices.push(soleCenterIdx, lastRow + s + 1, lastRow + s);
  }

  const hoofGeo = new THREE.BufferGeometry();
  hoofGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hoofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  hoofGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  hoofGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  hoofGeo.setIndex(indices);
  hoofGeo.computeVertexNormals();

  // Weld UV seam normal
  const norm = hoofGeo.getAttribute('normal');
  for (let r = 0; r <= rings; r++) {
    const i0 = r * stride;
    const i1 = i0 + segs;
    const nx = norm.getX(i0) + norm.getX(i1);
    const ny = norm.getY(i0) + norm.getY(i1);
    const nz = norm.getZ(i0) + norm.getZ(i1);
    const len = Math.hypot(nx, ny, nz) || 1;
    norm.setXYZ(i0, nx / len, ny / len, nz / len);
    norm.setXYZ(i1, nx / len, ny / len, nz / len);
  }
  norm.needsUpdate = true;

  // Forged U-shaped Steel Horseshoe hugging the bottom rim (y = 0.000..0.0075)
  const shoeGeo = buildHorseshoeGeometry(coronetPos, widthScale, toeSlopeZ, heelSlopeZ, hoofBoneIdx);

  return { hoofGeo, shoeGeo };
}

function buildHorseshoeGeometry(coronetPos, widthScale, toeSlopeZ, heelSlopeZ, boneIdx) {
  const segs = 28;
  const rxOuter = 0.065 * widthScale;
  const rzFrontOuter = 0.075;
  const rzBackOuter = 0.052;
  const rimWidth = 0.015;
  const yBot = 0.0005;
  const yTop = 0.008;

  const pos = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const idx = [];

  // U-shape from -142 deg to +142 deg around the toe (open at rear heel frog)
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const theta = (u - 0.5) * Math.PI * 1.56;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const zShift = cosT >= 0 ? toeSlopeZ * Math.pow(cosT, 0.7) : heelSlopeZ * (-cosT);
    const ox = coronetPos.x + sinT * rxOuter;
    const oz = coronetPos.z + (cosT >= 0 ? cosT * rzFrontOuter : cosT * rzBackOuter) + zShift;
    const ix = coronetPos.x + sinT * (rxOuter - rimWidth);
    const iz = coronetPos.z + (cosT >= 0 ? cosT * (rzFrontOuter - rimWidth) : cosT * (rzBackOuter - rimWidth)) + zShift * 0.92;

    // 4 cross-section corners: outer-top (0), outer-bot (1), inner-bot (2), inner-top (3)
    const ring = [
      [ox, yTop, oz],
      [ox, yBot, oz],
      [ix, yBot, iz],
      [ix, yTop, iz],
    ];
    for (let k = 0; k < 4; k++) {
      pos.push(ring[k][0], ring[k][1], ring[k][2]);
      uvs.push(u, k / 3);
      skinIndices.push(boneIdx, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    }
  }

  for (let i = 0; i < segs; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const kn = (k + 1) % 4;
      idx.push(a + k, a + kn, b + kn, a + k, b + kn, b + k);
    }
  }
  // End caps of U-shape
  idx.push(0, 3, 2, 0, 2, 1);
  const last = segs * 4;
  idx.push(last, last + 1, last + 2, last, last + 2, last + 3);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
