import * as THREE from 'three';
import { smoothstep } from './sculptUtils.js';

/**
 * Build a graceful, alert, sculpted concave tulip-shaped Equine Ear (pinna).
 * Taller (~18.2 cm), sculpted smoothly with lyre-like inward-curving pointed tips and recessed concave hollow.
 */
export function buildEarGeometries(side) {
  const rings = 24;
  const segs = 24;
  const height = 0.182;

  const positions = [];
  const uvs = [];
  const indices = [];
  const innerMask = [];

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;

    // Classic Warmblood tulip-leaf silhouette: full tubular base, gently broad mid-pinna, fine pointed tip
    const widthProfile = Math.sin(Math.pow(v, 0.70) * Math.PI) * 0.038 + (1 - v) * 0.018;
    const cupDepth = Math.sin(Math.pow(v, 0.65) * Math.PI) * 0.023 + (1 - v) * 0.015;
    const wallThick = 0.0050 * (1 - 0.55 * v) + 0.0020;

    // Graceful subtle inward lyre curve at the alert tip!
    const tipInward = -side * (Math.pow(v, 2.3) * 0.020 - v * 0.010);
    const forwardSweep = Math.sin(v * Math.PI * 0.85) * 0.016;
    const y = v * height;

    for (let s = 0; s <= segs; s++) {
      const frac = s / segs;
      const phi = frac * Math.PI * 2;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      const lx = sinP * widthProfile + tipInward;
      let lz;
      let isInner = 0;

      if (cosP >= 0) {
        const cup = Math.pow(cosP, 0.78);
        const openFactor = smoothstep(0.10, 0.36, v) * smoothstep(1.0, 0.88, v);
        lz = -cup * cupDepth * (0.58 * openFactor) + wallThick * (1 - openFactor) + forwardSweep;
        isInner = openFactor * smoothstep(0.15, 0.6, cosP);
      } else {
        const back = Math.pow(-cosP, 0.85);
        lz = -back * (cupDepth + wallThick) + forwardSweep;
      }

      const rot = side * 0.36;
      const rx = lx * Math.cos(rot) + lz * Math.sin(rot);
      const rz = -lx * Math.sin(rot) + lz * Math.cos(rot);

      positions.push(rx, y, rz);
      uvs.push(frac * 1.4, v * 1.6);
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
      indices.push(a, c, d, a, d, b);
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
 * Create a deeply set, soulful, almond-shaped Equine Eye Assembly!
 * Key realism fixes vs V4:
 *   - NO cloudy white transparent cornea dome (wet high-gloss clearcoat directly on rich dark iris -> deep liquid brown eye with crisp pinpoint catchlight!)
 *   - NO black rubber torus ring around eye!
 *   - Coat-matched fleshy sculpted upper & lower eyelids framing a realistic oblique almond aperture!
 */
export function createEquineEyeGroup(side, { irisMaterial, lidMaterial, lashMaterial }) {
  const group = new THREE.Group();
  group.name = side > 0 ? 'eyeGroupL' : 'eyeGroupR';

  // Horses have laterally-placed eyes angled outward (~64 deg) and subtly oblique along the brow
  const lookDir = new THREE.Vector3(side * 0.87, 0.04, 0.49).normalize();
  const upDir = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), lookDir.clone().negate(), upDir);
  group.quaternion.setFromRotationMatrix(m);

  // Deeply set wet glossy dark eyeball (radius 2.0 cm, subtly flattened front-back)
  const eyeRadius = 0.020;
  const ballGeo = new THREE.SphereGeometry(eyeRadius, 28, 20);
  const eyeball = new THREE.Mesh(ballGeo, irisMaterial);
  eyeball.rotation.y = -Math.PI * 0.5;
  eyeball.scale.set(1.06, 0.96, 0.94);
  eyeball.position.z = -0.002; // Set deeply inside orbital socket (NEVER bug-eyed!)
  group.add(eyeball);

  // Coat-matched sculpted fleshy Upper Eyelid hood (gives authentic calm, noble equine gaze!)
  const upperLidPivot = new THREE.Group();
  upperLidPivot.name = side > 0 ? 'upperLidL' : 'upperLidR';
  const upperLidGeo = buildAlmondEyelid(eyeRadius * 1.16, true);
  const upperLid = new THREE.Mesh(upperLidGeo, lidMaterial);
  upperLid.castShadow = true;
  upperLidPivot.add(upperLid);

  // Subtle natural dark upper eyelash fringe angling down-and-out (horses have straight downward-angled lashes!)
  const lashGeo = buildEyelashFringe(eyeRadius * 1.15);
  const lashes = new THREE.Mesh(lashGeo, lashMaterial);
  upperLidPivot.add(lashes);

  // Natural alert open upper-lid arch (-0.46 reveals large, warm, soulful dark equine eye!)
  upperLidPivot.rotation.x = -0.46;
  group.add(upperLidPivot);

  // Sleek sculpted Lower Eyelid
  const lowerLidGeo = buildAlmondEyelid(eyeRadius * 1.11, false);
  const lowerLid = new THREE.Mesh(lowerLidGeo, lidMaterial);
  lowerLid.rotation.x = 0.38;
  group.add(lowerLid);

  return { group, upperLidPivot };
}

function buildAlmondEyelid(radius, isUpper) {
  const segU = 22;
  const segV = 9;
  const pos = [];
  const uvs = [];
  const idx = [];
  const sign = isUpper ? 1 : -1;

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    const latBase = sign * (0.05 + v * (Math.PI * 0.48));
    // Sleek, non-puffy eyelid shell hugging smoothly into orbital socket!
    const thickBoost = 1.0 + Math.sin(v * Math.PI) * 0.06 + (1 - v) * 0.025;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const lon = (u - 0.5) * Math.PI * 1.24;
      // Pull lid corners smoothly toward horizontal midline for true almond equine eye!
      const cornerPinch = 1.0 - 0.55 * Math.pow(Math.abs(u - 0.5) * 2.0, 2.2) * (1 - v);
      const lat = latBase * cornerPinch;
      const r = radius * thickBoost;
      const x = r * Math.cos(lat) * Math.sin(lon) * 1.14;
      const y = r * Math.sin(lat) * 0.94;
      const z = r * Math.cos(lat) * Math.cos(lon) - 0.002;
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
      if (isUpper) idx.push(a, c, d, a, d, b);
      else idx.push(a, d, c, a, b, d);
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
    const lon = (u - 0.5) * Math.PI * 0.78;
    const arch = Math.sin(u * Math.PI);
    const len = 0.007 * (0.35 + 0.65 * arch);
    const x0 = radius * Math.sin(lon) * 1.12;
    const y0 = radius * 0.06;
    const z0 = radius * Math.cos(lon) - 0.002;
    pos.push(x0, y0, z0);
    pos.push(x0 * 1.04, y0 - len * 0.25, z0 + len * 0.95);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
