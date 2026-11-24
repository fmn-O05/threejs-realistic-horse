import * as THREE from 'three';
import {
  buildSculptedLoft,
  chainWeights,
  clamp,
  evalSculptStamps,
  sampleTrack,
  smoothstep,
} from './sculptUtils.js';

/**
 * Head centerline from Occiput/Poll (t = 0) down the refined nasal bridge to the velvety Muzzle/Lips (t = 1).
 * Head length ~0.60 m, angled gracefully at ~42 deg forward of vertical (proud alert Warmblood carriage).
 */
const HEAD_STATIONS = [
  // t,    cy,    cz,    dH,    vH,    hW,   wBias, dFlat, jowl
  { t: 0.00, cy: 2.025, cz: 1.075, dH: 0.032, vH: 0.032, hW: 0.038, wBias:  0.00, dFlat: 0.00, jowl: 0.000 },
  { t: 0.08, cy: 2.020, cz: 1.125, dH: 0.095, vH: 0.115, hW: 0.088, wBias:  0.04, dFlat: 0.12, jowl: 0.025 },
  { t: 0.20, cy: 1.980, cz: 1.195, dH: 0.098, vH: 0.165, hW: 0.104, wBias: -0.08, dFlat: 0.28, jowl: 0.055 }, // Cranium & big circular Jowl!
  { t: 0.33, cy: 1.925, cz: 1.265, dH: 0.086, vH: 0.156, hW: 0.105, wBias:  0.14, dFlat: 0.42, jowl: 0.045 }, // Broad forehead / Eyes / Cheek
  { t: 0.46, cy: 1.855, cz: 1.335, dH: 0.072, vH: 0.114, hW: 0.082, wBias:  0.10, dFlat: 0.32, jowl: 0.015 }, // Facial crest & tapering jaw
  { t: 0.62, cy: 1.770, cz: 1.412, dH: 0.062, vH: 0.082, hW: 0.064, wBias:  0.05, dFlat: 0.24, jowl: 0.000 }, // Refined mid-nasal bridge
  { t: 0.78, cy: 1.690, cz: 1.482, dH: 0.060, vH: 0.072, hW: 0.062, wBias:  0.04, dFlat: 0.14, jowl: 0.000 }, // Slight flare approaching nostrils
  { t: 0.88, cy: 1.648, cz: 1.522, dH: 0.058, vH: 0.064, hW: 0.063, wBias:  0.02, dFlat: 0.08, jowl: 0.000 }, // Nostril flare & upper lip swell
  { t: 0.95, cy: 1.618, cz: 1.545, dH: 0.045, vH: 0.048, hW: 0.049, wBias:  0.00, dFlat: 0.00, jowl: 0.000 }, // Soft velvety lips
  { t: 1.00, cy: 1.602, cz: 1.556, dH: 0.016, vH: 0.018, hW: 0.022, wBias:  0.00, dFlat: 0.00, jowl: 0.000 }, // Muzzle tip
];

export function evalHeadFrame(t) {
  const ct = clamp(t, 0, 1);
  const cy = sampleTrack(HEAD_STATIONS, 'cy', ct);
  const cz = sampleTrack(HEAD_STATIONS, 'cz', ct);

  const eps = 0.005;
  const t0 = clamp(ct - eps, 0, 1);
  const t1 = clamp(ct + eps, 0, 1);
  const dy = sampleTrack(HEAD_STATIONS, 'cy', t1) - sampleTrack(HEAD_STATIONS, 'cy', t0);
  const dz = sampleTrack(HEAD_STATIONS, 'cz', t1) - sampleTrack(HEAD_STATIONS, 'cz', t0);

  const forward = new THREE.Vector3(0, dy, dz).normalize();
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();

  return { center: new THREE.Vector3(0, cy, cz), forward, right, up };
}

/**
 * Exact eye center coordinates (used both for sculpting the orbital socket & placing eye meshes).
 */
export const EYE_CENTERS = {
  left:  new THREE.Vector3( 0.089, 1.944, 1.266),
  right: new THREE.Vector3(-0.089, 1.944, 1.266),
};

