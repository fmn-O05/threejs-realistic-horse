import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRealisticHorse } from './horse/horseBuilder.js';
import { HorseAnimator } from './horse/gaitAnimation.js';
import { COAT_PRESETS } from './horse/materials.js';
import { createSceneEnvironment, LIGHTING_PRESETS } from './environment.js';

export const CAMERA_PRESETS = {
  // Default 3/4 Hero frames the sunlit right-front profile showcasing the cascading mane, noble head & sculpted muscles!
  hero:    { label: '3/4 Hero',     pos: [-3.35, 1.54, 2.85], target: [0.0, 1.15, 0.14] },
  side:    { label: 'Side Profile', pos: [-4.25, 1.20, 0.14], target: [0.0, 1.10, 0.14] },
  sideL:   { label: 'Left Side',    pos: [ 4.25, 1.20, 0.14], target: [0.0, 1.10, 0.14] },
  head:    { label: 'Head Detail',  pos: [-1.02, 1.98, 2.02], target: [0.0, 1.88, 1.28] },
  front:   { label: 'Front',        pos: [-0.16, 1.30, 4.65], target: [0.0, 1.12, 0.20] },
  rear:    { label: 'Rear 3/4',     pos: [-2.95, 1.44, -2.95], target: [0.0, 1.10, -0.05] },
  top:     { label: 'Overhead',     pos: [-2.15, 3.85, 1.55], target: [0.0, 1.12, 0.15] },
};

