import * as THREE from 'three';
import { JOINTS } from './anatomy.js';
import {
  measureLegChain,
  sagittalAngle,
  solveSagittal2BoneIK,
  Spring1D,
  wrapAngle,
} from './equineIK.js';
import { clamp, smootherstep, smoothstep } from './sculptUtils.js';

/**
 * V8 Refined Muybridge Biomechanical Gait Configurations:
 *   - Pillar-straight weight-bearing legs in Walk & Trot (zero buck-kneed bend!)
 *   - Expressive straight proud foreleg reach before retraction in Trot & Gallop
 *   - Full powerful sweeping diagonal hind-leg push-off extension (eliminates 90-deg hooked hind push-off!)
 *   - Exact 1:1 physical ground speed across all 4 hooves (< 2% mid-stance slip!)
 *   - Graceful gravity-arched flowing plume tail (zero broomstick stiffness!)
 */
const GAIT_CONFIGS = {
  walk: {
    freq: 0.92,
    fore: {
      duty: 0.64,
      zTouch: 0.88,
      zLift:  0.24, // 0.64 m stance sweep => 0.92 m/s exact ground lock
      liftH:  0.105,
      retractOver: 0.025,
      pasternTouch: -0.58,
      pasternLoad:  -0.76,
      pasternLift:  -0.34,
      pasternSwing:  0.24,
      hoofTouchTilt: -0.10,
      hoofLiftTilt:   0.44,
      hoofSwingTilt:  0.34,
      upperSwingFwd: -0.12, // Subtle natural humeral swing -> pillar-straight reach & stance!
      upperSwingBwd:  0.14,
    },
    hind: {
      duty: 0.64,
      zTouch: -0.26,
      zLift:  -0.90, // Exact same 0.64 m stance sweep
      liftH:  0.102,
      retractOver: 0.022,
      pasternTouch: -0.55,
      pasternLoad:  -0.72,
      pasternLift:  -0.30,
      pasternSwing:  0.20,
      hoofTouchTilt: -0.09,
      hoofLiftTilt:   0.44,
      hoofSwingTilt:  0.28,
      upperSwingFwd: -0.16,
      upperSwingBwd:  0.14,
    },
    phases: { hindL: 0.00, foreL: 0.25, hindR: 0.50, foreR: 0.75 },
  },
  trot: {
    freq: 1.44,
    fore: {
      duty: 0.43,
      zTouch: 1.07, // Expressive proud Warmblood forward reach (snaps front leg cleanly straight!)
      zLift:  0.09, // 0.98 m stance travel / (0.43 / 1.44) = 3.28 m/s
      liftH:  0.240,
      retractOver: 0.055,
      pasternTouch: -0.60,
      pasternLoad:  -0.98,
      pasternLift:  -0.32,
      pasternSwing:  0.46,
      hoofTouchTilt: -0.15,
      hoofLiftTilt:   0.56,
      hoofSwingTilt:  0.55,
      upperSwingFwd: -0.20, // Keeps elbow poised so forearm+cannon extend straight and proud!
      upperSwingBwd:  0.18,
    },
    hind: {
      duty: 0.43,
      zTouch: -0.14,
      zLift:  -1.12, // Full sweeping diagonal hind propulsion (exact 0.98 m sweep -> 100% locked!)
      liftH:  0.225,
      retractOver: 0.045,
      pasternTouch: -0.56,
      pasternLoad:  -0.92,
      pasternLift:  -0.28,
      pasternSwing:  0.34,
      hoofTouchTilt: -0.14,
      hoofLiftTilt:   0.54,
      hoofSwingTilt:  0.44,
      upperSwingFwd: -0.26,
      upperSwingBwd:  0.18, // Opens hock cleanly at push-off instead of 90-deg hook!
    },
    phases: { foreL: 0.00, hindR: 0.00, foreR: 0.50, hindL: 0.50 },
  },
  gallop: {
    freq: 1.94,
    fore: {
      duty: 0.30,
      zTouch: 1.15, // Athletic Thoroughbred extended foreleg reach!
      zLift: -0.03, // 1.18 m stance sweep / (0.30 / 1.94) = 7.63 m/s
      liftH:  0.415,
      retractOver: 0.085,
      pasternTouch: -0.62,
      pasternLoad:  -1.14,
      pasternLift:  -0.34,
      pasternSwing:  0.60,
      hoofTouchTilt: -0.18,
      hoofLiftTilt:   0.62,
      hoofSwingTilt:  0.66,
      upperSwingFwd: -0.28,
      upperSwingBwd:  0.24,
    },
    hind: {
      duty: 0.30,
      zTouch: -0.06, // Deep gathered collection under belly ->
      zLift:  -1.24, // Full explosive straight diagonal hind propulsion (exact 1.18 m sweep, NO 90-deg hook!)
      liftH:  0.370,
      retractOver: 0.065,
      pasternTouch: -0.58,
      pasternLoad:  -1.06,
      pasternLift:  -0.30,
      pasternSwing:  0.44,
      hoofTouchTilt: -0.16,
      hoofLiftTilt:   0.60,
      hoofSwingTilt:  0.50,
      upperSwingFwd: -0.38,
      upperSwingBwd:  0.18, // Lets the stifle & hock open cleanly into a sweeping rear thrust!
    },
    // Eadweard Muybridge Transverse Right-Lead Gallop:
    // LH (0.00) -> RH (0.14) -> LF (0.37) -> RF (0.51) -> 4-Hoof Gathered Flight (0.81..1.00)
    phases: { hindL: 0.00, hindR: 0.14, foreL: 0.37, foreR: 0.51 },
  },
};

