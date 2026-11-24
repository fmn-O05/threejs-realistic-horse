import * as THREE from 'three';
import { createEquineSkeleton, JOINTS } from './anatomy.js';
import { buildUnifiedHorseBodyGeometry, SDF_EYE_CENTERS } from './horseSDF.js';
import { buildEarGeometries, createEquineEyeGroup } from './headGeometry.js';
import { buildHoofAndShoeGeometries } from './legGeometry.js';
import {
  buildFetlockTuftsGeometry,
  buildManeAndForelockGeometry,
  buildTailHairGeometry,
} from './hairGeometry.js';
import { applyCoatVertexColors, COAT_PRESETS, createEquineMaterials } from './materials.js';

/**
 * Assemble the complete, 100% seamless SDF-sculpted, fully rigged & skinned 3D Horse!
 * Returns { group, rig, materials, eyes, setCoatPreset, getStats }.
 */
export function createRealisticHorse(initialCoat = 'bay') {
  const group = new THREE.Group();
  group.name = 'RealisticHorse';

  // 1. Build 39-bone Equine Skeleton in exact world rest pose
  const rig = createEquineSkeleton();
  group.add(rig.rootBone);
  group.updateMatrixWorld(true);

  // 2. Build physically calibrated PBR Materials
  const materials = createEquineMaterials(initialCoat);

  const coatGeometries = [];

  const bindPart = (geo, material, name, castShadow = true) => {
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(rig.skeleton);
    group.add(mesh);
    return mesh;
  };

  // 3. ONE 100% Seamless, Watertight, SDF-Sculpted Equine Body Mesh
  //    (Torso + Withers + Deep Pectoral Chest + Arched Neck + Poll + Head/Jowl/Nostrils/Lips +
  //     All 4 Legs through Shoulders/Elbows/Knees/Stifles/Gaskins/Sharp Hocks/Tendons/Fetlocks/Pasterns + Tail Dock!)
  const bodyGeo = buildUnifiedHorseBodyGeometry(rig.boneIndex);
  coatGeometries.push({ geo: bodyGeo, offset: null });
  bindPart(bodyGeo, materials.coatMaterial, 'EquineBody');

  // 4. Four Sculpted Keratin Hooves + Forged Steel Horseshoes resting cleanly on y = 0.000
  for (const legKey of ['foreHoofL', 'foreHoofR', 'hindHoofL', 'hindHoofR']) {
    const { hoofGeo, shoeGeo } = buildHoofAndShoeGeometries(legKey, rig.boneIndex);
    bindPart(hoofGeo, materials.hoofMaterial, `${legKey}_Hoof`);
    bindPart(shoeGeo, materials.shoeMaterial, `${legKey}_Shoe`);
  }

  // 5. Sculpted Concave Tulip Ears firmly seated into the poll cranium (parented to earL & earR bones!)
  const earOffsetL = new THREE.Vector3(...JOINTS.earL);
  const earOffsetR = new THREE.Vector3(...JOINTS.earR);

  const earGeoL = buildEarGeometries(+1);
  const earGeoR = buildEarGeometries(-1);
  // Extend ear root 1.8 cm downward so it seats solidly inside the poll crown with ZERO gap from any angle!
  earGeoL.translate(0, -0.018, 0);
  earGeoR.translate(0, -0.018, 0);

  coatGeometries.push({ geo: earGeoL, offset: earOffsetL });
  coatGeometries.push({ geo: earGeoR, offset: earOffsetR });

  const earMeshL = new THREE.Mesh(earGeoL, materials.coatMaterial);
  earMeshL.name = 'EarL';
  earMeshL.castShadow = true;
  earMeshL.receiveShadow = true;
  earMeshL.rotation.set(0.18, 0.08, -0.20);
  rig.boneMap.earL.add(earMeshL);

  const earMeshR = new THREE.Mesh(earGeoR, materials.coatMaterial);
  earMeshR.name = 'EarR';
  earMeshR.castShadow = true;
  earMeshR.receiveShadow = true;
  earMeshR.rotation.set(0.18, -0.08, 0.20);
  rig.boneMap.earR.add(earMeshR);

  // 6. Soulful Glossy Equine Eyes with Horizontal Bar Pupils, Wet Corneas & Animated Eyelids
  const headBoneWorld = new THREE.Vector3(...JOINTS.head);
  const eyeL = createEquineEyeGroup(+1, materials);
  const eyeR = createEquineEyeGroup(-1, materials);
  eyeL.group.position.copy(SDF_EYE_CENTERS.left).sub(headBoneWorld);
  eyeR.group.position.copy(SDF_EYE_CENTERS.right).sub(headBoneWorld);
  rig.boneMap.head.add(eyeL.group);
  rig.boneMap.head.add(eyeR.group);

  // 7. SDF-Conformed Lush Layered Mane, Forelock, Flowing Tail & Fetlock Tufts (ZERO clipping!)
  const maneGeo = buildManeAndForelockGeometry(rig.boneIndex);
  const tailHairGeo = buildTailHairGeometry(rig.boneIndex);
  const fetlockGeo = buildFetlockTuftsGeometry(rig.boneIndex);

  bindPart(maneGeo, materials.hairMaterial, 'ManeAndForelock');
  bindPart(tailHairGeo, materials.hairMaterial, 'TailHair');
  bindPart(fetlockGeo, materials.hairMaterial, 'FetlockTufts');

  // Instant Coat Preset Switcher
  function setCoatPreset(presetKey) {
    const preset = COAT_PRESETS[presetKey] || COAT_PRESETS.bay;
    for (const item of coatGeometries) {
      applyCoatVertexColors(item.geo, presetKey, item.offset);
    }
    materials.coatMaterial.sheenColor.setHex(preset.coatSheen);
    materials.hairMaterial.color.setHex(preset.hairColor);
    materials.hairMaterial.sheenColor.setHex(preset.hairSheen);
    materials.hairMaterial.specularColor.setHex(preset.hairSheen);
    materials.hoofMaterial.color.setHex(preset.hoofColor);
    materials.lidMaterial.color.setRGB(
      preset.muzzleColor[0] * 0.72,
      preset.muzzleColor[1] * 0.68,
      preset.muzzleColor[2] * 0.66,
      THREE.SRGBColorSpace
    );
  }

  setCoatPreset(initialCoat);

  function getStats() {
    let vertices = 0;
    let triangles = 0;
    group.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        vertices += obj.geometry.attributes.position.count;
        triangles += obj.geometry.index
          ? obj.geometry.index.count / 3
          : obj.geometry.attributes.position.count / 3;
      }
    });
    return { vertices, triangles: Math.round(triangles), bones: rig.bones.length };
  }

  return {
    group,
    rig,
    materials,
    eyes: {
      upperLidL: eyeL.upperLidPivot,
      upperLidR: eyeR.upperLidPivot,
    },
    setCoatPreset,
    getStats,
  };
}
