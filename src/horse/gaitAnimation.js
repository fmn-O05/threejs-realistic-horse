import * as THREE from 'three';

/**
 * Anatomically authentic equine procedural animation engine.
 *
 * Sign conventions strictly verified against right-handed (+X left, +Y up, +Z forward):
 *   Foreleg shoulder/elbow:  rotX < 0 = swing FORWARD; rotX > 0 = swing BACKWARD
 *   Front knee (carpus):     rotX > 0 = bend BACKWARD ONLY (never negative!)
 *   Hind hip:                rotX < 0 = swing FORWARD under belly; rotX > 0 = push BACKWARD
 *   Hind stifle:             rotX > 0 = flex backward; rotX < 0 = extend
 *   Hind hock (tarsus):      rotX < 0 = bend FORWARD (opposite of front knee!); small >0 = push extension
 *   Fetlocks:                rotX < 0 = weight-bearing sink; rotX > 0 = lifted swing curl
 *   Neck:                    rotX > 0 = lower/stretch forward; rotX < 0 = arch higher
 *   Head:                    rotX > 0 = tuck nose toward chest; rotX < 0 = raise nose
 *   Tail:                    rotX > 0 = lift/stream backward; rotZ = side-to-side swish
 */
export class HorseAnimator {
  constructor(horse) {
    this.horse = horse;
    this.bones = horse.rig.boneMap;
    this.restPose = horse.rig.restPose;
    this.eyes = horse.eyes;

    this.mode = 'idle'; // 'stance' | 'idle' | 'walk' | 'trot' | 'gallop'
    this.targetMode = 'idle';
    this.blend = 1.0;

    this.time = 0;
    this.gaitPhase = 0;
    this.speed = 1.0;
    this.paused = false;

    // Natural eye-blink state
    this.nextBlinkTime = 2.4;
    this.blinkProgress = -1;

    // Store per-bone current smoothed euler rotations for butter-smooth gait transitions
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

  /**
   * Deterministic pose snap for headless inspection or camera verification!
   */
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

    // Real-world stride frequencies (cycles per second)
    const freqMap = {
      stance: 0.0,
      idle:   0.25,
      walk:   0.88,  // ~53 strides/min relaxed athletic walk
      trot:   1.48,  // ~89 strides/min expressive Warmblood trot
      gallop: 2.05,  // ~123 strides/min collected/working canter-gallop
    };

    const freq = freqMap[this.mode] ?? 0.25;
    this.gaitPhase = (this.gaitPhase + clampedDt * freq) % 1.0;

    // Smooth exponential interpolation factor for seamless gait transitions
    const smoothAlpha = 1.0 - Math.exp(-Math.min(dt, 0.05) * 9.5);
    this._applyPose(smoothAlpha);
    this._updateBlink(clampedDt);
  }

  _updateBlink(dt) {
    if (this.mode === 'stance') {
      this.eyes.upperLidL.rotation.x = -0.52;
      this.eyes.upperLidR.rotation.x = -0.52;
      return;
    }

    if (this.blinkProgress < 0 && this.time >= this.nextBlinkTime) {
      this.blinkProgress = 0;
      this.nextBlinkTime = this.time + 3.2 + ((Math.sin(this.time * 7.3) * 0.5 + 0.5) * 3.8);
    }

    let closeAmt = 0;
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt / 0.18; // realistic 180ms blink
      if (this.blinkProgress >= 1.0) {
        this.blinkProgress = -1;
      } else {
        closeAmt = Math.sin(this.blinkProgress * Math.PI);
      }
    }