function evalLegTarget(u, cfg) {
  const duty = cfg.duty;
  const isStance = u < duty;

  if (isStance) {
    const s = u / duty;

    // Exact constant linear backward ground travel -> ZERO foot skating!
    const z = THREE.MathUtils.lerp(cfg.zTouch, cfg.zLift, s);

    const heelDrop = (1 - smoothstep(0.0, 0.09, s)) * 0.003;
    const toePeel  = smoothstep(0.85, 1.0, s) * 0.011;
    const y = heelDrop + toePeel;

    // Elastic Thoroughbred fetlock shock-absorption peaking at mid-stance vertical force
    const loadBell = Math.sin(Math.pow(s, 0.86) * Math.PI);
    const pasternPsi = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(cfg.pasternTouch, cfg.pasternLift, s),
      cfg.pasternLoad,
      Math.pow(loadBell, 1.15)
    );

    let hoofPitch = 0.0;
    if (s < 0.11) {
      hoofPitch = cfg.hoofTouchTilt * (1 - smoothstep(0.0, 0.11, s));
    } else if (s > 0.80) {
      hoofPitch = cfg.hoofLiftTilt * smootherstep(0.80, 1.0, s);
    }

    const upperDrive = THREE.MathUtils.lerp(cfg.upperSwingFwd, cfg.upperSwingBwd, smoothstep(0.0, 1.0, s));
    return { y, z, pasternPsi, hoofPitch, upperDrive, isStance: true, stanceFrac: s };
  }

  // --- SWING PHASE ---
  const s = (u - duty) / (1.0 - duty);

  // Asymmetric protraction + pre-impact retraction (ground-speed matching!)
  const reachCurve = smootherstep(0.0, 0.84, s);
  const retractBack = smootherstep(0.76, 1.0, s);
  const zPeak = cfg.zTouch + cfg.retractOver;
  const z = THREE.MathUtils.lerp(cfg.zLift, zPeak, reachCurve) - cfg.retractOver * retractBack;

  // High expressive clearance arc (peaks slightly earlier in mid-fold, then sweeps cleanly down & forward!)
  const liftCurve = Math.sin(Math.pow(s, 0.78) * Math.PI);
  const foldKick = Math.sin(Math.min(1, s * 1.50) * Math.PI) * 0.18;
  const y = Math.max(0.004, cfg.liftH * (liftCurve * 0.86 + foldKick * liftCurve) + (1 - s) * 0.011);

  const foldBell = Math.sin(Math.pow(s, 0.76) * Math.PI);
  const baseSwingPastern = THREE.MathUtils.lerp(cfg.pasternLift, cfg.pasternTouch, smootherstep(0.0, 1.0, s));
  const pasternPsi = THREE.MathUtils.lerp(baseSwingPastern, cfg.pasternSwing, Math.pow(foldBell, 0.92));

  const hoofCurl = Math.sin(Math.pow(s, 0.70) * Math.PI);
  const hoofPitch =
    cfg.hoofSwingTilt * hoofCurl +
    cfg.hoofLiftTilt * (1 - smoothstep(0.0, 0.24, s)) * 0.65 +
    cfg.hoofTouchTilt * smoothstep(0.82, 1.0, s);

  const upperDrive = THREE.MathUtils.lerp(cfg.upperSwingBwd, cfg.upperSwingFwd, smootherstep(0.06, 0.84, s));
  return { y, z, pasternPsi, hoofPitch, upperDrive, isStance: false, stanceFrac: -1 };
}