const HEAD_SCULPT_STAMPS = [
  // Supraorbital bony arch projecting cleanly above each eye
  { center: [0.088, 1.976, 1.272], radius: [0.036, 0.026, 0.038], amp: 0.018, dir: [0.85, 0.45, 0.25], sharpness: 1.8 },
  // Supraorbital fossa (classic equine hollow right behind/above the eyebrow arch!)
  { center: [0.068, 2.002, 1.224], radius: [0.032, 0.024, 0.030], amp: -0.014, dir: [0.80, 0.55, 0.20], sharpness: 2.0 },
  // Recessed orbital eye socket cradling the eye & eyelids
  { center: [0.092, 1.944, 1.268], radius: [0.030, 0.028, 0.032], amp: -0.020, dir: [0.95, 0.10, 0.30], sharpness: 2.1 },
  // Crisp zygomatic facial crest ridge running forward along cheek below eye
  { center: [0.078, 1.865, 1.318], radius: [0.028, 0.030, 0.072], pitch: 0.72, amp: 0.014, dir: [0.92, 0.15, 0.35], sharpness: 1.8 },
  // Broad circular Masseter cheek / Jowl fullness
  { center: [0.086, 1.855, 1.195], radius: [0.052, 0.076, 0.078], amp: 0.022, dir: [0.85, -0.30, -0.42], sharpness: 1.4 },
  // Chin groove indentation under the lower lip
  { center: [0.0, 1.622, 1.462], radius: [0.042, 0.024, 0.032], mirror: false, amp: -0.012, dir: [0, -0.7, -0.7], sharpness: 2.0 },
  // Soft rounded chin pad below lower lip
  { center: [0.0, 1.592, 1.500], radius: [0.036, 0.024, 0.028], mirror: false, amp: 0.010, dir: [0, -0.7, 0.7], sharpness: 1.8 },
  // Poll crown fullness between ears
  { center: [0.0, 2.092, 1.120], radius: [0.052, 0.035, 0.046], mirror: false, amp: 0.016, dir: [0, 0.85, -0.52], sharpness: 1.6 },
];

/**
 * Build the sculpted high-resolution Equine Head SkinnedMesh geometry,
 * complete with eye sockets, facial crest, rounded jowl, flared teardrop nostrils, and sculpted lips.
 */
