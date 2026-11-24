import * as THREE from 'three';
import { createEquineSkeleton, JOINTS } from './anatomy.js';
import { buildUnifiedHorseBodyGeometry, SDF_EYE_CENTERS } from './horseSDF.js';
import { buildEarGeometries, createEquineEyeGroup } from './headGeometry.js';
import { buildHoofAndShoeGeometries } from './legGeometry.js';
import { buildManeAndForelockGeometry, buildTailHairGeometry } from './hairGeometry.js';
import { applyCoatVertexColors, COAT_PRESETS, createEquineMaterials } from './materials.js';

/**
 * Assemble the complete, 100% seamless V5 SDF-sculpted, rigged & skinned 3D Horse!
 */
export function createRealisticHorse(initialCoat = 'bay') {
  const group = new THREE.Group();
  group.name = 'RealisticHorse';

  const rig = createEquineSkeleton();
  group.add(rig.rootBone);
  group.updateMatrixWorld(true);

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

  // 1. Unified Seamless SDF Body Mesh
  const bodyGeo = buildUnifiedHorseBodyGeometry(rig.boneIndex);
  coatGeometries.push({ geo: bodyGeo, offset: null });
  bindPart(bodyGeo, materials.coatMaterial, 'EquineBody');

  // 2. Proportionally Sculpted Hooves + Forged Steel Horseshoes
  for (const legKey of ['foreHoofL', 'foreHoofR', 'hindHoofL', 'hindHoofR']) {
    const { hoofGeo, shoeGeo } = buildHoofAndShoeGeometries(legKey, rig.boneIndex);
    bindPart(hoofGeo, materials.hoofMaterial, `${legKey}_Hoof`);
    bindPart(shoeGeo, materials.shoeMaterial, `${legKey}_Shoe`);
  }

  // 3. Alert Concave Tulip Ears firmly seated into the poll cranium
  const earOffsetL = new THREE.Vector3(...JOINTS.earL);
  const earOffsetR = new THREE.Vector3(...JOINTS.earR);

  const earGeoL = buildEarGeometries(+1);
  const earGeoR = buildEarGeometries(-1);
  earGeoL.translate(0, -0.020, 0);
  earGeoR.translate(0, -0.020, 0);

  coatGeometries.push({ geo: earGeoL, offset: earOffsetL });
  coatGeometries.push({ geo: earGeoR, offset: earOffsetR });

  const earMeshL = new THREE.Mesh(earGeoL, materials.coatMaterial);
  earMeshL.name = 'EarL';
  earMeshL.castShadow = true;
  earMeshL.receiveShadow = true;
  earMeshL.rotation.set(0.16, 0.08, -0.17);
  rig.boneMap.earL.add(earMeshL);

  const earMeshR = new THREE.Mesh(earGeoR, materials.coatMaterial);
  earMeshR.name = 'EarR';
  earMeshR.castShadow = true;
  earMeshR.receiveShadow = true;
  earMeshR.rotation.set(0.16, -0.08, 0.17);
  rig.boneMap.earR.add(earMeshR);

  // 4. Deep-Set Soulful Almond Equine Eyes with Coat-Matched Fleshy Eyelids
  const headBoneWorld = new THREE.Vector3(...JOINTS.head);
  const eyeL = createEquineEyeGroup(+1, materials);
  const eyeR = createEquineEyeGroup(-1, materials);
  eyeL.group.position.copy(SDF_EYE_CENTERS.left).sub(headBoneWorld);
  eyeR.group.position.copy(SDF_EYE_CENTERS.right).sub(headBoneWorld);
  rig.boneMap.head.add(eyeL.group);
  rig.boneMap.head.add(eyeR.group);

  // 5. Volumetric 3D Sculpted Mane, Side-Swept Forelock & Lush Flowing Tail
  const maneGeo = buildManeAndForelockGeometry(rig.boneIndex);
  const tailHairGeo = buildTailHairGeometry(rig.boneIndex);

  bindPart(maneGeo, materials.hairMaterial, 'ManeAndForelock');
  bindPart(tailHairGeo, materials.hairMaterial, 'TailHair');

  // Instant Coat Preset Switcher
  function setCoatPreset(presetKey) {
    const preset = COAT_PRESETS[presetKey] || COAT_PRESETS.bay;
    for (const item of coatGeometries) {
      applyCoatVertexColors(item.geo, presetKey, item.offset);
    }
    materials.coatMaterial.sheenColor.setHex(preset.coatSheen);
    materials.coatMaterial.specularColor.setHex(preset.coatSpecular);
    materials.hairMaterial.color.setHex(preset.hairColor);
    materials.hairMaterial.sheenColor.setHex(preset.hairSheen);
    materials.hairMaterial.specularColor.setHex(preset.hairSheen);
    materials.hoofMaterial.color.setHex(preset.hoofColor);
    materials.lidMaterial.color.setRGB(
      preset.baseColor[0] * 0.42 + preset.muzzleColor[0] * 0.45,
      preset.baseColor[1] * 0.40 + preset.muzzleColor[1] * 0.45,
      preset.baseColor[2] * 0.40 + preset.muzzleColor[2] * 0.45,
      THREE.SRGBColorSpace
    );
    materials.lidMaterial.sheenColor.setHex(preset.coatSheen);
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