function getGaitPhysicalSpeed(mode) {
  const g = GAIT_CONFIGS[mode];
  if (!g) return 0;
  const stanceDist = g.fore.zTouch - g.fore.zLift;
  const stanceTime = g.fore.duty / g.freq;
  return stanceDist / stanceTime;
}

export class HorseAnimator {
  constructor(horse) {
    this.horse = horse;
    this.bones = horse.rig.boneMap;
    this.restPose = horse.rig.restPose;
    this.eyes = horse.eyes;

    this.mode = 'idle';
    this.time = 0;
    this.gaitPhase = 0;
    this.speed = 1.0;
    this.paused = false;
    this.currentSpeedMps = 0;

    this.legChains = {
      foreL: measureLegChain(JOINTS, 'fore', 'L'),
      foreR: measureLegChain(JOINTS, 'fore', 'R'),
      hindL: measureLegChain(JOINTS, 'hind', 'L'),
      hindR: measureLegChain(JOINTS, 'hind', 'R'),
    };

    // Secondary damped spring-pendulum physics for graceful arched tail flow
    this.tailSpringBase  = new Spring1D(0, 28, 6.4);
    this.tailSpringMid   = new Spring1D(0, 22, 5.0);
    this.tailSpringLower = new Spring1D(0, 18, 4.2);
    this.tailSwaySpring  = new Spring1D(0, 18, 4.2);

    this.nextBlinkTime = 2.6;
    this.blinkProgress = -1;

    this.blendPos = {};
    this.blendRot = {};
    for (const name of Object.keys(this.bones)) {
      this.blendPos[name] = new THREE.Vector3();
      this.blendRot[name] = new THREE.Vector3();
    }

    this._tmpVec = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
    this._tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  setMode(newMode) {
    this.mode = newMode;
  }

  setDeterministicState(mode, phase = 0, time = 0) {
    this.mode = mode;
    this.gaitPhase = ((phase % 1) + 1) % 1;
    this.time = time;
    this.currentSpeedMps = getGaitPhysicalSpeed(mode) * this.speed;

    const tailTarget = this._evalTailTarget(mode, this.gaitPhase, time);
    this.tailSpringBase.reset(tailTarget.baseX);
    this.tailSpringMid.reset(tailTarget.midX);
    this.tailSpringLower.reset(tailTarget.lowerX);
    this.tailSwaySpring.reset(tailTarget.swayZ);

    this._evaluateAndApply(1.0, 0.016, true);
  }

  update(dt) {
    if (this.paused) return;
    const rawDt = Math.min(dt, 0.05);
    const scaledDt = rawDt * this.speed;
    this.time += scaledDt;

    const gCfg = GAIT_CONFIGS[this.mode];
    const freq = gCfg ? gCfg.freq : (this.mode === 'idle' ? 0.25 : 0);
    if (freq > 0) {
      this.gaitPhase = (this.gaitPhase + scaledDt * freq) % 1.0;
    }

    const targetSpeed = getGaitPhysicalSpeed(this.mode) * this.speed;
    const speedAlpha = 1.0 - Math.exp(-rawDt * 8.0);
    this.currentSpeedMps = THREE.MathUtils.lerp(this.currentSpeedMps, targetSpeed, speedAlpha);

    const smoothAlpha = 1.0 - Math.exp(-rawDt * 12.0);
    this._evaluateAndApply(smoothAlpha, rawDt, false);
    this._updateBlink(scaledDt);
  }

  _updateBlink(dt) {
    const restLid = -0.46;
    if (this.mode === 'stance') {
      this.eyes.upperLidL.rotation.x = restLid;
      this.eyes.upperLidR.rotation.x = restLid;
      return;
    }
    if (this.blinkProgress < 0 && this.time >= this.nextBlinkTime) {
      this.blinkProgress = 0;
      this.nextBlinkTime = this.time + 3.0 + ((Math.sin(this.time * 7.3) * 0.5 + 0.5) * 3.6);
    }
    let closeAmt = 0;
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt / 0.17;
      if (this.blinkProgress >= 1.0) this.blinkProgress = -1;
      else closeAmt = Math.sin(this.blinkProgress * Math.PI);
    }
    const lidRot = THREE.MathUtils.lerp(restLid, 0.30, closeAmt);
    this.eyes.upperLidL.rotation.x = lidRot;
    this.eyes.upperLidR.rotation.x = lidRot;
  }

