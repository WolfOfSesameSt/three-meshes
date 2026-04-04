/**
 * 001 — Toroidal Energy Flow
 *
 * Simulates energy flowing along toroidal magnetic field lines.
 * Particles trace poloidal + toroidal paths around a torus shape,
 * with a ghost shell, bloom glow, and central energy core.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import particleVert from "../shaders/torus-particle.vert?raw";
import particleFrag from "../shaders/torus-particle.frag?raw";
import shellVert from "../shaders/torus-shell.vert?raw";
import shellFrag from "../shaders/torus-shell.frag?raw";

// ─── Config ─────────────────────────────────────────────────────────
const PARTICLE_COUNT = 18000;
const FIELD_LINE_COUNT = 64;
const FIELD_LINE_SEGMENTS = 128;
const TORUS_R = 2.8; // major radius (center of tube to center of torus)
const TORUS_r = 1.1; // minor radius (tube radius)
const FLOW_SPEED = 0.4;
const POLOIDAL_RATIO = 3; // poloidal winds per toroidal revolution

// ─── Palette ────────────────────────────────────────────────────────
const COLORS = {
  bg: 0x050510,
  core: new THREE.Color(0.9, 0.95, 1.0), // hot white-blue
  mid: new THREE.Color(0.3, 0.5, 1.0), // electric blue
  edge: new THREE.Color(0.6, 0.2, 0.9), // violet
  shell: new THREE.Color(0.15, 0.3, 0.8),
  fieldLine: new THREE.Color(0.2, 0.4, 1.0),
  centerGlow: new THREE.Color(0.4, 0.6, 1.0),
};

// ─── Scene ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.bg);
scene.fog = new THREE.FogExp2(COLORS.bg, 0.04);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(5, 3.5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
controls.maxDistance = 15;
controls.minDistance = 3;

// ─── Post-processing (bloom) ────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6, // strength
  0.6, // radius
  0.15 // threshold
);
composer.addPass(bloomPass);

// ─── Helper: toroidal coordinates → cartesian ───────────────────────
// theta = toroidal angle (around the ring)
// phi = poloidal angle (around the tube cross-section)
function torusPoint(theta, phi, R = TORUS_R, r = TORUS_r) {
  const x = (R + r * Math.cos(phi)) * Math.cos(theta);
  const y = r * Math.sin(phi);
  const z = (R + r * Math.cos(phi)) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

// ─── Particle system ────────────────────────────────────────────────
const particleGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const intensities = new Float32Array(PARTICLE_COUNT);
const sizes = new Float32Array(PARTICLE_COUNT);

// Each particle stores its own phase offsets
const particleTheta = new Float32Array(PARTICLE_COUNT); // toroidal phase
const particlePhi = new Float32Array(PARTICLE_COUNT); // poloidal phase
const particleSpeed = new Float32Array(PARTICLE_COUNT); // speed variation
const particleRadiusOffset = new Float32Array(PARTICLE_COUNT); // depth in tube

for (let i = 0; i < PARTICLE_COUNT; i++) {
  particleTheta[i] = Math.random() * Math.PI * 2;
  particlePhi[i] = Math.random() * Math.PI * 2;
  particleSpeed[i] = 0.6 + Math.random() * 0.8;
  particleRadiusOffset[i] = 0.7 + Math.random() * 0.6; // 0.7–1.3 of tube radius
  sizes[i] = 2.0 + Math.random() * 4.0;
  intensities[i] = 0.3 + Math.random() * 0.7;
}

particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
particleGeometry.setAttribute("aIntensity", new THREE.BufferAttribute(intensities, 1));
particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

const particleMaterial = new THREE.ShaderMaterial({
  vertexShader: particleVert,
  fragmentShader: particleFrag,
  uniforms: {
    uColorCore: { value: COLORS.core },
    uColorMid: { value: COLORS.mid },
    uColorEdge: { value: COLORS.edge },
  },
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// ─── Ghost shell (transparent torus) ────────────────────────────────
const shellGeometry = new THREE.TorusGeometry(TORUS_R, TORUS_r, 64, 128);
const shellMaterial = new THREE.ShaderMaterial({
  vertexShader: shellVert,
  fragmentShader: shellFrag,
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: COLORS.shell },
    uOpacity: { value: 0.25 },
  },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const shell = new THREE.Mesh(shellGeometry, shellMaterial);
scene.add(shell);

// ─── Field lines (helical curves on torus surface) ──────────────────
const fieldLineGroup = new THREE.Group();
scene.add(fieldLineGroup);

for (let i = 0; i < FIELD_LINE_COUNT; i++) {
  const phaseOffset = (i / FIELD_LINE_COUNT) * Math.PI * 2;
  const linePoints = [];

  for (let j = 0; j <= FIELD_LINE_SEGMENTS; j++) {
    const t = j / FIELD_LINE_SEGMENTS;
    const theta = t * Math.PI * 2;
    const phi = theta * POLOIDAL_RATIO + phaseOffset;
    linePoints.push(torusPoint(theta, phi));
  }

  const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: COLORS.fieldLine,
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  fieldLineGroup.add(new THREE.Line(lineGeometry, lineMaterial));
}

// ─── Central core glow (sprite at torus center) ─────────────────────
function createGlowTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, "rgba(160, 200, 255, 0.6)");
  gradient.addColorStop(0.2, "rgba(100, 150, 255, 0.3)");
  gradient.addColorStop(0.5, "rgba(60, 80, 200, 0.1)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

const coreSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createGlowTexture(),
    color: COLORS.centerGlow,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
);
coreSprite.scale.set(3, 3, 1);
scene.add(coreSprite);

// ─── Ambient light (subtle fill for shell) ──────────────────────────
scene.add(new THREE.AmbientLight(0x223355, 0.3));

// ─── Ring of point lights inside the torus ──────────────────────────
const LIGHT_COUNT = 6;
const lightGroup = new THREE.Group();
for (let i = 0; i < LIGHT_COUNT; i++) {
  const angle = (i / LIGHT_COUNT) * Math.PI * 2;
  const light = new THREE.PointLight(0x4466ff, 2, 5);
  light.position.set(
    TORUS_R * Math.cos(angle),
    0,
    TORUS_R * Math.sin(angle)
  );
  lightGroup.add(light);
}
scene.add(lightGroup);

// ─── Resize ─────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Animation loop ─────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;

  // Update particle positions along toroidal field lines
  const posArray = particleGeometry.attributes.position.array;
  const intArray = particleGeometry.attributes.aIntensity.array;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Advance along the field line
    particleTheta[i] += FLOW_SPEED * particleSpeed[i] * delta;
    if (particleTheta[i] > Math.PI * 2) particleTheta[i] -= Math.PI * 2;

    const theta = particleTheta[i];
    const phi = theta * POLOIDAL_RATIO + particlePhi[i];
    const rOffset = TORUS_r * particleRadiusOffset[i];

    const x = (TORUS_R + rOffset * Math.cos(phi)) * Math.cos(theta);
    const y = rOffset * Math.sin(phi);
    const z = (TORUS_R + rOffset * Math.cos(phi)) * Math.sin(theta);

    posArray[i * 3] = x;
    posArray[i * 3 + 1] = y;
    posArray[i * 3 + 2] = z;

    // Pulse intensity based on position (brighter at top/bottom of poloidal loop)
    intArray[i] = 0.3 + 0.7 * Math.abs(Math.sin(phi));
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.aIntensity.needsUpdate = true;

  // Animate shell energy veins
  shellMaterial.uniforms.uTime.value = elapsed;

  // Gently rotate field lines for visual depth
  fieldLineGroup.rotation.y = elapsed * 0.02;

  // Pulse the central core
  const corePulse = 1.0 + 0.15 * Math.sin(elapsed * 1.5);
  coreSprite.scale.set(3 * corePulse, 3 * corePulse, 1);
  coreSprite.material.opacity = 0.5 + 0.2 * Math.sin(elapsed * 2.0);

  // Orbit the internal lights slowly
  lightGroup.rotation.y = elapsed * 0.3;

  // Oscillate bloom for breathing effect
  bloomPass.strength = 1.4 + 0.3 * Math.sin(elapsed * 0.8);

  controls.update();
  composer.render();
}

animate();
