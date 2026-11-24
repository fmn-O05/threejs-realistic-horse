import * as THREE from 'three';

/**
 * Real-world Warmblood / Thoroughbred anatomical landmarks (meters).
 * Coordinate frame:
 *   +Y = up (ground plane at y = 0.000)
 *   +Z = forward (chest/head at +Z, croup/tail at -Z)
 *   +X = horse's left side, -X = horse's right side
 *
 * Key canons verified:
 *   Withers height:           1.62 m (~16.0 hands)
 *   Shoulder-to-buttock len:  1.66 m (~square athletic frame)
 *   Girth depth / clearance:  0.78 m / 0.84 m (48% / 52%)
 *   Head length:              0.60 m (~37% of withers height)
 *   Front pastern angle:      ~53 deg from horizontal
 *   Hind pastern angle:       ~55 deg from horizontal
 *   Hock higher than knee:    0.56 m vs 0.51 m
 */
export const JOINTS = {
  // Core spine
  root:      [0, 1.24, -0.02],
  pelvis:    [0, 1.32, -0.44],
  spineMid:  [0, 1.25,  0.04],
  withers:   [0, 1.32,  0.46],

  // Neck & Head chain
  neckBase:  [0, 1.40,  0.67],
  neckMid:   [0, 1.66,  0.88],
  neckUpper: [0, 1.91,  1.05],
  head:      [0, 2.03,  1.13],
  jaw:       [0, 1.88,  1.18],
  earL:      [ 0.056, 2.065, 1.132],
  earR:      [-0.056, 2.065, 1.132],

  // Tail dock & flowing hair chain
  tailBase:  [0, 1.42, -0.78],
  tailMid:   [0, 1.22, -0.90],
  tailLower: [0, 0.90, -0.95],
  tailTip:   [0, 0.52, -0.96],

  // Left Foreleg (X > 0)
  shoulderL:    [0.185, 1.25, 0.69],
  elbowL:       [0.175, 0.94, 0.49],
  kneeL:        [0.152, 0.51, 0.51],
  foreFetlockL: [0.145, 0.21, 0.50],
  foreCoronetL: [0.145, 0.095, 0.585],
  foreHoofL:    [0.145, 0.00, 0.62],

  // Right Foreleg (X < 0)
  shoulderR:    [-0.185, 1.25, 0.69],
  elbowR:       [-0.175, 0.94, 0.49],
  kneeR:        [-0.152, 0.51, 0.51],
  foreFetlockR: [-0.145, 0.21, 0.50],
  foreCoronetR: [-0.145, 0.095, 0.585],
  foreHoofR:    [-0.145, 0.00, 0.62],

  // Left Hindleg (X > 0)
  hipL:         [0.185, 1.31, -0.49],
  stifleL:      [0.180, 0.99, -0.35],
  hockL:        [0.155, 0.56, -0.68],
  hindFetlockL: [0.145, 0.21, -0.66],
  hindCoronetL: [0.145, 0.095, -0.58],
  hindHoofL:    [0.145, 0.00, -0.545],

  // Right Hindleg (X < 0)
  hipR:         [-0.185, 1.31, -0.49],
  stifleR:      [-0.180, 0.99, -0.35],
  hockR:        [-0.155, 0.56, -0.68],
  hindFetlockR: [-0.145, 0.21, -0.66],
  hindCoronetR: [-0.145, 0.095, -0.58],
  hindHoofR:    [-0.145, 0.00, -0.545],
};

export const BONE_PARENTS = {
  root: null,
  pelvis: 'root',
  tailBase: 'pelvis',
  tailMid: 'tailBase',
  tailLower: 'tailMid',
  tailTip: 'tailLower',

  hipL: 'pelvis',
  stifleL: 'hipL',
  hockL: 'stifleL',
  hindFetlockL: 'hockL',
  hindCoronetL: 'hindFetlockL',
  hindHoofL: 'hindCoronetL',

  hipR: 'pelvis',
  stifleR: 'hipR',
  hockR: 'stifleR',
  hindFetlockR: 'hockR',
  hindCoronetR: 'hindFetlockR',
  hindHoofR: 'hindCoronetR',

  spineMid: 'root',
  withers: 'spineMid',

  shoulderL: 'withers',
  elbowL: 'shoulderL',
  kneeL: 'elbowL',
  foreFetlockL: 'kneeL',
  foreCoronetL: 'foreFetlockL',
  foreHoofL: 'foreCoronetL',

  shoulderR: 'withers',
  elbowR: 'shoulderR',
  kneeR: 'elbowR',
  foreFetlockR: 'kneeR',
  foreCoronetR: 'foreFetlockR',
  foreHoofR: 'foreCoronetR',

  neckBase: 'withers',
  neckMid: 'neckBase',
  neckUpper: 'neckMid',
  head: 'neckUpper',
  jaw: 'head',
  earL: 'head',
  earR: 'head',
};

export const BONE_ORDER = Object.keys(BONE_PARENTS);

/**
 * Create a Three.js Skeleton and named bone lookup dictionary in exact world rest pose.
 */
export function createEquineSkeleton() {
  const boneMap = {};
  const bones = [];
  const boneIndex = {};

  for (let i = 0; i < BONE_ORDER.length; i++) {
    const name = BONE_ORDER[i];
    const bone = new THREE.Bone();
    bone.name = name;
    boneMap[name] = bone;
    bones.push(bone);
    boneIndex[name] = i;
  }

  for (const name of BONE_ORDER) {
    const bone = boneMap[name];
    const parentName = BONE_PARENTS[name];
    const [wx, wy, wz] = JOINTS[name];

    if (!parentName) {
      bone.position.set(wx, wy, wz);
    } else {
      const [px, py, pz] = JOINTS[parentName];
      bone.position.set(wx - px, wy - py, wz - pz);
      boneMap[parentName].add(bone);
    }
  }

  const rootBone = boneMap.root;
  rootBone.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  // Store rest positions & rest rotations for animation resets
  const restPose = {};
  for (const name of BONE_ORDER) {
    restPose[name] = {
      position: boneMap[name].position.clone(),
      worldPos: new THREE.Vector3(...JOINTS[name]),
    };
  }

  return {
    rootBone,
    bones,
    boneMap,
    boneIndex,
    skeleton,
    restPose,
  };
}

/**
 * Helper to read joint world position as THREE.Vector3
 */
export function jointVec(name) {
  const [x, y, z] = JOINTS[name];
  return new THREE.Vector3(x, y, z);
}
