import * as THREE from 'three';

/**
 * Smooth mathematical helpers for organic anatomical sculpting.
 */
export function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Piecewise Catmull-Rom interpolation across sorted keyframe stations { t, ...fields }.
 * Smooth C1 interpolation of numeric scalars across arbitrary control station arrays.
 */
export function sampleTrack(stations, key, t) {
  const n = stations.length;
  if (t <= stations[0].t) return stations[0][key];
  if (t >= stations[n - 1].t) return stations[n - 1][key];

  let i = 0;
  while (i < n - 2 && t > stations[i + 1].t) i++;

  const s0 = stations[Math.max(0, i - 1)];
  const s1 = stations[i];
  const s2 = stations[i + 1];
  const s3 = stations[Math.min(n - 1, i + 2)];

  const span = Math.max(1e-6, s2.t - s1.t);
  const u = (t - s1.t) / span;

  // Monotone-safe Fritsch-Carlson / damped Catmull-Rom to prevent overshoot ripples
  const v0 = s0[key];
  const v1 = s1[key];
  const v2 = s2[key];
  const v3 = s3[key];

  const d1 = i === 0 ? (v2 - v1) : 0.5 * ((v2 - v1) + (v1 - v0) * span / Math.max(1e-6, s1.t - s0.t));
  const d2 = i === n - 2 ? (v2 - v1) : 0.5 * ((v2 - v1) + (v3 - v2) * span / Math.max(1e-6, s3.t - s2.t));

  // Clamp tangents gently to avoid unwanted bulge oscillation on tight intervals
  const sec = v2 - v1;
  const maxSlope = Math.abs(sec) * 2.2 + 1e-4;
  const m1 = clamp(d1, -maxSlope, maxSlope);
  const m2 = clamp(d2, -maxSlope, maxSlope);

  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * v1 +
    (u3 - 2 * u2 + u) * m1 +
    (-2 * u3 + 3 * u2) * v2 +
    (u3 - u2) * m2
  );
}

/**
 * Evaluate a 3D anisotropic Gaussian muscle/bone sculpting stamp.
 * positive amplitude = outward muscle bulge, negative = anatomical hollow/groove.
 */
export function evalSculptStamps(pos, stamps) {
  let dx = 0;
  let dy = 0;
  let dz = 0;

  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i];
    const mirror = s.mirror !== false;
    const sides = mirror ? [1, -1] : [1];

    for (let sideIdx = 0; sideIdx < sides.length; sideIdx++) {
      const sxSign = sides[sideIdx];
      const cx = s.center[0] * sxSign;
      const cy = s.center[1];
      const cz = s.center[2];

      let rx = pos.x - cx;
      let ry = pos.y - cy;
      let rz = pos.z - cz;

      // Optional rotation in YZ plane (pitch tilt for slanted muscles like scapula/femur/jugular)
      if (s.pitch) {
        const c = Math.cos(s.pitch);
        const sn = Math.sin(s.pitch);
        const nry = ry * c - rz * sn;
        const nrz = ry * sn + rz * c;
        ry = nry;
        rz = nrz;
      }

      const nx = rx / s.radius[0];
      const ny = ry / s.radius[1];
      const nz = rz / s.radius[2];
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 > 9.0) continue;

      const w = Math.exp(-d2 * (s.sharpness || 1.4));
      if (s.dir) {
        dx += s.dir[0] * sxSign * s.amp * w;
        dy += s.dir[1] * s.amp * w;
        dz += s.dir[2] * s.amp * w;
      } else {
        // Radial displacement away from/toward stamp center
        const invLen = 1 / (Math.sqrt(rx * rx + ry * ry + rz * rz) + 0.02);
        dx += rx * invLen * s.amp * w;
        dy += ry * invLen * s.amp * w;
        dz += rz * invLen * s.amp * w;
      }
    }
  }
  return [dx, dy, dz];
}

