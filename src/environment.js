import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const LIGHTING_PRESETS = {
  goldenHour: {
    label: 'Golden Hour',
    skyTop: 0x3a6292,
    skyMid: 0x9bb2c7,
    skyHorizon: 0xebd2b0,
    fogColor: 0xdfcaa8,
    fogDensity: 0.032,
    sunColor: 0xffe6c4,
    sunIntensity: 2.75,
    sunPos: [5.5, 6.4, 4.4],
    hemiSky: 0x9ec0e6,
    hemiGround: 0x4f4835,
    hemiIntensity: 0.82,
    rimColor: 0xffd29a,
    rimIntensity: 1.25,
    rimPos: [-4.5, 3.2, -4.8],
    exposure: 1.04,
    groundTint: 0xb7aa8d,
  },
  studio: {
    label: 'Equine Studio',
    skyTop: 0x20252e,
    skyMid: 0x2e3440,
    skyHorizon: 0x424a58,
    fogColor: 0x353c48,
    fogDensity: 0.035,
    sunColor: 0xfff8f0,
    sunIntensity: 2.55,
    sunPos: [4.2, 6.8, 4.8],
    hemiSky: 0xd0dce8,
    hemiGround: 0x363432,
    hemiIntensity: 0.78,
    rimColor: 0xcce0ff,
    rimIntensity: 1.45,
    rimPos: [-4.8, 3.8, -4.2],
    exposure: 1.04,
    groundTint: 0x5c616b,
  },
  overcast: {
    label: 'Soft Meadow',
    skyTop: 0x6b8299,
    skyMid: 0x9fb2c2,
    skyHorizon: 0xd5dfe6,
    fogColor: 0xc8d4dd,
    fogDensity: 0.032,
    sunColor: 0xf7f9fc,
    sunIntensity: 1.95,
    sunPos: [3.2, 8.2, 3.8],
    hemiSky: 0xd6e6f5,
    hemiGround: 0x535746,
    hemiIntensity: 1.25,
    rimColor: 0xe6eff8,
    rimIntensity: 0.72,
    rimPos: [-4.0, 4.5, -4.0],
    exposure: 1.04,
    groundTint: 0xaab098,
  },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Procedural natural sandy-turf equestrian arena footing texture (seamless tileable).
 */
function createGroundTextures() {
  const size = 512;
  const rng = mulberry32(81234);

  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const ctx = cCanvas.getContext('2d');

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bctx = bCanvas.getContext('2d');

  ctx.fillStyle = '#9c8c74';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Soft natural soil & turf patches
  for (let i = 0; i < 240; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rad = 14 + rng() * 52;
    const green = rng() < 0.38;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, rad);
    grad.addColorStop(
      0,
      green ? `rgba(108, 118, 82, ${0.12 + rng() * 0.14})` : `rgba(132, 114, 92, ${0.10 + rng() * 0.14})`
    );
    grad.addColorStop(1, 'rgba(156,140,116,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Fine mineral grain & groomed arena sand stipple
  for (let i = 0; i < 14000; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const v = 115 + Math.floor(rng() * 75);
    ctx.fillStyle = `rgba(${v},${v - 8},${v - 18},0.22)`;
    ctx.fillRect(x, y, 1.8, 1.8);

    const bv = 95 + Math.floor(rng() * 68);
    bctx.fillStyle = `rgba(${bv},${bv},${bv},0.35)`;
    bctx.fillRect(x, y, 2.0, 2.0);
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(18, 18);
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(18, 18);
  bumpMap.anisotropy = 8;

  return { map, bumpMap };
}

/**
 * Create atmospheric gradient Sky Dome with soft solar halo.
 */
function createSkyDome() {
  const skyGeo = new THREE.SphereGeometry(65, 32, 24);
  const uniforms = {
    uTopColor:     { value: new THREE.Color(0x355b8c) },
    uMidColor:     { value: new THREE.Color(0x8ea8c3) },
    uHorizonColor: { value: new THREE.Color(0xf2cfa0) },
    uSunDir:       { value: new THREE.Vector3(0.55, 0.42, 0.45).normalize() },
    uSunStrength:  { value: 0.42 },
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunDir;
      uniform float uSunStrength;
      varying vec3 vWorldDir;
      void main() {
        vec3 d = normalize(vWorldDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.24, h));
        col = mix(col, uTopColor, smoothstep(0.18, 0.85, h));
        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        col += vec3(1.0, 0.88, 0.68) * (pow(sunDot, 16.0) * 0.22 + pow(sunDot, 160.0) * 0.65) * uSunStrength;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(skyGeo, skyMat);
  mesh.name = 'SkyDome';
  return { mesh, uniforms };
}

/**
 * Create natural clustered meadow grass tufts around the outer perimeter (r > 3.6 m),
 * keeping the central groomed footing clean so hooves, horseshoes, and cast shadows read crisply!
 */
function createPerimeterGrass() {
  // Multi-blade natural tuft geometry (5 varied curved blades radiating from a natural base!)
  const positions = [];
  const normals = [];
  const indices = [];
  const bladesPerTuft = 5;
  const segs = 3;

  for (let b = 0; b < bladesPerTuft; b++) {
    const yaw = (b / bladesPerTuft) * Math.PI * 2 + (b % 2) * 0.4;
    const lean = 0.055 + (b % 3) * 0.025;
    const h = 0.14 + (b % 3) * 0.045;
    const halfW = 0.011;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const baseVert = positions.length / 3;

    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const w = halfW * (1 - t * 0.90);
      const y = t * h;
      const r = t * t * lean;
      const cx = cosY * r;
      const cz = sinY * r;
      const sx = -sinY * w;
      const sz = cosY * w;

      positions.push(cx - sx, y, cz - sz);
      positions.push(cx + sx, y, cz + sz);
      normals.push(cosY * 0.3, 0.95, sinY * 0.3);
      normals.push(cosY * 0.3, 0.95, sinY * 0.3);
    }
    for (let s = 0; s < segs; s++) {
      const i0 = baseVert + s * 2;
      indices.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2);
    }
  }

  const tuftGeo = new THREE.BufferGeometry();
  tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  tuftGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  tuftGeo.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x737d4c,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const count = 420;
  const inst = new THREE.InstancedMesh(tuftGeo, mat, count);
  inst.receiveShadow = true;
  inst.castShadow = false;

  const rng = mulberry32(202611);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 3.8 + Math.pow(rng(), 0.78) * 16.5;
    const scale = 0.75 + rng() * 0.95;

    dummy.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * (0.7 + rng() * 0.6), scale);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);

    color.setHSL(0.20 + (rng() - 0.5) * 0.06, 0.24 + rng() * 0.14, 0.32 + rng() * 0.14);
    inst.setColorAt(i, color);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

  return inst;
}