  /**
   * Natural gravity-draped arched plume tail targets (lifts at dock, curves gracefully DOWNWARD mid-tail
   * instead of sticking straight back like a rigid broomstick!).
   */
  _evalTailTarget(mode, phase, t) {
    const w = phase * Math.PI * 2;
    if (mode === 'stance') {
      return { baseX: 0, midX: 0, lowerX: 0, swayZ: 0 };
    }
    if (mode === 'idle') {
      const swish = Math.sin(t * 1.15) * 0.06 + Math.pow(Math.max(0, Math.sin(t * 0.42)), 8) * Math.sin(t * 6.0) * 0.28;
      return { baseX: 0.05 + Math.abs(swish) * 0.10, midX: -0.02, lowerX: -0.02, swayZ: swish };
    }
    if (mode === 'walk') {
      return {
        baseX: 0.16 + Math.sin(w * 2) * 0.03,
        midX: -0.08 + Math.sin(w * 2 - 0.7) * 0.04, // Graceful downward waterfall arch!
        lowerX: -0.05 + Math.sin(w * 2 - 1.4) * 0.04,
        swayZ: Math.sin(w - 0.8) * 0.09,
      };
    }
    if (mode === 'trot') {
      const bounce = Math.sin(w * 2 - 0.35);
      return {
        baseX: 0.42 + bounce * 0.06,               // Proudly carried Warmblood tail dock!
        midX: -0.22 + Math.sin(w * 2 - 1.0) * 0.07, // Soft curving plume arch!
        lowerX: -0.14 + Math.sin(w * 2 - 1.8) * 0.08,
        swayZ: Math.sin(w) * 0.10,
      };
    }
    // Gallop: lifted dock curving gracefully into a flowing S-wave wind plume!
    return {
      baseX: 0.52 + Math.sin(w - 0.8) * 0.08,
      midX: -0.10 + Math.sin(w - 1.5) * 0.14,
      lowerX: -0.12 + Math.sin(w - 2.3) * 0.18,
      swayZ: Math.sin(w - 0.4) * 0.09,
    };
  }

  _evaluateAndApply(alpha, dt, deterministic) {
    const corePos = {};
    const coreRot = {};
    const coreNames = [
      'root', 'pelvis', 'spineMid', 'withers',
      'neckBase', 'neckMid', 'neckUpper', 'head', 'jaw', 'earL', 'earR',
      'tailBase', 'tailMid', 'tailLower', 'tailTip',
    ];
    for (const n of coreNames) {
      corePos[n] = new THREE.Vector3();
      coreRot[n] = new THREE.Vector3();
    }

    const p = this.gaitPhase;
    const t = this.time;

    if (this.mode === 'idle') {
      this._evalCoreIdle(t, coreRot, corePos);
    } else if (this.mode === 'walk') {
      this._evalCoreWalk(p, t, coreRot, corePos);
    } else if (this.mode === 'trot') {
      this._evalCoreTrot(p, t, coreRot, corePos);
    } else if (this.mode === 'gallop') {
      this._evalCoreGallop(p, t, coreRot, corePos);
    }

    const tailT = this._evalTailTarget(this.mode, p, t);
    let tbX, tmX, tlX, tSway;
    if (deterministic) {
      tbX = tailT.baseX; tmX = tailT.midX; tlX = tailT.lowerX; tSway = tailT.swayZ;
    } else {
      tbX = this.tailSpringBase.step(tailT.baseX, dt);
      tmX = this.tailSpringMid.step(tailT.midX, dt);
      tlX = this.tailSpringLower.step(tailT.lowerX, dt);
      tSway = this.tailSwaySpring.step(tailT.swayZ, dt);
    }
    coreRot.tailBase.set(tbX, 0, tSway * 0.60);
    coreRot.tailMid.set(tmX, 0, tSway * 0.85);
    coreRot.tailLower.set(tlX, 0, tSway * 0.78);

    for (const n of coreNames) {
      this.blendPos[n].lerp(corePos[n], alpha);
      this.blendRot[n].lerp(coreRot[n], alpha);
      const b = this.bones[n];
      b.position.copy(this.restPose[n].position).add(this.blendPos[n]);
      b.rotation.set(this.blendRot[n].x, this.blendRot[n].y, this.blendRot[n].z, 'YXZ');
    }

    this.bones.spineMid.scale.set(1, 1, 1);
    this.horse.group.updateMatrixWorld(true);

    const gCfg = GAIT_CONFIGS[this.mode];
    const legSpecs = [
      { key: 'foreL', prefix: 'fore', tag: 'L', bendDir: -1 },
      { key: 'foreR', prefix: 'fore', tag: 'R', bendDir: -1 },
      { key: 'hindL', prefix: 'hind', tag: 'L', bendDir: +1 },
      { key: 'hindR', prefix: 'hind', tag: 'R', bendDir: +1 },
    ];

    for (const spec of legSpecs) {
      const targetLegRot = this._solveLegIK(spec, gCfg, p, t);
      for (const [bName, rotX] of Object.entries(targetLegRot)) {
        const legAlpha = deterministic ? 1.0 : Math.min(1.0, alpha * 1.65);
        this.blendRot[bName].x = THREE.MathUtils.lerp(this.blendRot[bName].x, rotX, legAlpha);
        this.blendRot[bName].y = THREE.MathUtils.lerp(this.blendRot[bName].y, 0, legAlpha);
        this.blendRot[bName].z = THREE.MathUtils.lerp(this.blendRot[bName].z, 0, legAlpha);
        const bone = this.bones[bName];
        bone.rotation.set(this.blendRot[bName].x, this.blendRot[bName].y, this.blendRot[bName].z, 'YXZ');
      }
    }

    this.horse.group.updateMatrixWorld(true);
  }

