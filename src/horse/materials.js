import * as THREE from 'three';
import { clamp, smoothstep } from './sculptUtils.js';

/**
 * Five realistic, breed-authentic equine coat presets.
 * NOTE: Colors below are specified in intuitive sRGB [0..1] and converted properly to LINEAR
 * when written into Three.js vertex color buffers so dark mahogany bays, raven blacks, and
 * dapple grays render with true photographic richness (never washed-out plastic peach!).
 */
export const COAT_PRESETS = {
  bay: {
    label: 'Blood Bay',
    baseColor:      [0.39, 0.145, 0.058],  // Rich burnished mahogany-chestnut Blood Bay (sRGB!)
    highlightColor: [0.56, 0.245, 0.095],  // Warm sunlit copper-mahogany flank & shoulder luster
    bellyColor:     [0.46, 0.195, 0.078],  // Soft warm bay underbelly
    dorsalColor:    [0.21, 0.072, 0.028],  // Deep dark-bay topline & croup richness
    pointsColor:    [0.095, 0.082, 0.078], // Classic jet-black lower legs & ear tips
    muzzleColor:    [0.145, 0.125, 0.118], // Soft velvety dark charcoal muzzle
    hairColor:      0x0d0a09,              // Rich deep jet-black mane, forelock & tail
    hairSheen:      0x3a241a,
    coatSheen:      0xa86036,
    hoofColor:      0x24201d,
    dappleStrength: 0.0,
    starStyle:      'starStrip',
    socks:          { foreL: 0.0, foreR: 0.0, hindL: 0.34, hindR: 0.16 },
  },
  dappleGray: {
    label: 'Dapple Gray',
    baseColor:      [0.64, 0.65, 0.67],
    highlightColor: [0.80, 0.81, 0.83],
    bellyColor:     [0.70, 0.71, 0.73],
    dorsalColor:    [0.44, 0.46, 0.49],
    pointsColor:    [0.24, 0.25, 0.28],
    muzzleColor:    [0.20, 0.20, 0.22],
    hairColor:      0x34373e,
    hairSheen:      0x8b93a0,
    coatSheen:      0xd0d8e0,
    hoofColor:      0x303034,
    dappleStrength: 0.24,
    starStyle:      'none',
    socks:          { foreL: 0.0, foreR: 0.0, hindL: 0.0, hindR: 0.0 },
  },
  black: {
    label: 'Friesian Black',
    baseColor:      [0.105, 0.100, 0.108],
    highlightColor: [0.185, 0.175, 0.188],
    bellyColor:     [0.125, 0.118, 0.118],
    dorsalColor:    [0.072, 0.070, 0.078],
    pointsColor:    [0.068, 0.066, 0.072],
    muzzleColor:    [0.120, 0.114, 0.118],
    hairColor:      0x0a090b,
    hairSheen:      0x282e3b,
    coatSheen:      0x4e596e,
    hoofColor:      0x1d1c1d,
    dappleStrength: 0.0,
    starStyle:      'smallStar',
    socks:          { foreL: 0.0, foreR: 0.0, hindL: 0.0, hindR: 0.0 },
  },
  palomino: {
    label: 'Golden Palomino',
    baseColor:      [0.71, 0.46, 0.155],
    highlightColor: [0.87, 0.63, 0.265],
    bellyColor:     [0.80, 0.57, 0.245],
    dorsalColor:    [0.56, 0.34, 0.105],
    pointsColor:    [0.62, 0.40, 0.145],
    muzzleColor:    [0.34, 0.27, 0.235],
    hairColor:      0xe3d8c2,
    hairSheen:      0xfff8eb,
    coatSheen:      0xe8be72,
    hoofColor:      0x584c3e,
    dappleStrength: 0.05,
    starStyle:      'blaze',
    socks:          { foreL: 0.28, foreR: 0.24, hindL: 0.38, hindR: 0.36 },
  },
  chestnut: {
    label: 'Copper Chestnut',
    baseColor:      [0.50, 0.185, 0.065],
    highlightColor: [0.71, 0.315, 0.115],
    bellyColor:     [0.61, 0.265, 0.098],
    dorsalColor:    [0.33, 0.112, 0.038],
    pointsColor:    [0.39, 0.148, 0.054],
    muzzleColor:    [0.31, 0.175, 0.125],
    hairColor:      0x4f1e0d,
    hairSheen:      0x9e4c24,
    coatSheen:      0xc8743c,
    hoofColor:      0x3a2e26,
    dappleStrength: 0.0,
    starStyle:      'starSnip',
    socks:          { foreL: 0.0, foreR: 0.18, hindL: 0.34, hindR: 0.0 },
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
 * Proper IEC 61966-2-1 sRGB -> Linear conversion for physically accurate Three.js vertex colors!
 */
function srgbToLinear(c) {
  const x = clamp(c, 0, 1);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/**
 * Generate seamless 1024x1024 directional short-horsehair PBR maps (albedo detail, bump, roughness).
 * Calibrated for natural velvety horsehide luster — zero plastic balloon glare!
 */
function createCoatPBRTextures() {
  const size = 1024;
  const rng = mulberry32(42197);

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const actx = albedoCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d');

  actx.fillStyle = '#e6e4e1';
  actx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Satin-matte horsehair roughness base (~0.70 roughness!)
  rctx.fillStyle = '#b4b4b4';
  rctx.fillRect(0, 0, size, size);

  // Organic subtle coat mottling so broad surfaces never look CG-smooth
  for (let i = 0; i < 240; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rad = 22 + rng() * 78;
    const light = rng() > 0.5;
    const grad = actx.createRadialGradient(x, y, 2, x, y, rad);
    grad.addColorStop(0, light ? 'rgba(255,250,244,0.055)' : 'rgba(145,130,118,0.065)');
    grad.addColorStop(1, 'rgba(230,228,225,0)');
    actx.fillStyle = grad;
    actx.fillRect(x - rad, y - rad, rad * 2, rad * 2);

    const rGrad = rctx.createRadialGradient(x, y, 2, x, y, rad);
    rGrad.addColorStop(0, light ? 'rgba(150,150,150,0.12)' : 'rgba(205,205,205,0.12)');
    rGrad.addColorStop(1, 'rgba(180,180,180,0)');
    rctx.fillStyle = rGrad;
    rctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Dense directional short horsehair strokes (seamless tile wrapping!)
  const strokes = 38000;
  for (let i = 0; i < strokes; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 6 + rng() * 13;
    const dx = (rng() - 0.5) * 2.0;
    const shade = 188 + Math.floor(rng() * 67);
    const alpha = 0.14 + rng() * 0.18;

    actx.strokeStyle = `rgba(${shade},${Math.max(0, shade - 4)},${Math.max(0, shade - 8)},${alpha})`;
    actx.lineWidth = 0.75 + rng() * 0.85;
    actx.beginPath();
    actx.moveTo(x, y);
    actx.lineTo(x + dx, y + len);
    actx.stroke();

    const bVal = 72 + Math.floor(rng() * 116);
    bctx.strokeStyle = `rgba(${bVal},${bVal},${bVal},0.34)`;
    bctx.lineWidth = 0.9;
    bctx.beginPath();
    bctx.moveTo(x, y);
    bctx.lineTo(x + dx, y + len);
    bctx.stroke();

    if (y + len > size) {
      actx.beginPath();
      actx.moveTo(x, y - size);
      actx.lineTo(x + dx, y + len - size);
      actx.stroke();

      bctx.beginPath();
      bctx.moveTo(x, y - size);
      bctx.lineTo(x + dx, y + len - size);
      bctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 8;

  return { map, bumpMap, roughnessMap };
}

/**
 * Generate realistic Equine Eye Iris texture with walnut-amber fibers
 * and authentic horizontal rectangular equine pupil!
 */
function createEquineIrisTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#18110d';
  ctx.fillRect(0, 0, size, size);

  const cx = size * 0.5;
  const cy = size * 0.5;
  const irisR = size * 0.34;

  const scleraGrad = ctx.createRadialGradient(cx, cy, irisR * 0.92, cx, cy, size * 0.49);
  scleraGrad.addColorStop(0, '#100906');
  scleraGrad.addColorStop(0.32, '#271e19');
  scleraGrad.addColorStop(0.74, '#443931');
  scleraGrad.addColorStop(1, '#2b221d');
  ctx.fillStyle = scleraGrad;
  ctx.fillRect(0, 0, size, size);

  const irisGrad = ctx.createRadialGradient(cx, cy, irisR * 0.12, cx, cy, irisR);
  irisGrad.addColorStop(0.0, '#261307');
  irisGrad.addColorStop(0.45, '#4b240c');
  irisGrad.addColorStop(0.75, '#381908');
  irisGrad.addColorStop(0.92, '#1a0b04');
  irisGrad.addColorStop(1.0, '#0c0603');
  ctx.beginPath();
  ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
  ctx.fillStyle = irisGrad;
  ctx.fill();

  const rng = mulberry32(9821);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, irisR * 0.96, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 420; i++) {
    const ang = rng() * Math.PI * 2;
    const r0 = irisR * (0.18 + rng() * 0.16);
    const r1 = irisR * (0.68 + rng() * 0.28);
    const warm = rng() > 0.42;
    ctx.strokeStyle = warm
      ? `rgba(140, 74, 28, ${0.14 + rng() * 0.16})`
      : `rgba(24, 10, 4, ${0.18 + rng() * 0.2})`;
    ctx.lineWidth = 1.0 + rng() * 1.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang + (rng() - 0.5) * 0.05) * r1, cy + Math.sin(ang + (rng() - 0.5) * 0.05) * r1);
    ctx.stroke();
  }

  // Horizontal rectangular equine pupil + granula iridica
  const pW = irisR * 0.62;
  const pH = irisR * 0.30;
  ctx.fillStyle = '#030203';
  ctx.beginPath();
  ctx.roundRect(cx - pW * 0.5, cy - pH * 0.5, pW, pH, pH * 0.46);
  ctx.fill();

  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * (pW * 0.11), cy - pH * 0.44, pH * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Generate vertical-striated keratin Hoof PBR textures (color + bump).
 */
function createHoofTextures() {
  const size = 512;
  const rng = mulberry32(55109);

  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const cctx = cCanvas.getContext('2d');

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bctx = bCanvas.getContext('2d');

  const grad = cctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.00, '#c0b6ac');
  grad.addColorStop(0.14, '#847c76');
  grad.addColorStop(0.78, '#6a635d');
  grad.addColorStop(0.95, '#827769');
  grad.addColorStop(1.00, '#665c51');
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 2) {
    const v = 86 + Math.floor(rng() * 75);
    cctx.fillStyle = `rgba(${v},${v - 4},${v - 8},0.18)`;
    cctx.fillRect(x, 0, 1 + rng() * 1.5, size);

    const bv = 95 + Math.floor(rng() * 72);
    bctx.fillStyle = `rgba(${bv},${bv},${bv},0.38)`;
    bctx.fillRect(x, 0, 1.5, size);
  }

  for (let i = 0; i < 18; i++) {
    const y = 30 + rng() * (size - 60);
    const h = 3 + rng() * 8;
    cctx.fillStyle = rng() > 0.5 ? 'rgba(255,248,238,0.06)' : 'rgba(20,16,14,0.08)';
    cctx.fillRect(0, y, size, h);
    bctx.fillStyle = 'rgba(158,158,158,0.22)';
    bctx.fillRect(0, y, size, 2);
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.anisotropy = 8;

  return { map, bumpMap };
}

/**
 * Generate crisp multi-strand Hair Card alpha + luminance map for Mane, Forelock, and Tail!
 */
function createHairCardTextures() {
  const w = 256;
  const h = 512;
  const rng = mulberry32(314159);

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const cctx = colorCanvas.getContext('2d');

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = w;
  alphaCanvas.height = h;
  const actx = alphaCanvas.getContext('2d');

  cctx.fillStyle = '#cfcfcf';
  cctx.fillRect(0, 0, w, h);

  actx.fillStyle = '#000000';
  actx.fillRect(0, 0, w, h);

  const numStrands = 86;
  for (let i = 0; i < numStrands; i++) {
    const u = (i + 0.5) / numStrands;
    const edgeDist = Math.abs(u - 0.5) * 2;
    const x0 = u * w + (rng() - 0.5) * 4;

    const tipFrac = clamp(1.0 - edgeDist * 0.30 - rng() * 0.22, 0.45, 1.0);
    const yEnd = tipFrac * h;
    const sway = (rng() - 0.5) * 14;
    const width = 2.8 + rng() * 3.4;

    const aGrad = actx.createLinearGradient(0, 0, 0, yEnd);
    aGrad.addColorStop(0.0, 'rgba(255,255,255,0.96)');
    aGrad.addColorStop(0.68, 'rgba(255,255,255,0.98)');
    aGrad.addColorStop(0.90, 'rgba(225,225,225,0.75)');
    aGrad.addColorStop(1.0, 'rgba(0,0,0,0.0)');

    actx.strokeStyle = aGrad;
    actx.lineWidth = width;
    actx.lineCap = 'round';
    actx.beginPath();
    actx.moveTo(x0, 0);
    actx.quadraticCurveTo(x0 + sway, yEnd * 0.55, x0 + sway * 0.6, yEnd);
    actx.stroke();

    const lum = 148 + Math.floor(rng() * 104);
    const cGrad = cctx.createLinearGradient(0, 0, 0, yEnd);
    cGrad.addColorStop(0.0, `rgb(${Math.floor(lum * 0.70)},${Math.floor(lum * 0.68)},${Math.floor(lum * 0.66)})`);
    cGrad.addColorStop(0.45, `rgb(${lum},${Math.max(0, lum - 3)},${Math.max(0, lum - 6)})`);
    cGrad.addColorStop(1.0, `rgb(${Math.min(255, lum + 12)},${Math.min(255, lum + 8)},${Math.min(255, lum + 4)})`);

    cctx.strokeStyle = cGrad;
    cctx.lineWidth = width * 0.85;
    cctx.beginPath();
    cctx.moveTo(x0, 0);
    cctx.quadraticCurveTo(x0 + sway, yEnd * 0.55, x0 + sway * 0.6, yEnd);
    cctx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const alphaMap = new THREE.CanvasTexture(alphaCanvas);
  alphaMap.anisotropy = 8;

  return { map, alphaMap };
}

/**
 * Create physically calibrated PBR equine materials (natural satin-velvet horsehide, zero plastic gloss!).
 */
export function createEquineMaterials(presetKey = 'bay') {
  const preset = COAT_PRESETS[presetKey] || COAT_PRESETS.bay;

  const coatTex = createCoatPBRTextures();
  const coatMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: coatTex.map,
    bumpMap: coatTex.bumpMap,
    bumpScale: 0.0058,
    roughnessMap: coatTex.roughnessMap,
    roughness: 0.86, // Combined with roughnessMap (~0.70) => ~0.60-0.75 silky horsehair, zero plastic!
    metalness: 0.0,
    sheen: 0.56,
    sheenRoughness: 0.64,
    sheenColor: new THREE.Color(preset.coatSheen),
    clearcoat: 0.0,
    envMapIntensity: 0.34,
  });

  const lidMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(
      preset.muzzleColor[0] * 0.72,
      preset.muzzleColor[1] * 0.68,
      preset.muzzleColor[2] * 0.66,
      THREE.SRGBColorSpace
    ),
    roughness: 0.76,
    metalness: 0.0,
    sheen: 0.18,
    envMapIntensity: 0.35,
  });

  const lashMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a0807,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });

  const irisTex = createEquineIrisTexture();
  const irisMaterial = new THREE.MeshStandardMaterial({
    map: irisTex,
    roughness: 0.14,
    metalness: 0.04,
    envMapIntensity: 1.15,
  });

  const corneaMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.02,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.015,
    ior: 1.44,
    envMapIntensity: 1.9,
    depthWrite: false,
  });

  const hoofTex = createHoofTextures();
  const hoofMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(preset.hoofColor),
    map: hoofTex.map,
    bumpMap: hoofTex.bumpMap,
    bumpScale: 0.0048,
    roughness: 0.44,
    metalness: 0.02,
    clearcoat: 0.14,
    clearcoatRoughness: 0.46,
    envMapIntensity: 0.55,
  });

  const shoeMaterial = new THREE.MeshStandardMaterial({
    color: 0x45484e,
    roughness: 0.40,
    metalness: 0.80,
    envMapIntensity: 0.9,
  });

  const hairTex = createHairCardTextures();
  const hairMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(preset.hairColor),
    vertexColors: true,
    map: hairTex.map,
    alphaMap: hairTex.alphaMap,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
    roughness: 0.80,
    metalness: 0.0,
    specularIntensity: 0.12, // Eliminates bright white dielectric foil glare on dark horsehair!
    specularColor: new THREE.Color(preset.hairSheen),
    sheen: 0.16,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color(preset.hairSheen),
    envMapIntensity: 0.10,
  });

  return {
    coatMaterial,
    lidMaterial,
    lashMaterial,
    irisMaterial,
    corneaMaterial,
    hoofMaterial,
    shoeMaterial,
    hairMaterial,
  };
}

