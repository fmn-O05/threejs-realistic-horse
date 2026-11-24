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
 * Exact anatomical Eye centers nestled deep beneath the sculpted supraorbital arches!
 */
export const SDF_EYE_CENTERS = {
  left:  new THREE.Vector3( 0.086, 1.988, 1.242),
  right: new THREE.Vector3(-0.086, 1.988, 1.242),
};

// Precomputed trigonometric pitch constants
const C_025 = Math.cos(0.25),  S_025 = Math.sin(0.25);
const C_N15 = Math.cos(-0.15), S_N15 = Math.sin(-0.15);
const C_012 = Math.cos(0.12),  S_012 = Math.sin(0.12);
const C_015 = Math.cos(0.15),  S_015 = Math.sin(0.15);
const C_052 = Math.cos(0.52),  S_052 = Math.sin(0.52);
const C_035 = Math.cos(0.35),  S_035 = Math.sin(0.35);
const C_048 = Math.cos(0.48),  S_048 = Math.sin(0.48);
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
 * V5 Master Sculpted Equine Analytic SDF — True Warmblood / Thoroughbred Stallion Conformation:
 *   - Noble equine head with DEEP, broad, circular Masseter Jowl (~29cm depth!), clean flat forehead,
 *     strong brow arch, recessed eye socket, refined nasal bridge, flared teardrop nostrils, and
 *     CLOSED velvety rounded upper/lower lips (zero fish-mouth gap!).
 *   - Proud, sweeping CONVEX arched stallion neck crest tapering crisply into a fine throatlatch.
 *   - Taut athletic torso: clean pectoral chest (no bloated pigeon breast!), high withers, smooth
 *     continuous topline & croup (zero Play-Doh hip lumps!), sleek flank tuck.
 *   - Crisp athletic legs: muscular forearm & gaskin, flat-fronted bony knee, sharp point of hock,
 *     flat-sided cannon with flexor tendon groove, clean fetlock, slender 52-deg pastern mating
 *     flush with a realistically proportioned hoof!
 */