  _solveLegIK(spec, gCfg, phase, _t) {
    const { key, prefix, tag } = spec;
    const isFore = prefix === 'fore';
    const b0Name = isFore ? `shoulder${tag}` : `hip${tag}`;
    const b1Name = isFore ? `elbow${tag}`    : `stifle${tag}`;
    const b2Name = isFore ? `knee${tag}`     : `hock${tag}`;
    const b3Name = `${prefix}Fetlock${tag}`;
    const b4Name = `${prefix}Coronet${tag}`;

    if (!gCfg) {
      if (this.mode === 'idle') {
        return this._solveExactToWorldHoof(
          spec,
          JOINTS[`${prefix}Hoof${tag}`][1],
          JOINTS[`${prefix}Hoof${tag}`][2],
          this.legChains[key].pastern.psiRest,
          0.0,
          0.0
        );
      }
      return { [b0Name]: 0, [b1Name]: 0, [b2Name]: 0, [b3Name]: 0, [b4Name]: 0 };
    }

    const legCfg = isFore ? gCfg.fore : gCfg.hind;
    const u = ((phase - gCfg.phases[key]) % 1.0 + 1.0) % 1.0;
    const target = evalLegTarget(u, legCfg);

    return this._solveExactToWorldHoof(
      spec,
      target.y,
      target.z,
      target.pasternPsi,
      target.hoofPitch,
      target.upperDrive
    );
  }