function evalDappleField(x, y, z) {
  // Fine organic dappled-ring network (natural Lipizzaner / Andalusian dappled coat!)
  const s = 24.0;
  const wx = x + Math.sin(y * 11.0 + z * 8.5) * 0.025;
  const wy = y + Math.cos(z * 12.0 + x * 9.5) * 0.025;
  const wz = z + Math.sin(x * 13.0 - y * 10.5) * 0.025;
  const f1 = Math.sin(wx * s) * Math.cos(wy * s) * Math.cos(wz * s * 0.88);
  const f2 = Math.sin(wz * 34.0 + wy * 19.0) * Math.cos(wx * 29.0 - wy * 23.0);
  const ring = Math.abs(f1 * 0.74 + f2 * 0.26);
  return smoothstep(0.14, 0.52, ring);
}

/**
 * Apply seamless 3D anatomical coat pigmentation (properly sRGB->Linear converted!)
 * across the unified body mesh and ears.
 */
export function applyCoatVertexColors(geo, presetKey, earLocalOffset = null) {
  const preset = COAT_PRESETS[presetKey] || COAT_PRESETS.bay;
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const count = posAttr.count;
  const part = geo.userData.part || '';
  const innerMask = geo.userData.innerMask || null;

  let colorAttr = geo.getAttribute('color');
  if (!colorAttr) {
    colorAttr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geo.setAttribute('color', colorAttr);
  }

  const base = preset.baseColor;
  const hi = preset.highlightColor;
  const belly = preset.bellyColor;
  const dorsal = preset.dorsalColor;
  const points = preset.pointsColor;
  const muzzle = preset.muzzleColor;

  const whiteMark = [0.90, 0.89, 0.86];
  const nostrilDark = [0.055, 0.044, 0.042];
  const innerEarPink = [
    base[0] * 0.45 + 0.22,
    base[1] * 0.40 + 0.15,
    base[2] * 0.40 + 0.14,
  ];

  for (let i = 0; i < count; i++) {
    let x = posAttr.getX(i);
    let y = posAttr.getY(i);
    let z = posAttr.getZ(i);
    if (earLocalOffset) {
      x += earLocalOffset.x;
      y += earLocalOffset.y;
      z += earLocalOffset.z;
    }

    const nx = normAttr ? normAttr.getX(i) : 0;
    const ny = normAttr ? normAttr.getY(i) : 1;
    const nz = normAttr ? normAttr.getZ(i) : 0;

    // 1. Rich dorsal-to-ventral anatomical shading in perceptual sRGB space
    const upBias = clamp(ny * 0.5 + 0.5, 0, 1);
    const dorsalMask = smoothstep(1.38, 1.62, y) * smoothstep(0.35, 0.92, ny) * smoothstep(0.65, -0.75, z);
    const bellyMask = smoothstep(1.04, 0.84, y) * smoothstep(0.1, -0.7, ny) * smoothstep(-0.7, -0.35, z) * smoothstep(0.75, 0.35, z);
    const sunlitMuscle = smoothstep(0.18, 0.78, Math.abs(nx)) * smoothstep(0.82, 1.48, y);

    let r = THREE.MathUtils.lerp(base[0], hi[0], sunlitMuscle * 0.52 + upBias * 0.10);
    let g = THREE.MathUtils.lerp(base[1], hi[1], sunlitMuscle * 0.52 + upBias * 0.10);
    let b = THREE.MathUtils.lerp(base[2], hi[2], sunlitMuscle * 0.52 + upBias * 0.10);

    r = THREE.MathUtils.lerp(r, dorsal[0], dorsalMask * 0.65);
    g = THREE.MathUtils.lerp(g, dorsal[1], dorsalMask * 0.65);
    b = THREE.MathUtils.lerp(b, dorsal[2], dorsalMask * 0.65);

    r = THREE.MathUtils.lerp(r, belly[0], bellyMask * 0.45);
    g = THREE.MathUtils.lerp(g, belly[1], bellyMask * 0.45);
    b = THREE.MathUtils.lerp(b, belly[2], bellyMask * 0.45);

    // 2. Organic Dapples (Dapple Gray & subtle Palomino)
    if (preset.dappleStrength > 0.001) {
      const dappleZone = smoothstep(0.88, 1.15, y) * smoothstep(1.85, 1.50, y) * smoothstep(0.85, 0.45, z);
      const dap = evalDappleField(x, y, z);
      const dFactor = preset.dappleStrength * dappleZone;
      const tone = THREE.MathUtils.lerp(1.0 - dFactor * 0.72, 1.0 + dFactor * 0.32, dap);
      r *= tone;
      g *= tone;
      b *= tone;
    }

    // 3. Lower-leg Dark Points (classic Blood Bay / Dapple Gray fading up smoothly over knees & hocks!)
    if (y < 0.74) {
      const pointW = smoothstep(0.74, 0.42, y);
      r = THREE.MathUtils.lerp(r, points[0], pointW);
      g = THREE.MathUtils.lerp(g, points[1], pointW);
      b = THREE.MathUtils.lerp(b, points[2], pointW);
    }

    // 4. White Leg Markings (Socks / Coronets with organic wavy hairline!)
    if (y < 0.48 && part !== 'ear') {
      const isFore = z > 0.0;
      const legKey = isFore ? (x >= 0 ? 'foreL' : 'foreR') : (x >= 0 ? 'hindL' : 'hindR');
      const sockHeight = preset.socks[legKey] || 0;
      if (sockHeight > 0.02) {
        const legCx = x >= 0 ? 0.145 : -0.145;
        const legCz = isFore ? 0.52 : -0.64;
        const ang = Math.atan2(x - legCx, z - legCz);
        const organicWave = Math.sin(ang * 3.0 + (x >= 0 ? 1.1 : -0.7)) * 0.018;
        const sockMask = smoothstep(sockHeight + 0.024 + organicWave, sockHeight - 0.018 + organicWave, y);
        r = THREE.MathUtils.lerp(r, whiteMark[0], sockMask);
        g = THREE.MathUtils.lerp(g, whiteMark[1], sockMask);
        b = THREE.MathUtils.lerp(b, whiteMark[2], sockMask);
      }
    }

    // 5. Head Zone: velvety dark muzzle, recessed dark nostrils, mouth cleft shadow, & white facial markings!
    if (part !== 'ear' && z > 1.08 && y > 1.52) {
      // Soft velvety dark muzzle shading
      const muzzleDist = Math.hypot((y - 1.622) * 1.05, (z - 1.545) * 1.0);
      const muzzleW = smoothstep(0.185, 0.082, muzzleDist);
      r = THREE.MathUtils.lerp(r, muzzle[0], muzzleW * 0.90);
      g = THREE.MathUtils.lerp(g, muzzle[1], muzzleW * 0.90);
      b = THREE.MathUtils.lerp(b, muzzle[2], muzzleW * 0.90);

      // Deep dark shadowed nostril pockets (aligned to V3 nostril position!)
      const nDist = Math.hypot((Math.abs(x) - 0.052) * 1.4, (y - 1.678) * 1.45, (z - 1.526) * 1.25);
      const nostrilW = smoothstep(0.028, 0.013, nDist);
      r = THREE.MathUtils.lerp(r, nostrilDark[0], nostrilW * 0.92);
      g = THREE.MathUtils.lerp(g, nostrilDark[1], nostrilW * 0.92);
      b = THREE.MathUtils.lerp(b, nostrilDark[2], nostrilW * 0.92);

      // Mouth cleft darkening
      const mDist = Math.hypot((y - 1.608) * 1.8, (z - 1.530) * 1.3);
      if (mDist < 0.05 && ny < 0.1) {
        const mw = smoothstep(0.045, 0.015, mDist) * 0.45;
        r *= 1 - mw;
        g *= 1 - mw;
        b *= 1 - mw;
      }

      // Soft warm muzzle/eye-ring mealy warmth on Bay & Chestnut
      if (presetKey === 'bay' || presetKey === 'chestnut') {
        const eyeDist = Math.hypot(Math.abs(x) - 0.088, y - 1.946, z - 1.258);
        const softRing = smoothstep(0.085, 0.032, eyeDist) * 0.24;
        r = THREE.MathUtils.lerp(r, hi[0] * 1.06, softRing);
        g = THREE.MathUtils.lerp(g, hi[1] * 1.06, softRing);
        b = THREE.MathUtils.lerp(b, hi[2] * 1.06, softRing);
      }

      // White Facial Markings (Star, Star+Strip, Blaze, Star+Snip) cleanly along dorsal forehead/nasal bridge!
      if (preset.starStyle !== 'none' && ny > 0.28 && nz > 0.28) {
        let faceWhite = 0;
        const starD = Math.hypot(x / 0.028, (y - 1.976) / 0.036, (z - 1.298) / 0.036);
        if (preset.starStyle === 'smallStar') {
          faceWhite = smoothstep(0.85, 0.45, starD);
        } else if (preset.starStyle === 'starStrip' || preset.starStyle === 'starSnip') {
          const star = smoothstep(1.12, 0.62, starD);
          const stripEnv = smoothstep(1.98, 1.93, y) * smoothstep(1.73, 1.81, y);
          const strip = smoothstep(0.013, 0.005, Math.abs(x)) * stripEnv;
          faceWhite = Math.max(star, strip * 0.90);
          if (preset.starStyle === 'starSnip') {
            const snipD = Math.hypot(x / 0.022, (y - 1.652) / 0.024, (z - 1.545) / 0.024);
            faceWhite = Math.max(faceWhite, smoothstep(1.0, 0.55, snipD) * 0.88);
          }
        } else if (preset.starStyle === 'blaze') {
          const blazeEnv = smoothstep(2.04, 1.98, y) * smoothstep(1.62, 1.68, y);
          const halfW = THREE.MathUtils.lerp(0.032, 0.021, smoothstep(1.98, 1.68, y));
          faceWhite = smoothstep(halfW + 0.008, halfW - 0.006, Math.abs(x)) * blazeEnv;
        }
        r = THREE.MathUtils.lerp(r, whiteMark[0], faceWhite);
        g = THREE.MathUtils.lerp(g, whiteMark[1], faceWhite);
        b = THREE.MathUtils.lerp(b, whiteMark[2], faceWhite);
      }
    }

    // 6. Ear Shading: dark pointed tips + soft pinkish-gray inner ear cavity!
    if (part === 'ear') {
      const localY = posAttr.getY(i);
      const tipW = smoothstep(0.088, 0.165, localY);
      r = THREE.MathUtils.lerp(r, points[0], tipW * 0.82);
      g = THREE.MathUtils.lerp(g, points[1], tipW * 0.82);
      b = THREE.MathUtils.lerp(b, points[2], tipW * 0.82);

      if (innerMask) {
        const inner = innerMask[i];
        r = THREE.MathUtils.lerp(r, innerEarPink[0], inner * 0.72);
        g = THREE.MathUtils.lerp(g, innerEarPink[1], inner * 0.72);
        b = THREE.MathUtils.lerp(b, innerEarPink[2], inner * 0.72);
      }
    }

    // 7. Anatomical Crease Ambient Occlusion (under belly, inner thighs, under jaw, pectoral cleft!)
    let ao = 1.0;
    if (ny < -0.45 && y > 0.76 && y < 1.15 && z > -0.68 && z < 0.65) {
      ao *= THREE.MathUtils.lerp(1.0, 0.76, smoothstep(-0.45, -0.95, ny));
    }
    // Medial inner-leg soft occlusion
    if (y < 0.96 && x * nx < -0.02) {
      ao *= 0.84;
    }
    // Subtle orbital socket shadow right around eyes
    if (part !== 'ear' && z > 1.20 && z < 1.32 && y > 1.90 && y < 1.99) {
      const ed = Math.hypot(Math.abs(x) - 0.088, y - 1.946, z - 1.258);
      ao *= THREE.MathUtils.lerp(0.76, 1.0, smoothstep(0.022, 0.048, ed));
    }

    // Convert final perceptual sRGB -> LINEAR for exact Three.js physically-based lighting!
    colorAttr.setXYZ(
      i,
      srgbToLinear(r * ao),
      srgbToLinear(g * ao),
      srgbToLinear(b * ao)
    );
  }

  colorAttr.needsUpdate = true;
}
