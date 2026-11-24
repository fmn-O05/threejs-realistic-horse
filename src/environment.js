import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const LIGHTING_PRESETS = {
  goldenHour: {
    label: 'Golden Hour',
    skyTop: 0x2c4f7c,
    skyMid: 0x8da4bc,
    skyHorizon: 0xf0cfa2,
    fogColor: 0xdcc5a4,
    fogDensity: 0.036,
    sunColor: 0xffe4bc,
    sunIntensity: 2.85,
    sunPos: [-5.2, 6.0, 4.6], // Sun illuminates the RIGHT-3/4 hero side & sculpted mane richly!
    hemiSky: 0x9ec0e6,
    hemiGround: 0x4a4a34,
    hemiIntensity: 0.82,
    rimColor: 0xffd093,
    rimIntensity: 1.40,
    rimPos: [4.8, 3.2, -4.6],
    exposure: 1.05,
    groundTint: 0x9fa37c,
    hillColor: 0x6f7a5c,
  },
  studio: {
    label: 'Equine Studio',
    skyTop: 0x181c24,
    skyMid: 0x242a35,
    skyHorizon: 0x38404f,
    fogColor: 0x2b313d,
    fogDensity: 0.042,
    sunColor: 0xfff8f0,
    sunIntensity: 2.65,
    sunPos: [-4.2, 6.8, 4.8],
    hemiSky: 0xd0dce8,
    hemiGround: 0x333538,
    hemiIntensity: 0.78,
    rimColor: 0xcce0ff,
    rimIntensity: 1.55,
    rimPos: [4.8, 3.8, -4.2],
    exposure: 1.06,
    groundTint: 0x565c66,
    hillColor: 0x323844,
  },
  overcast: {
    label: 'Soft Meadow',
    skyTop: 0x607890,
    skyMid: 0x9bb0c2,
    skyHorizon: 0xd6e0e8,
    fogColor: 0xc6d3dc,
    fogDensity: 0.036,
    sunColor: 0xf7f9fc,
    sunIntensity: 2.05,
    sunPos: [-3.6, 8.2, 3.8],
    hemiSky: 0xd6e6f5,
    hemiGround: 0x4f5a42,
    hemiIntensity: 1.25,
    rimColor: 0xe6eff8,
    rimIntensity: 0.82,
    rimPos: [4.2, 4.4, -4.0],
    exposure: 1.05,
    groundTint: 0x92a178,
    hillColor: 0x6f8064,
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
 * Rich, organic procedural sunlit pasture turf & groomed loam footing texture (zero flat desert look!).
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

  ctx.fillStyle = '#8b8b6d';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Layered organic pasture clover, sunlit earth & moss patches
  for (let i = 0; i < 320; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rad = 12 + rng() * 54;
    const kind = rng();
    const grad = ctx.createRadialGradient(x, y, 2, x, y, rad);
    if (kind < 0.48) {
      grad.addColorStop(0, `rgba(92, 114, 66, ${0.14 + rng() * 0.16})`);
    } else if (kind < 0.80) {
      grad.addColorStop(0, `rgba(128, 118, 86, ${0.12 + rng() * 0.15})`);
    } else {
      grad.addColorStop(0, `rgba(104, 96, 72, ${0.12 + rng() * 0.14})`);
    }
    grad.addColorStop(1, 'rgba(139,139,109,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Fine organic meadow grass & loam stipple micro-detail
  for (let i = 0; i < 22000; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const isBlade = rng() < 0.55;
    if (isBlade) {
      const g = 95 + Math.floor(rng() * 58);
      ctx.strokeStyle = `rgba(${Math.floor(g * 0.82)},${g},${Math.floor(g * 0.58)},0.28)`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 4, y + (rng() - 0.5) * 4);
      ctx.stroke();
    } else {
      const v = 105 + Math.floor(rng() * 68);
      ctx.fillStyle = `rgba(${v},${v - 6},${v - 16},0.22)`;
      ctx.fillRect(x, y, 1.8, 1.8);
    }

    const bv = 85 + Math.floor(rng() * 90);
    bctx.fillStyle = `rgba(${bv},${bv},${bv},0.35)`;
    bctx.fillRect(x, y, 2.0, 2.0);
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(22, 22);
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(22, 22);
  bumpMap.anisotropy = 8;

  return { map, bumpMap };
}

/**
 * Painterly Procedural Atmospheric Sky Dome with soft golden-hour sunlit clouds!
 */
function createSkyDome() {
  const skyGeo = new THREE.SphereGeometry(65, 36, 24);
  const uniforms = {
    uTopColor:     { value: new THREE.Color(0x2c4f7c) },
    uMidColor:     { value: new THREE.Color(0x8da4bc) },
    uHorizonColor: { value: new THREE.Color(0xf0cfa2) },
    uSunDir:       { value: new THREE.Vector3(-0.52, 0.45, 0.46).normalize() },
    uSunStrength:  { value: 0.52 },
    uCloudStrength:{ value: 0.42 },
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
      uniform float uCloudStrength;
      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.04;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vWorldDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.25, h));
        col = mix(col, uTopColor, smoothstep(0.18, 0.85, h));

        // Subtle painterly sunlit clouds above horizon
        if (uCloudStrength > 0.01 && h > 0.02) {
          vec2 uv = d.xz / (h + 0.22) * 1.4;
          float c = fbm(uv + vec2(1.7, 3.2));
          float cloudMask = smoothstep(0.48, 0.78, c) * smoothstep(0.02, 0.18, h) * smoothstep(0.85, 0.30, h);
          vec3 cloudCol = mix(uHorizonColor * 1.08, vec3(1.0, 0.96, 0.88), 0.55);
          col = mix(col, cloudCol, cloudMask * uCloudStrength);
        }

        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        col += vec3(1.0, 0.88, 0.68) * (pow(sunDot, 14.0) * 0.22 + pow(sunDot, 150.0) * 0.62) * uSunStrength;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(skyGeo, skyMat);
  mesh.name = 'SkyDome';
  return { mesh, uniforms };
}

/**
 * Subtle floating golden-hour dust / sunlit atmospheric motes that drift cleanly with the horse's motion!
 */
function createAtmosphericMotes() {
  const count = 120;
  const rng = mulberry32(77701);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (rng() - 0.5) * 9.0;
    positions[i * 3 + 1] = 0.08 + rng() * 2.4;
    positions[i * 3 + 2] = (rng() - 0.5) * 9.0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Soft circular bokeh glow sprite (eliminates harsh WebGL square pixels!)
  const spr = document.createElement('canvas');
  spr.width = 32;
  spr.height = 32;
  const sctx = spr.getContext('2d');
  const grad = sctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0.0, 'rgba(255, 244, 214, 0.95)');
  grad.addColorStop(0.4, 'rgba(255, 232, 186, 0.45)');
  grad.addColorStop(1.0, 'rgba(255, 224, 170, 0.0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 32, 32);
  const map = new THREE.CanvasTexture(spr);

  const mat = new THREE.PointsMaterial({
    color: 0xffe8c2,
    map,
    size: 0.048,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'AtmosphericMotes';
  return pts;
}

/**
 * Setup cinematic 3-point lighting, PMREM IBL reflections, painterly cloudy sky dome,
 * and rich meadow/paddock ground stage (ZERO sparse cartoon grass spikes!).
 */
export function createSceneEnvironment(scene, renderer, initialPreset = 'goldenHour') {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();

  const fog = new THREE.FogExp2(0xdcc5a4, 0.036);
  scene.fog = fog;

  const sky = createSkyDome();
  scene.add(sky.mesh);

  // Key Directional Sunlight casting crisp 2048x2048 soft shadows
  const sunLight = new THREE.DirectionalLight(0xffe4bc, 2.85);
  sunLight.position.set(-5.2, 6.0, 4.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1.0;
  sunLight.shadow.camera.far = 18.0;
  sunLight.shadow.camera.left = -2.6;
  sunLight.shadow.camera.right = 2.6;
  sunLight.shadow.camera.top = 2.8;
  sunLight.shadow.camera.bottom = -1.6;
  sunLight.shadow.bias = -0.00045;
  sunLight.shadow.normalBias = 0.016;
  scene.add(sunLight);

  // Soft Hemisphere Sky/Meadow Fill Light
  const hemiLight = new THREE.HemisphereLight(0x9ec0e6, 0x4a4a34, 0.82);
  scene.add(hemiLight);

  // Sculptural Rim / Back-Edge Accent Light highlighting mane locks, neck crest & muscle contour
  const rimLight = new THREE.DirectionalLight(0xffd093, 1.40);
  rimLight.position.set(4.8, 3.2, -4.6);
  scene.add(rimLight);

  // Rich equestrian paddock ground: warm groomed loam center blending organically into lush sunlit meadow!
  const groundTex = createGroundTextures();
  const groundGeo = new THREE.CircleGeometry(46, 80);
  groundGeo.rotateX(-Math.PI / 2);

  const gPos = groundGeo.attributes.position;
  const gColors = new Float32Array(gPos.count * 3);
  for (let i = 0; i < gPos.count; i++) {
    const gx = gPos.getX(i);
    const gz = gPos.getZ(i);
    const r = Math.hypot(gx, gz);
    // Warm sunlit arena center (r < 2.5m) -> rich olive-green sunlit meadow pasture outside!
    const meadowT = Math.min(1, Math.max(0, (r - 2.2) / 5.5));
    gColors[i * 3]     = THREE.MathUtils.lerp(1.06, 0.72, meadowT);
    gColors[i * 3 + 1] = THREE.MathUtils.lerp(0.98, 0.86, meadowT);
    gColors[i * 3 + 2] = THREE.MathUtils.lerp(0.84, 0.56, meadowT);
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gColors, 3));

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x9fa37c,
    vertexColors: true,
    map: groundTex.map,
    bumpMap: groundTex.bumpMap,
    bumpScale: 0.018,
    roughness: 0.94,
    metalness: 0.0,
    envMapIntensity: 0.25,
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'Ground';
  ground.receiveShadow = true;
  scene.add(ground);

  // Soft distant rolling pasture hills melting into atmospheric golden mist
  const hillGeo = new THREE.CylinderGeometry(34, 42, 4.2, 72, 1, true);
  const hPos = hillGeo.attributes.position;
  for (let i = 0; i < hPos.count; i++) {
    const y = hPos.getY(i);
    if (y > 0) {
      const ang = Math.atan2(hPos.getZ(i), hPos.getX(i));
      const ridge = 1.6 + Math.sin(ang * 3.0) * 1.1 + Math.cos(ang * 5.0 + 1.1) * 0.65 + Math.sin(ang * 9.0) * 0.28;
      hPos.setY(i, ridge);
    } else {
      hPos.setY(i, -0.5);
    }
  }
  hillGeo.computeVertexNormals();
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0x6f7a5c,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.BackSide,
  });
  const hills = new THREE.Mesh(hillGeo, hillMat);
  hills.name = 'DistantHills';
  scene.add(hills);

  const motes = createAtmosphericMotes();
  scene.add(motes);

  function setLightingPreset(key) {
    const p = LIGHTING_PRESETS[key] || LIGHTING_PRESETS.goldenHour;
    sky.uniforms.uTopColor.value.setHex(p.skyTop);
    sky.uniforms.uMidColor.value.setHex(p.skyMid);
    sky.uniforms.uHorizonColor.value.setHex(p.skyHorizon);
    sky.uniforms.uSunDir.value.set(...p.sunPos).normalize();
    sky.uniforms.uSunStrength.value = key === 'goldenHour' ? 0.56 : key === 'studio' ? 0.0 : 0.14;
    sky.uniforms.uCloudStrength.value = key === 'studio' ? 0.0 : key === 'overcast' ? 0.55 : 0.42;

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
    groundMat.roughness = key === 'studio' ? 0.68 : 0.94;
    hillMat.color.setHex(p.hillColor);
    hills.visible = key !== 'studio';
    motes.visible = key === 'goldenHour';
    renderer.toneMappingExposure = p.exposure;
  }

  setLightingPreset(initialPreset);

  // Scroll ground turf & drift sunlit atmospheric motes synchronously with gait velocity!
  function updateGroundMotion(dt, mode, speed) {
    const speedMap = { stance: 0, idle: 0, walk: 1.45, trot: 3.15, gallop: 5.9 };
    const v = (speedMap[mode] || 0) * speed;
    if (v > 0) {
      const deltaUV = (v * dt) / 4.2;
      groundTex.map.offset.y = (groundTex.map.offset.y - deltaUV) % 1;
      groundTex.bumpMap.offset.y = groundTex.map.offset.y;

      const posAttr = motes.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        let mz = posAttr.getZ(i) - v * dt * 0.65;
        if (mz < -4.5) mz += 9.0;
        posAttr.setZ(i, mz);
      }
      posAttr.needsUpdate = true;
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