  _solveExactToWorldHoof(spec, hoofY, hoofZ, pasternPsi, hoofPitch, upperDrive) {
    const { key, prefix, tag, bendDir } = spec;
    const chain = this.legChains[key];
    const isFore = prefix === 'fore';

    const b0Name = isFore ? `shoulder${tag}` : `hip${tag}`;
    const b1Name = isFore ? `elbow${tag}`    : `stifle${tag}`;
    const b2Name = isFore ? `knee${tag}`     : `hock${tag}`;
    const b3Name = `${prefix}Fetlock${tag}`;
    const b4Name = `${prefix}Coronet${tag}`;

    const b0 = this.bones[b0Name];
    b0.getWorldPosition(this._tmpVec);
    const rootY = this._tmpVec.y;
    const rootZ = this._tmpVec.z;

    b0.parent.getWorldQuaternion(this._tmpQuat);
    this._tmpEuler.setFromQuaternion(this._tmpQuat, 'YXZ');
    const parentPitchX = this._tmpEuler.x;

    // 1. Coronet world position directly above hoof sole target
    const hoofWorldPsi = chain.hoof.psiRest + hoofPitch;
    const coronetY = hoofY + chain.hoof.len * Math.cos(hoofWorldPsi);
    const coronetZ = hoofZ + chain.hoof.len * Math.sin(hoofWorldPsi);

    // 2. Fetlock world position directly above coronet along spring-loaded pastern
    const fetlockY = coronetY + chain.pastern.len * Math.cos(pasternPsi);
    const fetlockZ = coronetZ + chain.pastern.len * Math.sin(pasternPsi);

    // 3. Position proximal segment (Shoulder->Elbow or Hip->Stifle) with natural reach sharing
    //    so Shoulder & Elbow (and Hip & Stifle) share extreme extension smoothly with ZERO chest/buttock shear!
    const psiToFetlock = sagittalAngle(fetlockY - rootY, fetlockZ - rootZ);
    const maxIKReach = chain.mid.len + chain.lower.len - 0.008;
    const restToTargetDelta = wrapAngle(psiToFetlock - (isFore ? -0.10 : 0.10));
    let psi0 = chain.upper.psiRest + upperDrive * 0.65 + clamp(restToTargetDelta * (isFore ? 0.52 : 0.42), -0.58, 0.46);
    let p1Y = rootY - chain.upper.len * Math.cos(psi0);
    let p1Z = rootZ - chain.upper.len * Math.sin(psi0);
    let distToFetlock = Math.hypot(fetlockY - p1Y, fetlockZ - p1Z);

    if (distToFetlock > maxIKReach) {
      for (let it = 0; it < 8 && distToFetlock > maxIKReach; it++) {
        psi0 = psi0 + wrapAngle(psiToFetlock - psi0) * 0.35;
        p1Y = rootY - chain.upper.len * Math.cos(psi0);
        p1Z = rootZ - chain.upper.len * Math.sin(psi0);
        distToFetlock = Math.hypot(fetlockY - p1Y, fetlockZ - p1Z);
      }
    }

    // 4. Exact Analytic 2-Bone Law-of-Cosines IK (Elbow->Knee->Fetlock or Stifle->Hock->Fetlock)
    const ik = solveSagittal2BoneIK(
      p1Y, p1Z,
      fetlockY, fetlockZ,
      chain.mid.len,
      chain.lower.len,
      bendDir
    );

    const worldRot0 = wrapAngle(psi0 - chain.upper.psiRest);
    const worldRot1 = wrapAngle(ik.psi1 - chain.mid.psiRest);
    const worldRot2 = wrapAngle(ik.psi2 - chain.lower.psiRest);
    const worldRot3 = wrapAngle(pasternPsi - chain.pastern.psiRest);
    const worldRot4 = wrapAngle(hoofPitch);

    return {
      [b0Name]: wrapAngle(worldRot0 - parentPitchX),
      [b1Name]: wrapAngle(worldRot1 - worldRot0),
      [b2Name]: wrapAngle(worldRot2 - worldRot1),
      [b3Name]: wrapAngle(worldRot3 - worldRot2),
      [b4Name]: wrapAngle(worldRot4 - worldRot3),
    };
  }

  // =========================================================================
  // CORE SPINE / TORSO / NECK / HEAD DYNAMICS
  // =========================================================================

  _evalCoreIdle(t, rot, pos) {
    const breath = Math.sin(t * 1.42);
    pos.root.y = breath * 0.004;
    pos.root.x = Math.sin(t * 0.36) * 0.006;

    rot.spineMid.x = breath * 0.006;
    rot.withers.x = -breath * 0.005;

    const lookYaw = Math.sin(t * 0.32) * 0.14 + Math.sin(t * 0.15) * 0.05;
    const nod = Math.sin(t * 0.65) * 0.026 + breath * 0.008;

    rot.neckBase.set(nod * 0.40, lookYaw * 0.28, -lookYaw * 0.04);
    rot.neckMid.set(nod * 0.30, lookYaw * 0.32, 0);
    rot.neckUpper.set(-nod * 0.16, lookYaw * 0.22, 0);
    rot.head.set(-nod * 0.42 + Math.sin(t * 1.0) * 0.010, lookYaw * 0.28, Math.sin(t * 0.32) * 0.022);

    const earScanL = Math.sin(t * 0.90) * 0.11 + Math.pow(Math.max(0, Math.sin(t * 1.6 + 0.4)), 6) * -0.26;
    const earScanR = Math.sin(t * 0.78 + 1.4) * 0.11 + Math.pow(Math.max(0, Math.sin(t * 1.3 + 2.6)), 6) * -0.24;
    rot.earL.set(earScanL * 0.32, earScanL * 0.85, 0);
    rot.earR.set(earScanR * 0.32, -earScanR * 0.85, 0);
  }