export function buildHeadGeometry(boneIndex) {
  const headControls = [
    { t: 0.02, bone: boneIndex.neckUpper },
    { t: 0.14, bone: boneIndex.head },
    { t: 1.00, bone: boneIndex.head },
  ];

  const geo = buildSculptedLoft({
    rings: 76,
    segs: 60,
    capStart: true,
    capEnd: true,
    evalFrame: evalHeadFrame,
    evalCrossSection(t, theta) {
      const dH = sampleTrack(HEAD_STATIONS, 'dH', t);
      const vH = sampleTrack(HEAD_STATIONS, 'vH', t);
      const hW = sampleTrack(HEAD_STATIONS, 'hW', t);
      const wBias = sampleTrack(HEAD_STATIONS, 'wBias', t);
      const dFlat = sampleTrack(HEAD_STATIONS, 'dFlat', t);
      const jowl = sampleTrack(HEAD_STATIONS, 'jowl', t);

      const cosT = Math.cos(theta); // +1 nasal bridge / forehead, -1 jaw / chin
      const sinT = Math.sin(theta); // +1 left, -1 right
      const absSin = Math.abs(sinT);

      // Broad flat forehead & refined flat-topped nasal bridge
      let dorsalScale = dH;
      if (cosT > 0.35 && dFlat > 0) {
        // Gently flatten forehead & dorsal nasal plane (equine trapezoid skull cross-section!)
        dorsalScale *= 1.0 - dFlat * 0.16 * Math.pow((cosT - 0.35) / 0.65, 2);
      }

      // Slight graceful Arabian/Warmblood dish on mid-nasal profile
      if (cosT > 0.5 && t > 0.45 && t < 0.78) {
        const dish = Math.sin(((t - 0.45) / 0.33) * Math.PI);
        dorsalScale -= 0.0055 * dish * Math.pow((cosT - 0.5) / 0.5, 1.5);
      }

      let y = cosT >= 0 ? cosT * dorsalScale : cosT * vH;

      // Cross-section width with equine skull taper (wider at forehead/eyes, narrower at lower jaw ridge)
      let widthFactor = 1.0 + wBias * cosT;
      if (cosT < -0.25) {
        // Narrow clean mandible ridge underneath except at the rounded masseter jowl
        const jawTaper = smoothstep(-0.25, -1.0, cosT);
        widthFactor *= 1.0 - (0.46 - jowl * 3.0) * jawTaper;
      }

      // Intermandibular space hollow (hollow between left & right jawbones under throatlatch!)
      if (t > 0.16 && t < 0.66 && cosT < -0.72) {
        const hollowEnv = Math.sin(((t - 0.16) / 0.50) * Math.PI);
        const c = smoothstep(-0.72, -1.0, cosT);
        y += 0.018 * hollowEnv * c * c;
      }

      let x = sinT * hW * Math.max(0.24, widthFactor);

      // Prominent sculpted flared Nostrils (comma-shaped raised alar rim + deep recessed pocket!)
      if (t > 0.74 && t < 0.94) {
        const absAngle = Math.acos(clamp(cosT, -1, 1)); // 0 = dorsal midline, PI = ventral
        const nT = (t - 0.842) / 0.052;
        const nA = (absAngle - 0.96) / 0.36; // centered at ~55 deg from dorsal ridge
        // Subtle teardrop slant
        const dPocket = nT * nT + Math.pow(nA - 0.25 * nT, 2);

        if (dPocket < 3.6) {
          // Deep recessed dark nasal cavity in the core
          const pocket = Math.exp(-dPocket * 2.8);
          // Raised fleshy outer alar nostril rim encircling the opening
          const rim = Math.exp(-Math.pow(Math.sqrt(dPocket) - 0.95, 2) * 5.2);
          const disp = rim * 0.0115 - pocket * 0.022;
          x += Math.sign(sinT) * disp * 0.88;
          y += Math.cos(absAngle) * disp * 0.48;
        }
      }

      // Sculpted Mouth Cleft & velvety protruding Upper Lip + tucked Lower Lip
      if (t > 0.80) {
        const mouthBand = Math.exp(-Math.pow((cosT + 0.38) / 0.13, 2)) * smoothstep(0.80, 0.92, t);
        const cleftDepth = 0.013 * mouthBand;
        // Indent the mouth line smoothly around front & sides of muzzle
        x -= Math.sign(sinT) * cleftDepth * absSin * 0.6;
        y -= Math.sign(cosT) * cleftDepth * 0.3;

        // Soft velvety upper lip cushion above the mouth line
        const upperLip = Math.exp(-Math.pow((cosT - 0.12) / 0.32, 2)) * smoothstep(0.84, 0.96, t);
        const lowerLip = Math.exp(-Math.pow((cosT + 0.72) / 0.22, 2)) * smoothstep(0.85, 0.95, t);
        const zOffset = upperLip * 0.014 + lowerLip * 0.005 - cleftDepth * 0.85;
        return { x, y, zOffset };
      }

      return { x, y };
    },
    postDeform(pos, t) {
      const poleFade = smoothstep(0.02, 0.07, t) * smoothstep(1.0, 0.95, t);
      if (poleFade <= 0) return;
      const [dx, dy, dz] = evalSculptStamps(pos, HEAD_SCULPT_STAMPS);
      pos.x += dx * poleFade;
      pos.y += dy * poleFade;
      pos.z += dz * poleFade;
    },
    evalWeights(_pos, t) {
      return chainWeights(t, headControls, 1.3);
    },
    evalUV(t, theta) {
      return [(theta / (Math.PI * 2)) * 1.1, t * 1.8];
    },
  });

  geo.userData.part = 'head';
  return geo;
}

/**
 * Build a sculptural, thin, double-walled concave tulip-shaped Equine Ear (pinna).
 * Origin at base of ear; extends upward along +Y (~0.165 m) with natural forward/outward opening
 * and subtle inward curve at the pointed tip.
 *
 * Returns { outerGeo, innerGeo } so the concave inner ear can have softer pinkish-gray skin & fine fur.
 */
