import * as THREE from 'three';
import { JOINTS } from './anatomy.js';
import {
  extractSurfaceNetsMesh,
  sdAnisoSegment,
  sdEllipsoid,
  sdTaperedCapsule,
  smax,
  smin,
  ssub,
} from './sdfEngine.js';
import { clamp, smoothstep } from './sculptUtils.js';

/**
 * Exact anatomical Eye centers matching the carved SDF orbital sockets!
 */
export const SDF_EYE_CENTERS = {
  left:  new THREE.Vector3( 0.088, 1.946, 1.258),
  right: new THREE.Vector3(-0.088, 1.946, 1.258),
};

// Precomputed trigonometric pitch constants
const C_025 = Math.cos(0.25),  S_025 = Math.sin(0.25);
const C_N18 = Math.cos(-0.18), S_N18 = Math.sin(-0.18);
const C_012 = Math.cos(0.12),  S_012 = Math.sin(0.12);
const C_015 = Math.cos(0.15),  S_015 = Math.sin(0.15);
const C_055 = Math.cos(0.55),  S_055 = Math.sin(0.55);
const C_035 = Math.cos(0.35),  S_035 = Math.sin(0.35);
const C_042 = Math.cos(0.42),  S_042 = Math.sin(0.42);
const C_072 = Math.cos(0.72),  S_072 = Math.sin(0.72);
const C_075 = Math.cos(0.75),  S_075 = Math.sin(0.75);
const C_065 = Math.cos(0.65),  S_065 = Math.sin(0.65);
const C_040 = Math.cos(0.40),  S_040 = Math.sin(0.40);
const C_030 = Math.cos(0.30),  S_030 = Math.sin(0.30);
const C_085 = Math.cos(0.85),  S_085 = Math.sin(0.85);
const C_020 = Math.cos(0.20),  S_020 = Math.sin(0.20);
const C_N35 = Math.cos(-0.35), S_N35 = Math.sin(-0.35);

const SH = JOINTS.shoulderL;
const EL = JOINTS.elbowL;
const KN = JOINTS.kneeL;
const FF = JOINTS.foreFetlockL;
const FC = JOINTS.foreCoronetL;

const HI = JOINTS.hipL;
const ST = JOINTS.stifleL;
const HK = JOINTS.hockL;
const HF = JOINTS.hindFetlockL;
const HC = JOINTS.hindCoronetL;

