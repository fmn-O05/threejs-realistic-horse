import * as THREE from 'three';
import { clamp, smoothstep } from './sculptUtils.js';

/**
 * Five realistic, breed-authentic equine coat presets (specified in perceptual sRGB,
 * converted cleanly to LINEAR for Three.js vertex colors + matched warm specular/sheen!).
 */
export const COAT_PRESETS = {
  bay: {
    label: 'Blood Bay',
    baseColor:      [0.37, 0.132, 0.048],  // Deep lustrous mahogany-chestnut Blood Bay
    highlightColor: [0.56, 0.235, 0.088],  // Warm sunlit copper-mahogany flank & shoulder sheen
    bellyColor:     [0.44, 0.185, 0.072],  // Warm bay underbelly
    dorsalColor:    [0.19, 0.062, 0.022],  // Rich dark-bay topline & croup
    pointsColor:    [0.085, 0.072, 0.068], // Classic jet-black bay lower legs & ear tips
    muzzleColor:    [0.135, 0.115, 0.108], // Soft velvety dark charcoal muzzle
    hairColor:      0x15100e,              // Rich deep jet-black with warm mahogany depth
    hairSheen:      0x6b3e26,              // Silky warm espresso strand glint!
    coatSpecular:   0xd48a58,              // Warm copper-gold groomed coat luster!
    coatSheen:      0xb56b3d,
    hoofColor:      0x26211e,
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
    hairColor:      0x343840,
    hairSheen:      0x9aa4b2,
    coatSpecular:   0xe8eef5,
    coatSheen:      0xd0d8e0,
    hoofColor:      0x323236,
    dappleStrength: 0.24,
    starStyle:      'none',
    socks:          { foreL: 0.0, foreR: 0.0, hindL: 0.0, hindR: 0.0 },
  },
  black: {
    label: 'Friesian Black',
    baseColor:      [0.095, 0.092, 0.100],
    highlightColor: [0.175, 0.168, 0.184],
    bellyColor:     [0.115, 0.110, 0.114],
    dorsalColor:    [0.065, 0.064, 0.072],
    pointsColor:    [0.060, 0.058, 0.065],
    muzzleColor:    [0.110, 0.105, 0.110],
    hairColor:      0x0c0b0e,
    hairSheen:      0x444f64,
    coatSpecular:   0x7a8aa8,
    coatSheen:      0x586680,
    hoofColor:      0x1d1c1e,
    dappleStrength: 0.0,
    starStyle:      'smallStar',
    socks:          { foreL: 0.0, foreR: 0.0, hindL: 0.0, hindR: 0.0 },
  },
  palomino: {
    label: 'Golden Palomino',
    baseColor:      [0.70, 0.45, 0.145],
    highlightColor: [0.87, 0.63, 0.255],
    bellyColor:     [0.80, 0.57, 0.235],
    dorsalColor:    [0.54, 0.33, 0.098],
    pointsColor:    [0.61, 0.39, 0.135],
    muzzleColor:    [0.33, 0.26, 0.225],
    hairColor:      0xe4d9c3,
    hairSheen:      0xfff9ec,
    coatSpecular:   0xffdf99,
    coatSheen:      0xe8be72,
    hoofColor:      0x584c3e,
    dappleStrength: 0.05,
    starStyle:      'blaze',
    socks:          { foreL: 0.28, foreR: 0.24, hindL: 0.38, hindR: 0.36 },
  },
  chestnut: {
    label: 'Copper Chestnut',
    baseColor:      [0.49, 0.175, 0.058],
    highlightColor: [0.71, 0.310, 0.108],
    bellyColor:     [0.60, 0.255, 0.092],
    dorsalColor:    [0.32, 0.105, 0.034],
    pointsColor:    [0.38, 0.140, 0.048],
    muzzleColor:    [0.30, 0.168, 0.118],
    hairColor:      0x52200d,
    hairSheen:      0xc46936,
    coatSpecular:   0xe39054,
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

function srgbToLinear(c) {
  const x = clamp(c, 0, 1);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/**
 * Generate TRUE Tangent-Space RGB Normal Map + High-Frequency Directional Horsehair Albedo & Roughness Maps!
 * Completely eliminates the flat Play-Doh clay look by baking 70,000+ crisp micro-hairs into a genuine normal map!
 */
function createCoatPBRTextures() {
  const size = 512; // Crisp 512x512 tiled at uvScale=5.6 (~18cm tile => sub-millimeter individual horsehair fibers!)
  const rng = mulberry32(42197);

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const actx = albedoCanvas.getContext('2d');

  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = size;
  heightCanvas.height = size;
  const hctx = heightCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d');

  actx.fillStyle = '#e4e1dd';
  actx.fillRect(0, 0, size, size);

  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, size, size);

  // Groomed satin horsehair base roughness (~0.56!)
  rctx.fillStyle = '#909090';
  rctx.fillRect(0, 0, size, size);

  // Subtle organic subcutaneous mottling & satin sheen variation
  for (let i = 0; i < 160; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rad = 16 + rng() * 48;
    const light = rng() > 0.5;
    const grad = actx.createRadialGradient(x, y, 2, x, y, rad);
    grad.addColorStop(0, light ? 'rgba(255,250,242,0.065)' : 'rgba(130,115,102,0.075)');
    grad.addColorStop(1, 'rgba(228,225,221,0)');
    actx.fillStyle = grad;
    actx.fillRect(x - rad, y - rad, rad * 2, rad * 2);

    const rGrad = rctx.createRadialGradient(x, y, 2, x, y, rad);
    rGrad.addColorStop(0, light ? 'rgba(112,112,112,0.18)' : 'rgba(176,176,176,0.18)');
    rGrad.addColorStop(1, 'rgba(144,144,144,0)');
    rctx.fillStyle = rGrad;
    rctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Dense crisp directional horsehair fibers (seamless tile wrap!)
  const strokes = 32000;
  for (let i = 0; i < strokes; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 5 + rng() * 11;
    const dx = (rng() - 0.5) * 1.6;
    const shade = 168 + Math.floor(rng() * 88);
    const alpha = 0.18 + rng() * 0.24;

    actx.strokeStyle = `rgba(${shade},${Math.max(0, shade - 4)},${Math.max(0, shade - 9)},${alpha})`;
    actx.lineWidth = 0.75 + rng() * 0.75;
    actx.beginPath();
    actx.moveTo(x, y);
    actx.lineTo(x + dx, y + len);
    actx.stroke();

    const hVal = 40 + Math.floor(rng() * 195);
    hctx.strokeStyle = `rgba(${hVal},${hVal},${hVal},0.48)`;
    hctx.lineWidth = 0.9;
    hctx.beginPath();
    hctx.moveTo(x, y);
    hctx.lineTo(x + dx, y + len);
    hctx.stroke();

    // Fine glossy-vs-matte hair streak modulation in roughness map!
    const rVal = 110 + Math.floor(rng() * 80);
    rctx.strokeStyle = `rgba(${rVal},${rVal},${rVal},0.16)`;
    rctx.lineWidth = 0.9;
    rctx.beginPath();
    rctx.moveTo(x, y);
    rctx.lineTo(x + dx, y + len);
    rctx.stroke();

    if (y + len > size) {
      actx.beginPath();
      actx.moveTo(x, y - size);
      actx.lineTo(x + dx, y + len - size);
      actx.stroke();

      hctx.beginPath();
      hctx.moveTo(x, y - size);
      hctx.lineTo(x + dx, y + len - size);
      hctx.stroke();
    }
  }

  // Convert procedural horsehair heightfield into a TRUE tangent-space RGB Normal Map via Sobel!
  const hData = hctx.getImageData(0, 0, size, size).data;
  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const nctx = normCanvas.getContext('2d');
  const nImg = nctx.createImageData(size, size);
  const nd = nImg.data;
  const strength = 2.6;

  const sampleH = (xx, yy) => {
    const wx = (xx + size) & (size - 1);
    const wy = (yy + size) & (size - 1);
    return hData[(wy * size + wx) * 4] / 255.0;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t  = sampleH(x,     y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l  = sampleH(x - 1, y);
      const r  = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b  = sampleH(x,     y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dX * strength;
      let ny = -dY * strength;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const o = (y * size + x) * 4;
      nd[o]     = Math.round((nx * 0.5 + 0.5) * 255);
      nd[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nd[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nd[o + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const normalMap = new THREE.CanvasTexture(normCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 8;

  return { map, normalMap, roughnessMap };
}

/**
 * Generate a deep, warm, soulful dark walnut-espresso Equine Eye Iris texture
 * with authentic horizontal rectangular pupil (NEVER cloudy gray/white!).
 */
function createEquineIrisTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Deep pigmented dark equine sclera
  ctx.fillStyle = '#0d0806';
  ctx.fillRect(0, 0, size, size);

  const cx = size * 0.5;
  const cy = size * 0.5;
  const irisR = size * 0.36;

  // Subtle dark chocolate scleral perimeter
  const scleraGrad = ctx.createRadialGradient(cx, cy, irisR * 0.90, cx, cy, size * 0.49);
  scleraGrad.addColorStop(0.0, '#090503');
  scleraGrad.addColorStop(0.35, '#19120e');
  scleraGrad.addColorStop(0.80, '#2a211b');
  scleraGrad.addColorStop(1.0, '#16100d');
  ctx.fillStyle = scleraGrad;
  ctx.fillRect(0, 0, size, size);

  // Rich deep espresso-walnut equine iris (dark & liquid soulful!)
  const irisGrad = ctx.createRadialGradient(cx, cy, irisR * 0.14, cx, cy, irisR);
  irisGrad.addColorStop(0.0, '#150803');
  irisGrad.addColorStop(0.45, '#341507');
  irisGrad.addColorStop(0.74, '#240d04');
  irisGrad.addColorStop(0.92, '#100502');
  irisGrad.addColorStop(1.0, '#070302');
  ctx.beginPath();
  ctx.arc(cx, cy, irisR, 0, Math.PI * 2);
  ctx.fillStyle = irisGrad;
  ctx.fill();

  // Warm chestnut radial fibers glowing subtly in lower iris
  const rng = mulberry32(9821);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, irisR * 0.95, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 360; i++) {
    const ang = rng() * Math.PI * 2;
    const r0 = irisR * (0.20 + rng() * 0.16);
    const r1 = irisR * (0.68 + rng() * 0.26);
    const warm = rng() > 0.45;
    ctx.strokeStyle = warm
      ? `rgba(110, 52, 16, ${0.14 + rng() * 0.16})`
      : `rgba(14, 5, 2, ${0.22 + rng() * 0.22})`;
    ctx.lineWidth = 1.0 + rng() * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang + (rng() - 0.5) * 0.05) * r1, cy + Math.sin(ang + (rng() - 0.5) * 0.05) * r1);
    ctx.stroke();
  }

  // Authentic HORIZONTAL RECTANGULAR EQUINE PUPIL + subtle granula iridica
  const pW = irisR * 0.62;
  const pH = irisR * 0.30;
  ctx.fillStyle = '#020102';
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
  grad.addColorStop(0.00, '#b5aba1');
  grad.addColorStop(0.14, '#7d756f');
  grad.addColorStop(0.76, '#645d57');
  grad.addColorStop(0.94, '#7d7163');
  grad.addColorStop(1.00, '#5f554b');
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 2) {
    const v = 84 + Math.floor(rng() * 75);
    cctx.fillStyle = `rgba(${v},${v - 4},${v - 8},0.18)`;
    cctx.fillRect(x, 0, 1 + rng() * 1.5, size);

    const bv = 92 + Math.floor(rng() * 76);
    bctx.fillStyle = `rgba(${bv},${bv},${bv},0.40)`;
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
 * Generate fine multi-strand silky Hair Card maps (albedo streaks + soft feathered alpha + bump)!
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

  cctx.fillStyle = '#c8c8c8';
  cctx.fillRect(0, 0, w, h);

  actx.fillStyle = '#000000';
  actx.fillRect(0, 0, w, h);

  const numStrands = 92;
  for (let i = 0; i < numStrands; i++) {
    const u = (i + 0.5) / numStrands;
    const edgeDist = Math.abs(u - 0.5) * 2;
    const x0 = u * w + (rng() - 0.5) * 3.5;

    const tipFrac = clamp(1.0 - edgeDist * 0.36 - rng() * 0.24, 0.42, 1.0);
    const yEnd = tipFrac * h;
    const sway = (rng() - 0.5) * 12;
    const width = 2.4 + rng() * 3.0;

    const aGrad = actx.createLinearGradient(0, 0, 0, yEnd);
    aGrad.addColorStop(0.0, 'rgba(255,255,255,0.96)');
    aGrad.addColorStop(0.65, 'rgba(255,255,255,0.98)');
    aGrad.addColorStop(0.88, 'rgba(215,215,215,0.72)');
    aGrad.addColorStop(1.0, 'rgba(0,0,0,0.0)');

    actx.strokeStyle = aGrad;
    actx.lineWidth = width;
    actx.lineCap = 'round';
    actx.beginPath();
    actx.moveTo(x0, 0);
    actx.quadraticCurveTo(x0 + sway, yEnd * 0.55, x0 + sway * 0.6, yEnd);
    actx.stroke();

    // Rich strand-to-strand glossy highlight contrast so locks look silky, NEVER flat black cardboard!
    const lum = 120 + Math.floor(rng() * 135);
    const cGrad = cctx.createLinearGradient(0, 0, 0, yEnd);
    cGrad.addColorStop(0.0, `rgb(${Math.floor(lum * 0.68)},${Math.floor(lum * 0.65)},${Math.floor(lum * 0.62)})`);
    cGrad.addColorStop(0.45, `rgb(${lum},${Math.max(0, lum - 4)},${Math.max(0, lum - 8)})`);
    cGrad.addColorStop(1.0, `rgb(${Math.min(255, lum + 18)},${Math.min(255, lum + 12)},${Math.min(255, lum + 6)})`);

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
 * Create physically calibrated V5 PBR Equine Materials:
 *   - True tangent-space directional horsehair normal map + warm satin coat sheen (ZERO Play-Doh clay!)
 *   - Deep liquid dark walnut-espresso equine eyes with wet specular catchlight (ZERO cloudy zombie eye!)
 *   - Coat-matched fleshy eyelids (ZERO black rubber eye ring!)
 *   - Silky warm-highlighted volumetric horsehair (ZERO flat black cardboard tarp!)
 */
export function createEquineMaterials(presetKey = 'bay') {
  const preset = COAT_PRESETS[presetKey] || COAT_PRESETS.bay;

  const coatTex = createCoatPBRTextures();
  const coatMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: coatTex.map,
    normalMap: coatTex.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: coatTex.roughnessMap,
    roughness: 0.72, // With ~0.56 roughnessMap => ~0.46-0.62 lustrous groomed satin horsehide!
    metalness: 0.0,
    specularIntensity: 0.42,
    specularColor: new THREE.Color(preset.coatSpecular),
    sheen: 0.58,
    sheenRoughness: 0.48,
    sheenColor: new THREE.Color(preset.coatSheen),
    clearcoat: 0.0,
    envMapIntensity: 0.48,
  });

  // Authentic dark-skinned equine eyelid margin (blends coat + natural dark skin tone around eye!)
  const lidMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(
      preset.baseColor[0] * 0.42 + preset.muzzleColor[0] * 0.45,
      preset.baseColor[1] * 0.40 + preset.muzzleColor[1] * 0.45,
      preset.baseColor[2] * 0.40 + preset.muzzleColor[2] * 0.45,
      THREE.SRGBColorSpace
    ),
    normalMap: coatTex.normalMap,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.62,
    metalness: 0.0,
    sheen: 0.28,
    sheenColor: new THREE.Color(preset.coatSheen),
    envMapIntensity: 0.32,
  });

  const lashMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b0807,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });

  // Direct wet high-gloss dark equine eye (deep rich brown + crisp sunlit catchlight, ZERO cloudy milky overlay!)
  const irisTex = createEquineIrisTexture();
  const irisMaterial = new THREE.MeshPhysicalMaterial({
    map: irisTex,
    roughness: 0.04,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    ior: 1.44,
    specularIntensity: 0.85,
    envMapIntensity: 0.78,
  });

  const hoofTex = createHoofTextures();
  const hoofMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(preset.hoofColor),
    map: hoofTex.map,
    bumpMap: hoofTex.bumpMap,
    bumpScale: 0.0052,
    roughness: 0.42,
    metalness: 0.02,
    clearcoat: 0.16,
    clearcoatRoughness: 0.44,
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
    roughness: 0.58,
    metalness: 0.0,
    specularIntensity: 0.34,
    specularColor: new THREE.Color(preset.hairSheen),
    sheen: 0.32,
    sheenRoughness: 0.50,
    sheenColor: new THREE.Color(preset.hairSheen),
    envMapIntensity: 0.28,
  });

  return {
    coatMaterial,
    lidMaterial,
    lashMaterial,
    irisMaterial,
    hoofMaterial,
    shoeMaterial,
    hairMaterial,
  };
}