export function buildEarGeometries(side) {
  // side: +1 = Left ear, -1 = Right ear
  const rings = 22;
  const segs = 24;
  const height = 0.168;

  const positions = [];
  const uvs = [];
  const indices = [];
  const innerMask = []; // 1 on concave inner ear face, 0 on furred convex outer shell

  for (let r = 0; r <= rings; r++) {
    const v = r / rings; // 0 = base, 1 = tip

    // Width profile: narrow tubular base, swelling gracefully at mid-ear (tulip leaf), tapering to fine pointed tip
    const widthProfile = Math.sin(Math.pow(v, 0.72) * Math.PI) * 0.036 + (1 - v) * 0.015;
    // Depth of ear cup (deeper near base/middle, flattening toward pointed tip)
    const cupDepth = (Math.sin(Math.pow(v, 0.65) * Math.PI) * 0.022 + (1 - v) * 0.014);
    // Wall thickness (thin sculpted pinna cartilage)
    const wallThick = 0.0045 * (1 - 0.55 * v) + 0.0018;

    // Gentle natural S-curve & inward tip hook (classic alert Warmblood ears!)
    const tipInward = -side * (Math.pow(v, 2.4) * 0.018 - v * 0.012);
    const forwardSweep = Math.sin(v * Math.PI * 0.85) * 0.014;
    const y = v * height;

    for (let s = 0; s <= segs; s++) {
      const frac = s / segs;
      const phi = frac * Math.PI * 2; // 0 = front-inner hollow, PI = back-outer shell

      // Half-cylinder cupped cross-section:
      // Outer shell wraps around back (phi in [PI/2 .. 3PI/2]) -> convex
      // Inner face wraps around front (phi in [-PI/2 .. PI/2]) -> concave bowl pushed inward!
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      const lx = sinP * widthProfile + tipInward;
      let lz;
      let isInner = 0;

      if (cosP >= 0) {
        // Concave inner opening facing forward & slightly outward!
        const cup = Math.pow(cosP, 0.75);
        // Hollow cavity opens more in middle/upper ear, closed tube at base
        const openFactor = smoothstep(0.08, 0.35, v) * smoothstep(1.0, 0.88, v);
        lz = -cup * cupDepth * (0.55 * openFactor) + wallThick * (1 - openFactor) + forwardSweep;
        isInner = openFactor * smoothstep(0.15, 0.6, cosP);
      } else {
        // Convex furred rear shell of the pinna
        const back = Math.pow(-cosP, 0.85);
        lz = -back * (cupDepth + wallThick) + forwardSweep;
        isInner = 0;
      }

      // Slight outward rotation of the open ear cup (~26 deg outward)
      const rot = side * 0.42;
      const rx = lx * Math.cos(rot) + lz * Math.sin(rot);
      const rz = -lx * Math.sin(rot) + lz * Math.cos(rot);

      positions.push(rx, y, rz);
      uvs.push(frac, v);
      innerMask.push(isInner);
    }
  }

  const stride = segs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = r * stride + s + 1;
      const d = (r + 1) * stride + s + 1;
      // Check winding: +Y is up, increasing s goes from +Z toward +X (counter-clockwise viewed from +Y? wait:
      // at phi=0: (0, y, +z); at phi=PI/2: (+x, y, 0).
      // (b - a) = (0, +1, 0), (c - a) = (+1, 0, -1).
      // (b - a) x (c - a) = (0,1,0) x (1,0,-1) = (-1, 0, -1) -> INWARD!
      // Therefore (a, c, d) and (a, d, b) point OUTWARD!
      indices.push(a, c, d);
      indices.push(a, d, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.innerMask = innerMask;
  geo.userData.part = 'ear';

  return geo;
}

/**
 * Create realistic anatomical equine Eye Assembly (eyeball with horizontal pupil + glossy wet cornea + sculpted upper/lower eyelids).
 * Returned as a Group located at the eye center, oriented outward/forward naturally.
 */
export function createEquineEyeGroup(side, { irisMaterial, corneaMaterial, lidMaterial, lashMaterial }) {
  const group = new THREE.Group();
  group.name = side > 0 ? 'eyeGroupL' : 'eyeGroupR';

  const pos = side > 0 ? EYE_CENTERS.left : EYE_CENTERS.right;
  group.position.copy(pos);

  // Horses have laterally placed eyes facing ~62 deg outward and slightly forward/down along nasal angle
  const lookDir = new THREE.Vector3(side * 0.86, 0.08, 0.50).normalize();
  const upDir = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), lookDir.clone().negate(), upDir);
  // Three.js lookAt aligns -Z toward target; we want +Z of eye sphere (pupil) facing lookDir!
  group.quaternion.setFromRotationMatrix(m);

  // Inner Eyeball (sphere radius ~2.15 cm — realistic large soulful equine eye!)
  const eyeRadius = 0.0215;
  const ballGeo = new THREE.SphereGeometry(eyeRadius, 28, 20);
  // Rotate so UV front (or +Z pole) displays iris cleanly
  const eyeball = new THREE.Mesh(ballGeo, irisMaterial);
  eyeball.rotation.y = -Math.PI * 0.5; // SphereGeometry seam at +X; U=0.5 faces -X -> rotate -PI/2 puts U=0.5 at +Z!
  eyeball.castShadow = false;
  eyeball.receiveShadow = false;
  group.add(eyeball);

  // Glossy wet Cornea shell slightly proud of the iris for bright specular catchlight
  const corneaGeo = new THREE.SphereGeometry(eyeRadius * 1.045, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
  corneaGeo.rotateX(Math.PI * 0.5); // cap centered on +Z!
  const cornea = new THREE.Mesh(corneaGeo, corneaMaterial);
  group.add(cornea);

  // Sculpted Upper Eyelid (rotates around local X to blink cleanly!)
  const upperLidPivot = new THREE.Group();
  upperLidPivot.name = side > 0 ? 'upperLidL' : 'upperLidR';
  const upperLidGeo = buildEyelidShell(eyeRadius * 1.13, true);
  const upperLid = new THREE.Mesh(upperLidGeo, lidMaterial);
  upperLid.castShadow = true;
  upperLidPivot.add(upperLid);

  // Delicate dark eyelashes sweeping outward along upper eyelid margin
  const lashGeo = buildEyelashFringe(eyeRadius * 1.14);
  const lashes = new THREE.Mesh(lashGeo, lashMaterial);
  upperLidPivot.add(lashes);

  // Open resting tilt for upper eyelid
  upperLidPivot.rotation.x = -0.52;
  group.add(upperLidPivot);

  // Sculpted Lower Eyelid
  const lowerLidGeo = buildEyelidShell(eyeRadius * 1.12, false);
  const lowerLid = new THREE.Mesh(lowerLidGeo, lidMaterial);
  lowerLid.rotation.x = 0.44;
  group.add(lowerLid);

  // Subtle dark orbital rim cushion smoothly blending eyelids into the head socket
  const rimGeo = new THREE.TorusGeometry(eyeRadius * 1.05, 0.0042, 10, 24);
  rimGeo.scale(1.16, 0.88, 0.85);
  const rim = new THREE.Mesh(rimGeo, lidMaterial);
  rim.position.z = 0.001;
  group.add(rim);

  return { group, upperLidPivot };
}