export function evalHorseBodySDF(ax, y, z) {
  const x = ax < 0 ? -ax : ax;
  let dBody = 10.0;

  // =========================================================================
  // 1. TAUT ATHLETIC TORSO (Smooth Continuous Muscle Planes — ZERO Play-Doh Lumps!)
  // =========================================================================
  const dBoxTorso = boxDist(x, y, z, 0, 0.80, -0.98, 0.40, 1.82, 0.92);
  if (dBoxTorso < 0.22) {
    // Sleek athletic ribcage / barrel — deep at heart girth, gently tucked toward flank!
    const ribBarrel = sdAnisoSegment(
      x, y, z,
      0, 1.29, -0.24,   // Loin / tucked flank
      0, 1.26,  0.40,   // Deep athletic heart girth
      0.238, 0.242, 0.25,
      0.242, 0.312, 0.26
    );

    // Lean athletic sternum / brisket curving smoothly up into pectoral chest (NO pigeon-breast bulge!)
    const brisket = sdAnisoSegment(
      x, y, z,
      0, 1.15, 0.16,
      0, 1.22, 0.58,
      0.195, 0.188, 0.19,
      0.178, 0.175, 0.18
    );

    // Crisp muscular Pectoral breast cushions (balanced athletic front with subtle pectoral cleft!)
    const pectoral = sdEllipsoid(x, y, z, 0.105, 1.23, 0.625, 0.112, 0.148, 0.145, C_025, S_025);

    // Proud high athletic Withers (peaking crisply at y ~1.64 m, flowing smoothly into neck crest!)
    const withers = sdAnisoSegment(
      x, y, z,
      0, 1.50, 0.16,
      0, 1.54, 0.45,
      0.125, 0.088, 0.13,
      0.095, 0.132, 0.14
    );

    // Flat-muscled sloping Shoulder Blade (Scapula) from withers to Point of Shoulder
    const scapula = sdAnisoSegment(
      x, y, z,
      0.112, 1.50, 0.43,
      0.165, 1.26, 0.66,
      0.102, 0.118, 0.120,
      0.102, 0.122, 0.125
    );

    // Smooth, powerful, double-muscled Croup & Hindquarters (unified smooth curves!)
    const croupCore = sdAnisoSegment(
      x, y, z,
      0, 1.36, -0.58,
      0, 1.33, -0.24,
      0.238, 0.228, 0.23,
      0.235, 0.235, 0.24
    );
    const glutealLobe  = sdEllipsoid(x, y, z, 0.115, 1.39, -0.56, 0.172, 0.210, 0.255, C_N15, S_N15);
    const buttockCurve = sdEllipsoid(x, y, z, 0.108, 1.28, -0.71, 0.145, 0.175, 0.160, C_012, S_012);

    let dTorso = smin(ribBarrel, brisket, 0.115);
    dTorso = smin(dTorso, pectoral, 0.090);
    dTorso = smin(dTorso, withers, 0.105);
    dTorso = smin(dTorso, scapula, 0.095);
    dTorso = smin(dTorso, croupCore, 0.125);
    dTorso = smin(dTorso, glutealLobe, 0.105);
    dTorso = smin(dTorso, buttockCurve, 0.090);

    // Gentle graceful saddle-seat dip along the back behind the withers
    const saddleDip = sdEllipsoid(x, y, z, 0.0, 1.66, 0.04, 0.24, 0.115, 0.24);
    dTorso = ssub(dTorso, saddleDip, 0.075);

    // Very subtle spinal groove along loin/croup
    const spineGroove = sdAnisoSegment(
      x, y, z,
      0, 1.625, -0.66,
      0, 1.585, -0.06,
      0.025, 0.026, 0.032,
      0.022, 0.024, 0.032
    );
    dTorso = ssub(dTorso, spineGroove, 0.036);

    // Compact sculpted high-set Tail Root smoothly tucked into the upper croup
    if (z < -0.60) {
      const tailDock = sdTaperedCapsule(x, y, z, 0, 1.46, -0.74, 0, 1.41, -0.84, 0.048, 0.030);
      dTorso = smin(dTorso, tailDock, 0.038);
    }

    dBody = dTorso;
  } else {
    dBody = dBoxTorso + 0.15;
  }

  // =========================================================================
  // 2. PROUD ARCHED STALLION NECK (Graceful Convex Crest + Clean Concave Windpipe + Fine Throatlatch!)
  // =========================================================================
  const dBoxNeck = boxDist(x, y, z, 0, 1.18, 0.36, 0.25, 2.24, 1.24);
  if (dBoxNeck < 0.22) {
    // Sweeping lower muscular neck rising gracefully from chest & withers
    const neckLower = sdAnisoSegment(
      x, y, z,
      0, 1.42, 0.58,
      0, 1.74, 0.80,
      0.158, 0.195, 0.188,
      0.106, 0.152, 0.145
    );
    // Upper neck curving FORWARD at the top into a regal proud dressage/Warmblood arch!
    const neckUpper = sdAnisoSegment(
      x, y, z,
      0, 1.74, 0.80,
      0, 2.04, 1.05,
      0.106, 0.152, 0.145,
      0.078, 0.102, 0.102
    );
    // Iconic arched dorsal Nuchal Crest (convex curve soaring gracefully from withers to poll!)
    const crestLow = sdAnisoSegment(
      x, y, z,
      0, 1.58, 0.51,
      0, 1.94, 0.78,
      0.060, 0.078, 0.080,
      0.052, 0.076, 0.078
    );
    const crestHigh = sdAnisoSegment(
      x, y, z,
      0, 1.94, 0.78,
      0, 2.11, 1.06,
      0.052, 0.076, 0.078,
      0.052, 0.058, 0.060
    );
    // Sleek clean ventral windpipe sweeping cleanly to fine throatlatch
    const windpipe = sdAnisoSegment(
      x, y, z,
      0, 1.32, 0.75,
      0, 1.88, 1.10,
      0.076, 0.076, 0.076,
      0.046, 0.050, 0.050
    );

    let dNeck = smin(neckLower, neckUpper, 0.085);
    dNeck = smin(dNeck, crestLow, 0.072);
    dNeck = smin(dNeck, crestHigh, 0.062);
    dNeck = smin(dNeck, windpipe, 0.058);

    // Subtle soft jugular channel along lower-side of neck
    const jugular = sdTaperedCapsule(x, y, z, 0.132, 1.50, 0.76, 0.095, 1.90, 1.04, 0.020, 0.016);
    dNeck = ssub(dNeck, jugular, 0.030);

    dBody = smin(dBody, dNeck, 0.100);
  } else {
    dBody = Math.min(dBody, dBoxNeck + 0.15);
  }

  // =========================================================================
  // 3. NOBLE SCULPTED EQUINE HEAD (Deep Broad Circular Jowl + Clean Forehead + Closed Velvety Muzzle!)
  // =========================================================================
  const dBoxHead = boxDist(x, y, z, 0, 1.52, 0.98, 0.18, 2.24, 1.66);
  if (dBoxHead < 0.18) {
    // Broad sculpted cranium & flat forehead dome
    const cranium    = sdEllipsoid(x, y, z, 0, 2.048, 1.168, 0.098, 0.092, 0.118, C_052, S_052);
    const pollCrown  = sdEllipsoid(x, y, z, 0, 2.115, 1.110, 0.074, 0.052, 0.070, C_035, S_035);

    // ICONIC DEEP, BROAD, CIRCULAR MASSETER CHEEK / JOWL (~29 cm head depth from forehead to jaw curve!)
    const jowlMain   = sdEllipsoid(x, y, z, 0.042, 1.882, 1.182, 0.072, 0.125, 0.118, C_048, S_048);
    // Crisp tapering Mandible (jawbone) running in a clean straight line from big circular jowl to chin!
    const mandible   = sdAnisoSegment(
      x, y, z,
      0.034, 1.848, 1.225,
      0.018, 1.662, 1.445,
      0.058, 0.072, 0.072,
      0.036, 0.042, 0.042
    );

    // Broad Forehead tapering smoothly down a refined straight-to-barely-dished Nasal Bridge!
    const nasalBridge = sdAnisoSegment(
      x, y, z,
      0, 1.995, 1.242,
      0, 1.710, 1.498,
      0.088, 0.080, 0.080,
      0.054, 0.058, 0.058
    );

    // Crisp Zygomatic Facial Crest running forward along cheek below eye
    const facialCrest = sdTaperedCapsule(x, y, z, 0.076, 1.945, 1.275, 0.054, 1.775, 1.432, 0.026, 0.018);

    // CLOSED, FULL, SOFT, VELVETY EQUINE MUZZLE (rounded square muzzle — ZERO fish-mouth gap!)
    const upperMuzzle = sdEllipsoid(x, y, z, 0, 1.682, 1.522, 0.064, 0.056, 0.068, C_072, S_072);
    const closedLips  = sdEllipsoid(x, y, z, 0, 1.644, 1.538, 0.054, 0.048, 0.058, C_075, S_075);
    const chinPad     = sdEllipsoid(x, y, z, 0, 1.622, 1.496, 0.044, 0.036, 0.046, C_075, S_075);

    // Flared sculpted Alar Nostril Rims positioned high on the sides of the velvety muzzle
    const nostrilRim  = sdEllipsoid(x, y, z, 0.050, 1.704, 1.504, 0.022, 0.027, 0.028, C_065, S_065);
    // Strong angled bony Supraorbital Arch projecting cleanly over each deep-set eye
    const browArch    = sdEllipsoid(x, y, z, 0.084, 2.018, 1.246, 0.028, 0.022, 0.032, C_040, S_040);

    let dHead = smin(cranium, pollCrown, 0.036);
    dHead = smin(dHead, jowlMain, 0.048);
    dHead = smin(dHead, mandible, 0.042);
    dHead = smin(dHead, nasalBridge, 0.044);
    dHead = smin(dHead, facialCrest, 0.028);
    dHead = smin(dHead, upperMuzzle, 0.038);
    dHead = smin(dHead, closedLips, 0.030);
    dHead = smin(dHead, chinPad, 0.028);
    dHead = smin(dHead, nostrilRim, 0.018);
    dHead = smin(dHead, browArch, 0.022);

    // Deep recessed Orbital Eye Socket cleanly cradling the almond eyeball & fleshy eyelids
    const eyeSocket = sdEllipsoid(x, y, z, 0.094, 1.988, 1.246, 0.028, 0.022, 0.026, C_030, S_030);
    dHead = ssub(dHead, eyeSocket, 0.012);

    // Smooth teardrop Recessed Nostril Cavities (silky smooth closed velvety muzzle — zero side pit!)
    const nostrilHole = sdEllipsoid(x, y, z, 0.058, 1.704, 1.510, 0.016, 0.015, 0.018, C_085, S_085);
    dHead = ssub(dHead, nostrilHole, 0.012);

    // Subtle Chin Groove & Intermandibular Hollow underneath jaw (smooth & clean in profile!)
    const chinGroove = sdEllipsoid(x, y, z, 0.0, 1.632, 1.452, 0.024, 0.009, 0.010, C_065, S_065);
    const jawHollow  = sdTaperedCapsule(x, y, z, 0, 1.81, 1.20, 0, 1.68, 1.38, 0.020, 0.014);
    dHead = ssub(dHead, chinGroove, 0.014);
    dHead = ssub(dHead, jawHollow, 0.018);

    dBody = smin(dBody, dHead, 0.046);
  } else {
    dBody = Math.min(dBody, dBoxHead + 0.14);
  }

  // =========================================================================
  // 4. CRISP ATHLETIC FORELEGS (Muscular Forearm -> Flat Bony Knee -> Lean Cannon+Tendon -> Clean Fetlock -> Sleek 52-deg Pastern)
  // =========================================================================
  const dBoxFore = boxDist(x, y, z, 0.02, 0.04, 0.34, 0.32, 1.40, 0.84);
  if (dBoxFore < 0.18) {
    let dFore = 10.0;
    if (y > 0.44) {
      const upperArm = sdAnisoSegment(
        x, y, z,
        SH[0] - 0.005, SH[1] + 0.02, SH[2] + 0.01,
        EL[0],         EL[1],        EL[2],
        0.092, 0.108, 0.112,
        0.072, 0.088, 0.090
      );
      const elbowPoint = sdEllipsoid(x, y, z, EL[0], EL[1] + 0.01, EL[2] - 0.048, 0.042, 0.052, 0.060, C_020, S_020);
      const forearm = sdAnisoSegment(
        x, y, z,
        EL[0], EL[1] + 0.01, EL[2] + 0.004,
        KN[0], KN[1] + 0.02, KN[2],
        0.068, 0.084, 0.086,
        0.042, 0.048, 0.048
      );
      dFore = smin(smin(upperArm, elbowPoint, 0.032), forearm, 0.042);
    }
    if (y < 0.72) {
      const kneeJoint = sdEllipsoid(x, y, z, KN[0], KN[1], KN[2] + 0.004, 0.044, 0.054, 0.050);
      const pisiform  = sdEllipsoid(x, y, z, KN[0], KN[1] + 0.008, KN[2] - 0.034, 0.023, 0.030, 0.026);
      const foreCannonBone = sdAnisoSegment(
        x, y, z,
        KN[0], KN[1] - 0.01, KN[2] + 0.011,
        FF[0], FF[1] + 0.01, FF[2] + 0.010,
        0.029, 0.029, 0.029,
        0.028, 0.028, 0.028
      );
      const foreFlexorTendon = sdAnisoSegment(
        x, y, z,
        KN[0], KN[1] - 0.01, KN[2] - 0.022,
        FF[0], FF[1] + 0.01, FF[2] - 0.020,
        0.019, 0.019, 0.019,
        0.019, 0.019, 0.019
      );
      const foreFetlock  = sdEllipsoid(x, y, z, FF[0], FF[1], FF[2] - 0.004, 0.036, 0.042, 0.045, C_N35, S_N35);
      const foreSesamoid = sdEllipsoid(x, y, z, FF[0], FF[1] + 0.003, FF[2] - 0.032, 0.022, 0.025, 0.024);
      const forePastern  = sdTaperedCapsule(x, y, z, FF[0], FF[1], FF[2] + 0.002, FC[0], FC[1], FC[2], 0.034, 0.044);
      const foreCoronetBand = sdEllipsoid(x, y, z, FC[0], FC[1] + 0.004, FC[2] + 0.003, 0.047, 0.022, 0.050, C_015, S_015);

      let dLow = smin(kneeJoint, pisiform, 0.016);
      dLow = smin(dLow, smin(foreCannonBone, foreFlexorTendon, 0.014), 0.020);
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
  // 5. POWERFUL SCULPTED HINDLEGS (Sweeping Haunch -> Clean Stifle -> Gaskin & Achilles -> Sharp Hock -> Lean Cannon -> Pastern)
  // =========================================================================
  const dBoxHind = boxDist(x, y, z, 0.02, 0.04, -0.88, 0.34, 1.46, -0.18);
  if (dBoxHind < 0.18) {
    let dHind = 10.0;
    if (y > 0.46) {
      const upperThigh = sdAnisoSegment(
        x, y, z,
        HI[0] - 0.01, HI[1] + 0.02, HI[2] - 0.08,
        ST[0] - 0.005, ST[1] + 0.03, ST[2] - 0.04,
        0.126, 0.162, 0.188,
        0.088, 0.114, 0.124
      );
      const hamstringArc = sdAnisoSegment(
        x, y, z,
        0.128, 1.27, -0.71,
        0.154, 0.88, -0.62,
        0.120, 0.138, 0.128,
        0.068, 0.082, 0.086
      );
      const flankFold = sdAnisoSegment(
        x, y, z,
        0.160, 1.09, -0.26,
        ST[0], ST[1] + 0.02, ST[2] - 0.01,
        0.056, 0.054, 0.066,
        0.054, 0.062, 0.064
      );
      const gaskin = sdAnisoSegment(
        x, y, z,
        ST[0], ST[1] + 0.01, ST[2] - 0.02,
        HK[0], HK[1] + 0.03, HK[2] + 0.01,
        0.080, 0.102, 0.104,
        0.042, 0.054, 0.056
      );
      const achilles = sdAnisoSegment(
        x, y, z,
        0.156, 0.90, -0.60,
        HK[0], HK[1] + 0.024, HK[2] - 0.054,
        0.032, 0.038, 0.040,
        0.022, 0.030, 0.032
      );
      dHind = smin(upperThigh, hamstringArc, 0.080);
      dHind = smin(dHind, flankFold, 0.065);
      dHind = smin(dHind, gaskin, 0.054);
      dHind = smin(dHind, achilles, 0.026);
    }

    if (y < 0.74) {
      const hockFront = sdEllipsoid(x, y, z, HK[0], HK[1] - 0.005, HK[2] + 0.006, 0.043, 0.058, 0.050, C_025, S_025);
      const hockPoint = sdEllipsoid(x, y, z, HK[0], HK[1] + 0.024, HK[2] - 0.054, 0.026, 0.038, 0.036, C_N35, S_N35);
      const hindCannonBone = sdAnisoSegment(
        x, y, z,
        HK[0], HK[1] - 0.02, HK[2] + 0.010,
        HF[0], HF[1] + 0.01, HF[2] + 0.010,
        0.030, 0.030, 0.030,
        0.028, 0.028, 0.028
      );
      const hindFlexorTendon = sdAnisoSegment(
        x, y, z,
        HK[0], HK[1] - 0.01, HK[2] - 0.024,
        HF[0], HF[1] + 0.01, HF[2] - 0.020,
        0.019, 0.019, 0.019,
        0.019, 0.019, 0.019
      );
      const hindFetlock  = sdEllipsoid(x, y, z, HF[0], HF[1], HF[2] - 0.004, 0.036, 0.042, 0.045, C_N35, S_N35);
      const hindSesamoid = sdEllipsoid(x, y, z, HF[0], HF[1] + 0.003, HF[2] - 0.032, 0.022, 0.025, 0.024);
      const hindPastern  = sdTaperedCapsule(x, y, z, HF[0], HF[1], HF[2] + 0.002, HC[0], HC[1], HC[2], 0.034, 0.042);
      const hindCoronetBand = sdEllipsoid(x, y, z, HC[0], HC[1] + 0.004, HC[2] + 0.003, 0.044, 0.022, 0.047, C_015, S_015);

      let dLow = smin(hockFront, hockPoint, 0.018);
      dLow = smin(dLow, smin(hindCannonBone, hindFlexorTendon, 0.014), 0.020);
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

  if (y < 0.125) {
    dBody = smax(dBody, 0.084 - y, 0.009);
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
 * Silky-smooth, tear-free, anatomically gated 3D skeletal skinning weights across all 39 bones.
 */
export function evalUnifiedHorseSkinWeights(x, y, z, boneIndex) {
  const tag = x >= 0 ? 'L' : 'R';

  // Below belly line (y < 0.86), 100% of every leg vertex belongs strictly to its leg bone chain;
  // Above it, wide elastic shoulder/haunch transition prevents any harsh skin step at peak gallop extension!
  const belowBelly = smoothstep(0.95, 0.82, y);

  const upperForeMask = smoothstep(1.38, 0.88, y) * smoothstep(0.10, 0.38, z) * smoothstep(0.94, 0.68, z) * smoothstep(0.05, 0.14, Math.abs(x));
  const upperHindMask = smoothstep(1.42, 0.88, y) * smoothstep(-0.04, -0.30, z) * smoothstep(0.05, 0.14, Math.abs(x));

  const foreMask = clamp(z > 0.0 ? Math.max(belowBelly, upperForeMask) : upperForeMask * (1 - belowBelly), 0, 1);
  const hindMask = clamp(z <= 0.0 ? Math.max(belowBelly, upperHindMask) : upperHindMask * (1 - belowBelly), 0, 1);

  // Compact tail root blends gently between pelvis & tailBase
  const tailMask = smoothstep(-0.79, -0.85, z) * smoothstep(1.35, 1.42, y) * smoothstep(1.52, 1.46, y) * smoothstep(0.068, 0.030, Math.abs(x)) * 0.55;

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
    const elbowGate = smoothstep(1.06, 0.78, y);
    const segs = [
      { bone: boneIndex[`shoulder${tag}`], a: sh, b: el, s: 0.125, gate: 1.0 },
      { bone: boneIndex[`elbow${tag}`],    a: el, b: kn, s: 0.085, gate: elbowGate },
      { bone: boneIndex[`knee${tag}`],     a: kn, b: ff, s: 0.054, gate: elbowGate },
      { bone: boneIndex[`foreFetlock${tag}`], a: ff, b: fc, s: 0.046, gate: elbowGate },
      { bone: boneIndex[`foreCoronet${tag}`], a: fc, b: [fc[0], 0.0, fc[2] + 0.04], s: 0.042, gate: elbowGate },
    ];
    let sum = 0;
    const raw = [];
    for (const seg of segs) {
      if (seg.gate <= 1e-4) continue;
      const { dist } = distToSegment(x, y, z, seg.a, seg.b);
      const w = Math.exp(-Math.pow(dist / seg.s, 2.0)) * seg.gate;
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
    const stifleGate = smoothstep(1.08, 0.78, y);
    const segs = [
      { bone: boneIndex[`hip${tag}`],         a: [hi[0], hi[1], hi[2] - 0.06], b: st, s: 0.145, gate: 1.0 },
      { bone: boneIndex[`stifle${tag}`],      a: st, b: hk, s: 0.082, gate: stifleGate },
      { bone: boneIndex[`hock${tag}`],        a: hk, b: hf, s: 0.054, gate: stifleGate },
      { bone: boneIndex[`hindFetlock${tag}`], a: hf, b: hc, s: 0.046, gate: stifleGate },
      { bone: boneIndex[`hindCoronet${tag}`], a: hc, b: [hc[0], 0.0, hc[2] + 0.04], s: 0.042, gate: stifleGate },
    ];
    let sum = 0;
    const raw = [];
    for (const seg of segs) {
      if (seg.gate <= 1e-4) continue;
      const { dist } = distToSegment(x, y, z, seg.a, seg.b);
      const w = Math.exp(-Math.pow(dist / seg.s, 2.0)) * seg.gate;
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
    const headDot = (z - 1.11) * 0.95 + (y - 1.96) * -0.30;
    const headMask = smoothstep(-0.08, 0.07, headDot) * smoothstep(1.52, 1.65, y);

    if (headMask > 0.001) {
      addW(boneIndex.head, headMask * coreMask);
    }

    const torsoNeckMask = coreMask * (1 - headMask);
    if (torsoNeckMask > 0.001) {
      const coreSegs = [
        { bone: boneIndex.pelvis,    a: [0, 1.36, -0.78], b: [0, 1.33, -0.22], s: 0.25 },
        { bone: boneIndex.spineMid,  a: [0, 1.28, -0.20], b: [0, 1.28,  0.28], s: 0.25 },
        { bone: boneIndex.withers,   a: [0, 1.32,  0.26], b: [0, 1.38,  0.64], s: 0.23 },
        { bone: boneIndex.neckBase,  a: [0, 1.42,  0.58], b: [0, 1.72,  0.80], s: 0.18 },
        { bone: boneIndex.neckMid,   a: [0, 1.72,  0.80], b: [0, 1.96,  0.98], s: 0.16 },
        { bone: boneIndex.neckUpper, a: [0, 1.96,  0.98], b: [0, 2.09,  1.10], s: 0.14 },
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
    boundsMin: [-0.36, 0.06, -0.96],
    boundsMax: [ 0.36, 2.22,  1.66],
    voxelSize: 0.0136,
    taubinIterations: 2,
    newtonSteps: 1,
    symmetricX: true,
    evalWeights: (x, y, z) => evalUnifiedHorseSkinWeights(x, y, z, boneIndex),
  });

  geo.userData.part = 'unifiedBody';
  return geo;
}