  _evalCoreWalk(phase, t, rot, pos) {
    const w = phase * Math.PI * 2;
    // Elevated inverted-pendulum walk height so supporting front legs lock straight & pillar-like!
    pos.root.y = -0.006 + Math.sin(w * 2 - 1.2) * 0.015;
    pos.root.x = Math.sin(w) * 0.012;

    rot.root.x = Math.sin(w * 2) * 0.014;
    rot.root.z = Math.sin(w) * 0.022;
    rot.pelvis.y = Math.sin(w) * 0.044;
    rot.pelvis.z = Math.cos(w) * 0.024;
    rot.spineMid.y = -Math.sin(w) * 0.024;
    rot.withers.y = -Math.sin(w) * 0.030;

    const headNod = Math.sin(w * 2 - 0.7);
    rot.neckBase.set(0.05 + headNod * 0.045, Math.sin(w) * 0.026, 0);
    rot.neckMid.set(0.025 + headNod * 0.030, Math.sin(w) * 0.016, 0);
    rot.neckUpper.set(-0.02 - headNod * 0.015, 0, 0);
    rot.head.set(-0.03 - headNod * 0.042, Math.sin(t * 0.45) * 0.03, 0);

    rot.earL.set(Math.sin(w * 2) * 0.03, Math.sin(t * 1.0) * 0.06, 0);
    rot.earR.set(Math.sin(w * 2 + 0.3) * 0.03, -Math.sin(t * 0.85) * 0.06, 0);
  }

  _evalCoreTrot(phase, t, rot, pos) {
    const w = phase * Math.PI * 2;
    // Spring-mass trot: firmly grounded through all 43% diagonal stance + crisp 10-12% suspension!
    const springWave = -Math.sin(w * 2 + 0.20);
    pos.root.y = -0.010 + springWave * 0.044;

    rot.root.x = Math.cos(w * 2) * 0.022;
    rot.root.z = Math.sin(w) * 0.022;
    rot.pelvis.y = Math.sin(w) * 0.038;
    rot.spineMid.x = -springWave * 0.016;
    rot.withers.y = -Math.sin(w) * 0.030;

    rot.neckBase.set(-0.06 - springWave * 0.030, 0, 0);
    rot.neckMid.set(-0.05 - springWave * 0.020, 0, 0);
    rot.neckUpper.set(0.05 + springWave * 0.015, 0, 0);
    rot.head.set(0.10 + springWave * 0.030, Math.sin(t * 0.55) * 0.024, 0);

    rot.earL.set(0.05 + springWave * 0.035, 0.04, 0);
    rot.earR.set(0.05 + springWave * 0.035, -0.04, 0);
  }

  _evalCoreGallop(phase, _t, rot, pos) {
    const w = phase * Math.PI * 2;
    const flightLift = Math.cos(w + 0.52);
    const foreVaultDip = -Math.exp(-Math.pow(((phase - 0.58 + 1.5) % 1) - 0.5, 2) * 28.0) * 0.040;
    pos.root.y = 0.002 + flightLift * 0.088 + foreVaultDip;

    const bodyPitch = -Math.sin(w + 0.25) * 0.115;
    rot.root.x = bodyPitch;

    const spineCoil = Math.cos(w + 0.55);
    rot.pelvis.x   =  spineCoil * 0.130;
    rot.spineMid.x =  spineCoil * 0.072;
    rot.withers.x  = -spineCoil * 0.062;

    const neckReach = -Math.sin(w - 0.55);
    rot.neckBase.set(0.14 + neckReach * 0.14, 0, 0);
    rot.neckMid.set(0.08 + neckReach * 0.09, 0, 0);
    rot.neckUpper.set(0.03 + neckReach * 0.04, 0, 0);
    rot.head.set(-0.08 - neckReach * 0.11, 0, 0);

    rot.earL.set(-0.16 + Math.sin(w) * 0.04, -0.14, 0);
    rot.earR.set(-0.16 + Math.sin(w) * 0.04, 0.14, 0);
  }
}