function buildEyelidShell(radius, isUpper) {
  // Partial thick spherical shell covering top or bottom half of eye
  const phiStart = isUpper ? 0 : Math.PI;
  const geo = new THREE.SphereGeometry(radius, 20, 12, 0, Math.PI, phiStart * 0.5, Math.PI * 0.52);
  // Orient cap toward +Z
  if (isUpper) {
    geo.rotateZ(Math.PI);
    geo.rotateY(Math.PI);
  }
  // Better: build clean explicit curved hemisphere strip covering +Z front-top or front-bottom
  const segU = 18;
  const segV = 8;
  const pos = [];
  const uvs = [];
  const idx = [];
  const sign = isUpper ? 1 : -1;

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV; // 0 = lid margin edge, 1 = back behind eye socket
    const lat = sign * (0.04 + v * (Math.PI * 0.48));
    const thickBoost = 1.0 + Math.sin(v * Math.PI) * 0.09 + (1 - v) * 0.04;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const lon = (u - 0.5) * Math.PI * 1.12; // wraps nicely around horizontal almond aperture
      const r = radius * thickBoost;
      const x = r * Math.cos(lat) * Math.sin(lon) * 1.08;
      const y = r * Math.sin(lat) * 0.96;
      const z = r * Math.cos(lat) * Math.cos(lon);
      pos.push(x, y, z);
      uvs.push(u, v);
    }
  }
  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = (iv + 1) * stride + iu;
      const c = iv * stride + iu + 1;
      const d = (iv + 1) * stride + iu + 1;
      if (isUpper) {
        idx.push(a, c, d, a, d, b);
      } else {
        idx.push(a, d, c, a, b, d);
      }
    }
  }
  const lidGeo = new THREE.BufferGeometry();
  lidGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lidGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  lidGeo.setIndex(idx);
  lidGeo.computeVertexNormals();
  return lidGeo;
}

function buildEyelashFringe(radius) {
  const segs = 14;
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const lon = (u - 0.5) * Math.PI * 0.86;
    const arch = Math.sin(u * Math.PI);
    const len = 0.0085 * (0.45 + 0.55 * arch);
    const x0 = radius * Math.sin(lon) * 1.08;
    const y0 = radius * 0.06;
    const z0 = radius * Math.cos(lon);
    pos.push(x0, y0, z0);
    pos.push(x0 * 1.06, y0 + len * 0.35, z0 + len * 0.95);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