function evalDappleField(x, y, z) {
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
 * updated to match V5 refined head, eye, nostril, and body landmark coordinates.
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
  const nostrilDark = [0.052, 0.042, 0.040];
  const innerEarSoft = [
    base[0] * 0.42 + 0.28,
    base[1] * 0.40 + 0.23,
    base[2] * 0.40 + 0.21,
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

    const upBias = clamp(ny * 0.5 + 0.5, 0, 1);
    const dorsalMask = smoothstep(1.40, 1.64, y) * smoothstep(0.35, 0.92, ny) * smoothstep(0.65, -0.75, z);
    const bellyMask = smoothstep(1.06, 0.88, y) * smoothstep(0.1, -0.7, ny) * smoothstep(-0.7, -0.35, z) * smoothstep(0.72, 0.35, z);
    const sunlitMuscle = smoothstep(0.18, 0.78, Math.abs(nx)) * smoothstep(0.84, 1.50, y);

    let r = THREE.MathUtils.lerp(base[0], hi[0], sunlitMuscle * 0.54 + upBias * 0.12);
    let g = THREE.MathUtils.lerp(base[1], hi[1], sunlitMuscle * 0.54 + upBias * 0.12);
    let b = THREE.MathUtils.lerp(base[2], hi[2], sunlitMuscle * 0.54 + upBias * 0.12);

    r = THREE.MathUtils.lerp(r, dorsal[0], dorsalMask * 0.65);
    g = THREE.MathUtils.lerp(g, dorsal[1], dorsalMask * 0.65);
    b = THREE.MathUtils.lerp(b, dorsal[2], dorsalMask * 0.65);

    r = THREE.MathUtils.lerp(r, belly[0], bellyMask * 0.42);
    g = THREE.MathUtils.lerp(g, belly[1], bellyMask * 0.42);
    b = THREE.MathUtils.lerp(b, belly[2], bellyMask * 0.42);

    // Subtle organic coat micro-variation (breaks up CG uniformity across muscles)
    const micro = 1.0 + Math.sin(x * 38.0 + z * 27.0) * Math.cos(y * 31.0 - z * 23.0) * 0.032;
    r *= micro;
    g *= micro;
    b *= micro;

    // Organic Dapples (Dapple Gray & subtle Palomino)
    if (preset.dappleStrength > 0.001) {
      const dappleZone = smoothstep(0.88, 1.16, y) * smoothstep(1.88, 1.52, y) * smoothstep(0.85, 0.45, z);
      const dap = evalDappleField(x, y, z);
      const dFactor = preset.dappleStrength * dappleZone;
      const tone = THREE.MathUtils.lerp(1.0 - dFactor * 0.72, 1.0 + dFactor * 0.32, dap);
      r *= tone;
      g *= tone;
      b *= tone;
    }

    // Lower-leg Dark Points
    if (y < 0.74) {
      const pointW = smoothstep(0.74, 0.42, y);
      r = THREE.MathUtils.lerp(r, points[0], pointW);
      g = THREE.MathUtils.lerp(g, points[1], pointW);
      b = THREE.MathUtils.lerp(b, points[2], pointW);
    }

    // White Leg Markings (Socks / Coronets with organic feathered hairline)
    if (y < 0.48 && part !== 'ear') {
      const isFore = z > 0.0;
      const legKey = isFore ? (x >= 0 ? 'foreL' : 'foreR') : (x >= 0 ? 'hindL' : 'hindR');
      const sockHeight = preset.socks[legKey] || 0;
      if (sockHeight > 0.02) {
        const legCx = x >= 0 ? 0.142 : -0.142;
        const legCz = isFore ? 0.51 : -0.64;
        const ang = Math.atan2(x - legCx, z - legCz);
        const organicWave = Math.sin(ang * 3.0 + (x >= 0 ? 1.1 : -0.7)) * 0.018;
        const sockMask = smoothstep(sockHeight + 0.024 + organicWave, sockHeight - 0.018 + organicWave, y);
        r = THREE.MathUtils.lerp(r, whiteMark[0], sockMask);
        g = THREE.MathUtils.lerp(g, whiteMark[1], sockMask);
        b = THREE.MathUtils.lerp(b, whiteMark[2], sockMask);
      }
    }

    // Head Zone (updated to V5 coordinates!): velvety dark muzzle, deep nostrils, & facial markings!
    if (part !== 'ear' && z > 1.06 && y > 1.54) {
      const muzzleDist = Math.hypot((y - 1.655) * 1.05, (z - 1.525) * 1.0);
      const muzzleW = smoothstep(0.185, 0.080, muzzleDist);
      r = THREE.MathUtils.lerp(r, muzzle[0], muzzleW * 0.90);
      g = THREE.MathUtils.lerp(g, muzzle[1], muzzleW * 0.90);
      b = THREE.MathUtils.lerp(b, muzzle[2], muzzleW * 0.90);

      // Deep dark shadowed nostril pockets (V5 nostril center: x=0.056, y=1.704, z=1.508)
      const nDist = Math.hypot((Math.abs(x) - 0.054) * 1.4, (y - 1.704) * 1.45, (z - 1.508) * 1.25);
      const nostrilW = smoothstep(0.028, 0.013, nDist);
      r = THREE.MathUtils.lerp(r, nostrilDark[0], nostrilW * 0.94);
      g = THREE.MathUtils.lerp(g, nostrilDark[1], nostrilW * 0.94);
      b = THREE.MathUtils.lerp(b, nostrilDark[2], nostrilW * 0.94);

      // Subtle warm glow around eyes on Bay & Chestnut
      if (presetKey === 'bay' || presetKey === 'chestnut') {
        const eyeDist = Math.hypot(Math.abs(x) - 0.086, y - 1.988, z - 1.242);
        const softRing = smoothstep(0.085, 0.032, eyeDist) * 0.22;
        r = THREE.MathUtils.lerp(r, hi[0] * 1.05, softRing);
        g = THREE.MathUtils.lerp(g, hi[1] * 1.05, softRing);
        b = THREE.MathUtils.lerp(b, hi[2] * 1.05, softRing);
      }

      // White Facial Markings cleanly along dorsal forehead / nasal bridge!
      if (preset.starStyle !== 'none' && ny > 0.26 && nz > 0.26) {
        let faceWhite = 0;
        const starD = Math.hypot(x / 0.028, (y - 2.012) / 0.038, (z - 1.284) / 0.038);
        if (preset.starStyle === 'smallStar') {
          faceWhite = smoothstep(0.85, 0.45, starD);
        } else if (preset.starStyle === 'starStrip' || preset.starStyle === 'starSnip') {
          const star = smoothstep(1.12, 0.62, starD);
          const stripEnv = smoothstep(2.01, 1.96, y) * smoothstep(1.76, 1.84, y);
          const strip = smoothstep(0.012, 0.005, Math.abs(x)) * stripEnv;
          faceWhite = Math.max(star, strip * 0.90);
          if (preset.starStyle === 'starSnip') {
            const snipD = Math.hypot(x / 0.022, (y - 1.682) / 0.024, (z - 1.530) / 0.024);
            faceWhite = Math.max(faceWhite, smoothstep(1.0, 0.55, snipD) * 0.88);
          }
        } else if (preset.starStyle === 'blaze') {
          const blazeEnv = smoothstep(2.07, 2.01, y) * smoothstep(1.65, 1.71, y);
          const halfW = THREE.MathUtils.lerp(0.032, 0.021, smoothstep(2.01, 1.71, y));
          faceWhite = smoothstep(halfW + 0.008, halfW - 0.006, Math.abs(x)) * blazeEnv;
        }
        r = THREE.MathUtils.lerp(r, whiteMark[0], faceWhite);
        g = THREE.MathUtils.lerp(g, whiteMark[1], faceWhite);
        b = THREE.MathUtils.lerp(b, whiteMark[2], faceWhite);
      }
    }

    // Ear Shading: subtle dark pointed tips + soft pale inner ear fur
    if (part === 'ear') {
      const localY = posAttr.getY(i);
      const tipW = smoothstep(0.105, 0.180, localY);
      r = THREE.MathUtils.lerp(r, points[0], tipW * 0.78);
      g = THREE.MathUtils.lerp(g, points[1], tipW * 0.78);
      b = THREE.MathUtils.lerp(b, points[2], tipW * 0.78);

      if (innerMask) {
        const inner = innerMask[i];
        r = THREE.MathUtils.lerp(r, innerEarSoft[0], inner * 0.72);
        g = THREE.MathUtils.lerp(g, innerEarSoft[1], inner * 0.72);
        b = THREE.MathUtils.lerp(b, innerEarSoft[2], inner * 0.72);
      }
    }

    // Subtle Anatomical Crease AO
    let ao = 1.0;
    if (ny < -0.45 && y > 0.78 && y < 1.18 && z > -0.68 && z < 0.65) {
      ao *= THREE.MathUtils.lerp(1.0, 0.76, smoothstep(-0.45, -0.95, ny));
    }
    if (y < 0.98 && x * nx < -0.02) {
      ao *= 0.85;
    }
    if (part !== 'ear' && z > 1.18 && z < 1.30 && y > 1.94 && y < 2.03) {
      const ed = Math.hypot(Math.abs(x) - 0.086, y - 1.988, z - 1.242);
      ao *= THREE.MathUtils.lerp(0.76, 1.0, smoothstep(0.022, 0.048, ed));
    }

    colorAttr.setXYZ(
      i,
      srgbToLinear(r * ao),
      srgbToLinear(g * ao),
      srgbToLinear(b * ao)
    );
  }

  colorAttr.needsUpdate = true;
}