/**
 * Setup complete lighting, PMREM environment reflection map, atmospheric sky dome, and natural ground stage.
 */
export function createSceneEnvironment(scene, renderer, initialPreset = 'goldenHour') {
  // High-quality neutral studio IBL so curved muscles, wet eyes, and steel horseshoes pick up silky highlights
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  const fog = new THREE.FogExp2(0xdec4a4, 0.022);
  scene.fog = fog;

  const sky = createSkyDome();
  scene.add(sky.mesh);

  // Key Directional Sunlight with crisp tight shadow frustum around the horse
  const sunLight = new THREE.DirectionalLight(0xffe4bd, 3.1);
  sunLight.position.set(5.5, 6.2, 4.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1.0;
  sunLight.shadow.camera.far = 18.0;
  sunLight.shadow.camera.left = -2.6;
  sunLight.shadow.camera.right = 2.6;
  sunLight.shadow.camera.top = 2.8;
  sunLight.shadow.camera.bottom = -1.6;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.018;
  scene.add(sunLight);

  // Soft Hemisphere Sky/Ground Fill Light
  const hemiLight = new THREE.HemisphereLight(0x9fc2ea, 0x5c4b37, 0.92);
  scene.add(hemiLight);

  // Sculptural Rim / Back-Edge Accent Light (brings out neck crest, shoulder anatomy & flowing tail strands!)
  const rimLight = new THREE.DirectionalLight(0xffd093, 1.35);
  rimLight.position.set(-4.5, 3.2, -4.8);
  scene.add(rimLight);

  // Natural compacted arena turf/sand ground disk with warm outer meadow blend & gentle distant horizon hills
  const groundTex = createGroundTextures();
  const groundGeo = new THREE.CircleGeometry(46, 80, 0, Math.PI * 2);
  groundGeo.rotateX(-Math.PI / 2);

  // Add gentle distant meadow undulation outside r > 12m so horizon looks softly natural (never a flat razor line!)
  const gPos = groundGeo.attributes.position;
  const gColors = new Float32Array(gPos.count * 3);
  for (let i = 0; i < gPos.count; i++) {
    const gx = gPos.getX(i);
    const gz = gPos.getZ(i);
    const r = Math.hypot(gx, gz);
    // Warm sunlit arena footing inside r < 3.5m -> soft olive-gold meadow pasture beyond!
    const meadowT = Math.min(1, Math.max(0, (r - 2.6) / 6.5));
    const cr = THREE.MathUtils.lerp(1.0, 0.78, meadowT);
    const cg = THREE.MathUtils.lerp(0.96, 0.84, meadowT);
    const cb = THREE.MathUtils.lerp(0.88, 0.62, meadowT);
    gColors[i * 3] = cr;
    gColors[i * 3 + 1] = cg;
    gColors[i * 3 + 2] = cb;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gColors, 3));

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xb7aa8d,
    vertexColors: true,
    map: groundTex.map,
    bumpMap: groundTex.bumpMap,
    bumpScale: 0.015,
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.25,
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'Ground';
  ground.receiveShadow = true;
  scene.add(ground);

  // Subtle rolling distant hillside silhouette ring melting into atmospheric golden mist
  const hillGeo = new THREE.CylinderGeometry(36, 44, 3.6, 64, 1, true);
  const hPos = hillGeo.attributes.position;
  for (let i = 0; i < hPos.count; i++) {
    const y = hPos.getY(i);
    if (y > 0) {
      const ang = Math.atan2(hPos.getZ(i), hPos.getX(i));
      const ridge = 1.2 + Math.sin(ang * 3.0) * 0.9 + Math.cos(ang * 5.0 + 1.1) * 0.55 + Math.sin(ang * 9.0) * 0.25;
      hPos.setY(i, ridge);
    } else {
      hPos.setY(i, -0.4);
    }
  }
  hillGeo.computeVertexNormals();
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0x7b8064,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.BackSide,
  });
  const hills = new THREE.Mesh(hillGeo, hillMat);
  hills.name = 'DistantHills';
  scene.add(hills);

  const grass = createPerimeterGrass();
  scene.add(grass);

  function setLightingPreset(key) {
    const p = LIGHTING_PRESETS[key] || LIGHTING_PRESETS.goldenHour;
    sky.uniforms.uTopColor.value.setHex(p.skyTop);
    sky.uniforms.uMidColor.value.setHex(p.skyMid);
    sky.uniforms.uHorizonColor.value.setHex(p.skyHorizon);
    sky.uniforms.uSunDir.value.set(...p.sunPos).normalize();
    sky.uniforms.uSunStrength.value = key === 'goldenHour' ? 0.55 : key === 'studio' ? 0.0 : 0.14;

    fog.color.setHex(p.fogColor);
    fog.density = p.fogDensity;

    sunLight.color.setHex(p.sunColor);
    sunLight.intensity = p.sunIntensity;
    sunLight.position.set(...p.sunPos);

    hemiLight.color.setHex(p.hemiSky);
    hemiLight.groundColor.setHex(p.hemiGround);
    hemiLight.intensity = p.hemiIntensity;

    rimLight.color.setHex(p.rimColor);
    rimLight.intensity = p.rimIntensity;
    rimLight.position.set(...p.rimPos);

    groundMat.color.setHex(p.groundTint);
    grass.visible = key !== 'studio';
    hills.visible = key !== 'studio';
    renderer.toneMappingExposure = p.exposure;
  }

  setLightingPreset(initialPreset);

  // Scroll ground grain gently backward when horse is walking/trotting/galloping!
  function updateGroundMotion(dt, mode, speed) {
    const speedMap = { stance: 0, idle: 0, walk: 1.4, trot: 3.1, gallop: 5.8 };
    const v = (speedMap[mode] || 0) * speed;
    if (v > 0) {
      // Horse faces +Z -> ground passes backward toward -Z!
      const deltaUV = (v * dt) / 4.6;
      groundTex.map.offset.y = (groundTex.map.offset.y - deltaUV) % 1;
      groundTex.bumpMap.offset.y = groundTex.map.offset.y;
    }
  }

  return {
    setLightingPreset,
    updateGroundMotion,
    sunLight,
    hemiLight,
    rimLight,
    ground,
  };
}
