import * as THREE from 'three';
import { JOINTS } from './anatomy.js';
import { smoothstep } from './sculptUtils.js';

/**
 * Build anatomically proportioned Sculpted Equine Hoof + forged steel Horseshoe SkinnedMesh!
 * V5 Realism Fix:
 *   - Eliminates the flared upside-down black traffic-cone look!
 *   - Hoof wall continues the exact 52-deg dorsal slope of the pastern seamlessly from the coronary band
 *     (rx = 0.046 -> 0.056 m, subtle natural flare, realistic slanted heel bulbs, grounded cleanly on y = 0.000!).
 */
export function buildHoofAndShoeGeometries(legKey, boneIndex) {
  const isFore = legKey.startsWith('fore');
  const coronetName = legKey.replace('Hoof', 'Coronet');
  const hoofBoneIdx = boneIndex[coronetName];
  const coronetPos = new THREE.Vector3(...JOINTS[coronetName]);

  const widthScale = isFore ? 1.0 : 0.93;
  // Exact 52-deg dorsal hoof wall continuation (matches pastern line continuously!)
  const toeSlopeZ  = isFore ? 0.056 : 0.050;
  const heelSlopeZ = isFore ? -0.004 : -0.006;

  const rings = 20;
  const segs = 36;
  const positions = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  for (let r = 0; r <= rings; r++) {
    const v = r / rings; // 0 = coronary margin, 1 = ground-bearing rim

    // Smooth transition from coronet height (~0.094) down to shoe rim (0.005)
    const baseY = (1 - v) * (coronetPos.y + 0.007) + v * 0.005;

    // Natural subtle equine hoof taper (ONLY ~10 mm flare from coronet to ground — NOT a traffic cone!)
    const rx = (0.045 + v * 0.011) * widthScale;
    const rzFront = 0.048 + v * 0.012;
    const rzBack  = 0.044 + v * 0.006;

    // Gentle soft periople/coronary rim tuck right at top
    const coronetTuck = 1.0 - 0.045 * Math.exp(-Math.pow(v / 0.14, 2));

    for (let s = 0; s <= segs; s++) {
      const frac = s / segs;
      const theta = frac * Math.PI * 2; // 0 = front toe (+Z), PI = rear heel (-Z)
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Authentic sloping coronary line: taller at toe, ~42% shorter at heels
      const heelDip = cosT < 0 ? (-cosT) * 0.036 * (1 - v) : 0;
      const y = Math.max(0.005, baseY - heelDip);

      const zShift = cosT >= 0
        ? v * toeSlopeZ * Math.pow(cosT, 0.72)
        : v * heelSlopeZ * (-cosT);

      // Subtle heel bulb cleft posteriorly
      let heelCleft = 0;
      if (cosT < -0.70) {
        const c = smoothstep(-0.70, -1.0, cosT);
        heelCleft = 0.009 * c * c * (0.4 + 0.6 * v);
      }

      const x = coronetPos.x + sinT * rx * coronetTuck;
      const z = coronetPos.z + (cosT >= 0 ? cosT * rzFront : cosT * rzBack) * coronetTuck + zShift + heelCleft;

      positions.push(x, y, z);
      uvs.push(frac, v);
      skinIndices.push(hoofBoneIdx, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);
    }
  }

  // Cupped sole cap underneath
  const soleCenterIdx = positions.length / 3;
  positions.push(coronetPos.x, 0.014, coronetPos.z + toeSlopeZ * 0.30);
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
      indices.push(a, b, d, a, d, c);
    }
  }

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

  const shoeGeo = buildHorseshoeGeometry(coronetPos, widthScale, toeSlopeZ, heelSlopeZ, hoofBoneIdx);
  return { hoofGeo, shoeGeo };
}

function buildHorseshoeGeometry(coronetPos, widthScale, toeSlopeZ, heelSlopeZ, boneIdx) {
  const segs = 28;
  const rxOuter = 0.056 * widthScale;
  const rzFrontOuter = 0.061;
  const rzBackOuter = 0.050;
  const rimWidth = 0.013;
  const yBot = 0.0005;
  const yTop = 0.007;

  const pos = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const idx = [];

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const theta = (u - 0.5) * Math.PI * 1.56;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const zShift = cosT >= 0 ? toeSlopeZ * Math.pow(cosT, 0.72) : heelSlopeZ * (-cosT);
    const ox = coronetPos.x + sinT * rxOuter;
    const oz = coronetPos.z + (cosT >= 0 ? cosT * rzFrontOuter : cosT * rzBackOuter) + zShift;
    const ix = coronetPos.x + sinT * (rxOuter - rimWidth);
    const iz = coronetPos.z + (cosT >= 0 ? cosT * (rzFrontOuter - rimWidth) : cosT * (rzBackOuter - rimWidth)) + zShift * 0.92;

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
