import * as THREE from 'three';

/**
 * Refined 16.2-hand Warmblood / Thoroughbred Stallion Anatomical Landmarks (meters).
 * Coordinate frame:
 *   +Y = up (ground plane at y = 0.000)
 *   +Z = forward (chest/head at +Z, croup/tail at -Z)
 *   +X = horse's left side, -X = horse's right side
 */
export const JOINTS = {
  // Core spine
  root:      [0, 1.26, -0.02],
  pelvis:    [0, 1.35, -0.44],
  spineMid:  [0, 1.28,  0.04],
  withers:   [0, 1.35,  0.46],

  // Proud arched neck & refined noble head chain
  neckBase:  [0, 1.44,  0.65],
  neckMid:   [0, 1.72,  0.84],
  neckUpper: [0, 1.98,  1.01],
  head:      [0, 2.08,  1.10],
  jaw:       [0, 1.88,  1.16],
  earL:      [ 0.052, 2.115, 1.115],
  earR:      [-0.052, 2.115, 1.115],

  // High-set tail dock & flowing hair chain
  tailBase:  [0, 1.46, -0.78],
  tailMid:   [0, 1.26, -0.90],
  tailLower: [0, 0.92, -0.95],
  tailTip:   [0, 0.50, -0.96],

  // Left Foreleg (X > 0) — crisp athletic plumb line + continuous 52 deg pastern-hoof axis!
  shoulderL:    [0.178, 1.26, 0.66],
  elbowL:       [0.168, 0.96, 0.48],
  kneeL:        [0.148, 0.52, 0.50],
  foreFetlockL: [0.142, 0.21, 0.495],
  foreCoronetL: [0.142, 0.088, 0.578],
  foreHoofL:    [0.142, 0.000, 0.618],

  // Right Foreleg (X < 0)
  shoulderR:    [-0.178, 1.26, 0.66],
  elbowR:       [-0.168, 0.96, 0.48],
  kneeR:        [-0.148, 0.52, 0.50],
  foreFetlockR: [-0.142, 0.21, 0.495],
  foreCoronetR: [-0.142, 0.088, 0.578],
  foreHoofR:    [-0.142, 0.000, 0.618],

  // Left Hindleg (X > 0) — powerful sweeping haunch, sharp hock, clean vertical cannon!
  hipL:         [0.180, 1.34, -0.49],
  stifleL:      [0.172, 1.02, -0.37],
  hockL:        [0.150, 0.57, -0.68],
  hindFetlockL: [0.142, 0.21, -0.655],
  hindCoronetL: [0.142, 0.088, -0.578],
  hindHoofL:    [0.142, 0.000, -0.542],

  // Right Hindleg (X < 0)
  hipR:         [-0.180, 1.34, -0.49],
  stifleR:      [-0.172, 1.02, -0.37],
  hockR:        [-0.150, 0.57, -0.68],
  hindFetlockR: [-0.142, 0.21, -0.655],
  hindCoronetR: [-0.142, 0.088, -0.578],
  hindHoofR:    [-0.142, 0.000, -0.542],
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

export function jointVec(name) {
  const [x, y, z] = JOINTS[name];
  return new THREE.Vector3(x, y, z);
}