/**
 * Build a high-resolution parametric lofted BufferGeometry along a 3D centerline.
 *
 * options:
 *   rings: number of axial stations (>= 4)
 *   segs: number of radial segments around cross-section (>= 12)
 *   capStart: boolean (smooth pole cap at t=0)
 *   capEnd: boolean (smooth pole cap at t=1)
 *   evalFrame(t): returns { center: Vector3, right: Vector3, up: Vector3, forward: Vector3 }
 *   evalCrossSection(t, theta): returns { x, y, zOffset? } in local (right, up, forward) coordinates
 *     where theta=0 is Dorsal (+up), theta=PI/2 is Left (+right), theta=PI is Ventral (-up), theta=3PI/2 is Right (-right)
 *   postDeform(pos, t, theta, normalHint): optional 3D world-space anatomical sculpting
 *   evalWeights(pos, t, theta): returns array of up to 4 [boneIdx, weight] pairs
 *   evalUV(t, theta, pos): optional [u, v]
 */
export function buildSculptedLoft({
  rings,
  segs,
  capStart = true,
  capEnd = true,
  evalFrame,
  evalCrossSection,
  postDeform = null,
  evalWeights = null,
  evalUV = null,
}) {
  const ringStride = segs + 1; // seam vertex duplicated for clean UVs
  const ringVerts = [];
  const positions = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const metaT = [];
  const metaTheta = [];

  const tmpPos = new THREE.Vector3();
  const tmpNormalHint = new THREE.Vector3();

  // Optional start pole
  let startPoleIdx = -1;
  if (capStart) {
    const f0 = evalFrame(0);
    const p0 = f0.center.clone();
    if (postDeform) {
      postDeform(p0, 0, 0, f0.forward.clone().negate());
    }
    startPoleIdx = positions.length / 3;
    positions.push(p0.x, p0.y, p0.z);
    const uv0 = evalUV ? evalUV(0, 0, p0) : [0.5, 0];
    uvs.push(uv0[0], uv0[1]);
    metaT.push(0);
    metaTheta.push(0);
    pushWeights(skinIndices, skinWeights, evalWeights ? evalWeights(p0, 0, 0) : null);
  }

  for (let r = 0; r <= rings; r++) {
    // Slightly inset end rings when capped so caps round out smoothly without sharp pinch
    let t = r / rings;
    if (capStart && r === 0) t = 0.004;
    if (capEnd && r === rings) t = 0.996;

    const frame = evalFrame(t);
    const ringStart = positions.length / 3;
    ringVerts.push(ringStart);

    for (let s = 0; s <= segs; s++) {
      const frac = s / segs;
      const theta = frac * Math.PI * 2;
      const cs = evalCrossSection(t, theta);

      tmpPos.copy(frame.center)
        .addScaledVector(frame.right, cs.x)
        .addScaledVector(frame.up, cs.y);
      if (cs.zOffset) {
        tmpPos.addScaledVector(frame.forward, cs.zOffset);
      }

      tmpNormalHint.set(0, 0, 0)
        .addScaledVector(frame.right, Math.sin(theta))
        .addScaledVector(frame.up, Math.cos(theta))
        .normalize();

      if (postDeform) {
        postDeform(tmpPos, t, theta, tmpNormalHint);
      }

      positions.push(tmpPos.x, tmpPos.y, tmpPos.z);
      const uv = evalUV ? evalUV(t, theta, tmpPos) : [frac, t];
      uvs.push(uv[0], uv[1]);
      metaT.push(t);
      metaTheta.push(theta);
      pushWeights(skinIndices, skinWeights, evalWeights ? evalWeights(tmpPos, t, theta) : null);
    }
  }

  let endPoleIdx = -1;
  if (capEnd) {
    const f1 = evalFrame(1);
    const p1 = f1.center.clone();
    if (postDeform) {
      postDeform(p1, 1, 0, f1.forward.clone());
    }
    endPoleIdx = positions.length / 3;
    positions.push(p1.x, p1.y, p1.z);
    const uv1 = evalUV ? evalUV(1, 0, p1) : [0.5, 1];
    uvs.push(uv1[0], uv1[1]);
    metaT.push(1);
    metaTheta.push(0);
    pushWeights(skinIndices, skinWeights, evalWeights ? evalWeights(p1, 1, 0) : null);
  }

  const indices = [];

  // Verify winding order!
  // Let's trace carefully:
  // Suppose frame: forward = +Z, up = +Y, right = +X.
  // theta = 0 -> +Y; theta = PI/2 -> +X.
  // So increasing `s` goes clockwise when viewed from +Z (from +Y toward +X).
  // Wait: stand at +Z looking toward origin (-Z): +Y is up, +X is to your LEFT!
  // So going from +Y (top) to +X (left) is COUNTER-CLOCKWISE when viewed from +Z!
  // Let's verify cross product of a quad (a, b, c):
  //   a = ring r, seg s     (theta, t)
  //   b = ring r+1, seg s   (theta, t+dt) -> +Z
  //   c = ring r, seg s+1   (theta+dtheta, t) -> +X (at theta=0, pos=(0,1,0))
  //   (b - a) = (0, 0, +1)
  //   (c - a) = (+1, 0, 0)
  //   (b - a) x (c - a) = (0,0,1) x (1,0,0) = (0, +1, 0) -> OUTWARD (+Y)!!
  // YES!! So (a, b, d) and (a, d, c) where d = (r+1, s+1) have OUTWARD normals!
  // Let's double check (a, b, d): (b-a) x (d-a) = (0,0,1) x (1,0,1) = (0, +1, 0) -> OUTWARD!
  // And (a, d, c): (d-a) x (c-a) = (1,0,1) x (1,0,0) = (0, +1, 0) -> OUTWARD!
  // And start cap at t=0 (outward normal = -Z):
  //   pole -> c(s+1) -> a(s):
  //   c = (+1, 1, 0), a = (0, 1, 0), pole = (0, 0, -eps)
  //   (c - pole) x (a - pole) = (1, 1, 0) x (0, 1, 0) = (0, 0, +1) -> INWARD!
  //   So start cap must be (pole, a, c): (a - pole) x (c - pole) = (0, 1, 0) x (1, 1, 0) = (0, 0, -1) -> OUTWARD!
  // And end cap at t=1 (outward normal = +Z):
  //   (pole, c, a): (c - pole) x (a - pole) = (1, 1, 0) x (0, 1, 0) = (0, 0, +1) -> OUTWARD!

  if (capStart) {
    const r0 = ringVerts[0];
    for (let s = 0; s < segs; s++) {
      indices.push(startPoleIdx, r0 + s, r0 + s + 1);
    }
  }

  for (let r = 0; r < rings; r++) {
    const rowA = ringVerts[r];
    const rowB = ringVerts[r + 1];
    for (let s = 0; s < segs; s++) {
      const a = rowA + s;
      const b = rowB + s;
      const c = rowA + s + 1;
      const d = rowB + s + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  if (capEnd) {
    const rLast = ringVerts[rings];
    for (let s = 0; s < segs; s++) {
      indices.push(endPoleIdx, rLast + s + 1, rLast + s);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  if (evalWeights) {
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  }

  geo.computeVertexNormals();

  // Weld normal across UV seam (s = 0 and s = segs share identical 3D positions)
  const normAttr = geo.getAttribute('normal');
  for (let r = 0; r <= rings; r++) {
    const idx0 = ringVerts[r];
    const idxLast = ringVerts[r] + segs;
    const nx = normAttr.getX(idx0) + normAttr.getX(idxLast);
    const ny = normAttr.getY(idx0) + normAttr.getY(idxLast);
    const nz = normAttr.getZ(idx0) + normAttr.getZ(idxLast);
    const len = Math.hypot(nx, ny, nz) || 1;
    normAttr.setXYZ(idx0, nx / len, ny / len, nz / len);
    normAttr.setXYZ(idxLast, nx / len, ny / len, nz / len);
  }
  normAttr.needsUpdate = true;

  // Store metadata for vertex coloring / coat shading
  geo.userData.metaT = metaT;
  geo.userData.metaTheta = metaTheta;

  return geo;
}

function pushWeights(skinIndices, skinWeights, pairs) {
  if (!pairs || pairs.length === 0) {
    skinIndices.push(0, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
    return;
  }
  // Sort by weight descending, keep top 4, normalize to sum 1.0
  const sorted = pairs.filter((p) => p[1] > 1e-5).sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (sorted.length === 0) {
    skinIndices.push(0, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
    return;
  }
  let sum = 0;
  for (const p of sorted) sum += p[1];
  const idx = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  for (let i = 0; i < sorted.length; i++) {
    idx[i] = sorted[i][0];
    w[i] = sorted[i][1] / sum;
  }
  skinIndices.push(idx[0], idx[1], idx[2], idx[3]);
  skinWeights.push(w[0], w[1], w[2], w[3]);
}

/**
 * Compute smooth multi-bone linear-blend weights along a 1D parameter `t`
 * given ordered control centers [{ t, bone }].
 */
export function chainWeights(t, controls, sharpness = 1.0) {
  const n = controls.length;
  if (t <= controls[0].t) return [[controls[0].bone, 1]];
  if (t >= controls[n - 1].t) return [[controls[n - 1].bone, 1]];

  // Find bracketing interval
  let i = 0;
  while (i < n - 2 && t > controls[i + 1].t) i++;

  const c1 = controls[i];
  const c2 = controls[i + 1];
  const u = clamp((t - c1.t) / Math.max(1e-5, c2.t - c1.t), 0, 1);
  // Smooth S-curve weight blend across the joint
  const s = smoothstep(0.5 - 0.5 / sharpness, 0.5 + 0.5 / sharpness, u);
  return [
    [c1.bone, 1 - s],
    [c2.bone, s],
  ];
}

/**
 * Helper to create a parallel-transported frame sequence along a CatmullRomCurve3,
 * anchored to an initial `upRef` vector so limbs never twist.
 */
export function buildCurveFrames(curve, samples, upRef) {
  const frames = [];
  let prevForward = curve.getTangent(0).normalize();
  let prevUp = upRef.clone().addScaledVector(prevForward, -upRef.dot(prevForward)).normalize();
  let prevRight = new THREE.Vector3().crossVectors(prevUp, prevForward).normalize();
  // Ensure right-handed frame where (forward x right = up) => right = up x forward!
  // Let's double-check:
  // If forward = (0, -1, 0) (leg going down) and upRef = (0, 0, +1) (anterior/front of leg):
  //   up = (0, 0, +1)
  //   right = up x forward = (0,0,1) x (0,-1,0) = (+1, 0, 0) (+X)!
  //   Check forward x right = (0,-1,0) x (1,0,0) = (0, 0, +1) = up! YES!!
  // So buildSculptedLoft's outward winding rule (forward x right = up) holds 100%!

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const center = curve.getPoint(t);
    const forward = curve.getTangent(t).normalize();

    if (i > 0) {
      const q = new THREE.Quaternion().setFromUnitVectors(prevForward, forward);
      prevUp.applyQuaternion(q).normalize();
      prevRight.crossVectors(prevUp, forward).normalize();
      prevUp.crossVectors(forward, prevRight).normalize();
      prevForward.copy(forward);
    }

    frames.push({
      t,
      center,
      forward: forward.clone(),
      up: prevUp.clone(),
      right: prevRight.clone(),
    });
  }

  return function evalFrame(t) {
    const fIdx = clamp(t, 0, 1) * samples;
    const i0 = Math.floor(fIdx);
    const i1 = Math.min(samples, i0 + 1);
    const alpha = fIdx - i0;
    if (i0 === i1) return frames[i0];
    const a = frames[i0];
    const b = frames[i1];
    const center = a.center.clone().lerp(b.center, alpha);
    const forward = a.forward.clone().lerp(b.forward, alpha).normalize();
    const right = a.right.clone().lerp(b.right, alpha).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    right.crossVectors(up, forward).normalize();
    return { center, forward, up, right };
  };
}