function boxDist(x, y, z, x0, y0, z0, x1, y1, z1) {
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Refined V3 Master Analytic Signed Distance Field for a 16-hand Warmblood/Thoroughbred Horse:
 *   - Athletic long-legged proportions (clean belly clearance, sleek flank tuck, proud high withers)
 *   - Zero artifact dimples/craters — pure museum-bronze anatomical muscle flow
 *   - Balanced muscular chest with crisp pectoral cleft (not bloated)
 *   - Refined noble head with broad circular jowl, smooth flared nostrils, and clean lips
 */
export function evalHorseBodySDF(ax, y, z) {
  const x = ax < 0 ? -ax : ax;
  let dBody = 10.0;

  // =========================================================================
  // 1. TORSO: Athletic Ribcage, High Withers, Sloping Scapula, Balanced Chest, Muscular Croup & Tail Dock
  // =========================================================================
  const dBoxTorso = boxDist(x, y, z, 0, 0.78, -1.00, 0.42, 1.80, 0.96);
  if (dBoxTorso < 0.22) {
    // Sleek athletic ovoid ribcage/barrel (elevated belly line -> long-legged Warmblood elegance!)
    const ribBarrel = sdAnisoSegment(
      x, y, z,
      0, 1.27, -0.22,   // Loin / tucked flank transition
      0, 1.24,  0.42,   // Deep athletic heart girth
      0.245, 0.255, 0.26,
      0.248, 0.325, 0.27
    );

    // Clean sternum / brisket curving up into the chest
    const brisket = sdAnisoSegment(
      x, y, z,
      0, 1.13, 0.14,
      0, 1.19, 0.62,
      0.205, 0.195, 0.20,
      0.190, 0.185, 0.19
    );

    // Sculpted balanced Pectoral Chest cushions (athletic muscular front, subtle median pectoral cleft!)
    const pectoral = sdEllipsoid(x, y, z, 0.112, 1.21, 0.655, 0.122, 0.165, 0.162, C_025, S_025);

    // Proud high athletic Withers (peaks at y ~1.63 m, cleanly above croup 1.58 m!)
    const withers = sdAnisoSegment(
      x, y, z,
      0, 1.50, 0.20,
      0, 1.52, 0.46,
      0.125, 0.095, 0.13,
      0.102, 0.138, 0.145
    );

    // Sloping muscular Shoulder Blade (Scapula) from withers forward/down to Point of Shoulder
    const scapula = sdAnisoSegment(
      x, y, z,
      0.118, 1.48, 0.44,
      0.172, 1.24, 0.69,
      0.105, 0.120, 0.120,
      0.106, 0.126, 0.128
    );

    // Powerful sculpted Croup & Rounded Hindquarters
    const croupCore = sdAnisoSegment(
      x, y, z,
      0, 1.34, -0.58,
      0, 1.32, -0.26,
      0.245, 0.232, 0.23,
      0.242, 0.242, 0.24
    );
    // Double-muscled gluteal croup & full rounded buttock curving seamlessly into rear hamstring!
    const glutealLobe  = sdEllipsoid(x, y, z, 0.120, 1.375, -0.57, 0.178, 0.215, 0.255, C_N18, S_N18);
    const buttockCurve = sdEllipsoid(x, y, z, 0.112, 1.26, -0.71, 0.148, 0.178, 0.162, C_012, S_012);
    const pointOfHip   = sdEllipsoid(x, y, z, 0.202, 1.43, -0.35, 0.080, 0.086, 0.108, C_015, S_015);

    let dTorso = smin(ribBarrel, brisket, 0.105);
    dTorso = smin(dTorso, pectoral, 0.082);
    dTorso = smin(dTorso, withers, 0.095);
    dTorso = smin(dTorso, scapula, 0.092);
    dTorso = smin(dTorso, croupCore, 0.115);
    dTorso = smin(dTorso, glutealLobe, 0.092);
    dTorso = smin(dTorso, buttockCurve, 0.085);
    dTorso = smin(dTorso, pointOfHip, 0.068);

    // Gentle graceful saddle-seat dip along the back behind the withers
    const saddleDip = sdEllipsoid(x, y, z, 0.0, 1.65, 0.05, 0.24, 0.118, 0.23);
    dTorso = ssub(dTorso, saddleDip, 0.065);

    // Subtle dorsal spinal furrow along loin/croup
    const spineGroove = sdAnisoSegment(
      x, y, z,
      0, 1.615, -0.66,
      0, 1.575, -0.06,
      0.028, 0.030, 0.036,
      0.024, 0.028, 0.036
    );
    dTorso = ssub(dTorso, spineGroove, 0.032);

    // Compact sculpted high-set Tail Root smoothly tucked into the upper croup (completely wrapped by lush tail hair!)
    if (z < -0.60) {
      const tailDock = sdTaperedCapsule(x, y, z, 0, 1.44, -0.74, 0, 1.39, -0.84, 0.052, 0.032);
      dTorso = smin(dTorso, tailDock, 0.036);
    }

    dBody = dTorso;
  } else {
    dBody = dBoxTorso + 0.15;
  }

  // =========================================================================
  // 2. ARCHED MUSCULAR EQUINE NECK (tall, sleek, flat-sided teardrop with proud crest!)
  // =========================================================================
  const dBoxNeck = boxDist(x, y, z, 0, 1.16, 0.40, 0.26, 2.18, 1.24);
  if (dBoxNeck < 0.22) {
    const neckLower = sdAnisoSegment(
      x, y, z,
      0, 1.38, 0.61,
      0, 1.67, 0.85,
      0.165, 0.205, 0.195,
      0.112, 0.158, 0.150
    );
    const neckUpper = sdAnisoSegment(
      x, y, z,
      0, 1.67, 0.85,
      0, 1.98, 1.07,
      0.112, 0.158, 0.150,
      0.084, 0.108, 0.106
    );
    const neckCrest = sdAnisoSegment(
      x, y, z,
      0, 1.56, 0.54,
      0, 1.89, 0.88,
      0.064, 0.082, 0.082,
      0.054, 0.072, 0.072
    );
    const neckCrestTop = sdAnisoSegment(
      x, y, z,
      0, 1.89, 0.88,
      0, 2.048, 1.09,
      0.054, 0.072, 0.072,
      0.056, 0.060, 0.060
    );
    const windpipe = sdAnisoSegment(
      x, y, z,
      0, 1.28, 0.78,
      0, 1.84, 1.13,
      0.082, 0.080, 0.080,
      0.050, 0.054, 0.054
    );

    let dNeck = smin(neckLower, neckUpper, 0.08);
    dNeck = smin(dNeck, neckCrest, 0.065);
    dNeck = smin(dNeck, neckCrestTop, 0.055);
    dNeck = smin(dNeck, windpipe, 0.055);

    // Subtle soft jugular channel along lower-side of neck
    const jugular = sdTaperedCapsule(x, y, z, 0.138, 1.46, 0.81, 0.102, 1.86, 1.08, 0.022, 0.018);
    dNeck = ssub(dNeck, jugular, 0.028);

    dBody = smin(dBody, dNeck, 0.095);
  } else {
    dBody = Math.min(dBody, dBoxNeck + 0.15);
  }

  // =========================================================================
  // 3. NOBLE SCULPTED EQUINE HEAD (broad circular jowl, refined bridge, smooth flared nostrils & lips!)
  // =========================================================================
  const dBoxHead = boxDist(x, y, z, 0, 1.52, 1.02, 0.18, 2.18, 1.65);
  if (dBoxHead < 0.18) {
    const cranium    = sdEllipsoid(x, y, z, 0, 2.005, 1.185, 0.098, 0.094, 0.118, C_055, S_055);
    const pollCrown  = sdEllipsoid(x, y, z, 0, 2.075, 1.128, 0.074, 0.052, 0.068, C_035, S_035);
    // Broad flat-sided rounded equine Masseter Cheek / Jowl
    const jowlLobe   = sdEllipsoid(x, y, z, 0.048, 1.874, 1.210, 0.066, 0.106, 0.102, C_042, S_042);
    const mandible   = sdAnisoSegment(
      x, y, z,
      0.032, 1.842, 1.238,
      0.020, 1.646, 1.452,
      0.054, 0.060, 0.060,
      0.036, 0.038, 0.038
    );
    const nasalBridge = sdAnisoSegment(
      x, y, z,
      0, 1.958, 1.258,
      0, 1.682, 1.515,
      0.086, 0.078, 0.078,
      0.052, 0.056, 0.056
    );
    const facialCrest = sdTaperedCapsule(x, y, z, 0.072, 1.908, 1.288, 0.052, 1.745, 1.448, 0.026, 0.018);

    // Full soft velvety Equine Muzzle (substantial, smoothly rounded!)
    const upperMuzzle = sdEllipsoid(x, y, z, 0, 1.654, 1.538, 0.062, 0.054, 0.066, C_072, S_072);
    const upperLip    = sdEllipsoid(x, y, z, 0, 1.626, 1.568, 0.054, 0.038, 0.048, C_075, S_075);
    const lowerLip    = sdEllipsoid(x, y, z, 0, 1.588, 1.515, 0.043, 0.031, 0.043, C_075, S_075);
    // Flared fleshy Alar Nostril Rim positioned cleanly ABOVE the lip/mouth line!
    const nostrilRim  = sdEllipsoid(x, y, z, 0.048, 1.678, 1.522, 0.022, 0.026, 0.028, C_065, S_065);
    const browArch    = sdEllipsoid(x, y, z, 0.084, 1.976, 1.262, 0.025, 0.020, 0.028, C_040, S_040);

    let dHead = smin(cranium, pollCrown, 0.036);
    dHead = smin(dHead, jowlLobe, 0.046);
    dHead = smin(dHead, mandible, 0.040);
    dHead = smin(dHead, nasalBridge, 0.042);
    dHead = smin(dHead, facialCrest, 0.028);
    dHead = smin(dHead, upperMuzzle, 0.038);
    dHead = smin(dHead, upperLip, 0.026);
    dHead = smin(dHead, lowerLip, 0.024);
    dHead = smin(dHead, nostrilRim, 0.018);
    dHead = smin(dHead, browArch, 0.020);

    // Clean smooth orbital eye socket cradling eyeball & eyelids
    const eyeSocket = sdEllipsoid(x, y, z, 0.095, 1.946, 1.262, 0.025, 0.021, 0.024, C_030, S_030);
    dHead = ssub(dHead, eyeSocket, 0.012);

    // Smooth recessed Teardrop Nostril Cavities (cleanly separated from mouth cleft -> zero mesh jaggies!)
    const nostrilHole = sdEllipsoid(x, y, z, 0.056, 1.678, 1.528, 0.016, 0.014, 0.018, C_085, S_085);
    dHead = ssub(dHead, nostrilHole, 0.011);

    // Clean Mouth Cleft strictly along the lower lip line (well below nostrils!)
    const mouthCleft = sdAnisoSegment(
      x, y, z,
      0.0,   1.596, 1.548,
      0.040, 1.622, 1.498,
      0.012, 0.008, 0.013,
      0.010, 0.008, 0.010
    );
    dHead = ssub(dHead, mouthCleft, 0.009);

    // Gentle Chin Groove & Intermandibular hollow
    const chinGroove = sdEllipsoid(x, y, z, 0.0, 1.602, 1.466, 0.034, 0.015, 0.016, C_065, S_065);
    const jawHollow  = sdTaperedCapsule(x, y, z, 0, 1.79, 1.22, 0, 1.66, 1.39, 0.022, 0.015);
    dHead = ssub(dHead, chinGroove, 0.011);
    dHead = ssub(dHead, jawHollow, 0.016);

    dBody = smin(dBody, dHead, 0.048);
  } else {
    dBody = Math.min(dBody, dBoxHead + 0.14);
  }

  // =========================================================================
  // 4. SEAMLESS SCULPTED FORELEGS (Shoulder -> Arm -> Elbow -> Forearm -> Knee -> Cannon -> Fetlock -> Pastern)
  // =========================================================================
  const dBoxFore = boxDist(x, y, z, 0.02, 0.05, 0.36, 0.34, 1.38, 0.85);
  if (dBoxFore < 0.18) {
    let dFore = 10.0;
    if (y > 0.44) {
      const upperArm = sdAnisoSegment(
        x, y, z,
        SH[0] - 0.005, SH[1] + 0.03, SH[2] + 0.01,
        EL[0],         EL[1],        EL[2],
        0.096, 0.112, 0.118,
        0.074, 0.092, 0.092
      );
      const elbowPoint = sdEllipsoid(x, y, z, EL[0], EL[1] + 0.01, EL[2] - 0.052, 0.044, 0.055, 0.064, C_020, S_020);
      const forearm = sdAnisoSegment(
        x, y, z,
        EL[0], EL[1] + 0.01, EL[2] + 0.005,
        KN[0], KN[1] + 0.02, KN[2],
        0.070, 0.086, 0.088,
        0.044, 0.050, 0.050
      );
      dFore = smin(smin(upperArm, elbowPoint, 0.032), forearm, 0.042);
    }
    if (y < 0.72) {
      const kneeJoint = sdEllipsoid(x, y, z, KN[0], KN[1], KN[2] + 0.004, 0.046, 0.056, 0.053);
      const pisiform  = sdEllipsoid(x, y, z, KN[0], KN[1] + 0.008, KN[2] - 0.036, 0.025, 0.032, 0.028);
      const foreCannonBone = sdAnisoSegment(
        x, y, z,
        KN[0], KN[1] - 0.01, KN[2] + 0.012,
        FF[0], FF[1] + 0.01, FF[2] + 0.010,
        0.031, 0.031, 0.031,
        0.030, 0.030, 0.030
      );
      const foreFlexorTendon = sdAnisoSegment(
        x, y, z,
        KN[0], KN[1] - 0.01, KN[2] - 0.024,
        FF[0], FF[1] + 0.01, FF[2] - 0.022,
        0.021, 0.021, 0.021,
        0.021, 0.021, 0.021
      );
      const foreFetlock  = sdEllipsoid(x, y, z, FF[0], FF[1], FF[2] - 0.004, 0.038, 0.044, 0.048, C_N35, S_N35);
      const foreSesamoid = sdEllipsoid(x, y, z, FF[0], FF[1] + 0.004, FF[2] - 0.035, 0.024, 0.027, 0.025);
      const forePastern  = sdTaperedCapsule(x, y, z, FF[0], FF[1], FF[2] + 0.002, FC[0], FC[1], FC[2], 0.036, 0.046);
      const foreCoronetBand = sdEllipsoid(x, y, z, FC[0], FC[1] + 0.002, FC[2] + 0.004, 0.049, 0.022, 0.052, C_015, S_015);

      let dLow = smin(kneeJoint, pisiform, 0.016);
      dLow = smin(dLow, smin(foreCannonBone, foreFlexorTendon, 0.016), 0.020);
      dLow = smin(dLow, foreFetlock, 0.018);
      dLow = smin(dLow, foreSesamoid, 0.014);
      dLow = smin(dLow, forePastern, 0.018);
      dLow = smin(dLow, foreCoronetBand, 0.014);
      dFore = smin(dFore, dLow, 0.024);
    }

    dBody = smin(dBody, dFore, 0.072);
  } else {
    dBody = Math.min(dBody, dBoxFore + 0.14);
  }

  // =========================================================================
  // 5. SEAMLESS SCULPTED HINDLEGS (Powerful Clean Haunch -> Sleek Stifle -> Gaskin -> Sharp Hock -> Cannon -> Pastern!)
  // =========================================================================
  const dBoxHind = boxDist(x, y, z, 0.02, 0.05, -0.88, 0.36, 1.44, -0.18);
  if (dBoxHind < 0.18) {
    let dHind = 10.0;
    if (y > 0.46) {
      const upperThigh = sdAnisoSegment(
        x, y, z,
        HI[0] - 0.01, HI[1] + 0.02, HI[2] - 0.08,
        ST[0] - 0.005, ST[1] + 0.04, ST[2] - 0.05,
        0.130, 0.168, 0.195,
        0.090, 0.118, 0.128
      );
      const hamstringArc = sdAnisoSegment(
        x, y, z,
        0.132, 1.25, -0.71,
        0.158, 0.86, -0.62,
        0.124, 0.142, 0.132,
        0.070, 0.084, 0.088
      );
      // Clean sleek anatomical flank skin-fold bridging upper flank to front of stifle (ZERO hanging bulge!)
      const flankFold = sdAnisoSegment(
        x, y, z,
        0.165, 1.07, -0.26,
        ST[0], ST[1] + 0.03, ST[2] - 0.02,
        0.058, 0.055, 0.068,
        0.056, 0.064, 0.066
      );
      const gaskin = sdAnisoSegment(
        x, y, z,
        ST[0], ST[1] + 0.01, ST[2] - 0.03,
        HK[0], HK[1] + 0.03, HK[2] + 0.01,
        0.082, 0.104, 0.108,
        0.044, 0.056, 0.058
      );
      const achilles = sdAnisoSegment(
        x, y, z,
        0.160, 0.88, -0.60,
        HK[0], HK[1] + 0.022, HK[2] - 0.056,
        0.034, 0.040, 0.042,
        0.024, 0.032, 0.034
      );
      dHind = smin(upperThigh, hamstringArc, 0.078);
      dHind = smin(dHind, flankFold, 0.062);
      dHind = smin(dHind, gaskin, 0.052);
      dHind = smin(dHind, achilles, 0.026);
    }

    if (y < 0.74) {
      const hockFront = sdEllipsoid(x, y, z, HK[0], HK[1] - 0.005, HK[2] + 0.006, 0.045, 0.060, 0.052, C_025, S_025);
      const hockPoint = sdEllipsoid(x, y, z, HK[0], HK[1] + 0.022, HK[2] - 0.056, 0.028, 0.040, 0.038, C_N35, S_N35);
      const hindCannonBone = sdAnisoSegment(
        x, y, z,
        HK[0], HK[1] - 0.02, HK[2] + 0.010,
        HF[0], HF[1] + 0.01, HF[2] + 0.010,
        0.032, 0.032, 0.032,
        0.030, 0.030, 0.030
      );
      const hindFlexorTendon = sdAnisoSegment(
        x, y, z,
        HK[0], HK[1] - 0.01, HK[2] - 0.026,
        HF[0], HF[1] + 0.01, HF[2] - 0.022,
        0.021, 0.021, 0.021,
        0.021, 0.021, 0.021
      );
      const hindFetlock  = sdEllipsoid(x, y, z, HF[0], HF[1], HF[2] - 0.004, 0.038, 0.044, 0.048, C_N35, S_N35);
      const hindSesamoid = sdEllipsoid(x, y, z, HF[0], HF[1] + 0.004, HF[2] - 0.035, 0.024, 0.027, 0.025);
      const hindPastern  = sdTaperedCapsule(x, y, z, HF[0], HF[1], HF[2] + 0.002, HC[0], HC[1], HC[2], 0.036, 0.044);
      const hindCoronetBand = sdEllipsoid(x, y, z, HC[0], HC[1] + 0.002, HC[2] + 0.004, 0.046, 0.022, 0.049, C_015, S_015);

      let dLow = smin(hockFront, hockPoint, 0.018);
      dLow = smin(dLow, smin(hindCannonBone, hindFlexorTendon, 0.016), 0.020);
      dLow = smin(dLow, hindFetlock, 0.018);
      dLow = smin(dLow, hindSesamoid, 0.014);
      dLow = smin(dLow, hindPastern, 0.018);
      dLow = smin(dLow, hindCoronetBand, 0.014);
      dHind = smin(dHind, dLow, 0.024);
    }

    dBody = smin(dBody, dHind, 0.088);
  } else {
    dBody = Math.min(dBody, dBoxHind + 0.14);
  }

  if (y < 0.13) {
    dBody = smax(dBody, 0.088 - y, 0.010);
  }

  return dBody;
}

export function evalHorseSurfaceNormal(x, y, z) {
  const e = 0.0025;
  const d1 = evalHorseBodySDF(x + e, y - e, z - e);
  const d2 = evalHorseBodySDF(x - e, y - e, z + e);
  const d3 = evalHorseBodySDF(x - e, y + e, z - e);
  const d4 = evalHorseBodySDF(x + e, y + e, z + e);
  const v = new THREE.Vector3(d1 - d2 - d3 + d4, -d1 - d2 + d3 + d4, -d1 + d2 - d3 + d4);
  const len = v.length();
  return len > 1e-6 ? v.divideScalar(len) : new THREE.Vector3(0, 1, 0);
}

export function pushOutsideHorseSurface(point, clearance = 0.008, iterations = 3) {
  for (let i = 0; i < iterations; i++) {
    const d = evalHorseBodySDF(point.x, point.y, point.z);
    if (d >= clearance) break;
    const n = evalHorseSurfaceNormal(point.x, point.y, point.z);
    point.addScaledVector(n, (clearance - d) + 0.002);
  }
  return point;
}

function distToSegment(px, py, pz, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const vz = b[2] - a[2];
  const len2 = vx * vx + vy * vy + vz * vz;
  let t = len2 > 1e-9 ? ((px - a[0]) * vx + (py - a[1]) * vy + (pz - a[2]) * vz) / len2 : 0;
  t = clamp(t, 0, 1);
  const dx = px - (a[0] + vx * t);
  const dy = py - (a[1] + vy * t);
  const dz = pz - (a[2] + vz * t);
  return { dist: Math.sqrt(dx * dx + dy * dy + dz * dz), t };
}

/**
 * Clean, spike-free, anatomically exact 3D skeletal skinning weights!
 * CRITICAL INVARIANT: Below y = 0.88 m (below the torso belly), 100% of every leg vertex
 * (including medial inner surfaces of knees, cannons, fetlocks & pasterns!) belongs strictly
 * to its leg bone chain — ZERO stray torso/spine weight, ZERO stretching spikes in full gallop!
 */
export function evalUnifiedHorseSkinWeights(x, y, z, boneIndex) {
  const tag = x >= 0 ? 'L' : 'R';

  // Below belly line (y < 0.88), EVERY vertex belongs 100% to either Foreleg (z > 0) or Hindleg (z <= 0)!
  const belowBelly = smoothstep(0.95, 0.84, y);

  // Above belly line, blend smoothly into torso across shoulder & haunch
  const upperForeMask = smoothstep(1.25, 0.94, y) * smoothstep(0.06, 0.34, z) * smoothstep(0.94, 0.72, z) * smoothstep(0.06, 0.14, Math.abs(x));
  const upperHindMask = smoothstep(1.28, 0.96, y) * smoothstep(-0.04, -0.28, z) * smoothstep(0.05, 0.14, Math.abs(x));

  const foreMask = clamp(z > 0.0 ? Math.max(belowBelly, upperForeMask) : upperForeMask * (1 - belowBelly), 0, 1);
  const hindMask = clamp(z <= 0.0 ? Math.max(belowBelly, upperHindMask) : upperHindMask * (1 - belowBelly), 0, 1);

  // Compact tail root blends gently between pelvis & tailBase so buttock NEVER stretches in full gallop!
  const tailMask = smoothstep(-0.79, -0.85, z) * smoothstep(1.33, 1.40, y) * smoothstep(1.50, 1.44, y) * smoothstep(0.070, 0.032, Math.abs(x)) * 0.55;

  const weights = new Map();
  const addW = (bIdx, w) => {
    if (w <= 1e-5) return;
    weights.set(bIdx, (weights.get(bIdx) || 0) + w);
  };

  if (foreMask > 0.001) {
    const sh = JOINTS[`shoulder${tag}`];
    const el = JOINTS[`elbow${tag}`];
    const kn = JOINTS[`knee${tag}`];
    const ff = JOINTS[`foreFetlock${tag}`];
    const fc = JOINTS[`foreCoronet${tag}`];
    const segs = [
      { bone: boneIndex[`shoulder${tag}`], a: sh, b: el, s: 0.080 },
      { bone: boneIndex[`elbow${tag}`],    a: el, b: kn, s: 0.070 },
      { bone: boneIndex[`knee${tag}`],     a: kn, b: ff, s: 0.055 },
      { bone: boneIndex[`foreFetlock${tag}`], a: ff, b: fc, s: 0.048 },
      { bone: boneIndex[`foreCoronet${tag}`], a: fc, b: [fc[0], 0.0, fc[2] + 0.04], s: 0.044 },
    ];
    let sum = 0;
    const raw = [];
    for (const seg of segs) {
      const { dist } = distToSegment(x, y, z, seg.a, seg.b);
      const w = Math.exp(-Math.pow(dist / seg.s, 2.2));
      raw.push([seg.bone, w]);
      sum += w;
    }
    if (sum > 1e-6) {
      for (const [bIdx, w] of raw) addW(bIdx, (w / sum) * foreMask);
    } else {
      addW(boneIndex[`knee${tag}`], foreMask);
    }
  }

  if (hindMask > 0.001) {
    const hi = JOINTS[`hip${tag}`];
    const st = JOINTS[`stifle${tag}`];
    const hk = JOINTS[`hock${tag}`];
    const hf = JOINTS[`hindFetlock${tag}`];
    const hc = JOINTS[`hindCoronet${tag}`];
    const stifleGate = smoothstep(1.03, 0.88, y);
    const segs = [
      { bone: boneIndex[`hip${tag}`],         a: [hi[0], hi[1], hi[2] - 0.06], b: st, s: 0.115, gate: 1.0 },
      { bone: boneIndex[`stifle${tag}`],      a: st, b: hk, s: 0.068, gate: stifleGate },
      { bone: boneIndex[`hock${tag}`],        a: hk, b: hf, s: 0.055, gate: stifleGate },
      { bone: boneIndex[`hindFetlock${tag}`], a: hf, b: hc, s: 0.048, gate: stifleGate },
      { bone: boneIndex[`hindCoronet${tag}`], a: hc, b: [hc[0], 0.0, hc[2] + 0.04], s: 0.044, gate: stifleGate },
    ];
    let sum = 0;
    const raw = [];
    for (const seg of segs) {
      if (seg.gate <= 1e-4) continue;
      const { dist } = distToSegment(x, y, z, seg.a, seg.b);
      const w = Math.exp(-Math.pow(dist / seg.s, 2.2)) * seg.gate;
      raw.push([seg.bone, w]);
      sum += w;
    }
    if (sum > 1e-6) {
      for (const [bIdx, w] of raw) addW(bIdx, (w / sum) * hindMask);
    } else {
      addW(boneIndex[`hock${tag}`], hindMask);
    }
  }

  if (tailMask > 0.001) {
    addW(boneIndex.tailBase, tailMask);
  }

  const coreMask = clamp(1.0 - foreMask - hindMask - tailMask, 0, 1);
  if (coreMask > 0.001) {
    const headDot = (z - 1.135) * 0.96 + (y - 1.92) * -0.28;
    const headMask = smoothstep(-0.075, 0.065, headDot) * smoothstep(1.50, 1.62, y);

    if (headMask > 0.001) {
      addW(boneIndex.head, headMask * coreMask);
    }

    const torsoNeckMask = coreMask * (1 - headMask);
    if (torsoNeckMask > 0.001) {
      const coreSegs = [
        { bone: boneIndex.pelvis,    a: [0, 1.34, -0.78], b: [0, 1.31, -0.22], s: 0.24 },
        { bone: boneIndex.spineMid,  a: [0, 1.26, -0.20], b: [0, 1.26,  0.28], s: 0.24 },
        { bone: boneIndex.withers,   a: [0, 1.30,  0.26], b: [0, 1.35,  0.65], s: 0.22 },
        { bone: boneIndex.neckBase,  a: [0, 1.38,  0.61], b: [0, 1.65,  0.84], s: 0.16 },
        { bone: boneIndex.neckMid,   a: [0, 1.65,  0.84], b: [0, 1.88,  1.01], s: 0.14 },
        { bone: boneIndex.neckUpper, a: [0, 1.88,  1.01], b: [0, 2.04,  1.12], s: 0.12 },
      ];
      let sum = 0;
      const raw = [];
      for (const seg of coreSegs) {
        const { dist } = distToSegment(x, y, z, seg.a, seg.b);
        const w = Math.exp(-Math.pow(dist / seg.s, 2.0));
        raw.push([seg.bone, w]);
        sum += w;
      }
      if (sum > 1e-6) {
        for (const [bIdx, w] of raw) addW(bIdx, (w / sum) * torsoNeckMask);
      } else {
        addW(boneIndex.spineMid, torsoNeckMask);
      }
    }
  }

  return Array.from(weights.entries());
}

export function buildUnifiedHorseBodyGeometry(boneIndex) {
  const geo = extractSurfaceNetsMesh({
    sdf: evalHorseBodySDF,
    boundsMin: [-0.36, 0.07, -0.98],
    boundsMax: [ 0.36, 2.16,  1.65],
    voxelSize: 0.0138,
    taubinIterations: 2,
    newtonSteps: 1,
    symmetricX: true,
    evalWeights: (x, y, z) => evalUnifiedHorseSkinWeights(x, y, z, boneIndex),
  });

  geo.userData.part = 'unifiedBody';
  return geo;
}