    const lidRot = THREE.MathUtils.lerp(-0.52, 0.34, closeAmt);
    this.eyes.upperLidL.rotation.x = lidRot;
    this.eyes.upperLidR.rotation.x = lidRot;
  }

  _applyPose(alpha) {
    // Prepare target rotations & position offsets for all bones
    const targetRot = {};
    const targetPos = {};
    for (const name of Object.keys(this.bones)) {
      targetRot[name] = new THREE.Vector3();
      targetPos[name] = new THREE.Vector3();
    }

    const p = this.gaitPhase;
    const t = this.time;

    if (this.mode === 'stance') {
      // Textbook clean athletic show conformation stance (zero displacement!)
    } else if (this.mode === 'idle') {
      this._evalIdle(t, targetRot, targetPos);
    } else if (this.mode === 'walk') {
      this._evalWalk(p, t, targetRot, targetPos);
    } else if (this.mode === 'trot') {
      this._evalTrot(p, t, targetRot, targetPos);
    } else if (this.mode === 'gallop') {
      this._evalGallop(p, t, targetRot, targetPos);
    }

    // Apply smoothed transforms to skeleton
    for (const name of Object.keys(this.bones)) {
      const curR = this.currentRot[name];
      const curP = this.currentPosOffset[name];
      curR.lerp(targetRot[name], alpha);
      curP.lerp(targetPos[name], alpha);

      const bone = this.bones[name];
      bone.rotation.set(curR.x, curR.y, curR.z, 'YXZ');
      bone.position.copy(this.restPose[name].position).add(curP);
    }

    // Subtle breathing ribcage expansion on spineMid
    const breathAmp = this.mode === 'stance' ? 0 : this.mode === 'gallop' ? 0.022 : 0.012;
    const breathFreq = this.mode === 'gallop' ? 2.05 * Math.PI * 2 : 1.45;
    const breath = Math.sin(this.mode === 'gallop' ? p * Math.PI * 2 : t * breathFreq) * breathAmp;
    this.bones.spineMid.scale.set(1 + breath, 1 + breath * 0.45, 1);

    // Keep lowest hoof grounded cleanly during gaits without floating or sinking through ground!
    this.horse.group.updateMatrixWorld(true);
    if (this.mode !== 'stance' && this.mode !== 'idle') {
      this._stabilizeGroundContact();
    }
  }

  _stabilizeGroundContact() {
    // Check lowest coronet height among the 4 legs; keep hooves kissing ground during stance & rising cleanly in suspension!
    const feet = ['foreHoofL', 'foreHoofR', 'hindHoofL', 'hindHoofR'];
    const v = new THREE.Vector3();
    let minY = Infinity;
    for (const f of feet) {
      this.bones[f].getWorldPosition(v);
      if (v.y < minY) minY = v.y;
    }

    // In walk, at least one hoof always contacts ground (minY -> 0).
    // In trot/gallop, brief flying suspension allows minY up to ~0.045 / ~0.095 m, never sinking below y = 0!
    if (minY < 0.0) {
      this.bones.root.position.y -= minY;
      this.horse.group.updateMatrixWorld(true);
    } else if (this.mode === 'walk' && minY > 0.002) {
      this.bones.root.position.y -= minY;
      this.horse.group.updateMatrixWorld(true);
    }
  }

  _evalIdle(t, rot, pos) {
    // Subtle alive breathing, gentle weight shift, attentive head carriage, independent ear flicks & lazy tail swish
    const breath = Math.sin(t * 1.45);
    pos.root.y = breath * 0.0045;
    pos.root.x = Math.sin(t * 0.42) * 0.008;

    rot.spineMid.x = breath * 0.008;
    rot.withers.x = -breath * 0.006;

    // Gentle proud alert head & neck carriage with curious gaze sweep
    const lookYaw = Math.sin(t * 0.36) * 0.14 + Math.sin(t * 0.17) * 0.06;
    const nod = Math.sin(t * 0.72) * 0.035 + breath * 0.012;

    rot.neckBase.set(nod * 0.45, lookYaw * 0.28, -lookYaw * 0.06);
    rot.neckMid.set(nod * 0.35, lookYaw * 0.34, 0);
    rot.neckUpper.set(-nod * 0.20, lookYaw * 0.22, 0);
    rot.head.set(-nod * 0.55 + Math.sin(t * 1.1) * 0.015, lookYaw * 0.32, Math.sin(t * 0.36) * 0.03);

    // Independent expressive equine ear swivels (horses constantly monitor sounds!)
    const earScanL = Math.sin(t * 0.95) * 0.14 + Math.pow(Math.max(0, Math.sin(t * 1.7 + 0.4)), 6) * -0.32;
    const earScanR = Math.sin(t * 0.82 + 1.4) * 0.14 + Math.pow(Math.max(0, Math.sin(t * 1.35 + 2.6)), 6) * -0.28;
    rot.earL.set(earScanL * 0.4, earScanL * 0.9, 0);
    rot.earR.set(earScanR * 0.4, -earScanR * 0.9, 0);

    // Lazy natural tail swish (periodic gentle pendulum + occasional brisk fly swish)
    const swish = Math.sin(t * 1.25) * 0.08 + Math.pow(Math.max(0, Math.sin(t * 0.45)), 8) * Math.sin(t * 6.5) * 0.32;
    rot.tailBase.set(0.05 + Math.abs(swish) * 0.18, 0, swish * 0.65);
    rot.tailMid.set(0.04, 0, swish * 0.85);
    rot.tailLower.set(0.02, 0, swish * 0.75);
  }

  /**
   * Authentic 4-beat lateral equine WALK:
   * Order: Left Hind (0.00) -> Left Fore (0.25) -> Right Hind (0.50) -> Right Fore (0.75).
   */
  _evalWalk(phase, t, rot, pos) {
    const pLH = phase;
    const pLF = (phase + 0.75) % 1.0; // LF follows LH by 0.25 -> peak at 0.25 later
    const pRH = (phase + 0.50) % 1.0;
    const pRF = (phase + 0.25) % 1.0;

    this._applyForelegWalk('L', pLF, rot);
    this._applyForelegWalk('R', pRF, rot);
    this._applyHindlegWalk('L', pLH, rot);
    this._applyHindlegWalk('R', pRH, rot);

    // Subtle hip & shoulder roll + 2x vertical bob per stride
    const w = phase * Math.PI * 2;
    pos.root.y = Math.sin(w * 2) * 0.016 - 0.012;
    rot.root.z = Math.sin(w) * 0.022;
    rot.pelvis.y = Math.sin(w) * 0.045;
    rot.pelvis.z = Math.cos(w) * 0.025;
    rot.spineMid.y = -Math.sin(w) * 0.025;
    rot.withers.y = -Math.sin(w) * 0.032;

    // Characteristic equine walk head-nod (drops slightly as each foreleg takes weight!)
    const headBob = Math.sin(w * 2 - 0.5);
    rot.neckBase.set(0.06 + headBob * 0.055, Math.sin(w) * 0.035, 0);
    rot.neckMid.set(0.03 + headBob * 0.04, Math.sin(w) * 0.02, 0);
    rot.neckUpper.set(-0.04 - headBob * 0.02, 0, 0);
    rot.head.set(-0.04 - headBob * 0.055, Math.sin(t * 0.5) * 0.04, 0);

    // Relaxed rhythmic tail sway
    const tailSwing = Math.sin(w - 0.8) * 0.10;
    rot.tailBase.set(0.14 + Math.sin(w * 2) * 0.04, 0, tailSwing);
    rot.tailMid.set(0.08, 0, tailSwing * 1.15);
    rot.tailLower.set(0.04, 0, tailSwing * 0.9);

    // Attentive slight ear bounce
    rot.earL.set(Math.sin(w * 2) * 0.04, Math.sin(t * 1.1) * 0.08, 0);
    rot.earR.set(Math.sin(w * 2 + 0.3) * 0.04, -Math.sin(t * 0.9) * 0.08, 0);
  }

  _applyForelegWalk(tag, ph, rot) {
    // ph in [0, 0.42): Swing phase (lift, fold knee backward, reach forward)
    // ph in [0.42, 1.0): Stance phase (foot plants forward, sweeps cleanly backward under body)
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a)); // strong during first half

    // Shoulder swings from forward (-0.28) to backward (+0.26)
    const shoulder = -Math.cos(a) * 0.25 - 0.02;
    // Elbow lifts slightly during early swing
    const elbow = -swing * 0.14 + Math.max(0, -Math.sin(a)) * 0.05;
    // Knee bends ONLY BACKWARD (> 0) sharply during mid-swing, locks ~0 during stance!
    const knee = Math.pow(swing, 1.45) * 0.68;
    // Fetlock curls slightly in swing (> 0), sinks/dorsiflexes softly in mid-stance (< 0)!
    const stanceLoad = Math.max(0, -Math.sin(a));
    const fetlock = Math.pow(swing, 1.3) * 0.34 - Math.pow(stanceLoad, 1.2) * 0.24;
    // Keep hoof flat on ground during stance
    const coronet = -(shoulder + elbow + knee + fetlock) * (stanceLoad > 0.1 ? 0.65 : 0.22);

    rot[`shoulder${tag}`].x = shoulder;
    rot[`elbow${tag}`].x = elbow;
    rot[`knee${tag}`].x = knee;
    rot[`foreFetlock${tag}`].x = fetlock;
    rot[`foreCoronet${tag}`].x = coronet;
  }

  _applyHindlegWalk(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const stanceLoad = Math.max(0, -Math.sin(a));

    // Hip swings forward (-0.24) during swing, pushes backward (+0.24) during stance
    const hip = -Math.cos(a) * 0.24;
    // Stifle flexes backward (+ > 0) during early swing, opens during drive
    const stifle = Math.pow(swing, 1.3) * 0.28 - stanceLoad * 0.08;
    // Hock bends FORWARD (< 0) cleanly during swing, opens gently (> 0) at push-off!
    const hock = -Math.pow(swing, 1.25) * 0.44 + Math.pow(Math.max(0, -Math.cos(a - 0.6)), 2) * 0.14;
    // Fetlock flexes in swing, sinks under weight in stance
    const fetlock = Math.pow(swing, 1.4) * 0.30 - Math.pow(stanceLoad, 1.2) * 0.22;
    const coronet = -(hip + stifle + hock + fetlock) * (stanceLoad > 0.1 ? 0.55 : 0.2);

    rot[`hip${tag}`].x = hip;
    rot[`stifle${tag}`].x = stifle;
    rot[`hock${tag}`].x = hock;
    rot[`hindFetlock${tag}`].x = fetlock;
    rot[`hindCoronet${tag}`].x = coronet;
  }

  /**
   * Authentic 2-beat diagonal expressive Warmblood TROT:
   * Diagonal pairs move in unison: (Left Fore + Right Hind) at phase 0.0, (Right Fore + Left Hind) at phase 0.5!
   */
  _evalTrot(phase, t, rot, pos) {
    const pPairA = phase;
    const pPairB = (phase + 0.5) % 1.0;

    this._applyForelegTrot('L', pPairA, rot);
    this._applyHindlegTrot('R', pPairA, rot);
    this._applyForelegTrot('R', pPairB, rot);
    this._applyHindlegTrot('L', pPairB, rot);

    const w = phase * Math.PI * 2;
    // Crisp springy 2-beat suspension bounce!
    const bounce = Math.sin(w * 2 - 0.35);
    pos.root.y = bounce * 0.055 + 0.015;
    rot.root.x = Math.cos(w * 2) * 0.028;
    rot.root.z = Math.sin(w) * 0.032;

    rot.pelvis.y = Math.sin(w) * 0.05;
    rot.spineMid.x = -bounce * 0.025;
    rot.withers.y = -Math.sin(w) * 0.04;

    // Proud elevated arched dressage/Warmblood trot neck carriage!
    rot.neckBase.set(-0.08 + bounce * 0.04, 0, 0);
    rot.neckMid.set(-0.06 + bounce * 0.03, 0, 0);
    rot.neckUpper.set(0.06 - bounce * 0.02, 0, 0);
    rot.head.set(0.14 - bounce * 0.045, Math.sin(t * 0.6) * 0.03, 0);

    // Expressive carried & streaming tail!
    const tailSway = Math.sin(w) * 0.14;
    rot.tailBase.set(0.46 + bounce * 0.09, 0, tailSway);
    rot.tailMid.set(0.18 + bounce * 0.08, 0, tailSway * 1.1);
    rot.tailLower.set(0.10, 0, tailSway * 0.9);

    rot.earL.set(0.06 + bounce * 0.05, 0.04, 0);
    rot.earR.set(0.06 + bounce * 0.05, -0.04, 0);
  }

  _applyForelegTrot(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const stance = Math.max(0, -Math.sin(a));

    const shoulder = -Math.cos(a) * 0.44 - 0.05;
    const elbow = -Math.pow(swing, 1.1) * 0.28 + stance * 0.06;
    const knee = Math.pow(swing, 1.25) * 1.12; // Crisp athletic knee fold!
    const fetlock = Math.pow(swing, 1.2) * 0.46 - Math.pow(stance, 1.1) * 0.34;
    const coronet = -(shoulder + elbow + knee + fetlock) * (stance > 0.15 ? 0.55 : 0.15);

    rot[`shoulder${tag}`].x = shoulder;
    rot[`elbow${tag}`].x = elbow;
    rot[`knee${tag}`].x = knee;
    rot[`foreFetlock${tag}`].x = fetlock;
    rot[`foreCoronet${tag}`].x = coronet;
  }

  _applyHindlegTrot(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const stance = Math.max(0, -Math.sin(a));

    const hip = -Math.cos(a) * 0.40 - 0.02;
    const stifle = Math.pow(swing, 1.15) * 0.44 - stance * 0.12;
    const hock = -Math.pow(swing, 1.15) * 0.68 + Math.pow(Math.max(0, Math.cos(a + 0.55)), 2) * 0.24;
    const fetlock = Math.pow(swing, 1.2) * 0.42 - Math.pow(stance, 1.1) * 0.32;
    const coronet = -(hip + stifle + hock + fetlock) * (stance > 0.15 ? 0.50 : 0.15);

    rot[`hip${tag}`].x = hip;
    rot[`stifle${tag}`].x = stifle;
    rot[`hock${tag}`].x = hock;
    rot[`hindFetlock${tag}`].x = fetlock;
    rot[`hindCoronet${tag}`].x = coronet;
  }

  /**
   * Authentic asymmetric Right-Lead CANTER / GALLOP:
   * Sequence: Left Hind (0.00) -> Right Hind (0.14) -> Left Fore (0.36) -> Right Fore lead (0.50) -> Flying Suspension!
   */
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
    // Dramatic bounding suspension arc & powerful spine pitch/flexion!
    pos.root.y = Math.sin(w - 0.6) * 0.11 + 0.04;
    rot.root.x = Math.cos(w - 0.4) * 0.13;

    // Back coils tightly when hindlegs drive under, extends flat during aerial stretch!
    const coil = Math.sin(w + 0.5);
    rot.pelvis.x = coil * 0.14;
    rot.spineMid.x = coil * 0.09;
    rot.withers.x = -coil * 0.08;

    // Sweeping athletic neck counterbalance stretch (clean & smooth at throatlatch!)
    const neckStretch = Math.sin(w - 0.7);
    rot.neckBase.set(0.18 + neckStretch * 0.14, 0, 0);
    rot.neckMid.set(0.10 + neckStretch * 0.10, 0, 0);
    rot.neckUpper.set(0.04 + neckStretch * 0.05, 0, 0);
    rot.head.set(-0.12 - neckStretch * 0.12, 0, 0);

    // Dynamic wind-swept streaming tail (base bends cleanly at dock, mid & lower stream freely!)
    rot.tailBase.set(0.36 + Math.sin(w - 1.0) * 0.09, 0, Math.sin(w) * 0.08);
    rot.tailMid.set(0.38 + Math.sin(w - 1.5) * 0.14, 0, Math.sin(w - 0.5) * 0.12);
    rot.tailLower.set(0.30 + Math.sin(w - 2.0) * 0.16, 0, Math.sin(w - 1.0) * 0.14);

    // Ears pinned slightly back into aerodynamic gallop focus!
    rot.earL.set(-0.22 + Math.sin(w) * 0.06, -0.18, 0);
    rot.earR.set(-0.22 + Math.sin(w) * 0.06, 0.18, 0);
  }

  _applyForelegGallop(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const stance = Math.max(0, -Math.sin(a));

    const shoulder = -Math.cos(a) * 0.62 - 0.08;
    const elbow = -Math.pow(swing, 1.05) * 0.42 + stance * 0.10;
    const knee = Math.pow(swing, 1.15) * 1.52; // Deep dramatic gallop knee tuck!
    const fetlock = Math.pow(swing, 1.15) * 0.62 - Math.pow(stance, 1.1) * 0.42;
    const coronet = -(shoulder + elbow + knee + fetlock) * (stance > 0.15 ? 0.45 : 0.12);

    rot[`shoulder${tag}`].x = shoulder;
    rot[`elbow${tag}`].x = elbow;
    rot[`knee${tag}`].x = knee;
    rot[`foreFetlock${tag}`].x = fetlock;
    rot[`foreCoronet${tag}`].x = coronet;
  }

  _applyHindlegGallop(tag, ph, rot) {
    const a = ph * Math.PI * 2;
    const swing = Math.max(0, Math.sin(a));
    const stance = Math.max(0, -Math.sin(a));

    const hip = -Math.cos(a) * 0.50 - 0.06;
    const stifle = Math.pow(swing, 1.15) * 0.38 - stance * 0.14;
    const hock = -Math.pow(swing, 1.1) * 0.86 + Math.pow(Math.max(0, Math.cos(a + 0.5)), 2) * 0.30;
    const fetlock = Math.pow(swing, 1.15) * 0.55 - Math.pow(stance, 1.1) * 0.38;
    const coronet = -(hip + stifle + hock + fetlock) * (stance > 0.15 ? 0.45 : 0.12);

    rot[`hip${tag}`].x = hip;
    rot[`stifle${tag}`].x = stifle;
    rot[`hock${tag}`].x = hock;
    rot[`hindFetlock${tag}`].x = fetlock;
    rot[`hindCoronet${tag}`].x = coronet;
  }
}