function init() {
  const container = document.getElementById('viewport');
  const canvas = document.getElementById('horse-canvas');

  // 1. Renderer with physically accurate ACES Filmic tone mapping & soft shadows
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 2. Scene & Camera
  const scene = new THREE.Scene();
  const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
  const camera = new THREE.PerspectiveCamera(36, aspect, 0.08, 120);
  camera.position.set(...CAMERA_PRESETS.hero.pos);

  // 3. Smooth Orbit Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 0.65;
  controls.maxDistance = 9.5;
  controls.maxPolarAngle = Math.PI * 0.492; // Never clip below ground plane
  controls.target.set(...CAMERA_PRESETS.hero.target);
  controls.update();

  // Smooth camera preset transition state
  let camTransition = null;
  function goToCamera(presetKey, immediate = false) {
    const p = CAMERA_PRESETS[presetKey] || CAMERA_PRESETS.hero;
    if (immediate) {
      camTransition = null;
      camera.position.set(...p.pos);
      controls.target.set(...p.target);
      controls.update();
      return;
    }
    camTransition = {
      startPos: camera.position.clone(),
      endPos: new THREE.Vector3(...p.pos),
      startTarget: controls.target.clone(),
      endTarget: new THREE.Vector3(...p.target),
      progress: 0,
    };
  }

  // Cancel transition if user grabs OrbitControls manually
  controls.addEventListener('start', () => {
    camTransition = null;
  });

  // 4. Environment & Realistic 3D Horse
  const environment = createSceneEnvironment(scene, renderer, 'goldenHour');
  const horse = createRealisticHorse('bay');
  scene.add(horse.group);

  const animator = new HorseAnimator(horse);
  animator.setMode('idle');

  // Wire up interactive HUD controls
  setupUI({
    horse,
    animator,
    environment,
    goToCamera,
  });

  // Resize handler
  function onResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // Render Loop
  let loopRunning = true;
  let rafId = 0;

  function renderFrame(dt = 0) {
    if (camTransition) {
      camTransition.progress = Math.min(1, camTransition.progress + dt * 2.2);
      const ease = 1 - Math.pow(1 - camTransition.progress, 3);
      camera.position.lerpVectors(camTransition.startPos, camTransition.endPos, ease);
      controls.target.lerpVectors(camTransition.startTarget, camTransition.endTarget, ease);
      if (camTransition.progress >= 1) camTransition = null;
    }

    animator.update(dt);
    if (!animator.paused && dt > 0) {
      environment.updateGroundMotion(dt, animator.mode, animator.speed);
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // Expose deterministic inspection API for testing & external scripting
  window.__horseApp = {
    scene,
    camera,
    controls,
    renderer,
    horse,
    animator,
    environment,
    setRenderLoop(enabled) {
      loopRunning = Boolean(enabled);
      if (!loopRunning && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (loopRunning && !rafId) {
        clock.getDelta();
        rafId = requestAnimationFrame(animate);
      }
    },
    renderOnce() {
      controls.update();
      renderer.render(scene, camera);
    },
    setCamera(presetKey) {
      goToCamera(presetKey, true);
      renderer.render(scene, camera);
    },
    setCameraCustom(pos, target) {
      camTransition = null;
      camera.position.set(...pos);
      controls.target.set(...target);
      controls.update();
      renderer.render(scene, camera);
    },
    setCoat(key) {
      horse.setCoatPreset(key);
      syncActiveButtons('[data-coat]', key);
      renderer.render(scene, camera);
    },
    setLighting(key) {
      environment.setLightingPreset(key);
      syncActiveButtons('[data-lighting]', key);
      renderer.render(scene, camera);
    },
    setPose(mode, phase = 0, time = 0) {
      animator.paused = true;
      animator.setDeterministicState(mode, phase, time);
      syncActiveButtons('[data-gait]', mode);
      renderer.render(scene, camera);
    },
    setHudVisible(visible) {
      document.body.classList.toggle('hud-hidden', !visible);
    },
    stats: horse.getStats(),
  };

  const clock = new THREE.Clock();
  function animate() {
    if (!loopRunning) return;
    rafId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    renderFrame(dt);
  }
  animate();
}

function syncActiveButtons(selector, activeValue) {
  document.querySelectorAll(selector).forEach((btn) => {
    const val = btn.dataset.gait || btn.dataset.coat || btn.dataset.camera || btn.dataset.lighting;
    const active = val === activeValue;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function setupUI({ horse, animator, environment, goToCamera }) {
  // Gait Buttons
  document.querySelectorAll('[data-gait]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.gait;
      animator.paused = false;
      animator.setMode(mode);
      syncActiveButtons('[data-gait]', mode);
      const pauseBtn = document.getElementById('btn-pause');
      if (pauseBtn) {
        pauseBtn.textContent = 'Pause';
        pauseBtn.setAttribute('aria-pressed', 'false');
      }
    });
  });

  // Coat Buttons
  document.querySelectorAll('[data-coat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const coat = btn.dataset.coat;
      if (!COAT_PRESETS[coat]) return;
      horse.setCoatPreset(coat);
      syncActiveButtons('[data-coat]', coat);
    });
  });

  // Camera Preset Buttons
  document.querySelectorAll('[data-camera]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cam = btn.dataset.camera;
      goToCamera(cam, false);
      syncActiveButtons('[data-camera]', cam);
    });
  });

  // Lighting Buttons
  document.querySelectorAll('[data-lighting]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.lighting;
      if (!LIGHTING_PRESETS[key]) return;
      environment.setLightingPreset(key);
      syncActiveButtons('[data-lighting]', key);
    });
  });

  // Playback Speed Slider
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  if (speedSlider && speedValue) {
    speedSlider.addEventListener('input', () => {
      const v = Number(speedSlider.value);
      animator.speed = v;
      speedValue.textContent = `${v.toFixed(2)}×`;
    });
  }

  // Pause/Play Button
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      animator.paused = !animator.paused;
      pauseBtn.textContent = animator.paused ? 'Resume' : 'Pause';
      pauseBtn.setAttribute('aria-pressed', String(animator.paused));
    });
  }

  // Panel Collapse Toggle
  const toggleBtn = document.getElementById('btn-toggle-panel');
  const panel = document.getElementById('control-panel');
  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('collapsed');
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
      toggleBtn.textContent = collapsed ? 'Controls' : 'Hide';
    });
  }

  // Stats Footer Display
  const statsEl = document.getElementById('mesh-stats');
  if (statsEl) {
    const s = horse.getStats();
    statsEl.textContent = `${s.triangles.toLocaleString()} tris · ${s.bones} bones`;
  }

  // Keyboard shortcuts: 1-5 gaits, Space pause, R reset camera
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (pauseBtn) pauseBtn.click();
    } else if (e.key === '1') {
      document.querySelector('[data-gait="idle"]')?.click();
    } else if (e.key === '2') {
      document.querySelector('[data-gait="walk"]')?.click();
    } else if (e.key === '3') {
      document.querySelector('[data-gait="trot"]')?.click();
    } else if (e.key === '4') {
      document.querySelector('[data-gait="gallop"]')?.click();
    } else if (e.key === '5') {
      document.querySelector('[data-gait="stance"]')?.click();
    } else if (e.key.toLowerCase() === 'r') {
      goToCamera('hero', false);
      syncActiveButtons('[data-camera]', 'hero');
    }
  });
}

init();
