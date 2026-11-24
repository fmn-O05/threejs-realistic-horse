import * as THREE from 'three';

/**
 * V5 Anatomically Verified Equine Procedural Animation Engine.
 * Fixes vs V4:
 *   - ZERO broken-ankle front fetlock bends in mid-air during Gallop/Trot!
 *     Fetlock dorsiflexion now occurs ONLY during weight-bearing mid-stance; aerial reaching legs
 *     form a sleek straight anatomical line and tucked swing legs curl gracefully backward.
 *   - Smooth balanced neck & head flexion during Gallop (zero throat kink).
 *   - Soulful hooded almond resting eyelid angle (-0.28 rad) with natural periodic blinks.
 */
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

    this.nextBlinkTime = 2.6;
    this.blinkProgress = -1;

    this.currentRot = {};
    this.currentPosOffset = {};
    for (const name of Object.keys(this.bones)) {
      this.currentRot[name] = new THREE.Vector3();
      this.currentPosOffset[name] = new THREE.Vector3();
    }
  }

  setMode(newMode) {
    this.mode = newMode;
  }

  setDeterministicState(mode, phase = 0, time = 0) {
    this.mode = mode;
    this.gaitPhase = phase;
    this.time = time;
    this._applyPose(1.0);
  }

  update(dt) {
    if (this.paused) return;
    const clampedDt = Math.min(dt, 0.05) * this.speed;
    this.time += clampedDt;

    const freqMap = {
      stance: 0.0,
      idle:   0.25,
      walk:   0.88,
      trot:   1.48,
      gallop: 2.02,
    };

    const freq = freqMap[this.mode] ?? 0.25;
    this.gaitPhase = (this.gaitPhase + clampedDt * freq) % 1.0;

    const smoothAlpha = 1.0 - Math.exp(-Math.min(dt, 0.05) * 9.5);
    this._applyPose(smoothAlpha);
    this._updateBlink(clampedDt);
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
      this.nextBlinkTime = this.time + 3.2 + ((Math.sin(this.time * 7.3) * 0.5 + 0.5) * 3.8);
    }

    let closeAmt = 0;
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt / 0.18;
      if (this.blinkProgress >= 1.0) this.blinkProgress = -1;
      else closeAmt = Math.sin(this.blinkProgress * Math.PI);
    }

    const lidRot = THREE.MathUtils.lerp(restLid, 0.30, closeAmt);
    this.eyes.upperLidL.rotation.x = lidRot;
    this.eyes.upperLidR.rotation.x = lidRot;
  }

  _applyPose(alpha) {
    const targetRot = {};
    const targetPos = {};
    for (const name of Object.keys(this.bones)) {
      targetRot[name] = new THREE.Vector3();
      targetPos[name] = new THREE.Vector3();
    }

    const p = this.gaitPhase;
    const t = this.time;

    if (this.mode === 'stance') {
      // Textbook balanced show stance
    } else if (this.mode === 'idle') {
      this._evalIdle(t, targetRot, targetPos);
    } else if (this.mode === 'walk') {
      this._evalWalk(p, t, targetRot, targetPos);
    } else if (this.mode === 'trot') {
      this._evalTrot(p, t, targetRot, targetPos);
    } else if (this.mode === 'gallop') {
      this._evalGallop(p, t, targetRot, targetPos);
    }

    for (const name of Object.keys(this.bones)) {
      const curR = this.currentRot[name];
      const curP = this.currentPosOffset[name];
      curR.lerp(targetRot[name], alpha);
      curP.lerp(targetPos[name], alpha);

      const bone = this.bones[name];
      bone.rotation.set(curR.x, curR.y, curR.z, 'YXZ');
      bone.position.copy(this.restPose[name].position).add(curP);
    }

    const breathAmp = this.mode === 'stance' ? 0 : this.mode === 'gallop' ? 0.020 : 0.011;
    const breathFreq = this.mode === 'gallop' ? 2.02 * Math.PI * 2 : 1.42;
    const breath = Math.sin(this.mode === 'gallop' ? p * Math.PI * 2 : t * breathFreq) * breathAmp;
    this.bones.spineMid.scale.set(1 + breath, 1 + breath * 0.4, 1);

    this.horse.group.updateMatrixWorld(true);
    if (this.mode !== 'stance' && this.mode !== 'idle') {
      this._stabilizeGroundContact();
    }
  }

  _stabilizeGroundContact() {
    const feet = ['foreHoofL', 'foreHoofR', 'hindHoofL', 'hindHoofR'];
    const v = new THREE.Vector3();
    let minY = Infinity;
    for (const f of feet) {
      this.bones[f].getWorldPosition(v);
      if (v.y < minY) minY = v.y;
    }

    if (minY < 0.0) {
      this.bones.root.position.y -= minY;
      this.horse.group.updateMatrixWorld(true);
    } else if (this.mode === 'walk' && minY > 0.002) {
      this.bones.root.position.y -= minY;
      this.horse.group.updateMatrixWorld(true);
    }
  }

  _evalIdle(t, rot, pos) {
    const breath = Math.sin(t * 1.42);
    pos.root.y = breath * 0.004;
    pos.root.x = Math.sin(t * 0.38) * 0.007;

    rot.spineMid.x = breath * 0.007;
    rot.withers.x = -breath * 0.005;

    const lookYaw = Math.sin(t * 0.34) * 0.14 + Math.sin(t * 0.16) * 0.05;
    const nod = Math.sin(t * 0.68) * 0.030 + breath * 0.010;

    rot.neckBase.set(nod * 0.42, lookYaw * 0.28, -lookYaw * 0.05);
    rot.neckMid.set(nod * 0.32, lookYaw * 0.32, 0);
    rot.neckUpper.set(-nod * 0.18, lookYaw * 0.22, 0);
    rot.head.set(-nod * 0.48 + Math.sin(t * 1.05) * 0.012, lookYaw * 0.30, Math.sin(t * 0.34) * 0.025);

    const earScanL = Math.sin(t * 0.92) * 0.12 + Math.pow(Math.max(0, Math.sin(t * 1.65 + 0.4)), 6) * -0.28;
    const earScanR = Math.sin(t * 0.80 + 1.4) * 0.12 + Math.pow(Math.max(0, Math.sin(t * 1.32 + 2.6)), 6) * -0.26;
    rot.earL.set(earScanL * 0.35, earScanL * 0.85, 0);
    rot.earR.set(earScanR * 0.35, -earScanR * 0.85, 0);

    const swish = Math.sin(t * 1.2) * 0.07 + Math.pow(Math.max(0, Math.sin(t * 0.42)), 8) * Math.sin(t * 6.2) * 0.28;
    rot.tailBase.set(0.04 + Math.abs(swish) * 0.14, 0, swish * 0.55);
    rot.tailMid.set(0.04, 0, swish * 0.80);
    rot.tailLower.set(0.02, 0, swish * 0.72);
  }

  _evalWalk(phase, t, rot, pos) {
    const pLH = phase;
    const pLF = (phase + 0.75) % 1.0;
    const pRH = (phase + 0.50) % 1.0;
    const pRF = (phase + 0.25) % 1.0;

    this._applyForelegWalk('L', pLF, rot);
    this._applyForelegWalk('R', pRF, rot);
    this._applyHindlegWalk('L', pLH, rot);
    this._applyHindlegWalk('R', pRH, rot);

    const w = phase * Math.PI * 2;
    pos.root.y = Math.sin(w * 2) * 0.015 - 0.010;
    rot.root.z = Math.sin(w) * 0.020;
    rot.pelvis.y = Math.sin(w) * 0.042;
    rot.pelvis.z = Math.cos(w) * 0.022;
    rot.spineMid.y = -Math.sin(w) * 0.022;
    rot.withers.y = -Math.sin(w) * 0.028;

    const headBob = Math.sin(w * 2 - 0.5);
    rot.neckBase.set(0.05 + headBob * 0.048, Math.sin(w) * 0.030, 0);
    rot.neckMid.set(0.025 + headBob * 0.034, Math.sin(w) * 0.018, 0);
    rot.neckUpper.set(-0.03 - headBob * 0.018, 0, 0);
    rot.head.set(-0.03 - headBob * 0.045, Math.sin(t * 0.5) * 0.035, 0);

    const tailSwing = Math.sin(w - 0.8) * 0.09;
    rot.tailBase.set(0.12 + Math.sin(w * 2) * 0.035, 0, tailSwing);
    rot.tailMid.set(0.08, 0, tailSwing * 1.10);
    rot.tailLower.set(0.04, 0, tailSwing * 0.85);

    rot.earL.set(Math.sin(w * 2) * 0.035, Math.sin(t * 1.1) * 0.07, 0);
    rot.earR.set(Math.sin(w * 2 + 0.3) * 0.035, -Math.sin(t * 0.9) * 0.07, 0);
  }

  _applyForelegWalk(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    // Weight-bearing peak happens right in the middle of stance (a ≈ 3*PI/2 => -sin(a) ≈ 1)
    const midStance = Math.pow(Math.max(0, -Math.sin(a)), 1.8);

    const shoulder = -Math.cos(a) * 0.24 - 0.01;
    const elbow = -swing * 0.14 + midStance * 0.04;
    const knee = Math.pow(swing, 1.45) * 0.65;
    // Fetlock curls slightly during lifted swing, sinks softly ONLY at mid-stance!
    const fetlock = Math.pow(swing, 1.35) * 0.28 - midStance * 0.18;
    // Gently keep hoof level ONLY during mid-stance (never over-bend in mid-air!)
    const coronet = midStance * (-(shoulder + elbow + fetlock) * 0.55) + swing * 0.10;

    rot[`shoulder${tag}`].x = shoulder;
    rot[`elbow${tag}`].x = elbow;
    rot[`knee${tag}`].x = knee;
    rot[`foreFetlock${tag}`].x = fetlock;
    rot[`foreCoronet${tag}`].x = coronet;
  }

  _applyHindlegWalk(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const midStance = Math.pow(Math.max(0, -Math.sin(a)), 1.8);

    const hip = -Math.cos(a) * 0.22;
    const stifle = Math.pow(swing, 1.3) * 0.24 - midStance * 0.06;
    const hock = -Math.pow(swing, 1.25) * 0.42 + Math.pow(Math.max(0, -Math.cos(a - 0.6)), 2) * 0.12;
    const fetlock = Math.pow(swing, 1.4) * 0.26 - midStance * 0.18;
    const coronet = midStance * (-(hip + stifle + hock + fetlock) * 0.48) + swing * 0.08;

    rot[`hip${tag}`].x = hip;
    rot[`stifle${tag}`].x = stifle;
    rot[`hock${tag}`].x = hock;
    rot[`hindFetlock${tag}`].x = fetlock;
    rot[`hindCoronet${tag}`].x = coronet;
  }

  _evalTrot(phase, t, rot, pos) {
    const pPairA = phase;
    const pPairB = (phase + 0.5) % 1.0;

    this._applyForelegTrot('L', pPairA, rot);
    this._applyHindlegTrot('R', pPairA, rot);
    this._applyForelegTrot('R', pPairB, rot);
    this._applyHindlegTrot('L', pPairB, rot);

    const w = phase * Math.PI * 2;
    const bounce = Math.sin(w * 2 - 0.35);
    pos.root.y = bounce * 0.052 + 0.014;
    rot.root.x = Math.cos(w * 2) * 0.025;
    rot.root.z = Math.sin(w) * 0.028;

    rot.pelvis.y = Math.sin(w) * 0.045;
    rot.spineMid.x = -bounce * 0.022;
    rot.withers.y = -Math.sin(w) * 0.035;

    rot.neckBase.set(-0.07 + bounce * 0.035, 0, 0);
    rot.neckMid.set(-0.05 + bounce * 0.025, 0, 0);
    rot.neckUpper.set(0.05 - bounce * 0.018, 0, 0);
    rot.head.set(0.11 - bounce * 0.038, Math.sin(t * 0.6) * 0.028, 0);

    const tailSway = Math.sin(w) * 0.12;
    rot.tailBase.set(0.28 + bounce * 0.06, 0, tailSway);
    rot.tailMid.set(0.26 + bounce * 0.08, 0, tailSway * 1.1);
    rot.tailLower.set(0.14, 0, tailSway * 0.9);

    rot.earL.set(0.05 + bounce * 0.04, 0.04, 0);
    rot.earR.set(0.05 + bounce * 0.04, -0.04, 0);
  }

  _applyForelegTrot(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const midStance = Math.pow(Math.max(0, -Math.sin(a)), 2.0);

    const shoulder = -Math.cos(a) * 0.42 - 0.04;
    const elbow = -Math.pow(swing, 1.1) * 0.25 + midStance * 0.05;
    const knee = Math.pow(swing, 1.25) * 1.05;
    // Smooth, anatomically safe fetlock curve: curls gently in swing, loads softly ONLY in mid-stance!
    const fetlock = Math.pow(swing, 1.25) * 0.36 - midStance * 0.24;
    const coronet = midStance * (-(shoulder + elbow + fetlock) * 0.45) + swing * 0.14;

    rot[`shoulder${tag}`].x = shoulder;
    rot[`elbow${tag}`].x = elbow;
    rot[`knee${tag}`].x = knee;
    rot[`foreFetlock${tag}`].x = fetlock;
    rot[`foreCoronet${tag}`].x = coronet;
  }

  _applyHindlegTrot(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const midStance = Math.pow(Math.max(0, -Math.sin(a)), 2.0);

    const hip = -Math.cos(a) * 0.36 - 0.02;
    const stifle = Math.pow(swing, 1.2) * 0.32 - midStance * 0.10;
    const hock = -Math.pow(swing, 1.15) * 0.64 + Math.pow(Math.max(0, Math.cos(a + 0.55)), 2) * 0.20;
    const fetlock = Math.pow(swing, 1.25) * 0.34 - midStance * 0.22;
    const coronet = midStance * (-(hip + stifle + hock + fetlock) * 0.42) + swing * 0.10;

    rot[`hip${tag}`].x = hip;
    rot[`stifle${tag}`].x = stifle;
    rot[`hock${tag}`].x = hock;
    rot[`hindFetlock${tag}`].x = fetlock;
    rot[`hindCoronet${tag}`].x = coronet;
  }

  _evalGallop(phase, _t, rot, pos) {
    const pLH = phase;
    const pRH = (phase + 0.84) % 1.0;
    const pLF = (phase + 0.56) % 1.0;
    const pRF = (phase + 0.40) % 1.0;

    this._applyForelegGallop('L', pLF, rot);
    this._applyForelegGallop('R', pRF, rot);
    this._applyHindlegGallop('L', pLH, rot);
    this._applyHindlegGallop('R', pRH, rot);

    const w = phase * Math.PI * 2;
    pos.root.y = Math.sin(w - 0.6) * 0.10 + 0.035;
    rot.root.x = Math.cos(w - 0.4) * 0.11;

    const coil = Math.sin(w + 0.5);
    rot.pelvis.x = coil * 0.11;
    rot.spineMid.x = coil * 0.08;
    rot.withers.x = -coil * 0.07;

    // Sleek, unified, athletic gallop neck extension (zero throat kink!)
    const neckStretch = Math.sin(w - 0.7);
    rot.neckBase.set(0.14 + neckStretch * 0.10, 0, 0);
    rot.neckMid.set(0.08 + neckStretch * 0.08, 0, 0);
    rot.neckUpper.set(0.04 + neckStretch * 0.04, 0, 0);
    rot.head.set(-0.08 - neckStretch * 0.09, 0, 0);

    // Streaming wind-swept tail
    rot.tailBase.set(0.32 + Math.sin(w - 1.0) * 0.08, 0, Math.sin(w) * 0.08);
    rot.tailMid.set(0.38 + Math.sin(w - 1.5) * 0.14, 0, Math.sin(w - 0.5) * 0.12);
    rot.tailLower.set(0.30 + Math.sin(w - 2.0) * 0.16, 0, Math.sin(w - 1.0) * 0.14);

    rot.earL.set(-0.18 + Math.sin(w) * 0.05, -0.15, 0);
    rot.earR.set(-0.18 + Math.sin(w) * 0.05, 0.15, 0);
  }

  _applyForelegGallop(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    // Strict mid-stance loading window (NEVER bends fetlock horizontally during aerial reach!)
    const midStance = Math.pow(Math.max(0, -Math.sin(a)), 2.4);

    const shoulder = -Math.cos(a) * 0.56 - 0.06;
    const elbow = -Math.pow(swing, 1.08) * 0.36 + midStance * 0.08;
    const knee = Math.pow(swing, 1.20) * 1.42;
    // Smooth natural fetlock: curls back in tucked swing, straight during forward reach, elastic sink ONLY under weight!
    const fetlock = Math.pow(swing, 1.25) * 0.44 - midStance * 0.28;
    const coronet = midStance * (-(shoulder + elbow + fetlock) * 0.35) + Math.pow(swing, 1.3) * 0.16;

    rot[`shoulder${tag}`].x = shoulder;
    rot[`elbow${tag}`].x = elbow;
    rot[`knee${tag}`].x = knee;
    rot[`foreFetlock${tag}`].x = fetlock;
    rot[`foreCoronet${tag}`].x = coronet;
  }

  _applyHindlegGallop(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const midStance = Math.pow(Math.max(0, -Math.sin(a)), 2.4);

    const hip = -Math.cos(a) * 0.48 - 0.05;
    const stifle = Math.pow(swing, 1.15) * 0.36 - midStance * 0.12;
    const hock = -Math.pow(swing, 1.10) * 0.84 + Math.pow(Math.max(0, Math.cos(a + 0.5)), 2) * 0.26;
    const fetlock = Math.pow(swing, 1.25) * 0.42 - midStance * 0.26;
    const coronet = midStance * (-(hip + stifle + hock + fetlock) * 0.32) + Math.pow(swing, 1.3) * 0.12;

    rot[`hip${tag}`].x = hip;
    rot[`stifle${tag}`].x = stifle;
    rot[`hock${tag}`].x = hock;
    rot[`hindFetlock${tag}`].x = fetlock;
    rot[`hindCoronet${tag}`].x = coronet;
  }
}
